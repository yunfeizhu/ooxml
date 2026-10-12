import { attribute } from './sheet';
import { setCell } from './edit-geometry-cells';
import { fail } from './package-common';
import { assertPageCellsIndependent, pageSettingConstant } from './edit-page-size';
import { explicitPageSheet, pageById } from './edit-page-setup';
import type { VisioPackage } from './package';
import {
	VISIO_GRID_DENSITIES,
	VISIO_PAGE_LAYOUT_DEFAULTS,
	VISIO_RULER_DENSITIES,
	type VisioPageLayout,
} from './page-layout';

/**
 * Page Setup > Layout and Routing line jumps and the Ruler & Grid dialog, as PageSheet cells.
 * Every field is optional; only the given cells change. Lengths are inches.
 */
export interface VisioPageLayoutEdit extends Partial<VisioPageLayout> {
	type: 'set-page-layout';
	pageId: string;
}

/** Model field to PageSheet cell; `true` marks a length cell. */
const CELLS: readonly (readonly [keyof VisioPageLayout, string, boolean])[] = [
	['lineJumpCode', 'LineJumpCode', false],
	['lineJumpStyle', 'LineJumpStyle', false],
	['gridDensityX', 'XGridDensity', false],
	['gridDensityY', 'YGridDensity', false],
	['gridSpacingX', 'XGridSpacing', true],
	['gridSpacingY', 'YGridSpacing', true],
	['gridOriginX', 'XGridOrigin', true],
	['gridOriginY', 'YGridOrigin', true],
	['rulerDensityX', 'XRulerDensity', false],
	['rulerDensityY', 'YRulerDensity', false],
	['rulerOriginX', 'XRulerOrigin', true],
	['rulerOriginY', 'YRulerOrigin', true],
];

function valid(key: keyof VisioPageLayout, value: unknown): number {
	const number = typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN;
	const integer = Number.isSafeInteger(number);
	const ok =
		key === 'lineJumpCode'
			? integer && number >= 0 && number <= 5
			: key === 'lineJumpStyle'
				? integer && number >= 0 && number <= 8
				: key.startsWith('gridDensity')
					? (VISIO_GRID_DENSITIES as readonly number[]).includes(number)
					: key.startsWith('rulerDensity')
						? (VISIO_RULER_DENSITIES as readonly number[]).includes(number)
						: key.startsWith('gridSpacing')
							? number >= 0 && number <= 1e4
							: Math.abs(number) <= 1e6;
	if (!ok) fail('INVALID_EDIT', `Invalid page layout value for ${key}.`);
	return number;
}

/** Copy and validate a page layout command; source admission remains authoritative. */
export function snapshotPageLayoutEdit(edit: VisioPageLayoutEdit): VisioPageLayoutEdit {
	if (typeof edit.pageId !== 'string' || !edit.pageId || edit.pageId.length > 256)
		fail('INVALID_EDIT', 'Invalid page.');
	const result: VisioPageLayoutEdit = { type: 'set-page-layout', pageId: edit.pageId };
	for (const [key] of CELLS) if (edit[key] !== undefined) result[key] = valid(key, edit[key]);
	if (Object.keys(result).length === 2) fail('INVALID_EDIT', 'Page layout changes nothing.');
	return result;
}

/** Write the line jump, grid and ruler cells that differ from the page's current values. */
export async function setVisioPageLayout(
	pkg: VisioPackage,
	pagesPart: string,
	pages: Element,
	pagePaths: ReadonlyMap<string, string>,
	dirty: Map<string, Element>,
	command: VisioPageLayoutEdit,
	check: () => void,
): Promise<void> {
	const page = pageById(pages, command.pageId);
	const { sheet, cells } = explicitPageSheet(page);
	const changed: [name: string, value: number, length: boolean][] = [];
	for (const [key, name, length] of CELLS) {
		const value = command[key];
		if (value === undefined) continue;
		const node = cells.get(name);
		// A missing cell holds Visio's default; an existing one must be a plain, unguarded value.
		const current = node ? pageSettingConstant(node, length) : VISIO_PAGE_LAYOUT_DEFAULTS[key];
		if (current !== value) changed.push([name, value, length]);
	}
	if (!changed.length) return;
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
	for (const [name, value, length] of changed) {
		setCell(sheet, name, value);
		if (!length) continue;
		// Visio writes lengths with a unit; keep the one the cell already shows.
		const node = explicitPageSheet(page).cells.get(name)!;
		const unit = attribute(node, 'U');
		if (!unit || !/^(IN|MM|CM|M|FT|PT|DL|IN_F)$/i.test(unit)) node.setAttribute('U', 'IN');
	}
	dirty.set(pagesPart, pages);
}
