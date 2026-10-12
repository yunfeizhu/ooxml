import { afterEach, describe, expect, it } from 'vitest';
import { demoDocument } from 'ooxml-core/visio/ui';
import type { OfficeUiGallery } from '../ribbon/gallery';
import { mountViewer } from './binding';
import { setupFormattingViewer as setup } from './__fixtures__/formatting-viewer';
import {
	INLINE_GALLERY_STEPS,
	fitInlineGalleries,
	inlineGalleryTiles,
} from './ribbon-inline-galleries';
import { themesGalleryState, variantsGalleryState } from './ribbon-themes';

afterEach(() => document.body.replaceChildren());

const gallery = (root: ShadowRoot, id: string) =>
	root.querySelector<OfficeUiGallery>(`office-ui-gallery[data-menu="${id}"]`)!;
const row = (element: OfficeUiGallery) =>
	[...element.querySelectorAll<HTMLButtonElement>('.strip .tile')].map(
		(tile) => tile.dataset.galleryItem,
	);

describe('inline ribbon galleries', () => {
	it('shows Quick Styles, Themes and Variants as rows of tiles with a More button', async () => {
		const host = document.createElement('div');
		document.body.append(host);
		const viewer = mountViewer(host, { document: structuredClone(demoDocument) });
		const root = viewer.element.shadowRoot!;
		const quick = gallery(root, 'quick-styles');
		const themes = gallery(root, 'themes');
		const variants = gallery(root, 'variants');
		await Promise.all([quick, themes, variants].map((element) => element.updateComplete));
		for (const element of [quick, themes, variants])
			expect(element.getAttribute('mode')).toBe('inline');
		// One tile per theme colour, the first style row.
		expect(row(quick)).toEqual([0, 2, 3, 4, 5, 6, 7].map((color) => `quick-style-${color}-1`));
		expect(row(themes).slice(0, 2)).toEqual(['theme-none', 'theme-office']);
		expect(row(themes)).toHaveLength(6);
		// No theme on the page: four empty tiles, and nothing to open.
		expect(row(variants)).toHaveLength(4);
		expect(variants.querySelectorAll('.strip .tile:disabled')).toHaveLength(4);
		expect(quick.trigger.getAttribute('aria-label')).toBe('More Quick Styles');
		expect(themes.trigger.getAttribute('aria-label')).toBe('More Themes');
		expect(quick.dataset.inlineTiles).toBe('7');
		viewer.destroy();
	});

	it('applies a style straight from the row and the rest from the More gallery', async () => {
		const ui = await setup();
		ui.selection();
		const quick = gallery(ui.root, 'quick-styles');
		await quick.updateComplete;
		quick.querySelector<HTMLButtonElement>('.strip [data-gallery-item="quick-style-3-1"]')!.click();
		await ui.done();
		expect(ui.edits.at(-1)).toEqual([
			{ type: 'format-shape', pageId: '1', shapeId: '1', quickStyle: { color: 3, matrix: 1 } },
		]);
		quick.trigger.click();
		await quick.updateComplete;
		expect(quick.open).toBe(true);
		expect(quick.querySelectorAll('.popup .tile')).toHaveLength(42);
		quick.querySelector<HTMLButtonElement>('.popup [data-gallery-item="quick-style-2-4"]')!.click();
		await ui.done();
		expect(ui.edits.at(-1)).toEqual([
			{ type: 'format-shape', pageId: '1', shapeId: '1', quickStyle: { color: 2, matrix: 4 } },
		]);
		expect(quick.open).toBe(false);
		ui.dispose();
		ui.controller.destroy();
	});

	it('fits the rows to the viewer width and returns to the button on a phone', () => {
		expect(inlineGalleryTiles('quick-styles', 2000)).toBe(7);
		expect(inlineGalleryTiles('quick-styles', 1700)).toBe(3);
		expect(inlineGalleryTiles('quick-styles', 1100)).toBe(2);
		expect(inlineGalleryTiles('themes', 1600)).toBe(4);
		expect(inlineGalleryTiles('variants', 1600)).toBe(2);
		expect(inlineGalleryTiles('themes', 760)).toBe(0);
		expect(inlineGalleryTiles('unknown', 2000)).toBe(0);
		for (const steps of Object.values(INLINE_GALLERY_STEPS))
			expect(steps.map(([width]) => width)).toEqual(
				[...steps.map(([width]) => width)].sort((a, b) => b - a),
			);
		const host = document.createElement('div');
		document.body.append(host);
		const viewer = mountViewer(host, { document: structuredClone(demoDocument) });
		const root = viewer.element.shadowRoot!;
		const themes = gallery(root, 'themes');
		fitInlineGalleries(root, 1600);
		expect(themes.dataset.inlineTiles).toBe('4');
		expect(themes.getAttribute('mode')).toBe('inline');
		fitInlineGalleries(root, 600);
		expect(themes.dataset.inlineTiles).toBe('0');
		expect(themes.hasAttribute('mode')).toBe(false);
		fitInlineGalleries(root, 1900);
		expect(themes.getAttribute('mode')).toBe('inline');
		expect(gallery(root, 'quick-styles').dataset.inlineTiles).toBe('7');
		viewer.destroy();
	});

	it('keeps the applied theme in the row and offers the theme variants', () => {
		const themes = themesGalleryState(false, undefined);
		const last = themes.sections[0]!.items.at(-1)!;
		const id = last.id.replace(/^theme-/, '');
		const current = {
			name: last.label,
			builtIn: id,
			variant: 2,
			variants: [],
			accents: [],
		} as unknown as Parameters<typeof themesGalleryState>[1];
		const applied = themesGalleryState(false, current);
		expect(applied.inline).toHaveLength(6);
		expect(applied.inline!.at(-1)).toMatchObject({ id: last.id, applied: true });
		const variants = variantsGalleryState(false, current);
		// The built-in theme supplies its four variants; the row is the section itself.
		expect(variants.inline).toBeUndefined();
		expect(variants.sections[0]!.items.map((item) => item.applied)).toEqual([
			false,
			false,
			true,
			false,
		]);
		expect(variantsGalleryState(false, undefined).inline).toHaveLength(4);
		expect(variantsGalleryState(false, undefined).disabled).toBe(true);
	});
});
