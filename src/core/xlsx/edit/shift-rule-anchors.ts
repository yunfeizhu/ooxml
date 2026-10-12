import { MAX_COL, MAX_ROW, type CellRange } from '../address';
import type { Worksheet } from '../model';
import { rebaseConditionalFormat } from './clipboard-conditional';
import { cellRange, subtractRange, type AxisShift } from './range-math';
import type { Band } from './shift-sheet';
import { rebaseValidation } from './validation-ranges';

/**
 * Rebase rules to their first surviving cells before deletion rewrites references. Keeping the
 * old ranges here lets the normal range shift move them once, without splitting contiguous rules.
 */
export function rebaseRulesForDeletion(sheet: Worksheet, shift: AxisShift, band?: Band): void {
	if (shift.count >= 0) return;
	const last = shift.at - shift.count - 1;
	const removed =
		shift.axis === 'row'
			? cellRange(shift.at, band?.lo ?? 0, last, band?.hi ?? MAX_COL)
			: cellRange(band?.lo ?? 0, shift.at, band?.hi ?? MAX_ROW, last);
	const other = shift.axis === 'row' ? 'col' : 'row';
	/** Finds surviving covered cells, leaving ranges crossing a band edge anchored in place. */
	const surviving = (ranges: CellRange[]): CellRange[] =>
		ranges.flatMap((range) =>
			band && (range.start[other] < band.lo || range.end[other] > band.hi)
				? [range]
				: subtractRange(range, removed),
		);
	sheet.conditionalFormats = sheet.conditionalFormats.map((format) => {
		const ranges = surviving(format.ranges);
		return ranges.length
			? { ...rebaseConditionalFormat(format, ranges), ranges: format.ranges }
			: format;
	});
	sheet.dataValidations = sheet.dataValidations.map((rule) => {
		const ranges = surviving(rule.ranges);
		return ranges.length ? { ...rebaseValidation(rule, ranges), ranges: rule.ranges } : rule;
	});
}
