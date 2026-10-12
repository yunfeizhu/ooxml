import type { VisioPage, VisioShape, VisioMatrix } from '../model';
import type { VisioEdit } from '../edit-commands';
import { visioAnchoredResizeGeometry, type VisioResizeAnchor } from '../resize-anchor';
import { visioMovementShape, visioPageDragDelta, type VisioPagePoint } from './shape-move';
import { visioPageEditToDrawing } from './page-edit';

export const VISIO_RESIZE_HANDLES = [
	{ id: 'sw', x: 0, y: 0 },
	{ id: 's', x: 0.5, y: 0 },
	{ id: 'se', x: 1, y: 0 },
	{ id: 'e', x: 1, y: 0.5 },
	{ id: 'ne', x: 1, y: 1 },
	{ id: 'n', x: 0.5, y: 1 },
	{ id: 'nw', x: 0, y: 1 },
	{ id: 'w', x: 0, y: 0.5 },
] as const;
export type VisioResizeHandle = (typeof VISIO_RESIZE_HANDLES)[number]['id'];
export interface VisioResizeFrame {
	width: number;
	height: number;
	transform: VisioMatrix;
	pinX: number;
	pinY: number;
}
/** Only orthonormal ordinary local shapes have a scene-proven rectangular resize frame. */
export function visioResizeShape(page: VisioPage, id: string): VisioShape | undefined {
	const shape = visioMovementShape(page, id);
	// Groups drawn here move but do not resize: members carry no group-scaling formulas yet. A
	// stencil group resizes: its sub-shapes follow it through the master's formulas.
	// Layered local shapes move, but core resize admission still refuses their layer membership;
	// stencil shapes are resized on their (unlocked) stencil layer.
	return shape &&
		(!shape.children.length || !!shape.masterId) &&
		(!shape.layerIds?.length || !!shape.masterId) &&
		visioResizeFrame(shape, { width: shape.width, height: shape.height }, { x: 0, y: 0 })
		? shape
		: undefined;
}
export function visioResizeFrame(
	shape: VisioShape,
	size: { width: number; height: number },
	anchor: VisioResizeAnchor,
): VisioResizeFrame | undefined {
	if (!shape.rotation) return undefined;
	const geometry = visioAnchoredResizeGeometry(
		{ ...shape, pinX: shape.rotation.pinX, pinY: shape.rotation.pinY },
		size,
		anchor,
	);
	return geometry
		? {
				width: size.width,
				height: size.height,
				transform: geometry.transform,
				pinX: geometry.pinX,
				pinY: geometry.pinY,
			}
		: undefined;
}
/** Drag in physical page coordinates along the saved rotated/reflected local axes.
 * Crossing the opposite handle clamps at 1/16 physical inch; it does not silently change flips.
 */
export function visioResizeDrag(
	page: VisioPage,
	id: string,
	handle: VisioResizeHandle,
	start: VisioPagePoint,
	end: VisioPagePoint,
): { frame: VisioResizeFrame; command: Extract<VisioEdit, { type: 'resize-shape' }> } | undefined {
	const shape = visioResizeShape(page, id),
		location = VISIO_RESIZE_HANDLES.find((item) => item.id === handle);
	if (!shape || !location) return undefined;
	const delta = visioPageDragDelta(start, end),
		[a, b, c, d] = shape.transform,
		determinant = a * d - b * c;
	const x = (d * delta.x - c * delta.y) / determinant,
		y = (-b * delta.x + a * delta.y) / determinant;
	const size = {
		width:
			location.x === 0.5
				? shape.width
				: Math.max(Math.min(1 / 16, shape.width), shape.width + (location.x === 1 ? x : -x)),
		height:
			location.y === 0.5
				? shape.height
				: Math.max(Math.min(1 / 16, shape.height), shape.height + (location.y === 1 ? y : -y)),
	};
	const anchor: VisioResizeAnchor = {
		x: (1 - location.x) as VisioResizeAnchor['x'],
		y: (1 - location.y) as VisioResizeAnchor['y'],
	};
	const frame = visioResizeFrame(shape, size, anchor);
	if (!frame) return undefined;
	try {
		const command = visioPageEditToDrawing(page, {
			type: 'resize-shape',
			pageId: page.id,
			shapeId: id,
			...size,
			anchor,
		});
		return command.type === 'resize-shape' && command.width <= 1e6 && command.height <= 1e6
			? { frame, command }
			: undefined;
	} catch {
		return undefined;
	}
}
