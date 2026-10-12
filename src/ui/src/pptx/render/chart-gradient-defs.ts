/**
 * Chart gradient fills (`c:spPr/a:gradFill` on the chart area, plot area and
 * series) as `<linearGradient>` / `<radialGradient>` defs every binding
 * renders from the view model.
 *
 * COM-verified against charts-com.pptx slide 23 (chart style 209): the chart
 * area is a radial dark wash and every bar a top-lit vertical gradient;
 * both used to render flat (no chart area at all, bars in plain palette
 * colours) because only `a:solidFill` was ever read.
 *
 * Gradients use `objectBoundingBox` units, so one def per series paints each
 * of its bars across that bar's own box, as PowerPoint does
 * (`rotWithShape="1"`).
 *
 * @module chart-gradient-defs
 */
import type { PptxChartData } from 'ooxml-core/pptx';
import { buildChartGradientDef as buildGradientDef } from 'ooxml-core/chart';
export { buildGradientDef };

import type { ChartSvgGradientDef } from './chart-svg-def-types';
import type { ChartViewModel, SvgPrimitive } from './chart-view-model-types';

/** The series a line stroke (polyline or smoothed path) belongs to, if it is one. */
function lineSeriesOf(primitive: SvgPrimitive): number | undefined {
	if (primitive.kind !== 'polyline' && primitive.kind !== 'path') return undefined;
	const { part, stroke } = primitive;
	return part?.role === 'series' && stroke !== undefined && stroke !== 'none'
		? part.seriesIndex
		: undefined;
}

/**
 * Extent of a polyline's points or a path's coordinates. Series lines are built
 * from absolute `M`/`L`/`C` pairs, so every number pair is a point; a smoothed
 * line's control points can widen the box slightly, which only stretches the ramp.
 */
function lineBounds(primitives: SvgPrimitive[]) {
	const xs: number[] = [];
	const ys: number[] = [];
	for (const p of primitives) {
		const text = p.kind === 'polyline' ? p.points : p.kind === 'path' ? p.d : '';
		const nums = text.match(/-?\d*\.?\d+(?:e-?\d+)?/giu)?.map(Number) ?? [];
		for (let i = 0; i + 1 < nums.length; i += 2) {
			xs.push(nums[i]);
			ys.push(nums[i + 1]);
		}
	}
	if (xs.length === 0) return undefined;
	return {
		x: Math.min(...xs),
		y: Math.min(...ys),
		w: Math.max(...xs) - Math.min(...xs),
		h: Math.max(...ys) - Math.min(...ys),
	};
}

/**
 * A line series' outline gradient (`a:ln/a:gradFill`) as a user-space def across
 * the drawn line. Bounding-box units would drop the paint on a flat line, whose
 * box has no height. Only linear outline gradients are painted; a path (radial)
 * one keeps the solid series colour.
 */
function lineGradientDef(
	id: string,
	gradient: NonNullable<PptxChartData['series'][number]['lineGradientFill']>,
	lines: SvgPrimitive[],
): ChartSvgGradientDef | undefined {
	const box = lineBounds(lines);
	const def = buildGradientDef(id, gradient);
	if (!box || def.kind !== 'linearGradient') return undefined;
	const at = (fx: number, fy: number) => [box.x + fx * box.w, box.y + fy * box.h];
	const [x1, y1] = at(def.x1, def.y1);
	const [x2, y2] = at(def.x2, def.y2);
	return { ...def, gradientUnits: 'userSpaceOnUse', x1, y1, x2, y2 };
}

function paintSeries(
	primitive: SvgPrimitive,
	seriesFills: ReadonlyMap<number, string>,
	chartData: PptxChartData,
): SvgPrimitive {
	if ((primitive.kind !== 'rect' && primitive.kind !== 'path') || !primitive.part) {
		return primitive;
	}
	const { seriesIndex, pointIndex } = primitive.part;
	const url = seriesFills.get(seriesIndex);
	if (url === undefined) {
		return primitive;
	}
	const overridden =
		pointIndex !== undefined &&
		chartData.series[seriesIndex]?.dataPoints?.some(
			(p) => p.idx === pointIndex && p.spPr?.fillColor !== undefined,
		);
	return overridden ? primitive : { ...primitive, fill: url };
}

/**
 * Point the chart area, plot area and series marks of a finished view model
 * at gradient defs when the chart authors gradient fills.
 */
export function withGradientFills(
	vm: ChartViewModel,
	chartData: PptxChartData,
	elementId: string,
): ChartViewModel {
	const defs: ChartSvgGradientDef[] = [];
	const idFor = (suffix: string) => `${elementId}-grad-${suffix}`.replace(/[^A-Za-z0-9_-]/gu, '_');
	let next = vm;
	const area = chartData.style?.chartAreaGradient;
	if (area) {
		defs.push(buildGradientDef(idFor('area'), area));
		next = { ...next, areaFill: `url(#${idFor('area')})` };
	}
	const plot = chartData.style?.plotAreaGradient;
	if (plot) {
		defs.push(buildGradientDef(idFor('plot'), plot));
		next = { ...next, plotFill: `url(#${idFor('plot')})` };
	}
	const seriesFills = new Map<number, string>();
	chartData.series.forEach((series, si) => {
		if (series.gradientFill) {
			defs.push(buildGradientDef(idFor(`s${si}`), series.gradientFill));
			seriesFills.set(si, `url(#${idFor(`s${si}`)})`);
		}
	});
	const lineStrokes = new Map<number, string>();
	chartData.series.forEach((series, si) => {
		if (!series.lineGradientFill) return;
		const def = lineGradientDef(
			idFor(`line-s${si}`),
			series.lineGradientFill,
			next.primitives.filter((p) => lineSeriesOf(p) === si),
		);
		if (!def) return;
		defs.push(def);
		lineStrokes.set(si, `url(#${def.id})`);
	});
	if (lineStrokes.size > 0) {
		next = {
			...next,
			primitives: next.primitives.map((p) => {
				const si = lineSeriesOf(p);
				const url = si === undefined ? undefined : lineStrokes.get(si);
				return url ? { ...p, stroke: url } : p;
			}),
		};
	}
	if (seriesFills.size > 0) {
		next = {
			...next,
			primitives: next.primitives.map((p) => paintSeries(p, seriesFills, chartData)),
		};
	}
	return defs.length > 0 ? { ...next, defs: [...(next.defs ?? []), ...defs] } : next;
}
