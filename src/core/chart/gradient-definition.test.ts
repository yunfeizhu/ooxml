import { expect, it } from 'vitest';
import { buildChartGradientDef, resolveChartGradient } from './gradient-definition';
import { chartGradientMarkup } from './gradient-markup';
import type { DrawingFill } from '../drawingml/types';
it('retains the native vertical vector and resolves off-box circle focus', () => {
	expect(buildChartGradientDef('g', { type: 'linear', angle: 90, stops: [] })).toMatchObject({
		x1: 0.5,
		y1: 0,
		x2: 0.5,
		y2: 1,
	});
	expect(
		buildChartGradientDef('g', { type: 'radial', focalPoint: { x: 0.5, y: -0.8 }, stops: [] }),
	).toMatchObject({ cx: 0.5, cy: -0.8, r: Math.hypot(0.5, 1.8) });
});

it('restricts native interpolation to resolved opaque scaled linear endpoint pairs', () => {
	const fill: Extract<DrawingFill, { kind: 'gradient' }> = {
		kind: 'gradient',
		angle: 45,
		scaled: true,
		stops: [
			{ position: 100, color: { kind: 'srgb', value: 'FFFFFF', transforms: [] } },
			{ position: 0, color: { kind: 'srgb', value: 'FF0000', transforms: [] } },
		],
	};
	const resolve = (alpha = 1) =>
		resolveChartGradient(fill, (color) => ({ hex: `#${color.value}`, alpha }));
	expect(resolve().interpolation).toBe('sigma-gamma22');
	expect(buildChartGradientDef('g', resolve())).toMatchObject({ x1: 0, y1: 0, x2: 1, y2: 1 });
	expect(resolve(0.5).interpolation).toBeUndefined();
	expect(buildChartGradientDef('g', resolve(0.5)).stops).toHaveLength(2);
	fill.scaled = false;
	expect(resolve().interpolation).toBeUndefined();
	fill.scaled = true;
	fill.path = 'circle';
	expect(resolve().interpolation).toBe('sigma-gamma22');
	delete fill.path;
	fill.stops[0]!.position = 80;
	expect(resolve().interpolation).toBeUndefined();
	expect(fill.stops.map((stop) => stop.position)).toEqual([80, 0]);
});

it('keeps legacy radial descriptors and unknown shape outlines unchanged', () => {
	const bounds = { width: 960, height: 600, shape: 'rect' as const };
	const legacy = { type: 'radial' as const, stops: [] };
	expect(buildChartGradientDef('g', legacy, bounds)).toEqual(buildChartGradientDef('g', legacy));
	expect(buildChartGradientDef('g', { ...legacy, path: 'shape' })).toMatchObject({
		kind: 'radialGradient',
	});
	expect(
		buildChartGradientDef('g', { ...legacy, path: 'circle' }, { width: 0, height: 0 }),
	).toEqual(buildChartGradientDef('g', legacy));
});

it('writes gradientUnits only for a user-space def', () => {
	const stops = [{ offset: 0, color: '#c08fbf' }];
	const base = { kind: 'linearGradient' as const, id: 'g', x1: 10, y1: 4, x2: 90, y2: 4, stops };
	expect(chartGradientMarkup(base)).toContain('<linearGradient id="g" x1="10"');
	expect(chartGradientMarkup({ ...base, gradientUnits: 'userSpaceOnUse' })).toContain(
		'<linearGradient id="g" gradientUnits="userSpaceOnUse" x1="10"',
	);
});
