import type { CellRange } from '../address';
import { putCell } from '../cells';
import { clearFilteredRows } from '../filter-rows';
import type { Cell, DrawingAnchor, Table, TableColumn, Worksheet } from '../model';
import { normalizeColumns } from './columns';
import { assertInsertFits } from './insert-guard';
import { shiftPreservedXml } from './shift-preserved';
import {
	type AxisShift,
	shiftIndex,
	shiftIndexClamped,
	shiftRange,
	shiftRangeInBand,
	shiftSpan,
} from './range-math';

/** Limits a shift to the cells between `lo` and `hi` on the other axis (insert/delete cells). */
export interface Band {
	lo: number;
	hi: number;
}

/**
 * Moves everything positioned on a sheet for a row or column insert/delete: cells, merges,
 * conditional-format and validation ranges, hyperlinks, comments, tables, drawing anchors, row and
 * column formats, the auto-filter, the freeze pane, the print area, and the page breaks, sparklines
 * and x14 extensions kept as XML. Formulas are rewritten separately (they live on every sheet).
 */
export function shiftSheetContent(sheet: Worksheet, shift: AxisShift, band?: Band): void {
	assertInsertFits(sheet, shift, band);
	const moveRange = (range: CellRange): CellRange | undefined =>
		band ? shiftRangeInBand(range, shift, band.lo, band.hi) : shiftRange(range, shift);
	shiftCells(sheet, shift, band, moveRange);
	sheet.merges = sheet.merges
		.map(moveRange)
		.filter((m): m is CellRange => !!m && (m.start.row !== m.end.row || m.start.col !== m.end.col));
	sheet.conditionalFormats = sheet.conditionalFormats
		.map((cf) => ({ ...cf, ranges: cf.ranges.map(moveRange).filter((r): r is CellRange => !!r) }))
		.filter((cf) => cf.ranges.length > 0);
	sheet.dataValidations = sheet.dataValidations
		.map((dv) => ({ ...dv, ranges: dv.ranges.map(moveRange).filter((r): r is CellRange => !!r) }))
		.filter((dv) => dv.ranges.length > 0);
	sheet.hyperlinks = sheet.hyperlinks.flatMap((h) => {
		const range = moveRange(h.range);
		return range ? [{ ...h, range }] : [];
	});
	sheet.comments = sheet.comments.flatMap((c) => {
		const range = moveRange({ start: c.address, end: c.address });
		return range ? [{ ...c, address: range.start }] : [];
	});
	sheet.tables = sheet.tables.flatMap((t) => shiftTable(sheet, t, shift, moveRange));
	for (const drawing of sheet.drawings) shiftAnchor(drawing.anchor, shift, band);
	if (!band) shiftAxisFormats(sheet, shift);
	if (sheet.autoFilter) {
		const old = sheet.autoFilter.range;
		const range = moveRange(old);
		if (!range) {
			delete sheet.autoFilter;
			clearFilteredRows(sheet);
		} else {
			const filter = { ...sheet.autoFilter, range };
			if (shift.axis === 'col' && filter.columns)
				filter.columns = filter.columns.flatMap((fc) => {
					const abs = shiftIndex(old.start.col + fc.offset, shift);
					return abs === undefined ? [] : [{ ...fc, offset: abs - range.start.col }];
				});
			sheet.autoFilter = filter;
		}
	}
	if (!band) shiftFreeze(sheet, shift);
	const printArea = sheet.pageSetup?.printArea;
	if (sheet.pageSetup && printArea) {
		const moved = moveRange(printArea);
		if (moved) sheet.pageSetup.printArea = moved;
		else delete sheet.pageSetup.printArea;
	}
	shiftPreservedXml(sheet, shift, moveRange, !!band);
}

function shiftCells(
	sheet: Worksheet,
	shift: AxisShift,
	band: Band | undefined,
	moveRange: (range: CellRange) => CellRange | undefined,
): void {
	const old = sheet.rows;
	sheet.rows = new Map();
	for (const [row, cells] of old)
		for (const [col, cell] of cells) {
			const along = shift.axis === 'row' ? row : col;
			const across = shift.axis === 'row' ? col : row;
			const inBand = !band || (across >= band.lo && across <= band.hi);
			const moved = inBand ? shiftIndex(along, shift) : along;
			if (moved === undefined) continue;
			if (cell.arrayRange) {
				const range = moveRange(cell.arrayRange);
				if (range) cell.arrayRange = range;
				else delete cell.arrayRange;
			}
			if (shift.axis === 'row') putCell(sheet, moved, col, cell);
			else putCell(sheet, row, moved, cell);
		}
}

function uniqueColumnName(columns: TableColumn[]): string {
	const taken = new Set(columns.map((c) => c.name.toLowerCase()));
	for (let n = 1; ; n++) if (!taken.has(`column${n}`)) return `Column${n}`;
}

function shiftTable(
	sheet: Worksheet,
	table: Table,
	shift: AxisShift,
	moveRange: (range: CellRange) => CellRange | undefined,
): Table[] {
	const old = table.range;
	const range = moveRange(old);
	if (!range) return [];
	const next: Table = { ...table, range, columns: [...table.columns] };
	const widened = range.end.col - range.start.col !== old.end.col - old.start.col;
	if (shift.axis === 'col' && widened) {
		if (shift.count > 0) {
			const offset = shift.at - old.start.col;
			for (let i = 0; i < shift.count; i++) {
				const column: TableColumn = { name: uniqueColumnName(next.columns) };
				next.columns.splice(offset + i, 0, column);
				if (next.headerRow) {
					const cell: Cell = { value: column.name };
					putCell(sheet, range.start.row, shift.at + i, cell);
				}
			}
		} else {
			next.columns = next.columns.filter(
				(_c, i) => shiftIndex(old.start.col + i, shift) !== undefined,
			);
		}
	}
	return [next];
}

function shiftAnchor(anchor: DrawingAnchor, shift: AxisShift, band: Band | undefined): void {
	const key = shift.axis === 'row' ? 'row' : 'col';
	const other = shift.axis === 'row' ? 'col' : 'row';
	if (band && (anchor.from[other] < band.lo || anchor.from[other] > band.hi)) return;
	const from = anchor.from[key];
	const movedFrom = shiftIndexClamped(from, shift);
	if (shiftIndex(from, shift) === undefined)
		anchor.from[key === 'row' ? 'rowOffset' : 'colOffset'] = 0;
	anchor.from[key] = movedFrom;
	if (anchor.to) {
		const to = anchor.to[key];
		const moved = shiftIndex(to, shift);
		if (moved === undefined) {
			anchor.to[key] = Math.max(movedFrom, shiftIndexClamped(to, shift));
			anchor.to[key === 'row' ? 'rowOffset' : 'colOffset'] = 0;
		} else anchor.to[key] = moved;
	}
}

function shiftAxisFormats(sheet: Worksheet, shift: AxisShift): void {
	if (shift.axis === 'row') {
		const old = sheet.rowInfo;
		sheet.rowInfo = new Map();
		for (const [row, info] of old) {
			const moved = shiftIndex(row, shift);
			if (moved !== undefined) sheet.rowInfo.set(moved, info);
		}
		return;
	}
	sheet.columns = normalizeColumns(
		sheet.columns.flatMap((info) => {
			const span = shiftSpan(info.min, info.max, shift);
			return span ? [{ ...info, min: span.start, max: span.end }] : [];
		}),
	);
}

function shiftFreeze(sheet: Worksheet, shift: AxisShift): void {
	const freeze = sheet.view.freeze;
	if (!freeze) return;
	const key = shift.axis === 'row' ? 'rows' : 'cols';
	const frozen = freeze[key];
	if (shift.at >= frozen) return;
	const next =
		shift.count > 0 ? frozen + shift.count : frozen - Math.min(-shift.count, frozen - shift.at);
	sheet.view.freeze = { ...freeze, [key]: next };
}
