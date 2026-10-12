import {
	VISIO_CALLOUT_STYLES,
	VISIO_CONTAINER_STYLES,
	type VisioCalloutStyle,
	type VisioContainerStyle,
} from 'ooxml-core/visio';
import type {
	OfficeGalleryPickEvent,
	OfficeGalleryState,
	OfficeUiGallery,
} from '../ribbon/gallery';
import { emitRibbonAction } from './ribbon-action';

export type DiagramPart = 'container' | 'callout';
const LABELS: Record<DiagramPart, string> = { container: 'Container', callout: 'Callout' };
const ICONS: Record<DiagramPart, string> = { container: 'rectangle', callout: 'message' };
export const CONTAINER_STYLE_NAMES: Record<VisioContainerStyle, string> = {
	classic: 'Classic',
	plain: 'Plain',
	banner: 'Banner',
	dashed: 'Dashed',
};
export const CALLOUT_STYLE_NAMES: Record<VisioCalloutStyle, string> = {
	rectangle: 'Rectangle',
	rounded: 'Rounded',
	oval: 'Oval',
	text: 'Text only',
};

/** Static application markup for the gallery tiles (no document content). */
const svg = (body: string) =>
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 32" fill="none" stroke="currentColor" stroke-width="1.2">${body}</svg>`;
const CONTAINER_PREVIEWS: Record<VisioContainerStyle, string> = {
	classic: svg(
		'<rect x="3" y="4" width="34" height="24" fill="currentColor" fill-opacity=".08"/><path d="M3 10h34"/><path d="M6 7.5h10" stroke-width="1.6"/>',
	),
	plain: svg('<rect x="3" y="4" width="34" height="24"/><path d="M6 7.5h10" stroke-width="1.6"/>'),
	banner: svg(
		'<rect x="3" y="4" width="34" height="24"/><rect x="3" y="4" width="34" height="6" fill="currentColor" fill-opacity=".3"/>',
	),
	dashed: svg(
		'<rect x="3" y="4" width="34" height="24" stroke-dasharray="3 2"/><path d="M6 7.5h10" stroke-width="1.6"/>',
	),
};
const CALLOUT_PREVIEWS: Record<VisioCalloutStyle, string> = {
	rectangle: svg('<rect x="14" y="3" width="23" height="12"/><path d="M14 15 5 28"/>'),
	rounded: svg('<rect x="14" y="3" width="23" height="12" rx="4"/><path d="M16 15 5 28"/>'),
	oval: svg('<ellipse cx="25.5" cy="9" rx="11.5" ry="6"/><path d="M18 14 5 28"/>'),
	text: svg('<path d="M17 7h16M17 11h11" stroke-width="1.6"/><path d="M15 14 5 28"/>'),
};

/** Gallery state for a diagram part; `reason` disables every tile and names why. */
export function diagramPartState(
	part: DiagramPart,
	reason: string | undefined,
): OfficeGalleryState {
	const items =
		part === 'container'
			? VISIO_CONTAINER_STYLES.map((style) => ({
					id: style,
					label: CONTAINER_STYLE_NAMES[style],
					preview: CONTAINER_PREVIEWS[style],
				}))
			: VISIO_CALLOUT_STYLES.map((style) => ({
					id: style,
					label: CALLOUT_STYLE_NAMES[style],
					preview: CALLOUT_PREVIEWS[style],
				}));
	return {
		id: part,
		label: LABELS[part],
		disabled: reason !== undefined,
		sections: [{ columns: 4, tileWidth: 48, tileHeight: 40, items }],
	};
}

/**
 * Insert > Diagram Parts > Container or Callout: the shared `office-ui-gallery` of styles. A pick
 * raises `{ type: 'diagram-part', ... }`; the viewer keeps it enabled per selection.
 */
export function diagramPartGallery(doc: Document, part: DiagramPart): OfficeUiGallery {
	const gallery = doc.createElement('office-ui-gallery') as OfficeUiGallery;
	gallery.setAttribute('command', part);
	gallery.setAttribute('label', LABELS[part]);
	gallery.setAttribute('icon', ICONS[part]);
	gallery.dataset.menu = part;
	gallery.addEventListener('office-gallery-pick', (event) => {
		event.stopPropagation();
		const style = (event as OfficeGalleryPickEvent).detail.itemId;
		if (part === 'container' && (VISIO_CONTAINER_STYLES as readonly string[]).includes(style))
			emitRibbonAction(gallery, {
				type: 'diagram-part',
				part,
				style: style as VisioContainerStyle,
			});
		if (part === 'callout' && (VISIO_CALLOUT_STYLES as readonly string[]).includes(style))
			emitRibbonAction(gallery, { type: 'diagram-part', part, style: style as VisioCalloutStyle });
	});
	syncDiagramPart(gallery, part, 'Open a .vsdx file to insert diagram parts.');
	return gallery;
}

/** Enable the gallery, or disable it with the reason as its tooltip. */
export function syncDiagramPart(
	gallery: OfficeUiGallery,
	part: DiagramPart,
	reason: string | undefined,
): void {
	gallery.state = diagramPartState(part, reason);
	gallery.toggleAttribute('disabled', reason !== undefined);
	const label = LABELS[part];
	const title = reason === undefined ? label : `${label}: ${reason}`;
	gallery.setAttribute('title', title);
	const trigger = gallery.querySelector<HTMLButtonElement>('.trigger');
	trigger?.setAttribute('title', title);
	if (trigger && gallery.dataset.triggerKeytip)
		trigger.dataset.keytip = gallery.dataset.triggerKeytip;
}
