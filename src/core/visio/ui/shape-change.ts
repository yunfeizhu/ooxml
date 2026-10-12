import type { VisioDocument, VisioMaster, VisioPage, VisioShape } from '../model';
import type { VisioChangeShapeEdit, VisioChangeShapeTarget } from '../edit-change-shape-commands';
import { visioStencilInstanceShape } from './formatting';

const selected = (
	page: VisioPage | undefined,
	selection: readonly Pick<VisioShape, 'id'>[],
): VisioShape | string => {
	if (!page) return 'Open a drawing page.';
	if (selection.length !== 1) return 'Select exactly one shape.';
	const shape = page.shapes.find((candidate) => candidate.id === selection[0]!.id);
	if (!shape) return 'Select a top-level shape on this page; shapes inside groups cannot change.';
	if (shape.hidden) return 'The selected shape is hidden.';
	return shape;
};

/**
 * Coarse scene admission for Home > Change Shape to a built-in shape: the reason the selection
 * cannot change, or undefined when it can be tried. A drawn shape gets a new outline; a stencil
 * shape becomes an instance of the built-in master. Locks, formula dependencies and control
 * handles are checked by `editVsdx`, which refuses the edit with its own reason.
 */
export function visioChangeShapeRefusal(
	page: VisioPage | undefined,
	selection: readonly Pick<VisioShape, 'id'>[],
): string | undefined {
	const shape = selected(page, selection);
	if (typeof shape === 'string') return shape;
	if (shape.kind === 'group' || shape.children.length)
		return 'Groups cannot change shape; change their member shapes instead.';
	if (shape.kind === 'connector') return 'Lines and connectors (1D shapes) cannot change shape.';
	if (shape.masterId) {
		// A stencil shape becomes an instance of the built-in master and keeps its size.
		if (!(shape.width > 0 && shape.height > 0)) return 'The shape has no width or height.';
		return page!.connectors.some(
			(connection) =>
				connection.toShapeId === shape.id && connection.toCell.startsWith('Connections.'),
		)
			? 'A connector is glued to one of its connection points, which the new shape does not have.'
			: undefined;
	}
	if (shape.kind === 'foreign' || shape.image || shape.foreignVector)
		return 'Pictures and embedded objects have no outline to change.';
	if (!(shape.width > 0 && shape.height > 0)) return 'The shape has no width or height.';
	if (
		page!.connectors.some(
			(connection) => connection.fromShapeId === shape.id || connection.toShapeId === shape.id,
		)
	)
		return 'Glued connectors would need rerouting, which is not supported yet.';
	return undefined;
}

/** The change-shape command for the single selected shape, when the scene admits it. */
export function visioChangeShapeCommand(
	page: VisioPage | undefined,
	selection: readonly Pick<VisioShape, 'id'>[],
	target: VisioChangeShapeTarget,
): VisioChangeShapeEdit | undefined {
	if (!page || visioChangeShapeRefusal(page, selection) !== undefined) return undefined;
	return { type: 'change-shape', pageId: page.id, shapeId: selection[0]!.id, shape: target };
}

/** A master a stencil shape can become: one plain 2D shape, as the Document Stencil lists it. */
const replacement = (master: VisioMaster): boolean =>
	!master.oneDimensional &&
	master.rootCount === 1 &&
	master.shapes.length === 1 &&
	!master.shapes[0]!.children.length;

/**
 * The masters of the drawing the selected stencil shape can change to: every other master made
 * of one plain 2D shape. Empty when the selection is not such a stencil shape; `reason` then
 * says why. Glue, locks and local changes to the outline are checked by `editVsdx`.
 */
export function visioChangeMasterTargets(
	document: Pick<VisioDocument, 'masters'> | null | undefined,
	page: VisioPage | undefined,
	selection: readonly Pick<VisioShape, 'id'>[],
): { masters: readonly VisioMaster[]; reason?: string } {
	const shape = selected(page, selection);
	if (typeof shape === 'string') return { masters: [], reason: shape };
	if (!shape.masterId) return { masters: [] };
	if (!visioStencilInstanceShape(page!, shape.id))
		return {
			masters: [],
			reason: 'Only a stencil shape made of one plain shape, off locked layers, can change.',
		};
	if (page!.connectors.some((connection) => connection.fromShapeId === shape.id))
		return { masters: [], reason: 'A shape that is glued to another cannot change.' };
	const masters = (document?.masters ?? []).filter(
		(master) => master.id !== shape.masterId && replacement(master),
	);
	return masters.length
		? { masters }
		: { masters, reason: 'The Document Stencil has no other shape to change to.' };
}

/** The command that makes the selected stencil shape an instance of `masterId`. */
export function visioChangeMasterCommand(
	document: Pick<VisioDocument, 'masters'> | null | undefined,
	page: VisioPage | undefined,
	selection: readonly Pick<VisioShape, 'id'>[],
	masterId: string,
): VisioChangeShapeEdit | undefined {
	const { masters } = visioChangeMasterTargets(document, page, selection);
	if (!page || !masters.some((master) => master.id === masterId)) return undefined;
	return { type: 'change-shape', pageId: page.id, shapeId: selection[0]!.id, masterId };
}
