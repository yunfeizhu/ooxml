import { afterEach, expect, it, vi } from 'vitest';
import {
	VISIO_GLUE,
	VISIO_SNAP,
	createVsdx,
	editVsdx,
	parseVsdx,
	visioSnapGlue,
	type VisioEdit,
} from 'ooxml-core/visio';
import { ViewerController } from './controller';
import { ViewerCommands } from './viewer-commands';
import { createRibbon } from './ribbon';
import { createRulers } from './viewer-ruler';
import { registerViewerControls } from './office-ui';
import { renderPage } from './render-svg';

afterEach(() => document.body.replaceChildren());

async function setup(source = true) {
	registerViewerControls();
	const bytes = (
		await editVsdx(await createVsdx(), [
			{ type: 'create-rectangle', pageId: '0', shapeId: '1', x: 0.5, y: 0.5, width: 1, height: 1 },
		])
	).bytes;
	const edits: VisioEdit[][] = [];
	const controller = new ViewerController(
		parseVsdx,
		() => {},
		async (input, commands) => {
			edits.push([...commands]);
			const result = await editVsdx(input, commands);
			return { ...result, document: await parseVsdx(result.bytes) };
		},
	);
	if (source) await controller.load(bytes);
	else controller.setDocument(await parseVsdx(bytes));
	const host = document.createElement('div');
	document.body.append(host);
	const root = host.attachShadow({ mode: 'open' });
	const viewport = document.createElement('div');
	viewport.className = 'viewport';
	root.append(createRibbon(document), viewport);
	const feedback: string[] = [];
	const commands = new ViewerCommands({
		root,
		viewport,
		controller,
		rulers: createRulers(viewport),
		fit: () => {},
		togglePane: () => {},
		reveal: () => {},
		focusSearch: () => {},
		togglePanZoom: () => {},
		toggleSizePosition: () => {},
		announce: (message) => feedback.push(message),
	});
	const dispose = commands.wire();
	const paint = () => {
		const state = controller.state;
		const page = state.document?.pages[state.pageIndex];
		if (page && state.document) viewport.replaceChildren(renderPage(state.document, page).svg);
		commands.render(state);
	};
	controller.subscribe(paint);
	paint();
	const group = () =>
		root.querySelector<HTMLElement>('office-ui-ribbon-group[launcher="visual-aids-dialog"]')!;
	const open = () =>
		group().dispatchEvent(
			new CustomEvent('office-command', {
				detail: { command: 'visual-aids-dialog' },
				bubbles: true,
				composed: true,
			}),
		);
	const dialog = () => root.querySelector<HTMLElement & { open: boolean }>('.snap-glue-dialog')!;
	const box = (option: string) =>
		dialog().querySelector<HTMLInputElement>(`input[data-option="${option}"]`)!;
	const press = (name: 'ok' | 'cancel') =>
		dialog()
			.querySelector(`[command="snap-glue-dialog-${name}"]`)!
			.shadowRoot!.querySelector('button')!
			.click();
	const done = () => vi.waitFor(() => expect(controller.state.edit.busy).toBe(false));
	return {
		root,
		controller,
		commands,
		edits,
		feedback,
		group,
		open,
		dialog,
		box,
		press,
		done,
		dispose,
	};
}

it('shows the drawing settings as Visio lists them and saves the changed ones', async () => {
	const ui = await setup();
	expect(ui.group().hasAttribute('launcher-disabled')).toBe(false);
	ui.open();
	expect(ui.dialog().open).toBe(true);
	expect(ui.dialog().getAttribute('heading')).toBe('Snap & Glue');
	expect([...ui.dialog().querySelectorAll('legend')].map((legend) => legend.textContent)).toEqual([
		'Currently active',
		'Snap to',
		'Glue to',
	]);
	// Visio's defaults: both active, glue to guides and connection points.
	expect(ui.box('snap').checked).toBe(true);
	expect(ui.box('glue').checked).toBe(true);
	expect(ui.box(`snap:${VISIO_SNAP.grid}`).checked).toBe(true);
	expect(ui.box(`snap:${VISIO_SNAP.handles}`).checked).toBe(false);
	expect(ui.box(`glue:${VISIO_GLUE.connectionPoints}`).checked).toBe(true);
	expect(ui.box(`glue:${VISIO_GLUE.geometry}`).checked).toBe(false);
	ui.box('snap').checked = false;
	ui.box(`glue:${VISIO_GLUE.geometry}`).checked = true;
	ui.press('ok');
	await vi.waitFor(() => expect(ui.dialog().open).toBe(false));
	await ui.done();
	expect(ui.edits).toEqual([
		[{ type: 'set-snap-glue', snapSettings: 65847 | VISIO_SNAP.disabled, glueSettings: 41 }],
	]);
	expect(visioSnapGlue(ui.controller.state.document!).glueSettings).toBe(41);
	ui.open();
	expect(ui.box('snap').checked).toBe(false);
	// Unchanged values save nothing.
	ui.press('ok');
	expect(ui.dialog().open).toBe(false);
	expect(ui.edits).toHaveLength(1);
	await ui.controller.undo();
	expect(ui.controller.state.document!.snapGlue).toBeUndefined();
	ui.dispose();
});

it('stops snapping when Snap is off and leaves the grid out when Grid is unchecked', async () => {
	const ui = await setup();
	const page = () => ui.controller.state.document!.pages[0]!;
	const guides = ui.commands.layoutCommands.guides;
	const drag = { x: 0.03, y: 0 };
	ui.commands.run({ type: 'grid' });
	// The shape spans 0..1; its left edge snaps back to the grid line at 0.
	expect(guides.snap(page(), ['1'], drag, ui.commands.gridStep).x).toBeCloseTo(0, 9);
	await ui.controller.applyEdits([
		{ type: 'set-snap-glue', snapSettings: 65847 & ~VISIO_SNAP.grid },
	]);
	expect(guides.snap(page(), ['1'], drag, ui.commands.gridStep).x).toBe(0.03);
	await ui.controller.applyEdits([
		{ type: 'set-snap-glue', snapSettings: 65847 | VISIO_SNAP.disabled },
	]);
	expect(guides.snap(page(), ['1'], drag, ui.commands.gridStep)).toBe(drag);
	ui.dispose();
});

it('explains why a read-only drawing cannot change them', async () => {
	const ui = await setup(false);
	expect(ui.group().hasAttribute('launcher-disabled')).toBe(true);
	ui.open();
	expect(ui.dialog().open).toBeFalsy();
	expect(ui.feedback.at(-1)).toMatch(/Snap & Glue: Open a \.vsdx file/);
	ui.dispose();
});
