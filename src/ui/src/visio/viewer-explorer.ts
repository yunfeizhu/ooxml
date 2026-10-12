import type { VisioShape } from 'ooxml-core/visio';
import { visioPageMasters, visioSelectByType } from 'ooxml-core/visio/ui';
import type { ViewerController, ViewerState } from './controller';
import { ViewerDialog } from './viewer-dialog';

/** Shapes listed per level; deeper or longer trees say how many were left out. */
const LIMIT = 500;

/**
 * View > Task Panes > Drawing Explorer: a tree of the drawing's pages and, for the current page,
 * its layers, shapes (with group members) and masters. Activating a page shows it; a shape,
 * layer or master selects the matching top-level shapes. Names are plain text.
 */
export class ViewerExplorer {
	readonly dialog: ViewerDialog;
	#tree: HTMLElement;
	#rendered: { document: unknown; page: unknown } | undefined;
	constructor(
		private readonly root: ShadowRoot,
		private readonly controller: ViewerController,
		private readonly announce: (message: string) => void,
	) {
		this.dialog = new ViewerDialog(root, 'explorer-dialog', 'Drawing Explorer', ['Close'], () =>
			this.dialog.close(),
		);
		this.#tree = root.ownerDocument.createElement('div');
		this.#tree.className = 'explorer-tree';
		this.dialog.body.append(this.#tree);
		this.#tree.addEventListener('click', (event) => {
			const item = (event.target as Element).closest?.<HTMLButtonElement>('button[data-explore]');
			if (item) this.#activate(item);
		});
	}
	open(): void {
		if (!this.controller.state.document) return;
		this.#rendered = undefined;
		this.render(this.controller.state);
		this.dialog.show();
		this.#tree.querySelector<HTMLButtonElement>('button')?.focus();
	}
	#activate(item: HTMLButtonElement): void {
		const state = this.controller.state;
		const page = state.document?.pages[state.pageIndex];
		const { explore, value = '' } = item.dataset;
		if (explore === 'page') {
			this.controller.setPage(Number(value));
			return;
		}
		if (!page) return;
		const selection =
			explore === 'shape'
				? page.shapes
						.filter((shape) => shape.id === value)
						.map((shape) => ({ id: shape.id, name: shape.name, pageId: page.id }))
				: visioSelectByType(
						page,
						explore === 'layer'
							? { by: 'layer', layerIds: [value] }
							: { by: 'master', masterIds: [value] },
					);
		this.controller.selectShapes(selection);
		const count = this.controller.state.selectedShapes.length;
		this.announce(
			count ? `Selected ${count} shape${count === 1 ? '' : 's'}.` : 'Nothing visible to select.',
		);
	}
	#button(kind: string, value: string, label: string, current = false): HTMLButtonElement {
		const button = this.root.ownerDocument.createElement('button');
		button.type = 'button';
		button.dataset.explore = kind;
		button.dataset.value = value;
		button.textContent = label;
		if (current) button.setAttribute('aria-current', 'true');
		return button;
	}
	#branch(label: string, items: readonly Node[], open = true): HTMLDetailsElement {
		const doc = this.root.ownerDocument;
		const details = doc.createElement('details');
		details.open = open;
		const summary = doc.createElement('summary');
		summary.textContent = label;
		const list = doc.createElement('ul');
		for (const item of items) {
			const entry = doc.createElement('li');
			entry.append(item);
			list.append(entry);
		}
		details.append(summary, list);
		return details;
	}
	#shapes(shapes: readonly VisioShape[], depth: number): Node[] {
		const nodes: Node[] = [];
		for (const shape of shapes.slice(0, LIMIT)) {
			const label = `${shape.name.slice(0, 120) || `Shape ${shape.id}`} (${shape.kind}${shape.visibility?.guide ? ', guide' : ''})`;
			if (shape.children.length && depth < 3)
				nodes.push(
					this.#branch(
						label,
						[
							depth ? this.#text(label) : this.#button('shape', shape.id, `Select ${label}`),
							...this.#shapes(shape.children, depth + 1),
						],
						false,
					),
				);
			else nodes.push(depth ? this.#text(label) : this.#button('shape', shape.id, label));
		}
		if (shapes.length > LIMIT) nodes.push(this.#text(`${shapes.length - LIMIT} more not listed`));
		return nodes;
	}
	#text(label: string): HTMLElement {
		const span = this.root.ownerDocument.createElement('span');
		span.textContent = label;
		return span;
	}
	render(state: ViewerState): void {
		if (!state.document) {
			if (this.dialog.open) this.dialog.close();
			return;
		}
		const page = state.document.pages[state.pageIndex];
		if (!this.dialog.open && this.#rendered) return;
		if (this.#rendered?.document === state.document && this.#rendered.page === page) return;
		this.#rendered = { document: state.document, page };
		const pages = state.document.pages.map((item, index) =>
			this.#button(
				'page',
				String(index),
				`${item.name.slice(0, 120)}${item.isBackground ? ' (background)' : ''}`,
				index === state.pageIndex,
			),
		);
		const children: Node[] = [this.#branch('Pages', pages)];
		if (page) {
			const layers = (page.layers ?? []).map((layer) =>
				this.#button(
					'layer',
					layer.id,
					`${layer.name.slice(0, 120) || `Layer ${layer.id}`}${layer.visible ? '' : ' (hidden)'}`,
				),
			);
			const masters = visioPageMasters(page).map((master) =>
				this.#button(
					'master',
					master.id,
					`Master ${master.id}: ${master.example.slice(0, 80)} (${master.count})`,
				),
			);
			children.push(
				this.#branch(
					`Layers on ${page.name.slice(0, 80)}`,
					layers.length ? layers : [this.#text('No layers')],
				),
				this.#branch(
					`Shapes on ${page.name.slice(0, 80)}`,
					page.shapes.length ? this.#shapes(page.shapes, 0) : [this.#text('No shapes')],
				),
				this.#branch(
					'Masters used',
					masters.length ? masters : [this.#text('No master instances')],
				),
			);
		}
		this.#tree.replaceChildren(...children);
	}
}
