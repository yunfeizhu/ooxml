import { describe, expect, it } from 'vitest';
import { visioWalkPath, visioWalkRoute, type VisioWalkEnd } from './connector-route-walk';

/** An unrotated shape one inch wide and three quarters high, as Visio's Process shape. */
const shape = (x: number, y: number, width = 1, height = 0.75): VisioWalkEnd => {
	const left = x - width / 2,
		right = x + width / 2,
		bottom = y - height / 2,
		top = y + height / 2;
	return {
		shape: {
			sites: [
				{ point: { x, y: bottom }, normal: { x: 0, y: -1 } },
				{ point: { x: right, y }, normal: { x: 1, y: 0 } },
				{ point: { x, y: top }, normal: { x: 0, y: 1 } },
				{ point: { x: left, y }, normal: { x: -1, y: 0 } },
			],
			bounds: { minX: left, maxX: right, minY: bottom, maxY: top },
			center: { x, y },
			corners: [
				{ x: left, y: bottom },
				{ x: right, y: bottom },
				{ x: right, y: top },
				{ x: left, y: top },
			],
		},
	};
};
const path = (x: number, y: number) =>
	visioWalkPath(shape(5, 5), shape(x, y))!.map((point) => [
		Number(point.x.toFixed(4)),
		Number(point.y.toFixed(4)),
	]);

describe("Visio's walking glue path", () => {
	// Every expectation is a position recorded from Visio 16 for a Process shape at (5, 5)
	// connected to another one at the given place.
	it('runs straight or with one near jog between sides that face each other', () => {
		expect(path(8, 5)).toEqual([
			[5.5, 5],
			[7.5, 5],
		]);
		expect(path(8, 5.2)).toEqual([
			[5.5, 5],
			[5.6875, 5],
			[5.6875, 5.2],
			[7.5, 5.2],
		]);
		expect(path(5.4, 8)).toEqual([
			[5, 5.375],
			[5, 5.5625],
			[5.4, 5.5625],
			[5.4, 7.625],
		]);
		// A short crossing turns five sixteenths of the way over.
		expect(path(5.5, 5.9)).toEqual([
			[5, 5.375],
			[5, 5.4219],
			[5.5, 5.4219],
			[5.5, 5.525],
		]);
	});

	it('leaves sideways and enters from below when the shapes overlap or nearly meet in height', () => {
		for (const [x, y, endY] of [
			[8, 5.5, 5.125],
			[8, 5.8, 5.425],
			[8, 6, 5.625],
			[6.05, 5.5, 5.125],
		] as const)
			expect(path(x, y)).toEqual([
				[5.5, 5],
				[x, 5],
				[x, endY],
			]);
	});

	it('otherwise leaves up or down and enters from the side', () => {
		expect(path(8, 7)).toEqual([
			[5, 5.375],
			[5, 7],
			[7.5, 7],
		]);
		expect(path(2, 3)).toEqual([
			[5, 4.625],
			[5, 3],
			[2.5, 3],
		]);
		expect(path(5.9, 8)).toEqual([
			[5, 5.375],
			[5, 8],
			[5.4, 8],
		]);
		expect(path(6.2, 5.9)).toEqual([
			[5, 5.375],
			[5, 5.9],
			[5.7, 5.9],
		]);
	});

	it('ends on a fixed point, gives way when blocked and clips a centre-to-centre run', () => {
		// An end on a connection point: the path still leaves downwards first.
		expect(visioWalkPath(shape(2, 6), { point: { x: 6.5, y: 4 } })).toEqual([
			{ x: 2, y: 5.625 },
			{ x: 2, y: 4 },
			{ x: 6.5, y: 4 },
		]);
		expect(visioWalkPath(shape(5, 5), shape(5.2, 5.2))).toBeUndefined();
		const blocker = { minX: 6, maxX: 7, minY: 4, maxY: 6 };
		expect(visioWalkRoute(shape(5, 5), shape(8, 5), 'right-angle', [blocker])).toBeUndefined();
		expect(visioWalkRoute(shape(2, 6), shape(6, 3), 'straight')).toEqual([
			{ x: 2.5, y: 5.625 },
			{ x: 5.5, y: 3.375 },
		]);
		const curve = visioWalkRoute(shape(2, 6), shape(6, 3), 'curved')!;
		expect(curve).toHaveLength(4);
		// It leaves downwards and arrives from the left, like the right-angle path.
		expect(curve[1]!.x).toBe(2);
		expect(curve[2]!.y).toBe(3);
	});
});
