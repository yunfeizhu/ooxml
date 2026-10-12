/**
 * Visio shows Quick Styles, Themes and Variants as a row of tiles in the ribbon, with a More
 * button for the whole gallery. The shared `office-ui-gallery` draws that row (`mode="inline"`);
 * this module decides how many tiles fit, because the ribbon does not fold its groups: a narrow
 * viewer shows fewer tiles, and a phone-sized one shows the labelled drop-down button instead.
 */

/**
 * `[minimum viewer width, tiles shown]`, widest first. The widths are where the Home and Design
 * rows still fit the viewer with that many tiles. Two tiles are no wider than the labelled
 * drop-down button, so they stay down to the phone layout, where the button returns.
 */
export const INLINE_GALLERY_STEPS: Readonly<
	Record<string, readonly (readonly [number, number])[]>
> = {
	'quick-styles': [
		[1860, 7],
		[1815, 6],
		[1770, 5],
		[1725, 4],
		[1680, 3],
		[761, 2],
	],
	themes: [
		[1790, 6],
		[1510, 4],
		[761, 2],
	],
	variants: [
		[1650, 4],
		[761, 2],
	],
};

/** How many tiles of gallery `id` a viewer `width` pixels wide shows inline (0: a drop-down). */
export function inlineGalleryTiles(id: string, width: number): number {
	for (const [min, tiles] of INLINE_GALLERY_STEPS[id] ?? []) if (width >= min) return tiles;
	return 0;
}

/** Marks a gallery inline at its widest size; `wireInlineGalleries` narrows it to the viewer. */
export function inlineGallery(gallery: HTMLElement, id: string): void {
	const tiles = INLINE_GALLERY_STEPS[id]?.[0]?.[1] ?? 0;
	gallery.dataset.inlineGallery = id;
	gallery.dataset.inlineTiles = String(tiles);
	gallery.setAttribute('mode', 'inline');
}

/** Fits every inline gallery under `root` to a viewer `width` pixels wide. */
export function fitInlineGalleries(root: ParentNode, width: number): void {
	for (const gallery of root.querySelectorAll<HTMLElement>('[data-inline-gallery]')) {
		const tiles = inlineGalleryTiles(gallery.dataset.inlineGallery!, width);
		if (gallery.dataset.inlineTiles !== String(tiles)) gallery.dataset.inlineTiles = String(tiles);
		// Without a row the shared gallery is its labelled drop-down button again.
		if (tiles > 0) {
			if (gallery.getAttribute('mode') !== 'inline') gallery.setAttribute('mode', 'inline');
		} else if (gallery.hasAttribute('mode')) gallery.removeAttribute('mode');
	}
}

/** Keeps the inline galleries fitted to the viewer's width. Returns the disposer. */
export function wireInlineGalleries(host: HTMLElement, root: ParentNode): () => void {
	const Observer = host.ownerDocument.defaultView?.ResizeObserver;
	if (!Observer) return () => {};
	const observer = new Observer((entries) => {
		const width = entries.at(-1)?.contentRect.width ?? 0;
		// A viewer that is not laid out yet (display: none, detached) keeps the widest row.
		if (width > 0) fitInlineGalleries(root, width);
	});
	observer.observe(host);
	return () => observer.disconnect();
}
