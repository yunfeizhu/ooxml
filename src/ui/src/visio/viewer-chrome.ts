import type { VisioDocument } from 'ooxml-core/visio';
import type { OfficeTab } from '../controls';
import type { ViewerController, ViewerState } from './controller';

/**
 * Static workspace markup (legacy; migrate to builders when next changed). The ribbon, Shapes
 * window, page tabs and status bar are built by their own modules. Visio keeps pages in the
 * bottom tabs and the All pages list, so there is no page pane. The right task pane shows one
 * view at a time (Shape Data, or Format Shape, which builds its own view), and starts closed.
 */
export const viewerChromeTemplate = `<div class="workspace">
  <div class="viewport" tabindex="0" role="region" aria-label="Diagram canvas"></div>
  <office-ui-task-pane id="inspector-pane" class="inspector-pane" label="Shape Data" hidden>
    <section class="shape-inspector" data-pane-view="selection"><p class="selection-hint">No Shape Data</p><div></div></section>
  </office-ui-task-pane>
</div>`;

/** The titles Visio gives the task pane views. */
const PANE_TITLES = { selection: 'Shape Data', format: 'Format Shape' } as const;
export type PaneView = keyof typeof PANE_TITLES;

export type TaskPane = 'shapes' | 'inspector';

/** Presentation state stays local; page navigation uses the same controller as every binding. */
export class ViewerChrome {
	#root: ShadowRoot;
	#controller: ViewerController;
	#document: VisioDocument | null | undefined;
	#pageTabs: HTMLElement & { tabs: OfficeTab[]; selected: string };
	#allPages: HTMLElement & { disabled: boolean };
	#tools: HTMLDetailsElement;
	#inspector: HTMLElement;
	#panes: Record<TaskPane, HTMLElement>;
	#view: PaneView = 'selection';
	#responsive: MediaQueryList | undefined;
	#compact: MediaQueryList | undefined;
	/** Panes the user showed or hid; responsive defaults leave them alone afterwards. */
	#manual = new Set<TaskPane>();
	constructor(root: ShadowRoot, controller: ViewerController) {
		this.#root = root;
		this.#controller = controller;
		this.#pageTabs = root.querySelector('office-ui-tab-strip')!;
		this.#allPages = root.querySelector('[data-menu="all-pages"]')!;
		this.#tools = root.querySelector('.ribbon-tools')!;
		this.#inspector = root.querySelector('.inspector-pane')!;
		this.#panes = { shapes: root.querySelector('.shapes-pane')!, inspector: this.#inspector };
	}
	wire(): () => void {
		const view = this.#root.ownerDocument.defaultView;
		const Abort = view?.AbortController ?? AbortController;
		const events = new Abort(),
			options = { signal: events.signal };
		this.#responsive = view?.matchMedia?.('(max-width: 980px)');
		const compact = view?.matchMedia?.('(max-width: 760px)');
		this.#compact = compact;
		const tools = this.#tools;
		const toolLayout = () => {
			tools.open = !compact?.matches;
		};
		toolLayout();
		compact?.addEventListener('change', toolLayout, options);
		this.#root.addEventListener(
			'keydown',
			(event) => {
				if ((event as KeyboardEvent).key === 'Escape' && compact?.matches && tools.open) {
					event.preventDefault();
					event.stopPropagation();
					tools.open = false;
					tools.querySelector<HTMLElement>('summary')!.focus();
				}
			},
			{ ...options, capture: true },
		);
		const responsive = () => {
			// Visio's default: the Shapes window on wide screens; task panes open on request.
			if (!this.#manual.has('shapes')) this.#setPane('shapes', !this.#responsive?.matches);
			if (!this.#manual.has('inspector')) this.#setPane('inspector', false);
		};
		responsive();
		this.#responsive?.addEventListener('change', responsive, options);
		compact?.addEventListener('change', responsive, options);
		this.#root.addEventListener(
			'click',
			(event) => {
				const button = (event.target as Element)?.closest?.<HTMLButtonElement>('button');
				if (!button || button.disabled) return;
				const action = button.dataset.chrome;
				if (action === 'inspector' || action === 'shapes') this.togglePane(action);
			},
			options,
		);
		this.#inspector.addEventListener(
			'office-pane-close',
			() => {
				this.#manual.add('inspector');
				this.#setPane('inspector', false);
				this.#root.querySelector<HTMLElement>('.viewport')?.focus({ preventScroll: true });
			},
			options,
		);
		this.#root.addEventListener(
			'office-tab-select',
			(event) => {
				const id = Number((event as CustomEvent<{ id: string }>).detail.id);
				if (Number.isSafeInteger(id)) this.#controller.setPage(id);
			},
			options,
		);
		// Visio's All pages list beside the page tabs.
		this.#allPages.addEventListener(
			'office-command',
			(event) => {
				const command = (event as CustomEvent<{ command: string }>).detail.command;
				const index = /^page-(\d+)$/.exec(command)?.[1];
				if (index === undefined) return;
				event.stopPropagation();
				this.#controller.setPage(Number(index));
			},
			options,
		);
		// The shared ribbon selects tabs itself; phones close the Tools sheet as Visio does.
		this.#root.addEventListener('office-ribbon-select', () => this.closeCompactTools(), options);
		return () => events.abort();
	}
	showTab(tab: string): void {
		const ribbon = this.#root.querySelector<HTMLElement & { selected: string }>('office-ui-ribbon');
		if (ribbon) ribbon.selected = tab;
	}
	/** On phones, close the Tools sheet once a command runs. */
	closeCompactTools(): void {
		if (this.#compact?.matches) this.#tools.open = false;
	}
	/** Show or hide a task pane; compact layouts close the Tools menu afterwards. */
	togglePane(pane: TaskPane): void {
		if (this.#compact?.matches) this.#tools.open = false;
		this.#manual.add(pane);
		this.#setPane(pane, Boolean(this.#panes[pane].hidden));
	}
	/** A ribbon command or menu item by its stable id (the first match wins). */
	#command(name: string): (HTMLElement & { disabled: boolean }) | null {
		return this.#root.querySelector(`[command="${name}"]`)!;
	}
	#setPane(pane: TaskPane, visible: boolean): void {
		// Phones show one pane at a time.
		if (visible && this.#compact?.matches)
			for (const other of Object.keys(this.#panes) as TaskPane[])
				if (other !== pane) {
					this.#panes[other].hidden = true;
					this.#command(other)?.setAttribute('checked', 'false');
				}
		this.#panes[pane].hidden = !visible;
		this.#command(pane)?.setAttribute('checked', String(visible));
		this.#command('shape-data')?.setAttribute(
			'checked',
			String(!this.#inspector.hidden && this.#view === 'selection'),
		);
		// Visio keeps a minimised Shapes strip on wide screens so the window can be reopened.
		if (pane === 'shapes') {
			const strip = this.#root.querySelector<HTMLElement>('.shapes-strip');
			if (strip) strip.hidden = visible || !!this.#compact?.matches;
		}
	}
	/** Show a task pane view (Shape Data, Format Shape) and move focus into it. */
	reveal(kind: PaneView): void {
		if (this.#compact?.matches) this.#tools.open = false;
		this.#view = kind;
		for (const view of this.#inspector.querySelectorAll<HTMLElement>('[data-pane-view]'))
			view.toggleAttribute('data-active', view.dataset.paneView === kind);
		this.#inspector.setAttribute('label', PANE_TITLES[kind]);
		this.#manual.add('inspector');
		this.#setPane('inspector', true);
		const panel = this.#inspector.querySelector<HTMLElement>(`[data-pane-view="${kind}"]`)!;
		(
			panel.querySelector<HTMLElement>('input:not(:disabled), button:not(:disabled), a[href]') ??
			this.#inspector
		).focus();
	}
	render(state: ViewerState): void {
		const page = state.document?.pages[state.pageIndex];
		const doc = this.#root.ownerDocument;
		if (state.document !== this.#document) {
			this.#document = state.document;
			const pages = state.document?.pages ?? [];
			// The shared tab strip and menu items insert labels as text.
			this.#pageTabs.tabs = pages.map((candidate, index) => ({
				id: String(index),
				label: candidate.name,
				title: candidate.isBackground ? `${candidate.name} (background page)` : candidate.name,
			}));
			this.#allPages.replaceChildren(
				...pages.map((candidate, index) => {
					const item = doc.createElement('office-ui-menu-item');
					item.setAttribute('command', `page-${index}`);
					item.setAttribute(
						'label',
						candidate.isBackground ? `${candidate.name} (background)` : candidate.name,
					);
					return item;
				}),
			);
			const reorder = doc.createElement('office-ui-menu-item');
			reorder.setAttribute('command', 'reorder-pages');
			reorder.setAttribute('label', 'Reorder Pages...');
			this.#allPages.append(reorder);
			const rename = doc.createElement('office-ui-menu-item');
			rename.setAttribute('command', 'rename-page');
			rename.setAttribute('label', 'Rename Page...');
			this.#allPages.append(rename);
			const remove = doc.createElement('office-ui-menu-item');
			remove.setAttribute('command', 'delete-page');
			remove.setAttribute('label', 'Delete Page...');
			this.#allPages.append(remove);
		}
		this.#pageTabs.selected = page ? String(state.pageIndex) : '';
		this.#pageTabs.toggleAttribute(
			'add-disabled',
			!page || !state.edit.sourceAvailable || state.edit.busy || state.loading,
		);
		this.#pageTabs.setAttribute(
			'add-title',
			state.edit.sourceAvailable ? 'Insert Page' : 'Insert Page: open a .vsdx file to edit pages.',
		);
		for (const item of this.#allPages.querySelectorAll('office-ui-menu-item'))
			item.setAttribute(
				'checked',
				String(item.getAttribute('command') === `page-${state.pageIndex}`),
			);
		this.#allPages.disabled = !page;
		this.#allPages
			.querySelector('[command="delete-page"]')
			?.toggleAttribute(
				'disabled',
				!state.edit.sourceAvailable || state.edit.busy || state.loading,
			);
		this.#allPages
			.querySelector('[command="rename-page"]')
			?.toggleAttribute(
				'disabled',
				!state.edit.sourceAvailable || state.edit.busy || state.loading,
			);
		this.#allPages
			.querySelector('[command="reorder-pages"]')
			?.toggleAttribute(
				'disabled',
				!state.edit.sourceAvailable || state.edit.busy || state.loading,
			);
		this.#root
			.querySelector('[data-page-status]')!
			.setAttribute(
				'value',
				page ? `Page ${state.pageIndex + 1} of ${state.document!.pages.length}` : '',
			);
		// The Shape Data window says so when nothing with data is selected, as in Visio.
		this.#root.querySelector<HTMLElement>('.selection-hint')!.hidden = !!state.selectedShape;
	}
}
