import { html, type TemplateResult } from 'lit';
import { ifDefined } from 'lit/directives/if-defined.js';
import { repeat } from 'lit/directives/repeat.js';
import { OfficeElement, controlStyles } from '../base';
import { glyph } from '../glyph';
import { definer } from '../registry';
import css from './status-bar.css?raw';

export type OfficeStatusActivateEvent = CustomEvent<{ id: string }>;

/** A text segment at the start of the bar (page count, words, language, save state). */
export interface OfficeStatusText {
	id: string;
	text: string;
	title?: string | undefined;
	tone?: 'idle' | 'saving' | 'error' | undefined;
	/** Announce changes politely (a page counter). */
	live?: boolean | undefined;
	/** Hide on phone widths. */
	narrowHide?: boolean | undefined;
}

/** A status-bar button (Notes, Comments, a view switch). `label` is its name and ScreenTip. */
export interface OfficeStatusButton {
	id: string;
	icon: string;
	label: string;
	/** Visible text after the glyph; hidden on phone widths. */
	text?: string | undefined;
	pressed?: boolean | undefined;
	hidden?: boolean | undefined;
	/** Offered but unavailable (a view the product does not provide yet). */
	disabled?: boolean | undefined;
}

/** Everything the controlled bar shows, already translated. Absent parts are not rendered. */
export interface OfficeStatusBarState {
	items?: readonly OfficeStatusText[] | undefined;
	toggles?: readonly OfficeStatusButton[] | undefined;
	/** The view switches (Normal, Sorter, Reading); hidden while empty, all hidden or `false`. */
	views?: readonly OfficeStatusButton[] | false | undefined;
	/** Zoom out, percentage (zoom to fit) and zoom in; emits `zoomOut`, `zoomFit`, `zoomIn`. */
	zoom?:
		| {
				percent: number;
				outLabel: string;
				fitLabel: string;
				inLabel: string;
				/** Keeps the named buttons but hides the cluster. */
				hidden?: boolean | undefined;
				/** Glyphs; default `minus` and `plus`. */
				outIcon?: string | undefined;
				inIcon?: string | undefined;
		  }
		| undefined;
}

/**
 * Status bar: `role="group"` named by its `label` attribute (default "Status"). Two ways to fill
 * it. Composed: children, with `slot="end"` pushed to the trailing edge (zoom, view switches).
 * Controlled: set `state` (`OfficeStatusBarState`: start texts, toggles, view switches and a zoom
 * cluster, all translated); every button emits `office-status-activate` `{ id }` (static
 * `activateEvent` lets a product subclass keep its published name). Slots stay available in
 * controlled mode: the default after the texts, `summary` at the start of the trailing group
 * before the toggles and views (Excel's selection statistics), `collaboration` and `end` before
 * the zoom. Keyed
 * children are patched in place, so a focused button survives updates.
 */
export class OfficeUiStatusBar extends OfficeElement {
	static activateEvent = 'office-status-activate';
	static override styles = controlStyles(css);
	static override properties = {
		// Setting `state` marks the bar controlled, so it has an accessor below.
		label: { type: String },
		hasCollaboration: { state: true },
	};
	declare label: string | null;
	declare hasCollaboration: boolean;
	private model: OfficeStatusBarState | undefined;

	constructor() {
		super();
		this.label = null;
		this.hasCollaboration = false;
	}

	get state(): OfficeStatusBarState | undefined {
		return this.model;
	}
	set state(value: OfficeStatusBarState | null | undefined) {
		this.model = value ?? undefined;
		this.toggleAttribute('data-controlled', this.model !== undefined);
		this.requestUpdate('state');
	}

	private activate(id: string): void {
		this.fire((this.constructor as typeof OfficeUiStatusBar).activateEvent, { id });
	}

	/** Keep native activation out of the host document's navigation shortcuts. */
	private onKeydown(event: KeyboardEvent): void {
		const { key, ctrlKey, metaKey, altKey } = event;
		if ((key === ' ' || key === 'Enter') && !ctrlKey && !metaKey && !altKey)
			event.stopPropagation();
	}

	protected override willUpdate(): void {
		this.setAttribute('role', 'group');
		if (!this.hasAttribute('aria-label')) this.setAttribute('aria-label', this.label ?? 'Status');
	}

	private button(className: string, spec: OfficeStatusButton): TemplateResult {
		return html`<button
			type="button"
			class=${className}
			data-id=${spec.id}
			title=${spec.label}
			aria-label=${spec.label}
			aria-pressed=${ifDefined(spec.pressed === undefined ? undefined : String(spec.pressed))}
			?hidden=${spec.hidden === true}
			?disabled=${spec.disabled === true}
			@click=${() => this.activate(spec.id)}
			@keydown=${this.onKeydown}
			>${glyph(spec.icon, 'icon')}${spec.text ? html`<span class="label">${spec.text}</span>` : ''}</button
		>`;
	}

	private zoomStep(id: string, label: string, icon: string): TemplateResult {
		return html`<button
			type="button"
			class="zoom-step"
			data-id=${id}
			title=${label}
			aria-label=${label}
			@click=${() => this.activate(id)}
			@keydown=${this.onKeydown}
			>${glyph(icon, 'icon')}</button
		>`;
	}

	protected override render() {
		const state = this.model;
		const items = state?.items ?? [];
		const toggles = state?.toggles ?? [];
		const views = state?.views || [];
		const zoom = state?.zoom;
		const viewsHidden = views.every((spec) => spec.hidden === true);
		const togglesHidden = toggles.every((spec) => spec.hidden === true);
		const zoomHidden = !zoom || zoom.hidden === true;
		return html`
			<div class="bar" part="bar">
				<span class="items" ?hidden=${items.length === 0}>
					${repeat(
						items,
						(spec) => spec.id,
						(spec) =>
							html`<span
								class="item${spec.tone === 'saving' ? ' saving' : ''}${
									spec.tone === 'error' ? ' error' : ''
								}${spec.narrowHide ? ' narrow-hide' : ''}"
								data-item=${spec.id}
								title=${ifDefined(spec.title)}
								aria-live=${ifDefined(spec.live ? 'polite' : undefined)}
								>${spec.text}</span
							>`,
					)}
				</span>
				<slot></slot>
				<span class="spacer" ?hidden=${!state}></span>
				<slot name="summary"></slot>
				<span class="toggles" ?hidden=${togglesHidden}>
					${repeat(
						toggles,
						(spec) => spec.id,
						(spec) => this.button('toggle', spec),
					)}
				</span>
				<i class="sep tight" aria-hidden="true" ?hidden=${viewsHidden || togglesHidden}></i>
				<div class="group views" ?hidden=${viewsHidden}>
					${repeat(
						views,
						(spec) => spec.id,
						(spec) => this.button('view', spec),
					)}
				</div>
				<i class="sep tight" aria-hidden="true" ?hidden=${!this.hasCollaboration}></i>
				<slot
					name="collaboration"
					@slotchange=${(event: Event) =>
						(this.hasCollaboration = (event.target as HTMLSlotElement).assignedNodes().length > 0)}
				></slot>
				<slot name="end"></slot>
				<i class="sep tight" aria-hidden="true" ?hidden=${zoomHidden}></i>
				<div class="group zoom" ?hidden=${zoomHidden}>
					${this.zoomStep('zoomOut', zoom?.outLabel ?? '', zoom?.outIcon ?? 'minus')}
					<button
						type="button"
						class="zoom-fit"
						data-id="zoomFit"
						title=${zoom?.fitLabel ?? ''}
						aria-label=${zoom?.fitLabel ?? ''}
						@click=${() => this.activate('zoomFit')}
						@keydown=${this.onKeydown}
						>${zoom ? `${Math.round(zoom.percent)}%` : ''}</button
					>${this.zoomStep('zoomIn', zoom?.inLabel ?? '', zoom?.inIcon ?? 'plus')}</div
				>
			</div>
		`;
	}
}

export const defineStatusBar = definer('office-ui-status-bar', () => OfficeUiStatusBar);
