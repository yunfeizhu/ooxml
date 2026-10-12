import { html } from 'lit';
import { ifDefined } from 'lit/directives/if-defined.js';
import { OfficeElement, controlStyles, flag } from '../base';
import { glyph } from '../glyph';
import { definer, present } from '../registry';
import css from './ribbon-tabs.css?raw';

/** Emitted when the user picks a tab; cancelable (`preventDefault()` keeps the current tab). */
export type OfficeRibbonSelectEvent = CustomEvent<{ tab: string }>;

interface RibbonTab {
	id: string;
	label: string;
	contextual: boolean;
	keytip?: string;
	keytipPanel?: string;
}

/**
 * `<office-ui-ribbon>`: the Office tab row (Quick Access Toolbar, File, tabs, search) over the
 * tab panels. Panels are light-DOM children carrying `data-ribbon-tab` (id), `data-label` and
 * optionally `data-tab-keytip`; the element builds the tabs from them, keeps exactly one panel
 * visible and moves between tabs with the arrow keys, Home and End. Slots: `quick-access`,
 * `search`, `end` (after the tabs) and `actions` (pushed to the right end of the tab row, before
 * the collapse button: Office's editing mode, Comments and Share). Attributes: `selected`, `label` (tab list name), `file-label` (default "File"),
 * `no-file`, `file-expanded`, `file-keytip`. A panel with `data-tab-hidden` keeps its content but has
 * no tab (a contextual tab, or one a customisation removed); if it was selected, the first
 * remaining tab takes over. `data-contextual` on a panel tints its tab (`--office-ribbon-contextual`),
 * for tools that apply to the selection, such as a table's. Events: `office-ribbon-select` `{ tab }`
 * (cancelable) and `office-ribbon-file` when File is activated.
 *
 * `collapsible` adds Office's collapse button: `collapsed` hides the panels, a click on a tab then
 * shows its panel over the content (`peek`) until Escape, a command or a click elsewhere. Ctrl+F1 and
 * a double click on a tab toggle it. `collapse-label` names the button. Event:
 * `office-ribbon-collapse` `{ collapsed }`.
 */
export class OfficeUiRibbon extends OfficeElement {
	static override styles = controlStyles(css);
	static override properties = {
		// The default selection is the first panel, so `selected` has an accessor below.
		selected: { type: String, noAccessor: true },
		label: { type: String },
		fileLabel: { attribute: 'file-label', type: String },
		noFile: { attribute: 'no-file', ...flag },
		fileExpanded: { attribute: 'file-expanded', type: String },
		fileKeytip: { attribute: 'file-keytip', type: String },
		collapsible: flag,
		collapsed: flag,
		peek: flag,
		collapseLabel: { attribute: 'collapse-label', type: String },
		tabs: { state: true },
	};
	declare label: string | null;
	declare fileLabel: string | null;
	declare noFile: boolean;
	declare fileExpanded: string | null;
	declare fileKeytip: string | null;
	declare collapsible: boolean;
	declare collapsed: boolean;
	declare peek: boolean;
	declare collapseLabel: string | null;
	declare tabs: RibbonTab[];
	private chosen: string | null = null;

	constructor() {
		super();
		this.label = null;
		this.fileLabel = null;
		this.noFile = false;
		this.fileExpanded = null;
		this.fileKeytip = null;
		this.collapsible = false;
		this.collapsed = false;
		this.peek = false;
		this.collapseLabel = null;
		this.tabs = [];
	}

	get selected(): string {
		const shown = this.shown();
		const chosen = shown.find((panel) => panel.dataset.ribbonTab === this.chosen);
		return chosen?.dataset.ribbonTab ?? shown[0]?.dataset.ribbonTab ?? '';
	}
	set selected(tab: string | null) {
		this.chosen = tab;
		this.reflectAttribute('selected', tab, {});
		this.requestUpdate('selected');
	}

	/** Focus the File button (for example when the backstage it opened closes). */
	focusFile(): void {
		this.renderRoot.querySelector<HTMLElement>('.file')?.focus();
	}

	/** Focus the selected tab. */
	focusTab(): void {
		this.renderRoot.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
	}

	/** The rendered tab button of `tab`, or null before the first render. */
	tabButton(tab: string): HTMLButtonElement | null {
		return this.renderRoot.querySelector<HTMLButtonElement>(`[role="tab"][data-tab="${tab}"]`);
	}

	/** The rendered File button, or null before the first render. */
	fileButton(): HTMLButtonElement | null {
		return this.renderRoot.querySelector<HTMLButtonElement>('.file');
	}

	/**
	 * Hide or show the tab of panel `tab` for one reason (`contextual`, `custom`, ...). The tab shows
	 * only while no reason hides it, so a table's tools and a customisation do not undo each other.
	 */
	setTabHidden(tab: string, reason: string, hidden: boolean): void {
		const panel = this.panels().find((item) => item.dataset.ribbonTab === tab);
		if (!panel) return;
		const reasons = new Set((panel.dataset.tabHiddenBy ?? '').split(' ').filter(Boolean));
		if (hidden) reasons.add(reason);
		else reasons.delete(reason);
		if (reasons.size) panel.dataset.tabHiddenBy = [...reasons].join(' ');
		else delete panel.dataset.tabHiddenBy;
		panel.toggleAttribute('data-tab-hidden', reasons.size > 0);
	}

	private panels(): HTMLElement[] {
		return [...this.children].filter(
			(child): child is HTMLElement => child instanceof HTMLElement && !!child.dataset.ribbonTab,
		);
	}

	/** The panels that have a tab: those not marked `data-tab-hidden`. */
	private shown(): HTMLElement[] {
		return this.panels().filter((panel) => panel.dataset.tabHidden === undefined);
	}

	/** Read the tabs off the panels (on connection and whenever the slotted panels change). */
	private build(): void {
		this.tabs = this.shown().map((panel) => {
			const id = panel.dataset.ribbonTab!;
			panel.setAttribute('role', 'tabpanel');
			panel.setAttribute('aria-label', panel.dataset.label ?? id);
			return {
				id,
				label: panel.dataset.label ?? id,
				contextual: panel.dataset.contextual !== undefined,
				...(panel.dataset.tabKeytip
					? {
							keytip: panel.dataset.tabKeytip,
							...(panel.id ? { keytipPanel: panel.id } : {}),
						}
					: {}),
			};
		});
	}

	private setCollapsed(value: boolean): void {
		if (value === this.collapsed) return;
		this.collapsed = value;
		this.peek = false;
		this.fire('office-ribbon-collapse', { collapsed: value });
	}

	private onOutside = (event: Event): void => {
		if (!event.composedPath().includes(this)) this.peek = false;
	};

	private onTabDoubleClick(event: Event): void {
		if (this.collapsible && (event.target as Element).closest?.('[role="tab"]'))
			this.setCollapsed(!this.collapsed);
	}

	/** A command run from an overlaid panel closes it; a menu opener keeps it open. */
	private onPanelClick(event: Event): void {
		if (!this.collapsed || !this.peek) return;
		const button = (event.target as Element).closest?.('button');
		if (button && !button.hasAttribute('aria-haspopup') && !button.closest('[role="tablist"]'))
			this.peek = false;
	}

	protected override willUpdate(changed: Map<PropertyKey, unknown>): void {
		if (changed.has('peek')) {
			const doc = this.ownerDocument;
			if (this.peek) doc.addEventListener('pointerdown', this.onOutside, true);
			else doc.removeEventListener('pointerdown', this.onOutside, true);
		}
	}

	private choose(tab: string): void {
		if (this.collapsible && this.collapsed) this.peek = true;
		if (tab === this.selected) return;
		if (this.fire('office-ribbon-select', { tab }, true)) this.selected = tab;
	}

	private onTabClick(event: Event): void {
		const tab = (event.target as Element).closest?.<HTMLElement>('[role="tab"]');
		if (tab) this.choose(tab.dataset.tab!);
	}

	/** Ctrl+F1 and Escape work from anywhere in the ribbon, panels included. */
	private onHostKey = (event: KeyboardEvent): void => {
		if (this.collapsible && event.key === 'F1' && event.ctrlKey) {
			event.preventDefault();
			this.setCollapsed(!this.collapsed);
		} else if (event.key === 'Escape' && this.peek) this.peek = false;
	};

	private onKey(event: KeyboardEvent): void {
		const tabs = [...this.renderRoot.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
		// Step from the focused tab (it may differ from the selected one), as Office does.
		const focused = (event.target as Element).closest?.<HTMLButtonElement>('[role="tab"]');
		const at = focused
			? tabs.indexOf(focused)
			: tabs.findIndex((tab) => tab.dataset.tab === this.selected);
		const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
		const next =
			event.key === 'Home'
				? tabs[0]
				: event.key === 'End'
					? tabs.at(-1)
					: step
						? tabs[(at + step + tabs.length) % tabs.length]
						: undefined;
		if (!next) return;
		event.preventDefault();
		this.choose(next.dataset.tab!);
		this.focusTab();
	}

	/** Rebuild the tab row when a panel's label or visibility flag changes. */
	private watcher: MutationObserver | undefined;

	override connectedCallback(): void {
		this.build();
		super.connectedCallback();
		this.addEventListener('keydown', this.onHostKey);
		const Observer = this.ownerDocument.defaultView?.MutationObserver;
		this.watcher = Observer ? new Observer(() => this.build()) : undefined;
		this.watcher?.observe(this, {
			attributes: true,
			subtree: true,
			attributeFilter: ['data-tab-hidden', 'data-label'],
		});
	}

	override disconnectedCallback(): void {
		super.disconnectedCallback();
		this.removeEventListener('keydown', this.onHostKey);
		this.watcher?.disconnect();
		this.ownerDocument.removeEventListener('pointerdown', this.onOutside, true);
		this.watcher = undefined;
	}

	/** Exactly one panel shows. */
	protected override updated(): void {
		const selected = this.selected;
		const hideAll = this.collapsed && !this.peek;
		for (const panel of this.panels())
			panel.hidden = hideAll || panel.dataset.ribbonTab !== selected;
	}

	protected override render() {
		const selected = this.selected;
		return html`
			<div class="head" part="head">
				<slot name="quick-access"></slot>
				<button
					class="file"
					part="file"
					type="button"
					aria-haspopup="dialog"
					aria-expanded=${String(this.fileExpanded === 'true')}
					data-keytip=${ifDefined(this.fileKeytip ?? undefined)}
					?hidden=${present(this.noFile)}
					@click=${() => this.fire('office-ribbon-file', {})}
					>${this.fileLabel ?? 'File'}</button
				>
				<div
					role="tablist"
					part="tabs"
					aria-label=${this.label ?? 'Ribbon'}
					@click=${this.onTabClick}
					@keydown=${this.onKey}
					@dblclick=${this.onTabDoubleClick}
				>
					${this.tabs.map(
						(tab) =>
							html`<button
								type="button"
								role="tab"
								id="tab-${tab.id}"
								data-tab=${tab.id}
								data-contextual=${ifDefined(tab.contextual ? '' : undefined)}
								data-keytip=${ifDefined(tab.keytip)}
								data-keytip-panel=${ifDefined(tab.keytipPanel)}
								aria-selected=${String(tab.id === selected)}
								tabindex=${tab.id === selected ? 0 : -1}
								>${tab.label}</button
							>`,
					)}
				</div>
				<slot name="search"></slot>
				<slot name="end"></slot>
				<slot name="actions" part="actions"></slot>
				<button
					class="collapse"
					part="collapse"
					type="button"
					aria-pressed=${String(this.collapsed)}
					aria-label=${this.collapseLabel ?? 'Collapse the ribbon'}
					title=${this.collapseLabel ?? 'Collapse the ribbon'}
					?hidden=${!this.collapsible}
					@click=${() => this.setCollapsed(!this.collapsed)}
				>
					${glyph('chevronLeft', 'glyph')}
				</button>
			</div>
			<slot @slotchange=${this.build} @click=${this.onPanelClick}></slot>
		`;
	}
}

export const defineRibbon = definer('office-ui-ribbon', () => OfficeUiRibbon);
