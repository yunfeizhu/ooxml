import { afterEach, expect, it } from 'vitest';
import { parseVsdx, visioFallbackQuickStyle } from 'ooxml-core/visio';
import type { OfficeUiGallery } from '../ribbon/gallery';
import { setupFormattingViewer as setup } from './__fixtures__/formatting-viewer';
import { renderPage } from './render-svg';

afterEach(() => document.body.replaceChildren());

const gallery = (root: ShadowRoot) =>
	root.querySelector<OfficeUiGallery>('office-ui-gallery[data-menu="quick-styles"]')!;

it('applies a Quick Style from the gallery through history and enables it per selection', async () => {
	const ui = await setup();
	const quick = gallery(ui.root);
	expect(quick.hasAttribute('disabled')).toBe(true);
	expect(quick.title).toMatch(/Select a shape/);
	ui.selection();
	expect(quick.hasAttribute('disabled')).toBe(false);
	expect(quick.state?.sections[0]?.items).toHaveLength(42);
	quick.open = true;
	await quick.updateComplete;
	quick.querySelector<HTMLButtonElement>('[data-gallery-item="quick-style-2-4"]')!.click();
	await ui.done();
	expect(ui.edits.at(-1)).toEqual([
		{ type: 'format-shape', pageId: '1', shapeId: '1', quickStyle: { color: 2, matrix: 4 } },
	]);
	const expected = visioFallbackQuickStyle({ color: 2, matrix: 4 });
	expect(ui.shape().style).toMatchObject({ fill: expected.fill, lineColor: expected.line });
	expect(ui.shape().text.runs.every((run) => run.color === expected.font)).toBe(true);
	ui.press('undo');
	await ui.done();
	expect(ui.controller.exportVsdx().bytes).toEqual(ui.bytes);
	ui.dispose();
	ui.controller.destroy();
});

it('applies and clears outer shadows, checks the current preset and draws the shadow', async () => {
	const ui = await setup();
	ui.selection();
	expect(ui.button('shadow-bottom-right').disabled).toBe(false);
	expect(ui.button('shadow-none').getAttribute('checked')).toBe('true');
	ui.press('shadow-bottom-right');
	await ui.done();
	expect(ui.shape().style.shadow).toBeDefined();
	expect(ui.button('shadow-bottom-right').getAttribute('checked')).toBe('true');
	expect(ui.button('shadow-none').getAttribute('checked')).toBe('false');
	const document = ui.controller.state.document!;
	const rendered = renderPage(document, document.pages[0]!);
	const shadow = rendered.svg.querySelector('[data-shadow]')!;
	expect(shadow).not.toBeNull();
	expect(shadow.getAttribute('opacity')).toBe('0.4');
	expect(shadow.getAttribute('filter')).toMatch(/^url\(#visio-shadow-\d+\)$/);
	expect(shadow.querySelector('path')!.getAttribute('fill')).toBe('#000000');
	// The shadow sits beneath the shape's own geometry and is not hit-testable.
	expect(shadow.nextElementSibling?.hasAttribute('data-geometry')).toBe(true);
	expect(shadow.getAttribute('pointer-events')).toBe('none');
	rendered.dispose();
	ui.press('shadow-none');
	await ui.done();
	expect(ui.shape().style.shadow).toBeUndefined();
	expect(
		(await parseVsdx(ui.controller.exportVsdx().bytes)).pages[0]!.shapes[0]!.style.shadow,
	).toBeUndefined();
	ui.dispose();
	ui.controller.destroy();
});

it('keeps unsupported effects disabled with their reasons and disables styles for drawn shapes on a layer', async () => {
	const ui = await setup();
	ui.selection();
	for (const id of ['bevel', 'rotation-3d']) {
		expect(ui.button(id).disabled).toBe(true);
		expect(ui.button(id).title).toMatch(/not available yet/);
	}
	ui.shape().layerIds = ['42'];
	ui.commands.render(ui.controller.state);
	expect(gallery(ui.root).hasAttribute('disabled')).toBe(true);
	expect(ui.button('shadow-bottom').disabled).toBe(true);
	ui.dispose();
	ui.controller.destroy();
});
