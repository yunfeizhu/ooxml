import { buildXml } from '../xml/index';
import type { EditVsdxOptions } from './edit';
import { DEFAULTS, fail } from './package-common';
import { openEditablePackage } from './edit-package';
import { related, visioXml } from './parts';
import { attribute, children } from './sheet';
import { admitted, numeric } from './edit-geometry-admission';
import { assertShapeLocks, assertUnlayeredShape, formattingCell } from './edit-style-admission';
import { assertShapeOrderPackageScope } from './edit-shape-order';
import { assertCloneLeaf } from './edit-duplicate';
import { indexCells, key } from './edit-recalculate-index';
import { createVisioCellEvaluator } from './edit-recalculate-values';
import {
	clipboardResources,
	clipboardPageContext,
	assertClipboardResourceReferences,
} from './clipboard-resources';
import { assertClipboardFormulaScope, assertClipboardXmlLimits } from './clipboard-xml';
import { assertInstanceClipboardScope, masterIdentities } from './edit-instance-clipboard';
import { planInstanceCopy } from './edit-instance-duplicate';
import { pageShapes, shapeIsStructural, stencilInstance } from './edit-instance-shape';
import { masterTemplate } from './edit-text-scope';
import {
	clipboardId,
	snapshotVisioClipboard,
	serializeVisioClipboard,
	type VisioClipboardSnapshot,
} from './clipboard-types';
export {
	serializeVisioClipboard,
	deserializeVisioClipboard,
	VISIO_CLIPBOARD_MAGIC,
	VISIO_CLIPBOARD_MAX_CHARS,
} from './clipboard-types';
export type { VisioClipboardSnapshot } from './clipboard-types';

/** Capture bounded source XML, never a rendering approximation or an entire package. */
export async function captureVisioClipboard(
	input: Uint8Array | ArrayBuffer,
	pageId: string,
	shapeIds: readonly string[],
	options: EditVsdxOptions = {},
): Promise<VisioClipboardSnapshot> {
	pageId = clipboardId(pageId);
	if (!Array.isArray(shapeIds) || !shapeIds.length || shapeIds.length > 1000)
		fail('INVALID_CLIPBOARD', 'Capture requires one to 1000 selected shapes.');
	const selected = shapeIds.map(clipboardId);
	if (new Set(selected).size !== selected.length)
		fail('INVALID_CLIPBOARD', 'Capture selection must be unique.');
	const limits = { ...DEFAULTS, ...options.limits };
	for (const value of Object.values(limits))
		if (!Number.isSafeInteger(value) || value <= 0)
			fail('INVALID_LIMITS', 'Capture limits require positive safe integers.');
	const sourceBytes = input instanceof Uint8Array ? input : new Uint8Array(input);
	if (sourceBytes.length > limits.maxInputBytes)
		fail('LIMIT_INPUT', 'Clipboard source exceeds package input limit.');
	const original = new Uint8Array(sourceBytes);
	const deadline = Date.now() + limits.maxRuntimeMs;
	const check = () => {
		if (Date.now() >= deadline) fail('LIMIT_RUNTIME', 'Clipboard capture deadline exceeded.');
	};
	const { pkg, pages } = await openEditablePackage(original, limits, check);
	const path = pages.get(pageId);
	if (!path) fail('EDIT_TARGET_NOT_FOUND', 'Clipboard page does not exist.');
	const root = await visioXml(pkg, path, 'PageContents');
	const document = await visioXml(pkg, (await related(pkg, '', 'document'))!, 'VisioDocument');
	const template = masterTemplate(pkg);
	// Copying a container or a list is the one case where container lookups elsewhere matter.
	let structural = false;
	for (const id of selected) {
		const shape = pageShapes(root).find((item) => attribute(item, 'ID') === id);
		structural ||= !shape || (await shapeIsStructural(shape, template));
	}
	await assertShapeOrderPackageScope(pkg, check, structural);
	const evaluate = createVisioCellEvaluator(
		indexCells(new Map([[pageId, root]]), { check }),
		{ check },
		true,
	);
	const chosen = new Set(selected);
	const masterIds = new Set<string>();
	for (const id of selected) {
		check();
		// A stencil shape is captured as it is: an instance that names its master.
		const stencil = await stencilInstance(root, id, template, 'UNSUPPORTED_CLIPBOARD');
		if (stencil) {
			await planInstanceCopy(pkg, pageId, root, stencil, 0, 0, 'UNSUPPORTED_CLIPBOARD');
			assertClipboardResourceReferences(stencil.instance, document);
			assertInstanceClipboardScope(stencil.instance, chosen);
			masterIds.add(attribute(stencil.instance, 'Master')!);
			continue;
		}
		const source = admitted(root, id);
		assertCloneLeaf(source);
		assertUnlayeredShape(source, document);
		assertShapeLocks(source, document, ['LockSelect']);
		assertClipboardResourceReferences(source, document);
		assertClipboardFormulaScope(source, chosen, check);
		for (const name of ['PinX', 'PinY']) {
			numeric(formattingCell(source, name));
			evaluate(key({ pageId, shapeId: id, cell: name }));
		}
		for (const connects of children(root, 'Connects'))
			for (const connection of children(connects, 'Connect'))
				if (['FromSheet', 'ToSheet'].some((name) => attribute(connection, name) === id))
					fail('UNSUPPORTED_CLIPBOARD', 'Glued shapes cannot be captured safely.');
	}
	const context = await clipboardPageContext(pkg, pageId);
	const snapshot = snapshotVisioClipboard({
		format: 'ooxml.visio-shapes',
		version: 1,
		sourcePageId: pageId,
		sourceDrawingScale: context.scale,
		selectionIds: selected,
		pageContext: context.xml,
		shapes: children(children(root, 'Shapes')[0], 'Shape')
			.filter((node) => chosen.has(attribute(node, 'ID')!))
			.map((node) => ({ shapeId: attribute(node, 'ID')!, xml: buildXml(node) })),
		resources: await clipboardResources(pkg),
		...(masterIds.size ? { masters: await masterIdentities(pkg, [...masterIds]) } : {}),
	});
	serializeVisioClipboard(snapshot);
	assertClipboardXmlLimits(snapshot, check);
	return snapshot;
}
