import type { VisioPage, VisioShape } from '../model';

/**
 * Coarse scene admission for Bring to Front, Send to Back and their one-step forms: a shape
 * drawn here (no group, picture or layer) or any stencil shape, Visio's connectors included, off
 * locked layers. What else sits on the page does not matter: only the order of siblings changes.
 * Source display bands and protection are checked by editVsdx.
 */
export function visioOrderingShape(page: VisioPage, shapeId: string): VisioShape | undefined {
	const shape = page.shapes.find((candidate) => candidate.id === shapeId);
	if (!shape || shape.hidden) return undefined;
	if (shape.masterId)
		return shape.layerIds?.some(
			(layer) => page.layers?.find((entry) => entry.id === layer)?.locked !== false,
		)
			? undefined
			: shape;
	return shape.kind === 'shape' &&
		!shape.children.length &&
		!shape.image &&
		!shape.foreignVector &&
		!shape.layerIds?.length
		? shape
		: undefined;
}
