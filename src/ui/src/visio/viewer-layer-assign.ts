import {
	editErrorMessage,
	isEditCancellation,
	visioLayerAssignCommands,
	visioLayerAssignState,
	visioNewLayerNames,
	visioSelectionIsOnPage,
} from 'ooxml-core/visio/ui';
import type { ViewerController, ViewerState } from './controller';
import type { RibbonCommand } from './ribbon-parts';
import { choice, fieldset, ViewerDialog } from './viewer-dialog';

const LABEL = 'Assign to Layer';

/**
 * Home > Editing > Layers > Assign to Layer: checkboxes for the page's layers (mixed membership
 * starts indeterminate and is kept unless changed) and a New layer field. OK commits one
 * `assign-layers` source edit, so assignment and new layers undo together.
 */
export class ViewerLayerAssign {
	readonly dialog: ViewerDialog;
	#list: HTMLElement;
	#name: HTMLInputElement;
	#target: { pageId: string; shapeIds: string[]; generation: number } | undefined;
	constructor(
		private readonly root: ShadowRoot,
		private readonly controller: ViewerController,
		private readonly announce: (message: string) => void,
	) {
		const doc = root.ownerDocument;
		this.dialog = new ViewerDialog(root, 'layer-assign-dialog', 'Layer', ['OK', 'Cancel'], (b) =>
			b === 'OK' ? void this.#apply() : this.dialog.close(),
		);
		this.#list = doc.createElement('div');
		this.#list.className = 'layer-assign-list';
		this.#name = doc.createElement('input');
		this.#name.type = 'text';
		this.#name.name = 'new-layer';
		this.#name.maxLength = 1024;
		this.#name.placeholder = 'Layer name, or several separated by commas';
		this.#name.setAttribute('aria-label', 'New layer');
		this.#name.addEventListener('keydown', (event) => {
			if (event.key !== 'Enter') return;
			event.preventDefault();
			void this.#apply();
		});
		const label = doc.createElement('label');
		label.append('New layer', this.#name);
		this.dialog.body.append(fieldset(doc, 'Layers on this page', this.#list), label);
	}
	#reason(state: ViewerState): string | undefined {
		if (!state.edit.sourceAvailable) return 'Open a .vsdx file to assign layers.';
		if (state.loading || state.edit.busy) return 'Wait for the current edit to finish.';
		const page = state.document?.pages[state.pageIndex];
		if (!page || !state.selectedShapes.length) return 'Select one or more shapes.';
		if (!state.selectedShapes.every((shape) => visioSelectionIsOnPage(shape, page.id)))
			return 'Select shapes on this page.';
		const result = visioLayerAssignState(
			page,
			state.selectedShapes.map((shape) => shape.id),
		);
		return result.ok ? undefined : result.reason;
	}
	open(): void {
		const state = this.controller.state;
		const page = state.document?.pages[state.pageIndex];
		const reason = this.#reason(state);
		if (reason || !page) {
			this.announce(`${LABEL}: ${reason}`);
			return;
		}
		const shapeIds = state.selectedShapes.map((shape) => shape.id);
		const result = visioLayerAssignState(page, shapeIds);
		if (!result.ok) return;
		this.#target = { pageId: page.id, shapeIds, generation: this.controller.documentGeneration };
		const doc = this.root.ownerDocument;
		this.#list.replaceChildren(
			...(result.rows.length
				? result.rows.map(({ layer, state: membership }) => {
						const item = choice(
							doc,
							'checkbox',
							'layer',
							layer.id,
							`${layer.name.slice(0, 256) || 'Layer'}${layer.locked ? ' (locked)' : ''}${layer.visible ? '' : ' (hidden)'}`,
						);
						item.input.checked = membership === 'all';
						item.input.indeterminate = membership === 'some';
						if (layer.locked) {
							item.input.disabled = true;
							item.input.dataset.unavailable = '';
						}
						return item.row;
					})
				: [Object.assign(doc.createElement('p'), { textContent: 'This page has no layers yet.' })]),
		);
		this.#name.value = '';
		this.dialog.show();
		(this.#list.querySelector<HTMLInputElement>('input:not([disabled])') ?? this.#name).focus();
	}
	async #apply(): Promise<void> {
		const target = this.#target;
		const state = this.controller.state;
		const page = state.document?.pages.find((candidate) => candidate.id === target?.pageId);
		if (!target || !page || this.controller.documentGeneration !== target.generation) {
			this.dialog.close();
			return;
		}
		const names = visioNewLayerNames(page, this.#name.value);
		if (typeof names === 'string') {
			this.dialog.error.textContent = names;
			return;
		}
		const layers = new Set<string>();
		for (const input of this.#list.querySelectorAll<HTMLInputElement>('input[name="layer"]'))
			if (input.checked) layers.add(input.value);
		// An untouched indeterminate box keeps each shape's own membership of that layer.
		const mixed = [...this.#list.querySelectorAll<HTMLInputElement>('input[name="layer"]')]
			.filter((input) => input.indeterminate)
			.map((input) => input.value);
		const commands = visioLayerAssignCommands(page, target.shapeIds, [...layers], mixed, names);
		if (!commands) {
			this.dialog.error.textContent = 'The selected shapes cannot be assigned to these layers.';
			return;
		}
		this.dialog.busy(true);
		try {
			await this.controller.applyEdits(commands);
			this.dialog.close();
			const count = target.shapeIds.length;
			const total = layers.size + names.length;
			this.announce(
				total || mixed.length
					? `Assigned ${count} shape${count === 1 ? '' : 's'} to layers.${names.length ? ` Added ${names.join(', ')}.` : ''}`
					: `Removed ${count} shape${count === 1 ? '' : 's'} from every layer.`,
			);
		} catch (error) {
			if (this.dialog.open && !isEditCancellation(error))
				this.dialog.error.textContent = editErrorMessage(error);
		} finally {
			this.dialog.busy(false);
		}
	}
	render(state: ViewerState): void {
		const reason = this.#reason(state);
		const command = this.root.querySelector<RibbonCommand>('[command="assign-layer"]');
		if (command) {
			command.disabled = reason !== undefined;
			command.title = reason ? `${LABEL}: ${reason}` : `${LABEL}...`;
		}
		if (
			this.dialog.open &&
			(!state.edit.sourceAvailable ||
				state.loading ||
				this.controller.documentGeneration !== this.#target?.generation)
		)
			this.dialog.close();
	}
}
