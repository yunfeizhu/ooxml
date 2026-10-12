import type { PptxElement } from 'ooxml-core/pptx';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const smartArt = {
	id: 'sa1',
	type: 'smartArt',
	x: 0,
	y: 0,
	width: 400,
	height: 300,
	smartArtData: {
		layout: 'basicBlockList',
		resolvedLayoutType: 'list',
		nodes: [{ id: 'n1', text: 'Node One' }],
		connections: [],
	},
} as unknown as PptxElement;

/** A fresh copy of the gallery registry, so the lazy layout library has not loaded yet. */
async function freshRegistry() {
	vi.resetModules();
	return import('./gallery-registry');
}

describe('Layouts gallery before the lazy layout library has loaded', () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it('lists only the families and hands out a promise for the named layouts', async () => {
		const { buildRibbonGallery } = await freshRegistry();
		const first = buildRibbonGallery('smartArtLayouts', { element: smartArt });
		expect(first.sections.map((section) => section.id)).toEqual(['layouts']);
		expect(first.ready).toBeInstanceOf(Promise);

		const next = await first.ready;
		expect(next?.sections.map((section) => section.id)).toEqual(
			expect.arrayContaining(['layouts', 'named-timeline']),
		);
		// Built once the library is in, so there is nothing left to wait for.
		expect(next?.ready).toBeUndefined();
	});

	it('offers no promise once the library is available', async () => {
		const { buildRibbonGallery } = await freshRegistry();
		await buildRibbonGallery('smartArtLayouts', { element: smartArt }).ready;
		expect(buildRibbonGallery('smartArtLayouts', { element: smartArt }).ready).toBeUndefined();
	});
});
