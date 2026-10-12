import { afterEach, expect, it, vi } from 'vitest';
import { parseVsdx } from 'ooxml-core/visio';
import { pointerViewer } from './__fixtures__/pointer-viewer';

afterEach(() => {
	document.body.replaceChildren();
	vi.unstubAllGlobals();
});
it('previews one common translation, commits exactly one batch and retains selection through source history', async () => {
	const ui = await pointerViewer();
	ui.select(['2', '1']);
	const selection = ui.controller.state.selectedShapes;
	ui.pointer('pointerdown', ui.group('2'));
	ui.pointer('pointermove', ui.svg, 52.3, 34.7);
	expect(ui.svg.querySelectorAll('[data-movement-preview]')).toHaveLength(2);
	expect(ui.group().style.visibility).toBe('hidden');
	expect(ui.edits).toHaveLength(0);
	expect(ui.controller.exportVsdx().bytes).toEqual(ui.bytes);
	const original = ui.group().getAttribute('transform')!;
	expect(ui.svg.querySelector('[data-movement-preview]')!.getAttribute('transform')).not.toBe(
		original,
	);
	ui.pointer('pointerup', ui.svg, 52.3, 34.7);
	await ui.done();
	expect(ui.edits).toHaveLength(1);
	expect(ui.edits[0]).toEqual([
		{
			type: 'move-shape',
			pageId: '1',
			shapeId: '2',
			x: expect.closeTo(8.23, 12),
			y: expect.closeTo(7.53, 12),
		},
		{
			type: 'move-shape',
			pageId: '1',
			shapeId: '1',
			x: expect.closeTo(5.23, 12),
			y: expect.closeTo(7.53, 12),
		},
	]);
	expect(ui.controller.state.selectedShapes).toBe(selection);
	expect(ui.group().style.visibility).toBe('');
	expect(ui.svg.querySelector('[data-movement-preview]')).toBeNull();
	const saved = await parseVsdx(ui.controller.exportVsdx().bytes);
	expect(saved.pages[0]!.shapes[0]!.rotation!.pinX).toBeCloseTo(5.23);
	await ui.controller.undo();
	expect(ui.controller.exportVsdx().bytes).toEqual(ui.bytes);
	await ui.controller.redo();
	expect(ui.controller.state.selectedShapes).toBe(selection);
	expect(ui.feedback).toContain('Shapes moved.');
	ui.dispose();
});
it('keeps clicks and modifier toggles unchanged below threshold, and prevents the release click from collapsing a drag', async () => {
	const ui = await pointerViewer();
	ui.select();
	ui.pointer('pointerdown', ui.group('2'));
	ui.pointer('pointermove', ui.group('2'), 42, 40);
	ui.pointer('pointerup', ui.group('2'), 42, 40);
	ui.group('2').dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
	expect(ui.controller.state.selectedShapes.map((item) => item.id)).toEqual(['1', '2']);
	ui.pointer('pointerdown', ui.group('2'));
	ui.pointer('pointermove', ui.svg, 50, 40);
	ui.pointer('pointerup', ui.svg, 50, 40);
	ui.group('2').dispatchEvent(new MouseEvent('click', { bubbles: true }));
	await ui.done();
	expect(ui.controller.state.selectedShapes.map((item) => item.id)).toEqual(['1', '2']);
	ui.dispose();
});
it.each(['Escape', 'lostpointercapture', 'selection', 'source', 'tool'] as const)(
	'cancels %s without changing source and removes previews',
	async (kind) => {
		const ui = await pointerViewer();
		ui.select();
		ui.pointer('pointerdown', ui.group());
		ui.pointer('pointermove', ui.svg, 50, 40);
		if (kind === 'Escape')
			ui.viewport.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
			);
		else if (kind === 'selection') ui.controller.selectShape(null);
		else if (kind === 'source') ui.controller.setDocument(null);
		else if (kind === 'tool') ui.inactive();
		else ui.pointer(kind, ui.svg);
		ui.pointer('pointerup', ui.svg, 50, 40);
		await Promise.resolve();
		expect(ui.svg.querySelector('[data-movement-preview]')).toBeNull();
		expect(ui.group().style.visibility).toBe('');
		expect(ui.edits).toHaveLength(0);
		if (kind !== 'source') expect(ui.controller.exportVsdx().bytes).toEqual(ui.bytes);
		ui.dispose();
	},
);
it('refuses protected multi-target source movement atomically and reports the source error', async () => {
	const ui = await pointerViewer(true);
	ui.select(['1', '2']);
	ui.pointer('pointerdown', ui.group());
	ui.pointer('pointermove', ui.svg, 50, 40);
	ui.pointer('pointerup', ui.svg, 50, 40);
	await ui.done();
	expect(ui.edits).toHaveLength(1);
	expect(ui.controller.exportVsdx().bytes).toEqual(ui.bytes);
	expect(ui.controller.state.edit.canUndo).toBe(false);
	expect(ui.feedback.join(' ')).toMatch(/LockMoveX|locked/i);
	ui.dispose();
});
it('marquee selects enclosed shapes in page order, supports additive selection and never edits model-only documents', async () => {
	const ui = await pointerViewer(false, false);
	ui.pointer('pointerdown', ui.svg, 20, 30);
	ui.pointer('pointermove', ui.svg, 57, 46);
	ui.pointer('pointerup', ui.svg, 57, 46);
	expect(ui.controller.state.selectedShapes.map((item) => item.id)).toEqual(['1']);
	ui.pointer('pointerdown', ui.svg, 54, 30, { shiftKey: true });
	ui.pointer('pointermove', ui.svg, 87, 46);
	ui.pointer('pointerup', ui.svg, 87, 46);
	expect(ui.controller.state.selectedShapes.map((item) => item.id)).toEqual(['1', '2']);
	expect(ui.svg.querySelector('[data-marquee-preview]')).toBeNull();
	expect(ui.edits).toHaveLength(0);
	ui.dispose();
});
it('a selection callback superseding an unselected drag prevents a preview or source edit', async () => {
	const ui = await pointerViewer();
	let changed = false;
	const unsubscribe = ui.controller.subscribe((state) => {
		if (!changed && state.selectedShape?.id === '1') {
			changed = true;
			ui.select(['2']);
		}
	});
	ui.pointer('pointerdown', ui.group());
	ui.pointer('pointermove', ui.svg, 50, 40);
	ui.pointer('pointerup', ui.svg, 50, 40);
	expect(ui.controller.state.selectedShape?.id).toBe('2');
	expect(ui.svg.querySelector('[data-movement-preview]')).toBeNull();
	expect(ui.edits).toHaveLength(0);
	unsubscribe();
	ui.dispose();
});

it('clears pending outside releases and owns disposal without swallowing future clicks', async () => {
	const ui = await pointerViewer();
	ui.pointer('pointerdown', ui.group());
	ui.pointer('pointerup', document.body);
	ui.pointer('pointerdown', ui.group());
	ui.pointer('pointermove', ui.svg, 50, 40);
	expect(ui.svg.querySelector('[data-movement-preview]')).not.toBeNull();
	ui.dispose();
	expect(ui.svg.querySelector('[data-movement-preview]')).toBeNull();
	expect(ui.group().style.visibility).toBe('');
	expect(ui.edits).toHaveLength(0);
});

it('hides stale resize and rotation overlays during movement, restoring them on cancellation', async () => {
	const ui = await pointerViewer();
	ui.select();
	const resize = document.createElementNS('http://www.w3.org/2000/svg', 'g');
	resize.dataset.resizeOverlay = '';
	ui.svg.append(resize);
	const rotation = document.createElement('div');
	rotation.className = 'rotation-overlay';
	rotation.style.visibility = 'visible';
	ui.viewport.append(rotation);
	ui.pointer('pointerdown', ui.group());
	ui.pointer('pointermove', ui.svg, 50, 40);
	expect(resize.style.visibility).toBe('hidden');
	expect(rotation.style.visibility).toBe('hidden');
	ui.viewport.dispatchEvent(
		new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
	);
	expect(resize.style.visibility).toBe('');
	expect(rotation.style.visibility).toBe('visible');
	ui.dispose();
});

it('refuses a background shape with the same foreground ID and cancels page changes', async () => {
	const ui = await pointerViewer();
	ui.group().dataset.pageId = 'background';
	ui.pointer('pointerdown', ui.group());
	ui.pointer('pointermove', ui.svg, 50, 40);
	ui.pointer('pointerup', ui.svg, 50, 40);
	expect(ui.edits).toHaveLength(0);
	ui.group().dataset.pageId = '1';
	await ui.controller.applyEdits([
		{ type: 'insert-page', pageId: '2', name: 'Other', afterPageId: '1' },
	]);
	ui.select();
	ui.pointer('pointerdown', ui.group());
	ui.pointer('pointermove', ui.svg, 50, 40);
	expect(ui.svg.querySelector('[data-movement-preview]')).not.toBeNull();
	ui.controller.setPage(1);
	ui.pointer('pointerup', ui.svg, 50, 40);
	expect(ui.svg.querySelector('[data-movement-preview]')).toBeNull();
	expect(ui.edits).toHaveLength(1);
	ui.dispose();
});
it('keeps the moved preview until the source edit settles instead of snapping back', async () => {
	const ui = await pointerViewer();
	ui.select(['2']);
	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const apply = ui.controller.applySelectionEdits.bind(ui.controller);
	vi.spyOn(ui.controller, 'applySelectionEdits').mockImplementation(async (edits) => {
		await gate;
		return apply(edits);
	});
	ui.pointer('pointerdown', ui.group('2'));
	ui.pointer('pointermove', ui.svg, 52.3, 34.7);
	const moved = ui.svg.querySelector('[data-movement-preview]')!.getAttribute('transform');
	ui.pointer('pointerup', ui.svg, 52.3, 34.7);
	// While the edit runs, the shape stays where it was dropped, not at its old position.
	await Promise.resolve();
	const preview = ui.svg.querySelector('[data-movement-preview]');
	expect(preview?.getAttribute('transform')).toBe(moved);
	expect(ui.group('2').style.visibility).toBe('hidden');
	release();
	await ui.done();
	expect(ui.edits).toHaveLength(1);
	await vi.waitFor(() => expect(ui.svg.querySelector('[data-movement-preview]')).toBeNull());
	expect(ui.group('2').style.visibility).toBe('');
});
