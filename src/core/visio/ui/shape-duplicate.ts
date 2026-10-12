import type { VisioPage, VisioShape } from '../model';
import type { VisioDuplicateShapesEdit } from '../edit-duplicate-commands';
import { visioNextShapeId } from './shape-id';
import { visioLocalFormattingShape, visioStencilShape } from './formatting';

/**
 * What Duplicate, Copy and Cut take: a 2D shape drawn here with no glue, or a 2D stencil shape,
 * which is copied as an instance of the same master. A connector glued to a stencil shape stays
 * with the original, as in Visio; a shape that is itself glued to another is left out.
 */
export function visioCopyableShape(page: VisioPage, shapeId: string): VisioShape | undefined {
	const local = visioLocalFormattingShape(page, shapeId);
	const shape = local ?? visioStencilShape(page, shapeId);
	if (
		!shape ||
		(local && shape.kind !== 'shape') ||
		!(shape.width > 0) ||
		!(shape.height > 0) ||
		page.connectors.some(
			(connection) =>
				connection.fromShapeId === shapeId || (local && connection.toShapeId === shapeId),
		)
	)
		return undefined;
	return shape;
}

/** Allocate against the complete page tree; source guards remain authoritative. */
export function visioDuplicateCommand(
	page: VisioPage,
	shapeIds: readonly string[],
): VisioDuplicateShapesEdit | undefined {
	if (
		!shapeIds.length ||
		shapeIds.length > 1000 ||
		new Set(shapeIds).size !== shapeIds.length ||
		shapeIds.some((id) => !visioCopyableShape(page, id))
	)
		return undefined;
	let next: number;
	try {
		next = Number(visioNextShapeId(page));
	} catch {
		return undefined;
	}
	if (next + shapeIds.length - 1 > 0xffffffff) return undefined;
	const selected = new Set(shapeIds);
	const mapping = new Map(
		page.shapes
			.filter((shape) => selected.has(shape.id))
			.map((shape) => [shape.id, String(next++)]),
	);
	return {
		type: 'duplicate-shapes',
		pageId: page.id,
		copies: shapeIds.map((shapeId) => ({ shapeId, newShapeId: mapping.get(shapeId)! })),
		offsetX: 0.33,
		offsetY: -0.33,
	};
}
