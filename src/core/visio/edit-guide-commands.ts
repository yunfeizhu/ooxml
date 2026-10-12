import { fail } from './package-common';

/**
 * Ruler guides: Visio stores each as a top-level `Type="Guide"` shape with an infinite-line
 * geometry. A horizontal guide sits at PinY, a vertical one at PinX (drawing inches).
 */
export type VisioGuideEdit =
	| {
			type: 'create-guide';
			pageId: string;
			shapeId: string;
			orientation: 'horizontal' | 'vertical';
			position: number;
	  }
	| { type: 'move-guide'; pageId: string; shapeId: string; position: number }
	| { type: 'delete-guide'; pageId: string; shapeId: string };

export const isVisioGuideEdit = (edit: { type: string }): edit is VisioGuideEdit =>
	edit.type === 'create-guide' || edit.type === 'move-guide' || edit.type === 'delete-guide';

/** Copy and validate a guide command; page admission stays with the transaction. */
export function snapshotGuideEdit(edit: VisioGuideEdit): VisioGuideEdit {
	if (typeof edit.pageId !== 'string' || !edit.pageId || edit.pageId.length > 256)
		fail('INVALID_EDIT', 'Invalid edit target.');
	if (
		typeof edit.shapeId !== 'string' ||
		!/^[1-9]\d{0,9}$/.test(edit.shapeId) ||
		Number(edit.shapeId) > 0xffffffff
	)
		fail('INVALID_EDIT', 'Guide shape IDs must be canonical positive integers.');
	const target = { pageId: edit.pageId, shapeId: edit.shapeId };
	if (edit.type === 'delete-guide') return { type: edit.type, ...target };
	if (
		typeof edit.position !== 'number' ||
		!Number.isFinite(edit.position) ||
		Math.abs(edit.position) > 1e6
	)
		fail('INVALID_EDIT', 'A guide position must be finite drawing inches within limits.');
	if (edit.type === 'move-guide') return { type: edit.type, ...target, position: edit.position };
	if (edit.orientation !== 'horizontal' && edit.orientation !== 'vertical')
		fail('INVALID_EDIT', 'A guide is horizontal or vertical.');
	return { type: edit.type, ...target, orientation: edit.orientation, position: edit.position };
}
