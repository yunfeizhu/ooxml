import {
	editErrorMessage,
	isEditCancellation,
	visioSelectionIsOnPage,
	visioSizePositionCommand,
	visioSizePositionState,
	type VisioSizePositionField,
} from 'ooxml-core/visio/ui';
import type { ViewerController, ViewerState } from './controller';

const fields: readonly VisioSizePositionField[] = ['x', 'y', 'width', 'height', 'angle'];
/** Accessible names carry the unit; the rows show Visio's short labels with a unit suffix. */
const labels = {
	x: 'X (in)',
	y: 'Y (in)',
	width: 'Width (in)',
	height: 'Height (in)',
	angle: 'Angle (°)',
};
const captions = { x: 'X', y: 'Y', width: 'Width', height: 'Height', angle: 'Angle' };

/** Static presentation only; source quantities and edit conversion belong to core. */
export function createSizePosition(doc: Document): HTMLElement {
	const pane = doc.createElement('section');
	pane.className = 'size-position';
	pane.hidden = true;
	pane.setAttribute('aria-label', 'Size & Position');
	// Visio's anchored window: a vertical caption strip with its close button, then the rows.
	const heading = doc.createElement('div');
	heading.className = 'size-caption';
	const title = doc.createElement('strong');
	title.textContent = 'Size & Position';
	const close = doc.createElement('button');
	close.type = 'button';
	close.setAttribute('aria-label', 'Close Size & Position');
	close.title = 'Close';
	close.textContent = '×';
	heading.append(title, close);
	const body = doc.createElement('div');
	body.className = 'size-body';
	const target = doc.createElement('p');
	target.dataset.sizeTarget = '';
	const controls = doc.createElement('div');
	controls.dataset.sizeFields = '';
	const status = doc.createElement('p');
	status.dataset.sizeStatus = '';
	status.setAttribute('role', 'status');
	status.setAttribute('aria-live', 'polite');
	const error = doc.createElement('p');
	error.dataset.sizeError = '';
	error.setAttribute('role', 'alert');
	error.hidden = true;
	body.append(controls, target, status, error);
	pane.append(heading, body);
	for (const field of fields) {
		const label = doc.createElement('label');
		const caption = doc.createElement('span');
		caption.textContent = captions[field];
		const unit = doc.createElement('span');
		unit.className = 'size-unit';
		unit.setAttribute('aria-hidden', 'true');
		unit.textContent = field === 'angle' ? 'deg.' : 'in.';
		const input = doc.createElement('input');
		input.type = 'number';
		input.step = 'any';
		input.dataset.sizeField = field;
		input.setAttribute('aria-label', labels[field]);
		if (field === 'width' || field === 'height') input.min = '0';
		label.append(caption, input, unit);
		controls.append(label);
	}
	return pane;
}

/** One committed numeric field creates one strict selection transaction. */
export class ViewerSizePosition {
	readonly #pane: HTMLElement;
	readonly #inputs: Record<VisioSizePositionField, HTMLInputElement>;
	readonly #error: HTMLElement;
	readonly #status: HTMLElement;
	#identity = '';
	#initial = new Map<VisioSizePositionField, string>();
	#request = 0;
	#pending = false;
	#active = false;
	constructor(
		root: ShadowRoot,
		private readonly controller: ViewerController,
		private readonly checked: (open: boolean) => void,
	) {
		this.#pane = root.querySelector('.size-position')!;
		this.#inputs = Object.fromEntries(
			fields.map((field) => [
				field,
				this.#pane.querySelector<HTMLInputElement>(`[data-size-field="${field}"]`)!,
			]),
		) as Record<VisioSizePositionField, HTMLInputElement>;
		this.#error = this.#pane.querySelector('[data-size-error]')!;
		this.#status = this.#pane.querySelector('[data-size-status]')!;
	}
	toggle(open = Boolean(this.#pane.hidden)): void {
		this.#pane.hidden = !open;
		this.checked(open);
		if (!open) {
			++this.#request;
			if (this.#pending) this.controller.cancelEdit();
			this.#pending = false;
			this.#identity = '';
		}
		this.render(this.controller.state);
	}
	wire(): () => void {
		this.#active = true;
		const Abort = this.#pane.ownerDocument.defaultView?.AbortController ?? AbortController;
		const events = new Abort();
		const options = { signal: events.signal };
		this.#pane
			.querySelector('button')!
			.addEventListener('click', () => this.toggle(false), options);
		for (const field of fields) {
			const input = this.#inputs[field];
			input.addEventListener('blur', () => void this.#commit(field), options);
			input.addEventListener(
				'input',
				() => {
					this.#error.hidden = true;
					this.#status.textContent = '';
				},
				options,
			);
			input.addEventListener(
				'keydown',
				(event) => {
					if (event.isComposing) return;
					if (event.key === 'Enter') {
						event.preventDefault();
						void this.#commit(field);
					}
					if (event.key === 'Escape') {
						event.preventDefault();
						input.value = this.#initial.get(field) ?? '';
						this.#error.hidden = true;
						this.#status.textContent = '';
					}
				},
				options,
			);
		}
		return () => {
			this.#active = false;
			++this.#request;
			this.#pending = false;
			this.#identity = '';
			events.abort();
		};
	}
	#selection(state: ViewerState) {
		const page = state.document?.pages[state.pageIndex];
		const selected = state.selectedShapes.length === 1 ? state.selectedShape : null;
		return page && selected && visioSelectionIsOnPage(selected, page.id)
			? { page, id: selected.id }
			: undefined;
	}
	async #commit(field: VisioSizePositionField): Promise<void> {
		const input = this.#inputs[field];
		if (
			!this.#active ||
			this.#pending ||
			this.#pane.hidden ||
			input.disabled ||
			input.value === this.#initial.get(field)
		)
			return;
		const state = this.controller.state;
		const selection = this.#selection(state);
		if (!selection || state.loading || state.edit.busy || !state.edit.sourceAvailable) return;
		const command =
			input.value !== ''
				? visioSizePositionCommand(selection.page, selection.id, field, input.valueAsNumber)
				: undefined;
		if (this.controller.state !== state) return;
		if (!command) {
			this.#error.textContent =
				'Enter a finite value within the supported range; width and height must be positive.';
			this.#error.hidden = false;
			return;
		}
		if (!command.length) {
			input.value = this.#initial.get(field) ?? '';
			return;
		}
		const request = ++this.#request;
		this.#pending = true;
		this.#error.hidden = true;
		this.render(state);
		try {
			await this.controller.applySelectionEdits(command);
			if (request === this.#request && this.#active) {
				input.value = this.#initial.get(field) ?? '';
				this.#status.textContent = 'Shape updated.';
			}
		} catch (error) {
			if (request === this.#request && this.#active && !isEditCancellation(error)) {
				this.#error.textContent = editErrorMessage(error);
				this.#error.hidden = false;
			}
		} finally {
			if (request === this.#request && this.#active) {
				this.#pending = false;
				this.render(this.controller.state);
			}
		}
	}
	render(state: ViewerState): void {
		const selection = this.#selection(state);
		const values = selection ? visioSizePositionState(selection.page, selection.id) : undefined;
		if (state !== this.controller.state) return;
		const identity = JSON.stringify([
			this.controller.sourceGeneration,
			state.pageIndex,
			state.selectedShapes.map((shape) => [shape.pageId, shape.id]),
		]);
		const changed = identity !== this.#identity;
		if (changed) {
			this.#identity = identity;
			++this.#request;
			this.#pending = false;
			this.#error.hidden = true;
			this.#status.textContent = '';
		}
		for (const field of fields) {
			const input = this.#inputs[field];
			const dirty = !changed && input.value !== this.#initial.get(field);
			const next = values ? String(values[field]) : '';
			this.#initial.set(field, next);
			if (!dirty) input.value = next;
			input.disabled =
				!values || !state.edit.sourceAvailable || state.loading || state.edit.busy || this.#pending;
		}
		this.#pane.setAttribute('aria-busy', String(state.loading || state.edit.busy || this.#pending));
		// The rows speak for themselves while a shape is shown; otherwise say what to select.
		this.#pane.querySelector('[data-size-target]')!.textContent = values
			? ''
			: 'Select a shape to see its size and position.';
	}
}
