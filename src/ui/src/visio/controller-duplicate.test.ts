import { expect, it, vi } from 'vitest';
import { editVsdx, parseVsdx } from 'ooxml-core/visio';
import JSZip from 'jszip';
import { createVsdxFixture } from './__fixtures__/fixture.mjs';
import { ViewerController } from './controller';
import type { CancellableEditor } from './worker-editor';

const transaction: CancellableEditor = async (bytes, commands) => {
	const result = await editVsdx(bytes, commands);
	return { ...result, document: await parseVsdx(result.bytes) };
};
async function setup() {
	const zip = await JSZip.loadAsync(await createVsdxFixture('Original'));
	const ns = 'http://schemas.microsoft.com/office/visio/2012/main';
	const pages = 'visio/pages/pages.xml',
		relationships = 'visio/pages/_rels/pages.xml.rels';
	zip.file(
		pages,
		(await zip.file(pages)!.async('string')).replace(
			'</Pages>',
			'<Page ID="2" Name="Other page"><PageSheet><Cell N="PageWidth" V="8.5"/><Cell N="PageHeight" V="11"/></PageSheet><Rel r:id="rId2"/></Page></Pages>',
		),
	);
	zip.file(
		relationships,
		(await zip.file(relationships)!.async('string')).replace(
			'</Relationships>',
			'<Relationship Id="rId2" Type="http://schemas.microsoft.com/visio/2010/relationships/page" Target="page2.xml"/></Relationships>',
		),
	);
	zip.file('visio/pages/page2.xml', `<PageContents xmlns="${ns}"><Shapes/></PageContents>`);
	const source = await editVsdx(await zip.generateAsync({ type: 'uint8array' }), [
		{ type: 'create-rectangle', pageId: '1', shapeId: '2', x: 2, y: 2, width: 1, height: 1 },
	]);
	const editor = vi.fn(transaction);
	const controller = new ViewerController(parseVsdx, () => {}, editor);
	await controller.load(source.bytes);
	const page = controller.state.document!.pages[0]!;
	const originals = [...page.shapes]
		.reverse()
		.map((shape) => ({ id: shape.id, name: shape.name, pageId: page.id }));
	controller.selectShapes(originals);
	return { controller, editor, originals, bytes: source.bytes };
}
function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

it('accepts cloned source and ordered primary selection atomically in one undo transition', async () => {
	const { controller, editor, originals, bytes } = await setup();
	const accepted = vi.fn();
	let observedDocument = controller.state.document;
	const selectedPrimary = vi.fn();
	controller.onEvent((name, value) => {
		if (name === 'shape-select') selectedPrimary(value);
	});
	controller.subscribe((state) => {
		const changedDocument = state.document !== observedDocument;
		observedDocument = state.document;
		if (changedDocument && !state.edit.busy && state.document!.pages[0]!.shapes.length === 4) {
			expect(state.selectedShapes).toHaveLength(2);
			expect(
				state.selectedShapes.every(
					(item) => !originals.some((original) => original.id === item.id),
				),
			).toBe(true);
			accepted(state.selectedShapes);
		}
	});
	await controller.duplicateSelection();
	const command = editor.mock.calls[0]![1][0]!;
	expect(command.type).toBe('duplicate-shapes');
	if (command.type !== 'duplicate-shapes') throw new Error('Expected duplicate command');
	expect(command.copies.map((copy) => copy.shapeId)).toEqual(originals.map((shape) => shape.id));
	const clones = controller.state.selectedShapes;
	expect(clones.map((shape) => shape.id)).toEqual(command.copies.map((copy) => copy.newShapeId));
	expect(controller.state.selectedShape).toBe(clones[0]);
	expect(selectedPrimary).toHaveBeenCalledOnce();
	expect(selectedPrimary).toHaveBeenLastCalledWith(clones[0]);
	expect(Object.isFrozen(clones) && clones.every(Object.isFrozen)).toBe(true);
	expect(accepted).toHaveBeenCalledOnce();
	const saved = await parseVsdx(controller.exportVsdx().bytes);
	expect(saved.pages[0]!.shapes).toHaveLength(4);
	await controller.undo();
	expect(controller.exportVsdx().bytes).toEqual(bytes);
	expect(controller.state.selectedShapes).toEqual(originals);
	expect(controller.state.edit.canUndo).toBe(false);
	await controller.redo();
	expect(controller.state.selectedShapes).toEqual(clones);
	controller.destroy();
});

it.each(['clear', 'select', 'page'] as const)(
	'keeps newer %s intent during duplication and later undo',
	async (mode) => {
		const { controller, editor, originals } = await setup();
		const waiting = deferred();
		editor.mockImplementationOnce(async (bytes, edits) => {
			await waiting.promise;
			return transaction(bytes, edits);
		});
		const operation = controller.duplicateSelection();
		if (mode === 'select') controller.selectShapes([originals[0]!]);
		else if (mode === 'page') controller.setPage(1);
		else controller.clearSelection();
		waiting.resolve();
		await operation;
		expect(controller.state.document!.pages[0]!.shapes).toHaveLength(4);
		expect(controller.state.selectedShapes).toEqual(mode === 'select' ? [originals[0]!] : []);
		expect(controller.state.pageIndex).toBe(mode === 'page' ? 1 : 0);
		await controller.undo();
		expect(controller.state.selectedShapes).toEqual(mode === 'select' ? [originals[0]!] : []);
		controller.destroy();
	},
);

it('keeps newer busy-state callback intent and final selection-event intent', async () => {
	const { controller, originals } = await setup();
	let busy = true;
	const stop = controller.subscribe((state) => {
		if (state.edit.busy && busy) {
			busy = false;
			controller.clearSelection();
		}
	});
	await controller.duplicateSelection();
	expect(controller.state.selectedShapes).toEqual([]);
	stop();
	controller.selectShapes(originals);
	controller.onEvent((name) => {
		if (
			name === 'selection-change' &&
			controller.state.selectedShapes.some(
				(shape) => !originals.some((original) => original.id === shape.id),
			)
		)
			controller.clearSelection();
	});
	await controller.duplicateSelection();
	expect(controller.state.selectedShapes).toEqual([]);
	await controller.undo();
	expect(controller.state.selectedShapes).toEqual([]);
	controller.destroy();
});

it('keeps explicit clearing after duplication through undo and redo', async () => {
	const { controller } = await setup();
	await controller.duplicateSelection();
	controller.clearSelection();
	await controller.undo();
	expect(controller.state.selectedShapes).toEqual([]);
	await controller.redo();
	expect(controller.state.selectedShapes).toEqual([]);
	controller.destroy();
});

it('lets a legacy primary-selection callback override the accepted clone selection', async () => {
	const { controller, originals } = await setup();
	const primary = vi.fn();
	const stop = controller.onEvent((name, value) => {
		if (name === 'shape-select') {
			stop();
			primary(value);
			controller.selectShapes([originals[0]!]);
		}
	});
	await controller.duplicateSelection();
	expect(primary).toHaveBeenCalledOnce();
	expect(controller.state.selectedShapes).toEqual([originals[0]!]);
	await controller.undo();
	expect(controller.state.selectedShapes).toEqual([originals[0]!]);
	controller.destroy();
});

it('does not emit a stale page change after a primary callback replaces the document', async () => {
	const { controller, editor } = await setup();
	editor.mockImplementationOnce(async (bytes, commands) => {
		const result = await transaction(bytes, commands);
		result.document.pages.reverse();
		return result;
	});
	const pageChange = vi.fn();
	controller.onEvent((name, value) => {
		if (name === 'page-change') pageChange(value);
	});
	controller.onEvent((name) => {
		if (name === 'shape-select') controller.setDocument(null);
	});
	await controller.duplicateSelection();
	expect(controller.state.document).toBeNull();
	expect(controller.state.selectedShapes).toEqual([]);
	expect(pageChange).not.toHaveBeenCalled();
	controller.destroy();
});

it('keeps a newer selection from a host page getter after the command snapshot', async () => {
	const { controller, originals } = await setup();
	controller.selectShapes([originals[1]!]);
	const page = controller.state.document!.pages[0]!;
	let reads = 0;
	Object.defineProperty(page, 'id', {
		get() {
			if (++reads === 3) controller.selectShapes([originals[0]!]);
			return '1';
		},
	});
	await controller.duplicateSelection();
	expect(reads).toBeGreaterThanOrEqual(3);
	expect(controller.state.selectedShapes).toEqual([originals[0]!]);
	expect(controller.state.document!.pages[0]!.shapes).toHaveLength(3);
	controller.destroy();
});

it('rejects a newer selection made by a host getter while the core command is captured', async () => {
	const { controller, originals, bytes } = await setup();
	controller.selectShapes([originals[1]!]);
	const page = controller.state.document!.pages[0]!;
	let reads = 0;
	Object.defineProperty(page, 'id', {
		get() {
			if (++reads === 2) controller.selectShapes([originals[0]!]);
			return '1';
		},
	});
	await expect(controller.duplicateSelection()).rejects.toHaveProperty('name', 'AbortError');
	expect(controller.state.selectedShapes).toEqual([originals[0]!]);
	expect(controller.exportVsdx().bytes).toEqual(bytes);
	expect(controller.state.edit.canUndo).toBe(false);
	controller.destroy();
});

it('keeps no-op duplicate results out of source and selection history', async () => {
	const { controller, editor, originals, bytes } = await setup();
	editor.mockResolvedValueOnce({
		bytes,
		document: controller.state.document!,
		changedParts: [],
		diagnostics: [],
	});
	await controller.duplicateSelection();
	expect(controller.state.selectedShapes).toEqual(originals);
	expect(controller.state.edit.canUndo).toBe(false);
	expect(controller.exportVsdx().bytes).toEqual(bytes);
	controller.destroy();
});

it.each(['cancel', 'replace', 'destroy'] as const)(
	'rejects superseded %s without accepting clone source or selection',
	async (mode) => {
		const { controller, editor, originals, bytes } = await setup();
		const waiting = deferred();
		editor.mockImplementationOnce(async (source, edits) => {
			await waiting.promise;
			return transaction(source, edits);
		});
		const operation = controller.duplicateSelection();
		const rejected = expect(operation).rejects.toHaveProperty('name', 'AbortError');
		if (mode === 'cancel') controller.cancelEdit();
		else if (mode === 'replace') controller.setDocument(null);
		else controller.destroy();
		waiting.resolve();
		await rejected;
		if (mode === 'cancel') {
			expect(controller.exportVsdx().bytes).toEqual(bytes);
			expect(controller.state.selectedShapes).toEqual(originals);
			expect(controller.state.edit.canUndo).toBe(false);
		} else expect(controller.state.selectedShapes).toEqual([]);
		controller.destroy();
	},
);

it('refuses busy and model-only duplication and leaves rejected edits untouched', async () => {
	const { controller, editor, originals, bytes } = await setup();
	editor.mockRejectedValueOnce(new Error('Unsupported source formula'));
	await expect(controller.duplicateSelection()).rejects.toThrow('Unsupported source formula');
	expect(controller.exportVsdx().bytes).toEqual(bytes);
	expect(controller.state.selectedShapes).toEqual(originals);
	expect(controller.state.edit.canUndo).toBe(false);
	const waiting = deferred();
	editor.mockImplementationOnce(async (source, edits) => {
		await waiting.promise;
		return transaction(source, edits);
	});
	const operation = controller.duplicateSelection();
	await expect(controller.duplicateSelection()).rejects.toThrow('in progress');
	waiting.resolve();
	await operation;
	controller.setDocument(controller.state.document);
	controller.selectAll();
	await expect(controller.duplicateSelection()).rejects.toThrow('Open a .vsdx file');
	controller.destroy();
});
