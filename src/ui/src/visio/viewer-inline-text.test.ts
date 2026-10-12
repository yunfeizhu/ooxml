import { afterEach, expect, it, vi } from 'vitest';
import { pointerViewer } from './__fixtures__/pointer-viewer';
import { ViewerInlineText } from './viewer-inline-text';

afterEach(() => {
	document.body.replaceChildren();
	vi.unstubAllGlobals();
});
async function setup(source = true) {
	const ui = await pointerViewer(false, source);
	const messages: string[] = [];
	const editor = new ViewerInlineText(ui.viewport, ui.controller, (message) =>
		messages.push(message),
	);
	const dispose = editor.wire();
	const unsubscribe = ui.controller.subscribe((state) => editor.render(state));
	const key = (init: KeyboardEventInit) =>
		editor.input.dispatchEvent(
			new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }),
		);
	const text = (id = '1') =>
		ui.controller.state.document!.pages[0]!.shapes.find((shape) => shape.id === id)!.text.plainText;
	return {
		ui,
		editor,
		messages,
		key,
		text,
		end() {
			unsubscribe();
			dispose();
			ui.dispose();
		},
	};
}

it('edits the selected shape in place and saves one undoable edit on Escape', async () => {
	const view = await setup();
	view.ui.select(['1']);
	expect(view.editor.start()).toBe(true);
	const input = view.editor.input;
	expect(input.isConnected && !input.hidden).toBe(true);
	expect(input.id).toBe('edit-text');
	expect(input.value).toBe('Movable');
	expect(document.activeElement).toBe(input);
	// The drawn text gives way to the editor, and the handles step aside.
	expect(view.ui.group('1').hasAttribute('data-editing-text')).toBe(true);
	expect(view.ui.viewport.dataset.textEditing).toBe('');
	input.value = 'Edited in place';
	view.key({ key: 'Enter' });
	expect(view.editor.editing).toBe(true);
	view.key({ key: 'Escape' });
	await view.ui.done();
	expect(view.editor.editing).toBe(false);
	expect(input.isConnected).toBe(false);
	expect(view.ui.viewport.dataset.textEditing).toBeUndefined();
	expect(view.ui.edits).toEqual([
		[{ type: 'replace-plain-text', pageId: '1', shapeId: '1', text: 'Edited in place' }],
	]);
	expect(view.text()).toBe('Edited in place');
	expect(document.activeElement).toBe(view.ui.viewport);
	await view.ui.controller.undo();
	expect(view.ui.controller.exportVsdx().bytes).toEqual(view.ui.bytes);
	view.end();
});

it('starts from a typed character, replacing the text, and saves on a click elsewhere', async () => {
	const view = await setup();
	view.ui.select(['1']);
	view.editor.start('N');
	expect(view.editor.input.value).toBe('N');
	view.editor.input.value = 'New';
	// A click inside the editor stays in it; one on the canvas saves.
	view.editor.input.dispatchEvent(new Event('pointerdown', { bubbles: true }));
	expect(view.editor.editing).toBe(true);
	view.ui.svg.dispatchEvent(new Event('pointerdown', { bubbles: true }));
	await view.ui.done();
	expect(view.editor.editing).toBe(false);
	expect(view.text()).toBe('New');
	view.end();
});

it('saves when the selection moves on and makes no edit for unchanged text', async () => {
	const view = await setup();
	view.ui.select(['1']);
	view.editor.start();
	view.key({ key: 'Escape' });
	await view.ui.done();
	expect(view.ui.edits).toEqual([]);
	view.editor.start();
	view.editor.input.value = 'Saved on reselect';
	view.ui.select(['2']);
	await view.ui.done();
	expect(view.editor.editing).toBe(false);
	expect(view.text('1')).toBe('Saved on reselect');
	view.end();
});

it('keeps the draft across another edit to the same drawing', async () => {
	const view = await setup();
	view.ui.select(['1']);
	view.editor.start();
	view.editor.input.value = 'Draft';
	await view.ui.controller.applyEdits([
		{ type: 'move-shape', pageId: '1', shapeId: '1', x: 4.5, y: 7 },
	]);
	expect(view.editor.editing).toBe(true);
	expect(view.editor.input.value).toBe('Draft');
	// A page redraw replaces the canvas content; the editor comes back with its draft and caret.
	view.editor.input.setSelectionRange(2, 2);
	view.ui.viewport.replaceChildren(view.ui.svg);
	view.editor.render(view.ui.controller.state);
	expect(view.editor.input.isConnected).toBe(true);
	expect(document.activeElement).toBe(view.editor.input);
	expect(view.editor.input.selectionStart).toBe(2);
	view.key({ key: 'Escape' });
	await view.ui.done();
	expect(view.text()).toBe('Draft');
	view.end();
});

it('needs one selected shape and an editable source', async () => {
	const view = await setup();
	expect(view.editor.start()).toBe(false);
	expect(view.messages).toEqual(['Select one shape to edit its text.']);
	view.ui.select(['1', '2']);
	expect(view.editor.start()).toBe(false);
	view.end();
	const preview = await setup(false);
	preview.ui.select(['1']);
	expect(preview.editor.start()).toBe(false);
	expect(preview.messages).toEqual(['This drawing cannot be edited.']);
	expect(preview.editor.input.isConnected).toBe(false);
	preview.end();
});
