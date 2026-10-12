import { afterEach, expect, it } from 'vitest';
import { mountViewer } from './binding';
import { demoDocument } from 'ooxml-core/visio/ui';

afterEach(() => document.body.replaceChildren());
function setup() {
	const host = document.createElement('div');
	document.body.append(host);
	const viewer = mountViewer(host, { document: demoDocument });
	const root = viewer.element.shadowRoot!;
	const shape = (id: string) => root.querySelector<SVGGElement>(`[data-shape-id="${id}"]`)!;
	const click = (id: string, modifiers: MouseEventInit = {}) =>
		shape(id).dispatchEvent(new MouseEvent('click', { bubbles: true, ...modifiers }));
	const selected = () =>
		[...root.querySelectorAll<SVGGElement>('[data-selected="true"]')].map(
			(node) => node.dataset.shapeId,
		);
	return { viewer, root, shape, click, selected };
}

it('shares additive pointer selection and paints every selected shape', () => {
	const ui = setup();
	ui.click('s1');
	ui.click('s2', { shiftKey: true });
	expect(ui.selected()).toEqual(['s1', 's2']);
	expect(ui.shape('s1').getAttribute('aria-pressed')).toBe('true');
	expect(ui.shape('s2').getAttribute('aria-pressed')).toBe('true');
	expect(ui.root.querySelector('[data-width-status]')?.getAttribute('value')).toBe(
		'2 shapes selected',
	);
	ui.click('s1', { ctrlKey: true });
	expect(ui.selected()).toEqual(['s2']);
	ui.click('s3', { metaKey: true });
	expect(ui.selected()).toEqual(['s2', 's3']);
	ui.click('s4');
	expect(ui.selected()).toEqual(['s4']);
	ui.root
		.querySelector('svg.paper')!
		.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
	expect(ui.selected()).toEqual([]);
	ui.viewer.destroy();
});

it('supports additive keyboard activation, Escape clearing and page-scoped rendering', () => {
	const ui = setup();
	ui.click('s1');
	ui.shape('s2').dispatchEvent(
		new KeyboardEvent('keydown', { key: ' ', ctrlKey: true, bubbles: true, cancelable: true }),
	);
	expect(ui.selected()).toEqual(['s1', 's2']);
	ui.shape('s1').dispatchEvent(
		new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true }),
	);
	expect(ui.selected()).toEqual(['s2']);
	ui.shape('s2').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
	expect(ui.viewer.controller.state.selectedShapes).toEqual([]);
	ui.viewer.selectAll();
	expect(ui.selected()).toHaveLength(demoDocument.pages[0]!.shapes.length);
	ui.viewer.update({ pageIndex: 1 });
	expect(ui.selected()).toEqual([]);
	ui.viewer.destroy();
});

it('keeps a multi-selection when its secondary shape opens the context menu', () => {
	const ui = setup();
	ui.click('s1');
	ui.click('s2', { shiftKey: true });
	const before = ui.viewer.controller.state.selectedShapes;
	ui.shape('s2').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
	expect(ui.viewer.controller.state.selectedShapes).toBe(before);
	expect(ui.viewer.controller.state.selectedShape?.id).toBe('s1');
	ui.viewer.destroy();
});
