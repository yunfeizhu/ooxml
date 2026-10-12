import { fail } from './package-common';

/**
 * Home > Editing > Layers > Assign to Layer: replace the layer membership (LayerMember) of
 * top-level shapes on one page with `layerIds`, plus any `newLayers` added to the page's Layer
 * section first. An empty membership removes the shapes from every layer.
 */
export interface VisioAssignLayersEdit {
	type: 'assign-layers';
	pageId: string;
	shapeIds: readonly string[];
	/** Existing page layer IDs (Layer row IX values). */
	layerIds: readonly string[];
	/** Names of layers to add to the page; their new IDs are appended to the membership. */
	newLayers?: readonly string[];
}

export const VISIO_LAYER_NAME_LIMIT = 255;
const shapeId = /^[1-9]\d{0,9}$/;
const layerId = /^(0|[1-9]\d{0,9})$/;

/** A layer name Visio would accept: trimmed, short, no control characters or separators. */
export function isVisioLayerName(value: unknown): boolean {
	return (
		typeof value === 'string' &&
		value.trim() === value &&
		value.length > 0 &&
		value.length <= VISIO_LAYER_NAME_LIMIT &&
		!/[\u0000-\u001f\u007f;]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u.test(
			value,
		)
	);
}

/** Copy and validate the command; page admission stays with the transaction. */
export function snapshotAssignLayers(edit: VisioAssignLayersEdit): VisioAssignLayersEdit {
	if (typeof edit.pageId !== 'string' || !edit.pageId || edit.pageId.length > 256)
		fail('INVALID_EDIT', 'Invalid edit target.');
	if (!Array.isArray(edit.shapeIds) || !edit.shapeIds.length || edit.shapeIds.length > 1000)
		fail('INVALID_EDIT', 'Layer assignment needs between one and 1000 shapes.');
	const shapeIds = Array.from(edit.shapeIds, (id: unknown) => {
		if (typeof id !== 'string' || !shapeId.test(id) || Number(id) > 0xffffffff)
			fail('INVALID_EDIT', 'Layer assignment shape IDs must be canonical positive integers.');
		return id;
	});
	if (!Array.isArray(edit.layerIds) || edit.layerIds.length > 1000)
		fail('INVALID_EDIT', 'Layer assignment accepts at most 1000 layers.');
	const layerIds = Array.from(edit.layerIds, (id: unknown) => {
		if (typeof id !== 'string' || !layerId.test(id) || Number(id) > 0xffffffff)
			fail('INVALID_EDIT', 'Layer IDs must be canonical unsigned integers.');
		return id;
	});
	const newLayers =
		edit.newLayers === undefined
			? undefined
			: Array.isArray(edit.newLayers) && edit.newLayers.length <= 100
				? Array.from(edit.newLayers, (name: unknown) => {
						if (!isVisioLayerName(name))
							fail('INVALID_EDIT', 'New layer names need 1 to 255 characters without semicolons.');
						return name as string;
					})
				: fail('INVALID_EDIT', 'At most 100 new layers can be added at once.');
	if (new Set(shapeIds).size !== shapeIds.length || new Set(layerIds).size !== layerIds.length)
		fail('INVALID_EDIT', 'Layer assignment shapes and layers must be unique.');
	if (newLayers && new Set(newLayers.map((name) => name.toLowerCase())).size !== newLayers.length)
		fail('INVALID_EDIT', 'New layer names must be unique.');
	return {
		type: 'assign-layers',
		pageId: edit.pageId,
		shapeIds,
		layerIds,
		...(newLayers?.length ? { newLayers } : {}),
	};
}
