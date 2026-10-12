import { VisioPackage } from './package';
import { fail, type VisioPackageLimits } from './package-common';
import { related, visioXml } from './parts';
import { attribute, children } from './sheet';
import { executableCellFormula } from './cell-formula';
import { openEditablePackage, writeEditedPackage } from './edit-package';
import { serializeEditedXml } from './edit-text';
import type { EditVsdxResult } from './edit';

/**
 * Home > Editing > Layers > Layer Properties: set a page layer's Visible, Print or Lock flag. These
 * are the Visible, Print and Lock cells of the layer's row in the page's Layer section. Omitted
 * flags are left as they are.
 */
export interface VisioLayerPropertiesEdit {
	type: 'set-layer-properties';
	pageId: string;
	/** The page layer ID (Layer row IX). */
	layerId: string;
	visible?: boolean;
	print?: boolean;
	lock?: boolean;
}

const FLAGS = [
	['visible', 'Visible'],
	['print', 'Print'],
	['lock', 'Lock'],
] as const;

/** Copy and validate the command; page admission stays with the transaction. */
export function snapshotLayerProperties(edit: VisioLayerPropertiesEdit): VisioLayerPropertiesEdit {
	if (typeof edit.pageId !== 'string' || !edit.pageId || edit.pageId.length > 256)
		fail('INVALID_EDIT', 'Invalid edit target.');
	if (typeof edit.layerId !== 'string' || !/^(0|[1-9]\d{0,9})$/.test(edit.layerId))
		fail('INVALID_EDIT', 'Layer IDs must be canonical unsigned integers.');
	const result: VisioLayerPropertiesEdit = {
		type: 'set-layer-properties',
		pageId: edit.pageId,
		layerId: edit.layerId,
	};
	for (const [key] of FLAGS) {
		const value = edit[key];
		if (value === undefined) continue;
		if (typeof value !== 'boolean') fail('INVALID_EDIT', 'Layer flags are true or false.');
		result[key] = value;
	}
	if (!FLAGS.some(([key]) => result[key] !== undefined))
		fail('INVALID_EDIT', 'A layer edit needs at least one flag.');
	return result;
}

/** Layer rows live in pages.xml, in each page's PageSheet; only that part changes. */
export async function editVsdxLayerProperties(
	pkg: VisioPackage,
	parts: Map<string, Uint8Array>,
	pages: ReadonlyMap<string, string>,
	edits: readonly VisioLayerPropertiesEdit[],
	limits: VisioPackageLimits,
	maxOutput: number,
	deadline: number,
	check: () => void,
): Promise<EditVsdxResult> {
	const documentPart = (await related(pkg, '', 'document'))!;
	const pagesPart = (await related(pkg, documentPart, 'pages'))!;
	const source = await visioXml(pkg, pagesPart, 'Pages');
	const pageList = (source.ownerDocument!.cloneNode(true) as Document).documentElement;
	let changed = false;
	for (const edit of edits) {
		check();
		if (!pages.has(edit.pageId)) fail('EDIT_TARGET_NOT_FOUND', 'Page does not exist.');
		const page = children(pageList, 'Page').find((node) => attribute(node, 'ID') === edit.pageId);
		const sheets = page ? children(page, 'PageSheet') : [];
		if (sheets.length !== 1) fail('UNSUPPORTED_LAYER_EDIT', 'One explicit PageSheet is required.');
		const sections = children(sheets[0]!, 'Section').filter(
			(node) => attribute(node, 'N') === 'Layer',
		);
		if (sections.length !== 1)
			fail('EDIT_TARGET_NOT_FOUND', 'The layer does not belong to this page.');
		const rows = children(sections[0]!, 'Row').filter(
			(row) => attribute(row, 'IX') === edit.layerId,
		);
		if (rows.length !== 1 || rows[0]!.hasAttribute('Del'))
			fail('EDIT_TARGET_NOT_FOUND', 'The layer does not belong to this page.');
		const row = rows[0]!;
		for (const [key, name] of FLAGS) {
			const value = edit[key];
			if (value === undefined) continue;
			const cells = children(row, 'Cell').filter((cell) => attribute(cell, 'N') === name);
			if (cells.length > 1) fail('UNSUPPORTED_LAYER_EDIT', `Duplicate layer ${name} cells.`);
			let cell = cells[0];
			if (cell && (cell.hasAttribute('E') || executableCellFormula(attribute(cell, 'F'))))
				fail('UNSUPPORTED_LAYER_EDIT', `The layer's ${name} flag is set by a formula.`);
			const next = value ? '1' : '0';
			if (cell && attribute(cell, 'V') === next) continue;
			if (!cell) {
				cell = row.ownerDocument!.createElementNS(row.namespaceURI, 'Cell');
				cell.setAttribute('N', name);
				row.appendChild(cell);
			}
			cell.setAttribute('V', next);
			changed = true;
		}
	}
	const original = parts.get(pagesPart);
	if (!changed)
		return {
			bytes: await writeEditedPackage(parts, maxOutput, deadline, check),
			changedParts: [],
			diagnostics: [],
		};
	const serialized = serializeEditedXml(pageList, limits, check);
	const total =
		[...parts.values()].reduce((sum, bytes) => sum + bytes.length, 0) +
		serialized.bytes.length -
		(original?.length ?? 0);
	if (total > limits.maxTotalBytes) fail('LIMIT_TOTAL', 'Edited package total exceeds limit.');
	parts.set(pagesPart, serialized.bytes);
	const bytes = await writeEditedPackage(parts, maxOutput, deadline, check);
	const verified = await openEditablePackage(
		bytes,
		{ ...limits, maxInputBytes: maxOutput, maxRuntimeMs: Math.max(1, deadline - Date.now()) },
		check,
	);
	await visioXml(verified.pkg, pagesPart, 'Pages');
	check();
	return { bytes, changedParts: [pagesPart], diagnostics: [] };
}
