import { fail } from './package-common';
import { isVisioBasicShape, type VisioBasicShape } from './basic-shapes';

/** A Basic Shapes outline, or the native Ellipse row (`circle` keeps the shape's own size). */
export type VisioChangeShapeTarget = VisioBasicShape | 'ellipse' | 'circle';

/**
 * Visio's Home > Editing > Change Shape. For a shape drawn here, `shape` names the outline its
 * Geometry sections are replaced by. For a stencil shape, `masterId` names the master of the
 * drawing it becomes an instance of. Position, size, rotation, flips, text and formatting stay.
 */
export type VisioChangeShapeEdit =
	| { type: 'change-shape'; pageId: string; shapeId: string; shape: VisioChangeShapeTarget }
	| { type: 'change-shape'; pageId: string; shapeId: string; masterId: string };

export const isVisioChangeShapeTarget = (value: unknown): value is VisioChangeShapeTarget =>
	value === 'ellipse' || value === 'circle' || isVisioBasicShape(value);

/** Copy a change-shape command, keeping only its known fields. */
export function snapshotChangeShape(edit: VisioChangeShapeEdit): VisioChangeShapeEdit {
	if (
		typeof edit.shapeId !== 'string' ||
		!/^[1-9]\d{0,9}$/.test(edit.shapeId) ||
		Number(edit.shapeId) > 4294967295
	)
		fail('INVALID_EDIT', 'Change Shape needs a canonical positive unsigned shape ID.');
	if ('masterId' in edit) {
		if (typeof edit.masterId !== 'string' || !/^(0|[1-9]\d{0,9})$/.test(edit.masterId))
			fail('INVALID_EDIT', 'Master IDs must be canonical unsigned integers.');
		if ('shape' in edit) fail('INVALID_EDIT', 'Change Shape takes an outline or a master.');
		return {
			type: edit.type,
			pageId: edit.pageId,
			shapeId: edit.shapeId,
			masterId: edit.masterId,
		};
	}
	if (!isVisioChangeShapeTarget(edit.shape)) fail('INVALID_EDIT', 'Unknown basic shape.');
	return { type: edit.type, pageId: edit.pageId, shapeId: edit.shapeId, shape: edit.shape };
}
