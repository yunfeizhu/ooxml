import type { VisioDocument, VisioShape } from '../model';

/** Review > Shape Reports: one row per shape, group members after their group. */
export interface VisioShapeReportRow {
	page: string;
	pageId: string;
	id: string;
	name: string;
	type: string;
	/** Master ID (`masters.xml` Master ID); empty for local shapes. */
	master: string;
	/** Physical inches; position is the pin in the parent's coordinates. */
	width: number;
	height: number;
	x: number;
	y: number;
	text: string;
	/** Shape Data label (or name) to cached value. */
	data: Record<string, string>;
}
export interface VisioShapeReport {
	columns: string[];
	rows: VisioShapeReportRow[];
	/** True when the row limit stopped the report early. */
	truncated: boolean;
}
const TYPES: Record<VisioShape['kind'], string> = {
	shape: 'Shape',
	group: 'Group',
	connector: '1-D shape',
	foreign: 'Picture/object',
};
const round = (value: number) => Math.round(value * 10_000) / 10_000;
const BASE_COLUMNS = [
	'Page',
	'ID',
	'Name',
	'Type',
	'Master',
	'Width (in)',
	'Height (in)',
	'Pin X (in)',
	'Pin Y (in)',
	'Text',
];

/** Shapes of the page at `pageIndex`, or of every foreground page when it is absent. */
export function visioShapeReport(
	document: VisioDocument,
	options: { pageIndex?: number; maxRows?: number } = {},
): VisioShapeReport {
	const limit = options.maxRows ?? 25_000;
	const rows: VisioShapeReportRow[] = [];
	const keys = new Set<string>();
	let truncated = false;
	const pages =
		options.pageIndex === undefined
			? document.pages.filter((page) => !page.isBackground)
			: document.pages.slice(options.pageIndex, options.pageIndex + 1);
	for (const page of pages) {
		const visit = (shapes: readonly VisioShape[]) => {
			for (const shape of shapes) {
				if (rows.length >= limit) {
					truncated = true;
					return;
				}
				const [a, b, c, d, e, f] = shape.transform;
				const cx = shape.width / 2,
					cy = shape.height / 2;
				const data: Record<string, string> = {};
				for (const field of shape.shapeData ?? []) {
					if (field.invisible) continue;
					const key = field.label || field.name || field.id;
					keys.add(key);
					data[key] = field.rawValue ?? (field.value === undefined ? '' : String(field.value));
				}
				rows.push({
					page: page.name,
					pageId: page.id,
					id: shape.id,
					name: shape.name,
					type: TYPES[shape.kind],
					master: shape.masterId ?? '',
					width: round(shape.width),
					height: round(shape.height),
					x: round(shape.rotation?.pinX ?? a * cx + c * cy + e),
					y: round(shape.rotation?.pinY ?? b * cx + d * cy + f),
					text: shape.text.plainText,
					data,
				});
				visit(shape.children);
			}
		};
		visit(page.shapes);
	}
	return { columns: [...BASE_COLUMNS, ...keys], rows, truncated };
}

/** The report's cells as text, in `columns` order. */
export function visioShapeReportTable(report: VisioShapeReport): string[][] {
	const fixed = BASE_COLUMNS.length;
	return report.rows.map((row) => [
		row.page,
		row.id,
		row.name,
		row.type,
		row.master,
		String(row.width),
		String(row.height),
		String(row.x),
		String(row.y),
		row.text,
		...report.columns.slice(fixed).map((key) => row.data[key] ?? ''),
	]);
}

const field = (value: string) => {
	// A leading formula character is neutralised so spreadsheets never evaluate document text.
	const number = /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(value);
	const safe = !number && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
	return /[",\r\n']/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** RFC 4180 CSV with CRLF line ends. */
export function visioShapeReportCsv(report: VisioShapeReport): string {
	return [report.columns, ...visioShapeReportTable(report)]
		.map((cells) => cells.map(field).join(','))
		.join('\r\n');
}

/** Tab-separated text for the clipboard (tabs and line breaks inside cells become spaces). */
export function visioShapeReportText(report: VisioShapeReport): string {
	return [report.columns, ...visioShapeReportTable(report)]
		.map((cells) => cells.map((cell) => cell.replace(/[\t\r\n]+/g, ' ')).join('\t'))
		.join('\n');
}
