import { isVisioChangeShapeTarget } from 'ooxml-core/visio';
import type {
	OfficeGalleryPickEvent,
	OfficeGalleryState,
	OfficeUiGallery,
} from '../ribbon/gallery';
import { emitRibbonAction } from './ribbon-action';
import { DOCUMENT_MASTER_PREFIX, DOCUMENT_STENCIL_NAME } from './shapes-document';
import { BASIC_SHAPES } from './shapes-window';

const LABEL = 'Change Shape';
/** The reason shown before a document is open; the viewer replaces it per selection. */
const INITIAL_REASON = 'Select one shape to change.';

/** Static application markup: the Shapes window's preview outlines, drawn as tiles. */
const preview = (path: string) =>
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${path}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`;

/** A master of the drawing a stencil shape can change to; `preview` is its drawn SVG markup. */
export interface ChangeShapeMaster {
	id: string;
	name: string;
	preview?: string;
}

/**
 * Gallery state: the Basic Shapes for a shape drawn here; for a stencil shape the other masters
 * of the Document Stencil (`masters`) and, when `builtIn` allows, the Basic Shapes too (the shape
 * then becomes an instance of that built-in master). `reason` disables every tile and names why.
 */
export function changeShapeState(
	reason: string | undefined,
	masters?: readonly ChangeShapeMaster[],
	builtIn = !masters?.length,
): OfficeGalleryState {
	const size = { columns: 6, tileWidth: 32, tileHeight: 32 };
	return {
		id: 'change-shape',
		label: LABEL,
		disabled: reason !== undefined,
		sections: [
			...(masters?.length
				? [
						{
							title: DOCUMENT_STENCIL_NAME,
							...size,
							items: masters.map((master) => ({
								id: `${DOCUMENT_MASTER_PREFIX}${master.id}`,
								label: master.name,
								preview: master.preview ?? preview('M4 6h16v12H4Z'),
							})),
						},
					]
				: []),
			...(builtIn
				? [
						{
							title: 'Basic Shapes',
							...size,
							items: BASIC_SHAPES.map((master) => ({
								id: master.id,
								label: master.name,
								preview: preview(master.path),
							})),
						},
					]
				: []),
		],
	};
}

/**
 * Home > Editing > Change Shape: the shared `office-ui-gallery`. A pick raises
 * `{ type: 'change-shape', shape }`, where `shape` is a Basic Shapes outline or `document:<id>`
 * for a master of the drawing; the viewer keeps the tiles, `disabled` and the trigger's tooltip
 * in step with the selection (`syncChangeShape`).
 */
export function changeShapeGallery(doc: Document): OfficeUiGallery {
	const gallery = doc.createElement('office-ui-gallery') as OfficeUiGallery;
	gallery.setAttribute('command', 'change-shape');
	gallery.setAttribute('label', LABEL);
	gallery.setAttribute('icon', 'visioChangeShape');
	gallery.dataset.menu = 'change-shape';
	gallery.addEventListener('office-gallery-pick', (event) => {
		event.stopPropagation();
		const shape = (event as OfficeGalleryPickEvent).detail.itemId;
		if (isVisioChangeShapeTarget(shape)) emitRibbonAction(gallery, { type: 'change-shape', shape });
		else if (shape.startsWith(DOCUMENT_MASTER_PREFIX))
			emitRibbonAction(gallery, {
				type: 'change-shape',
				shape: shape as `${typeof DOCUMENT_MASTER_PREFIX}${string}`,
			});
	});
	syncChangeShape(gallery, INITIAL_REASON);
	return gallery;
}

/** Enable the gallery, or disable it with the reason as its tooltip (as unsupported commands do). */
export function syncChangeShape(
	gallery: OfficeUiGallery,
	reason: string | undefined,
	masters?: readonly ChangeShapeMaster[],
	builtIn?: boolean,
): void {
	gallery.state = changeShapeState(reason, masters, builtIn);
	gallery.toggleAttribute('disabled', reason !== undefined);
	const title = reason === undefined ? LABEL : `${LABEL}: ${reason}`;
	gallery.setAttribute('title', title);
	// The trigger renders once the element is connected; its own title wins over the host's.
	const trigger = gallery.querySelector<HTMLButtonElement>('.trigger');
	trigger?.setAttribute('title', title);
	if (trigger && gallery.dataset.triggerKeytip)
		trigger.dataset.keytip = gallery.dataset.triggerKeytip;
}
