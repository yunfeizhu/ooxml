import type { VisioConnectorRoute } from '../edit-commands';
import type { VisioPage, VisioShape } from '../model';
import type { VisioOutlineShape } from '../stencil-shapes';
import { visioGlueableShape } from './connection-points';
import type { VisioEdit } from '../edit-commands';
import { visioBuiltInMaster } from '../stencil-masters';
import { visioStencilDropCommand } from './master-drop';
import {
	visioBoxCreationCommand,
	visioConnectorCreationCommand,
	type VisioDrawingPoint,
} from './draw-plan';
import { visioShapePageBox, type VisioPageBox } from './marquee';

export type VisioAutoConnectDirection = 'up' | 'right' | 'down' | 'left';
export const VISIO_AUTO_CONNECT_DIRECTIONS: readonly VisioAutoConnectDirection[] = [
	'up',
	'right',
	'down',
	'left',
];
/**
 * Space Visio leaves between the source and the shape AutoConnect adds: the page's "space
 * between shapes" (AvenueSizeX/Y), 0.375 in. on a new drawing. Recorded from Visio 16:
 * a 1.5 x 1 in. rectangle gets its neighbour 1.875 in. to the side and 1.375 in. above or below.
 * The page's own avenue size is not read; the default is used for every page.
 */
export const VISIO_AUTO_CONNECT_GAP = 0.375;
/** A neighbour further than this from the source side is not what the arrow points at. */
export const VISIO_AUTO_CONNECT_REACH = 2;
const SLOTS = 24;
const EPSILON = 1e-6;

/** How the core creates the added shape: a native ellipse or a stencil outline. */
export type VisioAutoConnectMaster =
	| { kind: 'ellipse' }
	| { kind: 'rectangle'; shape: VisioOutlineShape }
	/** A built-in stencil master, dropped as an instance (the size is the master's own). */
	| { kind: 'stencil'; master: string };
export type VisioAutoConnectTarget =
	| { shapeId: string }
	| { master: VisioAutoConnectMaster; size: { width: number; height: number } };
export interface VisioAutoConnectPlan {
	/** The creation edits, in order: the new shape (if any), then the glued connector. */
	edits: VisioEdit[];
	connectorId: string;
	/** The shape the connector ends on: the neighbour, or the shape the plan adds. */
	targetId: string;
	added: boolean;
}

/** A top-level shape AutoConnect starts from or ends on: visible, local and two-dimensional. */
export function visioAutoConnectShape(page: VisioPage, shapeId: string): VisioShape | undefined {
	const shape = page.shapes.find((candidate) => candidate.id === shapeId);
	return visioGlueableShape(shape) && visioShapePageBox(page, shape) ? shape : undefined;
}

const horizontal = (direction: VisioAutoConnectDirection) =>
	direction === 'left' || direction === 'right';
/** +1 along the axis for right and down (physical page inches run downward). */
const sign = (direction: VisioAutoConnectDirection) =>
	direction === 'right' || direction === 'down' ? 1 : -1;
const centre = (box: VisioPageBox): VisioDrawingPoint => ({
	x: box.x + box.width / 2,
	y: box.y + box.height / 2,
});

/** The midpoint of the side of `box` that faces `direction`, moved `offset` inches outward. */
export function visioAutoConnectSidePoint(
	box: VisioPageBox,
	direction: VisioAutoConnectDirection,
	offset = 0,
): VisioDrawingPoint {
	const middle = centre(box);
	return horizontal(direction)
		? { x: middle.x + sign(direction) * (box.width / 2 + offset), y: middle.y }
		: { x: middle.x, y: middle.y + sign(direction) * (box.height / 2 + offset) };
}

/**
 * Where the four AutoConnect arrows of a shape sit: `offset` page inches outside each side of its
 * bounding box, in physical, downward-positive page inches.
 */
export function visioAutoConnectArrows(
	page: VisioPage,
	shape: VisioShape,
	offset: number,
): { direction: VisioAutoConnectDirection; x: number; y: number }[] {
	const box = visioShapePageBox(page, shape);
	if (!box || !(offset >= 0) || !Number.isFinite(offset)) return [];
	return VISIO_AUTO_CONNECT_DIRECTIONS.map((direction) => ({
		direction,
		...visioAutoConnectSidePoint(box, direction, offset),
	}));
}

const overlaps = (a: VisioPageBox, b: VisioPageBox, margin = 0) =>
	a.x < b.x + b.width + margin - EPSILON &&
	b.x < a.x + a.width + margin - EPSILON &&
	a.y < b.y + b.height + margin - EPSILON &&
	b.y < a.y + a.height + margin - EPSILON;

/**
 * The shape an arrow points at: the nearest connectable shape that starts beyond that side of the
 * source, within `VISIO_AUTO_CONNECT_REACH`, and overlaps it across the direction.
 */
export function visioAutoConnectNeighbor(
	page: VisioPage,
	shape: VisioShape,
	direction: VisioAutoConnectDirection,
): VisioShape | undefined {
	const from = visioShapePageBox(page, shape);
	if (!from) return undefined;
	let best: { shape: VisioShape; gap: number } | undefined;
	for (const candidate of page.shapes) {
		if (candidate.id === shape.id || !visioGlueableShape(candidate)) continue;
		const box = visioShapePageBox(page, candidate);
		if (!box) continue;
		const across = horizontal(direction)
			? box.y < from.y + from.height - EPSILON && from.y < box.y + box.height - EPSILON
			: box.x < from.x + from.width - EPSILON && from.x < box.x + box.width - EPSILON;
		if (!across) continue;
		const gap =
			direction === 'right'
				? box.x - (from.x + from.width)
				: direction === 'left'
					? from.x - (box.x + box.width)
					: direction === 'down'
						? box.y - (from.y + from.height)
						: from.y - (box.y + box.height);
		if (gap < -EPSILON || gap > VISIO_AUTO_CONNECT_REACH) continue;
		if (!best || gap < best.gap) best = { shape: candidate, gap };
	}
	return best?.shape;
}

/**
 * The centre of a shape of `size` added in `direction`: one gap beyond the source side, in line
 * with the source. When another shape is in the way, the place moves on by one shape and gap to
 * the right (for up and down) or downward (for left and right), as Visio does.
 */
export function visioAutoConnectPlacement(
	page: VisioPage,
	shape: VisioShape,
	direction: VisioAutoConnectDirection,
	size: { width: number; height: number },
): VisioDrawingPoint | undefined {
	const from = visioShapePageBox(page, shape);
	if (!from || ![size.width, size.height].every((value) => Number.isFinite(value) && value > 0))
		return undefined;
	const along = horizontal(direction) ? size.width : size.height;
	const start = visioAutoConnectSidePoint(from, direction, VISIO_AUTO_CONNECT_GAP + along / 2);
	const others = page.shapes.flatMap((candidate) => {
		if (candidate.hidden || candidate.kind === 'connector') return [];
		const box = visioShapePageBox(page, candidate);
		return box ? [box] : [];
	});
	for (let slot = 0; slot < SLOTS; ++slot) {
		const point = horizontal(direction)
			? { x: start.x, y: start.y + slot * (size.height + VISIO_AUTO_CONNECT_GAP) }
			: { x: start.x + slot * (size.width + VISIO_AUTO_CONNECT_GAP), y: start.y };
		const box = {
			x: point.x - size.width / 2,
			y: point.y - size.height / 2,
			width: size.width,
			height: size.height,
		};
		if (!others.some((other) => overlaps(box, other))) return point;
	}
	return start;
}

/**
 * AutoConnect as creation edits: a connector glued from `shapeId` to the neighbour, or a new
 * shape placed by `visioAutoConnectPlacement` followed by the connector glued to it. Both ends
 * use shape (dynamic) glue, so the core routes them to the facing sides.
 */
export function visioAutoConnectPlan(
	page: VisioPage,
	shapeId: string,
	direction: VisioAutoConnectDirection,
	target: VisioAutoConnectTarget,
	route: VisioConnectorRoute = 'right-angle',
): VisioAutoConnectPlan | undefined {
	const source = visioAutoConnectShape(page, shapeId);
	const from = source && visioShapePageBox(page, source);
	if (!source || !from) return undefined;
	// The ends start at the two centres: glued ends are routed to the facing sides by the core,
	// and side midpoints would coincide for shapes that touch.
	const begin = centre(from);
	if ('shapeId' in target) {
		const neighbour =
			target.shapeId === source.id ? undefined : visioAutoConnectShape(page, target.shapeId);
		const to = neighbour && visioShapePageBox(page, neighbour);
		if (!neighbour || !to || Math.hypot(centre(to).x - begin.x, centre(to).y - begin.y) < EPSILON)
			return undefined;
		const connector = visioConnectorCreationCommand(
			page,
			begin,
			centre(to),
			{ begin: source.id, end: neighbour.id },
			route,
		);
		return {
			edits: [connector],
			connectorId: connector.shapeId,
			targetId: neighbour.id,
			added: false,
		};
	}
	const point = visioAutoConnectPlacement(page, source, direction, target.size);
	if (!point) return undefined;
	const stencil = target.master.kind === 'stencil' ? target.master.master : undefined;
	if (stencil !== undefined && !visioBuiltInMaster(stencil)) return undefined;
	const box: VisioEdit & { shapeId: string } =
		target.master.kind === 'stencil'
			? visioStencilDropCommand(page, target.master.master, point, false)
			: target.master.kind === 'ellipse'
				? visioBoxCreationCommand(page, 'ellipse', point, target.size)
				: visioBoxCreationCommand(
						page,
						'rectangle',
						point,
						target.size,
						undefined,
						target.master.shape,
					);
	const to = {
		x: point.x - target.size.width / 2,
		y: point.y - target.size.height / 2,
		...target.size,
	};
	const next = Number(box.shapeId) + 1;
	if (!Number.isSafeInteger(next) || next > 4294967295) return undefined;
	const connector = {
		...visioConnectorCreationCommand(
			page,
			begin,
			centre(to),
			{ begin: source.id, end: box.shapeId },
			route,
		),
		// The connector is created after the shape, which takes the page's next id.
		shapeId: String(next),
	};
	return {
		edits: [box, connector],
		connectorId: connector.shapeId,
		targetId: box.shapeId,
		added: true,
	};
}
