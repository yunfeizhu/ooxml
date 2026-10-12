import type { VisioPage, VisioShape } from '../model';
import type {
	VisioCalloutStyle,
	VisioContainerStyle,
	VisioInsertCalloutEdit,
	VisioInsertContainerEdit,
	VisioPartBox,
} from '../edit-diagram-parts-commands';
import { visioNextShapeId } from './shape-id';

/** Size of a new empty container and of a new callout, in page inches. */
const EMPTY_CONTAINER = { width: 3, height: 2 };
const CALLOUT = { width: 1.5, height: 0.6 };
/** How far a new callout sits above and to the right of its target, in page inches. */
const CALLOUT_OFFSET = 0.5;

const topLevel = (page: VisioPage, id: string) => page.shapes.find((shape) => shape.id === id);
/** The page-space (y-up) bounds of a top-level shape's alignment box. */
function bounds(shape: VisioShape) {
	const [a, b, c, d, e, f] = shape.transform;
	const xs: number[] = [],
		ys: number[] = [];
	for (const [x, y] of [
		[0, 0],
		[shape.width, 0],
		[0, shape.height],
		[shape.width, shape.height],
	] as const) {
		xs.push(a * x + c * y + e);
		ys.push(b * x + d * y + f);
	}
	return {
		minX: Math.min(...xs),
		maxX: Math.max(...xs),
		minY: Math.min(...ys),
		maxY: Math.max(...ys),
	};
}
/** A page-inch box in the edit API's drawing inches. */
function drawingBox(page: VisioPage, box: VisioPartBox): VisioPartBox {
	const ratio = page.drawingToPageScale ?? 1;
	if (!Number.isFinite(ratio) || ratio <= 0) throw new Error('Invalid page scale.');
	return {
		x: box.x / ratio,
		y: box.y / ratio,
		width: box.width / ratio,
		height: box.height / ratio,
	};
}
const clamp = (value: number, low: number, high: number) =>
	Math.min(Math.max(value, low), Math.max(low, high));

/**
 * Insert > Container around the selected top-level shapes, or an empty one at the page centre
 * when nothing is selected. Source admission (members, IDs) stays authoritative in core.
 */
export function visioContainerCommand(
	page: VisioPage,
	shapeIds: readonly string[],
	style: VisioContainerStyle,
	heading = 'Container',
): VisioInsertContainerEdit | undefined {
	if (shapeIds.length > 1000 || new Set(shapeIds).size !== shapeIds.length) return undefined;
	const members = shapeIds.map((id) => topLevel(page, id));
	if (members.some((shape) => !shape || shape.hidden)) return undefined;
	let shapeId: string;
	try {
		shapeId = visioNextShapeId(page);
	} catch {
		return undefined;
	}
	// Members keep the page's stacking order, so the container goes behind the lowest one.
	const order = new Map(page.shapes.map((shape, index) => [shape.id, index]));
	const memberIds = [...shapeIds].sort((a, b) => order.get(a)! - order.get(b)!);
	return {
		type: 'insert-container',
		pageId: page.id,
		shapeId,
		memberIds,
		style,
		heading,
		...(memberIds.length
			? {}
			: {
					box: drawingBox(page, {
						x: page.width / 2,
						y: page.height / 2,
						...EMPTY_CONTAINER,
					}),
				}),
	};
}

/**
 * Insert > Callout for exactly one selected top-level 2D shape: the callout sits above and to the
 * right of it, kept on the page, with a leader glued to both. Core refuses unsupported targets.
 */
export function visioCalloutCommand(
	page: VisioPage,
	shapeIds: readonly string[],
	style: VisioCalloutStyle,
	text = '',
): VisioInsertCalloutEdit | undefined {
	if (shapeIds.length !== 1) return undefined;
	const target = topLevel(page, shapeIds[0]!);
	if (!target || target.hidden || target.kind === 'connector' || !(target.width > 0))
		return undefined;
	if (!(target.height > 0)) return undefined;
	let shapeId: string;
	try {
		shapeId = visioNextShapeId(page);
	} catch {
		return undefined;
	}
	if (Number(shapeId) >= 4294967295) return undefined;
	const box = bounds(target);
	const { width, height } = CALLOUT;
	const x = clamp(box.maxX + CALLOUT_OFFSET + width / 2, width / 2, page.width - width / 2);
	const y = clamp(box.maxY + CALLOUT_OFFSET + height / 2, height / 2, page.height - height / 2);
	return {
		type: 'insert-callout',
		pageId: page.id,
		shapeId,
		leaderId: String(Number(shapeId) + 1),
		targetId: target.id,
		style,
		text,
		box: drawingBox(page, { x, y, width, height }),
	};
}

/**
 * Containers move their members: the selection plus every listed member that is still a
 * top-level shape on the page. Callouts are left out; their glued leaders follow on their own.
 */
export function visioWithContainerMembers(page: VisioPage, ids: readonly string[]): string[] {
	const result = [...ids];
	const seen = new Set(ids);
	for (let index = 0; index < result.length && result.length <= 1000; index++) {
		const structure = topLevel(page, result[index]!)?.structure;
		if (structure?.type !== 'container') continue;
		for (const member of structure.memberIds)
			if (!seen.has(member) && topLevel(page, member)) {
				seen.add(member);
				result.push(member);
			}
	}
	return result;
}

/** Shapes that go with the selection on delete: a callout's own leader connector. */
export function visioWithCalloutLeaders(page: VisioPage, ids: readonly string[]): string[] {
	const result = [...ids];
	for (const id of ids) {
		const structure = topLevel(page, id)?.structure;
		const leader = structure?.type === 'callout' ? structure.leaderId : undefined;
		if (
			leader &&
			!result.includes(leader) &&
			topLevel(page, leader) &&
			page.connectors.some(
				(connection) => connection.fromShapeId === leader && connection.toShapeId === id,
			)
		)
			result.push(leader);
	}
	return result;
}
