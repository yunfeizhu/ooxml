import type { VisioShape } from 'ooxml-core/visio';
import {
	editErrorMessage,
	isEditCancellation,
	visioTextDraftEdit,
	visioTextShape,
} from 'ooxml-core/visio/ui';
import type { ViewerController, ViewerState } from './controller';

interface Session {
	pageId: string;
	shapeId: string;
	initial: string;
	/** The loaded source; a different file ends the session without saving. */
	generation: number;
	document: ViewerState['document'];
	group: SVGGElement | null;
}

/**
 * Visio's in-place text editing: double-click a shape, press F2 or start typing with one shape
 * selected, and its text becomes editable where it is drawn. Esc, clicking elsewhere on the canvas
 * or selecting something else saves the change as one undoable edit (as in Visio, Esc keeps what
 * you typed); Enter starts a new line. Ribbon commands leave the editor open, and the draft
 * survives other edits to the same drawing. The editor is a plain textarea (`#edit-text`), so
 * Insert Symbol, Field and Spelling work on it.
 */
export class ViewerInlineText {
	readonly input: HTMLTextAreaElement;
	#session: Session | undefined;
	#request = 0;
	constructor(
		private readonly viewport: HTMLElement,
		private readonly controller: ViewerController,
		private readonly announce: (message: string) => void,
	) {
		const doc = viewport.ownerDocument;
		this.input = doc.createElement('textarea');
		this.input.id = 'edit-text';
		this.input.className = 'inline-text';
		this.input.spellcheck = true;
		this.input.hidden = true;
		this.input.setAttribute('aria-label', 'Shape text');
	}
	get editing(): boolean {
		return !!this.#session;
	}
	wire(): () => void {
		const Abort = this.viewport.ownerDocument.defaultView?.AbortController ?? AbortController;
		const events = new Abort();
		const options = { signal: events.signal };
		const input = this.input;
		input.addEventListener('input', () => this.#layout(), options);
		input.addEventListener(
			'keydown',
			(event) => {
				// The canvas shortcuts (Delete, arrows, tools) must not act while typing.
				event.stopPropagation();
				if (event.isComposing) return;
				if (event.key === 'Escape' || (event.key === 'Enter' && (event.ctrlKey || event.metaKey))) {
					event.preventDefault();
					void this.commit(true);
				}
			},
			options,
		);
		// A click inside the editor stays in it; a click elsewhere on the canvas saves, as in Visio.
		for (const name of ['pointerdown', 'click', 'dblclick', 'contextmenu'])
			input.addEventListener(name, (event) => event.stopPropagation(), options);
		this.viewport.addEventListener(
			'pointerdown',
			(event) => {
				if (this.#session && event.target !== input) void this.commit(false);
			},
			{ ...options, capture: true },
		);
		return () => {
			events.abort();
			++this.#request;
			this.#close();
			input.remove();
		};
	}
	/**
	 * Start editing the one selected shape's text. `typed` replaces the text with a typed character,
	 * as typing on a selected shape does in Visio. False when the selection has no editable text.
	 */
	start(typed?: string): boolean {
		const state = this.controller.state;
		const page = state.document?.pages[state.pageIndex];
		const selected = state.selectedShape;
		if (this.#session) {
			this.input.focus();
			return true;
		}
		if (!page || !selected || state.selectedShapes.length !== 1) {
			this.announce('Select one shape to edit its text.');
			return false;
		}
		if (!state.edit.sourceAvailable || state.edit.busy || state.loading) {
			this.announce('This drawing cannot be edited.');
			return false;
		}
		const shape = visioTextShape(page, selected.id);
		if (!shape) return false;
		const group = this.viewport.querySelector<SVGGElement>(
			`svg.paper [data-shape-id="${CSS.escape(shape.id)}"]`,
		);
		const initial = shape.text?.plainText ?? '';
		this.#session = {
			pageId: page.id,
			shapeId: shape.id,
			initial,
			generation: this.controller.sourceGeneration,
			document: state.document,
			group,
		};
		group?.setAttribute('data-editing-text', '');
		// Selection handles step aside while typing, as in Visio.
		this.viewport.dataset.textEditing = '';
		this.#style(shape, state.zoom || 1);
		this.input.value = typed ?? initial;
		this.input.hidden = false;
		this.viewport.append(this.input);
		this.#layout();
		this.input.focus({ preventScroll: true });
		const end = this.input.value.length;
		this.input.setSelectionRange(end, end);
		return true;
	}
	/** Save the draft as one edit; `focusCanvas` returns keyboard focus to the drawing. */
	async commit(focusCanvas: boolean): Promise<void> {
		const session = this.#session;
		if (!session) return;
		const draft = this.input.value;
		this.#close();
		if (focusCanvas) this.viewport.focus({ preventScroll: true });
		const state = this.controller.state;
		const page = state.document?.pages.find((item) => item.id === session.pageId);
		if (
			!page ||
			this.controller.sourceGeneration !== session.generation ||
			draft === session.initial
		)
			return;
		const request = ++this.#request;
		try {
			// A local shape with several formatting runs keeps them: only the changed span is
			// replaced. Typing over a stencil shape's inherited text replaces it whole, as in Visio.
			const shape = visioTextShape(page, session.shapeId);
			const rich = !!shape && shape.masterId === undefined && shape.text.runs.length > 1;
			const edit = visioTextDraftEdit(page, session.shapeId, draft, rich ? { ranges: true } : {});
			if (edit) await this.controller.applyEdits([edit]);
		} catch (error) {
			if (request === this.#request && !isEditCancellation(error))
				this.announce(editErrorMessage(error));
		}
	}
	/**
	 * Selecting something else or changing page saves; another edit to the same drawing (formatting,
	 * a move, undo) keeps the draft on the redrawn shape; a different file discards it.
	 */
	render(state: ViewerState): void {
		const session = this.#session;
		if (!session) return;
		const page = state.document?.pages[state.pageIndex];
		const shape = page?.id === session.pageId ? visioTextShape(page, session.shapeId) : undefined;
		if (this.controller.sourceGeneration !== session.generation || !state.document) {
			this.#close();
			return;
		}
		if (
			!shape ||
			state.selectedShapes.length !== 1 ||
			state.selectedShape?.id !== session.shapeId
		) {
			void this.commit(false);
			return;
		}
		if (state.document !== session.document) {
			const dirty = this.input.value !== session.initial;
			session.document = state.document;
			session.initial = shape.text?.plainText ?? '';
			if (!dirty) this.input.value = session.initial;
			session.group = this.viewport.querySelector<SVGGElement>(
				`svg.paper [data-shape-id="${CSS.escape(shape.id)}"]`,
			);
			session.group?.setAttribute('data-editing-text', '');
			this.#style(shape, state.zoom || 1);
		}
		// Redrawing the page replaces the canvas content, the editor with it: put it back as it was.
		if (!this.input.isConnected) {
			const { selectionStart, selectionEnd } = this.input;
			this.viewport.append(this.input);
			this.viewport.dataset.textEditing = '';
			this.input.focus({ preventScroll: true });
			this.input.setSelectionRange(selectionStart, selectionEnd);
		}
		this.#layout();
	}
	#close(): void {
		const session = this.#session;
		this.#session = undefined;
		session?.group?.removeAttribute('data-editing-text');
		delete this.viewport.dataset.textEditing;
		this.input.hidden = true;
		this.input.remove();
	}
	/** Match the shape's text: family, size at this zoom, colour and alignment. */
	#style(shape: VisioShape, zoom: number): void {
		const text = shape.text;
		const style = this.input.style;
		style.fontFamily = text?.fontFamily ? `"${text.fontFamily}", var(--office-font)` : '';
		style.fontSize = `${Math.max(8, (text?.fontSize ?? 12 / 72) * 96 * zoom)}px`;
		style.color = text?.color ?? '';
		style.textAlign =
			text?.horizontalAlign === 'justify' ? 'justify' : (text?.horizontalAlign ?? 'center');
		this.input.dataset.verticalAlign = text?.verticalAlign ?? 'middle';
	}
	/** Cover the shape's drawn box and keep the text vertically placed as the shape aligns it. */
	#layout(): void {
		const session = this.#session;
		if (!session) return;
		const box = this.viewport.getBoundingClientRect();
		const rect = session.group?.getBoundingClientRect();
		const width = Math.max(48, rect?.width ?? 160);
		const height = Math.max(24, rect?.height ?? 48);
		const style = this.input.style;
		style.left = `${(rect ? rect.left - box.left : 16) + this.viewport.scrollLeft}px`;
		style.top = `${(rect ? rect.top - box.top : 16) + this.viewport.scrollTop}px`;
		style.width = `${width}px`;
		// Measure the text alone (no padding, no height), then pad it to the shape's alignment.
		style.paddingTop = '0px';
		style.height = '0px';
		const content = this.input.scrollHeight;
		const free = Math.max(0, height - content);
		style.height = `${Math.max(height, content)}px`;
		const align = this.input.dataset.verticalAlign;
		style.paddingTop = `${align === 'top' ? 0 : align === 'bottom' ? free : free / 2}px`;
		// Text taller than the shape grows the frame the way the shape will: around its middle,
		// or away from the edge the text is aligned to. A shape sized by its text takes that size
		// when the edit is saved.
		const extra = Math.max(0, content - height);
		const shift = align === 'top' ? 0 : align === 'bottom' ? extra : extra / 2;
		if (shift)
			style.top = `${(rect ? rect.top - box.top : 16) + this.viewport.scrollTop - shift}px`;
	}
}
