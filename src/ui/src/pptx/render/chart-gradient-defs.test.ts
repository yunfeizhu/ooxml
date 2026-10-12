// @vitest-environment jsdom
import type { PptxChartData } from 'ooxml-core/pptx';
import { describe, expect, it } from 'vitest';

import { buildGradientDef } from './chart-gradient-defs';
import { buildChartViewModel } from './chart-view-model';
import { renderPatternDef } from './chart-view-model-dom-helpers';

const stops = [
	{ color: '#595959', position: 0 },
	{ color: '#262626', position: 100 },
];

describe('buildGradientDef (COM: charts-com.pptx slide 23)', () => {
	it('maps a:lin ang=90deg to a top-to-bottom vector', () => {
		expect(buildGradientDef('g', { type: 'linear', angle: 90, stops })).toStrictEqual({
			kind: 'linearGradient',
			id: 'g',
			x1: 0.5,
			y1: 0,
			x2: 0.5,
			y2: 1,
			stops: [
				{ offset: 0, color: '#595959' },
				{ offset: 1, color: '#262626' },
			],
		});
	});

	it('centres a circle path gradient on its focal point', () => {
		const def = buildGradientDef('g', { type: 'radial', stops, focalPoint: { x: 0.5, y: 0.5 } });
		expect(def).toMatchObject({ kind: 'radialGradient', cx: 0.5, cy: 0.5 });
	});

	it('renders as an SVG gradient node for the vanilla projector', () => {
		const node = renderPatternDef(
			document,
			buildGradientDef('g', { type: 'linear', angle: 0, stops }),
		);
		expect(node.tagName).toBe('linearGradient');
		expect(node.querySelectorAll('stop')).toHaveLength(2);
	});

	it('stretches a rectangular chart gradient across its painted bounds', () => {
		const node = renderPatternDef(document, {
			kind: 'rectPath',
			id: 'g-rect',
			href: 'data:image/svg+xml,rect',
			stops: [],
		});
		expect(node.tagName).toBe('pattern');
		expect(node.getAttribute('patternContentUnits')).toBe('objectBoundingBox');
		expect(node.querySelector('image')?.getAttribute('width')).toBe('1');
		expect(node.querySelector('image')?.getAttribute('preserveAspectRatio')).toBe('none');
	});
});

describe('withGradientFills through buildChartViewModel', () => {
	const chartData: PptxChartData = {
		chartType: 'bar',
		categories: ['A', 'B'],
		series: [
			{
				name: 'S1',
				values: [1, 2],
				gradientFill: { type: 'linear', angle: 90, stops },
			},
		],
		style: { chartAreaGradient: { type: 'radial', stops } },
	};
	const vm = buildChartViewModel({
		id: 'chart 1',
		type: 'chart',
		x: 0,
		y: 0,
		width: 400,
		height: 300,
		chartData,
	} as never);

	it('paints the chart area and every bar of the series with a gradient def', () => {
		expect(vm.areaFill).toBe('url(#chart_1-grad-area)');
		const bars = vm.primitives.filter((p) => p.kind === 'rect' && p.part?.seriesIndex === 0);
		expect(bars.length).toBeGreaterThan(0);
		expect(bars.every((b) => b.kind === 'rect' && b.fill === 'url(#chart_1-grad-s0)')).toBeTruthy();
		expect(vm.defs?.map((d) => d.kind)).toStrictEqual(['radialGradient', 'linearGradient']);
	});
});

describe('line series outline gradient (a:ln/a:gradFill)', () => {
	const line = (values: number[]) =>
		buildChartViewModel({
			id: 'chart 1',
			type: 'chart',
			x: 0,
			y: 0,
			width: 400,
			height: 300,
			chartData: {
				chartType: 'line',
				categories: values.map((_, i) => String(i)),
				series: [
					{
						name: 'S1',
						values,
						color: '#800F85',
						lineGradientFill: { type: 'linear', angle: 0, stops },
					},
				],
			},
		} as never);
	const strokes = (vm: ReturnType<typeof line>) =>
		vm.primitives.filter((p) => p.part?.role === 'series' && 'stroke' in p);

	it('strokes the series line with a gradient laid along the line in user space', () => {
		const vm = line([1, 3, 2]);
		expect(strokes(vm).length).toBeGreaterThan(0);
		expect(
			strokes(vm).every((p) => 'stroke' in p && p.stroke === 'url(#chart_1-grad-line-s0)'),
		).toBeTruthy();
		const def = vm.defs?.find((d) => d.id === 'chart_1-grad-line-s0');
		expect(def).toMatchObject({ kind: 'linearGradient', gradientUnits: 'userSpaceOnUse' });
		if (def?.kind !== 'linearGradient') throw new Error('expected a linear gradient');
		expect(def.x2).toBeGreaterThan(def.x1);
		expect(def.y2).toBe(def.y1);
	});

	it('still paints a perfectly flat line (zero-height bounds)', () => {
		const vm = line([2, 2, 2]);
		const def = vm.defs?.find((d) => d.id === 'chart_1-grad-line-s0');
		if (def?.kind !== 'linearGradient') throw new Error('expected a linear gradient');
		expect(def.gradientUnits).toBe('userSpaceOnUse');
		expect(def.x2).toBeGreaterThan(def.x1);
	});

	it('lays a smoothed line gradient across the curve as well', () => {
		const vm = buildChartViewModel({
			id: 'chart 1',
			type: 'chart',
			x: 0,
			y: 0,
			width: 400,
			height: 300,
			chartData: {
				chartType: 'line',
				categories: ['a', 'b', 'c'],
				series: [
					{
						name: 'S1',
						values: [1, 3, 2],
						smooth: true,
						lineGradientFill: { type: 'linear', angle: 0, stops },
					},
				],
			},
		} as never);
		const path = vm.primitives.find((p) => p.kind === 'path' && p.part?.role === 'series');
		expect(path && 'stroke' in path ? path.stroke : undefined).toBe('url(#chart_1-grad-line-s0)');
	});

	it('leaves the markers on their own fill', () => {
		const vm = line([1, 3, 2]);
		const marks = vm.primitives.filter((p) => p.part?.role === 'dataPoint');
		expect(marks.every((p) => !('fill' in p) || !String(p.fill).startsWith('url('))).toBeTruthy();
	});

	it('writes gradientUnits on the vanilla gradient node', () => {
		const node = renderPatternDef(document, {
			kind: 'linearGradient',
			id: 'g',
			gradientUnits: 'userSpaceOnUse',
			x1: 10,
			y1: 5,
			x2: 90,
			y2: 5,
			stops: [],
		});
		expect(node.getAttribute('gradientUnits')).toBe('userSpaceOnUse');
	});
});
