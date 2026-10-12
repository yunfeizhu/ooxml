// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { parseVsdx } from 'ooxml-core/visio';
import JSZip from 'jszip';
import { setupFormattingViewer } from './__fixtures__/formatting-viewer';
import { createContextMenus } from './viewer-context-menu';
import { wireTellMe } from './viewer-tell-me';

afterEach(() => document.body.replaceChildren());
const setup = async (source = true) => {
	const view = await setupFormattingViewer(source);
	view.root.append(...createContextMenus(document));
	view.selection();
	return view;
};
it('keeps Paste disabled while its caret duplicates source with selection and undo history', async () => {
	const view = await setup();
	const paste = view.button('paste');
	const main = paste.shadowRoot!.querySelector<HTMLButtonElement>('.main')!;
	const caret = paste.shadowRoot!.querySelector<HTMLButtonElement>('.caret')!;
	expect(main.disabled).toBe(true);
	expect(caret.disabled).toBe(false);
	expect(view.button('paste-item').disabled).toBe(true);
	main.click();
	expect(view.edits).toEqual([]);
	caret.click();
	view.press('duplicate');
	await view.done();
	expect(view.edits).toHaveLength(1);
	expect(view.edits[0]).toHaveLength(1);
	expect(view.edits[0]![0]!.type).toBe('duplicate-shapes');
	const page = view.controller.state.document!.pages[0]!;
	expect(page.shapes).toHaveLength(2);
	const clone = page.shapes[1]!;
	expect(view.controller.state.selectedShapes.map((shape) => shape.id)).toEqual([clone.id]);
	expect(clone.text?.plainText).toBe(page.shapes[0]!.text?.plainText);
	expect(clone.rotation!.pinX).toBeCloseTo(page.shapes[0]!.rotation!.pinX + 0.33, 10);
	expect(clone.rotation!.pinY).toBeCloseTo(page.shapes[0]!.rotation!.pinY - 0.33, 10);
	expect((await parseVsdx(view.controller.exportVsdx().bytes)).pages[0]!.shapes).toHaveLength(2);
	await view.controller.undo();
	expect(view.controller.state.document!.pages[0]!.shapes).toHaveLength(1);
	expect(view.controller.state.selectedShape?.id).toBe('1');
	await view.controller.redo();
	expect(view.controller.state.selectedShape?.id).toBe(clone.id);
	view.dispose();
	view.controller.destroy();
});
it('duplicates all selected shapes once from the context menu and Ctrl+D leaves inputs alone', async () => {
	const view = await setup();
	await view.controller.applyEdits([
		{ type: 'create-rectangle', pageId: '1', shapeId: '2', x: 2, y: 2, width: 1, height: 1 },
	]);
	view.controller.selectAll();
	view.press('ctx-duplicate');
	await view.done();
	const last = view.edits.at(-1)![0]!;
	expect(last.type).toBe('duplicate-shapes');
	if (last.type !== 'duplicate-shapes') throw new Error('Expected duplicate');
	expect(last.copies.map((copy) => copy.shapeId)).toEqual(['1', '2']);
	expect(view.controller.state.document!.pages[0]!.shapes).toHaveLength(4);
	expect(view.controller.state.selectedShapes.map((shape) => shape.id)).toEqual(
		last.copies.map((copy) => copy.newShapeId),
	);
	const input = document.createElement('input');
	view.root.append(input);
	const key = () =>
		new KeyboardEvent('keydown', {
			key: 'd',
			ctrlKey: true,
			bubbles: true,
			composed: true,
			cancelable: true,
		});
	const editableKey = key();
	input.dispatchEvent(editableKey);
	expect(editableKey.defaultPrevented).toBe(false);
	expect(view.edits).toHaveLength(2);
	const canvasKey = key();
	view.viewport.dispatchEvent(canvasKey);
	expect(canvasKey.defaultPrevented).toBe(true);
	await view.done();
	expect(view.edits).toHaveLength(3);
	expect(view.controller.state.document!.pages[0]!.shapes).toHaveLength(6);
	view.dispose();
	view.controller.destroy();
});
it('disables and guards duplicate for read-only, empty, busy and other-page selections', async () => {
	const view = await setup(false);
	expect(view.button('duplicate').disabled).toBe(true);
	expect(view.button('ctx-duplicate').disabled).toBe(true);
	expect(
		view.button('paste').shadowRoot!.querySelector<HTMLButtonElement>('.caret')!.disabled,
	).toBe(true);
	view.commands.run({ type: 'duplicate' });
	expect(view.edits).toEqual([]);
	await view.controller.load(view.bytes);
	view.selection();
	expect(view.button('duplicate').disabled).toBe(false);
	view.commands.render({
		...view.controller.state,
		edit: { ...view.controller.state.edit, busy: true },
	});
	expect(view.button('duplicate').disabled).toBe(true);
	view.commands.render({
		...view.controller.state,
		selectedShapes: [{ id: '1', name: 'Background', pageId: 'other' }],
	});
	expect(view.button('ctx-duplicate').disabled).toBe(true);
	view.controller.clearSelection();
	view.commands.run({ type: 'duplicate' });
	expect(view.edits).toEqual([]);
	view.dispose();
	view.controller.destroy();
});
it('lists the disabled Paste command and enabled Duplicate honestly in Tell me', async () => {
	const view = await setup();
	const search = view.root.querySelector('.tell-me') as HTMLElement & {
		commands: { id: string; disabled?: boolean }[];
	};
	const dispose = wireTellMe(view.root);
	search.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
	expect(search.commands.find((command) => command.id === 'paste')?.disabled).toBe(true);
	expect(search.commands.find((command) => command.id === 'duplicate')?.disabled).toBe(false);
	dispose();
	view.dispose();
	view.controller.destroy();
});
it('reports authoritative source refusal without changing bytes, history or selection', async () => {
	const view = await setup();
	const zip = await JSZip.loadAsync(view.bytes);
	const path = 'visio/pages/page1.xml';
	zip.file(
		path,
		(await zip.file(path)!.async('string')).replace(
			'<Cell N="PinX" V="4"/>',
			'<Cell N="PinX" V="4" F="GUARD(4)"/>',
		),
	);
	const bytes = await zip.generateAsync({ type: 'uint8array' });
	await view.controller.load(bytes);
	view.selection();
	view.press('duplicate');
	await view.done();
	expect(view.controller.state.edit.error).toBeDefined();
	expect(view.controller.state.edit.canUndo).toBe(false);
	expect(view.controller.state.selectedShape?.id).toBe('1');
	expect(view.controller.exportVsdx().bytes).toEqual(bytes);
	expect(view.controller.state.document!.pages[0]!.shapes).toHaveLength(1);
	view.dispose();
	view.controller.destroy();
});
it('shares source-backed ordering and edge disabled states between context menu and ribbon', async () => {
	const view = await setup();
	await view.controller.applyEdits([
		{ type: 'create-rectangle', pageId: '1', shapeId: '2', x: 2, y: 2, width: 1, height: 1 },
	]);
	view.selection();
	expect(view.button('ctx-send-backward').disabled).toBe(true);
	expect(view.button('ctx-bring-to-front').disabled).toBe(false);
	view.press('ctx-bring-to-front');
	await view.done();
	expect(view.controller.state.document!.pages[0]!.shapes.map((shape) => shape.id)).toEqual([
		'2',
		'1',
	]);
	expect(view.button('ctx-bring-forward').disabled).toBe(true);
	expect(view.button('ctx-send-to-back').disabled).toBe(false);
	view.controller.selectAll();
	expect(view.button('ctx-send-to-back').disabled).toBe(true);
	view.dispose();
	view.controller.destroy();
});
