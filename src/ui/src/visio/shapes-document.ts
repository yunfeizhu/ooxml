import { visioBuiltInStencil, type VisioDocument, type VisioMaster } from 'ooxml-core/visio';
import {
	visioMasterDropRefusal,
	visioMasterDropSize,
	visioMasterPreviewBox,
} from 'ooxml-core/visio/ui';
import { renderPage } from './render-svg';
import type { Master } from './stencil-catalog';

/** The stencil of the drawing's own masters, as Visio's Document Stencil. */
export const DOCUMENT_STENCIL_ID = 'document';
export const DOCUMENT_STENCIL_NAME = 'Document Stencil';
/** `data-master` and drag payload prefix of a document master; the rest is the master ID. */
export const DOCUMENT_MASTER_PREFIX = 'document:';
/** Masters drawn in the Shapes window; a drawing with more lists the first ones. */
export const DOCUMENT_MASTER_LIMIT = 200;

/** What the Shapes window shows for one drawing. */
export interface ShapesDocument {
	/** Changes when the list has to be drawn again. */
	key: string;
	/** The document stencil's masters; empty when the drawing has none. */
	masters: readonly Master[];
	/** Built-in stencils the drawing docks (its Stencil windows), in window order. */
	docked: readonly string[];
	/** Docked stencil files with no built-in counterpart, by file name: listed, not openable. */
	unavailable: readonly string[];
	/** Masters beyond `DOCUMENT_MASTER_LIMIT` that are not listed. */
	omitted: number;
}

export const EMPTY_SHAPES_DOCUMENT: ShapesDocument = {
	key: '',
	masters: [],
	docked: [],
	unavailable: [],
	omitted: 0,
};

/** The drawing's master for a `document:<id>` master id. */
export function documentMaster(
	model: VisioDocument | null | undefined,
	id: string,
): VisioMaster | undefined {
	if (!id.startsWith(DOCUMENT_MASTER_PREFIX)) return undefined;
	const masterId = id.slice(DOCUMENT_MASTER_PREFIX.length);
	return model?.masters?.find((master) => master.id === masterId);
}

/**
 * The master drawn alone, cropped to its shapes: the page renderer over a page that holds only
 * the master, without its text, as Visio's stencil icons are. Nothing when it cannot be drawn.
 */
function preview(master: VisioMaster): SVGSVGElement | undefined {
	if (!master.shapes.length) return undefined;
	const page = {
		id: `master-${master.id}`,
		name: master.name,
		width: master.width,
		height: master.height,
		isBackground: false,
		shapes: master.shapes,
		connectors: [],
	};
	try {
		const { svg } = renderPage({ format: 'vsdx', pages: [page], diagnostics: [] }, page, {
			interactive: false,
		});
		for (const node of svg.querySelectorAll('title, text, foreignObject')) node.remove();
		const box = visioMasterPreviewBox(master);
		// A square view with a little room for the outline, y down as SVG is.
		const side = Math.max(box.width, box.height) * 1.12;
		const x = box.x + box.width / 2 - side / 2;
		const y = master.height - (box.y + box.height / 2) - side / 2;
		svg.setAttribute('viewBox', `${x} ${y} ${side} ${side}`);
		svg.removeAttribute('role');
		svg.removeAttribute('aria-label');
		svg.setAttribute('aria-hidden', 'true');
		svg.setAttribute('class', 'master-preview');
		return svg;
	} catch {
		return undefined;
	}
}

/** The Shapes window content of a drawing: its document stencil and the stencils it docks. */
export function shapesDocument(model: VisioDocument | null | undefined): ShapesDocument {
	const all = model?.masters ?? [];
	const listed = all.slice(0, DOCUMENT_MASTER_LIMIT);
	const docked = [
		...new Set(
			(model?.stencils ?? []).flatMap((file) => {
				const id = visioBuiltInStencil(file);
				return id ? [id] : [];
			}),
		),
	];
	const unavailable = [
		...new Set((model?.stencils ?? []).filter((file) => !visioBuiltInStencil(file))),
	];
	if (!listed.length && !docked.length && !unavailable.length) return EMPTY_SHAPES_DOCUMENT;
	return {
		key: JSON.stringify([docked, unavailable, listed.map((master) => [master.id, master.name])]),
		docked,
		unavailable,
		omitted: all.length - listed.length,
		masters: listed.map((master) => {
			const unsupported = visioMasterDropRefusal(master);
			return {
				id: `${DOCUMENT_MASTER_PREFIX}${master.id}`,
				name: master.name,
				// A plain box until the preview is drawn, and when the master has none.
				path: 'M4 6h16v12H4Z',
				size: visioMasterDropSize(master),
				draw: () => preview(master),
				...(unsupported ? { unsupported } : {}),
			};
		}),
	};
}

/** The Shapes window section of a docked stencil file that has no built-in stand-in. */
export function unavailableStencil(doc: Document, file: string): HTMLElement {
	const section = doc.createElement('section');
	section.dataset.stencilFile = file;
	section.dataset.unavailable = '';
	section.setAttribute('aria-label', file);
	const header = doc.createElement('div');
	header.className = 'stencil-header';
	const title = doc.createElement('span');
	title.className = 'stencil-title';
	title.textContent = file;
	header.append(title);
	const note = doc.createElement('p');
	note.className = 'shapes-empty';
	note.textContent =
		'This stencil file is not available here. Its shapes already used in the drawing are in the Document Stencil.';
	section.append(header, note);
	return section;
}
