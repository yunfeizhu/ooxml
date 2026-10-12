/**
 * Ribbon overflow for ribbons built from `office-ui-ribbon-group` elements: when the visible tab
 * panel is narrower than its groups, the groups collapse from the right, each into the one button
 * the group element already draws (`data-collapsed`), and that button opens the group's commands
 * in a popup (`data-open`). This is what Office does when a window narrows; the panel scrolls only
 * when even the collapsed groups do not fit.
 *
 * `createRibbonOverflow` (overflow.ts) does the same for ribbons made of plain `.ribbon-group`
 * elements (Word, Excel) by moving their controls; here the controls never leave the group, so
 * the product's own listeners and state hooks keep working.
 */

export interface RibbonGroupOverflowOptions {
	/** The registered icon of a collapsed group (by element); the group's `icon` attribute wins. */
	icon?(group: HTMLElement): string | undefined;
	/** Below this window width nothing collapses (a product's phone layout takes over). */
	minWidth?: number;
}

export interface RibbonGroupOverflow {
	/** Re-measures the visible panel now (after a tab switch or new tabs). */
	refit(): void;
	/** Closes the open group popup. */
	close(): void;
	destroy(): void;
}

const GROUP = 'office-ui-ribbon-group';
const TOGGLE = 'office-ribbon-collapse-toggle';

const panelsOf = (ribbon: HTMLElement): HTMLElement[] =>
	[...ribbon.children].filter(
		(child): child is HTMLElement => child instanceof HTMLElement && !!child.dataset.ribbonTab,
	);

/** The outermost groups of a panel that take part in layout, in document order. */
const groupsOf = (panel: HTMLElement): HTMLElement[] =>
	[...panel.querySelectorAll<HTMLElement>(GROUP)].filter(
		(group) =>
			group.parentElement?.closest(GROUP) === null && group.getBoundingClientRect().width > 0,
	);

const faceOf = (group: HTMLElement): HTMLElement | null =>
	group.shadowRoot?.querySelector<HTMLElement>('.face') ?? null;

/**
 * Collapses groups of `panel` from the right until it no longer overflows. Returns the labels of
 * the collapsed groups, rightmost first.
 */
export function fitRibbonGroups(
	panel: HTMLElement,
	options: RibbonGroupOverflowOptions = {},
): string[] {
	for (const group of panel.querySelectorAll<HTMLElement>(`${GROUP}[data-collapsed]`)) {
		group.removeAttribute('data-open');
		group.removeAttribute('data-collapsed');
	}
	const width = panel.ownerDocument.defaultView?.innerWidth ?? Number.POSITIVE_INFINITY;
	if (panel.hidden || width < (options.minWidth ?? 0)) return [];
	const overflows = () => panel.scrollWidth - panel.clientWidth > 1;
	const collapsed: string[] = [];
	if (!overflows()) return collapsed;
	for (const group of groupsOf(panel).reverse()) {
		const icon = group.getAttribute('icon') ?? options.icon?.(group);
		if (icon) group.setAttribute('icon', icon);
		group.setAttribute('data-collapsed', '');
		collapsed.push(group.getAttribute('label') ?? '');
		if (!overflows()) break;
	}
	return collapsed;
}

/** Puts an open group's popup under its button, inside the window. */
function place(group: HTMLElement): void {
	const face = faceOf(group);
	if (!face) return;
	const rect = face.getBoundingClientRect();
	const view = group.ownerDocument.defaultView;
	const width = view?.innerWidth ?? 1024;
	group.style.setProperty('--office-ribbon-collapse-y', `${Math.round(rect.bottom + 2)}px`);
	group.style.setProperty('--office-ribbon-collapse-x', `${Math.round(rect.left)}px`);
	// The popup's width is only known once it shows.
	const popup = group.shadowRoot?.querySelector<HTMLElement>('.row')?.getBoundingClientRect();
	const left = Math.max(4, Math.min(rect.left, width - (popup?.width ?? 0) - 8));
	group.style.setProperty('--office-ribbon-collapse-x', `${Math.round(left)}px`);
}

/**
 * Keeps the visible panel of `ribbon` (an `office-ui-ribbon`) fitted as the ribbon resizes, the
 * tab changes and panels are added, and owns which collapsed group is open: a press on a
 * collapsed group's button toggles its popup; Escape, a click elsewhere or a command chosen in
 * the popup closes it.
 */
export function attachRibbonGroupOverflow(
	ribbon: HTMLElement,
	options: RibbonGroupOverflowOptions = {},
): RibbonGroupOverflow {
	const doc = ribbon.ownerDocument;
	const view = doc.defaultView;
	let frame = 0;
	let fitted = -1;
	const openGroup = () => ribbon.querySelector<HTMLElement>(`${GROUP}[data-open]`);
	const close = () => {
		for (const group of ribbon.querySelectorAll<HTMLElement>(`${GROUP}[data-open]`))
			group.removeAttribute('data-open');
	};
	const visible = () => panelsOf(ribbon).find((panel) => !panel.hidden);
	const refit = () => {
		const panel = visible();
		// Every panel is restored, so a hidden one never keeps a stale collapsed group.
		for (const other of panelsOf(ribbon)) if (other !== panel) fitRibbonGroups(other, options);
		fitted = panel?.clientWidth ?? -1;
		if (panel) fitRibbonGroups(panel, options);
	};
	/** `force`: the groups changed (tab switch, new tabs), so even an open popup is rebuilt. */
	const schedule = (force: boolean) => {
		if (!force && openGroup() && fitted === visible()?.clientWidth) return;
		if (frame || !view) return;
		frame = view.requestAnimationFrame(() => {
			frame = 0;
			refit();
			watch();
		});
	};
	let watch = () => {};
	const toggle = (event: Event) => {
		const group = event
			.composedPath()
			.find((node): node is HTMLElement => node instanceof HTMLElement && node.localName === GROUP);
		if (!group?.hasAttribute('data-collapsed')) return;
		const wasOpen = group.hasAttribute('data-open');
		close();
		if (wasOpen) return;
		group.setAttribute('data-open', '');
		place(group);
	};
	/** A menu or gallery of the open group is showing its own popup, which goes first. */
	const nested = (group: HTMLElement) =>
		[...group.querySelectorAll<HTMLElement & { open?: unknown }>('*')].some(
			(el) => el.localName.startsWith('office-ui-') && el.open === true,
		);
	const outside = (event: Event) => {
		const open = openGroup();
		if (open && !event.composedPath().includes(open) && !nested(open)) close();
	};
	const escape = (event: KeyboardEvent) => {
		const open = openGroup();
		if (event.key !== 'Escape' || !open || nested(open)) return;
		event.stopPropagation();
		close();
		faceOf(open)?.focus();
	};
	/** A chosen command ends the popup; opening a menu or a gallery inside it does not. */
	const command = (event: Event) => {
		const open = openGroup();
		if (open && event.composedPath().includes(open)) queueMicrotask(close);
	};
	const onSelect = () => schedule(true);
	const resize =
		view && 'ResizeObserver' in view ? new view.ResizeObserver(() => schedule(false)) : undefined;
	// A panel added, removed or shown (a tab chosen in code) changes which groups are measured.
	const mutation =
		view && 'MutationObserver' in view
			? new view.MutationObserver(() => schedule(true))
			: undefined;
	resize?.observe(ribbon);
	watch = () => {
		mutation?.disconnect();
		mutation?.observe(ribbon, { childList: true });
		for (const panel of panelsOf(ribbon))
			mutation?.observe(panel, { attributes: true, attributeFilter: ['hidden'] });
	};
	watch();
	ribbon.addEventListener(TOGGLE, toggle);
	// Capture: a product may stop a command at its own element.
	ribbon.addEventListener('office-command', command, true);
	ribbon.addEventListener('office-ribbon-select', onSelect);
	doc.addEventListener('pointerdown', outside, true);
	doc.addEventListener('keydown', escape, true);
	schedule(true);
	return {
		refit,
		close,
		destroy() {
			if (frame) view?.cancelAnimationFrame(frame);
			frame = 0;
			resize?.disconnect();
			mutation?.disconnect();
			ribbon.removeEventListener(TOGGLE, toggle);
			ribbon.removeEventListener('office-command', command, true);
			ribbon.removeEventListener('office-ribbon-select', onSelect);
			doc.removeEventListener('pointerdown', outside, true);
			doc.removeEventListener('keydown', escape, true);
			for (const panel of panelsOf(ribbon)) {
				for (const group of panel.querySelectorAll<HTMLElement>(`${GROUP}[data-collapsed]`)) {
					group.removeAttribute('data-open');
					group.removeAttribute('data-collapsed');
				}
			}
		},
	};
}
