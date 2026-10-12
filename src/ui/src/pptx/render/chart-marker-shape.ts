/**
 * chart-marker-shape.ts: framework-agnostic marker-symbol primitive builder for
 * line / scatter / area chart data points.
 *
 * OOXML line/scatter series carry a `c:marker` with a `c:symbol` (circle,
 * diamond, square, triangle, star, x, plus, dot, dash, none, ...) and an
 * optional `c:size` (2-72 points). The base view-model historically drew every
 * data point as a fixed-radius circle, ignoring both. This helper resolves the
 * parsed marker into the correct `SvgPrimitive` at the requested size, and
 * returns `null` for `symbol === 'none'` so no dot is drawn.
 *
 * @module chart-marker-shape
 */

import type { PptxChartMarkerSymbol } from 'ooxml-core/pptx';

import { CHART_PX_PER_PT } from './chart-font';
import type { ChartPartRef, SvgCircle, SvgPath, SvgPolygon, SvgRect } from './chart-view-model';

/** The concrete primitive kinds a marker can resolve to (all support `opacity`). */
export type MarkerPrimitive = SvgCircle | SvgRect | SvgPath | SvgPolygon;

/** Inputs for a single marker primitive. */
export interface MarkerShapeInput {
	/** Parsed marker symbol; `undefined` falls back to the default dot. */
	symbol: PptxChartMarkerSymbol | undefined;
	/** Parsed marker size in points (diameter). `undefined` uses `defaultRadius`. */
	size: number | undefined;
	cx: number;
	cy: number;
	fill: string;
	/** Radius used when no marker size is present (preserves the legacy dot size). */
	defaultRadius: number;
	part?: ChartPartRef;
	/** Outline colour. Without it the marker has no outline. */
	stroke?: string;
	/** Outline width in px. */
	strokeWidth?: number;
}

/** PowerPoint draws a marker outline at 0.75pt when `a:ln` gives a colour but no width. */
const DEFAULT_MARKER_OUTLINE_PT = 0.75;

/**
 * The outline fields of {@link MarkerShapeInput} for a resolved marker, or
 * nothing when the marker has no `a:ln` colour. Widths are authored in points.
 */
export function markerOutline(marker: {
	stroke?: string | undefined;
	strokeWidth?: number | undefined;
}): Pick<MarkerShapeInput, 'stroke' | 'strokeWidth'> {
	if (!marker.stroke) {
		return {};
	}
	return {
		stroke: marker.stroke,
		strokeWidth: (marker.strokeWidth ?? DEFAULT_MARKER_OUTLINE_PT) * CHART_PX_PER_PT,
	};
}

/**
 * PowerPoint's automatic marker-symbol cycle: the fixed shape sequence a
 * "Line/Scatter with Markers" chart cycles through when a series' `c:marker`
 * carries no `c:symbol` (only its fill/line colour is "automatic"; the shape
 * itself was assumed to always be a circle before this was measured).
 *
 * COM-measured ground truth (`PowerPoint.Application`, a stacked
 * Line-with-Markers chart, N series each with `<c:marker><c:spPr>.../></c:marker>`
 * and no `c:symbol`, `SeriesCollection(i).MarkerStyle` read back after a real
 * save/reopen round trip): idx 0..8 resolved to
 * Diamond, Square, Triangle, X, Star, Circle, Plus, Dot, Dash - a clean
 * 9-element cycle with no partial/ambiguous entries across 9 independent
 * series (this is ALSO what the chart-style-driven, explicit-symbol path a
 * modern "Line with Markers" preset writes on save resolves every series to a
 * uniform Circle, so that path is unrelated: this cycle is specifically
 * what PowerPoint's renderer falls back to for a chart with no `c:symbol` at
 * all). Confirmed against a real-world deck: series `c:idx="1"`/`"2"` (a
 * gapped, 1-based pair, not `0`/`1`) resolved to Square/Triangle exactly as
 * this cycle predicts (`AUTOMATIC_MARKER_CYCLE[1]` / `[2]`).
 */
const AUTOMATIC_MARKER_CYCLE: readonly PptxChartMarkerSymbol[] = [
	'diamond',
	'square',
	'triangle',
	'x',
	'star',
	'circle',
	'plus',
	'dot',
	'dash',
];

/**
 * Resolve the automatic marker shape for a series with no authored
 * `c:symbol`, keyed by the series' `c:idx` (or its array position when the
 * chart has none): {@link AUTOMATIC_MARKER_CYCLE} repeats every 9 series.
 */
export function automaticMarkerSymbol(seriesIdx: number): PptxChartMarkerSymbol {
	const length = AUTOMATIC_MARKER_CYCLE.length;
	const normalized = ((seriesIdx % length) + length) % length;
	return AUTOMATIC_MARKER_CYCLE[normalized];
}

/** Resolve the drawn radius (px) from the parsed point size or the default. */
function markerRadius(size: number | undefined, defaultRadius: number): number {
	if (size === undefined || !Number.isFinite(size) || size <= 0) {
		return defaultRadius;
	}
	// OOXML marker size is a point diameter; treat 1pt ~ 1px at chart scale.
	return size / 2;
}

/** Build the SVG points string for a regular/irregular polygon vertex list. */
function polygonPoints(vertices: ReadonlyArray<[number, number]>): string {
	return vertices.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
}

function starVertices(cx: number, cy: number, r: number): Array<[number, number]> {
	const inner = r * 0.5;
	const out: Array<[number, number]> = [];
	for (let i = 0; i < 10; i++) {
		const radius = i % 2 === 0 ? r : inner;
		const angle = -Math.PI / 2 + (Math.PI * i) / 5;
		out.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
	}
	return out;
}

/** Rectangle points for an outlined square or dash marker (`SvgRect` has no stroke). */
function rectPolygon(x: number, y: number, w: number, h: number): string {
	return polygonPoints([
		[x, y],
		[x + w, y],
		[x + w, y + h],
		[x, y + h],
	]);
}

/**
 * Build the marker primitive for one data point, honouring `symbol`, `size`
 * and the outline. Returns `null` when `symbol === 'none'` (draw nothing).
 */
export function buildMarkerPrimitive(input: MarkerShapeInput): MarkerPrimitive | null {
	const { symbol, cx, cy, fill, part } = input;
	if (symbol === 'none') {
		return null;
	}
	const r = markerRadius(input.size, input.defaultRadius);
	const outline = input.stroke
		? {
				stroke: input.stroke,
				strokeWidth: input.strokeWidth ?? DEFAULT_MARKER_OUTLINE_PT * CHART_PX_PER_PT,
			}
		: undefined;
	// Filled polygons are stroked in their own colour at zero width when unoutlined.
	const polygonStroke = outline ?? { stroke: fill, strokeWidth: 0 };
	// The x and plus markers are drawn with a stroke alone.
	const lineStroke = input.stroke ?? fill;

	switch (symbol) {
		case 'square':
		case 'dash': {
			const h = symbol === 'dash' ? r * 0.64 : r * 2;
			const y = cy - h / 2;
			if (outline) {
				return {
					kind: 'polygon',
					points: rectPolygon(cx - r, y, r * 2, h),
					fill,
					...outline,
					part,
				};
			}
			return { kind: 'rect', x: cx - r, y, w: r * 2, h, fill, part };
		}
		case 'diamond':
			return {
				kind: 'polygon',
				points: polygonPoints([
					[cx, cy - r],
					[cx + r, cy],
					[cx, cy + r],
					[cx - r, cy],
				]),
				fill,
				...polygonStroke,
				part,
			};
		case 'triangle':
			return {
				kind: 'polygon',
				points: polygonPoints([
					[cx, cy - r],
					[cx + r * 0.9, cy + r * 0.75],
					[cx - r * 0.9, cy + r * 0.75],
				]),
				fill,
				...polygonStroke,
				part,
			};
		case 'star':
			return {
				kind: 'polygon',
				points: polygonPoints(starVertices(cx, cy, r)),
				fill,
				...polygonStroke,
				part,
			};
		case 'plus':
			return {
				kind: 'path',
				d: `M${(cx - r).toFixed(2)},${cy.toFixed(2)} L${(cx + r).toFixed(2)},${cy.toFixed(2)} M${cx.toFixed(2)},${(cy - r).toFixed(2)} L${cx.toFixed(2)},${(cy + r).toFixed(2)}`,
				fill: 'none',
				stroke: lineStroke,
				strokeWidth: Math.max(1, r * 0.4),
				part,
			};
		case 'x':
			return {
				kind: 'path',
				d: `M${(cx - r).toFixed(2)},${(cy - r).toFixed(2)} L${(cx + r).toFixed(2)},${(cy + r).toFixed(2)} M${(cx + r).toFixed(2)},${(cy - r).toFixed(2)} L${(cx - r).toFixed(2)},${(cy + r).toFixed(2)}`,
				fill: 'none',
				stroke: lineStroke,
				strokeWidth: Math.max(1, r * 0.4),
				part,
			};
		case 'dot':
			return { kind: 'circle', cx, cy, r: Math.max(r * 0.6, 1), fill, part, ...outline };
		default:
			// circle / auto / picture / undefined -> filled circle.
			return { kind: 'circle', cx, cy, r, fill, part, ...outline };
	}
}
