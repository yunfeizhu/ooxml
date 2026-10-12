import { type CellRange, MAX_COL, MAX_ROW, normalizeRange, rangesIntersect } from '../address';
import type { Worksheet } from '../model';
import { shiftFormulaInBand } from './band-formulas';
import { assertInsertFits } from './insert-guard';
import { type EditContext, isWholeColumns, isWholeRows, sheetAt } from './context';
import type { AxisShift } from './range-math';
import { cellRange } from './range-math';
import { rewriteFormulas } from './shift-formulas';
import { rebaseRulesForDeletion } from './shift-rule-anchors';
import { type Band, shiftSheetContent } from './shift-sheet';
import { deleteColumns, deleteRows, insertColumns, insertRows } from './structure';

/** Merges and tables cut by the band's edge would be torn apart; Excel refuses those shifts. */
function assertBandIntact(sheet: Worksheet, shift: AxisShift, band: Band): void {
	const zone =
		shift.axis === 'row'
			? cellRange(shift.at, band.lo, MAX_ROW, band.hi)
			: cellRange(band.lo, shift.at, band.hi, MAX_COL);
	const other = shift.axis === 'row' ? 'col' : 'row';
	const torn = (r: CellRange): boolean =>
		rangesIntersect(r, zone) && (r.start[other] < band.lo || r.end[other] > band.hi);
	if (sheet.merges.some(torn))
		throw new Error('Cannot shift cells: a merged range would be split.');
	if (sheet.tables.some((t) => torn(t.range)))
		throw new Error('Cannot shift cells: a table would be split.');
}

/** Runs one atomic cell-band edit after checking the ranges that must move together. */
function shiftBand(
	ctx: EditContext,
	s: number,
	range: CellRange,
	direction: 'down' | 'right' | 'up' | 'left',
): void {
	const sheet = sheetAt(ctx.workbook, s);
	const r = normalizeRange(range);
	const vertical = direction === 'down' || direction === 'up';
	const insert = direction === 'down' || direction === 'right';
	const size = vertical ? r.end.row - r.start.row + 1 : r.end.col - r.start.col + 1;
	const shift: AxisShift = {
		axis: vertical ? 'row' : 'col',
		at: vertical ? r.start.row : r.start.col,
		count: insert ? size : -size,
	};
	const band: Band = vertical
		? { lo: r.start.col, hi: r.end.col }
		: { lo: r.start.row, hi: r.end.row };
	assertBandIntact(sheet, shift, band);
	assertInsertFits(sheet, shift, band);
	ctx.run(
		`${insert ? 'Insert' : 'Delete'} cells`,
		'structure',
		[{ kind: 'shift', sheet: s, shift, band }],
		() => {
			rebaseRulesForDeletion(sheet, shift, band);
			rewriteFormulas(ctx.workbook, (formula, formulaSheet) =>
				shiftFormulaInBand(formula, formulaSheet, sheet.name, shift, band),
			);
			shiftSheetContent(sheet, shift, band);
		},
		{ sheet: s, ranges: [r], structural: true },
	);
}

/**
 * Inserts blank cells over `range`, pushing the cells below (or to the right) along. A range
 * spanning whole rows or columns is a row or column insert. References lying entirely inside the
 * moved band follow the cells; references straddling the band edge stay as written.
 */
export function insertCellsShift(
	ctx: EditContext,
	s: number,
	range: CellRange,
	direction: 'down' | 'right',
): void {
	const r = normalizeRange(range);
	if (direction === 'down' && isWholeRows(r))
		return insertRows(ctx, s, r.start.row, r.end.row - r.start.row + 1);
	if (direction === 'right' && isWholeColumns(r))
		return insertColumns(ctx, s, r.start.col, r.end.col - r.start.col + 1);
	shiftBand(ctx, s, r, direction);
}

/** Deletes the cells of `range`, pulling the cells below (or to the right) in. */
export function deleteCellsShift(
	ctx: EditContext,
	s: number,
	range: CellRange,
	direction: 'up' | 'left',
): void {
	const r = normalizeRange(range);
	if (direction === 'up' && isWholeRows(r))
		return deleteRows(ctx, s, r.start.row, r.end.row - r.start.row + 1);
	if (direction === 'left' && isWholeColumns(r))
		return deleteColumns(ctx, s, r.start.col, r.end.col - r.start.col + 1);
	shiftBand(ctx, s, r, direction);
}
