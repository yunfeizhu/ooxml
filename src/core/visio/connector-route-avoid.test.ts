import { describe, expect, it } from 'vitest';
import {
	visioOrthogonalRoute,
	type VisioRouteBox,
	type VisioRouteEnd,
	type VisioRoutePoint,
} from './connector-route';
import {
	VISIO_ROUTE_CLEARANCE,
	VISIO_ROUTE_OBSTACLE_LIMIT,
	relevantObstacles,
	routeAroundBoxes,
	routeCrossings,
} from './connector-route-avoid';

const box = (x: number, y: number, size = 1): VisioRouteBox => ({
	minX: x - size / 2,
	minY: y - size / 2,
	maxX: x + size / 2,
	maxY: y + size / 2,
});
/** An end glued to the right (`1`) or left (`-1`) side of a unit box centred at x, y. */
const side = (x: number, y: number, direction: 1 | -1): VisioRouteEnd => ({
	point: { x: x + direction * 0.5, y },
	normal: { x: direction, y: 0 },
	box: box(x, y),
});
const axisAligned = (path: readonly VisioRoutePoint[]) =>
	path.every(
		(point, index) =>
			index === 0 || point.x === path[index - 1]!.x || point.y === path[index - 1]!.y,
	);

describe('right-angle routes around other shapes', () => {
	const begin = side(2, 2, 1),
		end = side(8, 2, -1);

	it('keeps the simple route when nothing is in the way', () => {
		const plain = visioOrthogonalRoute(begin, end);
		expect(plain).toEqual([
			{ x: 2.5, y: 2 },
			{ x: 7.5, y: 2 },
		]);
		// A shape beside the route changes nothing.
		expect(visioOrthogonalRoute(begin, end, [box(5, 5)])).toEqual(plain);
	});

	it('goes around a shape between the two ends', () => {
		const blocker = box(5, 2);
		const path = visioOrthogonalRoute(begin, end, [blocker]);
		expect(path[0]).toEqual(begin.point);
		expect(path.at(-1)).toEqual(end.point);
		expect(axisAligned(path)).toBe(true);
		expect(routeCrossings(path, [blocker, begin.box!, end.box!])).toBe(0);
		// It still leaves and arrives along the glued sides.
		expect(path[1]!.y).toBe(2);
		expect(path[1]!.x).toBeGreaterThan(2.5);
		expect(path.at(-2)!.y).toBe(2);
		expect(path.at(-2)!.x).toBeLessThan(7.5);
		// One detour: out, over (or under), back.
		expect(path.length).toBeLessThanOrEqual(6);
	});

	it('uses the shared router when no simple candidate clears a tall shape', () => {
		// Three inches tall: the turns just outside the two glued shapes all pass through it.
		const tall = box(5, 2, 3);
		const path = visioOrthogonalRoute(begin, end, [tall]);
		expect(path[0]).toEqual(begin.point);
		expect(path.at(-1)).toEqual(end.point);
		expect(axisAligned(path)).toBe(true);
		expect(routeCrossings(path, [tall, begin.box!, end.box!])).toBe(0);
		// The detour clears the shape by the routing clearance, above or below it.
		const far = Math.max(...path.map((point) => Math.abs(point.y - 2)));
		expect(far).toBeGreaterThanOrEqual(1.5 + VISIO_ROUTE_CLEARANCE);
		expect(far).toBeLessThan(2);
		expect(path).toHaveLength(6);
	});

	it('prefers a simple candidate that already misses the obstacle', () => {
		// The ends are offset, so a Z has a free column to turn in on either side of the blocker.
		const low = side(2, 2, 1),
			high = side(8, 5, -1);
		const blocker = box(5, 2);
		const path = visioOrthogonalRoute(low, high, [blocker]);
		expect(routeCrossings(path, [blocker])).toBe(0);
		expect(path).toHaveLength(4);
	});

	it('threads between several shapes', () => {
		const blockers = [box(4, 2), box(6, 2), box(5, 3.4), box(5, 0.6)];
		const path = visioOrthogonalRoute(begin, end, blockers);
		expect(axisAligned(path)).toBe(true);
		expect(routeCrossings(path, blockers)).toBe(0);
	});

	it('routes through a container that holds an end and keeps its route when walled in', () => {
		const container: VisioRouteBox = { minX: 0, minY: 0, maxX: 4, maxY: 4 };
		expect(relevantObstacles({ x: 2.75, y: 2 }, { x: 7.25, y: 2 }, [container])).toEqual([]);
		expect(visioOrthogonalRoute(begin, end, [container])).toEqual(visioOrthogonalRoute(begin, end));
		// A wall the router cannot pass within its canvas: the simple route stays.
		const wall: VisioRouteBox = { minX: 4.5, minY: -1e5, maxX: 5.5, maxY: 1e5 };
		const path = visioOrthogonalRoute(begin, end, [wall]);
		expect(path[0]).toEqual(begin.point);
		expect(path.at(-1)).toEqual(end.point);
		expect(axisAligned(path)).toBe(true);
	});

	it('considers only nearby obstacles, nearest first', () => {
		const many = Array.from({ length: 60 }, (_, index) => box(5 + index * 0.01, 2 + index * 0.2));
		const near = relevantObstacles({ x: 2.75, y: 2 }, { x: 7.25, y: 2 }, [
			...many,
			box(500, 500),
			{ minX: 5, minY: 2, maxX: 5, maxY: 3 },
		]);
		expect(near).toHaveLength(VISIO_ROUTE_OBSTACLE_LIMIT);
		expect(near[0]).toEqual(many[0]);
	});

	it('returns the exact end points and undefined without obstacles', () => {
		const from = { x: 2.75, y: 2 },
			to = { x: 7.25, y: 2 };
		expect(routeAroundBoxes(from, to, [])).toBeUndefined();
		const path = routeAroundBoxes(from, to, [box(5, 2)])!;
		expect(path[0]).toBe(from);
		expect(path.at(-1)).toBe(to);
		// Negative page coordinates are routed as well.
		const shifted = routeAroundBoxes({ x: -7.25, y: -2 }, { x: -2.75, y: -2 }, [box(-5, -2)])!;
		expect(axisAligned(shifted)).toBe(true);
		expect(routeCrossings(shifted, [box(-5, -2)])).toBe(0);
	});
});
