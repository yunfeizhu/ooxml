// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { setupFormattingViewer } from './__fixtures__/formatting-viewer';
import { VISIO_GUIDE_URL } from './viewer-layout-commands';
import { rasterSize } from './viewer-export';

afterEach(() => {
	document.body.replaceChildren();
	vi.restoreAllMocks();
});
type View = Awaited<ReturnType<typeof setupFormattingViewer>>;
async function setup(): Promise<View> {
	const view = await setupFormattingViewer();
	await view.controller.applyEdits([
		{ type: 'create-rectangle', pageId: '1', shapeId: '2', x: 6, y: 2, width: 1, height: 0.5 },
		{ type: 'create-rectangle', pageId: '1', shapeId: '3', x: 2, y: 7, width: 1, height: 0.5 },
	]);
	await view.controller.applyEdits([
		{
			type: 'create-line',
			pageId: '1',
			shapeId: '4',
			beginX: 0,
			beginY: 0,
			endX: 1,
			endY: 1,
			connect: { begin: '2', end: '3' },
		},
	]);
	view.commands.render(view.controller.state);
	return view;
}
const page = (view: View) => view.controller.state.document!.pages[0]!;
const pin = (view: View, id: string) =>
	page(view).shapes.find((shape) => shape.id === id)!.rotation!;
const dialogButton = (view: View, command: string) =>
	view.root
		.querySelector(`office-ui-button[command="${command}"]`)!
		.dispatchEvent(new CustomEvent('office-command'));
const select = (view: View, ids: string[]) =>
	view.controller.selectShapes(ids.map((id) => ({ id, name: '', pageId: '1' })));

it('re-lays out the page as one undoable edit and its glued connector follows', async () => {
	const view = await setup();
	const gallery = view.root.querySelector<HTMLElement>('office-ui-gallery[command="re-layout"]')!;
	expect(gallery.hasAttribute('disabled')).toBe(false);
	const before = [pin(view, '2'), pin(view, '3')];
	view.commands.run({ type: 're-layout', style: 'flowchart-tb' });
	await view.done();
	const edits = view.edits.at(-1)!;
	expect(edits.every((edit) => edit.type === 'move-shape')).toBe(true);
	expect(pin(view, '2').pinX).toBeCloseTo(pin(view, '3').pinX, 9);
	expect(pin(view, '2').pinY).toBeGreaterThan(pin(view, '3').pinY);
	expect(view.feedback.at(-1)).toMatch(/Laid out 3 shapes as Flowchart, Top to Bottom/);
	const connector = page(view).shapes.find((shape) => shape.id === '4')!;
	expect(connector.transform[4]).toBeCloseTo(pin(view, '2').pinX, 9);
	await view.controller.undo();
	expect(pin(view, '2')).toMatchObject({ pinX: before[0]!.pinX, pinY: before[0]!.pinY });
	expect(pin(view, '3')).toMatchObject({ pinX: before[1]!.pinX, pinY: before[1]!.pinY });
	view.dispose();
	view.controller.destroy();
});

it('applies the Layout dialog to the selection with a chosen spacing', async () => {
	const view = await setup();
	select(view, ['2', '3']);
	view.commands.run({ type: 'layout-options' });
	const dialog = view.root.querySelector<HTMLElement & { open: boolean }>('.layout-dialog')!;
	expect(dialog.open).toBe(true);
	dialog.querySelector<HTMLSelectElement>('select[name="style"]')!.value = 'flowchart-lr';
	dialog.querySelector<HTMLInputElement>('input[name="spacing"]')!.value = '1';
	expect(dialog.querySelector<HTMLInputElement>('[value="selection"]')!.checked).toBe(true);
	dialogButton(view, 'layout-dialog-apply');
	await view.done();
	expect(
		view.edits
			.at(-1)!
			.map((edit) => (edit as { shapeId: string }).shapeId)
			.sort(),
	).toEqual(['2', '3']);
	// Layers are 1.5 times the spacing apart: a 1 in wide shape plus 1.5 in.
	expect(pin(view, '3').pinX - pin(view, '2').pinX).toBeCloseTo(2.5, 9);
	expect(pin(view, '2').pinY).toBeCloseTo(pin(view, '3').pinY, 9);
	view.dispose();
	view.controller.destroy();
});

it('auto aligns and spaces the selection from the Position menu', async () => {
	const view = await setup();
	await view.controller.applyEdits([
		{ type: 'move-shape', pageId: '1', shapeId: '3', x: 3, y: 2.1 },
	]);
	select(view, ['2', '3']);
	expect(view.button('auto-align').disabled).toBe(false);
	view.commands.run({ type: 'auto-align' });
	await view.done();
	expect(pin(view, '2').pinY).toBeCloseTo(pin(view, '3').pinY, 9);
	expect(view.feedback.at(-1)).toMatch(/Aligned and spaced 2 shapes/);
	view.dispose();
	view.controller.destroy();
});

it('assigns selected shapes to existing and new layers in one edit', async () => {
	const view = await setup();
	select(view, ['2', '3']);
	expect(view.button('assign-layer').disabled).toBe(false);
	view.commands.run({ type: 'assign-layers' });
	const dialog = view.root.querySelector<HTMLElement & { open: boolean }>('.layer-assign-dialog')!;
	expect(dialog.open).toBe(true);
	expect(dialog.textContent).toContain('This page has no layers yet.');
	dialog.querySelector<HTMLInputElement>('input[name="new-layer"]')!.value = 'Flow, Notes';
	dialogButton(view, 'layer-assign-dialog-ok');
	await view.done();
	await vi.waitFor(() => expect(dialog.open).toBe(false));
	expect(view.edits.at(-1)).toEqual([
		{
			type: 'assign-layers',
			pageId: '1',
			shapeIds: ['2', '3'],
			layerIds: [],
			newLayers: ['Flow', 'Notes'],
		},
	]);
	expect(page(view).layers!.map((layer) => layer.name)).toEqual(['Flow', 'Notes']);
	expect(page(view).shapes.find((shape) => shape.id === '2')!.layerIds).toEqual(['0', '1']);
	// Layered shapes stay movable; mixed membership is kept per shape.
	select(view, ['2', '1']);
	view.commands.run({ type: 'assign-layers' });
	const boxes = [...dialog.querySelectorAll<HTMLInputElement>('input[name="layer"]')];
	expect(boxes.map((box) => box.indeterminate)).toEqual([true, true]);
	dialog.querySelector<HTMLInputElement>('input[name="new-layer"]')!.value = 'flow';
	dialogButton(view, 'layer-assign-dialog-ok');
	expect(dialog.textContent).toContain('already exists');
	await view.controller.undo();
	expect(page(view).layers ?? []).toEqual([]);
	view.dispose();
	view.controller.destroy();
});

it('selects shapes by type and by layer', async () => {
	const view = await setup();
	view.commands.run({ type: 'select-by-type' });
	const dialog = view.root.querySelector<HTMLElement & { open: boolean }>('.select-type-dialog')!;
	expect(dialog.open).toBe(true);
	dialogButton(view, 'select-type-dialog-ok');
	expect(view.controller.state.selectedShapes.map((shape) => shape.id)).toEqual(['1', '2', '3']);
	view.commands.run({ type: 'select-by-type' });
	for (const box of dialog.querySelectorAll<HTMLInputElement>('input[name="type"]'))
		box.checked = box.value === 'connector';
	dialogButton(view, 'select-type-dialog-ok');
	expect(view.controller.state.selectedShapes.map((shape) => shape.id)).toEqual(['4']);
	view.commands.run({ type: 'select-by-type' });
	dialog.querySelector<HTMLInputElement>('input[name="select-by"][value="layer"]')!.click();
	dialog.querySelector<HTMLInputElement>('input[name="layer"][value=""]')!.checked = true;
	dialogButton(view, 'select-type-dialog-ok');
	expect(view.controller.state.selectedShapes).toHaveLength(4);
	view.dispose();
	view.controller.destroy();
});

it('pastes clipboard text as a text box from Paste Special', async () => {
	const view = await setup();
	const readText = vi.fn(async () => 'Pasted words');
	Object.defineProperty(navigator, 'clipboard', {
		configurable: true,
		value: { readText },
	});
	view.commands.render(view.controller.state);
	expect(view.button('paste-special').disabled).toBe(false);
	view.commands.run({ type: 'paste-special' });
	const dialog = view.root.querySelector<HTMLElement & { open: boolean }>('.paste-special-dialog')!;
	expect(dialog.querySelector<HTMLInputElement>('[value="picture"]')!.disabled).toBe(true);
	dialog.querySelector<HTMLInputElement>('[value="text"]')!.checked = true;
	dialogButton(view, 'paste-special-dialog-ok');
	await vi.waitFor(() => expect(dialog.open).toBe(false));
	await view.done();
	expect(readText).toHaveBeenCalled();
	const created = page(view).shapes.at(-1)!;
	expect(created.text.plainText).toBe('Pasted words');
	Reflect.deleteProperty(navigator, 'clipboard');
	view.dispose();
	view.controller.destroy();
});

it('toggles guides and Dynamic Grid, and snaps a move to another shape', async () => {
	const view = await setup();
	const guides = view.commands.layoutCommands.guides;
	const box = view.root.querySelector<HTMLElement & { checked: boolean }>(
		'[data-check="dynamic-grid"]',
	)!;
	// Dynamic Grid starts on, as in Visio. Shape 3's centre x is 2 and shape 2's is 6: a 3.98 move
	// snaps to 4.
	expect(box.checked).toBe(true);
	expect(guides.snap(page(view), ['3'], { x: 3.98, y: 0 }).x).toBeCloseTo(4, 9);
	view.commands.run({ type: 'dynamic-grid' });
	expect(box.checked).toBe(false);
	expect(guides.snap(page(view), ['3'], { x: 3.98, y: 0 })).toEqual({ x: 3.98, y: 0 });
	// With the grid shown, a move lands the nearer edge on a quarter-inch line.
	expect(guides.snap(page(view), ['3'], { x: 0.95, y: 0 }, 0.25).x).toBeCloseTo(1, 9);
	view.commands.run({ type: 'dynamic-grid' });
	expect(box.checked).toBe(true);
	await view.controller.applyEdits([
		{ type: 'create-guide', pageId: '1', shapeId: '9', orientation: 'vertical', position: 1 },
	]);
	view.commands.run({ type: 'guides' });
	expect(
		view.root.querySelector<HTMLElement & { checked: boolean }>('[data-check="guides"]')!.checked,
	).toBe(true);
	view.commands.run({ type: 'dynamic-grid' });
	// Shape 3's left edge is 1.5: a -0.49 move snaps it onto the guide at 1.
	expect(guides.snap(page(view), ['3'], { x: -0.49, y: 0 }).x).toBeCloseTo(-0.5, 9);
	view.dispose();
	view.controller.destroy();
});

it('opens the Drawing Explorer and selects from it', async () => {
	const view = await setup();
	view.commands.run({ type: 'drawing-explorer' });
	const dialog = view.root.querySelector<HTMLElement & { open: boolean }>('.explorer-dialog')!;
	expect(dialog.open).toBe(true);
	const shape = [
		...dialog.querySelectorAll<HTMLButtonElement>('button[data-explore="shape"]'),
	].find((button) => button.dataset.value === '3')!;
	shape.click();
	expect(view.controller.state.selectedShapes.map((item) => item.id)).toEqual(['3']);
	expect(dialog.querySelector('button[data-explore="page"]')!.getAttribute('aria-current')).toBe(
		'true',
	);
	view.dispose();
	view.controller.destroy();
});

it('opens the viewer guide for Help and Show Training without an opener', async () => {
	const view = await setup();
	const open = vi.spyOn(window, 'open').mockReturnValue(null);
	view.commands.run({ type: 'help', topic: 'help' });
	view.commands.run({ type: 'help', topic: 'training' });
	expect(open).toHaveBeenCalledWith(VISIO_GUIDE_URL, '_blank', 'noopener,noreferrer');
	expect(open).toHaveBeenCalledTimes(2);
	expect(view.feedback.at(-1)).toMatch(/no training videos/);
	view.dispose();
	view.controller.destroy();
});

it('sizes export rasters at 150 dpi within the canvas cap', () => {
	expect(rasterSize(8.5, 11)).toEqual({ width: 1275, height: 1650 });
	expect(rasterSize(100, 10)).toEqual({ width: 4096, height: 410 });
});
