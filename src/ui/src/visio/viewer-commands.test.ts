// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { VisioEdit } from 'ooxml-core/visio';
import { ViewerController } from './controller';
import { demoDocument } from 'ooxml-core/visio/ui';
import { registerViewerControls } from './office-ui';
import { ViewerCommands } from './viewer-commands';
import { nextShapeId } from './viewer-draw-tool';
import { createRibbon } from './ribbon';
import { createRulers } from './viewer-ruler';
import type { CancellableEditor } from './worker-editor';

afterEach(() => document.body.replaceChildren());

it('refuses rotation and flip of a background selection sharing a foreground ID', async () => {
	const model = structuredClone(demoDocument);
	const front = model.pages[0]!,
		background = model.pages[1]!;
	front.backgroundPageId = background.id;
	background.isBackground = true;
	background.shapes = [structuredClone(front.shapes[0]!)];
	const ui = await setup(true, false, model);
	ui.controller.selectShape({
		id: background.shapes[0]!.id,
		name: 'Background',
		pageId: background.id,
	});
	for (const name of ['rotate-left', 'rotate-right', 'flip-horizontal', 'flip-vertical'])
		expect(ui.command(name).disabled).toBe(true);
	ui.commands.run({ type: 'rotate', direction: 'left' });
	ui.commands.run({ type: 'flip', axis: 'horizontal' });
	await ui.settle();
	expect(ui.edits).toHaveLength(0);
	expect(ui.controller.state.document!.pages[0]!.shapes[0]).toEqual(front.shapes[0]);
	ui.dispose();
	ui.controller.destroy();
});

async function setup(source = true, noOp = false, model = demoDocument) {
	registerViewerControls();
	const edits: VisioEdit[][] = [];
	const editor: CancellableEditor = async (_bytes, commands) => {
		edits.push([...commands]);
		return {
			bytes: new Uint8Array([edits.length + 1]),
			document: structuredClone(model),
			changedParts: noOp ? [] : ['visio/pages/page1.xml'],
			diagnostics: [],
		};
	};
	const controller = new ViewerController(
		async () => structuredClone(model),
		() => {},
		editor,
	);
	if (source) await controller.load(new Uint8Array([1]));
	else controller.setDocument(structuredClone(model));
	const host = document.createElement('div');
	document.body.append(host);
	const root = host.attachShadow({ mode: 'open' });
	const viewport = document.createElement('div');
	viewport.className = 'viewport';
	viewport.tabIndex = 0;
	viewport.append(document.createElement('textarea'));
	root.append(createRibbon(document), viewport);
	const rulers = createRulers(viewport);
	const calls: string[] = [];
	const commands = new ViewerCommands({
		root,
		viewport,
		rulers,
		controller,
		fit: (mode) => calls.push(`fit:${mode}`),
		togglePane: (pane) => calls.push(`pane:${pane}`),
		reveal: (panel, focusText) => calls.push(`reveal:${panel}:${focusText}`),
		focusSearch: () => calls.push('search'),
		togglePanZoom: () => calls.push('pan-zoom'),
		present: () => calls.push('present'),
		presenting: () => false,
		toggleSizePosition: () => calls.push('size-position'),
		announce: (message) => calls.push(message),
	});
	const dispose = commands.wire();
	controller.subscribe((state) => commands.render(state));
	/** Any ribbon command, split menu or menu item by stable id. */
	const command = (name: string) =>
		root.querySelector<HTMLElement & { disabled: boolean }>(`[command="${name}"]`)!;
	const press = (name: string) =>
		command(name).shadowRoot!.querySelector<HTMLButtonElement>('.main, button')!.click();
	const check = (name: string) =>
		root.querySelector<HTMLElement & { checked: boolean }>(`[data-check="${name}"]`)!;
	const key = (init: KeyboardEventInit, target: Element = viewport) =>
		target.dispatchEvent(
			new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }),
		);
	const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
	return {
		controller,
		root,
		viewport,
		commands,
		calls,
		edits,
		command,
		press,
		check,
		key,
		settle,
		dispose,
	};
}

describe('Visio ribbon commands', () => {
	it('routes Home Text, Insert Text Box and Ctrl+2 through one tool and enables the existing page command', async () => {
		const ui = await setup();
		ui.press('text-tool');
		expect(ui.commands.tool).toBe('text');
		expect(ui.command('text-tool').getAttribute('pressed')).toBe('true');
		ui.key({ key: '1', ctrlKey: true });
		ui.press('text-box');
		expect(ui.commands.tool).toBe('text');
		ui.key({ key: '1', ctrlKey: true });
		ui.key({ key: '2', ctrlKey: true });
		expect(ui.commands.tool).toBe('text');
		ui.key({ key: '1', ctrlKey: true });
		ui.key({ key: '2', ctrlKey: true }, ui.viewport.querySelector('textarea')!);
		expect(ui.commands.tool).toBe('pointer');
		ui.press('blank-page');
		await ui.settle();
		expect(ui.edits[0]?.[0]?.type).toBe('insert-page');
		ui.dispose();
		ui.controller.destroy();
		const readOnly = await setup(false);
		for (const name of ['text-tool', 'text-box', 'blank-page'])
			expect(readOnly.command(name).disabled).toBe(true);
		readOnly.key({ key: '2', ctrlKey: true });
		expect(readOnly.commands.tool).toBe('pointer');
		readOnly.dispose();
		readOnly.controller.destroy();
	});
	it('routes F5 and the View tab Presentation Mode command to the presentation', async () => {
		const ui = await setup();
		ui.key({ key: 'F5' });
		ui.press('presentation');
		expect(ui.calls.filter((call) => call === 'present')).toHaveLength(2);
		ui.dispose();
		ui.controller.destroy();
	});
	it('announces unchanged commands without claiming a successful mutation', async () => {
		const { controller, key, settle, calls } = await setup(true, true);
		controller.selectShape({ id: 's1', name: 'Start', pageId: '1' });
		const generation = controller.documentGeneration;
		key({ key: 'Delete' });
		await settle();
		expect(calls).toEqual(['No changes were made.']);
		expect(controller.documentGeneration).toBe(generation);
		expect(controller.state.edit).toMatchObject({ dirty: false, canUndo: false, canRedo: false });
	});
	it('shares line ribbon and Ctrl+6 tool state, while read-only sources refuse drawing', async () => {
		const { press, key, commands, command } = await setup();
		press('line-tool');
		expect(commands.tool).toBe('line');
		expect(command('line-tool').getAttribute('checked')).toBe('true');
		key({ key: '1', ctrlKey: true });
		expect(commands.tool).toBe('pointer');
		key({ key: '6', ctrlKey: true });
		expect(commands.tool).toBe('line');
		const readOnly = await setup(false);
		readOnly.key({ key: '6', ctrlKey: true });
		expect(readOnly.commands.tool).toBe('pointer');
		expect(readOnly.command('line-tool').disabled).toBe(true);
	});
	it('shares Freeform, Arc and Pencil ribbon and Ctrl+5/7/4 tool state', async () => {
		const { press, key, commands, command } = await setup();
		for (const [name, digit] of [
			['freeform', '5'],
			['arc', '7'],
			['pencil', '4'],
		] as const) {
			expect(command(name).disabled).toBe(false);
			expect(command(name).hasAttribute('data-unsupported')).toBe(false);
			press(name);
			expect(commands.tool).toBe(name);
			expect(command(name).getAttribute('checked')).toBe('true');
			key({ key: '1', ctrlKey: true });
			expect(commands.tool).toBe('pointer');
			key({ key: digit, ctrlKey: true });
			expect(commands.tool).toBe(name);
		}
		const readOnly = await setup(false);
		readOnly.key({ key: '5', ctrlKey: true });
		expect(readOnly.commands.tool).toBe('pointer');
		for (const name of ['freeform', 'arc', 'pencil'])
			expect(readOnly.command(name).disabled).toBe(true);
	});
	it('shares Connector ribbon and Ctrl+3 tool state, while read-only sources refuse it', async () => {
		const { press, key, commands, command, viewport } = await setup();
		expect(command('connector').disabled).toBe(false);
		expect(command('connector').hasAttribute('data-unsupported')).toBe(false);
		press('connector');
		expect(commands.tool).toBe('connector');
		expect(command('connector').getAttribute('pressed')).toBe('true');
		expect(viewport.dataset.tool).toBe('connector');
		key({ key: 'Escape' });
		expect(commands.tool).toBe('pointer');
		key({ key: '3', ctrlKey: true });
		expect(commands.tool).toBe('connector');
		const readOnly = await setup(false);
		readOnly.key({ key: '3', ctrlKey: true });
		expect(readOnly.commands.tool).toBe('pointer');
		expect(readOnly.command('connector').disabled).toBe(true);
	});
	it('arms the Connection Point tool, toggles point markers and restyles connectors', async () => {
		const model = structuredClone(demoDocument);
		const page = model.pages[0]!;
		Object.assign(page.shapes[0]!, { id: '9', kind: 'connector', connectorRoute: 'straight' });
		const ui = await setup(true, false, model);
		expect(ui.command('connection-point').disabled).toBe(false);
		expect(ui.command('connection-point').hasAttribute('data-unsupported')).toBe(false);
		ui.press('connection-point');
		expect(ui.commands.tool).toBe('connection-point');
		expect(ui.viewport.dataset.tool).toBe('connection-point');
		ui.key({ key: '1', ctrlKey: true });
		ui.key({ key: '!', code: 'Digit1', ctrlKey: true, shiftKey: true });
		expect(ui.commands.tool).toBe('connection-point');
		expect(ui.check('connection-points').checked).toBe(true);
		expect(ui.check('connection-points').hasAttribute('disabled')).toBe(false);
		ui.commands.run({ type: 'connection-points' });
		expect(ui.check('connection-points').checked).toBe(false);
		// Design > Connectors restyles the selected connector; the menu shows its route.
		ui.controller.selectShape({ id: page.shapes[0]!.id, name: 'c', pageId: page.id });
		expect(ui.command('connectors-straight').getAttribute('checked')).toBe('true');
		ui.commands.run({ type: 'connector-route', route: 'curved', scope: 'selection' });
		await ui.settle();
		expect(ui.edits.at(-1)).toEqual([
			{
				type: 'set-connector-route',
				pageId: page.id,
				shapeId: page.shapes[0]!.id,
				route: 'curved',
			},
		]);
		// Insert > Connector sets the route of new connectors and arms the Connector tool.
		ui.commands.run({ type: 'connector-route', route: 'straight', scope: 'tool' });
		expect(ui.commands.tool).toBe('connector');
		expect(ui.command('insert-connector-straight').getAttribute('checked')).toBe('true');
		expect(ui.command('insert-connector-right-angle').getAttribute('checked')).toBe('false');
		const readOnly = await setup(false);
		expect(readOnly.command('connection-point').disabled).toBe(true);
		expect(readOnly.command('connectors-curved').disabled).toBe(true);
		ui.dispose();
		readOnly.dispose();
	});
	it('turns shared button activation into typed ribbon actions', async () => {
		const { root, press } = await setup();
		const actions: unknown[] = [];
		const raw: unknown[] = [];
		root.addEventListener('ribbon-action', (event) => actions.push((event as CustomEvent).detail));
		root.addEventListener('office-command', (event) => raw.push((event as CustomEvent).detail));
		press('rectangle');
		press('page-width');
		press('shapes');
		expect(actions).toEqual([
			{ type: 'tool', tool: 'rectangle' },
			{ type: 'zoom', mode: 'width' },
			{ type: 'pane', pane: 'shapes' },
		]);
		expect(raw).toEqual([]);
	});

	it('routes Ellipse menu and Ctrl+9 through the same editable tool state', async () => {
		const { press, key, viewport, command, controller } = await setup();
		press('ellipse');
		expect(viewport.dataset.tool).toBe('ellipse');
		expect(command('ellipse').getAttribute('checked')).toBe('true');
		key({ key: '1', ctrlKey: true });
		expect(viewport.dataset.tool).toBe('pointer');
		key({ key: '9', ctrlKey: true });
		expect(viewport.dataset.tool).toBe('ellipse');
		controller.setDocument(structuredClone(demoDocument));
		expect(command('ellipse').disabled).toBe(true);
	});
	it('routes shared office-command buttons to pane, zoom and tool commands', async () => {
		const { calls, command, press, check, viewport, controller } = await setup();
		press('shapes');
		press('zoom-fit');
		press('page-width');
		expect(calls).toEqual(['pane:shapes', 'fit:page', 'fit:width']);
		press('rectangle');
		expect(command('rectangle').hasAttribute('data-active')).toBe(true);
		expect(command('rectangle-item').getAttribute('checked')).toBe('true');
		expect(command('pointer').getAttribute('pressed')).toBe('false');
		expect(viewport.dataset.tool).toBe('rectangle');
		check('grid').click();
		expect(viewport.dataset.grid).toBe('true');
		expect(check('grid').checked).toBe(true);
		check('ruler').click();
		expect(viewport.closest('.canvas-area')!.getAttribute('data-ruler')).toBe('true');
		press('zoom-150');
		expect(controller.state.zoom).toBe(1.5);
	});

	it('deletes the selection with Delete, then undoes and redoes with Visio shortcuts', async () => {
		const { controller, edits, key, settle, calls } = await setup();
		expect(controller.state.edit.canUndo).toBe(false);
		controller.selectShape({ id: 's1', name: 'Start', pageId: '1' });
		key({ key: 'Delete' });
		await settle();
		expect(edits).toEqual([[{ type: 'delete-shape', pageId: '1', shapeId: 's1' }]]);
		expect(calls).toContain('Deleted Start.');
		expect(controller.state.edit.canUndo).toBe(true);
		key({ key: 'z', ctrlKey: true });
		await settle();
		expect(controller.state.edit.canRedo).toBe(true);
		key({ key: 'y', ctrlKey: true });
		await settle();
		expect(controller.state.edit).toMatchObject({ canUndo: true, canRedo: false });
	});

	it('maps Visio tool, page, find, fit and text shortcuts', async () => {
		const { controller, command, key, calls } = await setup();
		key({ key: '8', ctrlKey: true });
		expect(command('rectangle').hasAttribute('data-active')).toBe(true);
		key({ key: 'Escape' });
		expect(command('pointer').getAttribute('pressed')).toBe('true');
		key({ key: 'PageDown', ctrlKey: true });
		expect(controller.state.pageIndex).toBe(1);
		key({ key: 'PageUp', ctrlKey: true });
		expect(controller.state.pageIndex).toBe(0);
		key({ key: 'F2' });
		key({ key: 'f', ctrlKey: true });
		key({ key: 'W', ctrlKey: true, shiftKey: true });
		expect(calls).toEqual(['reveal:edit:true', 'search', 'fit:page']);
	});

	it('leaves undo and deletion keys to text fields', async () => {
		const { controller, root, key, edits, settle } = await setup();
		controller.selectShape({ id: 's1', name: 'Start', pageId: '1' });
		const text = root.querySelector('textarea')!;
		expect(key({ key: 'Delete' }, text)).toBe(true);
		expect(key({ key: 'z', ctrlKey: true }, text)).toBe(true);
		await settle();
		expect(edits).toEqual([]);
	});

	it('keeps drawing and deletion unavailable for model-only documents', async () => {
		const { controller, command, key, edits, settle } = await setup(false);
		expect(command('rectangle').disabled).toBe(true);
		expect(command('rectangle').title).toMatch(/open a .vsdx file/i);
		key({ key: '8', ctrlKey: true });
		expect(command('pointer').getAttribute('pressed')).toBe('true');
		controller.selectShape({ id: 's1', name: 'Start', pageId: '1' });
		key({ key: 'Delete' });
		key({ key: 'z', ctrlKey: true });
		await settle();
		expect(edits).toEqual([]);
	});

	it('stops listening after disposal', async () => {
		const { calls, press, dispose } = await setup();
		dispose();
		press('zoom-fit');
		expect(calls).toEqual([]);
	});
});

describe('rectangle tool shape IDs', () => {
	it('allocates the next numeric ID across nested shapes', () => {
		const page = structuredClone(demoDocument.pages[0]!);
		page.shapes[0]!.id = '7';
		page.shapes[0]!.children = [{ ...structuredClone(page.shapes[1]!), id: '41', children: [] }];
		expect(nextShapeId(page)).toBe('42');
		expect(nextShapeId({ ...page, shapes: [] })).toBe('1');
	});
});

describe('Visio context menus', () => {
	it('opens the shape menu on right-click, selects the shape and runs Edit Text', async () => {
		const { mountViewer } = await import('./binding');
		const host = document.createElement('div');
		document.body.append(host);
		const viewer = mountViewer(host, { document: structuredClone(demoDocument) });
		const root = viewer.element.shadowRoot!;
		const shape = root.querySelector<SVGGElement>('svg.paper [data-shape-id="s1"]')!;
		shape.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 30, clientY: 40 }));
		const menu = root.querySelector<HTMLElement & { open: boolean }>(
			'[data-context-menu="shape"]',
		)!;
		expect(menu.open).toBe(true);
		expect(viewer.controller.state.selectedShape?.id).toBe('s1');
		const cut = menu.querySelector<HTMLElement & { disabled: boolean }>('[command="ctx-cut"]')!;
		expect(cut.disabled).toBe(true);
		expect(cut.getAttribute('title')).toMatch(/Open a .vsdx file/);
		menu.querySelector('[command="ctx-edit-text"]')!.shadowRoot!.querySelector('button')!.click();
		expect(menu.open).toBe(false);
		// Edit Text edits in place; this model-only drawing has no source to edit.
		expect(root.querySelector('#edit-text')).toBeNull();
		expect(root.querySelector('[data-status]')!.textContent).toBe('This drawing cannot be edited.');
		root
			.querySelector('.viewport')!
			.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 5, clientY: 5 }));
		const page = root.querySelector<HTMLElement & { open: boolean }>('[data-context-menu="page"]')!;
		expect(page.open).toBe(true);
		page.querySelector('[command="ctx-grid"]')!.shadowRoot!.querySelector('button')!.click();
		expect(root.querySelector<HTMLElement>('.viewport')!.dataset.grid).toBe('true');
		viewer.destroy();
	});
});

describe('Visio Tell me', () => {
	it('finds ribbon commands, runs enabled ones and lists unsupported ones with reasons', async () => {
		const { mountViewer } = await import('./binding');
		const host = document.createElement('div');
		document.body.append(host);
		const viewer = mountViewer(host, { document: structuredClone(demoDocument) });
		const root = viewer.element.shadowRoot!;
		const search = root.querySelector<HTMLElement>('.tell-me')!;
		const input = search.shadowRoot!.querySelector('input')!;
		input.dispatchEvent(new FocusEvent('focusin', { bubbles: true, composed: true }));
		const type = (value: string) => {
			input.value = value;
			input.dispatchEvent(new Event('input'));
		};
		const options = () => [...search.shadowRoot!.querySelectorAll('li')];
		type('bold');
		expect(options()[0]!.getAttribute('aria-disabled')).toBe('true');
		expect(options()[0]!.textContent).toMatch(/Bold.*Open a .vsdx file/);
		type('grid');
		const first = options()[0]!;
		expect(first.querySelector('span')!.textContent).toBe('Grid');
		expect(first.querySelector('small')!.textContent).toBe('View › Show');
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		expect(root.querySelector<HTMLElement>('.viewport')!.dataset.grid).toBe('true');
		type('page width');
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		expect(viewer.element.zoom).not.toBe(1);
		viewer.destroy();
	});
});
