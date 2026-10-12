/**
 * Design > Themes and Variants. Visio applies a theme per page: the PageSheet's ColorSchemeIndex,
 * EffectSchemeIndex, ConnectorSchemeIndex, FontSchemeIndex and ThemeIndex select a theme part of
 * the document by its scheme IDs, and VariationColorIndex / VariationStyleIndex pick one of its four
 * variants (MS-VSDX 2.4.4.58 and the theme extensions of 2.2.7.4). Shapes whose paint is THEMEVAL()
 * recolour through those selectors when the drawing is read again.
 * https://learn.microsoft.com/en-us/openspecs/sharepoint_protocols/ms-vsdx/9753d977-a1de-49e8-888c-cf532efe7982
 */
import { NS, parseXml } from '../xml/index';
import { RELATIONSHIP_TYPES } from '../opc/relationship-types';
import { relationshipsPartFor, resolvePartPath } from '../opc/relationships';
import type { VisioPackage } from './package';
import { decodePath, fail, type VisioPackageLimits } from './package-common';
import { related, visioXml } from './parts';
import { attribute, child, children } from './sheet';
import { setCell } from './edit-geometry-cells';
import { openEditablePackage, writeEditedPackage } from './edit-package';
import { serializeEditedXml } from './edit-text';
import { loadVisioThemes, type VisioTheme } from './theme';
import { visioBuiltInTheme, visioThemeVariantColors } from './theme-builtins';
import { visioThemeXml } from './theme-write';
import { refreshThemeColorCaches } from './edit-page-theme-refresh';
import { VISIO_UNTHEMED_COLORS, type VisioThemeColorValues } from './theme-color-ref';
import { drawingColor } from './theme-color';
import { recolorQuickStyledShapes } from './edit-page-theme-recolor';
import type { VisioPageThemeEdit } from './edit-page-theme-commands';
import type { EditVsdxResult } from './edit';

const THEME_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.theme+xml';
const SCHEME_CELLS = [
	'ThemeIndex',
	'ColorSchemeIndex',
	'EffectSchemeIndex',
	'ConnectorSchemeIndex',
	'FontSchemeIndex',
];
const copy = (root: Element) => (root.ownerDocument!.cloneNode(true) as Document).documentElement;
const cellValue = (sheet: Element | undefined, name: string) => {
	const value = attribute(
		children(sheet, 'Cell').find((cell) => attribute(cell, 'N') === name),
		'V',
	);
	return value !== undefined && /^\d{1,6}$/.test(value) ? Number(value) : undefined;
};

/** The theme the page selects by its saved ColorSchemeIndex, when exactly one part matches. */
export function pageSelectedTheme(
	themes: readonly VisioTheme[],
	sheet: Element | undefined,
): VisioTheme | undefined {
	const id = cellValue(sheet, 'ColorSchemeIndex');
	if (id === undefined || id === 0 || id >= 65534) return undefined;
	const matches = themes.filter((theme) => theme.colorId === id);
	return matches.length === 1 ? matches[0] : undefined;
}

/** Write the theme part, page selectors and recoloured shapes as one atomic package edit. */
export async function editVsdxPageTheme(
	pkg: VisioPackage,
	parts: Map<string, Uint8Array>,
	pages: ReadonlyMap<string, string>,
	edit: VisioPageThemeEdit,
	limits: VisioPackageLimits,
	maxOutput: number,
	deadline: number,
	check: () => void,
): Promise<EditVsdxResult> {
	const contentsPath = pages.get(edit.pageId);
	if (!contentsPath) fail('EDIT_TARGET_NOT_FOUND', 'Page does not exist.');
	const documentPath = (await related(pkg, '', 'document'))!;
	const pagesPath = (await related(pkg, documentPath, 'pages'))!;
	const pagesRoot = copy(await visioXml(pkg, pagesPath, 'Pages'));
	const page = children(pagesRoot, 'Page').find((node) => attribute(node, 'ID') === edit.pageId);
	if (!page) fail('EDIT_TARGET_NOT_FOUND', 'Page does not exist.');
	let sheet = child(page, 'PageSheet');
	if (!sheet) {
		sheet = pagesRoot.ownerDocument!.createElementNS(pagesRoot.namespaceURI, 'PageSheet');
		page.insertBefore(sheet, page.firstChild);
	}
	const themes = await loadVisioThemes(pkg, documentPath, () => {});
	const dirty = new Map<string, Element>([[pagesPath, pagesRoot]]);
	const created = new Map<string, Uint8Array>();
	const contents = copy(await visioXml(pkg, contentsPath!, 'PageContents'));
	let recolored = false;
	if (edit.theme === 'none') {
		for (const name of [...SCHEME_CELLS, 'VariationColorIndex', 'VariationStyleIndex'])
			setCell(sheet, name, 0);
		// With a verified No Style root Visio's root formats apply (MS-VSDX 2.4.4.58); otherwise the
		// shapes styled here get their theme-less Quick Style colours back.
		const document = await visioXml(pkg, documentPath, 'VisioDocument');
		const root = children(child(document, 'StyleSheets'), 'StyleSheet').find(
			(style) => attribute(style, 'ID') === '0',
		);
		if (attribute(root, 'NameU') !== 'No Style')
			recolored = recolorQuickStyledShapes(contents, 'fallback', check);
		// Without a theme the theme-colour formulas resolve to Visio's own colours.
		recolored = refreshThemeColorCaches(contents, VISIO_UNTHEMED_COLORS, check) || recolored;
	} else if (edit.theme) {
		const source = visioBuiltInTheme(edit.theme);
		const matches = themes.filter((theme) =>
			[theme.colorId, theme.effectId, theme.connectorId].includes(source.schemeId),
		);
		if (matches.length > 1 || (matches[0] && matches[0].name !== source.name))
			fail(
				'EDIT_THEME_CONFLICT',
				'Another theme part already uses the scheme IDs of this built-in theme.',
			);
		if (!matches.length) {
			const relsPart = relationshipsPartFor(documentPath);
			const rels = parts.has(relsPart)
				? copy(await pkg.readXml(relsPart, 'Relationships'))
				: parseXml(`<Relationships xmlns="${NS.rels}"/>`).documentElement;
			const types = copy(await pkg.readXml('[Content_Types].xml', 'Types'));
			const taken = new Set([...parts.keys()].map((name) => decodePath(name).toLowerCase()));
			const ids = new Set(
				Array.from(rels.getElementsByTagNameNS(rels.namespaceURI, 'Relationship')).map(
					(node) => node.getAttribute('Id') ?? '',
				),
			);
			let index = 1;
			let target = '';
			let path = '';
			do {
				check();
				target = `theme/theme${index++}.xml`;
				path = resolvePartPath(documentPath, target);
			} while (taken.has(path.toLowerCase()));
			index = 1;
			while (ids.has(`rId${index}`)) index++;
			const relationship = rels.ownerDocument!.createElementNS(rels.namespaceURI, 'Relationship');
			relationship.setAttribute('Id', `rId${index}`);
			relationship.setAttribute('Type', RELATIONSHIP_TYPES.theme);
			relationship.setAttribute('Target', target);
			rels.appendChild(relationship);
			const override = types.ownerDocument!.createElementNS(types.namespaceURI, 'Override');
			override.setAttribute('PartName', `/${path}`);
			override.setAttribute('ContentType', THEME_CONTENT_TYPE);
			types.appendChild(override);
			dirty.set(relsPart, rels);
			dirty.set('[Content_Types].xml', types);
			created.set(path, new TextEncoder().encode(visioThemeXml(source)));
		}
		for (const name of SCHEME_CELLS) setCell(sheet, name, source.schemeId);
		for (const name of ['VariationColorIndex', 'VariationStyleIndex'])
			setCell(sheet, name, edit.variant ?? 0);
		recolored = recolorQuickStyledShapes(contents, 'themed', check);
		// dk1, lt1, dk2, lt2, accent1-6: the theme-colour formulas follow the new theme.
		const hex = (index: number) => `#${source.colors[index]!.toLowerCase()}`;
		const variant = visioThemeVariantColors(source, edit.variant ?? 0);
		const colors: VisioThemeColorValues = { dark: hex(0), light: hex(1) };
		for (let index = 1; index <= 6; index++) colors[`accent${index}` as 'accent1'] = hex(index + 3);
		for (let index = 1; index <= 7; index++)
			colors[`variant${index}` as 'variant1'] = `#${variant[index - 1]!.toLowerCase()}`;
		recolored = refreshThemeColorCaches(contents, colors, check) || recolored;
	} else {
		const current = pageSelectedTheme(themes, sheet);
		if (!current || current.variants.length <= edit.variant!)
			fail('UNSUPPORTED_THEME_EDIT', 'The page uses no theme with this variant.');
		for (const name of ['VariationColorIndex', 'VariationStyleIndex'])
			setCell(sheet, name, edit.variant!);
		// Only the variant colours change with the variant.
		const colors: VisioThemeColorValues = {};
		for (const [key, value] of current.variants[edit.variant!] ?? []) {
			const color = drawingColor(value, current.colors);
			if (color) colors[`variant${key}` as 'variant1'] = color;
		}
		for (const [slot, key] of [
			['light', 'lt1'],
			['dark', 'dk1'],
			...[1, 2, 3, 4, 5, 6].map((index) => [`accent${index}`, `accent${index}`]),
		] as [keyof VisioThemeColorValues, string][]) {
			const color = drawingColor(current.colors.get(key), current.colors);
			if (color) colors[slot] = color;
		}
		recolored = refreshThemeColorCaches(contents, colors, check);
	}
	if (recolored) dirty.set(contentsPath!, contents);
	if (new Set([...parts.keys(), ...dirty.keys(), ...created.keys()]).size > limits.maxEntries)
		fail('LIMIT_ENTRIES', 'The theme exceeds the package entry limit.');
	let total = [...parts.values()].reduce((sum, bytes) => sum + bytes.length, 0);
	let nodes = 0;
	for (const [name, xml] of dirty) {
		const serialized = serializeEditedXml(xml, limits, check);
		nodes += serialized.nodes;
		if (nodes > limits.maxTotalXmlNodes)
			fail('LIMIT_XML_TOTAL', 'Edited XML node total exceeds limit.');
		total += serialized.bytes.length - (parts.get(name)?.length ?? 0);
		parts.set(name, serialized.bytes);
	}
	for (const [name, bytes] of created) {
		total += bytes.length;
		parts.set(name, bytes);
	}
	if (total > limits.maxTotalBytes) fail('LIMIT_TOTAL', 'Edited package total exceeds limit.');
	const bytes = await writeEditedPackage(parts, maxOutput, deadline, check);
	const verified = await openEditablePackage(
		bytes,
		{ ...limits, maxInputBytes: maxOutput, maxRuntimeMs: Math.max(1, deadline - Date.now()) },
		check,
	);
	await loadVisioThemes(verified.pkg, documentPath, () => {});
	await visioXml(verified.pkg, contentsPath!, 'PageContents');
	check();
	return {
		bytes,
		changedParts: [...dirty.keys(), ...created.keys()],
		diagnostics: [
			{
				code: 'edit-page-theme-experimental',
				message:
					'The page theme selectors were changed and a built-in theme part was written when needed. Microsoft Visio reopen fidelity of the built-in themes is unverified.',
			},
		],
	};
}
