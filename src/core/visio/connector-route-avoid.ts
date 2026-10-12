import { routeOrthogonalConnector } from '../geometry/connector-router';
import type { VisioRouteBox, VisioRoutePoint } from './connector-route';

/**
 * The shared router works in pixel-like units (its tolerances are about half a unit and its node
 * keys are whole units), so page inches are scaled up before routing and back afterwards.
 */
const UNITS_PER_INCH = 100;
/**
 * Clearance kept around a shape: 3/16 inch, the distance Visio's own router was recorded passing
 * a placeable shape at. It must stay below the stub a route leaves a glued shape with.
 */
export const VISIO_ROUTE_CLEARANCE = 0.1875;
/** The router puts its corner nodes this many units outside the padded boxes. */
const ROUTER_NODE_MARGIN = 4;
/** Obstacles further than this from both ends cannot improve a route and only slow the search. */
const REACH = 6;
/** The search is quadratic in obstacles; the nearest ones decide the route. */
export const VISIO_ROUTE_OBSTACLE_LIMIT = 24;
const INSET = 1e-6;

/** Whether the axis-aligned segment `p`-`q` passes through the inside of `box`. */
export function segmentCrossesBox(
	p: VisioRoutePoint,
	q: VisioRoutePoint,
	box: VisioRouteBox,
): boolean {
	const [x0, x1] = p.x < q.x ? [p.x, q.x] : [q.x, p.x];
	const [y0, y1] = p.y < q.y ? [p.y, q.y] : [q.y, p.y];
	return (
		x1 > box.minX + INSET && x0 < box.maxX - INSET && y1 > box.minY + INSET && y0 < box.maxY - INSET
	);
}

/** How many obstacle boxes a polyline passes through. */
export function routeCrossings(
	path: readonly VisioRoutePoint[],
	boxes: readonly VisioRouteBox[],
): number {
	let count = 0;
	for (const box of boxes)
		if (path.some((point, index) => index > 0 && segmentCrossesBox(path[index - 1]!, point, box)))
			++count;
	return count;
}

const inside = (point: VisioRoutePoint, box: VisioRouteBox, pad: number) =>
	point.x > box.minX - pad &&
	point.x < box.maxX + pad &&
	point.y > box.minY - pad &&
	point.y < box.maxY + pad;

/**
 * The obstacles worth routing around: boxes with an area, near the two ends, that neither end
 * sits in (a container holding an end is routed through, as in Visio), nearest first and capped.
 */
export function relevantObstacles(
	from: VisioRoutePoint,
	to: VisioRoutePoint,
	boxes: readonly VisioRouteBox[],
): VisioRouteBox[] {
	const minX = Math.min(from.x, to.x) - REACH,
		maxX = Math.max(from.x, to.x) + REACH,
		minY = Math.min(from.y, to.y) - REACH,
		maxY = Math.max(from.y, to.y) + REACH;
	const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
	const distance = (box: VisioRouteBox) =>
		Math.hypot(
			Math.max(box.minX - middle.x, 0, middle.x - box.maxX),
			Math.max(box.minY - middle.y, 0, middle.y - box.maxY),
		);
	return boxes
		.filter(
			(box) =>
				box.maxX - box.minX > INSET &&
				box.maxY - box.minY > INSET &&
				box.maxX > minX &&
				box.minX < maxX &&
				box.maxY > minY &&
				box.minY < maxY &&
				!inside(from, box, VISIO_ROUTE_CLEARANCE) &&
				!inside(to, box, VISIO_ROUTE_CLEARANCE),
		)
		.map((box) => ({ box, distance: distance(box) }))
		.sort((a, b) => a.distance - b.distance)
		.slice(0, VISIO_ROUTE_OBSTACLE_LIMIT)
		.map((item) => item.box);
}

/**
 * A right-angle path from `from` to `to` around `boxes`, found by the shared orthogonal router
 * (`geometry/connector-router`, the one PowerPoint uses). Undefined when the router finds no
 * axis-aligned path, so the caller keeps its own route.
 */
export function routeAroundBoxes(
	from: VisioRoutePoint,
	to: VisioRoutePoint,
	boxes: readonly VisioRouteBox[],
): VisioRoutePoint[] | undefined {
	if (!boxes.length) return undefined;
	// The router rejects nodes left of or above its canvas origin: shift everything inside it.
	// Its y axis points down and it breaks ties towards its origin, so flipping the page's y-up
	// axis sends an equal detour over the shape, where Visio's router was recorded sending it.
	const margin = 2;
	const originX = Math.min(from.x, to.x, ...boxes.map((box) => box.minX)) - margin,
		originY = Math.max(from.y, to.y, ...boxes.map((box) => box.maxY)) + margin;
	const scaled = (point: VisioRoutePoint) => ({
		x: (point.x - originX) * UNITS_PER_INCH,
		y: (originY - point.y) * UNITS_PER_INCH,
	});
	const start = scaled(from),
		end = scaled(to);
	const path = routeOrthogonalConnector(
		start,
		end,
		boxes.map((box) => {
			const corner = scaled({ x: box.minX, y: box.maxY });
			return {
				x: corner.x,
				y: corner.y,
				width: (box.maxX - box.minX) * UNITS_PER_INCH,
				height: (box.maxY - box.minY) * UNITS_PER_INCH,
			};
		}),
		// Padding plus the router's node margin puts the bends exactly at the clearance.
		{ padding: VISIO_ROUTE_CLEARANCE * UNITS_PER_INCH - ROUTER_NODE_MARGIN },
	);
	const back = (point: { x: number; y: number }, index: number): VisioRoutePoint => {
		// The two ends keep their exact coordinates; bends are rounded off the scaling noise.
		if (index === 0) return from;
		if (index === path.length - 1) return to;
		const round = (value: number) => Math.round(value * 1e6) / 1e6;
		return {
			x: round(point.x / UNITS_PER_INCH + originX),
			y: round(originY - point.y / UNITS_PER_INCH),
		};
	};
	const result = path.map(back);
	// Snap bends that share a row or column with an end onto it exactly.
	for (const point of result.slice(1, -1))
		for (const anchor of [from, to]) {
			if (Math.abs(point.x - anchor.x) < 1e-5) point.x = anchor.x;
			if (Math.abs(point.y - anchor.y) < 1e-5) point.y = anchor.y;
		}
	const axisAligned = result.every(
		(point, index) =>
			index === 0 ||
			Math.abs(point.x - result[index - 1]!.x) < 1e-9 ||
			Math.abs(point.y - result[index - 1]!.y) < 1e-9,
	);
	return axisAligned && result.length >= 2 ? result : undefined;
}
