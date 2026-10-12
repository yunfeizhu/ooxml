import { describe, expect, it } from 'vitest';
import {
	simplifyVisioRoute,
	visioCurvedRoute,
	visioOrthogonalRoute,
	type VisioRouteBox,
	type VisioRoutePoint,
} from './connector-route';

const box = (x: number, y: number, w = 1, h = 1): VisioRouteBox => ({
	minX: x - w / 2,
	minY: y - h / 2,
	maxX: x + w / 2,
	maxY: y + h / 2,
});
const orthogonal = (path: readonly VisioRoutePoint[]) =>
	path.slice(1).every((p, i) => p.x === path[i]!.x || p.y === path[i]!.y);
const crosses = (path: readonly VisioRoutePoint[], b: VisioRouteBox) =>
	path.slice(1).some((q, i) => {
		const p = path[i]!;
		const midX = (p.x + q.x) / 2,
			midY = (p.y + q.y) / 2;
		return (
			midX > b.minX + 1e-6 && midX < b.maxX - 1e-6 && midY > b.minY + 1e-6 && midY < b.maxY - 1e-6
		);
	});

describe('visioOrthogonalRoute', () => {
	it('draws one segment between aligned facing sides', () => {
		const path = visioOrthogonalRoute(
			{ point: { x: 2.5, y: 2 }, normal: { x: 1, y: 0 }, box: box(2, 2) },
			{ point: { x: 4.5, y: 2 }, normal: { x: -1, y: 0 }, box: box(5, 2) },
		);
		expect(path).toEqual([
			{ x: 2.5, y: 2 },
			{ x: 4.5, y: 2 },
		]);
	});

	it('keeps close facing sides to one segment, or one Z, without passing stubs', () => {
		// 0.375 in. apart, as AutoConnect places shapes: less than two 0.25 in. stubs.
		const begin = { point: { x: 2.5, y: 2 }, normal: { x: 1, y: 0 }, box: box(2, 2) };
		expect(
			visioOrthogonalRoute(begin, {
				point: { x: 2.875, y: 2 },
				normal: { x: -1, y: 0 },
				box: box(3.375, 2),
			}),
		).toEqual([
			{ x: 2.5, y: 2 },
			{ x: 2.875, y: 2 },
		]);
		const offset = visioOrthogonalRoute(begin, {
			point: { x: 2.875, y: 2.25 },
			normal: { x: -1, y: 0 },
			box: box(3.375, 2.25),
		});
		expect(offset).toEqual([
			{ x: 2.5, y: 2 },
			{ x: 2.6875, y: 2 },
			{ x: 2.6875, y: 2.25 },
			{ x: 2.875, y: 2.25 },
		]);
	});

	it('turns twice between offset facing sides and once between perpendicular sides', () => {
		const z = visioOrthogonalRoute(
			{ point: { x: 2.5, y: 2 }, normal: { x: 1, y: 0 }, box: box(2, 2) },
			{ point: { x: 4.5, y: 4 }, normal: { x: -1, y: 0 }, box: box(5, 4) },
		);
		expect(z).toEqual([
			{ x: 2.5, y: 2 },
			{ x: 3.5, y: 2 },
			{ x: 3.5, y: 4 },
			{ x: 4.5, y: 4 },
		]);
		const l = visioOrthogonalRoute(
			{ point: { x: 2.5, y: 2 }, normal: { x: 1, y: 0 }, box: box(2, 2) },
			{ point: { x: 5, y: 3.5 }, normal: { x: 0, y: -1 }, box: box(5, 4) },
		);
		expect(l).toEqual([
			{ x: 2.5, y: 2 },
			{ x: 5, y: 2 },
			{ x: 5, y: 3.5 },
		]);
	});

	it('goes around glued shapes when the sides face away', () => {
		const begin = box(2, 2),
			end = box(5, 2);
		const path = visioOrthogonalRoute(
			{ point: { x: 1.5, y: 2 }, normal: { x: -1, y: 0 }, box: begin },
			{ point: { x: 5.5, y: 2 }, normal: { x: 1, y: 0 }, box: end },
		);
		expect(orthogonal(path)).toBe(true);
		expect(crosses(path, begin) || crosses(path, end)).toBe(false);
		expect(path[1]!.x).toBeLessThan(1.5);
		expect(path.at(-2)!.x).toBeGreaterThan(5.5);
	});

	it('routes an unglued end straight towards the other end', () => {
		const path = visioOrthogonalRoute({ point: { x: 0, y: 0 } }, { point: { x: 3, y: 1 } });
		expect(orthogonal(path)).toBe(true);
		expect(path[0]).toEqual({ x: 0, y: 0 });
		expect(path.at(-1)).toEqual({ x: 3, y: 1 });
		expect(path.length).toBeLessThanOrEqual(4);
	});
});

it('simplifies repeated and collinear points but keeps turns', () => {
	expect(
		simplifyVisioRoute([
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
			{ x: 1, y: 0 },
			{ x: 2, y: 0 },
			{ x: 2, y: 1 },
		]),
	).toEqual([
		{ x: 0, y: 0 },
		{ x: 2, y: 0 },
		{ x: 2, y: 1 },
	]);
});

it('curves leave each glued end along its side', () => {
	const [p0, p1, p2, p3] = visioCurvedRoute(
		{ point: { x: 0, y: 0 }, normal: { x: 0, y: 1 } },
		{ point: { x: 4, y: 0 }, normal: { x: 0, y: 1 } },
	);
	expect(p0).toEqual({ x: 0, y: 0 });
	expect(p3).toEqual({ x: 4, y: 0 });
	expect(p1.x).toBe(0);
	expect(p1.y).toBeGreaterThan(0);
	expect(p2.x).toBe(4);
	expect(p2.y).toBeCloseTo(p1.y, 12);
});
