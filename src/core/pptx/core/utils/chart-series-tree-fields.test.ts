/**
 * Series colour extraction for area-fill vs line-drawn chart families (moved from
 * `PptxHandlerRuntimeChartSeriesColor.test.ts` with the reader it pins).
 *
 * A series' explicit colour lives at `c:ser/c:spPr/a:solidFill` for area-filled types, but LINE
 * (and scatter/radar/stock) series author it on the outline: `c:ser/c:spPr/a:ln/a:solidFill`. The
 * rule is keyed off the series' own group type, always resolved, never off the combo-only
 * `seriesChartType` tag. The full pipeline (plain and combo charts) is pinned in
 * `chart-from-neutral.test.ts`.
 */
import { describe, expect, it } from 'vitest';

import { PptxXmlLookupService } from '../services/PptxXmlLookupService';
import type { XmlObject } from '../types';
import { readSeriesTreeFields, type ChartTreeReader } from './chart-series-tree-fields';

/** Minimal `parseColor`: resolve a solidFill node's `a:srgbClr/@val`. */
function parseColorStub(node: XmlObject | undefined): string | undefined {
	const srgb = node?.['a:srgbClr'] as XmlObject | undefined;
	const val = srgb?.['@_val'];
	return typeof val === 'string' && val.length > 0 ? `#${val}` : undefined;
}

const STUB_READER: ChartTreeReader = {
	xml: new PptxXmlLookupService(),
	parseColor: parseColorStub,
	resolveTypeface: (raw) => raw,
	localName: (key) => key.slice(key.lastIndexOf(':') + 1),
	extractPointValues: () => [],
};

describe('readSeriesTreeFields colour extraction', () => {
	it('reads the direct spPr solidFill (bar/area style)', () => {
		const fields = readSeriesTreeFields(
			{ 'c:spPr': { 'a:solidFill': { 'a:srgbClr': { '@_val': '4472C4' } } } },
			'bar',
			STUB_READER,
		);
		expect(fields.color).toBe('#4472C4');
	});

	it('falls back to the a:ln solidFill for a LINE series', () => {
		const fields = readSeriesTreeFields(
			{
				'c:spPr': {
					'a:ln': { '@_w': '28575', 'a:solidFill': { 'a:srgbClr': { '@_val': 'ED7D31' } } },
				},
			},
			'line',
			STUB_READER,
		);
		expect(fields.color).toBe('#ED7D31');
		expect(fields.lineWidth).toBe(2.25);
	});

	it('does NOT take an outline colour as the fill of a bar series', () => {
		const fields = readSeriesTreeFields(
			{ 'c:spPr': { 'a:ln': { 'a:solidFill': { 'a:srgbClr': { '@_val': 'ED7D31' } } } } },
			'bar',
			STUB_READER,
		);
		expect(fields.color).toBeUndefined();
	});

	it('the direct fill wins over the outline for a line series carrying both', () => {
		const fields = readSeriesTreeFields(
			{
				'c:spPr': {
					'a:solidFill': { 'a:srgbClr': { '@_val': '70AD47' } },
					'a:ln': { 'a:solidFill': { 'a:srgbClr': { '@_val': 'ED7D31' } } },
				},
			},
			'line',
			STUB_READER,
		);
		expect(fields.color).toBe('#70AD47');
	});

	it('leaves the colour undefined for a scatter series whose line is noFill', () => {
		const fields = readSeriesTreeFields(
			{ 'c:spPr': { 'a:ln': { 'a:noFill': {} } } },
			'scatter',
			STUB_READER,
		);
		expect(fields.color).toBeUndefined();
		expect(fields.lineNoFill).toBe(true);
	});

	it('reads a line series outline gradient (a:ln/a:gradFill) as lineGradientFill', () => {
		const codec = {
			extractGradientStops: () => [
				{ color: '#C08FBF', position: 0 },
				{ color: '#800F85', position: 100 },
			],
			extractGradientType: () => 'linear' as const,
			extractGradientAngle: () => 0,
			extractGradientFocalPoint: () => undefined,
		};
		const fields = readSeriesTreeFields(
			{ 'c:spPr': { 'a:ln': { '@_w': '76200', 'a:gradFill': {} } } },
			'line',
			{ ...STUB_READER, colorStyleCodec: codec },
		);
		expect(fields.lineGradientFill).toStrictEqual({
			type: 'linear',
			angle: 0,
			stops: [
				{ color: '#C08FBF', position: 0 },
				{ color: '#800F85', position: 100 },
			],
		});
		expect(fields.gradientFill).toBeUndefined();
		expect(fields.lineWidth).toBe(6);
	});
});
