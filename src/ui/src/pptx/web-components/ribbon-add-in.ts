import {
	ribbonAddInGroupViews,
	runRibbonAddInCommand,
	type RibbonAddInTab,
} from '../render/ribbon-add-ins';
import type { RibbonGroupView } from '../render/ribbon-command-view';
import { definePptxRibbonSection, type PptxUiRibbonSectionElement } from './ribbon-section';

export interface PptxUiRibbonAddInElement extends HTMLElement {
	/** The host's tab to draw; null draws nothing. */
	tab: RibbonAddInTab | null;
}

declare global {
	interface HTMLElementTagNameMap {
		'pptx-ui-ribbon-add-in': PptxUiRibbonAddInElement;
	}
}

/**
 * `pptx-ui-ribbon-add-in`: the body of a host's ribbon tab (`ribbonAddIns`). Set `tab`; the
 * element draws its groups through the keyed `pptx-ui-ribbon-section`, so they look like every
 * other PowerPoint tab, and it runs a chosen command itself: the `run` callback of the latest
 * descriptor, then a bubbling, composed `office-ribbon-add-in` event (`{ tab, command }`). The
 * command never reaches the viewer's own `command-request` handling. Every binding renders this
 * one element, so none of them builds add-in controls.
 */
export function definePptxRibbonAddIn(registry: CustomElementRegistry): void {
	if (registry.get('pptx-ui-ribbon-add-in')) {
		return;
	}
	definePptxRibbonSection(registry);
	class PptxRibbonAddIn extends HTMLElement implements PptxUiRibbonAddInElement {
		#tab: RibbonAddInTab | null = null;
		#section: PptxUiRibbonSectionElement | null = null;
		get tab(): RibbonAddInTab | null {
			return this.#tab;
		}
		set tab(value: RibbonAddInTab | null) {
			this.#tab = value ?? null;
			this.#render();
		}
		connectedCallback(): void {
			this.style.display = 'contents';
			this.addEventListener('command-request', this.#request);
			this.#render();
		}
		disconnectedCallback(): void {
			this.removeEventListener('command-request', this.#request);
		}
		#request = (event: Event): void => {
			// An add-in command is the host's: the viewer's own router never sees it.
			event.stopPropagation();
			const id = (event as CustomEvent<{ id?: string }>).detail?.id;
			if (this.#tab && typeof id === 'string') runRibbonAddInCommand(this, this.#tab, id);
		};
		#render(): void {
			if (!this.isConnected) return;
			if (!this.#section) {
				this.#section = this.ownerDocument.createElement('pptx-ui-ribbon-section');
				this.append(this.#section);
			}
			if (this.#tab) this.dataset.ribbonAddIn = this.#tab.id;
			else delete this.dataset.ribbonAddIn;
			// The section is typed for the built-in catalogue ids; add-in ids are namespaced strings.
			this.#section.groups = (this.#tab
				? ribbonAddInGroupViews(this.#tab)
				: []) as unknown as readonly RibbonGroupView[];
		}
	}
	registry.define('pptx-ui-ribbon-add-in', PptxRibbonAddIn);
}
