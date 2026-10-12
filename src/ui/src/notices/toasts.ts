import { html, type PropertyValues } from 'lit';
import { ifDefined } from 'lit/directives/if-defined.js';
import { OfficeElement, controlStyles } from '../base';
import { glyph } from '../glyph';
import { definer } from '../registry';
import css from './toasts.css?raw';

/** Toasts rendered before the rest collapse into a "+N" count. */
export const OFFICE_TOAST_VISIBLE_LIMIT = 5;

export interface OfficeToast {
	readonly id: string;
	/** Machine-readable code, mirrored to `data-code`. */
	readonly code?: string;
	readonly severity: 'info' | 'warning';
	/** Translated message. */
	readonly message: string;
}

export interface OfficeToastsState {
	toasts: readonly OfficeToast[];
	/** Extra toasts a host already trimmed off the list it passes. */
	overflowCount?: number;
	labels?: { title?: string; dismissAll?: string; dismiss?: string };
}

/**
 * `<office-ui-toasts>`: a stack of load or compatibility notices. Toasts never auto-hide;
 * dismissal is the host's decision through `office-toasts-request` `{ id: 'dismissAll' }` or
 * `{ id: 'dismiss', toastId }`. The host positions the element. Hidden when empty. Text arrives
 * already translated; the event name and test id prefix are static fields a product subclass
 * may override.
 */
export class OfficeUiToasts extends OfficeElement {
	static requestEvent = 'office-toasts-request';
	static testIdPrefix = 'office-toast';
	static override styles = controlStyles(css);
	// A product subclass overrides `state` with its own accessor, so Lit is not told about it: its
	// first update would read the property before the subclass's fields exist.
	private model: OfficeToastsState = { toasts: [] };

	get state(): OfficeToastsState {
		return this.model;
	}
	set state(value: OfficeToastsState) {
		this.model = value;
		this.requestUpdate('state');
	}

	protected override willUpdate(_changed: PropertyValues<this>): void {
		const { testIdPrefix } = this.constructor as typeof OfficeUiToasts;
		this.setAttribute('data-testid', `${testIdPrefix}s`);
		this.toggleAttribute('hidden', this.model.toasts.length === 0);
	}

	protected override render() {
		const { requestEvent, testIdPrefix: p } = this.constructor as typeof OfficeUiToasts;
		const s = this.model;
		const visible = s.toasts.slice(0, OFFICE_TOAST_VISIBLE_LIMIT);
		const hiddenCount = (s.overflowCount ?? 0) + s.toasts.length - visible.length;
		const labels = s.labels ?? {};
		return html`
			<div>
				<div class="header">
					<span>${labels.title ?? 'Compatibility'}</span>
					<button
						type="button"
						class="dismiss-all"
						data-testid="${p}s-dismiss-all"
						@click=${() => this.fire(requestEvent, { id: 'dismissAll' })}
						>${labels.dismissAll ?? 'Dismiss all'}</button
					>
				</div>
				${visible.map(
					(toast) =>
						html`<div
							class="toast"
							role="status"
							data-testid=${p}
							data-code=${ifDefined(toast.code)}
							data-severity=${toast.severity}
						>
							${glyph(toast.severity === 'warning' ? 'warning' : 'info', 'icon')}
							<p class="message">${toast.message}</p>
							<button
								type="button"
								data-testid="${p}-dismiss"
								aria-label=${labels.dismiss ?? 'Dismiss'}
								@click=${() => this.fire(requestEvent, { id: 'dismiss', toastId: toast.id })}
								>${glyph('close', 'icon')}</button
							>
						</div>`,
				)}
				${hiddenCount > 0 ? html`<p class="overflow">+${hiddenCount}</p>` : ''}
			</div>
		`;
	}
}

export const defineToasts = definer('office-ui-toasts', () => OfficeUiToasts);
