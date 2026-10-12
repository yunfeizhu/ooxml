import type { VisioEdit, VisioPageInsert } from '../edit-commands';
import type { VisioPage, VisioDocument } from '../model';

/** Allocate a stable page ID and a unique default name for a blank inserted page. */
export function visioPageInsertCommand(
	document: VisioDocument,
	afterPageId: string,
): VisioPageInsert {
	if (!document.pages.some((page) => page.id === afterPageId))
		throw new Error('Insertion target page does not exist.');
	let largest = -1;
	const names = new Set(document.pages.map((page) => page.name.toLowerCase()));
	for (const page of document.pages) {
		if (/^(0|[1-9]\d{0,9})$/.test(page.id)) largest = Math.max(largest, Number(page.id));
	}
	if (largest >= 4294967295) throw new Error('No page IDs remain available.');
	let index = document.pages.length + 1;
	while (names.has(`page-${index}`)) ++index;
	return { type: 'insert-page', pageId: String(largest + 1), afterPageId, name: `Page-${index}` };
}

/** Convert viewer page-inch controls to the edit API's drawing-inch coordinates.
 * Host calls to editVsdx/applyEdits keep their existing drawing-inch contract.
 */
export function visioPageEditToDrawing(page: VisioPage, edit: VisioEdit): VisioEdit {
	// Document-wide edits (Snap & Glue) carry no page coordinates.
	if (!('pageId' in edit)) return edit;
	const ratio = page.drawingToPageScale ?? 1;
	if (!Number.isFinite(ratio) || ratio <= 0 || page.id !== edit.pageId)
		throw new Error('Invalid page scale or edit page.');
	if (ratio === 1) return edit;
	const coordinate = (value: number) => {
		const drawing = value / ratio;
		if (!Number.isFinite(drawing)) throw new Error('Drawing coordinate exceeds finite limits.');
		return drawing;
	};
	switch (edit.type) {
		case 'insert-page':
		case 'reorder-page':
		case 'rename-page':
		case 'delete-page':
			return edit;
		case 'create-rectangle':
		case 'create-ellipse':
		case 'create-text-box':
			return {
				...edit,
				x: coordinate(edit.x),
				y: coordinate(edit.y),
				width: coordinate(edit.width),
				height: coordinate(edit.height),
			};
		case 'create-path':
			return {
				...edit,
				x: coordinate(edit.x),
				y: coordinate(edit.y),
				segments: edit.segments.map((segment) => ({
					...segment,
					x: coordinate(segment.x),
					y: coordinate(segment.y),
					...(segment.kind === 'cubic'
						? {
								x1: coordinate(segment.x1),
								y1: coordinate(segment.y1),
								x2: coordinate(segment.x2),
								y2: coordinate(segment.y2),
							}
						: segment.kind === 'arc'
							? { a: coordinate(segment.a), b: coordinate(segment.b) }
							: {}),
				})),
			};
		case 'create-line':
			return {
				...edit,
				beginX: coordinate(edit.beginX),
				beginY: coordinate(edit.beginY),
				endX: coordinate(edit.endX),
				endY: coordinate(edit.endY),
			};
		case 'move-shape':
		case 'move-line-endpoint':
			return { ...edit, x: coordinate(edit.x), y: coordinate(edit.y) };
		case 'resize-shape':
			return { ...edit, width: coordinate(edit.width), height: coordinate(edit.height) };
		default:
			return edit;
	}
}
