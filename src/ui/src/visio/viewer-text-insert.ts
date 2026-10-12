import type { VisioEdit, VisioPage } from 'ooxml-core/visio';
import {
	VISIO_FIELD_CATEGORIES,
	editErrorMessage,
	isEditCancellation,
	visioTextAppendEdit,
	visioTextShape,
	visioTextSource,
	type VisioFieldCategory,
} from 'ooxml-core/visio/ui';
import type { ViewerController } from './controller';

type Dialog = HTMLElement & { open: boolean; show(): void; close(): void };
type Button = HTMLElement & { disabled: boolean };
export interface TextInsertTarget {
	page: VisioPage;
	shapeId: string;
	/** The shape text editor when it holds the caret for this shape. */
	editor?: HTMLTextAreaElement;
}

function footer(dialog: Dialog, names: readonly string[], press: (name: string) => void) {
	const buttons = new Map<string, Button>();
	for (const name of names) {
		const button = dialog.ownerDocument.createElement('office-ui-button') as Button;
		button.slot = 'footer';
		button.setAttribute('label', name);
		button.setAttribute('command', `${dialog.className}-${name.toLowerCase()}`);
		button.addEventListener('office-command', () => {
			if (!button.disabled) press(name);
		});
		buttons.set(name, button);
		dialog.append(button);
	}
	return buttons;
}
const note = (doc: Document, text: string, role?: string) => {
	const paragraph = doc.createElement('p');
	paragraph.className = 'text-dialog-note';
	if (role) paragraph.setAttribute('role', role);
	paragraph.textContent = text;
	return paragraph;
};

/** Insert > Symbol and Insert > Field. Edits go through the controller; fields stay atomic. */
export class ViewerTextInsert {
	readonly symbol: Dialog;
	readonly field: Dialog;
	#symbolError: HTMLElement;
	#fieldError: HTMLElement;
	#selects: Record<'category' | 'field' | 'format', HTMLSelectElement>;
	#formula: HTMLInputElement;
	#target: TextInsertTarget | undefined;
	#generation = -1;
	#pending = false;
	constructor(
		root: ShadowRoot,
		private readonly controller: ViewerController,
		private readonly announce: (message: string) => void,
	) {
		const doc = root.ownerDocument;
		this.symbol = doc.createElement('office-ui-dialog') as Dialog;
		this.symbol.className = 'symbol-dialog';
		this.symbol.setAttribute('heading', 'Symbol');
		const picker = doc.createElement('office-ui-symbol-picker');
		picker.addEventListener('office-symbol-pick', (event) => {
			void this.#insertSymbol((event as CustomEvent<{ symbol: string }>).detail.symbol);
		});
		this.#symbolError = note(doc, '', 'alert');
		this.symbol.append(picker, this.#symbolError);
		footer(this.symbol, ['Close'], () => this.symbol.close());
		this.field = doc.createElement('office-ui-dialog') as Dialog;
		this.field.className = 'field-dialog';
		this.field.setAttribute('heading', 'Field');
		const select = (name: string, label: string) => {
			const wrapper = doc.createElement('label');
			const caption = doc.createElement('span');
			caption.textContent = label;
			const input = doc.createElement('select');
			input.name = `field-${name}`;
			input.setAttribute('aria-label', label);
			wrapper.append(caption, input);
			this.field.append(wrapper);
			return input;
		};
		this.#selects = {
			category: select('category', 'Category'),
			field: select('field', 'Field name'),
			format: select('format', 'Format'),
		};
		const formula = doc.createElement('label');
		const caption = doc.createElement('span');
		caption.textContent = 'Custom formula';
		this.#formula = doc.createElement('input');
		this.#formula.name = 'field-formula';
		this.#formula.placeholder = 'Width*2';
		this.#formula.maxLength = 1024;
		this.#formula.setAttribute('aria-label', 'Custom formula');
		formula.append(caption, this.#formula);
		this.#fieldError = note(doc, '', 'alert');
		this.field.append(
			formula,
			note(
				doc,
				"Fields are evaluated when inserted. Page, document and date fields show current values when the drawing is opened; Width, Height, Angle and custom formulas use the shape's own cells.",
			),
			this.#fieldError,
		);
		const options = (input: HTMLSelectElement, values: readonly [string, string][]) =>
			input.replaceChildren(
				...values.map(([value, text]) => {
					const option = doc.createElement('option');
					option.value = value;
					option.textContent = text;
					return option;
				}),
			);
		options(
			this.#selects.category,
			VISIO_FIELD_CATEGORIES.map((category) => [category.id, category.label]),
		);
		const sync = () => {
			const category = this.#category();
			options(
				this.#selects.field,
				category.fields.map((item) => [item.formula, item.label]),
			);
			options(
				this.#selects.format,
				category.formats.map((item) => [item.format, item.label]),
			);
			this.#selects.field.parentElement!.hidden = category.id === 'custom';
			formula.hidden = category.id !== 'custom';
		};
		this.#selects.category.addEventListener('change', sync);
		sync();
		footer(this.field, ['OK', 'Cancel'], (name) =>
			name === 'OK' ? void this.#insertField() : this.field.close(),
		);
		root.append(this.symbol, this.field);
	}
	#category() {
		return (
			VISIO_FIELD_CATEGORIES.find((item) => item.id === this.#selects.category.value) ??
			VISIO_FIELD_CATEGORIES[0]!
		);
	}
	open(kind: 'symbol' | 'field', target: TextInsertTarget): void {
		this.#target = target;
		this.#generation = this.controller.documentGeneration;
		const dialog = kind === 'symbol' ? this.symbol : this.field;
		this.#symbolError.textContent = '';
		this.#fieldError.textContent = '';
		dialog.show();
		if (kind === 'field') this.#selects.category.focus();
	}
	close(): void {
		this.symbol.close();
		this.field.close();
	}
	/** Close when the drawing the dialog was opened for is replaced. */
	render(): void {
		if (this.#pending || this.controller.documentGeneration === this.#generation) return;
		if (this.#target?.editor) return;
		this.close();
	}
	async #apply(edit: VisioEdit | undefined, error: HTMLElement, done: string): Promise<boolean> {
		if (!edit) return false;
		this.#pending = true;
		try {
			await this.controller.applyEdits([edit]);
			this.#generation = this.controller.documentGeneration;
			const page = this.controller.state.document?.pages.find(
				(item) => item.id === this.#target?.page.id,
			);
			if (page && this.#target) this.#target = { ...this.#target, page };
			this.announce(done);
			return true;
		} catch (failure) {
			if (!isEditCancellation(failure)) error.textContent = editErrorMessage(failure);
			return false;
		} finally {
			this.#pending = false;
		}
	}
	async #insertSymbol(symbol: string): Promise<void> {
		const target = this.#target;
		if (!target) return;
		this.#symbolError.textContent = '';
		const editor = target.editor;
		if (editor?.isConnected && !editor.disabled) {
			editor.setRangeText(symbol, editor.selectionStart, editor.selectionEnd, 'end');
			editor.dispatchEvent(new Event('input', { bubbles: true }));
			this.announce(`Inserted ${symbol} in the text editor. Apply the text to save it.`);
			return;
		}
		try {
			await this.#apply(
				visioTextAppendEdit(target.page, target.shapeId, symbol),
				this.#symbolError,
				`Inserted ${symbol}.`,
			);
		} catch (failure) {
			this.#symbolError.textContent = editErrorMessage(failure);
		}
	}
	async #insertField(): Promise<void> {
		const target = this.#target;
		if (!target) return;
		this.#fieldError.textContent = '';
		const category = this.#category();
		const formula = (
			category.id === 'custom' ? this.#formula.value : this.#selects.field.value
		).trim();
		if (!formula) {
			this.#fieldError.textContent = 'Type a formula, for example Width*2.';
			return;
		}
		const shape = visioTextShape(target.page, target.shapeId);
		if (!shape) return;
		const placement: { offset?: number; expectedText?: string } = {};
		const editor = target.editor;
		if (editor?.isConnected && !editor.disabled) {
			if (editor.value !== shape.text.plainText) {
				this.#fieldError.textContent =
					'Apply or cancel the text editor changes first; the field is inserted at the caret of the saved text.';
				return;
			}
			const source = visioTextSource(shape.text);
			const caret = editor.selectionStart;
			if (source.fieldAt(caret)) {
				this.#fieldError.textContent = 'Move the caret out of the field first.';
				return;
			}
			placement.offset = source.toSource(caret);
			placement.expectedText = source.source;
		}
		const edit: VisioEdit = {
			type: 'insert-text-field',
			pageId: target.page.id,
			shapeId: target.shapeId,
			formula,
			format: this.#selects.format.value,
			...placement,
		};
		if (await this.#apply(edit, this.#fieldError, `Inserted a ${category.label} field.`))
			this.field.close();
	}
}
export type { VisioFieldCategory };
