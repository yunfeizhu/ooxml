import { html } from 'lit';
import { OfficeElement, controlStyles } from '../base';
import { glyph } from '../glyph';
import { definer } from '../registry';
import css from './task-pane.css?raw';

/**
 * `<office-ui-task-pane>`: a docked task pane, as Office shows Format Shape or Shape Data. A
 * header with the `label` as its title and a close button (named by `close-label`, default
 * "Close <label>"), then the slotted body. The close button emits `office-pane-close`; the host
 * decides whether to hide the pane. The host is a `complementary` landmark named by the label.
 * Parts: `header` and `body`, for a product that lays the pane out differently (a wide pane
 * docked under the document, whose body does not scroll as a whole).
 */
export class OfficeUiTaskPane extends OfficeElement {
	static closeEvent = 'office-pane-close';
	static override styles = controlStyles(css);
	static override properties = {
		label: { type: String },
		closeLabel: { type: String, attribute: 'close-label' },
	};
	declare label: string;
	declare closeLabel: string;

	constructor() {
		super();
		this.label = '';
		this.closeLabel = '';
	}

	protected override willUpdate(): void {
		this.setAttribute('role', 'complementary');
		this.setAttribute('aria-label', this.label);
	}

	protected override render() {
		const close = this.closeLabel || `Close ${this.label}`;
		return html`<div class="header" part="header"
				><h2 class="title">${this.label}</h2
				><button
					type="button"
					class="close"
					title=${close}
					aria-label=${close}
					@click=${() => this.fire((this.constructor as typeof OfficeUiTaskPane).closeEvent, {})}
					>${glyph('close', 'icon')}</button
				></div
			><div class="body" part="body"><slot></slot></div>`;
	}
}

export const defineTaskPane = definer('office-ui-task-pane', () => OfficeUiTaskPane);
