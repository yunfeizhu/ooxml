import type { Cells } from './sheet';

/** XGridDensity / YGridDensity: Fixed, Coarse, Normal and Fine in the Ruler & Grid dialog. */
export const VISIO_GRID_DENSITIES = Object.freeze([0, 2, 4, 8] as const);
/** XRulerDensity / YRulerDensity: Coarse, Normal and Fine subdivisions. */
export const VISIO_RULER_DENSITIES = Object.freeze([8, 16, 32] as const);

/**
 * Line jump, grid and ruler cells of a PageSheet. Lengths are inches.
 * `lineJumpCode`: 0 none, 1 horizontal lines, 2 vertical lines, 3 last routed line, 4 last
 * displayed line, 5 first displayed line. `lineJumpStyle`: 0 arc, 1 gap, 2 square, 3 to 8 are
 * two to seven sides.
 */
export interface VisioPageLayout {
	lineJumpCode: number;
	lineJumpStyle: number;
	gridDensityX: number;
	gridDensityY: number;
	/** Minimum spacing; 0 lets the density choose. With density 0 (Fixed) it is the spacing. */
	gridSpacingX: number;
	gridSpacingY: number;
	gridOriginX: number;
	gridOriginY: number;
	rulerDensityX: number;
	rulerDensityY: number;
	/** Ruler zero point, measured from the page's lower-left corner. */
	rulerOriginX: number;
	rulerOriginY: number;
}

/** What Visio uses for a page that stores none of these cells (recorded from Visio 16). */
export const VISIO_PAGE_LAYOUT_DEFAULTS: Readonly<VisioPageLayout> = Object.freeze({
	lineJumpCode: 1,
	lineJumpStyle: 0,
	gridDensityX: 8,
	gridDensityY: 8,
	gridSpacingX: 0,
	gridSpacingY: 0,
	gridOriginX: 0,
	gridOriginY: 0,
	rulerDensityX: 32,
	rulerDensityY: 32,
	rulerOriginX: 0,
	rulerOriginY: 0,
});

const NAMES: Readonly<Record<keyof VisioPageLayout, string>> = {
	lineJumpCode: 'LineJumpCode',
	lineJumpStyle: 'LineJumpStyle',
	gridDensityX: 'XGridDensity',
	gridDensityY: 'YGridDensity',
	gridSpacingX: 'XGridSpacing',
	gridSpacingY: 'YGridSpacing',
	gridOriginX: 'XGridOrigin',
	gridOriginY: 'YGridOrigin',
	rulerDensityX: 'XRulerDensity',
	rulerDensityY: 'YRulerDensity',
	rulerOriginX: 'XRulerOrigin',
	rulerOriginY: 'YRulerOrigin',
};
const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

/**
 * The cached layout cells a PageSheet stores that differ from nothing: only cells present with a
 * usable cache are returned, so `{ ...VISIO_PAGE_LAYOUT_DEFAULTS, ...page.layout }` is the page's
 * effective layout.
 */
export function readVisioPageLayout(cells: Cells): Partial<VisioPageLayout> | undefined {
	const result: Partial<VisioPageLayout> = {};
	for (const key of Object.keys(NAMES) as (keyof VisioPageLayout)[]) {
		const cell = cells.get(NAMES[key]);
		const raw = cell?.value?.trim();
		if (!cell || cell.error !== undefined || cell.formula === 'Inh' || !raw || raw.length > 64)
			continue;
		if (!NUMBER.test(raw)) continue;
		const value = Number(raw);
		if (Number.isFinite(value) && Math.abs(value) <= 1e6) result[key] = value;
	}
	return Object.keys(result).length ? result : undefined;
}

/** A page's effective layout: its stored cells over Visio's defaults. */
export function visioPageLayout(page: { layout?: Partial<VisioPageLayout> }): VisioPageLayout {
	return { ...VISIO_PAGE_LAYOUT_DEFAULTS, ...page.layout };
}
