import type { VisioSubprocessEdit } from '../edit-commands';
import type { VisioDocument, VisioPage } from '../model';
import { visioShapePageBox } from './marquee';
import { visioPageInsertCommand } from './page-edit';
import { visioNextShapeId } from './shape-id';

/** Page inches of the shape Create from Selection leaves in place of the moved shapes. */
export const VISIO_SUBPROCESS_SHAPE = { width: 1.5, height: 0.75 } as const;

/**
 * Process > Create New (one selected shape) or Create from Selection (top-level shapes): a new
 * page after `page`, named like Visio's next blank page. Undefined when the selection does not fit.
 */
export function visioSubprocessCommand(
	document: VisioDocument,
	page: VisioPage,
	shapeIds: readonly string[],
	mode: 'new' | 'selection',
): VisioSubprocessEdit | undefined {
	if (!shapeIds.length || page.isBackground) return undefined;
	const insert = visioPageInsertCommand(document, page.id);
	const base = {
		type: 'create-subprocess' as const,
		pageId: page.id,
		newPageId: insert.pageId,
		name: insert.name,
	};
	if (mode === 'new') return shapeIds.length === 1 ? { ...base, shapeId: shapeIds[0]! } : undefined;
	const shapes = shapeIds.map((id) => page.shapes.find((shape) => shape.id === id));
	if (shapes.some((shape) => !shape)) return undefined;
	let left = Infinity,
		top = Infinity,
		right = -Infinity,
		bottom = -Infinity;
	for (const shape of shapes) {
		const box = visioShapePageBox(page, shape!);
		if (!box) return undefined;
		left = Math.min(left, box.x);
		top = Math.min(top, box.y);
		right = Math.max(right, box.x + box.width);
		bottom = Math.max(bottom, box.y + box.height);
	}
	// Edits use drawing inches with a bottom-left origin; boxes are page inches, y down.
	const ratio = page.drawingToPageScale ?? 1;
	return {
		...base,
		selection: {
			shapeIds: [...shapeIds],
			shapeId: visioNextShapeId(page),
			x: (left + right) / 2 / ratio,
			y: (page.height - (top + bottom) / 2) / ratio,
			width: VISIO_SUBPROCESS_SHAPE.width / ratio,
			height: VISIO_SUBPROCESS_SHAPE.height / ratio,
		},
	};
}
