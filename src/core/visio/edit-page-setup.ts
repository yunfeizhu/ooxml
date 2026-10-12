import { attribute, child, children, yes } from './sheet';
import { uniqueFormattingCells } from './edit-style-admission';
import { setCell } from './edit-geometry-cells';
import { fail } from './package-common';
import { assertPageCellsIndependent, pageSettingConstant } from './edit-page-size';
import type { VisioPackage } from './package';
import type { VisioPagePropertiesEdit, VisioPageSetupEdit } from './edit-page-setup-commands';

const SETUP_CELLS = [
	'PageWidth',
	'PageHeight',
	'PageScale',
	'DrawingScale',
	'DrawingScaleType',
	'DrawingResizeType',
	'PrintPageOrientation',
	'PaperKind',
];

export function pageById(pages: Element, pageId: string): Element {
	const page = children(pages, 'Page').find((node) => attribute(node, 'ID') === pageId);
	if (!page) fail('EDIT_TARGET_NOT_FOUND', 'Page does not exist.');
	return page;
}

/** The single explicit PageSheet and its uniquely named cells, refusing ambiguous names. */
export function explicitPageSheet(page: Element): { sheet: Element; cells: Map<string, Element> } {
	if (children(page, 'PageSheet').length !== 1)
		fail('EDIT_UNSUPPORTED_PAGE_SIZE', 'One explicit PageSheet is required.');
	const sheet = child(page, 'PageSheet')!,
		cells = uniqueFormattingCells(sheet);
	for (const name of SETUP_CELLS)
		if (
			!cells.has(name) &&
			[...cells.keys()].some((key) => key.toLowerCase() === name.toLowerCase())
		)
			fail('EDIT_AMBIGUOUS_CELL', 'Page settings require canonical cell names.');
	return { sheet, cells };
}

/** Design > Page Setup cells: print orientation, paper, Auto Size and drawing scale. */
export async function setVisioPageSetup(
	pkg: VisioPackage,
	pagesPart: string,
	pages: Element,
	pagePaths: ReadonlyMap<string, string>,
	dirty: Map<string, Element>,
	command: VisioPageSetupEdit,
	check: () => void,
): Promise<void> {
	const page = pageById(pages, command.pageId);
	const { sheet, cells } = explicitPageSheet(page);
	const values = new Map<string, number>();
	const current = (name: string, length = false) =>
		cells.has(name) ? pageSettingConstant(cells.get(name), length) : undefined;
	if (command.printOrientation !== undefined) {
		current('PrintPageOrientation');
		values.set('PrintPageOrientation', command.printOrientation === 'portrait' ? 1 : 2);
	}
	if (command.paperKind !== undefined) {
		current('PaperKind');
		values.set('PaperKind', command.paperKind);
	}
	if (command.autoSize !== undefined) {
		current('DrawingResizeType');
		values.set('DrawingResizeType', command.autoSize ? 1 : 2);
	}
	if (command.scale) {
		const pageScale = pageSettingConstant(cells.get('PageScale'), true),
			drawingScale = pageSettingConstant(cells.get('DrawingScale'), true);
		const width = pageSettingConstant(cells.get('PageWidth'), true),
			height = pageSettingConstant(cells.get('PageHeight'), true);
		if (pageScale <= 0 || drawingScale <= 0 || width <= 0 || height <= 0)
			fail('EDIT_UNSUPPORTED_PAGE_SIZE', 'Page size and scales must be positive.');
		current('DrawingScaleType');
		// Keep the physical page: drawing size = paper size * drawing / page.
		const factor = (pageScale / drawingScale) * (command.scale.drawing / command.scale.page);
		const newWidth = width * factor,
			newHeight = height * factor;
		if (
			![newWidth, newHeight].every((value) => Number.isFinite(value) && value > 0 && value <= 1e6)
		)
			fail('INVALID_PAGE_SIZE', 'The scaled drawing page exceeds limits.');
		values.set('PageScale', command.scale.page);
		values.set('DrawingScale', command.scale.drawing);
		values.set('DrawingScaleType', command.scale.page === command.scale.drawing ? 0 : 3);
		values.set('PageWidth', newWidth);
		values.set('PageHeight', newHeight);
	}
	const changed = [...values].filter(([name, value]) => {
		const node = cells.get(name);
		if (!node) return true;
		const existing = pageSettingConstant(node, /^(Page|Drawing)(Width|Height|Scale)$/.test(name));
		return existing !== value;
	});
	const unit = command.scale?.unit;
	const unitChanged =
		unit !== undefined && (attribute(cells.get('DrawingScale'), 'U') ?? 'IN') !== unit;
	if (!changed.length && !unitChanged) return;
	await assertPageCellsIndependent(
		pkg,
		pagesPart,
		pages,
		pagePaths,
		dirty,
		command.pageId,
		changed.map(([name]) => name),
		check,
	);
	for (const [name, value] of changed) setCell(sheet, name, value);
	if (command.scale) {
		const fresh = uniqueFormattingCells(sheet);
		fresh
			.get('DrawingScale')!
			.setAttribute('U', unit ?? attribute(fresh.get('DrawingScale'), 'U') ?? 'IN');
		if (!fresh.get('PageScale')!.hasAttribute('U')) fresh.get('PageScale')!.setAttribute('U', 'IN');
	}
	dirty.set(pagesPart, pages);
}

const isBackground = (page: Element) => yes(attribute(page, 'Background'));

/** Page Properties: page type and background assignment, with Visio's tab order. */
export function setVisioPageProperties(
	pagesPart: string,
	pages: Element,
	dirty: Map<string, Element>,
	command: VisioPagePropertiesEdit,
): void {
	const page = pageById(pages, command.pageId);
	const list = children(pages, 'Page');
	let changed = false;
	if (command.background !== undefined && command.background !== isBackground(page)) {
		if (command.background) {
			if (list.filter((node) => !isBackground(node)).length === 1)
				fail('EDIT_LAST_FOREGROUND_PAGE', 'A drawing needs at least one foreground page.');
			page.setAttribute('Background', '1');
			// Visio lists background pages after every foreground page.
			pages.appendChild(page);
		} else {
			if (list.some((node) => attribute(node, 'BackPage') === command.pageId))
				fail(
					'EDIT_BACKGROUND_IN_USE',
					'A background page assigned to other pages cannot become a foreground page.',
				);
			page.removeAttribute('Background');
			pages.insertBefore(page, list.find((node) => node !== page && isBackground(node)) ?? null);
		}
		changed = true;
	}
	if (command.backPageId !== undefined) {
		const before = attribute(page, 'BackPage');
		if (command.backPageId === null) {
			if (before !== undefined) {
				page.removeAttribute('BackPage');
				changed = true;
			}
		} else if (before !== command.backPageId) {
			const target = pageById(pages, command.backPageId);
			if (!isBackground(target))
				fail('EDIT_INVALID_BACKGROUND', 'Only a background page can be assigned as a background.');
			const seen = new Set([command.pageId]);
			for (let next: Element | undefined = target; next;) {
				const id = attribute(next, 'ID')!;
				if (seen.has(id))
					fail('EDIT_INVALID_BACKGROUND', 'The background assignment would form a cycle.');
				seen.add(id);
				const back = attribute(next, 'BackPage');
				next = back === undefined ? undefined : list.find((node) => attribute(node, 'ID') === back);
			}
			page.setAttribute('BackPage', command.backPageId);
			changed = true;
		}
	}
	if (changed) dirty.set(pagesPart, pages);
}
