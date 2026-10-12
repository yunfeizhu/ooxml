import type { Workbook } from '../../xlsx/model';
import { isDateFormat } from '../../xlsx/numfmt/index';
import { VISIO_DATA_LIMITS, type VisioDataColumn, type VisioDataColumnType } from '../index';

/** A table ready for the import-data-recordset edit: typed columns and canonical row text. */
export interface VisioDataTable {
	columns: VisioDataColumn[];
	rows: string[][];
}
export type VisioDataCell = string | number | boolean | null | { date: string };

export interface VisioDataTableOptions {
	/** The first row holds the column names (Custom Import's "first row contains headers"). */
	header?: boolean;
	/** Zero-based inclusive range; omitted means the used range. */
	range?: { top: number; left: number; bottom: number; right: number };
}

const DAY = 86_400_000;
/** Excel serial days to ISO date text (1900 system with its leap-year bug, or 1904). */
export function excelSerialToIso(serial: number, date1904 = false): string {
	const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
	const days = !date1904 && serial < 60 ? serial + 1 : serial;
	return new Date(epoch + Math.round(days * DAY)).toISOString().slice(0, 19);
}
const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/;
const text = (value: string) =>
	value
		.replace(/[\r\n\t]+/g, ' ')
		.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '')
		.slice(0, VISIO_DATA_LIMITS.maxValueCharacters);

function cellText(cell: VisioDataCell): { text: string; raw?: string; type?: VisioDataColumnType } {
	if (cell === null || cell === undefined) return { text: '' };
	if (typeof cell === 'object') return { text: cell.date, type: 'date' };
	if (typeof cell === 'number')
		return Number.isFinite(cell) ? { text: String(cell), type: 'number' } : { text: '' };
	if (typeof cell === 'boolean') return { text: cell ? 'TRUE' : 'FALSE', type: 'boolean' };
	const value = text(cell).trim() === '' ? '' : text(cell);
	if (!value) return { text: '' };
	if (NUMBER.test(value.trim()) && Number.isFinite(Number(value)))
		return { text: String(Number(value)), type: 'number' };
	if (/^(true|false)$/i.test(value.trim()))
		return { text: value.trim().toUpperCase(), type: 'boolean' };
	const date = DATE.exec(value.trim());
	if (date) {
		const time = Date.UTC(
			+date[1]!,
			+date[2]! - 1,
			+date[3]!,
			+(date[4] ?? 0),
			+(date[5] ?? 0),
			+(date[6] ?? 0),
		);
		if (Number.isFinite(time) && new Date(time).getUTCDate() === +date[3]!)
			return { text: new Date(time).toISOString().slice(0, 19), type: 'date' };
	}
	return { text: value, type: 'string' };
}
const typed = (cell: VisioDataCell) => {
	const result = cellText(cell);
	return typeof cell === 'string' ? { ...result, raw: text(cell).trim() } : result;
};

/**
 * Turn a grid of cells into recordset columns and rows. A column keeps a non-string type only
 * when every non-empty value has it; otherwise its values stay as text.
 */
export function visioDataTable(
	grid: readonly (readonly VisioDataCell[])[],
	options: VisioDataTableOptions = {},
): VisioDataTable {
	const header = options.header ?? true;
	const width = Math.min(
		VISIO_DATA_LIMITS.maxColumns,
		Math.max(0, ...grid.map((row) => row.length)),
	);
	if (!width) throw new Error('The selected data has no columns.');
	const names = header ? (grid[0] ?? []) : [];
	const body = grid.slice(header ? 1 : 0, (header ? 1 : 0) + VISIO_DATA_LIMITS.maxRows);
	const parsed = body.map((row) =>
		Array.from({ length: width }, (_, index) => typed(row[index] ?? null)),
	);
	const used = new Set<string>();
	const columns: VisioDataColumn[] = Array.from({ length: width }, (_, index) => {
		let base =
			cellText(names[index] ?? null)
				.text.trim()
				.slice(0, 200) || `Column${index + 1}`;
		let name = base;
		for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} (${n})`;
		used.add(name.toLowerCase());
		const types = new Set(
			parsed.map((row) => row[index]!.type).filter((type) => type !== undefined),
		);
		const type: VisioDataColumnType = types.size === 1 ? [...types][0]! : 'string';
		base = name;
		return { name, label: base, type };
	});
	const rows = parsed
		.filter((row) => row.some((cell) => cell.text !== ''))
		.map((row) =>
			// A text column keeps what the user typed, not canonical number or date text.
			row.map((cell, index) =>
				columns[index]!.type === 'string' ? (cell.raw ?? cell.text) : cell.text,
			),
		);
	return { columns, rows };
}

/** Read a worksheet's cells (dates by number format) for {@link visioDataTable}. */
export function visioWorkbookGrid(
	workbook: Workbook,
	sheetIndex = 0,
	range?: VisioDataTableOptions['range'],
): VisioDataCell[][] {
	const sheet = workbook.sheets[sheetIndex];
	if (!sheet) throw new Error('The workbook has no such sheet.');
	let bottom = -1,
		right = -1;
	for (const [row, cells] of sheet.rows)
		for (const [column, cell] of cells)
			if (cell.value !== null && cell.value !== '') {
				bottom = Math.max(bottom, row);
				right = Math.max(right, column);
			}
	const area = range ?? { top: 0, left: 0, bottom, right };
	const last = Math.min(area.bottom, area.top + VISIO_DATA_LIMITS.maxRows);
	const grid: VisioDataCell[][] = [];
	for (let row = area.top; row <= last; row++) {
		const cells = sheet.rows.get(row);
		const values: VisioDataCell[] = [];
		for (
			let column = area.left;
			column <= Math.min(area.right, area.left + VISIO_DATA_LIMITS.maxColumns - 1);
			column++
		) {
			const cell = cells?.get(column);
			const value = cell?.value ?? null;
			if (value !== null && typeof value === 'object') values.push(`#${value.error}`);
			else if (
				typeof value === 'number' &&
				isDateFormat(workbook.styles[cell?.styleId ?? 0]?.numFmt ?? 'General')
			)
				values.push({ date: excelSerialToIso(value, workbook.date1904) });
			else values.push(value);
		}
		grid.push(values);
	}
	return grid;
}

/** Parse an A1-style range such as `A1:D20` (zero-based inclusive bounds). */
export function visioParseRange(value: string): VisioDataTableOptions['range'] | undefined {
	const match = /^\s*([A-Z]{1,3})(\d{1,7})\s*:\s*([A-Z]{1,3})(\d{1,7})\s*$/i.exec(value);
	if (!match) return undefined;
	const column = (letters: string) =>
		[...letters.toUpperCase()].reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
	const [a, b] = [column(match[1]!), column(match[3]!)];
	const [c, d] = [Number(match[2]) - 1, Number(match[4]) - 1];
	if (c < 0 || d < 0) return undefined;
	return {
		top: Math.min(c, d),
		bottom: Math.max(c, d),
		left: Math.min(a, b),
		right: Math.max(a, b),
	};
}
