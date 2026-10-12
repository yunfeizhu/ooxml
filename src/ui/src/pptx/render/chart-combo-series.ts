/**
 * chart-combo-series.ts: per-series primitive/label builders for the combo
 * (bar + line) chart, split out of `chart-combo.ts` to keep that file within
 * the repo's ~300-LOC limit.
 *
 * @module chart-combo-series
 */
import type { PptxChartData, PptxChartSeries } from 'ooxml-core/pptx';

import { resolveBlankDisplay, visibleRuns } from './chart-blank-display';
import { pushMarker } from './chart-cartesian-plots';
import type { LabelAnchor } from './chart-data-label-anchor';
import { resolveBarLabelPlacement, resolveMarkerLabelPlacement } from './chart-data-label-anchor';
import {
	buildDataLabelText,
	dataLabelFontOverride,
	resolveDataLabelTextStyle,
} from './chart-data-label-text';
import { DEFAULT_CHART_DATA_LABEL_PX } from './chart-font';
import { seriesLineStroke } from './chart-series-line-style';
import type {
	ChartPartRef,
	PlotLayout,
	SvgCircle,
	SvgPolyline,
	SvgPrimitive,
	SvgText,
	ValueRange,
} from './chart-view-model';
import { seriesColor, valueToY } from './chart-view-model';

/**
 * A combo data label, built like the bar and line builders' labels: text from
 * the `c:dLbls` flags and number format, font from the label `txPr`.
 * `undefined` when the flags leave nothing to show.
 */
export function comboDataLabel(
	chartData: PptxChartData,
	series: PptxChartSeries,
	pointIndex: number,
	value: number,
	anchor: LabelAnchor,
): SvgText | undefined {
	const label = buildDataLabelText({ chartData, series, pointIndex, value });
	if (label === undefined) {
		return undefined;
	}
	return {
		kind: 'text',
		x: anchor.x,
		y: anchor.y,
		text: label.text,
		fontSize: DEFAULT_CHART_DATA_LABEL_PX,
		fill: label.color ?? '#334155',
		textAnchor: anchor.textAnchor,
		...(anchor.dominantBaseline ? { dominantBaseline: anchor.dominantBaseline } : {}),
		...dataLabelFontOverride(resolveDataLabelTextStyle(chartData, series, pointIndex)),
	};
}

/** Bar-series data labels, honouring `c:dLblPos` and any per-point manual drag. */
export function appendBarLabels(
	series: PptxChartSeries,
	chartData: PptxChartData,
	layout: PlotLayout,
	catCount: number,
	range: ValueRange,
	sourceIndices: ReadonlyArray<number>,
	labels: SvgText[],
	xPositions?: ReadonlyArray<number>,
): void {
	if (!chartData.style?.hasDataLabels) {
		return;
	}
	const groupWidth = layout.plotWidth / catCount;
	const barWidth = groupWidth * 0.7;
	const offset = (groupWidth - barWidth) / 2;
	sourceIndices.forEach((sourceIndex, displayIndex) => {
		const value = series.values[sourceIndex] ?? 0;
		const zeroY = valueToY(0, range, layout.plotTop, layout.plotBottom);
		const valueY = valueToY(value, range, layout.plotTop, layout.plotBottom);
		const x =
			xPositions?.[displayIndex] ??
			layout.plotLeft + groupWidth * displayIndex + offset + barWidth / 2;
		const barY = Math.min(zeroY, valueY);
		const barH = Math.max(Math.abs(zeroY - valueY), 1);
		// c:dLblPos (ctr/inBase/inEnd/outEnd) decides where on the bar the label
		// sits; a per-point c:dLbl/c:layout drag shifts it further.
		const anchor = resolveBarLabelPlacement(
			chartData,
			series,
			sourceIndex,
			{ x: x - barWidth / 2, y: barY, width: barWidth, height: barH },
			value,
			'vertical',
			{ width: layout.svgWidth, height: layout.svgHeight },
		);
		const label = comboDataLabel(chartData, series, sourceIndex, value, anchor);
		if (label) {
			labels.push(label);
		}
	});
}

/** One combo line-series' polyline + markers + data labels. */
export function appendLineSeries(
	series: PptxChartSeries,
	seriesIndex: number,
	chartData: PptxChartData,
	layout: PlotLayout,
	range: ValueRange,
	barGroupWidth: number,
	sourceIndices: ReadonlyArray<number>,
	primitives: SvgPrimitive[],
	dataLabels: SvgText[],
	xPositions?: ReadonlyArray<number>,
): void {
	if (series.values.length === 0) {
		return;
	}
	const fill = seriesColor(series, seriesIndex, chartData.colorPalette);
	// Blank points follow c:dispBlanksAs as in buildLines: gap breaks the line,
	// span interpolates, zero (or unset) keeps the placeholder 0.
	const { values, visible } = resolveBlankDisplay(
		sourceIndices.map((sourceIndex) => series.values[sourceIndex] ?? 0),
		sourceIndices.map((sourceIndex) => series.blanks?.[sourceIndex] ?? false),
		chartData.chartChrome?.dispBlanksAs,
	);
	const points = sourceIndices.map((sourceIndex, displayIndex) => {
		const value = values[displayIndex] ?? 0;
		return {
			x:
				xPositions?.[displayIndex] ??
				layout.plotLeft + barGroupWidth * displayIndex + barGroupWidth / 2,
			y: valueToY(value, range, layout.plotTop, layout.plotBottom),
			sourceIndex,
			value,
		};
	});
	const shown = points.filter((_point, displayIndex) => visible[displayIndex]);
	// Same stroke and markers as buildLines.
	if (!series.lineNoFill) {
		const allVisible = visible.every(Boolean);
		for (const run of allVisible
			? [points]
			: visibleRuns(visible).map((indices) => indices.map((index) => points[index]!))) {
			if (!allVisible && run.length < 2) {
				continue;
			}
			primitives.push({
				kind: 'polyline',
				points: run.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' '),
				stroke: fill,
				fill: 'none',
				...seriesLineStroke(chartData, series),
			} satisfies SvgPolyline);
		}
	}
	for (const point of shown) {
		pushMarker(primitives, series, point.sourceIndex, point.x, point.y, fill, 2.5, {
			role: 'dataPoint',
			seriesIndex,
			pointIndex: point.sourceIndex,
		});
	}
	if (!chartData.style?.hasDataLabels) {
		return;
	}
	shown.forEach((point) => {
		// c:dLblPos (t/b/l/r/ctr) decides where round the marker the label sits;
		// a per-point c:dLbl/c:layout drag shifts it further.
		const anchor = resolveMarkerLabelPlacement(
			chartData,
			series,
			point.sourceIndex,
			point,
			{ width: layout.svgWidth, height: layout.svgHeight },
			7,
		);
		const label = comboDataLabel(chartData, series, point.sourceIndex, point.value, anchor);
		if (label) {
			dataLabels.push(label);
		}
	});
}

/**
 * One combo area-series' filled polygon (down to the zero baseline) + outline
 * + markers + data labels, matching PowerPoint's bar+area combo rendering
 * instead of degrading a `c:areaChart` combo member to an unfilled line.
 * Clustered only (no stacking lane exists in a combo chart).
 */
export function appendAreaSeries(
	series: PptxChartSeries,
	seriesIndex: number,
	chartData: PptxChartData,
	layout: PlotLayout,
	range: ValueRange,
	barGroupWidth: number,
	sourceIndices: ReadonlyArray<number>,
	primitives: SvgPrimitive[],
	dataLabels: SvgText[],
	xPositions?: ReadonlyArray<number>,
): void {
	if (series.values.length === 0) {
		return;
	}
	const fill = seriesColor(series, seriesIndex, chartData.colorPalette);
	const baselineY = valueToY(0, range, layout.plotTop, layout.plotBottom);
	const points = sourceIndices.map((sourceIndex, displayIndex) => {
		const value = series.values[sourceIndex] ?? 0;
		return {
			x:
				xPositions?.[displayIndex] ??
				layout.plotLeft + barGroupWidth * displayIndex + barGroupWidth / 2,
			y: valueToY(value, range, layout.plotTop, layout.plotBottom),
			sourceIndex,
			value,
		};
	});
	const firstPt = points[0];
	const lastPt = points[points.length - 1];
	const lineStr = points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
	if (firstPt && lastPt) {
		primitives.push({
			kind: 'polyline',
			points: `${firstPt.x.toFixed(2)},${baselineY.toFixed(2)} ${lineStr} ${lastPt.x.toFixed(2)},${baselineY.toFixed(2)}`,
			stroke: 'none',
			strokeWidth: 0,
			fill,
			opacity: 0.25,
			part: { role: 'series', seriesIndex } as ChartPartRef,
		} satisfies SvgPolyline);
	}
	primitives.push({
		kind: 'polyline',
		points: lineStr,
		stroke: fill,
		strokeWidth: 2,
		fill: 'none',
		part: { role: 'series', seriesIndex } as ChartPartRef,
	} satisfies SvgPolyline);
	primitives.push(
		...points.map(
			(point) =>
				({
					kind: 'circle',
					cx: point.x,
					cy: point.y,
					r: 2.5,
					fill,
					part: { role: 'dataPoint', seriesIndex, pointIndex: point.sourceIndex },
				}) satisfies SvgCircle,
		),
	);
	if (!chartData.style?.hasDataLabels) {
		return;
	}
	points.forEach((point) => {
		const anchor = resolveMarkerLabelPlacement(
			chartData,
			series,
			point.sourceIndex,
			point,
			{ width: layout.svgWidth, height: layout.svgHeight },
			7,
		);
		const label = comboDataLabel(chartData, series, point.sourceIndex, point.value, anchor);
		if (label) {
			dataLabels.push(label);
		}
	});
}
