import { afterEach, expect, it, vi } from 'vitest';
import { createVsdx, editVsdx, parseVsdx } from 'ooxml-core/visio';
import { ViewerController } from './controller';
import { createShapesWindow } from './shapes-window';
import { wireStencil } from './viewer-stencil';

afterEach(() => {
	document.body.replaceChildren();
	localStorage.clear();
});

/** A Shapes window over a blank drawing, edited by the core itself. */
async function open() {
	const controller = new ViewerController(
		parseVsdx,
		vi.fn(),
		async (bytes, commands) => {
			const result = await editVsdx(bytes, commands);
			return { ...result, document: await parseVsdx(result.bytes) };
		},
		async () => 'unused',
	);
	const pane = createShapesWindow(document);
	const viewport = document.createElement('div');
	document.body.append(pane, viewport);
	const messages: string[] = [];
	const dispose = wireStencil(pane, viewport, controller, (message) => messages.push(message));
	await controller.load(await createVsdx());
	const sections = () =>
		[...pane.querySelectorAll<HTMLElement>('#shapes-sections [data-stencil]')].map((section) => [
			section.dataset.stencil,
			section.querySelector('.stencil-title')!.getAttribute('aria-expanded'),
		]);
	const add = async (id: string) => {
		const count = messages.length;
		pane.querySelector<HTMLButtonElement>(`[data-master="${id}"]`)!.click();
		await vi.waitFor(() => expect(messages.length).toBe(count + 1), { timeout: 5000 });
	};
	return { controller, pane, messages, sections, add, dispose };
}

it('adds built-in masters to the drawing as instances and keeps the stencil in use open', async () => {
	const ui = await open();
	expect(ui.sections()).toEqual([['basic', 'true']]);
	await ui.add('rectangle');
	expect(ui.messages.at(-1)).toBe('Rectangle 1 added from Basic Shapes.');
	// The first drop gives the drawing a Document Stencil; it is listed folded and Basic Shapes,
	// which the user is dragging from, stays open.
	expect(ui.sections()).toEqual([
		['document', 'false'],
		['basic', 'true'],
	]);
	await ui.add('circle');
	await ui.add('rectangle');
	const model = ui.controller.state.document!;
	expect(model.masters!.map((master) => master.name)).toEqual(['Rectangle', 'Circle']);
	expect(model.pages[0]!.shapes.map((shape) => [shape.name, shape.masterId])).toEqual([
		['Rectangle', model.masters![0]!.id],
		['Circle', model.masters![1]!.id],
		['Rectangle.3', model.masters![0]!.id],
	]);
	// Each drop carries the theme's default look, and is one undo step with it.
	expect(model.pages[0]!.shapes[0]!.style.fill).toMatch(/^#/);
	await ui.controller.undo();
	expect(ui.controller.state.document!.pages[0]!.shapes).toHaveLength(2);
	// The drawing's own masters can be dropped again from its Document Stencil.
	const section = ui.pane.querySelector<HTMLElement>('[data-stencil="document"]')!;
	expect([...section.querySelectorAll('li')].map((item) => item.dataset.name)).toEqual([
		'Rectangle',
		'Circle',
	]);
	ui.dispose();
});
