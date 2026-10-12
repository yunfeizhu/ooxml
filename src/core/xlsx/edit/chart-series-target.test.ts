import { afterEach, describe, expect, it } from 'vitest';
import type { ChartObject } from '../model';
import { chartSeriesFillPatch, chartSeriesSolidFillPatch } from './chart-series-fill';
import { chartSeriesGradientPatch } from './chart-series-gradient';
import { chartSeriesAt, cloneChartSeriesForEdit } from './chart-series-target';
import { chartSeriesTransparencyPatch } from './chart-series-transparency';

const chart = (): ChartObject =>
	({
		series: [
			{ name: 'A', values: [], color: { rgb: 'FF0000' } },
			{
				name: 'B',
				values: [],
				fill: {
					kind: 'gradient',
					stops: [{ position: 0, color: { kind: 'srgb', value: '00FF00', transforms: [] } }],
				},
			},
		],
	}) as unknown as ChartObject;

const hostileKeys = ['__proto__', 'constructor', 'prototype', '0', -1, 2, 0.5, Number.NaN];
const pollutedNames = ['fill', 'color', 'drawingColor', 'pointColors', 'pointFills'];
// `fill` is a real Array method: only a name that was not there to begin with counts as pollution,
// and removing the native one would break every test that shares the worker.
const nativeArrayNames = new Set(Object.getOwnPropertyNames(Array.prototype));

afterEach(() => {
	for (const name of pollutedNames) delete (Object.prototype as Record<string, unknown>)[name];
	for (const name of pollutedNames)
		if (!nativeArrayNames.has(name))
			delete (Array.prototype as unknown as Record<string, unknown>)[name];
});

describe('chart series edit targets', () => {
	it('returns own series positions only', () => {
		const model = chart();
		expect(chartSeriesAt(model, 1)).toBe(model.series[1]);
		const { series, target } = cloneChartSeriesForEdit(model, 0);
		expect(target).toBe(series[0]);
		expect(target).not.toBe(model.series[0]);
		for (const key of hostileKeys)
			expect(() => chartSeriesAt(model, key as number)).toThrow(RangeError);
	});

	it('never lets a prototype key reach the series edits', () => {
		const edits = [
			(key: number) => chartSeriesFillPatch(chart(), key, { rgb: '0000FF' }),
			(key: number) => chartSeriesFillPatch(chart(), key, null),
			(key: number) => chartSeriesSolidFillPatch(chart(), key),
			(key: number) => chartSeriesGradientPatch(chart(), key, { kind: 'create' }),
			(key: number) => chartSeriesTransparencyPatch(chart(), key, 50),
		];
		for (const edit of edits)
			for (const key of hostileKeys) expect(() => edit(key as number)).toThrow(RangeError);
		for (const name of pollutedNames) {
			expect(Object.prototype).not.toHaveProperty(name);
			expect(Object.hasOwn(Array.prototype, name)).toBe(nativeArrayNames.has(name));
			expect(({} as Record<string, unknown>)[name]).toBeUndefined();
		}
		expect(chartSeriesTransparencyPatch(chart(), 0, 50)?.series?.[0]?.drawingColor).toBeDefined();
	});
});
