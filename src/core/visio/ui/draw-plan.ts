import type { VisioConnectorGlue, VisioConnectorRoute, VisioGeometryEdit } from '../edit-commands';
import type { VisioPage } from '../model';
import type { VisioOutlineShape } from '../stencil-shapes';
import { visioNextShapeId } from './shape-id';
import { visioPageEditToDrawing } from './page-edit';

export type VisioDrawingTool = 'rectangle' | 'ellipse' | 'line' | 'text';
/** Physical page inches, with the SVG top-left origin and downward Y axis. */
export interface VisioDrawingPoint {
	x: number;
	y: number;
}
export interface VisioDrawingBounds {
	x: number;
	y: number;
	width: number;
	height: number;
	centerX: number;
	centerY: number;
	radiusX: number;
	radiusY: number;
}
const SNAP = 1 / 16;
const boundedNumber = (value: number) => Number.isFinite(value) && Math.abs(value) <= 1_000_000;

export function visioDrawingPoint(
	page: VisioPage,
	point: VisioDrawingPoint,
	options: { snap?: boolean; bounded?: boolean } = {},
): VisioDrawingPoint | undefined {
	if (
		![point.x, point.y, page.width, page.height].every(boundedNumber) ||
		page.width <= 0 ||
		page.height <= 0
	)
		return undefined;
	const coordinate = (value: number, maximum: number) => {
		const bounded = options.bounded === false ? value : Math.max(0, Math.min(maximum, value));
		return options.snap === false ? bounded : Math.round(bounded / SNAP) * SNAP;
	};
	return { x: coordinate(point.x, page.width), y: coordinate(point.y, page.height) };
}

export function visioDrawBounds(
	start: VisioDrawingPoint,
	end: VisioDrawingPoint,
): VisioDrawingBounds {
	if (![start.x, start.y, end.x, end.y].every(boundedNumber))
		throw new Error('Invalid drawing bounds.');
	return {
		x: Math.min(start.x, end.x),
		y: Math.min(start.y, end.y),
		width: Math.abs(end.x - start.x),
		height: Math.abs(end.y - start.y),
		centerX: (start.x + end.x) / 2,
		centerY: (start.y + end.y) / 2,
		radiusX: Math.abs(end.x - start.x) / 2,
		radiusY: Math.abs(end.y - start.y) / 2,
	};
}

export function visioBoxCreationCommand(
	page: VisioPage,
	kind: Exclude<VisioDrawingTool, 'line'>,
	centre: VisioDrawingPoint,
	size: { width: number; height: number },
	text?: string,
	/** A Basic Shapes outline for a rectangle-kind box (see `VISIO_BASIC_SHAPES`). */
	shape?: VisioOutlineShape,
): VisioGeometryEdit {
	if (
		!['rectangle', 'ellipse', 'text'].includes(kind) ||
		![centre.x, centre.y, size.width, size.height].every(boundedNumber) ||
		size.width <= 0 ||
		size.height <= 0
	)
		throw new Error('Invalid box creation geometry or tool.');
	const box = {
		pageId: page.id,
		shapeId: visioNextShapeId(page),
		x: centre.x,
		y: page.height - centre.y,
		width: size.width,
		height: size.height,
	};
	const command: VisioGeometryEdit =
		kind === 'text'
			? { ...box, type: 'create-text-box', text: text ?? '' }
			: {
					...box,
					type: kind === 'ellipse' ? 'create-ellipse' : 'create-rectangle',
					...(text === undefined ? {} : { text }),
					...(kind === 'rectangle' && shape !== undefined ? { shape } : {}),
				};
	return drawingCommand(page, command);
}

function drawingCommand(page: VisioPage, command: VisioGeometryEdit): VisioGeometryEdit {
	const result = visioPageEditToDrawing(page, command) as VisioGeometryEdit;
	if (Object.values(result).some((value) => typeof value === 'number' && !boundedNumber(value)))
		throw new Error('Drawing coordinates exceed finite limits.');
	return result;
}

export function visioLineCreationCommand(
	page: VisioPage,
	begin: VisioDrawingPoint,
	end: VisioDrawingPoint,
): VisioGeometryEdit {
	if (![begin.x, begin.y, end.x, end.y].every(boundedNumber))
		throw new Error('Invalid line creation geometry.');
	return drawingCommand(page, {
		type: 'create-line',
		pageId: page.id,
		shapeId: visioNextShapeId(page),
		beginX: begin.x,
		beginY: page.height - begin.y,
		endX: end.x,
		endY: page.height - end.y,
	});
}

/**
 * A straight connector from the Connector tool. Ends dropped on shapes glue to them with native
 * dynamic glue; the core moves glued ends to the facing side midpoints. An end dropped on the
 * same shape as the begin end, or on empty canvas, stays unglued.
 */
export function visioConnectorCreationCommand(
	page: VisioPage,
	begin: VisioDrawingPoint,
	end: VisioDrawingPoint,
	glue: VisioConnectorGlue,
	route?: VisioConnectorRoute,
): Extract<VisioGeometryEdit, { type: 'create-line' }> {
	const line = visioLineCreationCommand(page, begin, end) as Extract<
		VisioGeometryEdit,
		{ type: 'create-line' }
	>;
	const sameShape = glue.end !== undefined && glue.end === glue.begin;
	const connect: VisioConnectorGlue = {
		...(glue.begin === undefined ? {} : { begin: glue.begin }),
		...(glue.begin === undefined || glue.beginPoint === undefined
			? {}
			: { beginPoint: glue.beginPoint }),
		...(glue.end === undefined || sameShape ? {} : { end: glue.end }),
		...(glue.end === undefined || sameShape || glue.endPoint === undefined
			? {}
			: { endPoint: glue.endPoint }),
	};
	return { ...line, connect, ...(route ? { route } : {}) };
}

/** Fixed-bounds creation. Native click-only sizing and automatic text growth are not inferred. */
export function visioDrawIsLargeEnough(
	kind: VisioDrawingTool,
	start: VisioDrawingPoint,
	end: VisioDrawingPoint,
): boolean {
	if (
		!['rectangle', 'ellipse', 'line', 'text'].includes(kind) ||
		![start.x, start.y, end.x, end.y].every(boundedNumber)
	)
		return false;
	const bounds = visioDrawBounds(start, end);
	return kind === 'line'
		? Math.hypot(bounds.width, bounds.height) >= SNAP
		: bounds.width >= SNAP && bounds.height >= SNAP;
}

export function visioDrawPlan(
	page: VisioPage,
	kind: VisioDrawingTool,
	start: VisioDrawingPoint,
	end: VisioDrawingPoint,
	text?: string,
): VisioGeometryEdit | undefined {
	if (!visioDrawIsLargeEnough(kind, start, end)) return undefined;
	const bounds = visioDrawBounds(start, end);
	return kind === 'line'
		? visioLineCreationCommand(page, start, end)
		: visioBoxCreationCommand(page, kind, { x: bounds.centerX, y: bounds.centerY }, bounds, text);
}
