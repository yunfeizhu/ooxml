import { attribute, child, children } from './sheet';
import { editableVisioPageRoots } from './edit-page-roots';
import { uniqueFormattingCells } from './edit-style-admission';
import { executableCellFormula, inertDoubleClickFormula } from './cell-formula';
import { analyzeVisioFormula, evaluateVisioFormula, visioFormulaCachedValue } from './formula';
import { mapVisioFormulaSyntax, unquotedVisioFormula } from './formula-source';
import { setCell } from './edit-geometry-cells';
import { fail } from './package-common';
import type { VisioPackage } from './package';
import type { VisioPageSizeEdit } from './edit-commands';

/** A proven explicit numeric page setting: no inheritance, error or dependent formula. */
export function pageSettingConstant(node: Element | undefined, length: boolean): number {
	if (!node || node.hasAttribute('E') || attribute(node, 'F') === 'Inh')
		fail('EDIT_UNSUPPORTED_PAGE_SIZE', 'A valid explicit page size or mode cache is required.');
	const value = visioFormulaCachedValue(attribute(node, 'V') ?? '', attribute(node, 'U'));
	if (
		!Number.isFinite(value.value) ||
		!['scalar', ...(length ? ['length'] : [])].includes(value.unit)
	)
		fail('EDIT_UNSUPPORTED_PAGE_SIZE', 'Page size or mode has incompatible units.');
	const formula = executableCellFormula(attribute(node, 'F'));
	if (formula) {
		const analysis = analyzeVisioFormula(formula);
		if (
			analysis.guarded ||
			analysis.dynamic ||
			analysis.references.length ||
			analysis.unsupportedFunctions.length
		)
			fail('EDIT_PROTECTED_CELL', 'Protected or dependent page settings cannot be overwritten.');
		const result = evaluateVisioFormula(formula, () =>
			fail('EDIT_PROTECTED_CELL', 'Unsupported page dependency.'),
		);
		if (
			result.value !== value.value ||
			!['scalar', ...(length ? ['length'] : [])].includes(result.unit)
		)
			fail('EDIT_PROTECTED_CELL', 'Page setting formula cache cannot be proven.');
	}
	return value.value;
}
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Initial bounded policy refuses affected local/inherited/cross-page caches instead of guessing. */
function assertDependencies(
	roots: ReadonlyMap<string, Element>,
	pagesPart: string,
	pages: Element,
	pagePaths: ReadonlyMap<string, string>,
	pageId: string,
	changed: readonly string[],
	check: () => void,
): void {
	const page = children(pages, 'Page').find((node) => attribute(node, 'ID') === pageId)!;
	const targetNames = new Set(
		['Name', 'NameU'].map((name) => attribute(page, name)?.toLowerCase()),
	);
	const otherNames = children(pages, 'Page')
		.filter((node) => node !== page)
		.flatMap((node) => ['Name', 'NameU'].map((name) => attribute(node, name)))
		.filter((name): name is string => !!name && !targetNames.has(name.toLowerCase()));
	const cells = changed.map(escape).join('|');
	const reference = new RegExp(`(?:^|[^a-z0-9_.])(?:${cells})(?:$|[^a-z0-9_.])`, 'i');
	const other = otherNames.length
		? new RegExp(
				`Pages\\[(?:${otherNames.map(escape).join('|')})\\]!(?:ThePage!)?(?:${cells})(?![a-z0-9_.])`,
				'gi',
			)
		: undefined;
	const paths = new Map([...pagePaths].map(([id, path]) => [path, id]));
	for (const [path, root] of roots)
		for (const node of [root, ...Array.from(root.getElementsByTagName('*'))]) {
			check();
			const formula = executableCellFormula(attribute(node, 'F'));
			if (!formula) continue;
			let code = unquotedVisioFormula(formula);
			const name = attribute(node, 'N') ?? '';
			if (inertDoubleClickFormula(name, formula)) continue;
			// These exact native connector trigger/routing formulas retained all caches in the
			// owned fixed-page corpus. Broader routing functions are not authorized here.
			const owner = node.parentNode as Element | null,
				container = owner?.parentNode as Element | null;
			const ownerId = attribute(owner ?? undefined, 'ID');
			const connected =
				ownerId &&
				/^[1-9]\d{0,9}$/.test(ownerId) &&
				owner?.localName === 'Shape' &&
				owner.namespaceURI === root.namespaceURI &&
				(!attribute(owner, 'Type') || attribute(owner, 'Type') === 'Shape') &&
				!owner.hasAttribute('Master') &&
				!owner.hasAttribute('MasterShape') &&
				!children(owner, 'Shapes').length &&
				['BeginX', 'BeginY', 'EndX', 'EndY'].every(
					(name) =>
						children(owner, 'Cell').filter((cell) => attribute(cell, 'N') === name).length === 1,
				) &&
				container?.localName === 'Shapes' &&
				container.parentNode === root &&
				children(root, 'Connects').some((connections) =>
					children(connections, 'Connect').some(
						(connection) => attribute(connection, 'FromSheet') === ownerId,
					),
				);
			const nativeGlue =
				paths.has(path) &&
				connected &&
				node.localName === 'Cell' &&
				node.namespaceURI === root.namespaceURI &&
				((/^(BeginX|BeginY|EndX|EndY)$/.test(name) &&
					/^\s*_WALKGLUE\((?:BegTrigger,EndTrigger|EndTrigger,BegTrigger),WalkPreference\)\s*$/i.test(
						code,
					)) ||
					(/^(BegTrigger|EndTrigger)$/.test(name) &&
						/^\s*_XFTRIGGER\(Sheet\.[1-9]\d*!EventXFMod\)\s*$/i.test(code)));
			let dynamic = false;
			if (!nativeGlue) {
				try {
					dynamic = analyzeVisioFormula(
						mapVisioFormulaSyntax(formula, (part) =>
							(other ? part.replace(other, '0') : part)
								.replace(/Pages\[[^\]]+\]!/gi, '')
								.replace(/ThePage!/gi, ''),
						),
					).dynamic;
				} catch {
					dynamic = true;
				}
			}
			if (dynamic)
				fail(
					'EDIT_UNSUPPORTED_PAGE_SIZE_DEPENDENCY',
					'Dynamic or unknown page-size dependencies cannot be safely refreshed.',
				);
			let local = paths.get(path);
			if (path === pagesPart) {
				let ancestor: Node | null = node;
				while (ancestor && (ancestor as Element).localName !== 'Page')
					ancestor = ancestor.parentNode;
				local = ancestor ? attribute(ancestor as Element, 'ID') : undefined;
			}
			if (other) code = code.replace(other, '0');
			if (!reference.test(code)) continue;
			// Other pages' own page cells remain independent. Explicit target references do not.
			if (local && local !== pageId && !/\bPages\[/i.test(code)) continue;
			fail(
				'EDIT_UNSUPPORTED_PAGE_SIZE_DEPENDENCY',
				'Page-size formula caches cannot be safely refreshed.',
			);
		}
}

/** Refuse when any formula in the package may depend on the page cells about to change. */
export async function assertPageCellsIndependent(
	pkg: VisioPackage,
	pagesPart: string,
	pages: Element,
	pagePaths: ReadonlyMap<string, string>,
	dirty: Map<string, Element>,
	pageId: string,
	changed: readonly string[],
	check: () => void,
): Promise<void> {
	const roots = await editableVisioPageRoots(pkg, pagesPart, pages, pagePaths, dirty, check);
	// Include unknown Visio XML metadata, not just canonical sheets and inherited definitions.
	for (const path of pkg.paths())
		if (/^visio\/.*\.xml$/i.test(path) && !roots.has(path)) {
			check();
			roots.set(path, dirty.get(path) ?? (await pkg.readXml(path)));
		}
	assertDependencies(roots, pagesPart, pages, pagePaths, pageId, changed, check);
}

/** Set physical dimensions and explicit fixed/custom mode, preserving shapes and printer settings. */
export async function setVisioPageSize(
	pkg: VisioPackage,
	pagesPart: string,
	pages: Element,
	pagePaths: ReadonlyMap<string, string>,
	dirty: Map<string, Element>,
	command: VisioPageSizeEdit,
	check: () => void,
): Promise<void> {
	const page = children(pages, 'Page').find((node) => attribute(node, 'ID') === command.pageId);
	if (!page) fail('EDIT_TARGET_NOT_FOUND', 'Page does not exist.');
	if (children(page, 'PageSheet').length !== 1)
		fail('EDIT_UNSUPPORTED_PAGE_SIZE', 'One explicit PageSheet is required.');
	const sheet = child(page, 'PageSheet')!,
		cells = uniqueFormattingCells(sheet);
	for (const name of [
		'PageWidth',
		'PageHeight',
		'PageScale',
		'DrawingScale',
		'DrawingSizeType',
		'DrawingResizeType',
	])
		if (
			!cells.has(name) &&
			[...cells.keys()].some((key) => key.toLowerCase() === name.toLowerCase())
		)
			fail('EDIT_AMBIGUOUS_CELL', 'Page settings require canonical cell names.');
	const pageScale = pageSettingConstant(cells.get('PageScale'), true),
		drawingScale = pageSettingConstant(cells.get('DrawingScale'), true);
	if (pageScale <= 0 || drawingScale <= 0)
		fail('EDIT_UNSUPPORTED_PAGE_SIZE', 'Page and drawing scales must be positive.');
	const width = pageSettingConstant(cells.get('PageWidth'), true),
		height = pageSettingConstant(cells.get('PageHeight'), true);
	const size = pageSettingConstant(cells.get('DrawingSizeType'), false);
	const resize = cells.has('DrawingResizeType')
		? pageSettingConstant(cells.get('DrawingResizeType'), false)
		: undefined;
	if (
		width <= 0 ||
		height <= 0 ||
		![0, 1, 2, 3, 4].includes(size) ||
		(resize !== undefined && ![0, 1, 2].includes(resize))
	)
		fail('EDIT_UNSUPPORTED_PAGE_SIZE', 'Page dimensions or size modes are unsupported.');
	const targetWidth =
			command.width === width * (pageScale / drawingScale)
				? width
				: (command.width * drawingScale) / pageScale,
		targetHeight =
			command.height === height * (pageScale / drawingScale)
				? height
				: (command.height * drawingScale) / pageScale;
	if (
		![targetWidth, targetHeight].every(
			(value) => Number.isFinite(value) && value > 0 && value <= 1e6,
		)
	)
		fail('INVALID_PAGE_SIZE', 'Converted drawing-page dimensions exceed limits.');
	const values = new Map([
		['PageWidth', targetWidth],
		['PageHeight', targetHeight],
		['DrawingSizeType', 3],
		['DrawingResizeType', 0],
	]);
	const changed = [...values.keys()].filter((name) =>
		name === 'PageWidth'
			? width !== targetWidth
			: name === 'PageHeight'
				? height !== targetHeight
				: name === 'DrawingSizeType'
					? size !== 3
					: resize !== 0,
	);
	if (!changed.length) return;
	await assertPageCellsIndependent(
		pkg,
		pagesPart,
		pages,
		pagePaths,
		dirty,
		command.pageId,
		changed,
		check,
	);
	for (const name of changed) setCell(sheet, name, values.get(name)!);
	dirty.set(pagesPart, pages);
}
