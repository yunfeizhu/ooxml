/**
 * One pptx chart series (`PptxChartSeries`) from a neutral series (`ChartSpaceSeries`): the
 * structural fields (name, `c:idx`, value, x and bubble-size caches with their blanks, number
 * format, smoothing, invert-if-negative, explosion, 3-D shape, markers, data points and data
 * labels) come from the neutral model; the styled fields are read from the series' object-tree
 * node by `readSeriesTreeFields`.
 *
 * @module chart-from-neutral-series
 */
import type { ChartSpaceSeries } from '../../../chart/index';
import type { PptxChartSeries, PptxChartType, XmlObject } from '../types';
import {
	dataPointsFromNeutral,
	labelOptionsFromNeutral,
	markerFromNeutral,
	pointLabelsFromNeutral,
} from './chart-from-neutral-labels';
import { neutralNumbersWithBlanks, neutralSeriesName } from './chart-from-neutral-data';
import { readSeriesTreeFields, type ChartTreeReader } from './chart-series-tree-fields';
import { parseBar3DShapeVal } from './chart-subtype-values';

/** Where a series sits: its group, position and the object-tree node holding its styles. */
export interface NeutralSeriesPlace {
	series: ChartSpaceSeries;
	/** The `c:ser` node of the same series in the object tree. */
	node: XmlObject;
	/** Position of the series in its own group. */
	index: number;
	/** The chart-level categories (placeholder values of an empty series count from them). */
	categories: string[];
	/** The group's chart type, tagged on the series only in a combo chart. */
	seriesChartType?: PptxChartType;
	/** The group's own chart type. */
	containerChartType?: PptxChartType;
	/** The group's value axis id. */
	axisId?: number;
}

/** The value source: `c:val`, else `c:yVal` (scatter and bubble). */
function valueSource(series: ChartSpaceSeries) {
	return series.values?.kind ? series.values : (series.yValues ?? series.values);
}

/** Builds one pptx series from the neutral model and its object-tree node. */
export function seriesFromNeutral(
	place: NeutralSeriesPlace,
	reader: ChartTreeReader,
): PptxChartSeries {
	const { series, index, categories, seriesChartType, containerChartType, axisId } = place;
	const tree = readSeriesTreeFields(place.node, containerChartType, reader);
	const source = valueSource(series);
	const expanded = neutralNumbersWithBlanks(source);
	const hasBlanks = expanded.some((value) => value === null);
	const values = expanded.map((value) => value ?? 0);
	// An empty value cache gets placeholder values (1+i, 2+i...), one per category, so an
	// unrendered chart still draws something.
	const fallbackValues = values.length > 0 ? values : categories.map((_, at) => at + 1 + index);
	// The data-label number format when written, else the value cache's (`@sourceLinked`).
	const numberFormat =
		series.dataLabels?.numberFormat?.formatCode.trim() ||
		(source?.kind === 'numRef' ? source.cache?.formatCode?.trim() : undefined) ||
		undefined;
	const xValues = neutralNumbersWithBlanks(series.xValues).map((value) => value ?? Number.NaN);
	const bubbleSizes = neutralNumbersWithBlanks(series.bubbleSizes).map((value) => value ?? 0);
	const dataLabelOptions = labelOptionsFromNeutral(series.dataLabels, tree.dataLabelOptions);
	const marker = markerFromNeutral(series.marker, tree.marker);
	const dataPoints = dataPointsFromNeutral(series.dataPoints, tree.dataPoints);
	const dataLabels = pointLabelsFromNeutral(series.dataLabels, tree.dataLabels);
	const shape =
		containerChartType === 'bar3D' ? parseBar3DShapeVal(series.shape?.trim() ?? '') : undefined;
	const name = neutralSeriesName(series.tx);
	return {
		name: name.trim().length > 0 ? name : `Series ${index + 1}`,
		...(series.index !== undefined ? { idx: series.index } : {}),
		values: fallbackValues,
		...(hasBlanks ? { blanks: expanded.map((value) => value === null) } : {}),
		...(xValues.length > 0 ? { xValues } : {}),
		...(bubbleSizes.length > 0 ? { bubbleSizes } : {}),
		...(dataLabelOptions && Object.keys(dataLabelOptions).length > 0 ? { dataLabelOptions } : {}),
		...(tree.lineNoFill ? { lineNoFill: tree.lineNoFill } : {}),
		...(tree.lineWidth !== undefined ? { lineWidth: tree.lineWidth } : {}),
		...(tree.lineDashStyle ? { lineDashStyle: tree.lineDashStyle } : {}),
		...(numberFormat ? { numberFormat } : {}),
		color: tree.color,
		...(tree.gradientFill ? { gradientFill: tree.gradientFill } : {}),
		...(tree.lineGradientFill ? { lineGradientFill: tree.lineGradientFill } : {}),
		...(tree.trendlines ? { trendlines: tree.trendlines } : {}),
		...(tree.errBars ? { errBars: tree.errBars } : {}),
		...(dataPoints ? { dataPoints } : {}),
		...(marker ? { marker } : {}),
		...(dataLabels ? { dataLabels } : {}),
		...(series.explosion !== undefined ? { explosion: series.explosion } : {}),
		...(tree.picture ? { picture: tree.picture } : {}),
		...(tree.impliedPicture ? { impliedPicture: tree.impliedPicture } : {}),
		...(series.invertIfNegative !== undefined ? { invertIfNegative: series.invertIfNegative } : {}),
		...(series.smooth !== undefined ? { smooth: series.smooth } : {}),
		...(axisId !== undefined ? { axisId } : {}),
		...(seriesChartType ? { seriesChartType } : {}),
		...(shape !== undefined ? { shape } : {}),
		...(tree.uniqueId !== undefined ? { uniqueId: tree.uniqueId } : {}),
	};
}
