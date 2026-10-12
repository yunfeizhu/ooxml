import type { VisioPage, VisioShape } from '../model';
import type { VisioClipboardSnapshot } from '../clipboard-types';
import { snapshotVisioClipboard } from '../clipboard-types';
import type { VisioPasteShapesEdit } from '../edit-paste-commands';
import { visioNextShapeId } from './shape-id';
import { visioCopyableShape } from './shape-duplicate';

/** Coarse scene eligibility only; capture validates source locks, formulas and resources. */
export function visioClipboardShape(page: VisioPage, shapeId: string): VisioShape | undefined {
	return visioCopyableShape(page, shapeId);
}
export function visioPasteCommand(
	page: VisioPage,
	value: VisioClipboardSnapshot,
	offset: { x: number; y: number } = { x: 0.33, y: -0.33 },
): VisioPasteShapesEdit | undefined {
	try {
		const clipboard = snapshotVisioClipboard(value);
		if (
			(page.drawingToPageScale ?? 1) !== clipboard.sourceDrawingScale ||
			[offset.x, offset.y].some((number) => !Number.isFinite(number) || Math.abs(number) > 1e6)
		)
			return undefined;
		let next = Number(visioNextShapeId(page));
		if (next + clipboard.shapes.length - 1 > 0xffffffff) return undefined;
		const ids = new Map(clipboard.shapes.map((shape) => [shape.shapeId, String(next++)]));
		return {
			type: 'paste-shapes',
			pageId: page.id,
			clipboard,
			copies: clipboard.selectionIds.map((shapeId) => ({ shapeId, newShapeId: ids.get(shapeId)! })),
			offsetX: offset.x,
			offsetY: offset.y,
		};
	} catch {
		return undefined;
	}
}
