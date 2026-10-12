import { html } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { OfficeElement, controlStyles } from '../base';
import { definer } from '../registry';
import { tok } from '../tokens';
import css from './paste-options.css?raw';

export interface OfficePasteOption {
	/** Echoed back as `format` in the request event. */
	id: string;
	/** Translated label. */
	label: string;
}

export interface OfficePasteOptionsState {
	/** Right edge of the pasted object in viewport pixels. */
	left: number;
	/** Bottom edge of the pasted object in viewport pixels. */
	top: number;
	options: readonly OfficePasteOption[];
	/** Toolbar accessible name. */
	label?: string;
}

/**
 * `<office-ui-paste-options>`: the Paste Options strip Word, Excel and PowerPoint offer after a
 * paste, anchored one `--office-space-1` step past the pasted object's bottom-right corner (the
 * host is the fixed box). A choice emits `office-paste-options-request` `{ format }` then
 * `office-paste-options-dismiss`; the first pointerdown or keydown outside (Escape inside too)
 * dismisses, armed one task after connecting so the paste gesture does not. Text arrives
 * translated; event names and the test id prefix are static fields a product subclass may override.
 */
export class OfficeUiPasteOptions extends OfficeElement {
	static requestEvent = 'office-paste-options-request';
	static dismissEvent = 'office-paste-options-dismiss';
	static testIdPrefix = 'office-paste-options';
	static override styles = controlStyles(css);
	// A product subclass overrides `state` with its own accessor, so Lit is not told about it: its
	// first update would read the property before the subclass's fields exist.
	private model: OfficePasteOptionsState = { left: 0, top: 0, options: [] };

	get state(): OfficePasteOptionsState {
		return this.model;
	}
	set state(value: OfficePasteOptionsState) {
		this.model = value;
		this.requestUpdate('state');
	}
	private disarm: (() => void) | undefined;

	private dismiss(): void {
		this.fire((this.constructor as typeof OfficeUiPasteOptions).dismissEvent, undefined);
	}

	override connectedCallback(): void {
		super.connectedCallback();
		const view = this.ownerDocument.defaultView;
		if (!view) return;
		const dismiss = (event: Event) => {
			const toolbar = this.renderRoot.querySelector('.toolbar');
			if (
				toolbar &&
				event.composedPath().includes(toolbar) &&
				(!(event instanceof KeyboardEvent) || event.key !== 'Escape')
			)
				return;
			this.dismiss();
		};
		const timer = view.setTimeout(() => {
			view.addEventListener('pointerdown', dismiss, true);
			view.addEventListener('keydown', dismiss, true);
		}, 0);
		this.disarm = () => {
			view.clearTimeout(timer);
			view.removeEventListener('pointerdown', dismiss, true);
			view.removeEventListener('keydown', dismiss, true);
		};
	}

	override disconnectedCallback(): void {
		super.disconnectedCallback();
		this.disarm?.();
		this.disarm = undefined;
	}

	private choose(option: OfficePasteOption): void {
		this.fire((this.constructor as typeof OfficeUiPasteOptions).requestEvent, {
			format: option.id,
		});
		// A choice ends the follow-up, as in Office: ask the host to close it.
		this.dismiss();
	}

	protected override willUpdate(): void {
		const { left, top } = this.model;
		this.hostWrite(() => {
			this.style.left = `calc(${left}px + ${tok('--office-space-1')})`;
			this.style.top = `calc(${top}px + ${tok('--office-space-1')})`;
		});
	}

	protected override render() {
		return html`
			<div
				class="toolbar"
				role="toolbar"
				tabindex="-1"
				aria-label=${this.model.label ?? 'Paste Options'}
				@mousedown=${(event: Event) => event.stopPropagation()}
			>
				${repeat(
					this.model.options,
					(option) => option.id,
					(option) =>
						html`<button
							type="button"
							data-format=${option.id}
							title=${option.label}
							@click=${() => this.choose(option)}
							>${option.label}</button
						>`,
				)}
			</div>
		`;
	}
}

export const definePasteOptions = definer('office-ui-paste-options', () => OfficeUiPasteOptions);
