import { fail } from './package-common';

/** Create from Selection: the moved shapes and the shape (drawing inches) that replaces them. */
export interface VisioSubprocessSelection {
	shapeIds: readonly string[];
	/** The new linking shape's sheet ID on the source page. */
	shapeId: string;
	/** Centre and size, drawing inches, bottom-left origin. */
	x: number;
	y: number;
	width: number;
	height: number;
}
/**
 * Visio's Process > Subprocess as one transaction: insert a page after `pageId` and link a shape
 * to it. With `shapeId` (Create New) that shape gets the hyperlink; with `selection` (Create from
 * Selection) the shapes move to the new page and a new rectangle linking to it takes their place.
 */
export interface VisioSubprocessEdit {
	type: 'create-subprocess';
	pageId: string;
	newPageId: string;
	name: string;
	shapeId?: string;
	selection?: VisioSubprocessSelection;
}

const sheetId = (value: unknown): string => {
	if (typeof value !== 'string' || !/^[1-9]\d{0,9}$/.test(value) || Number(value) > 0xffffffff)
		fail('INVALID_EDIT', 'Subprocess shape IDs require canonical positive unsigned integers.');
	return value as string;
};
const finite = (value: unknown, positive = false): number => {
	if (
		typeof value !== 'number' ||
		!Number.isFinite(value) ||
		Math.abs(value) > 1e6 ||
		(positive && value <= 0)
	)
		fail('INVALID_EDIT', 'Subprocess shapes need finite drawing inches and positive sizes.');
	return value as number;
};

/** Copy and validate a subprocess command; each step is admitted again by its own edit. */
export function snapshotSubprocessEdit(edit: VisioSubprocessEdit): VisioSubprocessEdit {
	if (typeof edit.pageId !== 'string' || !edit.pageId || edit.pageId.length > 256)
		fail('INVALID_EDIT', 'Invalid subprocess source page.');
	if (
		typeof edit.newPageId !== 'string' ||
		!/^(0|[1-9]\d{0,9})$/.test(edit.newPageId) ||
		Number(edit.newPageId) > 0xffffffff
	)
		fail('INVALID_EDIT', 'Invalid subprocess page ID.');
	if (
		typeof edit.name !== 'string' ||
		!edit.name.trim() ||
		edit.name.length > 255 ||
		/[\u0000-\u001f]/.test(edit.name)
	)
		fail('INVALID_EDIT', 'Invalid subprocess page name.');
	if ((edit.shapeId === undefined) === (edit.selection === undefined))
		fail('INVALID_EDIT', 'A subprocess links either one shape or a selection.');
	const base = {
		type: 'create-subprocess' as const,
		pageId: edit.pageId,
		newPageId: edit.newPageId,
		name: edit.name,
	};
	if (edit.shapeId !== undefined) return { ...base, shapeId: sheetId(edit.shapeId) };
	const selection = edit.selection!;
	if (
		!selection ||
		!Array.isArray(selection.shapeIds) ||
		!selection.shapeIds.length ||
		selection.shapeIds.length > 1000
	)
		fail('INVALID_EDIT', 'Create from Selection needs between one and 1000 shapes.');
	const shapeIds = Array.from(selection.shapeIds, sheetId);
	const shapeId = sheetId(selection.shapeId);
	if (new Set(shapeIds).size !== shapeIds.length || shapeIds.includes(shapeId))
		fail('INVALID_EDIT', 'Selected shapes must be unique and differ from the new shape.');
	return {
		...base,
		selection: {
			shapeIds,
			shapeId,
			x: finite(selection.x),
			y: finite(selection.y),
			width: finite(selection.width, true),
			height: finite(selection.height, true),
		},
	};
}
