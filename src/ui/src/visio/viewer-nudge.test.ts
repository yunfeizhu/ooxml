import { afterEach, expect, it, vi } from 'vitest';
import { pointerViewer } from './__fixtures__/pointer-viewer';
import { NUDGE_STEP } from './viewer-input';

afterEach(() => {
	document.body.replaceChildren();
	vi.unstubAllGlobals();
});
const key = (target: EventTarget, init: KeyboardEventInit) => {
	const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
	target.dispatchEvent(event);
	return event;
};

it('nudges the selection with the arrow keys as one undoable batch', async () => {
	const ui = await pointerViewer();
	ui.select(['2', '1']);
	const selection = ui.controller.state.selectedShapes;
	expect(key(ui.viewport, { key: 'ArrowUp' }).defaultPrevented).toBe(true);
	await ui.done();
	expect(ui.edits).toEqual([
		[
			{ type: 'move-shape', pageId: '1', shapeId: '2', x: 7, y: expect.closeTo(7 + NUDGE_STEP) },
			{ type: 'move-shape', pageId: '1', shapeId: '1', x: 4, y: expect.closeTo(7 + NUDGE_STEP) },
		],
	]);
	expect(ui.controller.state.selectedShapes).toBe(selection);
	await ui.controller.undo();
	expect(ui.controller.exportVsdx().bytes).toEqual(ui.bytes);
	ui.dispose();
});

it('nudges one screen pixel with Shift', async () => {
	const ui = await pointerViewer();
	ui.select(['1']);
	const zoom = ui.controller.state.zoom;
	key(ui.viewport, { key: 'ArrowRight', shiftKey: true });
	await ui.done();
	expect(ui.edits[0]).toEqual([
		{ type: 'move-shape', pageId: '1', shapeId: '1', x: expect.closeTo(4 + 1 / (96 * zoom)), y: 7 },
	]);
	ui.dispose();
});

it('leaves arrows to focus navigation without a selection or source, and to text fields', async () => {
	const ui = await pointerViewer();
	ui.group('1').focus();
	key(ui.group('1'), { key: 'ArrowRight' });
	expect(ui.edits).toEqual([]);
	expect(document.activeElement).toBe(ui.group('2'));
	ui.select(['1']);
	const field = document.createElement('textarea');
	ui.viewport.append(field);
	expect(key(field, { key: 'ArrowLeft' }).defaultPrevented).toBe(false);
	expect(key(ui.viewport, { key: 'ArrowLeft', ctrlKey: true }).defaultPrevented).toBe(false);
	expect(ui.edits).toEqual([]);
	ui.dispose();
	const preview = await pointerViewer(false, false);
	preview.select(['1']);
	key(preview.viewport, { key: 'ArrowLeft' });
	expect(preview.edits).toEqual([]);
	preview.dispose();
});

it('reports a refused nudge and keeps the source unchanged', async () => {
	const ui = await pointerViewer(true);
	// The second shape is LockMoveX: a horizontal nudge is refused by source admission.
	ui.select(['2']);
	key(ui.viewport, { key: 'ArrowRight' });
	await ui.done();
	expect(ui.controller.exportVsdx().bytes).toEqual(ui.bytes);
	expect(ui.feedback.length).toBeGreaterThan(0);
	ui.dispose();
});
