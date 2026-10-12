import { parseVsdx } from './parser';
import { related, visioXml } from './parts';
import { attribute, children } from './sheet';
import type { VisioPackage } from './package';
import type { VisioEdit } from './edit-commands';
import type { EditVsdxResult } from './edit';
import type { VisioPage } from './model';
import { visioPrintTile } from './paper-sizes';

/** Edits after which Visio's Auto Size grows a page whose shapes left it. */
const GROWING = new Set([
	'create-rectangle',
	'create-ellipse',
	'create-line',
	'create-text-box',
	'create-path',
	'move-shape',
	'resize-shape',
	'paste-shapes',
	'duplicate-shapes',
]);

/** Pages a transaction touches whose saved Auto Size is on, read without parsing the scene. */
export async function autoSizePageIds(
	pkg: VisioPackage,
	edits: readonly VisioEdit[],
): Promise<Set<string>> {
	const touched = new Set(
		// Document-wide edits (Snap & Glue) name no page.
		edits.flatMap((edit) => ('pageId' in edit && GROWING.has(edit.type) ? [edit.pageId] : [])),
	);
	const result = new Set<string>();
	if (!touched.size) return result;
	const documentPart = await related(pkg, '', 'document');
	const pagesPart = documentPart && (await related(pkg, documentPart, 'pages'));
	if (!pagesPart) return result;
	for (const page of children(await visioXml(pkg, pagesPart, 'Pages'), 'Page')) {
		const id = attribute(page, 'ID') ?? '';
		const sheet = children(page, 'PageSheet')[0];
		const cell =
			sheet && children(sheet, 'Cell').find((node) => attribute(node, 'N') === 'DrawingResizeType');
		if (touched.has(id) && cell && Number(attribute(cell, 'V')) === 1) result.add(id);
	}
	return result;
}

/** Upward-positive extent of a page's top-level shapes in physical page inches. */
function extent(page: VisioPage): { right: number; top: number } | undefined {
	let right = -Infinity,
		top = -Infinity;
	for (const shape of page.shapes) {
		const [a, b, c, d, e, f] = shape.transform;
		for (const [x, y] of [
			[0, 0],
			[shape.width, 0],
			[0, shape.height],
			[shape.width, shape.height],
		] as const) {
			right = Math.max(right, a * x + c * y + e);
			top = Math.max(top, b * x + d * y + f);
		}
	}
	return Number.isFinite(right) && Number.isFinite(top) ? { right, top } : undefined;
}

/** Physical page size after growing right and up in whole tiles, or undefined when it fits. */
export function visioAutoSizeGrowth(
	page: VisioPage,
): { width: number; height: number } | undefined {
	const bounds = extent(page);
	if (!bounds) return undefined;
	const tile = visioPrintTile(page) ?? { width: page.width, height: page.height };
	const epsilon = 1e-6;
	const grow = (size: number, edge: number, step: number) =>
		edge > size + epsilon ? size + Math.ceil((edge - size - epsilon) / step) * step : size;
	const width = grow(page.width, bounds.right, tile.width),
		height = grow(page.height, bounds.top, tile.height);
	return width === page.width && height === page.height ? undefined : { width, height };
}

/**
 * Visio's Auto Size after a shape transaction: a touched page with DrawingResizeType 1 grows to
 * the right and upward in whole tiles until its top-level shapes fit. Shapes beyond the left or
 * bottom edge are not followed (Visio would move the page origin). A refused growth keeps the
 * shape edit and reports why.
 */
export async function growAutoSizePages(
	touched: ReadonlySet<string>,
	result: EditVsdxResult,
	apply: (bytes: Uint8Array, edits: readonly VisioEdit[]) => Promise<EditVsdxResult>,
): Promise<EditVsdxResult> {
	if (!result.changedParts.length || !touched.size) return result;
	const document = await parseVsdx(result.bytes);
	const growth: VisioEdit[] = [];
	for (const page of document.pages) {
		if (!touched.has(page.id) || page.drawingResizeType !== 1 || page.isBackground) continue;
		const size = visioAutoSizeGrowth(page);
		if (size)
			growth.push(
				{ type: 'set-page-size', pageId: page.id, ...size },
				{ type: 'set-page-setup', pageId: page.id, autoSize: true },
			);
	}
	if (!growth.length) return result;
	try {
		const grown = await apply(result.bytes, growth);
		return {
			bytes: grown.bytes,
			changedParts: [...new Set([...result.changedParts, ...grown.changedParts])],
			diagnostics: [
				...result.diagnostics,
				{
					code: 'edit-page-auto-size',
					message:
						'Auto Size grew the page to the right or upward in whole page tiles. Shapes beyond the left or bottom edge do not grow the page.',
				},
			],
		};
	} catch (error) {
		return {
			...result,
			diagnostics: [
				...result.diagnostics,
				{
					code: 'edit-page-auto-size-refused',
					message: `Auto Size could not grow the page: ${error instanceof Error ? error.message : String(error)}`,
				},
			],
		};
	}
}
