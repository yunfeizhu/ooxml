/**
 * The view model resolves the chart text font (`chartTextFontFamily`) and style
 * onto every chart text: axis, secondary-axis, category and data labels, and
 * text primitives (treemap and sunburst labels). Vue, Angular and Svelte dropped
 * them on the label lists and React on text primitives, so the bindings drew
 * the same chart in different fonts (caught by `e2e/pptx/chart-svg-parity.spec.ts`).
 */
import { mount } from '@vue/test-utils';
import { buildChartViewModel } from 'ooxml-ui/pptx';
import type { ChartViewModel, SvgText } from 'ooxml-ui/pptx';
import type { ChartPptxElement, PptxChartData } from 'pptx-viewer-core';
import { describe, expect, it } from 'vitest';

import ChartViewModelSvg from './ChartViewModelSvg.vue';

const FONT = '"Calibri", "Carlito", sans-serif';

const element = {
	id: 'el-bar',
	type: 'chart',
	x: 0,
	y: 0,
	width: 400,
	height: 300,
	chartData: {
		chartType: 'bar',
		categories: ['Q1'],
		series: [{ name: 'Revenue', values: [10] }],
	} as PptxChartData,
} as ChartPptxElement;

function text(content: string): SvgText {
	return {
		kind: 'text',
		x: 10,
		y: 10,
		text: content,
		fontSize: 12,
		fill: '#000000',
		textAnchor: 'start',
		fontFamily: FONT,
		fontStyle: 'italic',
	};
}

/** A real view model whose every text list carries one font-bearing label. */
function fontedViewModel(): ChartViewModel {
	return {
		...buildChartViewModel(element),
		axisLabels: [text('axis')],
		secondaryAxisLabels: [text('secondary')],
		categoryLabels: [text('category')],
		dataLabels: [text('data')],
		primitives: [text('primitive')],
	};
}

const LABELS = ['axis', 'secondary', 'category', 'data', 'primitive'];

describe('chartViewModelSvg: chart text fonts', () => {
	it.each(LABELS)('paints the %s text in the resolved font family and style', (label) => {
		const wrapper = mount(ChartViewModelSvg, {
			props: { elementId: 'c1', vm: fontedViewModel() },
		});
		const node = wrapper.findAll('text').find((t) => t.text() === label);
		expect(node?.attributes('font-family')).toBe(FONT);
		expect(node?.attributes('font-style')).toBe('italic');
	});
});
