import { expect, it, vi } from 'vitest';
import { ViewerController } from './controller';
import { demoDocument } from 'ooxml-core/visio/ui';
import type { EditTransactionResult, CancellableEditor } from './worker-editor';
import { editVsdx, parseVsdx } from 'ooxml-core/visio';
import { createVsdxFixture } from './__fixtures__/fixture.mjs';
function result(value = 2): EditTransactionResult {
	return {
		bytes: new Uint8Array([value]),
		document: structuredClone(demoDocument),
		changedParts: ['page.xml'],
		diagnostics: [{ code: 'edit-caches-not-recalculated', message: 'Unverified' }],
	};
}
function deferred<T>() {
	let resolve!: (value: T) => void;
	return {
		promise: new Promise<T>((r) => {
			resolve = r;
		}),
		resolve: (value: T) => resolve(value),
	};
}
function setup(editor: CancellableEditor = async () => result()) {
	return new ViewerController(
		async () => structuredClone(demoDocument),
		() => {},
		editor,
	);
}
it('keeps owned original source, atomic edits and defensive exports with undo/redo', async () => {
	const viewer = setup();
	const source = new Uint8Array([1]);
	const load = viewer.load(source);
	source[0] = 99;
	await load;
	expect(viewer.exportVsdx().bytes).toEqual(new Uint8Array([1]));
	const originalGeneration = viewer.documentGeneration;
	viewer.setZoom(2);
	viewer.setPage(1);
	await viewer.replacePlainText('0', '1', 'new');
	expect(viewer.state.edit).toMatchObject({
		dirty: true,
		canUndo: true,
		canRedo: false,
		busy: false,
	});
	expect(viewer.documentGeneration).toBe(originalGeneration + 1);
	expect(viewer.state.zoom).toBe(2);
	expect(viewer.state.pageIndex).toBe(1);
	const copy = viewer.exportVsdx();
	copy.bytes[0] = 99;
	expect(viewer.exportVsdx().bytes[0]).toBe(2);
	await viewer.undo();
	expect(viewer.exportVsdx().bytes[0]).toBe(1);
	expect(viewer.state.edit).toMatchObject({ dirty: false, canRedo: true });
	await viewer.redo();
	expect(viewer.exportVsdx().bytes[0]).toBe(2);
	expect(viewer.state.edit.diagnostics[0]?.code).toBe('edit-caches-not-recalculated');
});
it('no-op preserves generation/history/redo; successful new edit clears redo', async () => {
	const editor = vi.fn<CancellableEditor>().mockResolvedValue(result());
	const viewer = setup(editor);
	await viewer.load(new Uint8Array([1]));
	await viewer.replacePlainText('0', '1', 'a');
	await viewer.undo();
	const generation = viewer.documentGeneration;
	editor.mockResolvedValueOnce({ ...result(), changedParts: [] });
	await viewer.replacePlainText('0', '1', 'original');
	expect(viewer.documentGeneration).toBe(generation);
	expect(viewer.state.edit.canRedo).toBe(true);
	await viewer.replacePlainText('0', '1', 'b');
	expect(viewer.state.edit.canRedo).toBe(false);
});
it('failed edit/reparse leaves original bytes/model/history intact and retains code', async () => {
	const error = Object.assign(new Error('Rich text cannot be edited'), {
		code: 'UNSUPPORTED_TEXT_EDIT',
	});
	const editor = vi
		.fn<CancellableEditor>()
		.mockRejectedValueOnce(error)
		.mockResolvedValueOnce({ ...result(), document: {} as never });
	const viewer = setup(editor);
	await viewer.load(new Uint8Array([1]));
	const document = viewer.state.document;
	await expect(viewer.replacePlainText('0', '1', 'a')).rejects.toBe(error);
	expect(viewer.state.edit.error).toBe(error);
	await expect(viewer.replacePlainText('0', '1', 'a')).rejects.toThrow();
	expect(viewer.state.document).toBe(document);
	expect(viewer.exportVsdx().bytes[0]).toBe(1);
	expect(viewer.state.edit.canUndo).toBe(false);
});
it.each(['cancel', 'load', 'replace', 'destroy'] as const)(
	'invalidates in-flight edits on %s',
	async (action) => {
		const pending = deferred<EditTransactionResult>();
		const editor = Object.assign(
			vi.fn(() => pending.promise),
			{ cancel: vi.fn() },
		);
		const viewer = setup(editor);
		await viewer.load(new Uint8Array([1]));
		const events = vi.fn();
		viewer.onEvent(events);
		const edit = viewer.replacePlainText('0', '1', 'a');
		const rejected = expect(edit).rejects.toMatchObject({ name: 'AbortError' });
		await expect(viewer.replacePlainText('0', '1', 'b')).rejects.toThrow('in progress');
		expect(() => viewer.exportVsdx()).toThrow('Wait');
		if (action === 'cancel') viewer.cancelEdit();
		if (action === 'load') await viewer.load(new Uint8Array([3]));
		if (action === 'replace') viewer.setDocument(demoDocument);
		if (action === 'destroy') viewer.destroy();
		pending.resolve(result());
		await rejected;
		expect(events.mock.calls.some((call) => call[0] === 'document-change')).toBe(false);
		if (action === 'cancel') expect(viewer.exportVsdx().bytes[0]).toBe(1);
		if (action === 'load') expect(viewer.exportVsdx().bytes[0]).toBe(3);
	},
);
it('reentrant cancellation before the worker starts prevents the transaction', async () => {
	const editor = vi.fn<CancellableEditor>().mockResolvedValue(result());
	const viewer = setup(editor);
	await viewer.load(new Uint8Array([1]));
	viewer.subscribe((state) => {
		if (state.edit.busy) viewer.cancelEdit();
	});
	await expect(viewer.replacePlainText('0', '1', 'a')).rejects.toMatchObject({
		name: 'AbortError',
	});
	expect(editor).not.toHaveBeenCalled();
});
it('reentrant source replacement on edit commit suppresses obsolete event', async () => {
	const viewer = setup();
	await viewer.load(new Uint8Array([1]));
	const events = vi.fn();
	viewer.onEvent(events);
	viewer.subscribe((state) => {
		if (state.edit.dirty) viewer.setDocument(demoDocument);
	});
	await viewer.replacePlainText('0', '1', 'a');
	expect(viewer.state.edit.sourceAvailable).toBe(false);
	expect(events).not.toHaveBeenCalled();
});
it('model-only and destroyed controllers cannot edit/save', async () => {
	const viewer = setup();
	viewer.setDocument(demoDocument);
	await expect(viewer.undo()).rejects.toThrow('Open a .vsdx file');
	expect(() => viewer.exportVsdx()).toThrow('Open a .vsdx file');
	viewer.destroy();
	await expect(viewer.redo()).rejects.toThrow('destroyed');
	expect(() => viewer.exportVsdx()).toThrow('destroyed');
});
it('failed replacement load retains an editable previously accepted source', async () => {
	const parser = vi
		.fn()
		.mockResolvedValueOnce(demoDocument)
		.mockRejectedValueOnce(new Error('Bad ZIP'));
	const viewer = new ViewerController(
		parser,
		() => {},
		async () => result(),
	);
	await viewer.load(new Uint8Array([1]));
	await expect(viewer.load(new Uint8Array([2]))).rejects.toThrow('Bad ZIP');
	expect(viewer.exportVsdx().bytes[0]).toBe(1);
	await viewer.replacePlainText('0', '1', 'a');
	expect(viewer.state.edit.dirty).toBe(true);
});
it('real core transaction edits, reparses, undoes and redoes source-backed bytes', async () => {
	const editor: CancellableEditor = async (bytes, commands) => {
		const edited = await editVsdx(bytes, commands);
		return { ...edited, document: await parseVsdx(edited.bytes) };
	};
	const viewer = new ViewerController(parseVsdx, () => {}, editor);
	const bytes = await createVsdxFixture('Original');
	await viewer.load(bytes);
	const page = viewer.state.document!.pages[0]!;
	const shape = page.shapes[0]!;
	await viewer.replacePlainText(page.id, shape.id, '<script>inert & text</script>');
	expect(viewer.state.document!.pages[0]!.shapes[0]!.text.plainText).toBe(
		'<script>inert & text</script>',
	);
	expect((await parseVsdx(viewer.exportVsdx().bytes)).pages[0]!.shapes[0]!.text.plainText).toBe(
		'<script>inert & text</script>',
	);
	await viewer.undo();
	expect(viewer.exportVsdx().bytes).toEqual(Uint8Array.from(bytes));
	await viewer.redo();
	expect(viewer.state.edit.dirty).toBe(true);
});

it('snapshots an atomic geometry bundle before subscribers and records one history operation', async () => {
	const editor = vi.fn<CancellableEditor>().mockResolvedValue(result());
	const viewer = setup(editor);
	await viewer.load(new Uint8Array([1]));
	const commands = [
		{ type: 'move-shape' as const, pageId: '1', shapeId: 's1', x: 2, y: 3 },
		{ type: 'resize-shape' as const, pageId: '1', shapeId: 's1', width: 4, height: 5 },
	];
	viewer.subscribe((state) => {
		if (state.edit.busy) commands[0]!.x = 99;
	});
	await viewer.applyEdits(commands);
	expect(editor.mock.calls[0]![1]).toEqual([
		{ type: 'move-shape', pageId: '1', shapeId: 's1', x: 2, y: 3 },
		{ type: 'resize-shape', pageId: '1', shapeId: 's1', width: 4, height: 5 },
	]);
	await viewer.undo();
	expect(viewer.exportVsdx().bytes[0]).toBe(1);
	expect(viewer.state.edit.canUndo).toBe(false);
	viewer.destroy();
});
it('clears selection when a geometry transaction deletes its target', async () => {
	const edited = result();
	edited.document.pages[0]!.shapes = edited.document.pages[0]!.shapes.filter(
		(shape) => shape.id !== 's1',
	);
	const viewer = setup(async () => edited);
	await viewer.load(new Uint8Array([1]));
	viewer.selectShape({ id: 's1', name: 'Start', pageId: '1' });
	await viewer.applyEdits([{ type: 'delete-shape', pageId: '1', shapeId: 's1' }]);
	expect(viewer.state.selectedShape).toBeNull();
	viewer.destroy();
});

it('real geometry transactions flow through source history, reparsing and export', async () => {
	const editor: CancellableEditor = async (bytes, commands) => {
		const edited = await editVsdx(bytes, commands);
		return { ...edited, document: await parseVsdx(edited.bytes) };
	};
	const viewer = new ViewerController(parseVsdx, () => {}, editor);
	const original = await createVsdxFixture('Existing source shape');
	await viewer.load(original);
	await viewer.applyEdits([
		{
			type: 'create-rectangle',
			pageId: '1',
			shapeId: '42',
			x: 2,
			y: 3,
			width: 1,
			height: 2,
			text: 'New rectangle',
		},
		{ type: 'resize-shape', pageId: '1', shapeId: '42', width: 3, height: 4 },
		{ type: 'move-shape', pageId: '1', shapeId: '1', x: 5, y: 6 },
	]);
	const page = viewer.state.document!.pages[0]!;
	expect(page.shapes.find((shape) => shape.id === '42')).toMatchObject({
		width: 3,
		height: 4,
		text: { plainText: 'New rectangle' },
	});
	expect((await parseVsdx(viewer.exportVsdx().bytes)).pages[0]!.shapes).toHaveLength(2);
	viewer.selectShape({ id: '42', name: 'New rectangle', pageId: '1' });
	await viewer.applyEdits([{ type: 'delete-shape', pageId: '1', shapeId: '42' }]);
	expect(viewer.state.selectedShape).toBeNull();
	await viewer.undo();
	expect(viewer.state.document!.pages[0]!.shapes).toHaveLength(2);
	await viewer.undo();
	expect(viewer.exportVsdx().bytes).toEqual(Uint8Array.from(original));
	viewer.destroy();
});

it('keeps the source epoch stable for edits and history, but invalidates replacement sources', async () => {
	const viewer = setup();
	await viewer.load(new Uint8Array([1]));
	const source = viewer.sourceGeneration;
	await viewer.replacePlainText('1', 's1', 'Changed');
	expect(viewer.sourceGeneration).toBe(source);
	await viewer.undo();
	expect(viewer.sourceGeneration).toBe(source);
	await viewer.redo();
	expect(viewer.sourceGeneration).toBe(source);
	await viewer.load(new Uint8Array([3]));
	expect(viewer.sourceGeneration).toBe(source + 1);
	viewer.setDocument(demoDocument);
	expect(viewer.sourceGeneration).toBe(source + 2);
	viewer.destroy();
	expect(() => viewer.sourceGeneration).toThrow('destroyed');
});
