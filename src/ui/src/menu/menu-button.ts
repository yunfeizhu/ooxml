import { html } from 'lit';
import { ifDefined } from 'lit/directives/if-defined.js';
import { OfficeElement, controlStyles, flag } from '../base';
import { glyph } from '../glyph';
import { definer, present } from '../registry';
import css from './menu-button.css?raw';
import { OfficeUiMenuItem } from './menu-item';

type Item = HTMLElement & { disabled: boolean };

function menuOwner(element: Element): OfficeUiMenuButton | undefined {
	for (let parent = element.parentElement; parent; parent = parent.parentElement)
		if (parent instanceof OfficeUiMenuButton) return parent;
	return undefined;
}

/**
 * Dropdown command with a menu of `office-ui-menu-item` children (Office's Find, Layers,
 * Align). With a `command` attribute it is a split button: the main part emits that command
 * and the caret opens the menu. Attributes: `label`, `icon`, `command`, `variant="stacked"`, `icon-only`,
 * `disabled`, `main-disabled` (split command only), `title`, `keyshortcuts`. The menu uses the top layer (`popover`) so ribbon
 * overflow never clips it. Keyboard: Enter, Space or ArrowDown open; arrows, Home and End move;
 * Escape and Tab close; focus returns to the trigger. Choosing an item closes the menu; its
 * `office-command` bubbles to the host. A child marked `data-menu-item` (a colour grid, say) takes
 * part in that focus order through its own `focus()`.
 */
export class OfficeUiMenuButton extends OfficeElement {
	static override styles = controlStyles(css);
	static override properties = {
		label: { type: String },
		icon: { type: String },
		command: { type: String, reflect: true },
		keyshortcuts: { type: String },
		disabled: flag,
		mainDisabled: { attribute: 'main-disabled', ...flag },
		submenu: flag,
		iconOnly: { attribute: 'icon-only', ...flag },
		open: { state: true },
	};
	declare label: string;
	declare icon: string | null;
	declare command: string | null;
	declare keyshortcuts: string | null;
	declare disabled: boolean;
	declare mainDisabled: boolean;
	declare submenu: boolean;
	declare iconOnly: boolean;
	declare open: boolean;
	private outside: ((event: Event) => void) | undefined;

	/** `title` is a native attribute, so it is watched rather than declared as a property. */
	static override get observedAttributes(): string[] {
		return [...super.observedAttributes, 'title'];
	}

	constructor() {
		super();
		this.label = '';
		this.icon = null;
		this.command = null;
		this.keyshortcuts = null;
		this.disabled = false;
		this.mainDisabled = false;
		this.submenu = false;
		this.iconOnly = false;
		this.open = false;
		// Item choices bubble on to the host; the menu only closes.
		this.addEventListener('office-command', (event) => {
			if (event.target !== this) this.hide(true);
		});
	}

	override attributeChangedCallback(name: string, old: string | null, value: string | null): void {
		super.attributeChangedCallback(name, old, value);
		if (name === 'title') this.requestUpdate();
	}

	override disconnectedCallback(): void {
		super.disconnectedCallback();
		this.hide(false);
	}

	private get panel(): HTMLElement | null {
		return this.renderRoot.querySelector('.panel');
	}
	private get split(): boolean {
		return this.command !== null;
	}
	private get nativePopover(): boolean {
		return typeof (this.panel ?? HTMLElement.prototype).showPopover === 'function';
	}

	private items(): Item[] {
		return [...this.querySelectorAll<Item>('*')].filter(
			(item) =>
				(item instanceof OfficeUiMenuItem ||
					(item instanceof OfficeUiMenuButton && present(item.submenu)) ||
					item.hasAttribute('data-menu-item')) &&
				!present(item.disabled) &&
				!item.hidden &&
				menuOwner(item) === this,
		);
	}

	override focus(options?: FocusOptions): void {
		this.renderRoot
			.querySelector<HTMLElement>(this.split && present(this.mainDisabled) ? '.caret' : '.main')
			?.focus(options);
	}

	private toggle(): void {
		if (present(this.submenu)) {
			this.show(0);
			return;
		}
		if (this.open) this.hide(true);
		else this.show(0);
	}

	private show(focusIndex: number): void {
		if (present(this.disabled)) return;
		if (this.open) {
			this.items()[focusIndex]?.focus();
			return;
		}
		const parent = menuOwner(this);
		for (const sibling of parent?.items() ?? [])
			if (sibling !== this && sibling instanceof OfficeUiMenuButton) sibling.hide(false);
		const panel = this.panel;
		const wrap = this.renderRoot.querySelector('.wrap');
		if (!panel || !wrap) return;
		const anchor = wrap.getBoundingClientRect();
		panel.style.left = `${Math.round(anchor.left)}px`;
		panel.style.top = `${Math.round(anchor.bottom + 2)}px`;
		if (panel.hasAttribute('popover')) panel.showPopover?.();
		else {
			this.outside = (event) => {
				if (!event.composedPath().includes(this)) this.hide(false);
			};
			this.ownerDocument.addEventListener('pointerdown', this.outside, true);
		}
		this.open = true;
		this.place(panel, anchor);
		this.items()[focusIndex]?.focus();
	}

	/** Keep the open menu inside the viewport: flip left of the trigger's right edge if needed. */
	private place(panel: HTMLElement, anchor: DOMRect): void {
		const view = this.ownerDocument.defaultView;
		const width = panel.offsetWidth;
		const height = panel.offsetHeight;
		if (!view || !width) return;
		const maxLeft = view.innerWidth - width - 4;
		if (present(this.submenu)) {
			panel.style.left = `${Math.round(Math.max(4, Math.min(anchor.right + 2 + width > view.innerWidth ? anchor.left - width - 2 : anchor.right + 2, Math.max(4, maxLeft))))}px`;
			panel.style.top = `${Math.round(Math.max(4, Math.min(anchor.top, view.innerHeight - height - 4)))}px`;
			return;
		}
		const left = anchor.left > maxLeft ? Math.max(4, anchor.right - width) : anchor.left;
		const top =
			anchor.bottom + 2 + height > view.innerHeight && anchor.top - height - 2 > 0
				? anchor.top - height - 2
				: anchor.bottom + 2;
		panel.style.left = `${Math.round(Math.min(left, Math.max(4, maxLeft)))}px`;
		panel.style.top = `${Math.round(top)}px`;
	}

	private hide(restoreFocus: boolean): void {
		if (!this.open) return;
		const panel = this.panel;
		if (panel?.hasAttribute('popover')) {
			try {
				panel.hidePopover?.();
			} catch {
				/* Already closed by light dismiss. */
			}
		}
		this.closed();
		if (restoreFocus)
			this.renderRoot.querySelector<HTMLElement>(this.split ? '.caret' : '.main')?.focus();
	}

	private closed(): void {
		for (const item of this.items()) if (item instanceof OfficeUiMenuButton) item.hide(false);
		if (this.outside) this.ownerDocument.removeEventListener('pointerdown', this.outside, true);
		this.outside = undefined;
		this.open = false;
	}

	private onMain(): void {
		if (present(this.disabled) || (this.split && present(this.mainDisabled))) return;
		if (this.command) this.fire('office-command', { command: this.command });
		else this.toggle();
	}

	private onTriggerKey(event: KeyboardEvent): void {
		if (
			(event.key === 'ArrowDown' || (present(this.submenu) && event.key === 'ArrowRight')) &&
			!present(this.disabled)
		) {
			event.preventDefault();
			event.stopPropagation();
			this.show(0);
		}
	}

	private onMenuKey(event: KeyboardEvent): void {
		const items = this.items();
		const from = items.findIndex(
			(item) => item === event.target || item.contains(event.target as Node),
		);
		const move = (index: number) => {
			event.preventDefault();
			event.stopPropagation();
			items[(index + items.length) % items.length]?.focus();
		};
		if (event.key === 'ArrowDown') move(from + 1);
		else if (event.key === 'ArrowUp') move(from - 1);
		else if (event.key === 'Home') move(0);
		else if (event.key === 'End') move(items.length - 1);
		else if (event.key === 'Escape' || (present(this.submenu) && event.key === 'ArrowLeft')) {
			event.preventDefault();
			event.stopPropagation();
			this.hide(true);
		} else if (event.key === 'Tab') this.hide(false);
	}

	protected override willUpdate(): void {
		if (present(this.disabled)) this.hide(false);
	}

	protected override render() {
		const { label, split, open } = this;
		const iconOnly = present(this.iconOnly);
		const disabled = present(this.disabled);
		const title = this.getAttribute('title') ?? label;
		const popover = this.nativePopover;
		return html`
			<div class="wrap ${disabled ? 'disabled' : ''}">
				<button
					class="main"
					part="button"
					type="button"
					title=${title}
					aria-label=${ifDefined(iconOnly ? label : undefined)}
					aria-keyshortcuts=${ifDefined(this.keyshortcuts || undefined)}
					aria-haspopup=${ifDefined(split ? undefined : 'menu')}
					role=${ifDefined(present(this.submenu) ? 'menuitem' : undefined)}
					tabindex=${present(this.submenu) ? -1 : 0}
					aria-expanded=${ifDefined(split ? undefined : String(open))}
					?disabled=${disabled || (split && present(this.mainDisabled))}
					@click=${this.onMain}
					@keydown=${this.onTriggerKey}
					@pointerenter=${() => present(this.submenu) && this.show(-1)}
					>${glyph(this.icon)}<span class="text" ?hidden=${iconOnly}>${label}</span></button
				>
				<!-- Without a split command the caret is decoration on one control, not a second button. -->
				<button
					class="caret"
					part="caret"
					type="button"
					title=${split ? `${label} options` : title}
					aria-label=${ifDefined(split ? `${label} options` : undefined)}
					aria-hidden=${ifDefined(split ? undefined : 'true')}
					aria-haspopup="menu"
					aria-expanded=${String(open)}
					tabindex=${split ? 0 : -1}
					?disabled=${disabled}
					@click=${() => !disabled && this.toggle()}
					@keydown=${this.onTriggerKey}
					>${glyph(present(this.submenu) ? 'chevronRight' : 'chevronDown', 'chevron')}</button
				>
			</div>
			<div
				class="panel"
				role="menu"
				popover=${ifDefined(popover ? 'auto' : undefined)}
				?hidden=${!popover && !open}
				@toggle=${(event: Event) => (event as ToggleEvent).newState === 'closed' && this.closed()}
				@keydown=${this.onMenuKey}
			>
				<slot></slot>
			</div>
		`;
	}
}

export const defineMenuButton = definer('office-ui-menu-button', () => OfficeUiMenuButton);
