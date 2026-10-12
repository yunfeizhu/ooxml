export type ViewerDialogElement = HTMLElement & { open: boolean; show(): void; close(): void };
type Button = HTMLElement & { disabled: boolean };

/**
 * A Visio command dialog on the shared `office-ui-dialog` shell: a body for the caller's
 * controls, an alert line and footer buttons. Document text is only ever set as text.
 */
export class ViewerDialog {
	readonly dialog: ViewerDialogElement;
	readonly body: HTMLElement;
	readonly error: HTMLElement;
	readonly buttons = new Map<string, Button>();
	constructor(
		root: ShadowRoot,
		className: string,
		heading: string,
		buttons: readonly string[],
		press: (button: string) => void,
	) {
		const doc = root.ownerDocument;
		this.dialog = doc.createElement('office-ui-dialog') as ViewerDialogElement;
		this.dialog.className = `viewer-dialog ${className}`;
		this.dialog.setAttribute('heading', heading);
		this.body = doc.createElement('div');
		this.body.className = 'viewer-dialog-body';
		this.error = doc.createElement('p');
		this.error.setAttribute('role', 'alert');
		this.dialog.append(this.body, this.error);
		for (const name of buttons) {
			const button = doc.createElement('office-ui-button') as Button;
			button.slot = 'footer';
			button.setAttribute('label', name);
			button.setAttribute('command', `${className}-${name.toLowerCase().replace(/\W+/g, '-')}`);
			button.addEventListener('office-command', () => {
				if (!button.disabled) press(name);
			});
			this.buttons.set(name, button);
			this.dialog.append(button);
		}
		root.append(this.dialog);
	}
	get open(): boolean {
		return this.dialog.open;
	}
	show(): void {
		this.error.textContent = '';
		this.dialog.show();
	}
	close(): void {
		this.dialog.close();
	}
	busy(value: boolean): void {
		for (const control of this.body.querySelectorAll<HTMLInputElement>('input, select, button'))
			control.disabled = value || control.dataset.unavailable !== undefined;
		for (const button of this.buttons.values()) button.disabled = value;
	}
}

/** A labelled native checkbox or radio; `label` is plain text. */
export function choice(
	doc: Document,
	type: 'checkbox' | 'radio',
	name: string,
	value: string,
	label: string,
): { row: HTMLLabelElement; input: HTMLInputElement } {
	const row = doc.createElement('label');
	row.className = 'viewer-dialog-choice';
	const input = doc.createElement('input');
	input.type = type;
	input.name = name;
	input.value = value;
	row.append(input, label);
	return { row, input };
}

/** A fieldset with a plain-text legend. */
export function fieldset(doc: Document, legend: string, ...children: Node[]): HTMLFieldSetElement {
	const set = doc.createElement('fieldset');
	const caption = doc.createElement('legend');
	caption.textContent = legend;
	set.append(caption, ...children);
	return set;
}
