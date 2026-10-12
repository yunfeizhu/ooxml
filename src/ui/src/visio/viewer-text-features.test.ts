import { afterEach, expect, it, vi } from 'vitest';
import { setupFormattingViewer } from './__fixtures__/formatting-viewer';

afterEach(() => {
	document.body.replaceChildren();
	vi.restoreAllMocks();
});
const setup = async (source = true) => {
	const view = await setupFormattingViewer(source);
	const dialog = (name: string) =>
		view.root.querySelector<HTMLElement & { open: boolean }>(`.${name}`)!;
	const dialogButton = (name: string, label: string) =>
		dialog(name)
			.querySelector(`[label="${label}"]`)!
			.shadowRoot!.querySelector<HTMLButtonElement>('button')!
			.click();
	const launcher = (command: string) =>
		view.root.querySelector<HTMLElement>(`office-ui-ribbon-group[launcher="${command}"]`)!;
	const input = <T extends HTMLInputElement | HTMLSelectElement>(name: string) =>
		view.root.querySelector<T>(`[name="${name}"]`)!;
	return { ...view, dialog, dialogButton, launcher, input };
};

it('opens the Text dialog from the Font and Paragraph launchers and writes only changes', async () => {
	const view = await setup();
	expect(view.launcher('font-dialog').hasAttribute('launcher-disabled')).toBe(true);
	view.selection();
	expect(view.launcher('font-dialog').hasAttribute('launcher-disabled')).toBe(false);
	view.launcher('paragraph-dialog').dispatchEvent(
		new CustomEvent('office-command', {
			detail: { command: 'paragraph-dialog' },
			bubbles: true,
			composed: true,
		}),
	);
	expect(view.dialog('text-dialog').open).toBe(true);
	expect(
		view.root.querySelector('[data-text-tab="paragraph"]')!.getAttribute('aria-selected'),
	).toBe('true');
	view.input<HTMLSelectElement>('text-textCase').value = 'all-caps';
	view.input<HTMLInputElement>('text-letterSpacing').value = '1.5';
	view.input<HTMLInputElement>('text-spaceAfter').value = '6';
	view.input<HTMLInputElement>('text-backgroundOn').checked = true;
	view.input<HTMLInputElement>('text-backgroundColor').value = '#ffee00';
	view.dialogButton('text-dialog', 'OK');
	await vi.waitFor(() => expect(view.edits).toHaveLength(1));
	await view.done();
	expect(view.edits[0]![0]).toEqual({
		type: 'format-text',
		pageId: '1',
		shapeId: '1',
		textCase: 'all-caps',
		letterSpacing: 1.5,
		spaceAfter: 6,
		textBackground: '#ffee00',
	});
	expect(view.dialog('text-dialog').open).toBe(false);
	const text = view.shape().text;
	expect(text.runs[0]).toMatchObject({ textCase: 'all-caps' });
	expect(text.backgroundColor).toBe('#ffee00');
	expect(view.feedback.at(-1)).toBe('Updated text formatting.');
	await view.controller.undo();
	expect(view.shape().text.backgroundColor).toBeUndefined();
	view.dispose();
});

it('toggles the Text Block tool with its button and Ctrl+Shift+4', async () => {
	const view = await setup();
	expect(view.button('text-block').disabled).toBe(false);
	view.press('text-block');
	expect(view.button('text-block').getAttribute('pressed')).toBe('true');
	expect(view.viewport.dataset.textBlock).toBe('true');
	expect(view.feedback.at(-1)).toMatch(/Text Block tool/);
	view.viewport.dispatchEvent(
		new KeyboardEvent('keydown', {
			key: '$',
			code: 'Digit4',
			ctrlKey: true,
			shiftKey: true,
			bubbles: true,
			composed: true,
		}),
	);
	expect(view.button('text-block').getAttribute('pressed')).toBe('false');
	view.dispose();
	const readOnly = await setup(false);
	expect(readOnly.button('text-block').disabled).toBe(true);
	readOnly.dispose();
});

it('inserts a symbol into the selected shape text through an undoable range edit', async () => {
	const view = await setup();
	expect(view.button('symbol').disabled).toBe(true);
	view.selection();
	view.press('symbol');
	expect(view.dialog('symbol-dialog').open).toBe(true);
	view.root
		.querySelector('office-ui-symbol-picker')!
		.dispatchEvent(
			new CustomEvent('office-symbol-pick', { detail: { symbol: '©', code: 'U+00A9' } }),
		);
	await vi.waitFor(() => expect(view.edits).toHaveLength(1));
	await view.done();
	expect(view.edits[0]![0]).toMatchObject({ type: 'replace-text-ranges' });
	expect(view.shape().text.plainText).toBe('Formatted shape©');
	view.dispose();
});

it('inserts the symbol at the text editor caret without saving', async () => {
	const view = await setup();
	const details = document.createElement('details');
	details.open = true;
	const editor = document.createElement('textarea');
	editor.id = 'edit-text';
	editor.value = 'abc';
	details.append(editor);
	view.root.append(details);
	view.selection();
	editor.focus();
	editor.setSelectionRange(1, 1);
	view.press('symbol');
	view.root
		.querySelector('office-ui-symbol-picker')!
		.dispatchEvent(
			new CustomEvent('office-symbol-pick', { detail: { symbol: '™', code: 'U+2122' } }),
		);
	await vi.waitFor(() => expect(editor.value).toBe('a™bc'));
	expect(view.edits).toEqual([]);
	view.dispose();
});

it('inserts page and geometry fields that render as evaluated text and stay undoable', async () => {
	const view = await setup();
	expect(view.button('field').disabled).toBe(true);
	view.selection();
	view.press('field');
	expect(view.dialog('field-dialog').open).toBe(true);
	const category = view.input<HTMLSelectElement>('field-category');
	category.value = 'page';
	category.dispatchEvent(new Event('change'));
	expect(view.input<HTMLSelectElement>('field-field').value).toBe('PAGENAME()');
	view.dialogButton('field-dialog', 'OK');
	await vi.waitFor(() => expect(view.edits).toHaveLength(1));
	await view.done();
	expect(view.edits[0]![0]).toMatchObject({ type: 'insert-text-field', formula: 'PAGENAME()' });
	expect(view.shape().text.plainText).toBe('Formatted shapeImported page');
	expect(view.shape().text.fields).toHaveLength(1);
	expect(view.dialog('field-dialog').open).toBe(false);
	view.press('field');
	category.value = 'custom';
	category.dispatchEvent(new Event('change'));
	view.input<HTMLInputElement>('field-formula').value = 'INDIRECT("x")';
	view.dialogButton('field-dialog', 'OK');
	await vi.waitFor(() =>
		expect(view.dialog('field-dialog').querySelector('[role="alert"]')!.textContent).toMatch(
			/dynamic/,
		),
	);
	await view.controller.undo();
	expect(view.shape().text.fields).toBeUndefined();
	view.dispose();
});

it('marks the proofing language, keeps Thesaurus disabled and starts Spelling in the editor', async () => {
	const view = await setup();
	expect(view.button('thesaurus').disabled).toBe(true);
	expect(view.button('thesaurus').title).toMatch(/No thesaurus dictionary/);
	view.selection();
	view.press('language');
	expect(view.dialog('language-dialog').open).toBe(true);
	view.input<HTMLSelectElement>('language').value = '1036';
	view.dialogButton('language-dialog', 'OK');
	await vi.waitFor(() => expect(view.edits).toHaveLength(1));
	await view.done();
	expect(view.edits[0]![0]).toMatchObject({ type: 'format-text', language: 1036 });
	expect(view.shape().text.runs[0]!.language).toBe(1036);
	// Spelling selects the first shape with text and opens it for in-place editing.
	view.controller.clearSelection();
	view.press('spelling');
	expect(view.controller.state.selectedShape?.id).toBe('1');
	expect(view.feedback.at(-1)).toMatch(/browser's spell checker/);
	view.dispose();
});
