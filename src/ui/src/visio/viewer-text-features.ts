import type { VisioEdit, VisioPage, VisioShape } from 'ooxml-core/visio';
import {
	VISIO_TEXT_LANGUAGES,
	editErrorMessage,
	isEditCancellation,
	visioFontFamilies,
	visioFormattingShape,
	visioSelectionIsOnPage,
	visioTextDialogPatch,
	visioTextDialogValues,
	type VisioTextDialogValues,
} from 'ooxml-core/visio/ui';
import type { ViewerController, ViewerState } from './controller';
import type { VisioTextFeature } from './ribbon-action';
import type { RibbonCommand } from './ribbon-parts';
import { createTextDialog, type TextDialogView } from './viewer-text-dialog';
import { ViewerTextBlockTool } from './viewer-text-block';
import { ViewerTextInsert } from './viewer-text-insert';
import { InsertDialog } from './viewer-insert-dialog';

type Edit = (run: () => Promise<void>, success: string) => void;
const EDITOR = '#edit-text';

/**
 * Text features: the Text dialog (Font and Paragraph launchers), the Text Block tool, Insert
 * Symbol and Field, and Review Spelling and Language. Spelling is the browser's own spell checker
 * in the shape text editor; no dictionary is bundled.
 */
export class ViewerTextFeatures {
	#dialog: TextDialogView;
	#language: InsertDialog;
	#insert: ViewerTextInsert;
	readonly textBlock: ViewerTextBlockTool;
	#initial: VisioTextDialogValues | undefined;
	#targets: { page: VisioPage; shapes: VisioShape[]; generation: number } | undefined;
	#editor: HTMLTextAreaElement | undefined;
	constructor(
		private readonly root: ShadowRoot,
		private readonly viewport: HTMLElement,
		private readonly controller: ViewerController,
		private readonly announce: (message: string) => void,
		private readonly edit: Edit,
		private readonly reveal: (panel: 'edit', focus: boolean) => void,
	) {
		this.#dialog = createTextDialog(root, (button) => void this.#applyDialog(button));
		this.#language = new InsertDialog(
			root,
			'language-dialog',
			'Language',
			[{ name: 'language', label: 'Mark selected text as', choices: true }],
			['OK', 'Cancel'],
			(button) => void this.#applyLanguage(button),
		);
		this.#insert = new ViewerTextInsert(root, controller, announce);
		this.textBlock = new ViewerTextBlockTool(viewport, controller, {
			announce,
			edit,
			changed: (active) =>
				root.querySelector('[command="text-block"]')?.setAttribute('pressed', String(active)),
		});
	}
	#state() {
		const state = this.controller.state;
		const page = state.document?.pages[state.pageIndex];
		const editing = state.edit.sourceAvailable && !state.loading && !state.edit.busy;
		const onPage =
			!!page && state.selectedShapes.every((item) => visioSelectionIsOnPage(item, page.id));
		const candidates =
			page && onPage ? state.selectedShapes.map((item) => visioFormattingShape(page, item.id)) : [];
		const shapes = candidates.filter((shape) => !!shape);
		const formattable = editing && shapes.length > 0 && shapes.length === candidates.length;
		return {
			state,
			page,
			editing,
			shapes,
			formattable,
			single: editing && onPage && state.selectedShapes.length === 1,
		};
	}
	/** The shape text editor, when it holds the caret for the selected shape. */
	#activeEditor(): HTMLTextAreaElement | undefined {
		const editor = this.#editor;
		return editor?.isConnected && !editor.disabled && !editor.hidden ? editor : undefined;
	}
	run(feature: VisioTextFeature): void {
		const { state, page, editing, shapes, formattable, single } = this.#state();
		if (feature === 'text-block') {
			if (editing || this.textBlock.active) this.textBlock.toggle();
			return;
		}
		if (!editing || !page) return;
		if (feature === 'spelling') return this.#spelling(page);
		if (feature === 'text-dialog' || feature === 'paragraph-dialog' || feature === 'language') {
			if (!formattable) {
				this.announce('Select shapes with local text to format.');
				return;
			}
			this.#targets = { page, shapes, generation: this.controller.documentGeneration };
			this.#initial = visioTextDialogValues(shapes.at(-1)!);
			if (feature === 'language') return this.#openLanguage(this.#initial.language);
			this.#dialog.error.textContent = '';
			this.#dialog.write(this.#initial, state.document ? visioFontFamilies(state.document) : []);
			this.#dialog.select(feature === 'paragraph-dialog' ? 'paragraph' : 'font');
			this.#dialog.dialog.show();
			return;
		}
		if (!single || !state.selectedShape) {
			this.announce(`Select one shape to insert a ${feature}.`);
			return;
		}
		const editor = this.#activeEditor();
		this.#insert.open(feature, {
			page,
			shapeId: state.selectedShape.id,
			...(editor ? { editor } : {}),
		});
	}
	#openLanguage(current: number): void {
		const select = this.#language.fields.get('language') as HTMLSelectElement;
		const doc = this.root.ownerDocument;
		const known = VISIO_TEXT_LANGUAGES.some((item) => item.id === current);
		select.replaceChildren(
			...[
				...(known || !current ? [] : [{ id: current, label: `Language ${current}` }]),
				...VISIO_TEXT_LANGUAGES,
			].map(({ id, label }) => {
				const option = doc.createElement('option');
				option.value = String(id);
				option.textContent = label;
				return option;
			}),
		);
		select.value = String(current || 1033);
		this.#language.error.textContent = '';
		this.#language.dialog.show();
		select.focus();
	}
	#commands(patch: object): VisioEdit[] | undefined {
		const targets = this.#targets;
		if (!targets || targets.generation !== this.controller.documentGeneration) return undefined;
		return targets.shapes.map((shape) => ({
			type: 'format-text' as const,
			pageId: targets.page.id,
			shapeId: shape.id,
			...patch,
		}));
	}
	async #run(view: { error: HTMLElement }, edits: VisioEdit[], message: string): Promise<boolean> {
		try {
			await this.controller.applyEdits(edits);
			this.announce(message);
			return true;
		} catch (error) {
			if (!isEditCancellation(error)) view.error.textContent = editErrorMessage(error);
			return false;
		}
	}
	async #applyDialog(button: string): Promise<void> {
		if (button === 'Cancel') return this.#dialog.dialog.close();
		const initial = this.#initial;
		if (!initial) return;
		const next = this.#dialog.read(initial);
		const patch = visioTextDialogPatch(initial, next);
		const edits = Object.keys(patch).length ? this.#commands(patch) : [];
		if (!edits) return this.#dialog.dialog.close();
		this.#dialog.error.textContent = '';
		this.#dialog.busy(true);
		const applied =
			!edits.length || (await this.#run(this.#dialog, edits, 'Updated text formatting.'));
		this.#dialog.busy(false);
		if (!applied) return;
		const page = this.controller.state.document?.pages[this.controller.state.pageIndex];
		const shapes = page
			? this.#targets!.shapes
					.map((shape) => visioFormattingShape(page, shape.id))
					.filter((s) => !!s)
			: [];
		if (page && shapes.length) {
			this.#targets = { page, shapes, generation: this.controller.documentGeneration };
			this.#initial = visioTextDialogValues(shapes.at(-1)!);
		}
		if (button === 'OK') this.#dialog.dialog.close();
	}
	async #applyLanguage(button: string): Promise<void> {
		if (button === 'Cancel') return this.#language.dialog.close();
		const language = Number(this.#language.value('language'));
		const edits = this.#commands({ language });
		if (!edits) return this.#language.dialog.close();
		const label = VISIO_TEXT_LANGUAGES.find((item) => item.id === language)?.label ?? language;
		if (await this.#run(this.#language, edits, `Marked the text as ${label}.`))
			this.#language.dialog.close();
	}
	#spelling(page: VisioPage): void {
		const state = this.controller.state;
		const selected = state.selectedShape;
		const texts: VisioShape[] = [];
		const visit = (shapes: readonly VisioShape[]) => {
			for (const shape of shapes) {
				if (shape.text.plainText.trim() && !shape.hidden) texts.push(shape);
				visit(shape.children);
			}
		};
		visit(page.shapes);
		const shape = texts.find((item) => item.id === selected?.id) ?? texts[0];
		if (!shape) {
			this.announce('This page has no shape text to check.');
			return;
		}
		if (shape.id !== selected?.id || state.selectedShapes.length !== 1)
			this.controller.selectShape({ id: shape.id, name: shape.name, pageId: page.id });
		this.reveal('edit', true);
		this.announce(
			`Spelling uses your browser's spell checker: misspelled words in "${shape.name || `Shape ${shape.id}`}" are underlined in the shape. Right-click a word for suggestions, then press Esc to keep the change. ${texts.length > 1 ? `${texts.length - 1} more shapes on this page have text.` : ''}`.trim(),
		);
	}
	wire(): () => void {
		const focus = (event: Event) => {
			const target = event.composedPath()[0];
			if (target instanceof HTMLTextAreaElement && target.matches(EDITOR)) this.#editor = target;
		};
		const pointer = (event: Event) => {
			if (event.target !== this.#editor) this.#editor = undefined;
		};
		this.root.addEventListener('focusin', focus);
		this.viewport.addEventListener('pointerdown', pointer, true);
		const disposeBlock = this.textBlock.wire();
		return () => {
			this.root.removeEventListener('focusin', focus);
			this.viewport.removeEventListener('pointerdown', pointer, true);
			disposeBlock();
			this.#dialog.dialog.close();
			this.#language.dialog.close();
			this.#insert.close();
		};
	}
	render(state: ViewerState, pointerTool: boolean): void {
		if (!pointerTool) this.textBlock.exit();
		this.textBlock.render(state);
		// Without a document the controller may be destroyed: never read its generations then.
		if (!state.document) {
			this.#insert.close();
			this.#dialog.dialog.close();
			this.#language.dialog.close();
		} else this.#insert.render();
		const { page, editing, formattable, single } = this.#state();
		if (
			state.document &&
			this.#targets &&
			this.#targets.generation !== this.controller.documentGeneration
		) {
			const stale = !this.#dialog.dialog.open && !this.#language.dialog.open;
			if (stale || !state.edit.sourceAvailable || state.loading) {
				this.#dialog.dialog.close();
				this.#language.dialog.close();
			}
		}
		const set = (element: Element | null, disabled: string, title: string) => {
			if (!element) return;
			(element as RibbonCommand).disabled = !!disabled;
			element.setAttribute('title', disabled ? `${title}: ${disabled}` : title);
		};
		const reason = !editing ? 'Open a .vsdx file to edit text.' : '';
		const select = reason || (!formattable ? 'Select shapes with local text.' : '');
		for (const [launcher, label] of [
			['font-dialog', 'Font options (Text dialog)'],
			['paragraph-dialog', 'Paragraph options (Text dialog)'],
		] as const) {
			const group = this.root.querySelector(`office-ui-ribbon-group[launcher="${launcher}"]`);
			group?.toggleAttribute('launcher-disabled', !!select);
			group?.setAttribute('title', select ? `${label}: ${select}` : label);
		}
		const button = (id: string) => this.root.querySelector(`[command="${id}"]`);
		set(button('text-block'), reason || (!page ? 'Open a page.' : ''), 'Text Block (Ctrl+Shift+4)');
		button('text-block')?.setAttribute('pressed', String(this.textBlock.active));
		const one = reason || (!single ? 'Select one shape.' : '');
		set(button('symbol'), one, 'Symbol');
		set(button('field'), one, 'Field');
		const hasText = (shapes: readonly VisioShape[]): boolean =>
			shapes.some((shape) => !!shape.text.plainText.trim() || hasText(shape.children));
		set(
			button('spelling'),
			reason || (!page || !hasText(page.shapes) ? 'This page has no shape text.' : ''),
			'Spelling (F7): browser spell checker',
		);
		set(button('language'), select, 'Language');
	}
}
