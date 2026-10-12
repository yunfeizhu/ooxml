type Dialog = HTMLElement & { open: boolean; show(): void; close(): void };
type Button = HTMLElement & { disabled: boolean };
export interface FieldSpec {
	name: string;
	label: string;
	/** A select lists choices; a text field accepts at most `maxLength` characters. */
	choices?: boolean;
	maxLength?: number;
	placeholder?: string;
	/** A checkbox (read with `checked`) or a number field instead of text. */
	input?: 'checkbox' | 'number';
}

/**
 * A small form on the shared `office-ui-dialog` shell: labelled fields, an alert line and footer
 * buttons. Enter in a text field presses the first button. Document semantics stay with callers.
 */
export class InsertDialog {
	readonly dialog: Dialog;
	readonly error: HTMLElement;
	readonly fields = new Map<string, HTMLInputElement | HTMLSelectElement>();
	readonly buttons = new Map<string, Button>();
	constructor(
		root: ShadowRoot,
		className: string,
		heading: string,
		specs: readonly FieldSpec[],
		buttons: readonly string[],
		press: (button: string) => void,
	) {
		const doc = root.ownerDocument;
		this.dialog = doc.createElement('office-ui-dialog') as Dialog;
		this.dialog.className = className;
		this.dialog.setAttribute('heading', heading);
		for (const spec of specs) {
			const label = doc.createElement('label');
			label.textContent = spec.label;
			const field = doc.createElement(spec.choices ? 'select' : 'input') as
				| HTMLInputElement
				| HTMLSelectElement;
			field.name = spec.name;
			field.setAttribute('aria-label', spec.label);
			if (field instanceof HTMLInputElement) {
				field.type = spec.input ?? 'text';
				if (spec.input === 'number') field.step = 'any';
				if (!spec.input) field.maxLength = spec.maxLength ?? 4096;
				if (spec.placeholder) field.placeholder = spec.placeholder;
				field.addEventListener('keydown', (event) => {
					if (event.key !== 'Enter') return;
					event.preventDefault();
					press(buttons[0]!);
				});
			}
			if (spec.input === 'checkbox') label.prepend(field);
			else label.append(field);
			this.fields.set(spec.name, field);
			this.dialog.append(label);
		}
		this.error = doc.createElement('p');
		this.error.setAttribute('role', 'alert');
		this.dialog.append(this.error);
		for (const name of buttons) {
			const button = doc.createElement('office-ui-button') as Button;
			button.slot = 'footer';
			button.setAttribute('label', name);
			button.setAttribute('command', `${className}-${name.toLowerCase().replace(/\s+/g, '-')}`);
			button.addEventListener('office-command', () => {
				if (!button.disabled) press(name);
			});
			this.buttons.set(name, button);
			this.dialog.append(button);
		}
		root.append(this.dialog);
	}
	value(name: string): string {
		return this.fields.get(name)?.value ?? '';
	}
	checked(name: string): boolean {
		const field = this.fields.get(name);
		return field instanceof HTMLInputElement && field.checked;
	}
	/**
	 * Replace a select's choices; the current value is kept as an extra choice when unknown.
	 * `labels` names each value; `none: false` drops the leading empty choice.
	 */
	choices(
		name: string,
		values: readonly string[],
		current: string,
		options: { labels?: readonly string[]; none?: boolean } = {},
	): void {
		const select = this.fields.get(name);
		if (!(select instanceof HTMLSelectElement)) return;
		const doc = select.ownerDocument;
		const list = options.none === false ? [...values] : ['', ...values];
		if (!list.includes(current)) list.push(current);
		select.replaceChildren(
			...list.map((value) => {
				const option = doc.createElement('option');
				option.value = value;
				const index = values.indexOf(value);
				option.textContent =
					(index >= 0 ? options.labels?.[index] : undefined) ?? (value || '(none)');
				return option;
			}),
		);
		select.value = current;
	}
	busy(value: boolean): void {
		for (const field of this.fields.values()) field.disabled = value;
		for (const button of this.buttons.values()) button.disabled = value;
	}
}
