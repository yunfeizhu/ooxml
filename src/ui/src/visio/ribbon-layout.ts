import {
	VISIO_LAYOUT_LABELS,
	VISIO_LAYOUT_STYLES,
	type VisioLayoutStyle,
} from 'ooxml-core/visio/ui';
import type {
	OfficeGalleryPickEvent,
	OfficeGalleryState,
	OfficeUiGallery,
} from '../ribbon/gallery';
import { emitRibbonAction } from './ribbon-action';

const LABEL = 'Re-Layout Page';
const INITIAL_REASON = 'Open a .vsdx file to lay out its shapes.';

/** Static application markup: a tiny diagram of each layout, drawn as gallery tiles. */
const box = (x: number, y: number) =>
	`<rect x="${x - 3}" y="${y - 2}" width="6" height="4" rx="0.5" fill="none" stroke="currentColor" stroke-width="1.2"/>`;
const link = (x1: number, y1: number, x2: number, y2: number) =>
	`<path d="M${x1} ${y1}L${x2} ${y2}" stroke="currentColor" stroke-width="1"/>`;
const PREVIEWS: Record<VisioLayoutStyle, string> = {
	'flowchart-tb':
		box(12, 4) + box(12, 12) + box(12, 20) + link(12, 6, 12, 10) + link(12, 14, 12, 18),
	'flowchart-lr':
		box(4, 12) + box(12, 12) + box(20, 12) + link(7, 12, 9, 12) + link(15, 12, 17, 12),
	hierarchy: box(12, 5) + box(5, 18) + box(19, 18) + link(12, 7, 5, 16) + link(12, 7, 19, 16),
	'compact-tree':
		box(6, 4) +
		box(12, 12) +
		box(12, 20) +
		link(6, 6, 6, 20) +
		link(6, 12, 9, 12) +
		link(6, 20, 9, 20),
	circular:
		box(12, 4) +
		box(20, 12) +
		box(12, 20) +
		box(4, 12) +
		`<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="0.8" stroke-dasharray="2 2"/>`,
};
const preview = (style: VisioLayoutStyle) =>
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${PREVIEWS[style]}</svg>`;

export function reLayoutState(reason: string | undefined): OfficeGalleryState {
	return {
		id: 're-layout',
		label: LABEL,
		disabled: reason !== undefined,
		sections: [
			{
				title: 'Layout',
				columns: 5,
				tileWidth: 44,
				tileHeight: 44,
				items: VISIO_LAYOUT_STYLES.map((style) => ({
					id: style,
					label: VISIO_LAYOUT_LABELS[style],
					preview: preview(style),
				})),
			},
		],
	};
}

/**
 * Design > Layout > Re-Layout Page: a shared `office-ui-gallery` of the automatic layouts. A pick
 * raises `{ type: 're-layout', style }`; the viewer keeps availability in step with the drawing.
 */
export function reLayoutGallery(doc: Document): OfficeUiGallery {
	const gallery = doc.createElement('office-ui-gallery') as OfficeUiGallery;
	gallery.setAttribute('command', 're-layout');
	gallery.setAttribute('label', LABEL);
	gallery.setAttribute('icon', 'position');
	gallery.dataset.menu = 're-layout';
	gallery.addEventListener('office-gallery-pick', (event) => {
		event.stopPropagation();
		const style = (event as OfficeGalleryPickEvent).detail.itemId as VisioLayoutStyle;
		if (VISIO_LAYOUT_STYLES.includes(style))
			emitRibbonAction(gallery, { type: 're-layout', style });
	});
	syncReLayout(gallery, INITIAL_REASON);
	return gallery;
}

/** Design > Layout with Visio's dialog launcher (the Layout dialog; synced by ViewerLayout). */
export function layoutGroup(doc: Document, children: readonly HTMLElement[]): HTMLElement {
	const el = doc.createElement('office-ui-ribbon-group');
	el.setAttribute('label', 'Layout');
	el.setAttribute('launcher', 'layout-dialog');
	el.setAttribute('launcher-label', 'Layout options');
	el.setAttribute('launcher-disabled', '');
	el.title = 'Layout options: open a .vsdx file to lay out its shapes.';
	el.append(...children);
	return el;
}

/** Enable the gallery, or disable it with the reason as its tooltip. */
export function syncReLayout(gallery: OfficeUiGallery, reason: string | undefined): void {
	const title =
		reason === undefined
			? `${LABEL}: lay out the selection, or the whole page, from its connectors.`
			: `${LABEL}: ${reason}`;
	gallery.state = reLayoutState(reason);
	gallery.toggleAttribute('disabled', reason !== undefined);
	gallery.setAttribute('title', title);
	gallery.querySelector<HTMLButtonElement>('.trigger')?.setAttribute('title', title);
}
