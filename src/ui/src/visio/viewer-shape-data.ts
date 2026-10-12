import {
	VISIO_SHAPE_DATA_TYPES,
	visioShapeDataRowName,
	type VisioShape,
	type VisioShapeDataType,
} from 'ooxml-core/visio';
import {
	editErrorMessage,
	isEditCancellation,
	visioSelectionIsOnPage,
	visioShapeDataText,
} from 'ooxml-core/visio/ui';
import type { ViewerController, ViewerState } from './controller';
import { selectedShape } from './shape-inspector';
import { InsertDialog } from './viewer-insert-dialog';

const TYPE_LABELS: Record<VisioShapeDataType, string> = {
	string: 'String',
	'fixed-list': 'Fixed List',
	number: 'Number',
	boolean: 'Boolean',
	'variable-list': 'Variable List',
	date: 'Date',
};
/** Rows this viewer keeps for itself (data graphic markers) are not offered for editing. */
const internal = (name: string) => name.startsWith('_ooxml');

/**
 * Visio's Define Shape Data dialog: add, change and delete the selected shape's Shape Data rows
 * (label, type, format, value, prompt, hidden). Each change is one undoable core edit.
 */
export class ViewerShapeData {
	readonly form: InsertDialog;
	#target: { pageId: string; shapeId: string; generation: number } | undefined;
	constructor(
		private readonly root: ShadowRoot,
		private readonly controller: ViewerController,
		private readonly announce: (message: string) => void,
	) {
		this.form = new InsertDialog(
			root,
			'shape-data-dialog',
			'Define Shape Data',
			[
				{ name: 'row', label: 'Properties', choices: true },
				{ name: 'label', label: 'Label', maxLength: 255 },
				{ name: 'dataType', label: 'Type', choices: true },
				{ name: 'format', label: 'Format (list choices separated by ;)' },
				{ name: 'value', label: 'Value', placeholder: 'Dates as yyyy-mm-dd' },
				{ name: 'prompt', label: 'Prompt' },
				{ name: 'hidden', label: 'Hidden', input: 'checkbox' },
			],
			['OK', 'Delete', 'Cancel'],
			(button) => void this.#press(button),
		);
		this.form.fields.get('row')!.addEventListener('change', () => this.#fill());
		this.form.choices('dataType', [...VISIO_SHAPE_DATA_TYPES], 'string', {
			labels: VISIO_SHAPE_DATA_TYPES.map((type) => TYPE_LABELS[type]),
			none: false,
		});
	}
	#shape(state: ViewerState): VisioShape | undefined {
		const page = state.document?.pages[state.pageIndex];
		if (
			!page ||
			state.selectedShapes.length !== 1 ||
			!state.selectedShape ||
			!visioSelectionIsOnPage(state.selectedShape, page.id)
		)
			return undefined;
		return selectedShape(state.document, state.selectedShape, state.pageIndex);
	}
	#editable(state: ViewerState): boolean {
		return state.edit.sourceAvailable && !state.loading && !state.edit.busy;
	}
	#rows(): VisioShape['shapeData'] {
		const state = this.controller.state;
		const shape = this.#shape(state);
		return (shape?.shapeData ?? []).filter((row) => !internal(row.name));
	}
	open(): void {
		const state = this.controller.state;
		const shape = this.#shape(state);
		const page = state.document?.pages[state.pageIndex];
		if (!this.#editable(state) || !shape || !page) {
			this.announce('Select one shape on an editable drawing to define its Shape Data.');
			return;
		}
		this.#target = {
			pageId: page.id,
			shapeId: shape.id,
			generation: this.controller.documentGeneration,
		};
		const rows = this.#rows()!;
		this.form.choices(
			'row',
			rows.map((row) => row.name),
			rows[0]?.name ?? '',
			{ labels: rows.map((row) => row.label || row.name) },
		);
		this.form.fields.get('row')!.querySelector('option[value=""]')!.textContent = 'New property';
		this.#fill();
		this.form.dialog.show();
		this.render(state);
		this.form.fields.get('label')!.focus();
	}
	#fill(): void {
		const name = this.form.value('row');
		const shape = this.#shape(this.controller.state);
		const row = this.#rows()!.find((item) => item.name === name);
		const set = (field: string, value: string) =>
			((this.form.fields.get(field) as HTMLInputElement).value = value);
		this.form.error.textContent = '';
		set('label', row ? row.label || row.name : '');
		set(
			'dataType',
			row && row.type >= 0 && row.type <= 5 ? VISIO_SHAPE_DATA_TYPES[row.type]! : 'string',
		);
		set('format', row?.format ?? '');
		set('value', row && shape ? (visioShapeDataText(shape, row.name) ?? '') : '');
		set('prompt', row?.prompt ?? '');
		(this.form.fields.get('hidden') as HTMLInputElement).checked = !!row?.invisible;
		this.form.buttons.get('Delete')!.hidden = !row;
		if (row && (row.type > 5 || row.type < 0))
			this.form.error.textContent =
				'This row has a type the editor does not write; saving changes it.';
	}
	async #press(button: string): Promise<void> {
		if (button === 'Cancel') return this.form.dialog.close();
		const target = this.#target;
		if (!target || this.controller.documentGeneration !== target.generation) return;
		const existing = this.form.value('row');
		const label = this.form.value('label').trim();
		if (button === 'OK' && !label) {
			this.form.error.textContent = 'Type a label.';
			return;
		}
		const row =
			existing ||
			visioShapeDataRowName(
				label,
				(this.#shape(this.controller.state)?.shapeData ?? []).map((item) => item.name),
			);
		const data =
			button === 'Delete'
				? null
				: {
						label,
						prompt: this.form.value('prompt'),
						type: this.form.value('dataType') as VisioShapeDataType,
						format: this.form.value('format'),
						value: this.form.value('value'),
						...(this.form.checked('hidden') ? { invisible: true } : {}),
					};
		try {
			await this.controller.applyEdits([{ type: 'set-shape-data', ...target, row, data }]);
			this.form.dialog.close();
			this.announce(data ? `Saved Shape Data ${label}.` : `Deleted Shape Data ${existing}.`);
		} catch (error) {
			if (this.form.dialog.open && !isEditCancellation(error))
				this.form.error.textContent = editErrorMessage(error);
		}
	}
	render(state: ViewerState): void {
		const shape = this.#editable(state) ? this.#shape(state) : undefined;
		for (const button of this.root.querySelectorAll<HTMLButtonElement>(
			'[data-define-shape-data]',
		)) {
			button.disabled = !shape;
			button.title = shape
				? "Add, change or delete this shape's Shape Data."
				: 'Select one shape on an editable drawing to define Shape Data.';
		}
		if (!this.form.dialog.open) return;
		const current = this.#shape(state);
		if (!state.edit.sourceAvailable || state.loading || current?.id !== this.#target?.shapeId)
			this.form.dialog.close();
		else if (this.#target) this.#target.generation = this.controller.documentGeneration;
		this.form.busy(state.edit.busy);
	}
}
