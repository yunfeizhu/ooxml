import type { VisioEdit } from '../edit-commands';
import type { VisioPage } from '../model';
import { visioPageLayout, type VisioPageLayout } from '../page-layout';

/** The Ruler & Grid dialog's choices, in Visio's order. */
export const VISIO_GRID_DENSITY_CHOICES = Object.freeze([
	{ value: 8, label: 'Fine' },
	{ value: 4, label: 'Normal' },
	{ value: 2, label: 'Coarse' },
	{ value: 0, label: 'Fixed' },
] as const);
export const VISIO_RULER_DENSITY_CHOICES = Object.freeze([
	{ value: 32, label: 'Fine' },
	{ value: 16, label: 'Normal' },
	{ value: 8, label: 'Coarse' },
] as const);

/** Grid lines of a page at a zoom: the step and one line's position, per axis, in page inches. */
export interface VisioGridSteps {
	x: number;
	y: number;
	originX: number;
	originY: number;
}

/**
 * One axis of Visio's grid. A variable grid (Fine, Normal, Coarse) halves its step each time the
 * zoom doubles, so lines keep about the same distance on screen, and never goes below the
 * minimum spacing; a Fixed grid is the spacing itself. The steps at 100% (1/4, 1/2 and 1 inch)
 * are read off Visio's window, not from its documentation.
 */
function step(density: number, spacing: number, zoom: number): number {
	const base = density === 2 ? 1 : density === 4 ? 0.5 : 0.25;
	if (density === 0 && spacing > 0) return spacing;
	const level = Math.max(-6, Math.min(6, Math.floor(Math.log2(zoom > 0 ? zoom : 1) + 1e-9)));
	let value = base / 2 ** level;
	if (spacing > 0) {
		while (value < spacing - 1e-9) value *= 2;
	}
	return value;
}

export function visioGridSteps(
	page: { layout?: Partial<VisioPageLayout> },
	zoom = 1,
): VisioGridSteps {
	const layout = visioPageLayout(page);
	return {
		x: step(layout.gridDensityX, layout.gridSpacingX, zoom),
		y: step(layout.gridDensityY, layout.gridSpacingY, zoom),
		originX: layout.gridOriginX,
		originY: layout.gridOriginY,
	};
}

/** Share of the ruler's finest subdivisions a density shows: Fine all, Normal half, Coarse a quarter. */
export function visioRulerDensityFactor(density: number): number {
	return density === 8 ? 0.25 : density === 16 ? 0.5 : 1;
}

/** The Ruler & Grid dialog's fields. */
export type VisioRulerGridValues = Pick<
	VisioPageLayout,
	| 'rulerDensityX'
	| 'rulerDensityY'
	| 'rulerOriginX'
	| 'rulerOriginY'
	| 'gridDensityX'
	| 'gridDensityY'
	| 'gridSpacingX'
	| 'gridSpacingY'
	| 'gridOriginX'
	| 'gridOriginY'
>;
const FIELDS: readonly (keyof VisioRulerGridValues)[] = [
	'rulerDensityX',
	'rulerDensityY',
	'rulerOriginX',
	'rulerOriginY',
	'gridDensityX',
	'gridDensityY',
	'gridSpacingX',
	'gridSpacingY',
	'gridOriginX',
	'gridOriginY',
];

export function visioRulerGridValues(page: VisioPage): VisioRulerGridValues {
	const layout = visioPageLayout(page);
	return Object.fromEntries(FIELDS.map((key) => [key, layout[key]])) as VisioRulerGridValues;
}

/** One `set-page-layout` edit with the fields that differ from the page; empty when none do. */
export function visioRulerGridEdits(page: VisioPage, values: VisioRulerGridValues): VisioEdit[] {
	const current = visioRulerGridValues(page);
	const changed = FIELDS.filter((key) => Math.abs(values[key] - current[key]) > 1e-9);
	if (!changed.length) return [];
	return [
		{
			type: 'set-page-layout',
			pageId: page.id,
			...Object.fromEntries(changed.map((key) => [key, values[key]])),
		},
	];
}
