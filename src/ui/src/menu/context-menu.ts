import { html, type PropertyValues, type TemplateResult } from 'lit';
import { ifDefined } from 'lit/directives/if-defined.js';
import { OfficeElement, controlStyles, flag } from '../base';
import { glyph } from '../glyph';
import { definer, present } from '../registry';
import {
	clampFlyoutPosition,
	EMPTY_MENU_STATE,
	nextEnabledIndex,
	typeAheadIndex,
	type OfficeMenuCloseReason,
	type OfficeMenuItem,
	type OfficeMenuState,
} from './menu-model';
import css from './context-menu.css?raw';

type Item = HTMLElement & { disabled: boolean };
const ITEMS = 'office-ui-menu-item:not([disabled]):not([hidden])';
const TYPE_AHEAD_MS = 700;
type MenuConfig = { requestEvent: string; closeEvent: string; markerPattern: RegExp };

/** Open controlled menus per document, innermost last: Escape closes only the top one. */
const openMenus = new WeakMap<Document, HTMLElement[]>();

/** Hosts re-send equal state on unrelated renders; rebuilding rows would drop hover. */
const stateChanged = (next: unknown, old: unknown): boolean =>
	JSON.stringify(next) !== JSON.stringify(old);

/**
 * Office's right-click menu, in two modes sharing keyboard, type-ahead and dismissal:
 *
 * - **Children** (self-managed): `office-ui-menu-item` and `office-ui-menu-separator` children.
 *   `openAt(x, y)` shows it in the popover top layer, kept inside the viewport; `close()` hides it.
 *   Choosing an item closes the menu and its `office-command` bubbles to the host.
 * - **Controlled** (moved from pptx-viewer `pptx-ui-context-menu`): set `state`
 *   (`{ x, y, label, items: [{ id, label, separatorBefore?, heading?, danger?, disabled?,
 *   checked?, icon? }], markers?, zIndex?, autoFocus? }`). The host is the fixed box at the
 *   pointer, clamped into the window. It emits `office-menu-request` `{ id }` when a row is chosen
 *   and `office-menu-close` `{ reason: 'escape' | 'outside' | 'tab' }` when dismissed, and never
 *   closes itself: the host removes it or clears its items. While open it takes focus on the first
 *   enabled row and returns focus to the opener when it goes away, unless something else took it.
 *
 * Arrow keys, Home, End and type-ahead (repeating a letter cycles) move between enabled rows.
 * Static `requestEvent`, `closeEvent` and `markerPattern` let a product keep its published names.
 */
export class OfficeUiContextMenu extends OfficeElement {
	static requestEvent = 'office-menu-request';
	static closeEvent = 'office-menu-close';
	static markerPattern = /^data-[a-z0-9-]+$/;
	static override styles = controlStyles(css);
	static override properties = {
		label: { type: String },
		open: { attribute: 'data-open', ...flag },
	};
	declare label: string | null;
	declare open: boolean;
	private model: OfficeMenuState = EMPTY_MENU_STATE;
	private controlled = false;
	private returnFocus: HTMLElement | null = null;
	private outside: ((event: Event) => void) | undefined;
	private active = -1;
	private focused = false;
	private query = '';
	private queryTimer: ReturnType<typeof setTimeout> | undefined;
	private markers: string[] = [];
	private listening = false;
	private opener: HTMLElement | null = null;

	constructor() {
		super();
		this.label = null;
		this.open = false;
		this.addEventListener('office-command', () => this.close());
	}

	// ---- Shared -------------------------------------------------------------------------

	private get panel(): HTMLElement | null {
		return this.renderRoot.querySelector('.panel');
	}
	private get rows(): HTMLButtonElement[] {
		return [...this.renderRoot.querySelectorAll<HTMLButtonElement>('.item')];
	}
	private config(): MenuConfig {
		return this.constructor as unknown as MenuConfig;
	}

	override connectedCallback(): void {
		const reconnect = this.hasUpdated;
		if (this.controlled) this.opener = this.deepActive();
		super.connectedCallback();
		if (this.controlled && reconnect) this.settle();
	}

	override disconnectedCallback(): void {
		super.disconnectedCallback();
		this.close();
		if (!this.controlled) return;
		this.stopListening();
		clearTimeout(this.queryTimer);
		this.focused = false;
		const opener = this.opener;
		this.opener = null;
		// Only restore when nothing else took focus (a command may open a dialog or editor).
		const active = this.ownerDocument.activeElement;
		if (opener?.isConnected && (!active || active === this.ownerDocument.body))
			opener.focus({ preventScroll: true });
	}

	private typeAhead(
		items: readonly { label: string; disabled?: boolean }[],
		from: number,
		key: string,
	): number {
		this.query += key;
		clearTimeout(this.queryTimer);
		this.queryTimer = setTimeout(() => (this.query = ''), TYPE_AHEAD_MS);
		return typeAheadIndex(items, from, this.query);
	}

	private isTypeAhead(event: KeyboardEvent): boolean {
		return (
			event.key.length === 1 &&
			event.key !== ' ' &&
			!event.ctrlKey &&
			!event.metaKey &&
			!event.altKey
		);
	}

	// ---- Children mode ------------------------------------------------------------------

	private items(): Item[] {
		return [...this.querySelectorAll<Item>(ITEMS)];
	}

	/** Show at client coordinates; focus the first enabled item. */
	openAt(x: number, y: number): void {
		const doc = this.ownerDocument;
		const panel = this.panel;
		if (!panel) return;
		const active = doc.activeElement;
		this.returnFocus = active instanceof HTMLElement ? active : null;
		if (panel.hasAttribute('popover')) {
			if (!this.open) panel.showPopover?.();
		} else {
			this.outside ??= (event) => {
				if (!event.composedPath().includes(this)) this.close();
			};
			doc.addEventListener('pointerdown', this.outside, true);
		}
		this.open = true;
		const view = doc.defaultView;
		const { left, top } = clampFlyoutPosition({
			x,
			y,
			width: panel.offsetWidth,
			height: panel.offsetHeight,
			viewportWidth: view?.innerWidth ?? x,
			viewportHeight: view?.innerHeight ?? y,
			margin: 4,
		});
		panel.style.left = `${Math.round(left)}px`;
		panel.style.top = `${Math.round(top)}px`;
		this.items()[0]?.focus();
	}

	close(): void {
		if (!this.open) return;
		const panel = this.panel;
		if (panel?.hasAttribute('popover')) {
			try {
				panel.hidePopover?.();
			} catch {
				/* Already closed by light dismiss. */
			}
		}
		this.closed(true);
	}

	private closed(restoreFocus: boolean): void {
		if (!this.open) return;
		this.open = false;
		if (this.outside) this.ownerDocument.removeEventListener('pointerdown', this.outside, true);
		if (restoreFocus) this.returnFocus?.focus?.();
		this.returnFocus = null;
	}

	private onChildKey(event: KeyboardEvent): void {
		const items = this.items();
		const from = items.findIndex(
			(item) => item === event.target || item.contains(event.target as Node),
		);
		const move = (index: number) => {
			event.preventDefault();
			items[(index + items.length) % items.length]?.focus();
		};
		if (event.key === 'ArrowDown') move(from + 1);
		else if (event.key === 'ArrowUp') move(from - 1);
		else if (event.key === 'Home') move(0);
		else if (event.key === 'End') move(items.length - 1);
		else if (event.key === 'Escape' || event.key === 'Tab') {
			if (event.key === 'Escape') event.preventDefault();
			this.close();
		} else if (this.isTypeAhead(event)) {
			const labels = items.map((item) => ({
				label: item.getAttribute('label') ?? item.textContent ?? '',
			}));
			const target = this.typeAhead(labels, from, event.key);
			if (target >= 0) move(target);
		}
	}

	// ---- Controlled mode ----------------------------------------------------------------

	get state(): OfficeMenuState {
		return this.model;
	}
	set state(value: OfficeMenuState) {
		const old = this.model;
		this.model = value;
		if (!this.controlled) {
			this.controlled = true;
			this.toggleAttribute('data-controlled', true);
			if (this.isConnected) this.opener = this.deepActive();
		}
		if (stateChanged(value, old)) this.requestUpdate('state', old);
	}

	private deepActive(): HTMLElement | null {
		let node: Element | null = this.ownerDocument.activeElement;
		while (node?.shadowRoot?.activeElement) node = node.shadowRoot.activeElement;
		return node instanceof HTMLElement && node !== this.ownerDocument.body ? node : null;
	}

	protected override willUpdate(changed: PropertyValues<this>): void {
		if (!this.controlled) return;
		if (changed.has('state' as never)) {
			const { items, markers, zIndex } = this.model;
			this.toggleAttribute('hidden', items.length === 0);
			this.applyMarkers(markers ?? []);
			this.hostWrite(() => {
				if (zIndex !== undefined) this.style.zIndex = String(zIndex);
				else this.style.removeProperty('z-index');
			});
			const same = items[this.active];
			this.active = same && !same.disabled ? this.active : nextEnabledIndex(items, -1, 1);
		}
	}

	protected override updated(changed: PropertyValues<this>): void {
		if (this.controlled && changed.has('state' as never)) this.settle();
	}

	/** Position the open menu, listen for dismissal and keep focus on the active row. */
	private settle(): void {
		const { items, autoFocus } = this.model;
		if (items.length === 0) {
			this.stopListening();
			this.focused = false;
			return;
		}
		if (!this.isConnected) return;
		this.place();
		this.listen();
		if (!this.focused && autoFocus !== false) {
			this.focused = true;
			this.focusRow(nextEnabledIndex(items, -1, 1));
		} else if (this.focused && this.active >= 0)
			this.rows[this.active]?.focus({ preventScroll: true });
	}

	private applyMarkers(next: readonly string[]): void {
		for (const name of this.markers) this.removeAttribute(name);
		const pattern = this.config().markerPattern;
		this.markers = next.filter((name) => pattern.test(name));
		for (const name of this.markers) this.setAttribute(name, 'true');
	}

	private place(): void {
		const view = this.ownerDocument.defaultView;
		this.style.left = `${this.model.x}px`;
		this.style.top = `${this.model.y}px`;
		const box = this.getBoundingClientRect();
		const { left, top } = clampFlyoutPosition({
			x: this.model.x,
			y: this.model.y,
			width: box.width,
			height: box.height,
			viewportWidth: view?.innerWidth ?? box.right,
			viewportHeight: view?.innerHeight ?? box.bottom,
		});
		this.style.left = `${left}px`;
		this.style.top = `${top}px`;
	}

	private focusRow(index: number): void {
		if (index < 0) return;
		this.active = index;
		const rows = this.rows;
		rows.forEach((row, at) => (row.tabIndex = at === index ? 0 : -1));
		rows[index]?.focus({ preventScroll: true });
	}

	private onRowKey(event: KeyboardEvent): void {
		const items = this.model.items;
		let target = -2;
		if (event.key === 'ArrowDown') target = nextEnabledIndex(items, this.active, 1);
		else if (event.key === 'ArrowUp') target = nextEnabledIndex(items, this.active, -1);
		else if (event.key === 'Home') target = nextEnabledIndex(items, -1, 1);
		else if (event.key === 'End') target = nextEnabledIndex(items, items.length, -1);
		else if (this.isTypeAhead(event)) target = this.typeAhead(items, this.active, event.key);
		if (target === -2) return;
		event.preventDefault();
		this.focusRow(target);
	}

	private onRowOver(event: Event): void {
		const row = (event.target as Element | null)?.closest('button');
		const index = row ? this.rows.indexOf(row) : -1;
		if (index >= 0 && !row?.disabled && index !== this.active) this.focusRow(index);
	}

	private dismiss(reason: OfficeMenuCloseReason): void {
		this.fire(this.config().closeEvent, { reason });
	}

	private readonly onDocumentKey = (event: KeyboardEvent): void => {
		if (openMenus.get(this.ownerDocument)?.at(-1) !== this) return;
		if (event.key === 'Escape') {
			// The menu consumes Escape so a full-screen view behind it does not also exit.
			event.preventDefault();
			event.stopPropagation();
			this.dismiss('escape');
		} else if (event.key === 'Tab') this.dismiss('tab');
	};

	private readonly onDocumentPointer = (event: Event): void => {
		if (!event.composedPath().includes(this)) this.dismiss('outside');
	};

	private listen(): void {
		if (this.listening) return;
		this.listening = true;
		const doc = this.ownerDocument;
		openMenus.set(doc, [...(openMenus.get(doc) ?? []), this]);
		doc.addEventListener('keydown', this.onDocumentKey, true);
		doc.addEventListener('pointerdown', this.onDocumentPointer, true);
	}

	private stopListening(): void {
		if (!this.listening) return;
		this.listening = false;
		const doc = this.ownerDocument;
		openMenus.set(
			doc,
			(openMenus.get(doc) ?? []).filter((menu) => menu !== this),
		);
		doc.removeEventListener('keydown', this.onDocumentKey, true);
		doc.removeEventListener('pointerdown', this.onDocumentPointer, true);
	}

	// ---- Templates ----------------------------------------------------------------------

	private row(item: OfficeMenuItem, index: number): TemplateResult {
		const checkable = item.checked !== undefined;
		return html`<button
			type="button"
			class=${item.danger ? 'item danger' : 'item'}
			data-item-id=${item.id}
			title=${ifDefined(item.title)}
			aria-keyshortcuts=${ifDefined(item.shortcut)}
			role=${checkable ? 'menuitemcheckbox' : 'menuitem'}
			aria-checked=${ifDefined(checkable ? String(item.checked) : undefined)}
			aria-disabled=${ifDefined(item.disabled ? 'true' : undefined)}
			tabindex=${index === this.active ? 0 : -1}
			?disabled=${Boolean(item.disabled)}
			@click=${() => this.fire(this.config().requestEvent, { id: item.id })}
			>${checkable ? html`<span class="check" aria-hidden="true">${item.checked ? '✓' : ''}</span>` : ''}${item.icon ? glyph(item.icon, 'icon') : ''}${item.label}${item.shortcut ? html`<span class="shortcut" aria-hidden="true">${item.shortcut}</span>` : ''}</button
		>`;
	}

	/** Rows with their rules and headings; a heading opens a labelled group for the rows after it. */
	private rowTemplates(): TemplateResult[] {
		const out: TemplateResult[] = [];
		let group: { heading: string; rows: TemplateResult[] } | undefined;
		const closeGroup = () => {
			if (!group) return;
			out.push(
				html`<div role="group" aria-label=${group.heading}>
					<div class="heading" aria-hidden="true">${group.heading}</div>${group.rows}</div
				>`,
			);
			group = undefined;
		};
		this.model.items.forEach((item, index) => {
			if (item.separatorBefore || item.heading) closeGroup();
			if (item.separatorBefore) out.push(html`<div class="separator" role="separator"></div>`);
			if (item.heading) group = { heading: item.heading, rows: [] };
			(group ? group.rows : out).push(this.row(item, index));
		});
		closeGroup();
		return out;
	}

	protected override render() {
		if (this.controlled)
			return html`
				<div
					class="menu"
					role="menu"
					aria-orientation="vertical"
					aria-label=${this.model.label}
					tabindex="-1"
					?hidden=${this.model.items.length === 0}
					@keydown=${this.onRowKey}
					@pointerover=${this.onRowOver}
					@contextmenu=${(event: Event) => event.preventDefault()}
					>${this.rowTemplates()}</div
				>
			`;
		const popover = typeof HTMLElement.prototype.showPopover === 'function';
		return html`
			<div
				class="panel"
				role="menu"
				aria-label=${this.label ?? 'Context menu'}
				popover=${ifDefined(popover ? 'auto' : undefined)}
				?hidden=${!popover && !present(this.open)}
				@toggle=${(event: Event) => (event as ToggleEvent).newState === 'closed' && this.closed(false)}
				@keydown=${this.onChildKey}
			>
				<slot></slot>
			</div>
		`;
	}
}

export const defineContextMenu = definer('office-ui-context-menu', () => OfficeUiContextMenu);
