import { buildStencilsView, masterList } from './shapes-sections';
import { STENCILS } from './stencil-catalog';
import type { ShapesDocument } from './shapes-document';

const views = new WeakMap<HTMLElement, (next: ShapesDocument, opened: boolean) => void>();
/**
 * Show a drawing in a Shapes window: its Document Stencil, the stencils it docks, and its masters
 * in Search shapes. Cheap to call again for the same drawing. `opened` is false when the same
 * drawing was only edited, so the stencils the user unfolded stay as they are.
 */
export function setShapesDocument(pane: HTMLElement, next: ShapesDocument, opened = true): void {
	views.get(pane)?.(next, opened);
}
export {
	BASIC_SHAPES,
	findMaster,
	masterCreation,
	type Master,
	type MasterCreation,
} from './stencil-catalog';

/** Drag payload type for a stencil master; the value is the master id. */
export const MASTER_MIME = 'application/x-visio-viewer-master';

/**
 * Visio's Shapes window: the Search shapes box, More Shapes and Quick Shapes rows and the open
 * stencils (`shapes-sections.ts`). Masters are dragged onto the page; Enter adds one at the
 * page centre.
 */
export function createShapesWindow(doc: Document): HTMLElement {
	const pane = doc.createElement('aside');
	pane.id = 'shapes-pane';
	pane.className = 'shapes-pane';
	pane.setAttribute('aria-label', 'Shapes');
	const heading = doc.createElement('div');
	heading.className = 'pane-heading';
	const title = doc.createElement('span');
	title.textContent = 'Shapes';
	const collapse = doc.createElement('button');
	collapse.type = 'button';
	collapse.className = 'pane-collapse';
	collapse.dataset.chrome = 'shapes';
	collapse.setAttribute('aria-label', 'Close Shapes');
	collapse.title = 'Close Shapes';
	collapse.textContent = '‹';
	heading.append(title, collapse);

	// Visio's Search shapes box sits under the title; typing swaps the stencils for the results.
	const box = doc.createElement('div');
	box.className = 'shapes-search-box';
	const field = doc.createElement('input');
	field.type = 'search';
	field.className = 'shapes-search-field';
	field.placeholder = 'Search shapes';
	field.setAttribute('aria-label', 'Search shapes');
	field.setAttribute('aria-controls', 'shapes-search');
	field.autocomplete = 'off';
	const glass = doc.createElement('office-ui-icon');
	glass.setAttribute('name', 'search');
	glass.setAttribute('aria-hidden', 'true');
	box.append(field, glass);

	const stencils = doc.createElement('div');
	stencils.id = 'shapes-stencils';
	const view = buildStencilsView(doc, stencils, pane);

	const search = doc.createElement('div');
	search.id = 'shapes-search';
	search.hidden = true;
	search.setAttribute('role', 'region');
	search.setAttribute('aria-label', 'Search results');
	// Search covers the drawing's masters, Basic Shapes and every built-in stencil, open or not.
	const builtIn = STENCILS.flatMap((stencil) => stencil.masters);
	const results = masterList(doc, builtIn);
	const empty = doc.createElement('p');
	empty.className = 'shapes-empty';
	empty.textContent = 'No shapes match your search.';
	empty.hidden = true;
	const filter = () => {
		const query = field.value.trim().toLowerCase();
		let shown = 0;
		for (const item of results.querySelectorAll<HTMLElement>('li')) {
			item.hidden = !item.dataset.name!.toLowerCase().includes(query);
			if (!item.hidden) shown++;
		}
		empty.hidden = shown > 0;
		search.hidden = !query;
		stencils.hidden = !!query;
	};
	field.addEventListener('input', filter);
	search.append(results, empty);
	pane.append(heading, box, stencils, search, ...view.menus);
	let key = '';
	views.set(pane, (next, opened) => {
		view.setDocument(next, opened);
		if (next.key === key) return;
		key = next.key;
		results.replaceChildren(...masterList(doc, [...next.masters, ...builtIn]).children);
		filter();
	});
	return pane;
}

/** Visio's minimised Shapes window: a narrow strip that reopens the window. */
export function createShapesStrip(doc: Document): HTMLButtonElement {
	const strip = doc.createElement('button');
	strip.type = 'button';
	strip.className = 'shapes-strip';
	strip.dataset.chrome = 'shapes';
	strip.hidden = true;
	strip.setAttribute('aria-label', 'Open Shapes');
	strip.title = 'Open Shapes';
	const arrow = doc.createElement('span');
	arrow.setAttribute('aria-hidden', 'true');
	arrow.textContent = '›';
	const label = doc.createElement('span');
	label.className = 'shapes-strip-label';
	label.textContent = 'Shapes';
	strip.append(arrow, label);
	return strip;
}
