import { html } from 'lit';
import { ifDefined } from 'lit/directives/if-defined.js';
import { repeat } from 'lit/directives/repeat.js';
import { OfficeElement, controlStyles } from '../base';
import { glyph } from '../glyph';
import { definer } from '../registry';
import css from './dialog-footer.css?raw';

export type OfficeDialogFooterVariant = 'secondary' | 'primary' | 'warning' | 'danger';

export interface OfficeDialogFooterAction {
	/** Stable id echoed back in the request event. */
	id: string;
	/** Translated label and accessible name. */
	label: string;
	variant?: OfficeDialogFooterVariant;
	/** A registered icon name (for example `trash`, `pencil`, `restore`, `print`, `check`). */
	icon?: string;
	disabled?: boolean;
	/** Work in flight: disabled, `aria-busy` and a spinner. */
	busy?: boolean;
	title?: string;
	/** `start` pins a tertiary action (Remove link, Reset all) to the left edge. */
	align?: 'start' | 'end';
	testId?: string;
}

export interface OfficeDialogFooterState {
	actions: readonly OfficeDialogFooterAction[];
}

/**
 * `<office-ui-dialog-footer>`: a dialog's action row (Cancel, OK, Apply...). Not a dialog shell.
 * Set `state`; each button emits `office-dialog-footer-request` `{ id }`. Buttons are keyed by
 * action id and patched in place, so focus survives state changes. `focusAction(id)`. Text arrives
 * already translated; the event name is a static field a product subclass may override.
 */
export class OfficeUiDialogFooter extends OfficeElement {
	static requestEvent = 'office-dialog-footer-request';
	static testIdPrefix = 'office-dialog-footer';
	static override styles = controlStyles(css);
	// A product subclass overrides `state` with its own accessor, so Lit is not told about it: its
	// first update would read the property before the subclass's fields exist.
	private model: OfficeDialogFooterState = { actions: [] };

	get state(): OfficeDialogFooterState {
		return this.model;
	}
	set state(value: OfficeDialogFooterState) {
		this.model = value;
		this.requestUpdate('state');
	}

	/** Move keyboard focus to an action, for example the primary one when a dialog opens. */
	focusAction(id: string): void {
		this.renderRoot.querySelector<HTMLElement>(`button[data-action="${id}"]`)?.focus();
	}

	private classes(action: OfficeDialogFooterAction): string {
		return [
			action.variant === 'secondary' ? '' : (action.variant ?? ''),
			action.align === 'start' ? 'start' : '',
			action.busy ? 'busy' : '',
		]
			.filter(Boolean)
			.join(' ');
	}

	protected override render() {
		const { requestEvent } = this.constructor as typeof OfficeUiDialogFooter;
		return html`
			<div class="footer" part="footer">
				${repeat(
					this.model.actions,
					(action) => action.id,
					(action) =>
						html`<button
							type="button"
							class=${this.classes(action)}
							data-action=${action.id}
							data-testid=${ifDefined(action.testId)}
							title=${ifDefined(action.title)}
							aria-busy=${ifDefined(action.busy ? 'true' : undefined)}
							?disabled=${action.disabled === true || action.busy === true}
							@click=${() => this.fire(requestEvent, { id: action.id })}
							>${action.icon ? glyph(action.icon, 'icon') : ''}${action.label}</button
						>`,
				)}
			</div>
		`;
	}
}

export const defineDialogFooter = definer('office-ui-dialog-footer', () => OfficeUiDialogFooter);
