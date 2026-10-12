import type { VisioPage, VisioShape } from '../model';

/** Hidden Shape Data row that marks a shape this viewer created as a data graphic part. */
export const VISIO_DATA_GRAPHIC_ROW = '_ooxmlDataGraphic';
/** Hidden row on a coloured shape holding its fill before Color by Value. */
export const VISIO_DATA_GRAPHIC_FILL_ROW = '_ooxmlDataGraphicFill';
export type VisioDataGraphicKind = 'text' | 'bar' | 'icon' | 'color';
export interface VisioDataGraphicOptions {
	kind: VisioDataGraphicKind;
	/** Shape Data row name the graphic reads. */
	field: string;
	/** Data bar and icon set range; defaults to the values' minimum and maximum. */
	min?: number;
	max?: number;
}
/** One Color by Value entry, as the legend lists it. */
export interface VisioColorRule {
	label: string;
	color: string;
}
const PALETTE = [
	'#5b9bd5',
	'#ed7d31',
	'#a5a5a5',
	'#ffc000',
	'#4472c4',
	'#70ad47',
	'#9e480e',
	'#7030a0',
];
const RANGES = ['#deebf7', '#9dc3e6', '#2e75b6'];
export const VISIO_DATA_GRAPHIC_ICONS = { low: '#e81123', mid: '#ffb900', high: '#107c10' };

export const visioShapeDataRow = (shape: VisioShape, name: string) =>
	shape.shapeData?.find((row) => row.name.toLowerCase() === name.toLowerCase());
export const visioDataGraphicMarker = (row: VisioShape) =>
	visioShapeDataRow(row, VISIO_DATA_GRAPHIC_ROW);
/** The display text of a Shape Data value: dates as yyyy-mm-dd, Booleans as TRUE/FALSE. */
export function visioShapeDataText(shape: VisioShape, name: string): string | undefined {
	const row = visioShapeDataRow(shape, name);
	if (!row || row.value === undefined) return row?.rawValue;
	if (row.valueKind === 'date' && typeof row.value === 'number')
		return new Date(Date.UTC(1899, 11, 30) + row.value * 86_400_000).toISOString().slice(0, 10);
	if (typeof row.value === 'boolean') return row.value ? 'TRUE' : 'FALSE';
	return String(row.value);
}
export const visioShapeDataNumber = (shape: VisioShape, name: string): number | undefined => {
	const row = visioShapeDataRow(shape, name);
	if (typeof row?.value === 'number') return row.value;
	if (typeof row?.value === 'boolean') return row.value ? 1 : 0;
	const value = Number(row?.value);
	return row?.value !== undefined && row.value !== '' && Number.isFinite(value) ? value : undefined;
};
/** Shape Data fields on the page's top-level shapes, by row name, with their labels. */
export function visioDataGraphicFields(page: VisioPage): { name: string; label: string }[] {
	const fields = new Map<string, string>();
	for (const shape of page.shapes)
		for (const row of shape.shapeData ?? [])
			if (!row.invisible && !fields.has(row.name)) fields.set(row.name, row.label || row.name);
	return [...fields].map(([name, label]) => ({ name, label }));
}
/** Graphic parts (marked shapes) on the page, by owner shape ID. */
export function visioDataGraphicParts(
	page: VisioPage,
): Map<string, { id: string; kind: string }[]> {
	const parts = new Map<string, { id: string; kind: string }[]>();
	for (const shape of page.shapes) {
		const row = visioDataGraphicMarker(shape);
		if (!row) continue;
		const owner = String(row.value ?? row.rawValue ?? '');
		parts.set(owner, [...(parts.get(owner) ?? []), { id: shape.id, kind: row.label ?? '' }]);
	}
	return parts;
}
/** Color by Value rules: three equal ranges for numbers, one colour per category otherwise. */
export function visioColorRules(
	page: VisioPage,
	shapeIds: readonly string[],
	name: string,
): {
	rules: VisioColorRule[];
	color(shape: VisioShape): string | undefined;
} {
	const shapes = page.shapes.filter((shape) => shapeIds.includes(shape.id));
	const numbers = shapes.map((shape) => visioShapeDataNumber(shape, name));
	if (numbers.every((value) => value !== undefined) && numbers.length) {
		const min = Math.min(...(numbers as number[])),
			max = Math.max(...(numbers as number[]));
		// One value (or all equal) is one rule, not three made-up ranges.
		if (max === min)
			return {
				rules: [{ color: RANGES[2]!, label: String(+min.toPrecision(4)) }],
				color: (shape) => (visioShapeDataNumber(shape, name) === undefined ? undefined : RANGES[2]),
			};
		const step = (max - min) / 3;
		const round = (value: number) => +value.toPrecision(4);
		const rules = RANGES.map((color, index) => ({
			color,
			label: `${round(min + step * index)} - ${round(index === 2 ? max : min + step * (index + 1))}`,
		}));
		return {
			rules,
			color: (shape) => {
				const value = visioShapeDataNumber(shape, name);
				if (value === undefined) return undefined;
				return RANGES[Math.min(2, Math.floor((value - min) / step))];
			},
		};
	}
	const categories = [...new Set(shapes.map((shape) => visioShapeDataText(shape, name) ?? ''))]
		.filter(Boolean)
		.sort((a, b) => a.localeCompare(b));
	const rules = categories.map((label, index) => ({
		label,
		color: PALETTE[index % PALETTE.length]!,
	}));
	return {
		rules,
		color: (shape) => rules.find((rule) => rule.label === visioShapeDataText(shape, name))?.color,
	};
}
