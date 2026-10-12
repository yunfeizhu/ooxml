import { expect, it, vi } from 'vitest';
import {
	captureVisioClipboard,
	deserializeVisioClipboard,
	editVsdx,
	parseVsdx,
	serializeVisioClipboard,
} from 'ooxml-core/visio';
import { createVsdxFixture } from './__fixtures__/fixture.mjs';
import { ViewerController } from './controller';
import type { CancellableClipboardCapture } from './worker-clipboard';
import type { CancellableEditor } from './worker-editor';

const capture: CancellableClipboardCapture = async (bytes, pageId, ids) =>
	serializeVisioClipboard(await captureVisioClipboard(bytes, pageId, ids));
const edit: CancellableEditor = async (bytes, commands) => {
	const result = await editVsdx(bytes, commands);
	return { ...result, document: await parseVsdx(result.bytes) };
};
async function setup(
	service: CancellableClipboardCapture = capture,
	editor: CancellableEditor = edit,
) {
	const shapes = await editVsdx(await createVsdxFixture('Original'), [
		{ type: 'create-rectangle', pageId: '1', shapeId: '2', x: 2, y: 2, width: 1, height: 1 },
	]);
	const source = await editVsdx(shapes.bytes, [
		{ type: 'insert-page', pageId: '2', name: 'Other page', afterPageId: '1' },
	]);
	const controller = new ViewerController(parseVsdx, () => {}, editor, service);
	await controller.load(source.bytes);
	const originals = controller.state
		.document!.pages[0]!.shapes.map((shape) => ({ id: shape.id, name: shape.name, pageId: '1' }))
		.reverse();
	controller.selectShapes(originals);
	return { controller, originals, bytes: source.bytes };
}

it('prepares an immutable selected source snapshot without editing and shares capture work', async () => {
	const service = vi.fn(capture);
	const { controller, originals, bytes } = await setup(service);
	const token = controller.captureClipboardToken();
	const [first, second] = await Promise.all([
		controller.prepareClipboardSelection(token),
		controller.prepareClipboardSelection(token),
	]);
	expect(first).toBe(second);
	expect(service).toHaveBeenCalledOnce();
	expect(deserializeVisioClipboard(first).selectionIds).toEqual(originals.map((shape) => shape.id));
	expect(controller.getPreparedClipboard(token)).toBe(first);
	expect(Object.isFrozen(token) && Object.isFrozen(controller.state.clipboard)).toBe(true);
	expect(Object.keys(token)).toEqual([]);
	expect(controller.state.edit.canUndo).toBe(false);
	expect(controller.exportVsdx().bytes).toEqual(bytes);
	controller.destroy();
});

it.each(['clear', 'select', 'replace', 'destroy'] as const)(
	'aborts prepared text if a ready subscriber performs %s',
	async (action) => {
		const { controller, originals } = await setup();
		let once = true;
		controller.subscribe((state) => {
			if (!state.clipboard.ready || !once) return;
			once = false;
			if (action === 'clear') controller.clearSelection();
			else if (action === 'select') controller.selectShapes([originals[0]!]);
			else if (action === 'replace') controller.setDocument(null);
			else controller.destroy();
		});
		const token = controller.captureClipboardToken();
		await expect(controller.prepareClipboardSelection(token)).rejects.toHaveProperty(
			'name',
			'AbortError',
		);
		controller.destroy();
	},
);

it('contains synchronous capture failures during automatic preparation and keeps accepted source intact', async () => {
	const failure = new Error('Injected capture failure');
	const { controller, bytes, originals } = await setup(() => {
		throw failure;
	});
	await vi.waitFor(() => expect(controller.state.clipboard.error).toBe(failure));
	expect(controller.state.clipboard.preparing).toBe(false);
	expect(controller.state.selectedShapes).toEqual(originals);
	expect(controller.exportVsdx().bytes).toEqual(bytes);
	await expect(
		controller.prepareClipboardSelection(controller.captureClipboardToken()),
	).rejects.toBe(failure);
	expect(controller.state.edit.canUndo).toBe(false);
	controller.destroy();
});

it('cuts only prepared selection as one transaction and restores selection through undo and redo', async () => {
	const { controller, originals, bytes } = await setup();
	const token = controller.captureClipboardToken();
	await expect(controller.cutPreparedSelection(token)).rejects.toThrow('Prepare');
	const text = await controller.prepareClipboardSelection(token);
	await controller.cutPreparedSelection(token);
	expect(controller.state.document!.pages[0]!.shapes).toEqual([]);
	expect(controller.state.selectedShapes).toEqual([]);
	await controller.undo();
	expect(controller.exportVsdx().bytes).toEqual(bytes);
	expect(controller.state.selectedShapes).toEqual(originals);
	expect(controller.state.edit.canUndo).toBe(false);
	await controller.redo();
	expect(controller.state.selectedShapes).toEqual([]);
	// A real clipboard snapshot survives the deletion and empty selection permits Paste.
	await controller.pasteClipboardText(text, controller.captureClipboardToken());
	expect(controller.state.document!.pages[0]!.shapes).toHaveLength(2);
	expect(controller.state.selectedShapes.map((shape) => shape.id)).toEqual(
		originals.map((shape) => shape.id),
	);
	controller.destroy();
});

it('pastes the supplied old source snapshot after edits and records one ordered selection transition', async () => {
	const { controller, originals } = await setup();
	const text = await controller.prepareClipboardSelection(controller.captureClipboardToken());
	await controller.applyEdits([
		{ type: 'replace-plain-text', pageId: '1', shapeId: '1', text: 'Changed' },
	]);
	const before = controller.exportVsdx().bytes;
	await controller.pasteClipboardText(text, controller.captureClipboardToken());
	const selected = controller.state.selectedShapes;
	expect(selected).toHaveLength(2);
	expect(controller.state.selectedShape).toBe(selected[0]);
	expect(
		controller.state.document!.pages[0]!.shapes.find((shape) => shape.id === selected[1]!.id)!.text
			?.plainText,
	).toBe('Original');
	expect(Object.isFrozen(selected) && selected.every(Object.isFrozen)).toBe(true);
	await controller.undo();
	expect(controller.exportVsdx().bytes).toEqual(before);
	expect(controller.state.selectedShapes).toEqual(originals);
	await controller.redo();
	expect(controller.state.selectedShapes).toEqual(selected);
	controller.destroy();
});

it.each(['selection', 'source', 'cancel', 'cancelEdit', 'owner'] as const)(
	'refuses stale %s tokens before deleting or pasting',
	async (action) => {
		const { controller, bytes } = await setup();
		const other = await setup();
		const token = controller.captureClipboardToken();
		const text = await controller.prepareClipboardSelection(token);
		if (action === 'selection') controller.clearSelection();
		else if (action === 'source') await controller.load(bytes);
		else if (action === 'cancel') controller.cancelLoad();
		else if (action === 'cancelEdit') controller.cancelEdit();
		const target = action === 'owner' ? other.controller : controller;
		const before = target.exportVsdx().bytes;
		await expect(target.cutPreparedSelection(token)).rejects.toHaveProperty('name', 'AbortError');
		await expect(target.pasteClipboardText(text, token)).rejects.toHaveProperty(
			'name',
			'AbortError',
		);
		expect(target.exportVsdx().bytes).toEqual(before);
		expect(target.state.edit.canUndo).toBe(false);
		controller.destroy();
		other.controller.destroy();
	},
);

it.each(['cut', 'paste'] as const)(
	'rejects a superseded %s completion after accepted source notifications',
	async (action) => {
		const { controller } = await setup();
		const token = controller.captureClipboardToken();
		const text = await controller.prepareClipboardSelection(token);
		controller.onEvent((name) => {
			if (name === 'document-change') controller.clearSelection();
		});
		const operation =
			action === 'cut'
				? controller.cutPreparedSelection(token)
				: controller.pasteClipboardText(text, token);
		await expect(operation).rejects.toHaveProperty('name', 'AbortError');
		expect(controller.state.selectedShapes).toEqual([]);
		expect(controller.state.edit.error).toBeNull();
		expect(controller.state.edit.canUndo).toBe(true);
		controller.destroy();
	},
);

it('cancels an idle capture promise and refreshes readiness without changing source or selection', async () => {
	let release!: () => void;
	const waiting = new Promise<void>((done) => {
		release = done;
	});
	const service = vi.fn(async (bytes: Uint8Array, pageId: string, ids: readonly string[]) => {
		await waiting;
		return capture(bytes, pageId, ids);
	});
	const { controller, bytes, originals } = await setup(service);
	const token = controller.captureClipboardToken();
	const pending = controller.prepareClipboardSelection(token);
	const rejected = expect(pending).rejects.toHaveProperty('name', 'AbortError');
	await vi.waitFor(() => expect(service).toHaveBeenCalledOnce());
	controller.cancelEdit();
	expect(controller.state.clipboard.ready).toBe(false);
	release();
	await rejected;
	await controller.prepareClipboardSelection(controller.captureClipboardToken());
	expect(controller.state.clipboard.ready).toBe(true);
	expect(controller.exportVsdx().bytes).toEqual(bytes);
	expect(controller.state.selectedShapes).toEqual(originals);
	expect(controller.state.edit.canUndo).toBe(false);
	controller.destroy();
});

it('never pastes a prepared internal snapshot in place of invalid clipboard text', async () => {
	const { controller, bytes } = await setup();
	await controller.prepareClipboardSelection(controller.captureClipboardToken());
	await expect(
		controller.pasteClipboardText('unrelated clipboard text', controller.captureClipboardToken()),
	).rejects.toThrow();
	expect(controller.exportVsdx().bytes).toEqual(bytes);
	expect(controller.state.edit.canUndo).toBe(false);
	controller.setDocument(controller.state.document);
	expect(() => controller.captureClipboardToken()).toThrow('Open a .vsdx file');
	controller.destroy();
});

it.each(['cut', 'paste'] as const)(
	'refuses a pending %s source transaction after newer selection or page intent',
	async (action) => {
		for (const changed of ['selection', 'page'] as const) {
			let release!: () => void;
			const waiting = new Promise<void>((done) => {
				release = done;
			});
			const { controller, bytes, originals } = await setup(capture, async (source, commands) => {
				await waiting;
				return edit(source, commands);
			});
			const token = controller.captureClipboardToken();
			const text = await controller.prepareClipboardSelection(token);
			const operation =
				action === 'cut'
					? controller.cutPreparedSelection(token)
					: controller.pasteClipboardText(text, token);
			const refused = expect(operation).rejects.toHaveProperty('name', 'AbortError');
			if (changed === 'page') controller.setPage(1);
			else controller.selectShapes([originals[0]!]);
			release();
			await refused;
			expect(controller.exportVsdx().bytes).toEqual(bytes);
			expect(controller.state.edit.canUndo).toBe(false);
			expect(controller.state.edit.error).toBeNull();
			expect(controller.state.selectedShapes).toEqual(changed === 'page' ? [] : [originals[0]!]);
			controller.destroy();
		}
	},
);
