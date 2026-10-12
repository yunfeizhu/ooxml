import { MAX_COL, MAX_ROW, type CellRange, rangesIntersect } from '../address';
import { isEmptyCell } from '../cells';
import type { Worksheet } from '../model';
import { normalizeColumns } from './columns';
import type { AxisShift } from './range-math';
import { cellRange } from './range-math';
import type { Band } from './shift-sheet';
import { hasPreservedOverflow } from './shift-preserved';

/** Refuses an insertion that would discard cells or clip positioned metadata at the grid edge. */
export function assertInsertFits(sheet: Worksheet, shift: AxisShift, band?: Band): void {
	if (shift.count <= 0) return;
	const max = shift.axis === 'row' ? MAX_ROW : MAX_COL;
	if (shift.at + shift.count > max + 1)
		throw new RangeError('The insert area extends beyond the sheet.');
	const first = max - shift.count + 1;
	const lost =
		shift.axis === 'row'
			? cellRange(first, band?.lo ?? 0, MAX_ROW, band?.hi ?? MAX_COL)
			: cellRange(band?.lo ?? 0, first, band?.hi ?? MAX_ROW, MAX_COL);
	const other = shift.axis === 'row' ? 'col' : 'row';
	/** A range can be clipped only when the same band rule used by the shift moves it. */
	const clipped = (range: CellRange): boolean =>
		(!band || (range.start[other] >= band.lo && range.end[other] <= band.hi)) &&
		rangesIntersect(range, lost);
	/** Uses the shared, translated insertion error for every kind of boundary content. */
	const fail = (): never => {
		throw new Error('Cannot insert cells: non-empty cells would be pushed off the sheet.');
	};
	for (const [row, cells] of sheet.rows) {
		if (row < lost.start.row || row > lost.end.row) continue;
		for (const [col, cell] of cells)
			if (
				col >= lost.start.col &&
				col <= lost.end.col &&
				(!isEmptyCell(cell) || cell.cellMetadata !== undefined || cell.valueMetadata !== undefined)
			)
				fail();
	}
	if (
		sheet.comments.some((c) => rangesIntersect(cellRange(c.address.row, c.address.col), lost)) ||
		sheet.hyperlinks.some((h) => rangesIntersect(h.range, lost)) ||
		sheet.merges.some((m) => rangesIntersect(m, lost)) ||
		sheet.tables.some((t) => rangesIntersect(t.range, lost)) ||
		sheet.dataValidations.some((rule) => rule.ranges.some(clipped)) ||
		sheet.conditionalFormats.some((format) => format.ranges.some(clipped)) ||
		(sheet.autoFilter !== undefined && clipped(sheet.autoFilter.range)) ||
		(sheet.pageSetup?.printArea !== undefined && clipped(sheet.pageSetup.printArea)) ||
		hasPreservedOverflow(sheet, shift, clipped, !!band)
	)
		fail();
	for (const { anchor } of sheet.drawings) {
		if (band && (anchor.from[other] < band.lo || anchor.from[other] > band.hi)) continue;
		if (anchor.from[shift.axis] >= first || (anchor.to && anchor.to[shift.axis] >= first)) fail();
	}
	// Cell-band shifts do not move row heights or column widths.
	if (band) return;
	if (shift.axis === 'row') {
		for (const [row, info] of sheet.rowInfo) if (row >= first && Object.keys(info).length) fail();
	} else {
		// A clipped span keeps its formatting on the surviving columns.
		if (normalizeColumns(sheet.columns).some((c) => c.min >= first)) fail();
	}
}
