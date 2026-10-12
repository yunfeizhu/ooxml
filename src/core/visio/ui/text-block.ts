import type { VisioMatrix, VisioPage, VisioShape } from '../model';
import type { VisioTextFormatEdit } from '../edit-commands';
import { visioStyleFormattingShape } from './formatting';

/** A text block in shape-local inches (y up): centre, size and counter-clockwise angle. */
export interface VisioTextBlockFrame {
	x: number;
	y: number;
	width: number;
	height: number;
	angle: number;
}
export type VisioTextBlockHandle =
	| 'move'
	| 'rotate'
	| 'nw'
	| 'n'
	| 'ne'
	| 'e'
	| 'se'
	| 's'
	| 'sw'
	| 'w';
/** Resize handles at fractions of the block (y up, so `n` is y = 1). */
export const VISIO_TEXT_BLOCK_HANDLES: readonly {
	id: Exclude<VisioTextBlockHandle, 'move' | 'rotate'>;
	x: number;
	y: number;
}[] = [
	{ id: 'nw', x: 0, y: 1 },
	{ id: 'n', x: 0.5, y: 1 },
	{ id: 'ne', x: 1, y: 1 },
	{ id: 'e', x: 1, y: 0.5 },
	{ id: 'se', x: 1, y: 0 },
	{ id: 's', x: 0.5, y: 0 },
	{ id: 'sw', x: 0, y: 0 },
	{ id: 'w', x: 0, y: 0.5 },
];
const MIN = 0.05;
const apply = (m: VisioMatrix, x: number, y: number) => ({
	x: m[0] * x + m[2] * y + m[4],
	y: m[1] * x + m[3] * y + m[5],
});
function invert(m: VisioMatrix): VisioMatrix | undefined {
	const det = m[0] * m[3] - m[1] * m[2];
	if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return undefined;
	return [
		m[3] / det,
		-m[1] / det,
		-m[2] / det,
		m[0] / det,
		(m[2] * m[5] - m[3] * m[4]) / det,
		(m[1] * m[4] - m[0] * m[5]) / det,
	];
}

/** A top-level 2D shape whose text block the Text Block tool may change. */
export function visioTextBlockShape(page: VisioPage, shapeId: string): VisioShape | undefined {
	const shape = visioStyleFormattingShape(page, shapeId);
	return shape && page.shapes.includes(shape) && shape.width > 0 && shape.height > 0
		? shape
		: undefined;
}

/** The shape's current text block frame. */
export function visioTextBlockFrame(shape: VisioShape): VisioTextBlockFrame {
	const t = shape.text.transform;
	const centre = apply(t, shape.text.width / 2, shape.text.height / 2);
	return {
		x: centre.x,
		y: centre.y,
		width: shape.text.width,
		height: shape.text.height,
		angle: Math.atan2(t[1], t[0]),
	};
}

/** Text-local (y up, origin at the block's bottom-left) to shape-local transform of a frame. */
export function visioTextBlockMatrix(frame: VisioTextBlockFrame): VisioMatrix {
	const cos = Math.cos(frame.angle),
		sin = Math.sin(frame.angle);
	const origin = {
		x: frame.x - (cos * frame.width) / 2 + (sin * frame.height) / 2,
		y: frame.y - (sin * frame.width) / 2 - (cos * frame.height) / 2,
	};
	return [cos, sin, -sin, cos, origin.x, origin.y];
}

/** A page point (y up) in the shape's local coordinates. */
export function visioShapeLocalPoint(shape: VisioShape, point: { x: number; y: number }) {
	const inverse = invert(shape.transform);
	return inverse ? apply(inverse, point.x, point.y) : undefined;
}

/** Frame after dragging a handle from `start` to `point`, both shape-local. */
export function visioTextBlockDrag(
	frame: VisioTextBlockFrame,
	handle: VisioTextBlockHandle,
	start: { x: number; y: number },
	point: { x: number; y: number },
): VisioTextBlockFrame {
	if (handle === 'move')
		return { ...frame, x: frame.x + point.x - start.x, y: frame.y + point.y - start.y };
	if (handle === 'rotate') {
		const angle = Math.atan2(point.y - frame.y, point.x - frame.x) - Math.PI / 2;
		const degrees = Math.round((angle * 180) / Math.PI);
		return { ...frame, angle: (((((degrees + 180) % 360) + 360) % 360) - 180) * (Math.PI / 180) };
	}
	const location = VISIO_TEXT_BLOCK_HANDLES.find((item) => item.id === handle)!;
	const inverse = invert(visioTextBlockMatrix(frame))!;
	const local = apply(inverse, point.x, point.y);
	// The opposite edge stays fixed in the block's own (rotated) frame.
	let left = 0,
		right = frame.width,
		bottom = 0,
		top = frame.height;
	if (location.x === 0) left = Math.min(local.x, right - MIN);
	if (location.x === 1) right = Math.max(local.x, left + MIN);
	if (location.y === 0) bottom = Math.min(local.y, top - MIN);
	if (location.y === 1) top = Math.max(local.y, bottom + MIN);
	const centre = apply(visioTextBlockMatrix(frame), (left + right) / 2, (bottom + top) / 2);
	return { ...frame, x: centre.x, y: centre.y, width: right - left, height: top - bottom };
}

/** The format-text edit that stores a frame as proportions of the shape. */
export function visioTextBlockEdit(
	page: VisioPage,
	shape: VisioShape,
	frame: VisioTextBlockFrame,
): VisioTextFormatEdit {
	return {
		type: 'format-text',
		pageId: page.id,
		shapeId: shape.id,
		textBlock: {
			x: frame.x / shape.width,
			y: frame.y / shape.height,
			width: Math.max(frame.width, MIN) / shape.width,
			height: Math.max(frame.height, MIN) / shape.height,
			angle: frame.angle,
		},
	};
}
