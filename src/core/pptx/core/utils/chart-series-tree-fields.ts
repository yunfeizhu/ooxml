/**
 * The fields of a pptx chart series that the neutral chart model does not carry, read from the
 * series' `fast-xml-parser` node (`c:ser`): colours resolved through the deck theme and the
 * chart's `c:clrMapOvr`, gradients, line width and dash, trendlines, error bars, picture fills,
 * the c16 identity, and the styled halves of markers, data points and data labels (docs/
 * agnostic-core-plan.md, step 5, model gap table). `chart-from-neutral-series.ts` fills the
 * structural fields of the same objects from the neutral model.
 *
 * @module chart-series-tree-fields
 */
import { EMU_PER_POINT } from '../../../units/index';
import type { IPptxXmlLookupService } from '../services/PptxXmlLookupService';
import type { PptxChartSeries, PptxChartType, XmlObject } from '../types';
import { parseSeriesErrBars, parseSeriesTrendlines } from './chart-advanced-parser';
import { isLineDrawnChartType } from './chart-container-type-map';
import { parseChartDataLabelOptions, parseSeriesDataLabels } from './chart-data-label-parser';
import {
	parseChartDataPointPicture,
	parseImplicitBlipPictureFill,
} from './chart-datapoint-picture';
import {
	parseChartGradientFill,
	seriesGradientFill,
	type ChartGradientCodec,
} from './chart-gradient-fill';
import { parseMarker, parseSeriesDataPoints } from './chart-series-detail-parser';
import { parseChartUniqueId } from './chart-series-identity';

/** What the object-tree half of the chart adapter reads with: the runtime's services. */
export interface ChartTreeReader {
	xml: IPptxXmlLookupService;
	/** Resolves a colour node through the theme and the chart's colour map override. */
	parseColor: (node: XmlObject | undefined, placeholder?: string) => string | undefined;
	/** Resolves a theme typeface token (`+mn-lt`) to the deck's face. */
	resolveTypeface: (raw: string) => string;
	localName: (key: string) => string;
	colorStyleCodec?: ChartGradientCodec;
	/** The dense cached point texts of a data source node (error-bar custom values). */
	extractPointValues: (node: XmlObject | undefined, preferNumeric: boolean) => string[];
}

/** The series fields read from the object tree; the structural ones come from the neutral model. */
export type SeriesTreeFields = Pick<
	PptxChartSeries,
	| 'color'
	| 'gradientFill'
	| 'lineGradientFill'
	| 'trendlines'
	| 'errBars'
	| 'dataPoints'
	| 'marker'
	| 'dataLabels'
	| 'dataLabelOptions'
	| 'picture'
	| 'impliedPicture'
	| 'lineNoFill'
	| 'lineWidth'
	| 'lineDashStyle'
	| 'uniqueId'
>;

/**
 * Reads the object-tree fields of one series. `containerChartType` is the series' own group type:
 * line-drawn series (line, scatter, radar, stock) author their colour on the outline.
 */
export function readSeriesTreeFields(
	seriesNode: XmlObject,
	containerChartType: PptxChartType | undefined,
	reader: ChartTreeReader,
): SeriesTreeFields {
	const { xml } = reader;
	const colorAdapter = { parseColor: reader.parseColor };
	const spPr = xml.getChildByLocalName(seriesNode, 'spPr');
	const line = xml.getChildByLocalName(spPr, 'ln');
	const color =
		reader.parseColor(xml.getChildByLocalName(spPr, 'solidFill')) ??
		(isLineDrawnChartType(containerChartType)
			? reader.parseColor(xml.getChildByLocalName(line, 'solidFill'))
			: undefined);
	const codec = reader.colorStyleCodec;
	const trendlines = parseSeriesTrendlines(seriesNode, xml, colorAdapter);
	const errBars = parseSeriesErrBars(seriesNode, xml, reader.extractPointValues, colorAdapter);
	const dataPoints = parseSeriesDataPoints(
		seriesNode,
		xml,
		colorAdapter,
		codec ? (node) => parseChartGradientFill(node, xml, codec) : undefined,
	);
	const marker = parseMarker(xml.getChildByLocalName(seriesNode, 'marker'), xml, colorAdapter);
	const dataLabels = parseSeriesDataLabels(seriesNode, xml, colorAdapter, reader.resolveTypeface);
	const labelGroup = xml.getChildByLocalName(seriesNode, 'dLbls');
	const dataLabelOptions = labelGroup
		? parseChartDataLabelOptions(labelGroup, xml, colorAdapter, reader.resolveTypeface)
		: undefined;
	const picture = parseChartDataPointPicture(seriesNode, xml);
	const impliedPicture = picture ? undefined : parseImplicitBlipPictureFill(seriesNode, xml);
	const lineNoFill = line
		? Object.keys(line).some((key) => reader.localName(key) === 'noFill')
		: false;
	const lineWidthEmu = Number(line?.['@_w']);
	const lineWidth =
		Number.isFinite(lineWidthEmu) && lineWidthEmu > 0 ? lineWidthEmu / EMU_PER_POINT : undefined;
	const dash = xml.getChildByLocalName(line, 'prstDash')?.['@_val'];
	const uniqueId = parseChartUniqueId(seriesNode, reader.localName);
	const lineGradientFill =
		codec && isLineDrawnChartType(containerChartType)
			? parseChartGradientFill(line, xml, codec)
			: undefined;
	return {
		color,
		...(codec ? seriesGradientFill(spPr, xml, codec) : {}),
		...(lineGradientFill ? { lineGradientFill } : {}),
		...(trendlines.length > 0 ? { trendlines } : {}),
		...(errBars.length > 0 ? { errBars } : {}),
		...(dataPoints.length > 0 ? { dataPoints } : {}),
		...(marker ? { marker } : {}),
		...(dataLabels.length > 0 ? { dataLabels } : {}),
		...(dataLabelOptions ? { dataLabelOptions } : {}),
		...(picture ? { picture } : {}),
		...(impliedPicture ? { impliedPicture } : {}),
		...(lineNoFill ? { lineNoFill } : {}),
		...(lineWidth !== undefined ? { lineWidth } : {}),
		...(typeof dash === 'string' && dash.length > 0 ? { lineDashStyle: dash } : {}),
		...(uniqueId !== undefined ? { uniqueId } : {}),
	};
}
