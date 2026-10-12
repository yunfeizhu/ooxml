// Editing existing tables: options, rename, header/totals toggles, resize, convert to range.
import { type CellRange, MAX_ROW, normalizeRange, rangesIntersect } from '../address';
import { forEachCell, getCell } from '../cells';
import { structuredToA1 } from '../formula/structured-to-a1';
import { renameTableInFormula } from '../formula/table-refs';
import type { Table, TableColumn, Workbook, Worksheet } from '../model';
import { shiftFormulaInBand } from './band-formulas';
import { assertInsertFits } from './insert-guard';
import { writeValue } from './cell-values';
import { type EditContext, displayText, sheetAt } from './context';
import type { EditScope } from './history';
import { rewriteFormulas } from './shift-formulas';
import { shiftSheetContent } from './shift-sheet';
import { applyTotalsRow, clearRow, rowIsEmpty } from './table-rows';
import { uniqueHeaders } from './table-header-names';

/** A table by index in `sheet.tables` or by name (case-insensitive). */
export type TableRef = number | string;

/** What `updateTable` may change. */
export type TablePatch = Partial<Omit<Table, 'id' | 'partName'>>;

export function tableIndex(sheet: Worksheet, ref: TableRef): number {
	const index =
		typeof ref === 'number'
			? ref
			: sheet.tables.findIndex((t) => t.name.toLowerCase() === ref.toLowerCase());
	if (!sheet.tables[index]) throw new RangeError(`No table ${String(ref)} on ${sheet.name}`);
	return index;
}

const TABLE_NAME = /^[A-Za-z_\\][A-Za-z0-9_.\\]*$/;

/** Why `name` cannot name a table in this workbook (ignoring `self`), or undefined. */
export function validateTableName(
	workbook: Workbook,
	name: string,
	self?: Table,
): string | undefined {
	if (!TABLE_NAME.test(name) || name.length > 255)
		return 'A table name must start with a letter or underscore and contain no spaces.';
	if (/^[A-Za-z]{1,3}\d+$/.test(name) || /^[RrCc]$/.test(name) || /^[Rr]\d*[Cc]\d*$/.test(name))
		return 'A table name cannot look like a cell reference.';
	const lower = name.toLowerCase();
	const taken =
		workbook.sheets.some((s) =>
			s.tables.some((t) => t !== self && t.name.toLowerCase() === lower),
		) || workbook.definedNames.some((n) => n.name.toLowerCase() === lower);
	return taken ? 'That name is already used by another table or name.' : undefined;
}

/** Renames a table and every structured reference to it (no undo step). */
export function renameTableIn(workbook: Workbook, table: Table, name: string): void {
	const old = table.name;
	if (old === name) return;
	const rename = (f: string) => renameTableInFormula(f, old, name);
	rewriteFormulas(workbook, rename);
	for (const sheet of workbook.sheets)
		for (const t of sheet.tables)
			for (const column of t.columns)
				if (column.calculatedColumnFormula)
					column.calculatedColumnFormula = rename(column.calculatedColumnFormula);
	table.name = name;
	table.displayName = name;
}

const byId = (sheet: Worksheet, id: number): Table => {
	const table = sheet.tables.find((t) => t.id === id);
	if (!table) throw new Error('The table disappeared during the edit.');
	return table;
};

/** Inserts one row of cells across the table's columns at `row` (formulas follow). */
function insertBandRow(workbook: Workbook, sheet: Worksheet, table: Table, row: number): void {
	const shift = { axis: 'row' as const, at: row, count: 1 };
	const band = { lo: table.range.start.col, hi: table.range.end.col };
	assertInsertFits(sheet, shift, band);
	rewriteFormulas(workbook, (f, fs) => shiftFormulaInBand(f, fs, sheet.name, shift, band));
	shiftSheetContent(sheet, shift, band);
}

function setHeaderRow(workbook: Workbook, sheet: Worksheet, id: number, on: boolean): void {
	let table = byId(sheet, id);
	if (table.headerRow === on) return;
	const { start, end } = table.range;
	if (!on) {
		if (start.row === end.row) throw new Error('A table needs at least one row.');
		clearRow(sheet, start.row, start.col, end.col);
		table.range = { start: { row: start.row + 1, col: start.col }, end };
		table.headerRow = false;
		return;
	}
	if (start.row === 0 || !rowIsEmpty(sheet, start.row - 1, start.col, end.col)) {
		insertBandRow(workbook, sheet, table, start.row);
		table = byId(sheet, id);
	}
	const top = table.range.start.row - 1;
	const left = table.range.start.col;
	table.range = { start: { row: top, col: left }, end: table.range.end };
	table.headerRow = true;
	uniqueHeaders(table.columns.map((c) => c.name)).forEach((name, i) => {
		const column = table.columns[i];
		if (column) column.name = name;
		writeValue(sheet, top, left + i, name);
	});
}

/** Adds or clears the totals row, refusing growth beyond the worksheet even when it is empty. */
function setTotalsRow(workbook: Workbook, sheet: Worksheet, id: number, on: boolean): void {
	let table = byId(sheet, id);
	if (table.totalsRow === on) return;
	const { start, end } = table.range;
	if (!on) {
		clearRow(sheet, end.row, start.col, end.col);
		table.range = { start, end: { row: end.row - 1, col: end.col } };
		table.totalsRow = false;
		return;
	}
	if (end.row === MAX_ROW) throw new RangeError('The insert area extends beyond the sheet.');
	if (!rowIsEmpty(sheet, end.row + 1, start.col, end.col)) {
		insertBandRow(workbook, sheet, table, end.row + 1);
		table = byId(sheet, id);
	}
	table.range = { start: table.range.start, end: { row: table.range.end.row + 1, col: end.col } };
	table.totalsRow = true;
	applyTotalsRow(sheet, table);
}

/** Columns for a new range: kept by position, new ones named from their header cells. */
function resizedColumns(
	workbook: Workbook,
	sheet: Worksheet,
	table: Table,
	range: CellRange,
): TableColumn[] {
	const width = range.end.col - range.start.col + 1;
	const oldAt = (col: number): TableColumn | undefined =>
		col >= table.range.start.col && col <= table.range.end.col
			? table.columns[col - table.range.start.col]
			: undefined;
	const texts = Array.from({ length: width }, (_v, i) => {
		const col = range.start.col + i;
		const old = oldAt(col);
		if (old) return old.name;
		return table.headerRow ? displayText(workbook, getCell(sheet, range.start.row, col)) : '';
	});
	return uniqueHeaders(texts).map((name, i) => {
		const old = oldAt(range.start.col + i);
		return old ? { ...old, name } : { name };
	});
}

/** Changes a table's range (no undo step). Headers stay on their row, as Excel requires. */
function resizeTableIn(workbook: Workbook, sheet: Worksheet, id: number, range: CellRange): void {
	const table = byId(sheet, id);
	const r = normalizeRange(range);
	if (table.headerRow && r.start.row !== table.range.start.row)
		throw new Error('The table headers must remain in the same row.');
	if (!rangesIntersect(r, table.range)) throw new Error('The new range must overlap the table.');
	if (r.end.row - r.start.row + 1 < (table.headerRow ? 2 : 1) + (table.totalsRow ? 1 : 0))
		throw new Error('The table range is too small.');
	if (sheet.tables.some((t) => t !== table && rangesIntersect(t.range, r)))
		throw new Error('A table cannot overlap another table.');
	if (sheet.merges.some((m) => rangesIntersect(m, r)))
		throw new Error('A table cannot contain merged cells.');
	const oldEnd = table.range.end.row;
	table.columns = resizedColumns(workbook, sheet, table, r);
	table.range = r;
	if (table.headerRow)
		table.columns.forEach((column, i) => {
			const cell = getCell(sheet, r.start.row, r.start.col + i);
			if (cell?.value !== column.name) writeValue(sheet, r.start.row, r.start.col + i, column.name);
		});
	if (table.totalsRow) {
		if (oldEnd !== r.end.row) clearRow(sheet, oldEnd, r.start.col, r.end.col);
		applyTotalsRow(sheet, table);
	}
}

const STYLE_KEYS = [
	'styleName',
	'showRowStripes',
	'showColumnStripes',
	'showFirstColumn',
	'showLastColumn',
] as const;

/**
 * Updates a table: style and stripe options, name (structured references follow), header and
 * totals rows (cells are added or cleared like Excel), columns and range.
 */
export function updateTable(ctx: EditContext, s: number, ref: TableRef, patch: TablePatch): void {
	const { workbook } = ctx;
	const sheet = sheetAt(workbook, s);
	const current = sheet.tables[tableIndex(sheet, ref)] as Table;
	const name = patch.name ?? patch.displayName;
	const renaming = name !== undefined && name !== current.name;
	if (renaming) {
		const problem = validateTableName(workbook, name, current);
		if (problem) throw new Error(problem);
	}
	const wide = renaming || patch.headerRow !== undefined || patch.totalsRow !== undefined;
	const scope: EditScope = wide ? { kind: 'workbook' } : { kind: 'sheet', sheet: s };
	const id = current.id;
	ctx.run(
		renaming ? 'Rename table' : 'Table options',
		'structure',
		[scope],
		() => {
			const table = byId(sheet, id);
			if (renaming) renameTableIn(workbook, table, name);
			for (const key of STYLE_KEYS) {
				if (!(key in patch)) continue;
				const value = patch[key];
				if (value === undefined) delete table[key];
				else (table as unknown as Record<string, unknown>)[key] = value;
			}
			if (patch.columns) {
				const width = table.range.end.col - table.range.start.col + 1;
				if (patch.columns.length !== width) throw new Error('Give one column per table column.');
				const before = table.columns;
				table.columns = structuredClone(patch.columns);
				// Replacing properties updates the existing columns, not their source identity.
				for (const [index, column] of table.columns.entries()) {
					const sourceId = before[index]?.sourceId;
					if (column.sourceId === undefined && sourceId !== undefined) column.sourceId = sourceId;
				}
			}
			if (patch.headerRow !== undefined) setHeaderRow(workbook, sheet, id, patch.headerRow);
			if (patch.totalsRow !== undefined) setTotalsRow(workbook, sheet, id, patch.totalsRow);
			else if (patch.columns && table.totalsRow) applyTotalsRow(sheet, byId(sheet, id));
			if (patch.range) resizeTableIn(workbook, sheet, id, patch.range);
		},
		{ sheet: s, ranges: [current.range], structural: true },
	);
}

/** Resizes a table to `range` (Table Design > Resize Table). */
export function resizeTable(ctx: EditContext, s: number, ref: TableRef, range: CellRange): void {
	const sheet = sheetAt(ctx.workbook, s);
	const id = (sheet.tables[tableIndex(sheet, ref)] as Table).id;
	ctx.run(
		'Resize table',
		'structure',
		[{ kind: 'sheet', sheet: s }],
		() => resizeTableIn(ctx.workbook, sheet, id, range),
		{ sheet: s, ranges: [normalizeRange(range)], structural: true },
	);
}

/**
 * Turns a table back into a plain range: its cells stay, structured references to it become
 * absolute A1 references everywhere, and the table (with its auto-filter) goes.
 */
export function convertTableToRange(ctx: EditContext, s: number, ref: TableRef): void {
	const { workbook } = ctx;
	const sheet = sheetAt(workbook, s);
	const table = sheet.tables[tableIndex(sheet, ref)] as Table;
	ctx.run(
		'Convert to range',
		'structure',
		[{ kind: 'workbook' }],
		() => {
			const live = byId(sheet, table.id);
			const base = { table: live, tableSheet: sheet.name };
			const { start, end } = live.range;
			for (const ws of workbook.sheets)
				forEachCell(ws, (cell, row, col) => {
					if (cell.formula === undefined) return;
					const inside =
						ws === sheet &&
						row >= start.row &&
						row <= end.row &&
						col >= start.col &&
						col <= end.col;
					cell.formula = structuredToA1(cell.formula, {
						...base,
						formulaSheet: ws.name,
						row,
						inside,
					});
				});
			rewriteFormulas(workbook, (f, fs) => structuredToA1(f, { ...base, formulaSheet: fs }));
			for (const ws of workbook.sheets)
				for (const t of ws.tables)
					for (const column of t.columns)
						if (t !== live && column.calculatedColumnFormula)
							column.calculatedColumnFormula = structuredToA1(column.calculatedColumnFormula, {
								...base,
								formulaSheet: ws.name,
							});
			sheet.tables = sheet.tables.filter((t) => t.id !== live.id);
		},
		{ sheet: s, ranges: [table.range], structural: true },
	);
}
