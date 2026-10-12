import { html, type PropertyValues, type TemplateResult } from 'lit';
import { ifDefined } from 'lit/directives/if-defined.js';
import { OfficeElement, controlStyles, flag } from '../base';
import { defineDialog } from './dialog';
import { definer, present } from '../registry';
import css from './options-dialog.css?raw';

/**
 * Office File > Options dialog. Products describe their categories as data; the element renders
 * the category list, the pane and OK/Cancel, and reports the edited values. Generalised from
 * pptx-viewer's `VIEWER_OPTIONS_SCHEMA` dialog (render/options) so every viewer shares one.
 */
export type OfficeOptionValue = boolean | number | string;
export type OfficeOptionValues = Record<string, OfficeOptionValue>;

export interface OfficeOptionChoice {
	value: string;
	label: string;
}

interface OptionBase {
	/** Key into the values record. */
	key: string;
	label: string;
	/** Optional "(i)" tooltip, as Office's info bubbles. */
	info?: string;
	/** Renders indented under the preceding control. */
	indent?: boolean;
	/** Shown disabled with this reason, for settings the product cannot honour yet. */
	disabled?: string;
}

export type OfficeOptionControl =
	| (OptionBase & { kind: 'toggle' })
	| (OptionBase & { kind: 'select'; choices: readonly OfficeOptionChoice[] })
	| (OptionBase & { kind: 'number'; min: number; max: number; step?: number; unit?: string })
	| (OptionBase & { kind: 'text'; maxLength?: number });

export interface OfficeOptionSection {
	id: string;
	title: string;
	description?: string;
	controls: readonly OfficeOptionControl[];
}

export interface OfficeOptionCategory {
	id: string;
	label: string;
	/** Headline at the top of the pane. */
	description?: string;
	sections: readonly OfficeOptionSection[];
	/** The whole category is not available yet; the pane explains why. */
	disabled?: string;
}

/** Emitted on OK with every value and the keys that changed. */
export type OfficeOptionsChangeEvent = CustomEvent<{
	values: OfficeOptionValues;
	changed: string[];
}>;

/** Clamp a number edit into range; `undefined` when it is not a finite number. */
export function clampOptionNumber(raw: string, min: number, max: number): number | undefined {
	const parsed = Number(raw);
	return Number.isFinite(parsed) && raw.trim() !== ''
		? Math.min(max, Math.max(min, parsed))
		: undefined;
}

/**
 * `<office-ui-options-dialog>`: set `categories` and `values`, then `show()` (or the `open`
 * attribute). Edits stay in a draft until OK, which emits `office-options-change` and closes;
 * Cancel, Escape and the close button discard them. `heading` defaults to "Options".
 */
export class OfficeUiOptionsDialog extends OfficeElement {
	static override styles = controlStyles(css);
	static override properties = {
		open: flag,
		heading: { type: String },
		categories: { attribute: false },
		// `values` keeps a private copy and `category` validates its id, so both have accessors.
		active: { state: true },
	};
	declare open: boolean;
	declare heading: string | null;
	declare categories: readonly OfficeOptionCategory[];
	declare active: string;
	private committed: OfficeOptionValues = {};
	private draft: OfficeOptionValues = {};

	constructor() {
		super();
		this.open = false;
		this.heading = null;
		this.categories = [];
		this.active = '';
	}

	get values(): OfficeOptionValues {
		return { ...this.committed };
	}
	set values(value: OfficeOptionValues) {
		this.committed = { ...value };
		if (!present(this.open)) this.draft = { ...value };
		this.requestUpdate('values');
	}

	/** The selected category id. */
	get category(): string {
		return this.active;
	}
	set category(id: string) {
		if (this.categories.some((category) => category.id === id)) this.active = id;
	}

	show(): void {
		this.open = true;
	}

	close(): void {
		this.open = false;
	}

	private commit(): void {
		const changed = Object.keys(this.draft).filter(
			(key) => this.draft[key] !== this.committed[key],
		);
		this.committed = { ...this.draft };
		this.fire('office-options-change', { values: { ...this.committed }, changed });
		this.close();
	}

	private onNavKey(event: KeyboardEvent): void {
		const tabs = [...this.renderRoot.querySelectorAll<HTMLButtonElement>('nav [role="tab"]')];
		const at = tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
		const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
		const target =
			event.key === 'Home'
				? tabs[0]
				: event.key === 'End'
					? tabs.at(-1)
					: step
						? tabs[(at + step + tabs.length) % tabs.length]
						: undefined;
		if (!target) return;
		event.preventDefault();
		this.category = target.dataset.category!;
		this.renderRoot.querySelector<HTMLButtonElement>('nav [aria-selected="true"]')?.focus();
	}

	protected override willUpdate(changed: PropertyValues<this>): void {
		if (!this.categories.some((category) => category.id === this.active))
			this.active = this.categories[0]?.id ?? '';
		// Opening starts a fresh draft from the committed values.
		if (changed.has('open') && present(this.open)) this.draft = { ...this.committed };
	}

	private set(key: string, next: OfficeOptionValue): void {
		this.draft[key] = next;
	}

	private control(control: OfficeOptionControl): TemplateResult {
		const value = this.draft[control.key];
		const disabled = Boolean(control.disabled);
		const info = control.info
			? html`<span class="info" title=${control.info} role="img" aria-label=${control.info}
					>i</span
				>`
			: '';
		let body: TemplateResult;
		if (control.kind === 'toggle')
			body = html`<input
					type="checkbox"
					.checked=${value === true}
					?disabled=${disabled}
					@change=${(event: Event) => this.set(control.key, (event.target as HTMLInputElement).checked)}
				/><span>${control.label}</span>`;
		else if (control.kind === 'select') {
			const current = String(value ?? control.choices[0]?.value ?? '');
			body = html`<span>${control.label}</span
				><select
					?disabled=${disabled}
					@change=${(event: Event) => this.set(control.key, (event.target as HTMLSelectElement).value)}
				>
					${control.choices.map(
						(choice) =>
							html`<option value=${choice.value} ?selected=${choice.value === current}
								>${choice.label}</option
							>`,
					)}
				</select>`;
		} else if (control.kind === 'number')
			body = html`<span>${control.label}</span
				><input
					type="number"
					min=${control.min}
					max=${control.max}
					step=${ifDefined(control.step ? String(control.step) : undefined)}
					.value=${value === undefined ? '' : String(value)}
					?disabled=${disabled}
					@change=${(event: Event) => {
						const field = event.target as HTMLInputElement;
						const next = clampOptionNumber(field.value, control.min, control.max);
						if (next === undefined) field.value = String(this.draft[control.key] ?? '');
						else {
							field.value = String(next);
							this.set(control.key, next);
						}
					}}
				/>${control.unit ? html`<span>${control.unit}</span>` : ''}`;
		else
			body = html`<span>${control.label}</span
				><input
					type="text"
					maxlength=${ifDefined(control.maxLength ? String(control.maxLength) : undefined)}
					.value=${value === undefined ? '' : String(value)}
					?disabled=${disabled}
					@input=${(event: Event) => this.set(control.key, (event.target as HTMLInputElement).value)}
				/>`;
		return html`<label
			class="row${control.indent ? ' indent' : ''}${control.kind === 'toggle' ? '' : ' field'}"
			data-key=${control.key}
			?data-disabled=${disabled}
			title=${ifDefined(control.disabled)}
			>${body}${info}</label
		>`;
	}

	private pane(category: OfficeOptionCategory | undefined): TemplateResult | '' {
		if (!category) return '';
		return html`
			${category.description ? html`<p class="lead">${category.description}</p>` : ''}
			${category.disabled ? html`<p class="unavailable">${category.disabled}</p>` : ''}
			${category.sections.map(
				(section) =>
					html`<section>
						<h3>${section.title}</h3>
						${section.description ? html`<p class="desc">${section.description}</p>` : ''}
						${section.controls.map((control) => this.control(control))}
					</section>`,
			)}
		`;
	}

	protected override render() {
		const category = this.categories.find((entry) => entry.id === this.active);
		return html`
			<office-ui-dialog
				heading=${this.heading ?? 'Options'}
				?open=${present(this.open)}
				@office-dialog-close=${(event: Event) => {
					if (!event.defaultPrevented) this.close();
				}}
			>
				<div class="layout">
					<nav
						role="tablist"
						aria-orientation="vertical"
						aria-label="Categories"
						@keydown=${this.onNavKey}
					>
						${this.categories.map(
							(entry) =>
								html`<button
									type="button"
									role="tab"
									id="tab-${entry.id}"
									data-category=${entry.id}
									aria-controls="pane"
									aria-selected=${String(entry.id === this.active)}
									tabindex=${entry.id === this.active ? 0 : -1}
									@click=${() => (this.category = entry.id)}
									>${entry.label}</button
								>`,
						)}
					</nav>
					<div
						role="tabpanel"
						id="pane"
						aria-labelledby=${ifDefined(category ? `tab-${category.id}` : undefined)}
						>${this.pane(category)}</div
					>
				</div>
				<div slot="footer" class="actions">
					<button type="button" data-action="ok" @click=${this.commit}>OK</button>
					<button type="button" data-action="cancel" @click=${this.close}>Cancel</button>
				</div>
			</office-ui-dialog>
		`;
	}
}

export const defineOptionsDialog = definer(
	'office-ui-options-dialog',
	() => OfficeUiOptionsDialog,
	[defineDialog],
);
