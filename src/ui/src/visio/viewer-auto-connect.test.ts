import { afterEach, expect, it, vi } from 'vitest';
import { pointerViewer } from './__fixtures__/pointer-viewer';
import { SHAPES_STORAGE_KEY } from './shapes-sections';
import { ViewerAutoConnect } from './viewer-auto-connect';

afterEach(() => {
	document.body.replaceChildren();
	localStorage.clear();
	vi.unstubAllGlobals();
});

async function autoConnectViewer() {
	const ui = await pointerViewer();
	let pointer = true;
	const announce = vi.fn();
	const auto = new ViewerAutoConnect({
		root: document,
		viewport: ui.viewport,
		controller: ui.controller,
		announce,
		edit: (run, message) => void run().then(() => announce(message), announce),
		pointerTool: () => pointer,
	});
	const dispose = auto.wire();
	const stop = ui.controller.subscribe((state) => auto.render(state));
	const arrow = (direction: string) =>
		ui.viewport.querySelector<HTMLButtonElement>(`[data-auto-connect="${direction}"]`);
	return {
		...ui,
		auto,
		announce,
		arrow,
		arrows: () =>
			[...ui.viewport.querySelectorAll<HTMLElement>('[data-auto-connect]')].map(
				(item) => item.dataset.autoConnect,
			),
		masters: () =>
			[...ui.viewport.querySelectorAll<HTMLElement>('[data-auto-connect-master]')].map(
				(item) => item.dataset.autoConnectMaster,
			),
		tool(value: boolean) {
			pointer = value;
			auto.render(ui.controller.state);
		},
		close() {
			stop();
			dispose();
			ui.dispose();
		},
	};
}

it('shows four arrows on a hovered shape and Quick Shapes on a hovered arrow', async () => {
	const ui = await autoConnectViewer();
	try {
		expect(ui.arrows()).toEqual([]);
		ui.pointer('pointermove', ui.group('1'), 40, 40);
		expect(ui.auto.source).toBe('1');
		expect(ui.arrows()).toEqual(['up', 'right', 'down', 'left']);
		expect(ui.masters()).toEqual([]);
		// Arrows are a pointer aid only: they stay out of the tab order.
		expect(ui.arrow('up')!.tabIndex).toBe(-1);
		const kept = ui.arrow('up')!;
		ui.pointer('pointermove', ui.group('1'), 42, 40);
		expect(ui.arrow('up')).toBe(kept);
		ui.pointer('pointermove', ui.arrow('up')!, 40, 10);
		expect(ui.masters()).toEqual(['rectangle', 'square', 'ellipse', 'circle']);
		const bar = ui.viewport.querySelector<HTMLElement>('.auto-connect-bar')!;
		expect(bar.getAttribute('role')).toBe('toolbar');
		expect(bar.dataset.side).toBe('up');
		// Still open while the pointer is on the bar; gone when it returns to the shape.
		ui.pointer('pointermove', bar.querySelector('button')!, 40, 4);
		expect(ui.masters()).toHaveLength(4);
		ui.pointer('pointermove', ui.group('1'), 40, 40);
		expect(ui.masters()).toEqual([]);
		expect(ui.arrows()).toHaveLength(4);
	} finally {
		ui.close();
	}
});

it('adds a Quick Shape with a glued connector as one undoable step', async () => {
	const ui = await autoConnectViewer();
	try {
		const before = ui.controller.state.document!.pages[0]!;
		ui.pointer('pointermove', ui.group('1'), 40, 40);
		ui.pointer('pointermove', ui.arrow('up')!, 40, 10);
		const press = ui.pointer(
			'pointerdown',
			ui.viewport.querySelector('[data-auto-connect-master="square"]')!,
		);
		// The press never reaches the canvas gestures and does not take focus.
		expect(press.defaultPrevented).toBe(true);
		ui.viewport.querySelector<HTMLElement>('[data-auto-connect-master="square"]')!.click();
		await ui.done();
		expect(ui.edits).toHaveLength(1);
		// The added shape is an instance of the stencil master, as a shape dragged from the stencil.
		expect(ui.edits[0]!.map((edit) => edit.type)).toEqual([
			'drop-stencil-master',
			'create-line',
			'format-shape',
		]);
		const box = ui.edits[0]![0] as { shapeId: string; master: string };
		expect(box).toMatchObject({ master: 'square' });
		expect(ui.edits[0]![1]).toMatchObject({
			connect: { begin: '1', end: box.shapeId },
			route: 'right-angle',
		});
		const page = ui.controller.state.document!.pages[0]!;
		expect(page.shapes).toHaveLength(before.shapes.length + 2);
		expect(page.connectors.map((connection) => connection.toShapeId).sort()).toEqual(
			['1', box.shapeId].sort(),
		);
		await vi.waitFor(() =>
			expect(ui.announce).toHaveBeenCalledWith(
				`Square ${box.shapeId} added and connected to shape 1.`,
			),
		);
		await ui.controller.undo();
		const undone = ui.controller.state.document!.pages[0]!;
		expect(undone.shapes).toHaveLength(before.shapes.length);
		expect(undone.connectors).toEqual([]);
	} finally {
		ui.close();
	}
});

it('connects to the neighbour an arrow points at, else adds the first Quick Shape', async () => {
	const ui = await autoConnectViewer();
	try {
		ui.pointer('pointermove', ui.group('1'), 40, 40);
		expect(ui.arrow('right')!.getAttribute('aria-label')).toBe('Connect to the shape on the right');
		expect(ui.arrow('up')!.getAttribute('aria-label')).toBe('Add a connected shape above');
		ui.arrow('right')!.click();
		await ui.done();
		expect(ui.edits[0]!.map((edit) => edit.type)).toEqual(['create-line']);
		expect(ui.edits[0]![0]).toMatchObject({ connect: { begin: '1', end: '2' } });
		await vi.waitFor(() => expect(ui.controller.state.document!.pages[0]!.shapes).toHaveLength(3));
		await ui.done();
		// The current stencil's Quick Shapes follow the Shapes window's saved choice.
		localStorage.setItem(SHAPES_STORAGE_KEY, JSON.stringify({ quick: { basic: ['diamond'] } }));
		ui.auto.connect('down');
		await vi.waitFor(() => expect(ui.edits).toHaveLength(2));
		await ui.done();
		expect(ui.edits[1]![0]).toMatchObject({ type: 'drop-stencil-master', master: 'diamond' });
	} finally {
		ui.close();
	}
});

it('hides for touch, a pressed button, other tools, text editing and when turned off', async () => {
	const ui = await autoConnectViewer();
	try {
		ui.pointer('pointermove', ui.group('1'), 40, 40, { pointerType: 'touch' });
		expect(ui.arrows()).toEqual([]);
		ui.pointer('pointermove', ui.group('1'), 40, 40);
		expect(ui.arrows()).toHaveLength(4);
		ui.pointer('pointerdown', ui.group('1'), 40, 40);
		expect(ui.arrows()).toEqual([]);
		ui.pointer('pointermove', ui.group('1'), 45, 40, { buttons: 1 });
		expect(ui.arrows()).toEqual([]);
		ui.pointer('pointerup', ui.group('1'), 45, 40);
		await ui.done();
		ui.pointer('pointermove', ui.group('2'), 70, 40);
		expect(ui.auto.source).toBe('2');
		ui.tool(false);
		expect(ui.arrows()).toEqual([]);
		ui.tool(true);
		expect(ui.arrows()).toHaveLength(4);
		ui.viewport.dataset.textEditing = '';
		ui.auto.render(ui.controller.state);
		expect(ui.arrows()).toEqual([]);
		delete ui.viewport.dataset.textEditing;
		ui.auto.toggle();
		expect(ui.auto.enabled).toBe(false);
		expect(ui.arrows()).toEqual([]);
		expect(ui.announce).toHaveBeenCalledWith('AutoConnect off.');
		ui.auto.toggle();
		expect(ui.arrows()).toHaveLength(4);
		// Leaving the drawing takes the arrows away.
		ui.pointer('pointerleave', ui.viewport);
		expect(ui.arrows()).toEqual([]);
	} finally {
		ui.close();
	}
});
