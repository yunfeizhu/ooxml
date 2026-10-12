import {
	simplifyVisioRoute,
	visioCurvedRoute,
	type VisioRouteBox,
	type VisioRoutePoint,
} from './connector-route';
import { VISIO_ROUTE_CLEARANCE, routeCrossings } from './connector-route-avoid';

/** One end of a connector for walking glue: a glued shape (its sides) or a fixed point. */
export interface VisioWalkEnd {
	/** A fixed end: an unglued point or a connection point. */
	point?: VisioRoutePoint;
	/** A dynamically glued shape: its side midpoints with outward normals, bounds and corners. */
	shape?: {
		sites: readonly { point: VisioRoutePoint; normal: VisioRoutePoint }[];
		bounds: VisioRouteBox;
		center: VisioRoutePoint;
		corners: readonly VisioRoutePoint[];
	};
}

const EPSILON = 1e-9;
/** Below this gap Visio stops leaving a shape towards the other one across the gap. */
const CHANNEL = 2 * VISIO_ROUTE_CLEARANCE;
/** A jog between two sides that face each other turns this share of the way across, at most a clearance. */
const JOG = 0.3125;

const bounds = (end: VisioWalkEnd): VisioRouteBox =>
	end.shape?.bounds ?? {
		minX: end.point!.x,
		maxX: end.point!.x,
		minY: end.point!.y,
		maxY: end.point!.y,
	};
const center = (end: VisioWalkEnd): VisioRoutePoint => end.shape?.center ?? end.point!;
/** The side midpoint whose normal points most nearly along (x, y), or the fixed point. */
function side(end: VisioWalkEnd, x: number, y: number): VisioRoutePoint {
	if (!end.shape) return end.point!;
	let best = end.shape.sites[0]!;
	for (const site of end.shape.sites)
		if (site.normal.x * x + site.normal.y * y > best.normal.x * x + best.normal.y * y) best = site;
	return best.point;
}

/**
 * The right-angle path Visio's walking glue draws between two ends when nothing is in the way,
 * from positions recorded in Visio 16 (`scripts/record-visio-instance-connector.ps1`):
 *
 * - sides that face each other with the begin shape's middle inside the other's extent connect
 *   straight across, or with one jog close to the begin side when they are not level;
 * - shapes that overlap in height, or sit closer in height than two clearances while well apart
 *   sideways, are left sideways and entered from below or above;
 * - otherwise the path leaves the begin shape up or down and enters the end shape from the side.
 *
 * Undefined when the shapes overlap, so the caller falls back to its general router.
 */
export function visioWalkPath(
	begin: VisioWalkEnd,
	end: VisioWalkEnd,
): VisioRoutePoint[] | undefined {
	const a = bounds(begin),
		b = bounds(end);
	const from = center(begin),
		to = center(end);
	const gapX = Math.max(b.minX - a.maxX, a.minX - b.maxX),
		gapY = Math.max(b.minY - a.maxY, a.minY - b.maxY);
	if (gapX < -EPSILON && gapY < -EPSILON) return undefined;
	const sx = to.x >= from.x ? 1 : -1,
		sy = to.y >= from.y ? 1 : -1;
	const inside = (value: number, min: number, max: number) =>
		value >= min - EPSILON && value <= max + EPSILON;
	const jog = (p: VisioRoutePoint, q: VisioRoutePoint, horizontal: boolean): VisioRoutePoint[] => {
		const across = horizontal ? q.x - p.x : q.y - p.y;
		const turn = Math.sign(across) * Math.min(VISIO_ROUTE_CLEARANCE, Math.abs(across) * JOG);
		return horizontal
			? [p, { x: p.x + turn, y: p.y }, { x: p.x + turn, y: q.y }, q]
			: [p, { x: p.x, y: p.y + turn }, { x: q.x, y: p.y + turn }, q];
	};
	let path: VisioRoutePoint[];
	if (gapX >= -EPSILON && inside(from.y, b.minY, b.maxY))
		path = jog(side(begin, sx, 0), side(end, -sx, 0), true);
	else if (gapY >= -EPSILON && inside(from.x, b.minX, b.maxX))
		path = jog(side(begin, 0, sy), side(end, 0, -sy), false);
	else if (gapY < -EPSILON || (gapY < CHANNEL && gapX >= CHANNEL)) {
		const p = side(begin, sx, 0);
		const q = side(end, 0, p.y <= to.y ? -1 : 1);
		path = [p, { x: q.x, y: p.y }, q];
	} else {
		const p = side(begin, 0, sy);
		const q = side(end, -sx, 0);
		path = [p, { x: p.x, y: q.y }, q];
	}
	const simple = simplifyVisioRoute(path);
	return simple.length >= 2 ? simple : undefined;
}

/** Where the segment from a shape's centre towards `target` leaves the shape's outline. */
function exit(shape: NonNullable<VisioWalkEnd['shape']>, target: VisioRoutePoint): VisioRoutePoint {
	const o = shape.center;
	const dx = target.x - o.x,
		dy = target.y - o.y;
	let best = Infinity;
	for (const [index, p] of shape.corners.entries()) {
		const q = shape.corners[(index + 1) % shape.corners.length]!;
		const ex = q.x - p.x,
			ey = q.y - p.y;
		const det = dx * ey - dy * ex;
		if (Math.abs(det) <= EPSILON) continue;
		const t = ((p.x - o.x) * ey - (p.y - o.y) * ex) / det;
		const u = ((p.x - o.x) * dy - (p.y - o.y) * dx) / det;
		if (t > EPSILON && u >= -EPSILON && u <= 1 + EPSILON && t < best) best = t;
	}
	return Number.isFinite(best) ? { x: o.x + dx * best, y: o.y + dy * best } : o;
}

/**
 * The vertices of Visio's Dynamic connector between two ends for a route style, or undefined
 * when the simple path is blocked or the shapes overlap (the caller's router then takes over).
 * Straight (centre to centre) runs between the outlines along the line that joins the middles;
 * curved is one cubic that leaves and arrives the way the right-angle path would.
 */
export function visioWalkRoute(
	begin: VisioWalkEnd,
	end: VisioWalkEnd,
	route: 'right-angle' | 'straight' | 'curved',
	obstacles: readonly VisioRouteBox[] = [],
): VisioRoutePoint[] | undefined {
	if (route === 'straight') {
		const p = begin.shape ? exit(begin.shape, center(end)) : begin.point!;
		const q = end.shape ? exit(end.shape, center(begin)) : end.point!;
		return Math.hypot(q.x - p.x, q.y - p.y) > EPSILON ? [p, q] : undefined;
	}
	const path = visioWalkPath(begin, end);
	if (!path || routeCrossings(path, obstacles)) return undefined;
	if (route === 'right-angle') return path;
	const unit = (p: VisioRoutePoint, q: VisioRoutePoint): VisioRoutePoint => {
		const length = Math.hypot(q.x - p.x, q.y - p.y) || 1;
		return { x: (q.x - p.x) / length, y: (q.y - p.y) / length };
	};
	return visioCurvedRoute(
		{ point: path[0]!, normal: unit(path[0]!, path[1]!) },
		{ point: path.at(-1)!, normal: unit(path.at(-1)!, path.at(-2)!) },
	);
}
