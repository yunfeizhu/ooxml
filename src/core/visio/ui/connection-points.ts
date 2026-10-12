import type { VisioMatrix, VisioPage, VisioShape } from '../model';
import type { VisioGeometryEdit } from '../edit-commands';
import type { VisioConnectorRoute } from '../edit-connector-commands';

/** A point in the scene's y-up page coordinates (physical page inches). */
export interface VisioScenePoint {
	x: number;
	y: number;
}
const apply = (m: VisioMatrix, x: number, y: number): VisioScenePoint => ({
	x: m[0] * x + m[2] * y + m[4],
	y: m[1] * x + m[3] * y + m[5],
});
/** Page coordinates to a top-level shape's local coordinates, if its transform is invertible. */
export function visioSceneToLocal(
	shape: VisioShape,
	point: VisioScenePoint,
): VisioScenePoint | undefined {
	const [a, b, c, d, e, f] = shape.transform;
	const determinant = a * d - b * c;
	if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) return undefined;
	const x = point.x - e,
		y = point.y - f;
	return { x: (d * x - c * y) / determinant, y: (a * y - b * x) / determinant };
}

/**
 * A top-level shape the core can glue to or give connection points: visible, local and 2D.
 * Master instances keep their master's points; groups and 1D shapes are refused.
 */
export function visioConnectableShape(shape: VisioShape | undefined): shape is VisioShape {
	return (
		!!shape &&
		shape.kind === 'shape' &&
		!shape.hidden &&
		!shape.masterId &&
		!shape.children.length &&
		shape.width > 0 &&
		shape.height > 0
	);
}

/**
 * A top-level shape a connector end can glue to: a drawn 2D shape, or a stencil shape (master
 * instance) made of one shape, whose size and connection points the core reads through its master.
 */
export function visioGlueableShape(shape: VisioShape | undefined): shape is VisioShape {
	return (
		!!shape &&
		shape.kind === 'shape' &&
		!shape.hidden &&
		!shape.children.length &&
		shape.width > 0 &&
		shape.height > 0
	);
}

/** A connection point in page coordinates. */
export interface VisioConnectionPointHit {
	shapeId: string;
	index: number;
	x: number;
	y: number;
	distance: number;
}
/** Every connection point of the page's top-level shapes, in page coordinates. */
export function visioPageConnectionPoints(
	page: VisioPage,
	eligible: (shape: VisioShape) => boolean = () => true,
): Omit<VisioConnectionPointHit, 'distance'>[] {
	return page.shapes.flatMap((shape) =>
		eligible(shape)
			? (shape.connectionPoints ?? []).map((point) => ({
					shapeId: shape.id,
					index: point.index,
					...apply(shape.transform, point.x, point.y),
				}))
			: [],
	);
}
/** The nearest glueable connection point within `radius` page inches of `point`. */
export function visioNearestConnectionPoint(
	page: VisioPage,
	point: VisioScenePoint,
	radius: number,
	eligible: (shape: VisioShape) => boolean = visioGlueableShape,
): VisioConnectionPointHit | undefined {
	let best: VisioConnectionPointHit | undefined;
	for (const candidate of visioPageConnectionPoints(page, eligible)) {
		const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
		if (distance <= radius && (!best || distance < best.distance))
			best = { ...candidate, distance };
	}
	return best;
}

/**
 * The Connection Point tool's command for a click at `point` inside a shape: a new row at that
 * fraction of the shape's size (rounded to 1/10000).
 */
export function visioAddConnectionPointCommand(
	page: VisioPage,
	shape: VisioShape,
	point: VisioScenePoint,
): Extract<VisioGeometryEdit, { type: 'add-connection-point' }> | undefined {
	if (!visioConnectableShape(shape)) return undefined;
	const local = visioSceneToLocal(shape, point);
	if (!local) return undefined;
	const fraction = (value: number, size: number) =>
		Math.round(Math.min(1, Math.max(0, value / size)) * 10_000) / 10_000;
	const x = fraction(local.x, shape.width),
		y = fraction(local.y, shape.height);
	if (
		local.x < -1e-6 ||
		local.y < -1e-6 ||
		local.x > shape.width + 1e-6 ||
		local.y > shape.height + 1e-6
	)
		return undefined;
	return { type: 'add-connection-point', pageId: page.id, shapeId: shape.id, x, y };
}

/** Local begin and end handles of a line or connector the core can move endpoint by endpoint. */
export function visioConnectorEndHandles(
	shape: VisioShape,
): { begin: VisioScenePoint; end: VisioScenePoint } | undefined {
	if (
		shape.kind !== 'connector' ||
		shape.hidden ||
		shape.children.length ||
		!shape.lineEnds ||
		// A stencil connector (Visio's Dynamic connector) keeps the routed form for every route.
		!(
			shape.masterId !== undefined ||
			shape.connectorRoute === 'right-angle' ||
			shape.connectorRoute === 'curved'
		)
	)
		return undefined;
	return shape.lineEnds;
}

/**
 * The route of a dynamic connector whose route Design > Connectors can change: one with route
 * cells (drawn by the Connector tool) or a stencil connector. Plain lines have none.
 */
export function visioConnectorRouteOf(shape: VisioShape): VisioConnectorRoute | undefined {
	if (shape.kind !== 'connector' || shape.children.length) return undefined;
	// Visio's Dynamic connector (a stencil instance) is right-angle until its cells say otherwise.
	return (
		shape.connectorRoute ??
		(shape.masterId !== undefined && shape.lineEnds ? 'right-angle' : undefined)
	);
}
