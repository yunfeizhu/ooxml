import type { VisioPage, VisioShape } from '../model';
import type { VisioGroupShapesEdit, VisioUngroupShapeEdit } from '../edit-group-commands';
import { visioStencilShape } from './formatting';
import { visioLocalRotationShape } from './shape-rotation';
import { visioNextShapeId } from './shape-id';

/** Model-level scope of Group and Ungroup: visible, unlayered, local and unglued 2D trees, and
 * unglued 2D stencil shapes, which stay instances of their master inside the group.
 * Source locks, formulas and glue remain authoritative in core admission.
 */
function groupable(page: VisioPage, id: string): VisioShape | undefined {
	const shape = visioLocalRotationShape(page, id);
	if (shape) return shape.layerIds?.length ? undefined : shape;
	const stencil = visioStencilShape(page, id);
	return stencil &&
		stencil.width > 0 &&
		stencil.height > 0 &&
		!page.connectors.some(
			(connection) => connection.fromShapeId === id || connection.toShapeId === id,
		)
		? stencil
		: undefined;
}

/** A top-level group the pointer can move as one sheet. */
export function visioMovableGroup(page: VisioPage, id: string): VisioShape | undefined {
	const shape = groupable(page, id);
	// A group dropped from a stencil is an instance, not a group that was made here.
	return shape?.kind === 'group' && !shape.masterId && shape.children.length ? shape : undefined;
}

/** Group two or more selected top-level shapes; members keep page stacking order. */
export function visioGroupCommand(
	page: VisioPage,
	shapeIds: readonly string[],
): VisioGroupShapesEdit | undefined {
	if (shapeIds.length < 2 || shapeIds.length > 1000 || new Set(shapeIds).size !== shapeIds.length)
		return undefined;
	const wanted = new Set(shapeIds);
	const members = page.shapes.filter((shape) => wanted.has(shape.id));
	if (members.length !== wanted.size || members.some((shape) => !groupable(page, shape.id)))
		return undefined;
	let shapeId: string;
	try {
		shapeId = visioNextShapeId(page);
	} catch {
		return undefined;
	}
	return {
		type: 'group-shapes',
		pageId: page.id,
		shapeId,
		memberIds: members.map((shape) => shape.id),
	};
}

/** Ungroup exactly one selected top-level group. */
export function visioUngroupCommand(
	page: VisioPage,
	shapeIds: readonly string[],
): VisioUngroupShapeEdit | undefined {
	if (shapeIds.length !== 1 || !visioMovableGroup(page, shapeIds[0]!)) return undefined;
	return { type: 'ungroup-shape', pageId: page.id, shapeId: shapeIds[0]! };
}
