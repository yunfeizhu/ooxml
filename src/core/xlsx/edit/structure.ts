import { MAX_COL, MAX_ROW } from '../address';
import { getCell, putCell } from '../cells';
import type { Worksheet } from '../model';
import { type EditContext, type RunInfo, sheetAt } from './context';
import { shiftFormula } from './deps';
import { assertInsertFits } from './insert-guard';
import { type Axis, type AxisShift, shiftRange } from './range-math';
import { rewriteFormulas } from './shift-formulas';
import { rebaseRulesForDeletion } from './shift-rule-anchors';
import { shiftSheetContent } from './shift-sheet';

/** Validates an inclusive axis span before opening an edit transaction. */
function checkSpan(axis: Axis, at: number, count: number): void {
	const max = axis === 'row' ? MAX_ROW : MAX_COL;
	if (
		!Number.isInteger(at) ||
		!Number.isInteger(count) ||
		at < 0 ||
		at > max ||
		count < 1 ||
		at + count > max + 1
	)
		throw new RangeError(`Invalid ${axis} span ${at} + ${count}`);
}

/** Applies an axis shift to a sheet and every formula in the workbook (no undo step). */
export function applyAxisShift(ctx: EditContext, sheet: Worksheet, shift: AxisShift): void {
	assertInsertFits(sheet, shift);
	rebaseRulesForDeletion(sheet, shift);
	const spec = { sheet: sheet.name, axis: shift.axis, at: shift.at, count: shift.count };
	rewriteFormulas(ctx.workbook, (formula, formulaSheet) =>
		shiftFormula(formula, formulaSheet, spec),
	);
	shiftSheetContent(sheet, shift);
}

/** Inserted rows and columns take the format of the row above or the column to the left. */
function inheritFormats(sheet: Worksheet, axis: Axis, at: number, count: number): void {
	if (at === 0) return;
	if (axis === 'row') {
		const above = sheet.rows.get(at - 1);
		const info = sheet.rowInfo.get(at - 1);
		for (let r = at; r < at + count; r++) {
			if (info?.styleId) sheet.rowInfo.set(r, { styleId: info.styleId });
			for (const [col, cell] of above ?? [])
				if (cell.styleId && !getCell(sheet, r, col))
					putCell(sheet, r, col, { value: null, styleId: cell.styleId });
		}
		return;
	}
	for (const [row, cells] of sheet.rows) {
		const left = cells.get(at - 1);
		if (!left?.styleId) continue;
		for (let c = at; c < at + count; c++)
			if (!cells.has(c)) putCell(sheet, row, c, { value: null, styleId: left.styleId });
	}
}

/** Performs one undoable axis edit after its boundary preflight succeeds. */
function shiftAxis(
	ctx: EditContext,
	s: number,
	axis: Axis,
	at: number,
	count: number,
	insert: boolean,
): void {
	checkSpan(axis, at, count);
	const sheet = sheetAt(ctx.workbook, s);
	const noun = axis === 'row' ? (count === 1 ? 'row' : 'rows') : count === 1 ? 'column' : 'columns';
	const shift: AxisShift = { axis, at, count: insert ? count : -count };
	assertInsertFits(sheet, shift);
	const info: RunInfo = { sheet: s, structural: true };
	// Removing a filter changes row visibility, so SUBTOTAL also needs a fresh calculation.
	if (!sheet.autoFilter || shiftRange(sheet.autoFilter.range, shift))
		info.calc = { kind: 'shift', sheet: s, shift };
	ctx.run(
		`${insert ? 'Insert' : 'Delete'} ${noun}`,
		'structure',
		[{ kind: 'shift', sheet: s, shift }],
		() => {
			applyAxisShift(ctx, sheet, shift);
			if (insert) inheritFormats(sheet, axis, at, count);
		},
		info,
	);
}

export const insertRows = (ctx: EditContext, s: number, at: number, count: number): void =>
	shiftAxis(ctx, s, 'row', at, count, true);
export const deleteRows = (ctx: EditContext, s: number, at: number, count: number): void =>
	shiftAxis(ctx, s, 'row', at, count, false);
export const insertColumns = (ctx: EditContext, s: number, at: number, count: number): void =>
	shiftAxis(ctx, s, 'col', at, count, true);
export const deleteColumns = (ctx: EditContext, s: number, at: number, count: number): void =>
	shiftAxis(ctx, s, 'col', at, count, false);
