import type { VisioDocument, VisioShape } from 'ooxml-core/visio';
import type { ViewerState } from './controller';
import { compatibilityNotes, compatibilityText } from 'ooxml-core/visio/ui';
import type { TextSearchResult } from 'ooxml-core/visio/ui';
import { renderPage } from './render-svg';
import { selectedShape, shapeDetails } from './shape-inspector';
import { selectionKey } from 'ooxml-core/visio/ui';

/**
 * The drawing window: renders the current page, owns its resources, lists compatibility notes
 * and marks the selection (revealing search hits). Page re-renders happen only when the
 * document, page or layer overrides change.
 */
export class ViewerCanvas {
	#document: VisioDocument | null | undefined = null;
	#page = -1;
	#layers: ViewerState['layerVisibilityOverrides'] | undefined;
	#selection: ViewerState['selectedShape'] = null;
	#selections: ViewerState['selectedShapes'] | undefined;
	#revealed: TextSearchResult | undefined;
	#inspected: VisioShape | undefined;
	#warnings: string[] = [];
	#dispose: () => void = () => {};
	constructor(
		private readonly viewport: HTMLElement,
		private readonly notes: HTMLUListElement,
		private readonly notesPanel: HTMLElement,
		private readonly inspector: HTMLElement,
	) {}
	get warnings(): readonly string[] {
		return this.#warnings;
	}
	/** Force the next render to redraw the page (fonts loaded, element reconnected). */
	invalidate(): void {
		this.#document = null;
		this.#page = -1;
	}
	/** Release page resources and forget selection and search memory. */
	dispose(): void {
		this.#dispose();
		this.#dispose = () => {};
		this.#revealed = undefined;
		this.#selection = null;
		this.#selections = undefined;
	}
	/** Returns true when the page itself was re-rendered. */
	render(state: ViewerState): boolean {
		const page = state.document?.pages[state.pageIndex];
		const doc = this.viewport.ownerDocument;
		const changed =
			this.#document !== state.document ||
			this.#page !== state.pageIndex ||
			this.#layers !== state.layerVisibilityOverrides;
		if (changed) {
			this.#dispose();
			this.#dispose = () => {};
			this.#document = state.document;
			this.#page = state.pageIndex;
			this.#layers = state.layerVisibilityOverrides;
			this.#warnings = [];
			if (state.document && page) {
				const result = renderPage(state.document, page, {
					layerVisibilityOverrides: state.layerVisibilityOverrides,
				});
				this.#warnings = result.warnings;
				this.#dispose = result.dispose;
				this.viewport.replaceChildren(result.svg);
			} else {
				const empty = doc.createElement('div');
				empty.className = 'empty';
				const heading = doc.createElement('strong');
				heading.textContent = 'Open a Visio drawing';
				empty.append(
					heading,
					'Open a .vsdx or supported .vsd file to start. Files stay in this browser.',
				);
				this.viewport.replaceChildren(empty);
			}
			const notes = compatibilityNotes(state.document?.diagnostics ?? [], this.#warnings);
			this.notes.replaceChildren(
				...notes.map((note) => {
					const item = doc.createElement('li');
					item.textContent = compatibilityText(note);
					return item;
				}),
			);
			this.notesPanel.hidden = !notes.length;
		}
		const svg = this.viewport.querySelector<SVGSVGElement>('svg.paper');
		if (svg && page) {
			svg.style.width = `${page.width * 96 * state.zoom}px`;
			svg.style.height = `${page.height * 96 * state.zoom}px`;
			// Viewer-only grid spacing: quarter-inch minor and one-inch major lines.
			svg.style.setProperty('--vv-inch', `${96 * state.zoom}px`);
			// One screen pixel in drawing inches: Visio never draws a line thinner than that, so
			// hairlines and 0.75 pt lines stay visible when zoomed out.
			svg.style.setProperty('--vv-hairline', String(1 / (96 * state.zoom)));
		}
		this.#mark(state, changed);
		return changed;
	}
	#mark(state: ViewerState, changed: boolean): void {
		const searchResult = state.search.results[state.search.activeIndex];
		const selection = state.selectedShape;
		if (
			changed ||
			this.#selections !== state.selectedShapes ||
			this.#selection?.id !== selection?.id ||
			this.#selection?.pageId !== selection?.pageId ||
			this.#selection?.name !== selection?.name ||
			(searchResult && searchResult !== this.#revealed)
		) {
			const pageId = state.document?.pages[state.pageIndex]?.id ?? '';
			const selectedKeys = new Set(state.selectedShapes.map((item) => selectionKey(item, pageId)));
			for (const shape of this.viewport.querySelectorAll<SVGGElement>('[data-shape-id]')) {
				const selected = selectedKeys.has(
					selectionKey(
						{
							id: shape.dataset.shapeId!,
							...(shape.dataset.pageId ? { pageId: shape.dataset.pageId } : {}),
						},
						pageId,
					),
				);
				shape.dataset.selected = String(selected);
				if (
					selected &&
					searchResult &&
					searchResult !== this.#revealed &&
					shape.dataset.shapeId === searchResult.shapeId &&
					shape.dataset.pageId === searchResult.pageId
				) {
					shape.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
					this.#revealed = searchResult;
				}
				if (selection) shape.setAttribute('tabindex', selected ? '0' : '-1');
				if (shape.getAttribute('role') === 'button')
					shape.setAttribute('aria-pressed', String(selected));
			}
			const inspected = selectedShape(state.document, selection, state.pageIndex);
			if (inspected !== this.#inspected) {
				this.#inspected = inspected;
				this.inspector
					.querySelector('div')!
					.replaceChildren(...(inspected ? [shapeDetails(inspected)] : []));
			}
			this.#selection = selection ? { ...selection } : null;
			this.#selections = state.selectedShapes;
		}
		if (!searchResult) this.#revealed = undefined;
	}
}
