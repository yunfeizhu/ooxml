import {
	BASIC_STENCIL_ID,
	STENCILS,
	findMaster,
	type Master,
	type Stencil,
} from './stencil-catalog';
import {
	DOCUMENT_MASTER_LIMIT,
	DOCUMENT_STENCIL_ID,
	DOCUMENT_STENCIL_NAME,
	EMPTY_SHAPES_DOCUMENT,
	unavailableStencil,
	type ShapesDocument,
} from './shapes-document';
import { loadShapes as load, saveShapes as save } from './shapes-storage';
export { SHAPES_STORAGE_KEY, currentQuickShapes } from './shapes-storage';

/** The Stencils view of one Shapes window. */
export interface StencilsView {
	/** The More Shapes and master menus; the caller puts them on the pane. */
	menus: HTMLElement[];
	/**
	 * Show a drawing's document stencil and the stencils it docks; a no-op for the same content.
	 * `opened` is false after an edit of the drawing that is showing: folded and unfolded stencils
	 * stay as the user has them, and a Document Stencil that appears then starts folded.
	 */
	setDocument(next: ShapesDocument, opened?: boolean): void;
}

/** Visio shows a stencil's first masters as its Quick Shapes until the user changes them. */
const DEFAULT_QUICK = 4;
/** Undefined until the shared menu element is registered. */
type Menu = HTMLElement & { openAt?(x: number, y: number): void };

/** One master button: drag it onto the page, or activate it to add it at the page centre. */
export function masterButton(doc: Document, master: Master): HTMLLIElement {
	const item = doc.createElement('li');
	item.dataset.name = master.name;
	const button = doc.createElement('button');
	button.type = 'button';
	button.className = 'master';
	button.dataset.master = master.id;
	let svg = master.draw?.();
	if (!svg) {
		svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('viewBox', '0 0 24 24');
		svg.setAttribute('aria-hidden', 'true');
		const outline = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
		outline.setAttribute('d', master.path);
		svg.append(outline);
	}
	const label = doc.createElement('span');
	label.textContent = master.name;
	button.append(svg, label);
	if (master.unsupported) {
		// Listed as Visio lists it, but not offered: the reason is the tooltip.
		button.dataset.unsupported = '';
		button.setAttribute('aria-disabled', 'true');
		button.title = `${master.name}: ${master.unsupported}`;
	} else {
		button.draggable = true;
		button.title = `${master.name}: drag onto the page, or press Enter to add it at the centre.`;
	}
	item.append(button);
	return item;
}
export function masterList(doc: Document, masters: readonly Master[]): HTMLUListElement {
	const list = doc.createElement('ul');
	list.className = 'masters';
	list.append(...masters.map((master) => masterButton(doc, master)));
	return list;
}
function menuItem(doc: Document, command: string, label: string, checked?: boolean): HTMLElement {
	const item = doc.createElement('office-ui-menu-item');
	item.setAttribute('command', command);
	item.setAttribute('label', label);
	if (checked !== undefined) item.setAttribute('checked', String(checked));
	return item;
}

function unsupportedItem(item: HTMLElement, reason: string): HTMLElement {
	item.setAttribute('disabled', '');
	item.dataset.unsupported = '';
	item.setAttribute('title', reason);
	return item;
}

/**
 * The Stencils view below the view tabs: More Shapes (a menu of the built-in stencils), Quick
 * Shapes (favourites across the open stencils) and one collapsible section per open stencil.
 * A drawing's own masters come first as its Document Stencil, then the stencils the drawing docks,
 * then Basic Shapes and the stencils the user opened. The first of the drawing's stencils is the
 * one showing, as in Visio; the others start folded. Opened stencils and Quick Shapes persist per
 * viewer in localStorage; what a drawing docks is not persisted.
 */
export function buildStencilsView(
	doc: Document,
	panel: HTMLElement,
	pane: HTMLElement,
): StencilsView {
	const saved = load(doc);
	let drawing: ShapesDocument = EMPTY_SHAPES_DOCUMENT;
	/** Docked stencils the user has not closed in this session. */
	let docked: string[] = [];
	const collapsed = new Set<string>();
	const row = (id: string, label: string) => {
		const button = doc.createElement('button');
		button.type = 'button';
		button.id = id;
		button.className = 'shapes-row';
		button.textContent = label;
		return button;
	};
	const more = row('shapes-more', 'More Shapes');
	more.setAttribute('aria-haspopup', 'menu');
	more.title = 'More Shapes: open another stencil.';
	const quickToggle = row('shapes-quick-toggle', 'Quick Shapes');
	quickToggle.setAttribute('aria-expanded', 'false');
	quickToggle.setAttribute('aria-controls', 'shapes-quick');
	quickToggle.title = 'Quick Shapes: favourite masters of every open stencil.';
	const quick = doc.createElement('div');
	quick.id = 'shapes-quick';
	quick.hidden = true;
	const sections = doc.createElement('div');
	sections.id = 'shapes-sections';

	const moreMenu = doc.createElement('office-ui-context-menu') as Menu;
	moreMenu.dataset.shapesMenu = 'more';
	moreMenu.setAttribute('label', 'More Shapes');
	const masterMenu = doc.createElement('office-ui-context-menu') as Menu;
	masterMenu.dataset.shapesMenu = 'master';
	masterMenu.setAttribute('label', 'Master');
	let menuMaster: string | undefined;

	const openIds = () => [...new Set([...docked, BASIC_STENCIL_ID, ...saved.open])];
	const sectionIds = () => [...(drawing.masters.length ? [DOCUMENT_STENCIL_ID] : []), ...openIds()];
	const quickIds = (stencil: Stencil) =>
		saved.quick[stencil.id] ?? stencil.masters.slice(0, DEFAULT_QUICK).map((master) => master.id);
	const renderQuick = () => {
		if (quick.hidden) return quick.replaceChildren();
		const masters = [
			// The drawing's own masters lead, as its Document Stencil leads the stencils.
			...drawing.masters.filter((master) => !master.unsupported).slice(0, DEFAULT_QUICK),
			...openIds()
				.map((id) => STENCILS.find((stencil) => stencil.id === id)!)
				.flatMap((stencil) => quickIds(stencil).map((id) => findMaster(id)!.master)),
		];
		const empty = doc.createElement('p');
		empty.className = 'shapes-empty';
		empty.textContent = 'No Quick Shapes. Right-click a master to add it.';
		quick.replaceChildren(masters.length ? masterList(doc, masters) : empty);
	};
	const renderSections = () => {
		sections.replaceChildren(
			...sectionIds().map((id) => {
				const stencil: Stencil =
					id === DOCUMENT_STENCIL_ID
						? { id, name: DOCUMENT_STENCIL_NAME, masters: drawing.masters }
						: STENCILS.find((candidate) => candidate.id === id)!;
				const section = doc.createElement('section');
				section.dataset.stencil = id;
				section.setAttribute('aria-label', stencil.name);
				const header = doc.createElement('div');
				header.className = 'stencil-header';
				const title = doc.createElement('button');
				title.type = 'button';
				title.className = 'stencil-title';
				title.textContent = stencil.name;
				const list = masterList(doc, stencil.masters);
				list.id = `stencil-${id}-masters`;
				title.setAttribute('aria-controls', list.id);
				const open = !collapsed.has(id);
				title.setAttribute('aria-expanded', String(open));
				list.hidden = !open;
				if (!open) section.dataset.collapsed = '';
				header.append(title);
				if (id !== BASIC_STENCIL_ID && id !== DOCUMENT_STENCIL_ID) {
					const close = doc.createElement('button');
					close.type = 'button';
					close.className = 'stencil-close';
					close.dataset.closeStencil = id;
					close.setAttribute('aria-label', `Close ${stencil.name}`);
					close.title = `Close ${stencil.name}`;
					close.textContent = '×';
					header.append(close);
				}
				section.append(header, list);
				if (id === DOCUMENT_STENCIL_ID && drawing.omitted) {
					const note = doc.createElement('p');
					note.className = 'shapes-empty';
					note.hidden = !open;
					note.textContent = `Showing the first ${DOCUMENT_MASTER_LIMIT} masters; ${drawing.omitted} more are not listed.`;
					section.append(note);
				}
				return section;
			}),
			// Stencil files this viewer cannot open are still named, as Visio lists them.
			...drawing.unavailable.map((file) => unavailableStencil(doc, file)),
		);
	};
	const renderMenu = () =>
		moreMenu.replaceChildren(
			...STENCILS.filter((stencil) => stencil.id !== BASIC_STENCIL_ID).map((stencil) =>
				menuItem(doc, `stencil:${stencil.id}`, stencil.name, openIds().includes(stencil.id)),
			),
			doc.createElement('office-ui-menu-separator'),
			unsupportedItem(
				menuItem(doc, 'open-stencil-file', 'Open Stencil...'),
				'Open Stencil: stencil files (.vssx, .vss) are not supported.',
			),
		);
	const render = () => {
		renderMenu();
		renderSections();
		renderQuick();
	};
	const toggleStencil = (id: string) => {
		if (openIds().includes(id)) {
			docked = docked.filter((candidate) => candidate !== id);
			saved.open = saved.open.filter((candidate) => candidate !== id);
		} else saved.open = [...saved.open, id];
		collapsed.delete(id);
		save(doc, saved);
		render();
	};

	more.addEventListener('click', () => {
		const box = more.getBoundingClientRect();
		moreMenu.openAt?.(box.left, box.bottom);
	});
	moreMenu.addEventListener('office-command', (event) => {
		event.stopPropagation();
		const command = (event as CustomEvent<{ command: string }>).detail.command;
		if (command.startsWith('stencil:')) toggleStencil(command.slice('stencil:'.length));
	});
	quickToggle.addEventListener('click', () => {
		quick.hidden = !quick.hidden;
		quickToggle.setAttribute('aria-expanded', String(!quick.hidden));
		renderQuick();
	});
	sections.addEventListener('click', (event) => {
		const target = event.target as Element;
		const close = target.closest<HTMLElement>('[data-close-stencil]');
		if (close) return toggleStencil(close.dataset.closeStencil!);
		const title = target.closest<HTMLElement>('.stencil-title');
		if (!title) return;
		const section = title.closest<HTMLElement>('[data-stencil]')!;
		const open = title.getAttribute('aria-expanded') !== 'true';
		title.setAttribute('aria-expanded', String(open));
		section.querySelector<HTMLElement>('.masters')!.hidden = !open;
		const note = section.querySelector<HTMLElement>('.shapes-empty');
		if (note) note.hidden = !open;
		section.toggleAttribute('data-collapsed', !open);
		if (open) collapsed.delete(section.dataset.stencil!);
		else collapsed.add(section.dataset.stencil!);
	});
	pane.addEventListener('contextmenu', (event) => {
		const button = (event.target as Element).closest?.<HTMLElement>('[data-master]');
		const found = button && findMaster(button.dataset.master!);
		if (!found) return;
		event.preventDefault();
		menuMaster = found.master.id;
		const added = quickIds(found.stencil).includes(menuMaster);
		masterMenu.replaceChildren(
			menuItem(doc, 'quick-shapes', added ? 'Remove from Quick Shapes' : 'Add to Quick Shapes'),
		);
		masterMenu.openAt?.(event.clientX, event.clientY);
	});
	masterMenu.addEventListener('office-command', (event) => {
		event.stopPropagation();
		const found = menuMaster && findMaster(menuMaster);
		if (!found) return;
		const ids = quickIds(found.stencil);
		saved.quick[found.stencil.id] = ids.includes(found.master.id)
			? ids.filter((id) => id !== found.master.id)
			: [...ids, found.master.id];
		save(doc, saved);
		renderQuick();
	});
	render();
	panel.append(more, quickToggle, quick, sections);
	return {
		// The caller puts the menus on the pane, so they open from the Search view too.
		menus: [moreMenu, masterMenu],
		setDocument(next, opened = true) {
			// An opened drawing always starts from its own stencils, even when it lists what the
			// last one did (two drawings without masters or docked stencils).
			if (next.key === drawing.key && !opened) return;
			if (!opened) {
				// The first shape dropped in a new drawing gives it a Document Stencil: it is listed,
				// folded, and the stencil the user is working from stays open.
				const listed = new Set(sectionIds());
				drawing = next;
				for (const id of sectionIds()) if (!listed.has(id)) collapsed.add(id);
				return render();
			}
			drawing = next;
			docked = next.docked.filter((id) => STENCILS.some((stencil) => stencil.id === id));
			// The stencil the drawing docks is the one showing, as in Visio, where the Document Stencil
			// stays out of the way; a drawing that docks none of ours shows its own masters.
			const showing = docked[0] ?? (next.masters.length ? DOCUMENT_STENCIL_ID : undefined);
			collapsed.clear();
			if (showing) for (const id of sectionIds()) if (id !== showing) collapsed.add(id);
			render();
		},
	};
}
