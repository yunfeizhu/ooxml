import {
	relevantObstacles,
	routeAroundBoxes,
	routeCrossings,
	segmentCrossesBox,
} from './connector-route-avoid';

/** Page-space point (drawing inches, y up). */
export interface VisioRoutePoint {
	x: number;
	y: number;
}
/** An axis-aligned box in page space. */
export interface VisioRouteBox {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}
/** One connector end: where it is, which way it leaves its shape, and the shape to avoid. */
export interface VisioRouteEnd {
	point: VisioRoutePoint;
	/** Outward unit direction of the glued side; omitted for an unglued end. */
	normal?: VisioRoutePoint;
	box?: VisioRouteBox;
}

/** Distance a right-angle route leaves a glued shape before it turns. */
export const VISIO_ROUTE_STUB = 0.25;
const EPSILON = 1e-9;
const same = (p: VisioRoutePoint, q: VisioRoutePoint) =>
	Math.abs(p.x - q.x) <= EPSILON && Math.abs(p.y - q.y) <= EPSILON;
const unit = (x: number, y: number): VisioRoutePoint => {
	const length = Math.hypot(x, y);
	return length > EPSILON ? { x: x / length, y: y / length } : { x: 1, y: 0 };
};
/** The axis direction a route leaves an end: its side normal, or towards the other end. */
function axisDirection(end: VisioRouteEnd, other: VisioRoutePoint): VisioRoutePoint {
	const raw = end.normal ?? { x: other.x - end.point.x, y: other.y - end.point.y };
	if (Math.abs(raw.x) <= EPSILON && Math.abs(raw.y) <= EPSILON) return { x: 1, y: 0 };
	return Math.abs(raw.x) >= Math.abs(raw.y)
		? { x: Math.sign(raw.x), y: 0 }
		: { x: 0, y: Math.sign(raw.y) };
}

/** Drop repeated points and merge collinear runs that keep their direction. */
export function simplifyVisioRoute(points: readonly VisioRoutePoint[]): VisioRoutePoint[] {
	const result: VisioRoutePoint[] = [];
	for (const point of points) {
		if (result.length && same(result.at(-1)!, point)) continue;
		if (result.length >= 2) {
			const a = result.at(-2)!,
				b = result.at(-1)!;
			const cross = (b.x - a.x) * (point.y - b.y) - (b.y - a.y) * (point.x - b.x);
			const dot = (b.x - a.x) * (point.x - b.x) + (b.y - a.y) * (point.y - b.y);
			if (Math.abs(cross) <= EPSILON && dot > 0) result.pop();
		}
		result.push(point);
	}
	return result;
}

function score(
	path: readonly VisioRoutePoint[],
	begin: VisioRouteEnd,
	end: VisioRouteEnd,
	leave: VisioRoutePoint,
	arrive: VisioRoutePoint,
	obstacles: readonly VisioRouteBox[],
): number {
	// Passing through a shape the connector is not glued to is as bad as through one it is.
	let total = routeCrossings(path, obstacles) * 1000;
	for (let i = 1; i < path.length; i++) {
		const p = path[i - 1]!,
			q = path[i]!;
		total += Math.abs(q.x - p.x) + Math.abs(q.y - p.y);
		for (const [box, skip] of [
			[begin.box, i === 1],
			[end.box, i === path.length - 1],
		] as const)
			if (box && !skip && segmentCrossesBox(p, q, box)) total += 1000;
		if (i >= 2) {
			const o = path[i - 2]!;
			// A route that doubles back on itself hides a segment under another.
			if ((p.x - o.x) * (q.x - p.x) + (p.y - o.y) * (q.y - p.y) < -EPSILON) total += 100;
		}
	}
	const first = unit(path[1]!.x - path[0]!.x, path[1]!.y - path[0]!.y);
	const last = unit(path.at(-1)!.x - path.at(-2)!.x, path.at(-1)!.y - path.at(-2)!.y);
	if (begin.normal && first.x * leave.x + first.y * leave.y < 1 - 1e-6) total += 50;
	if (end.normal && last.x * -arrive.x + last.y * -arrive.y < 1 - 1e-6) total += 50;
	return total + (path.length - 2) * 0.01;
}

/**
 * A right-angle route between two ends: it leaves each glued end along its side, turns at most a
 * few times and avoids crossing the two glued shapes. `obstacles` are the other shapes of the
 * page: when every simple candidate passes through one, the shared orthogonal router (the one
 * PowerPoint uses, `geometry/connector-router`) finds a way around. Not Visio's own router: the
 * bends differ from the ones Visio would choose.
 */
export function visioOrthogonalRoute(
	begin: VisioRouteEnd,
	end: VisioRouteEnd,
	obstacles: readonly VisioRouteBox[] = [],
): VisioRoutePoint[] {
	const leave = axisDirection(begin, end.point),
		arrive = axisDirection(end, begin.point);
	// Two glued sides that face each other across less than two stubs share the space between
	// them, so the stubs never pass each other (close shapes get one straight segment or a Z).
	const between =
		begin.box && end.box && leave.x === -arrive.x && leave.y === -arrive.y
			? (end.point.x - begin.point.x) * leave.x + (end.point.y - begin.point.y) * leave.y
			: Infinity;
	const reach = between > EPSILON ? Math.min(VISIO_ROUTE_STUB, between / 2) : VISIO_ROUTE_STUB;
	const stub = (value: VisioRouteEnd, direction: VisioRoutePoint) => {
		const length = value.box ? reach : 0;
		return { x: value.point.x + direction.x * length, y: value.point.y + direction.y * length };
	};
	const b = stub(begin, leave),
		e = stub(end, arrive);
	const boxes = [begin.box, end.box].filter((box): box is VisioRouteBox => !!box);
	const others = relevantObstacles(b, e, obstacles);
	const xs = [(b.x + e.x) / 2],
		ys = [(b.y + e.y) / 2];
	if (boxes.length) {
		xs.push(
			Math.min(...boxes.map((box) => box.minX), b.x, e.x) - VISIO_ROUTE_STUB,
			Math.max(...boxes.map((box) => box.maxX), b.x, e.x) + VISIO_ROUTE_STUB,
		);
		ys.push(
			Math.min(...boxes.map((box) => box.minY), b.y, e.y) - VISIO_ROUTE_STUB,
			Math.max(...boxes.map((box) => box.maxY), b.y, e.y) + VISIO_ROUTE_STUB,
		);
	}
	// Centred turns come first so they win ties against turns at a stub's end.
	const middles: VisioRoutePoint[][] = [
		...xs.map((x) => [
			{ x, y: b.y },
			{ x, y: e.y },
		]),
		...ys.map((y) => [
			{ x: b.x, y },
			{ x: e.x, y },
		]),
		[{ x: e.x, y: b.y }],
		[{ x: b.x, y: e.y }],
		// Detours that leave along the stub, cross over, and come back along the other stub.
		...xs.flatMap((x) =>
			ys.map((y) => [
				{ x: b.x, y },
				{ x, y },
				{ x, y: e.y },
			]),
		),
	];
	let best: { path: VisioRoutePoint[]; score: number } | undefined;
	for (const middle of middles) {
		const path = simplifyVisioRoute([begin.point, b, ...middle, e, end.point]);
		if (path.length < 2) continue;
		const value = score(path, begin, end, leave, arrive, others);
		if (!best || value < best.score - 1e-9) best = { path, score: value };
	}
	const chosen = best?.path ?? [begin.point, end.point];
	const crossed = routeCrossings(chosen, others);
	if (!crossed) return chosen;
	const around = routeAroundBoxes(b, e, [...relevantObstacles(b, e, boxes), ...others]);
	if (!around) return chosen;
	const detour = simplifyVisioRoute([begin.point, ...around, end.point]);
	return routeCrossings(detour, others) < crossed ? detour : chosen;
}

/** One cubic from begin to end whose handles leave each glued end along its side. */
export function visioCurvedRoute(
	begin: VisioRouteEnd,
	end: VisioRouteEnd,
): [VisioRoutePoint, VisioRoutePoint, VisioRoutePoint, VisioRoutePoint] {
	const distance = Math.hypot(end.point.x - begin.point.x, end.point.y - begin.point.y);
	const reach = Math.max(distance * 0.4, VISIO_ROUTE_STUB);
	const direction = (value: VisioRouteEnd, other: VisioRoutePoint) =>
		value.normal ?? unit(other.x - value.point.x, other.y - value.point.y);
	const leave = direction(begin, end.point),
		arrive = direction(end, begin.point);
	return [
		begin.point,
		{ x: begin.point.x + leave.x * reach, y: begin.point.y + leave.y * reach },
		{ x: end.point.x + arrive.x * reach, y: end.point.y + arrive.y * reach },
		end.point,
	];
}
