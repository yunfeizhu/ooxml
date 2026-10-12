import { arrowKeyDelta } from '../../geometry/nudge';
import type { VisioEdit } from '../edit-commands';
import type { VisioMatrix, VisioPage, VisioShape } from '../model';
import { visioStyleFormattingShape } from './formatting';
import { visioPageEditToDrawing } from './page-edit';
import { visioMovableGroup } from './shape-group';
import { visioWithContainerMembers } from './diagram-parts';

export interface VisioPagePoint {
	x: number;
	y: number;
}
/** A local top-level shape on layers that are all unlocked; layers never block a move in core. */
function layeredShape(page: VisioPage, id: string): VisioShape | undefined {
	const matches = page.shapes.filter((shape) => shape.id === id);
	const shape = matches.length === 1 ? matches[0]! : undefined;
	if (!shape?.layerIds?.length) return undefined;
	const unlayered = { ...page, shapes: [{ ...shape, layerIds: [] }] };
	const plain = visioStyleFormattingShape(unlayered, id) ?? visioMovableGroup(unlayered, id);
	const locked = shape.layerIds.some(
		(layer) => page.layers?.find((entry) => entry.id === layer)?.locked !== false,
	);
	return plain && !locked ? shape : undefined;
}
/** Source admission remains authoritative for locks, formulas, geometry and dependencies. */
export function visioMovementShape(page: VisioPage, id: string): VisioShape | undefined {
	const shape =
		visioStyleFormattingShape(page, id) ?? visioMovableGroup(page, id) ?? layeredShape(page, id);
	if (
		!shape ||
		(shape.kind !== 'shape' && !(shape.kind === 'group' && shape.children.length)) ||
		!shape.rotation ||
		!(shape.width > 0 && shape.height > 0) ||
		![
			shape.width,
			shape.height,
			shape.rotation.pinX,
			shape.rotation.pinY,
			...shape.transform,
		].every(Number.isFinite) ||
		// Glued connectors move with their shapes (core reroutes them); connectors themselves stay put.
		page.connectors.some((connection) => connection.fromShapeId === id)
	)
		return undefined;
	return shape;
}
/** Client points have been converted to physical SVG page inches; commands use upward y. */
export function visioPageDragDelta(start: VisioPagePoint, end: VisioPagePoint): VisioPagePoint {
	return { x: end.x - start.x, y: start.y - end.y };
}
export function visioMovePreviewTransform(
	shape: VisioShape,
	delta: VisioPagePoint,
): VisioMatrix | undefined {
	if (![delta.x, delta.y, ...shape.transform].every(Number.isFinite)) return undefined;
	const [a, b, c, d, e, f] = shape.transform;
	const result: VisioMatrix = [a, b, c, d, e + delta.x, f + delta.y];
	return result.every(Number.isFinite) ? result : undefined;
}
/** The selection plus the movable members of selected containers, which move with them. */
export function visioMoveTargets(page: VisioPage, ids: readonly string[]): string[] {
	const extra = new Set(visioWithContainerMembers(page, ids).slice(ids.length));
	return [...ids, ...[...extra].filter((id) => visioMovementShape(page, id))];
}
/** One common translation over the entire eligible selection (and the members of selected
 * containers); callers commit it atomically. */
export function visioMoveCommands(
	page: VisioPage,
	selection: readonly string[],
	delta: VisioPagePoint,
): VisioEdit[] | undefined {
	const ids = visioMoveTargets(page, selection);
	if (
		!ids.length ||
		ids.length > 1000 ||
		new Set(ids).size !== ids.length ||
		![delta.x, delta.y].every(Number.isFinite)
	)
		return undefined;
	const shapes = ids.map((id) => visioMovementShape(page, id));
	if (shapes.some((shape) => !shape)) return undefined;
	if (delta.x === 0 && delta.y === 0) return [];
	try {
		const edits = shapes.map((shape) =>
			visioPageEditToDrawing(page, {
				type: 'move-shape',
				pageId: page.id,
				shapeId: shape!.id,
				x: shape!.rotation!.pinX + delta.x,
				y: shape!.rotation!.pinY + delta.y,
			}),
		);
		return edits.every(
			(edit) => edit.type === 'move-shape' && Number.isFinite(edit.x) && Number.isFinite(edit.y),
		)
			? edits
			: undefined;
	} catch {
		return undefined;
	}
}
/**
 * Arrow-key nudge: move the selection `step` page inches in the arrow's screen direction (Visio
 * nudges by a small step, and Shift+arrow by one screen pixel). `null` for any other key,
 * `undefined` when the selection cannot move.
 */
export function visioNudgeCommands(
	page: VisioPage,
	selection: readonly string[],
	key: string,
	step: number,
): VisioEdit[] | undefined | null {
	const delta = arrowKeyDelta(key, step);
	if (!delta) return null;
	if (!(step > 0) || !Number.isFinite(step)) return undefined;
	// Commands use upward page y; an Up arrow raises the shape.
	return visioMoveCommands(page, selection, { x: delta.dx, y: -delta.dy });
}
