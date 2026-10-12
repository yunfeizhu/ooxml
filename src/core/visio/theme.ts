/**
 * Original bounded implementation from MS-VSDX 2.2.7.4.1 and 2.2.7.4.5:
 * https://learn.microsoft.com/en-us/openspecs/sharepoint_protocols/ms-vsdx/cd5bb66b-7f2f-49b5-a630-9ae976bbdb26
 * https://learn.microsoft.com/en-us/openspecs/sharepoint_protocols/ms-vsdx/79aed9f8-5d10-4038-9106-7d1927fa0575
 * Only color-bearing quick-style properties are represented here.
 */
import { parseTheme, type DrawingColor } from '../drawingml/index';
import type { VisioPackage } from './package';
import type { Report } from './sheet';
import {
	DRAWING_NS,
	extension,
	integer,
	parsedColorChoice,
	themeChild,
	themeChildren,
	THEME_NS,
} from './theme-color';

export interface VisioTheme {
	/** `a:theme/@name`, when present. */
	name?: string;
	colorId: number | undefined;
	effectId: number | undefined;
	connectorId: number | undefined;
	/** Scheme slots (`dk1`, `lt1`, `accent1`-`accent6`) and the Visio `bkgnd` extension colour. */
	colors: Map<string, DrawingColor>;
	/** Visio variation colours `varColor1`-`varColor7`, keyed `1`-`7`. */
	variants: Map<string, DrawingColor>[];
	variationStyles: Element[][];
	fills: Element[];
	lines: Element[];
	fonts: Element[];
	effects: Element[];
	connectorFills: Element[];
	connectorLines: Element[];
	connectorFonts: Element[];
	connectorEffects: Element[];
}
const VISIO_SCHEME_SLOTS = [
	'dk1',
	'lt1',
	'accent1',
	'accent2',
	'accent3',
	'accent4',
	'accent5',
	'accent6',
] as const;
const componentId = (node: Element | undefined) =>
	integer(themeChild(node, 'schemeID', THEME_NS)?.getAttribute('schemeEnum'));
/** Read only bounded, internal DrawingML theme parts using the existing package limits. */
export async function loadVisioThemes(
	pkg: VisioPackage,
	source: string,
	report: Report,
): Promise<VisioTheme[]> {
	const result: VisioTheme[] = [];
	for (const rel of (await pkg.relationships(source)).values()) {
		if (
			rel.type !== 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme' ||
			rel.mode === 'External'
		)
			continue;
		const root = await pkg.readXml(rel.target, 'theme');
		if (root.namespaceURI !== DRAWING_NS) {
			report('unsupported-theme', 'A theme uses an unsupported XML namespace.', {
				part: rel.target,
			});
			continue;
		}
		const base = themeChild(root, 'themeElements');
		const palette = themeChild(base, 'clrScheme');
		// The shared reader parses the scheme; Visio keeps only slots holding exactly one `a:` colour.
		const scheme = parseTheme(root).colorScheme.colors;
		const colors = new Map<string, DrawingColor>();
		for (const name of VISIO_SCHEME_SLOTS) {
			const color = scheme[name];
			if (color && parsedColorChoice(themeChild(palette, name))) colors.set(name, color);
		}
		const background = parsedColorChoice(extension(palette, 'bkgnd'));
		if (background) colors.set('bkgnd', background);
		const variants = themeChildren(
			extension(palette, 'variationClrSchemeLst'),
			'variationClrScheme',
			THEME_NS,
		)
			.slice(0, 4)
			.map((variant) => {
				const entries = new Map<string, DrawingColor>();
				for (let index = 1; index <= 7; index++) {
					const choice = parsedColorChoice(themeChild(variant, `varColor${index}`, THEME_NS));
					if (choice) entries.set(String(index), choice);
				}
				return entries;
			});
		const format = themeChild(base, 'fmtScheme');
		const connector = extension(base, 'fmtConnectorScheme');
		const fonts = extension(base, 'fontStylesGroup');
		const name = root.getAttribute('name');
		result.push({
			...(name ? { name: name.slice(0, 256) } : {}),
			colorId: integer(extension(palette, 'schemeID')?.getAttribute('schemeEnum')),
			effectId: componentId(extension(base, 'fmtSchemeEx')),
			connectorId: componentId(extension(base, 'fmtConnectorSchemeEx')),
			colors,
			variants,
			variationStyles: themeChildren(
				extension(base, 'variationStyleSchemeLst'),
				'variationStyleScheme',
				THEME_NS,
			)
				.slice(0, 4)
				.map((variant) => themeChildren(variant, 'varStyle', THEME_NS).slice(0, 4)),
			fills: formatList(format, 'fillStyleLst'),
			effects: themeChildren(themeChild(format, 'effectStyleLst'), 'effectStyle').slice(0, 6),
			lines: themeChildren(themeChild(format, 'lnStyleLst'), 'ln').slice(0, 6),
			fonts: themeChildren(themeChild(fonts, 'fontStyles', THEME_NS), 'fontProps', THEME_NS).slice(
				0,
				6,
			),
			connectorFills: formatList(connector, 'fillStyleLst'),
			connectorEffects: themeChildren(themeChild(connector, 'effectStyleLst'), 'effectStyle').slice(
				0,
				6,
			),
			connectorLines: themeChildren(themeChild(connector, 'lnStyleLst'), 'ln').slice(0, 6),
			connectorFonts: themeChildren(
				themeChild(fonts, 'connectorFontStyles', THEME_NS),
				'fontProps',
				THEME_NS,
			).slice(0, 6),
		});
	}
	return result;
}
function formatList(parent: Element | undefined, name: string): Element[] {
	const list = themeChild(parent, name);
	return list
		? Array.from(list.childNodes)
				.filter(
					(node): node is Element =>
						node.nodeType === 1 && (node as Element).namespaceURI === DRAWING_NS,
				)
				.slice(0, 6)
		: [];
}
