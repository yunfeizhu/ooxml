/**
 * Combo charts follow c:gapWidth, label txPr, the series a:ln and marker outlines.
 */
import type { PptxChartData } from 'ooxml-core/pptx';
import { describe, expect, it } from 'vitest';

import { buildComboViewModel } from './chart-combo-stock';
import { CHART_PX_PER_PT } from './chart-font';
import type { SvgCircle, SvgPolyline, SvgRect } from './chart-view-model';
import { buildDashArray } from './connector-dash';

const CATEGORIES = ['2002', '2003', '2004', '2022'];
const element = { id: 'el', type: 'chart' as const, x: 0, y: 0, width: 400, height: 300 };

function comboData(overrides: Partial<PptxChartData> = {}): PptxChartData {
	return {
		chartType: 'combo',
		categories: CATEGORIES,
		barGapWidth: 220,
		barOverlap: 0,
		style: { hasDataLabels: true },
		series: [
			{
				name: 'Shares retired (m)',
				values: [2.8, 1.8, 1.8, 2.6],
				seriesChartType: 'bar',
				color: '#CDDCE5',
				dataLabelOptions: {
					showValue: true,
					txPr: { fontSize: 6, color: '#6692AE', fontFamily: 'Pretendard' },
				},
			},
			{
				name: 'Share of total (%)',
				values: [3, 2, 2, 3],
				seriesChartType: 'line',
				color: '#05507D',
				lineWidth: 1,
				lineDashStyle: 'sysDot',
				marker: {
					symbol: 'circle',
					size: 5,
					spPr: { fillColor: '#FFFFFF', strokeColor: '#05507D', strokeWidth: 1 },
				},
				dataLabelOptions: { showValue: true, txPr: { fontSize: 6, color: '#05507D' } },
			},
		],
		...overrides,
	};
}

function dataPointRects(primitives: ReadonlyArray<{ kind: string }>): SvgRect[] {
	return primitives.filter(
		(p): p is SvgRect => p.kind === 'rect' && (p as SvgRect).part?.role === 'dataPoint',
	);
}

describe('buildComboViewModel series formatting', () => {
	it('sizes the bars from c:gapWidth like a plain bar chart', () => {
		const bars = dataPointRects(buildComboViewModel(element, comboData(), CATEGORIES).primitives);
		expect(bars).toHaveLength(4);
		// A gap of 220% of a bar width leaves each bar 1 / 3.2 of the slot.
		expect(bars[0].w / (bars[1].x - bars[0].x)).toBeCloseTo(1 / 3.2);
	});

	it('draws data labels with their txPr size, colour and font', () => {
		const vm = buildComboViewModel(element, comboData(), CATEGORIES);
		const barLabel = vm.dataLabels.find((l) => l.text === '2.8');
		const lineLabel = vm.dataLabels.find((l) => l.text === '3');
		expect(barLabel).toMatchObject({
			fontSize: 6 * CHART_PX_PER_PT,
			fill: '#6692AE',
		});
		// The named face can be followed by the chart font fallback list.
		expect(barLabel?.fontFamily).toMatch(/^"?Pretendard"?(?:,|$)/u);
		expect(lineLabel).toMatchObject({ fontSize: 6 * CHART_PX_PER_PT, fill: '#05507D' });
	});

	it('strokes the line with its own width and dash and outlines the markers', () => {
		const vm = buildComboViewModel(element, comboData(), CATEGORIES);
		const px = CHART_PX_PER_PT;
		const line = vm.primitives.find((p): p is SvgPolyline => p.kind === 'polyline');
		expect(line).toMatchObject({ strokeWidth: px, dashArray: buildDashArray('sysDot', px) });
		const markers = vm.primitives.filter(
			(p): p is SvgCircle => p.kind === 'circle' && p.part?.seriesIndex === 1,
		);
		expect(markers).toHaveLength(4);
		expect(markers[0]).toMatchObject({ fill: '#FFFFFF', stroke: '#05507D', strokeWidth: px });
	});

	it('leaves the line out for a markers-only series', () => {
		const data = comboData();
		data.series[1] = { ...data.series[1], lineNoFill: true };
		const vm = buildComboViewModel(element, data, CATEGORIES);
		expect(vm.primitives.some((p) => p.kind === 'polyline')).toBeFalsy();
		expect(vm.primitives.filter((p) => p.kind === 'circle')).toHaveLength(4);
	});

	it('breaks the line at a blank point when c:dispBlanksAs is gap', () => {
		const data = comboData({ chartChrome: { dispBlanksAs: 'gap' } });
		data.series[1] = {
			...data.series[1],
			values: [3, 2, 0, 3],
			blanks: [false, false, true, false],
		};
		const vm = buildComboViewModel(element, data, CATEGORIES);
		const lines = vm.primitives.filter((p): p is SvgPolyline => p.kind === 'polyline');
		// The run after the blank has a single point, so only the first run is stroked.
		expect(lines).toHaveLength(1);
		expect(lines[0].points.split(' ')).toHaveLength(2);
		const markers = vm.primitives.filter(
			(p): p is SvgCircle => p.kind === 'circle' && p.part?.seriesIndex === 1,
		);
		expect(markers.map((m) => m.part?.pointIndex)).toEqual([0, 1, 3]);
		expect(vm.dataLabels.filter((l) => l.fill === '#05507D')).toHaveLength(3);
	});

	it('keeps drawing a blank point at zero when c:dispBlanksAs is zero', () => {
		const data = comboData({ chartChrome: { dispBlanksAs: 'zero' } });
		data.series[1] = {
			...data.series[1],
			values: [3, 2, 0, 3],
			blanks: [false, false, true, false],
		};
		const vm = buildComboViewModel(element, data, CATEGORIES);
		const line = vm.primitives.find((p): p is SvgPolyline => p.kind === 'polyline');
		expect(line?.points.split(' ')).toHaveLength(4);
	});

	it('gives a marker with no c:symbol the automatic shape for its series', () => {
		const data = comboData();
		const { symbol: _symbol, ...marker } = data.series[1].marker ?? {};
		data.series[1] = { ...data.series[1], marker };
		const vm = buildComboViewModel(element, data, CATEGORIES);
		const markers = vm.primitives.filter(
			(p) => p.kind !== 'polyline' && p.kind !== 'text' && (p as SvgRect).part?.seriesIndex === 1,
		);
		// The second series takes the second shape of the cycle, a square.
		expect(markers).toHaveLength(4);
		expect(markers.every((p) => p.kind === 'polygon')).toBeTruthy();
	});

	it('keeps the defaults for a combo with no formatting', () => {
		const vm = buildComboViewModel(
			element,
			{
				chartType: 'combo',
				categories: CATEGORIES,
				style: { hasDataLabels: true },
				series: [
					{ name: 'A', values: [1, 2, 3, 4] },
					{ name: 'B', values: [4, 3, 2, 1] },
				],
			},
			CATEGORIES,
		);
		const line = vm.primitives.find((p): p is SvgPolyline => p.kind === 'polyline');
		expect(line?.strokeWidth).toBe(2.4);
		expect(line?.dashArray).toBeUndefined();
		const bars = dataPointRects(vm.primitives);
		// No c:gapWidth: the ECMA-376 default of 150% makes the bar 1 / 2.5 of its slot.
		expect(bars[0].w / (bars[1].x - bars[0].x)).toBeCloseTo(0.4);
		expect(vm.dataLabels[0]).toMatchObject({ fill: '#334155' });
	});
});
