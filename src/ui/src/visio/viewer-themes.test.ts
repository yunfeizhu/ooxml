import { afterEach, expect, it } from 'vitest';
import { visioBuiltInTheme, visioThemeVariantColors } from 'ooxml-core/visio';
import type { OfficeUiGallery } from '../ribbon/gallery';
import { setupFormattingViewer as setup } from './__fixtures__/formatting-viewer';
import { VARIANT_OPTION_REASONS } from './ribbon-themes';

afterEach(() => document.body.replaceChildren());

const gallery = (root: ShadowRoot, id: string) =>
	root.querySelector<OfficeUiGallery>(`office-ui-gallery[data-menu="${id}"]`)!;
async function pick(root: ShadowRoot, id: string, item: string) {
	const element = gallery(root, id);
	element.open = true;
	await element.updateComplete;
	element.querySelector<HTMLButtonElement>(`[data-gallery-item="${item}"]`)!.click();
}

it('applies a built-in theme and its variants to the page, recolouring quick-styled shapes', async () => {
	const ui = await setup();
	const themes = gallery(ui.root, 'themes');
	const variants = gallery(ui.root, 'variants');
	expect(themes.hasAttribute('disabled')).toBe(false);
	expect(variants.hasAttribute('disabled')).toBe(true);
	expect(variants.title).toMatch(/Apply a theme/);
	expect(themes.state?.sections[0]?.items.map((item) => item.id).slice(0, 3)).toEqual([
		'theme-none',
		'theme-office',
		'theme-slate',
	]);
	expect(themes.state?.sections[0]?.items[0]?.applied).toBe(true);
	// A quick-styled shape, as dropped stencil masters are.
	ui.selection();
	await pick(ui.root, 'quick-styles', 'quick-style-2-4');
	await ui.done();
	await pick(ui.root, 'themes', 'theme-harbor');
	await ui.done();
	const page = ui.controller.state.document!.pages[0]!;
	expect(ui.edits.at(-1)).toEqual([{ type: 'set-page-theme', pageId: page.id, theme: 'harbor' }]);
	expect(page.theme).toMatchObject({ name: 'Harbor', builtIn: 'harbor', variant: 0 });
	expect(ui.shape().style.fill).toBe('#1f78b4');
	expect(themes.state?.sections[0]?.items.find((item) => item.applied)?.id).toBe('theme-harbor');
	expect(variants.hasAttribute('disabled')).toBe(false);
	expect(variants.state?.sections[0]?.items).toHaveLength(4);
	await pick(ui.root, 'variants', 'variant-1');
	await ui.done();
	expect(ui.edits.at(-1)).toEqual([{ type: 'set-page-theme', pageId: page.id, variant: 1 }]);
	expect(ui.controller.state.document!.pages[0]!.theme!.variant).toBe(1);
	expect(variants.state?.sections[0]?.items[1]?.applied).toBe(true);
	expect(visioThemeVariantColors(visioBuiltInTheme('harbor'), 1)).toHaveLength(7);
	await pick(ui.root, 'themes', 'theme-none');
	await ui.done();
	expect(ui.controller.state.document!.pages[0]!.theme).toBeUndefined();
	expect(variants.hasAttribute('disabled')).toBe(true);
	for (let step = 0; step < 4; step++) {
		ui.press('undo');
		await ui.done();
	}
	expect(ui.controller.exportVsdx().bytes).toEqual(ui.bytes);
	ui.dispose();
	ui.controller.destroy();
});

it('keeps theme part options it cannot change disabled with reasons', async () => {
	const ui = await setup();
	for (const [id, , reason] of VARIANT_OPTION_REASONS) {
		expect(ui.button(id).disabled).toBe(true);
		expect(ui.button(id).title).toContain(reason);
	}
	ui.dispose();
	ui.controller.destroy();
});
