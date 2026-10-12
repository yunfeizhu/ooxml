import { DEFAULTS, fail } from './package-common';
import { captureVisioClipboard, type VisioClipboardSnapshot } from './clipboard';
import { clipboardPageContext } from './clipboard-resources';
import { VisioPackage } from './package';
import { editVsdx, type EditVsdxOptions, type EditVsdxResult, type VisioEdit } from './edit';
import type { VisioSubprocessEdit } from './edit-subprocess-commands';

/** Page-dependent values: text fields and formulas reading the page's number, count or name. */
const PAGE_DEPENDENT = /<fld\b|\bN="Field"|\b(?:PAGENUMBER|PAGECOUNT|PAGENAME)\s*\(/i;
const ordinal = (xml: string) => xml.replace(/\s(?:PageNumber|PageCount)="[^"]*"/g, '');

/**
 * The clipboard pastes only into a page of the same context. The inserted page copies the source
 * PageSheet, so the contexts differ only in page number: that is safe for shapes whose values do
 * not depend on it, which is checked here; anything else refuses the move.
 */
async function retarget(
	clipboard: VisioClipboardSnapshot,
	bytes: Uint8Array,
	pageId: string,
	limits: typeof DEFAULTS,
): Promise<VisioClipboardSnapshot> {
	if (clipboard.shapes.some((shape) => PAGE_DEPENDENT.test(shape.xml)))
		fail(
			'UNSUPPORTED_SUBPROCESS',
			'Shapes with text fields or page-dependent formulas cannot move to another page.',
		);
	const target = await clipboardPageContext(await VisioPackage.open(bytes, limits), pageId);
	if (
		target.scale !== clipboard.sourceDrawingScale ||
		ordinal(target.xml) !== ordinal(clipboard.pageContext)
	)
		fail('UNSUPPORTED_SUBPROCESS', 'The new page does not share the source page settings.');
	return { ...clipboard, pageContext: target.xml };
}

/**
 * Run Create New or Create from Selection as one transaction built from the existing page
 * insertion, clipboard paste, delete, rectangle and hyperlink edits. Each step is admitted by its
 * own edit; any refusal refuses the whole subprocess and the source bytes stay unchanged.
 */
export async function editVsdxSubprocess(
	source: Uint8Array,
	edit: VisioSubprocessEdit,
	options: EditVsdxOptions,
): Promise<EditVsdxResult> {
	const limits = { ...DEFAULTS, ...options.limits };
	const deadline = Date.now() + limits.maxRuntimeMs;
	const remaining = (): EditVsdxOptions => {
		const time = deadline - Date.now();
		if (time <= 0) fail('LIMIT_RUNTIME', 'Visio edit deadline exceeded.');
		return { ...options, limits: { ...options.limits, maxRuntimeMs: time } };
	};
	const changed = new Set<string>();
	const diagnostics = new Map<string, { code: string; message: string }>();
	let bytes = source;
	const step = async (edits: VisioEdit[]) => {
		const result = await editVsdx(bytes, edits, remaining());
		bytes = result.bytes;
		for (const part of result.changedParts) changed.add(part);
		for (const note of result.diagnostics) diagnostics.set(note.code, note);
	};
	await step([
		{ type: 'insert-page', pageId: edit.newPageId, afterPageId: edit.pageId, name: edit.name },
	]);
	const hyperlink = { address: '', subAddress: edit.name, description: edit.name };
	if (edit.shapeId !== undefined) {
		await step([
			{ type: 'set-shape-hyperlink', pageId: edit.pageId, shapeId: edit.shapeId, hyperlink },
		]);
	} else {
		const selection = edit.selection!;
		const clipboard = await retarget(
			await captureVisioClipboard(bytes, edit.pageId, selection.shapeIds, remaining()),
			bytes,
			edit.newPageId,
			limits,
		);
		await step([
			{
				type: 'paste-shapes',
				pageId: edit.newPageId,
				clipboard,
				copies: selection.shapeIds.map((shapeId) => ({ shapeId, newShapeId: shapeId })),
				offsetX: 0,
				offsetY: 0,
			},
		]);
		await step(
			selection.shapeIds.map((shapeId) => ({
				type: 'delete-shape' as const,
				pageId: edit.pageId,
				shapeId,
			})),
		);
		await step([
			{
				type: 'create-rectangle',
				pageId: edit.pageId,
				shapeId: selection.shapeId,
				x: selection.x,
				y: selection.y,
				width: selection.width,
				height: selection.height,
				text: edit.name,
			},
			{ type: 'set-shape-hyperlink', pageId: edit.pageId, shapeId: selection.shapeId, hyperlink },
		]);
	}
	return {
		bytes,
		changedParts: [...changed],
		diagnostics: [
			...diagnostics.values(),
			{
				code: 'edit-subprocess',
				message:
					'The subprocess page was inserted and linked through a hyperlink to the page. Shapes moved by Create from Selection keep their positions on the new page.',
			},
		],
	};
}
