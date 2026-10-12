// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createVsdx, editVsdx, parseVsdx, visioPageLayout, type VisioEdit } from 'ooxml-core/visio';
import { ViewerController } from './controller';
import { ViewerCommands } from './viewer-commands';
import { createRibbon } from './ribbon';
import { createRulers } from './viewer-ruler';
import { registerViewerControls } from './office-ui';
import { renderPage } from './render-svg';

afterEach(() => document.body.replaceChildren());

async function setup(source = true) {
	registerViewerControls();
	const bytes = await createVsdx();
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
	const rulers = createRulers(viewport);
	const commands = new ViewerCommands({
		root,
		viewport,
		controller,
		rulers,
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
		root.querySelector<HTMLElement>('office-ui-ribbon-group[launcher="show-dialog"]')!;
	const open = () =>
		group().dispatchEvent(
			new CustomEvent('office-command', {
				detail: { command: 'show-dialog' },
				bubbles: true,
				composed: true,
			}),
		);
	const dialog = () => root.querySelector<HTMLElement & { open: boolean }>('.ruler-grid-dialog')!;
	const field = (name: string) =>
		dialog().querySelector<HTMLInputElement | HTMLSelectElement>(`[data-field="${name}"]`)!;
	const press = (name: 'ok' | 'cancel') =>
		dialog()
			.querySelector(`[command="ruler-grid-dialog-${name}"]`)!
			.shadowRoot!.querySelector('button')!
			.click();
	const done = () => vi.waitFor(() => expect(controller.state.edit.busy).toBe(false));
	const page = () => controller.state.document!.pages[0]!;
	const svg = () => viewport.querySelector<SVGSVGElement>('svg.paper')!;
	return {
		root,
		viewport,
		controller,
		commands,
		edits,
		feedback,
		group,
		open,
		dialog,
		field,
		press,
		done,
		page,
		svg,
		rulers,
		dispose,
	};
}

it('opens from the Show launcher with the page values and saves only what changed', async () => {
	const ui = await setup();
	expect(ui.group().hasAttribute('launcher-disabled')).toBe(false);
	expect(ui.group().title).toBe('Ruler & Grid');
	ui.open();
	expect(ui.dialog().open).toBe(true);
	expect(ui.dialog().getAttribute('heading')).toBe('Ruler & Grid');
	// Visio's defaults for a page without the cells: Fine rulers and a Fine grid from the corner.
	expect(ui.field('rulerDensityX').value).toBe('32');
	expect(ui.field('gridDensityY').value).toBe('8');
	expect(ui.field('gridSpacingX').value).toBe('0');
	expect(
		[...ui.field('gridDensityX').querySelectorAll('option')].map((option) => option.textContent),
	).toEqual(['Fine', 'Normal', 'Coarse', 'Fixed']);
	ui.field('gridDensityX').value = '0';
	ui.field('gridSpacingX').value = '0.5';
	ui.field('gridOriginY').value = '1';
	ui.field('rulerDensityY').value = '8';
	ui.field('rulerOriginX').value = '2';
	ui.press('ok');
	await vi.waitFor(() => expect(ui.dialog().open).toBe(false));
	await ui.done();
	expect(ui.edits).toEqual([
		[
			{
				type: 'set-page-layout',
				pageId: '0',
				rulerDensityY: 8,
				rulerOriginX: 2,
				gridDensityX: 0,
				gridSpacingX: 0.5,
				gridOriginY: 1,
			},
		],
	]);
	expect(visioPageLayout(ui.page())).toMatchObject({ gridDensityX: 0, gridSpacingX: 0.5 });
	// The canvas grid and Snap to Grid follow the page.
	expect(ui.svg().style.getPropertyValue('--_vv-grid-x')).toBe('48px');
	expect(ui.svg().style.getPropertyValue('--_vv-grid-y')).toBe('24px');
	expect(ui.svg().style.getPropertyValue('--_vv-grid-origin-y')).toBe('96px');
	expect(ui.commands.gridStep).toBe(0);
	ui.commands.run({ type: 'grid' });
	expect(ui.commands.gridStep).toEqual({ x: 0.5, y: 0.25, originX: 0, originY: 1 });
	// One undoable step.
	await ui.controller.undo();
	expect(ui.page().layout).toBeUndefined();
	expect(ui.svg().style.getPropertyValue('--_vv-grid-x')).toBe('24px');
	ui.dispose();
});

it('changes nothing on Cancel or unchanged values, and reports a bad number in the dialog', async () => {
	const ui = await setup();
	ui.open();
	ui.field('gridOriginX').value = '3';
	ui.press('cancel');
	expect(ui.dialog().open).toBe(false);
	ui.open();
	expect(ui.field('gridOriginX').value).toBe('0');
	ui.press('ok');
	expect(ui.dialog().open).toBe(false);
	expect(ui.edits).toEqual([]);
	ui.open();
	ui.field('gridSpacingY').value = '-1';
	ui.press('ok');
	expect(ui.dialog().open).toBe(true);
	expect(ui.dialog().querySelector('[role="alert"]')!.textContent).toMatch(/negative/);
	ui.field('gridSpacingY').value = '';
	ui.press('ok');
	expect(ui.dialog().querySelector('[role="alert"]')!.textContent).toMatch(/enter a number/);
	expect(ui.edits).toEqual([]);
	ui.dispose();
});

it('explains why a read-only drawing cannot change them', async () => {
	const ui = await setup(false);
	expect(ui.group().hasAttribute('launcher-disabled')).toBe(true);
	expect(ui.group().title).toMatch(/Open a \.vsdx file/);
	ui.open();
	expect(ui.dialog().open).toBeFalsy();
	expect(ui.feedback.at(-1)).toMatch(/Ruler & Grid: Open a \.vsdx file/);
	ui.dispose();
});
