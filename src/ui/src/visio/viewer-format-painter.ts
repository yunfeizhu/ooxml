import {
	VISIO_FORMAT_PAINTER_LIMITS,
	visioFormatPainterEdits,
	visioFormatPainterSnapshot,
	visioSelectionIsOnPage,
	type VisioFormatPainterSnapshot,
} from 'ooxml-core/visio/ui';
import type { ViewerController, ViewerState } from './controller';
import type { RibbonCommand } from './ribbon-parts';

export type FormatPainterMode = 'once' | 'sticky' | 'cancel';
type Armed = { snapshot: VisioFormatPainterSnapshot; sticky: boolean; pageId: string };

const selectionKey = (state: ViewerState): string =>
	JSON.stringify(state.selectedShapes.map((item) => [item.pageId ?? '', item.id]));
const notCopied = (snapshot: VisioFormatPainterSnapshot): string =>
	snapshot.skipped.length ? ` Not copied: ${snapshot.skipped.join(', ')}.` : '';

/**
 * Visio's Format Painter: a click copies the selected shape's formatting and applies it once to
 * the next selection; a double click keeps it on until Escape or another click on the button.
 * Each application is one atomic, undoable edit of existing core format commands.
 */
export class ViewerFormatPainter {
	#armed: Armed | undefined;
	#key = '';
	constructor(
		private readonly root: ShadowRoot,
		private readonly controller: ViewerController,
		private readonly announce: (message: string) => void,
		private readonly edit: (run: () => Promise<void>, success: string) => void,
	) {}
	get armed(): boolean {
		return !!this.#armed;
	}
	/** Double clicking the button keeps the painter on (the second click arrives first). */
	wire(): () => void {
		const listener = () => this.run('sticky');
		const button = () => this.root.querySelector<RibbonCommand>('[command="format-painter"]');
		button()?.addEventListener('dblclick', listener);
		return () => {
			button()?.removeEventListener('dblclick', listener);
			this.#cancel();
		};
	}
	run(mode: FormatPainterMode): void {
		if (mode === 'cancel' || (mode === 'once' && this.#armed)) return this.#cancel(true);
		const state = this.controller.state;
		const page = state.document?.pages[state.pageIndex];
		const selected = state.selectedShape;
		if (
			!page ||
			!state.document ||
			!selected ||
			state.selectedShapes.length !== 1 ||
			!visioSelectionIsOnPage(selected, page.id) ||
			!this.#canEdit(state)
		)
			return;
		const snapshot = visioFormatPainterSnapshot(state.document, page, selected.id);
		if (!snapshot) return;
		this.#armed = { snapshot, sticky: mode === 'sticky', pageId: page.id };
		this.#key = selectionKey(state);
		this.render(state);
		this.announce(
			`Format Painter: select the shapes to format${mode === 'sticky' ? ', then press Escape to stop' : ''}.${notCopied(snapshot)}`,
		);
	}
	#cancel(announce = false): void {
		if (!this.#armed) return;
		this.#armed = undefined;
		this.render(this.controller.state);
		if (announce) this.announce('Format Painter is off.');
	}
	#canEdit(state: ViewerState): boolean {
		return state.edit.sourceAvailable && !state.loading && !state.edit.busy;
	}
	#apply(state: ViewerState, armed: Armed): void {
		const page = state.document?.pages[state.pageIndex];
		if (!page || page.id !== armed.pageId) return this.#cancel(true);
		const ids = state.selectedShapes.map((item) => item.id);
		const edits = visioFormatPainterEdits(page, armed.snapshot, ids);
		if (!armed.sticky) this.#cancel();
		if (!edits?.length) {
			this.announce(
				'Format Painter applies to single shapes: not groups, pictures, stencil connectors, drawn shapes on a layer or shapes on a locked layer.',
			);
			return;
		}
		this.edit(
			() => this.controller.applyEdits(edits),
			`Applied formatting to ${ids.length === 1 ? 'the shape' : `${ids.length} shapes`}.${notCopied(armed.snapshot)}`,
		);
	}
	render(state: ViewerState): void {
		const armed = this.#armed;
		if (armed && (!state.document || state.loading || !state.edit.sourceAvailable))
			this.#armed = undefined;
		const key = selectionKey(state);
		if (this.#armed && key !== this.#key && state.selectedShapes.length && this.#canEdit(state)) {
			this.#key = key;
			const current = this.#armed;
			queueMicrotask(() => this.#apply(this.controller.state, current));
		} else if (!this.#armed) this.#key = key;
		const button = this.root.querySelector<RibbonCommand>('[command="format-painter"]');
		if (!button) return;
		const page = state.document?.pages[state.pageIndex];
		const copyable =
			!!page &&
			!!state.document &&
			state.selectedShapes.length === 1 &&
			!!state.selectedShape &&
			visioSelectionIsOnPage(state.selectedShape, page.id) &&
			!!visioFormatPainterSnapshot(state.document, page, state.selectedShape.id);
		const reason = !state.edit.sourceAvailable
			? 'Open a .vsdx file to copy formatting.'
			: state.selectedShapes.length !== 1
				? 'Select one shape to copy its formatting.'
				: !copyable
					? 'Format Painter copies from a single shape: not a group, a picture, a stencil connector, a drawn shape on a layer or a shape on a locked layer.'
					: '';
		button.disabled = !this.#armed && (!!reason || !this.#canEdit(state));
		button.setAttribute('pressed', String(!!this.#armed));
		button.title = this.#armed
			? `Format Painter is on${this.#armed.sticky ? ' (press Escape to stop)' : ''}.${notCopied(this.#armed.snapshot)} ${VISIO_FORMAT_PAINTER_LIMITS}`
			: reason
				? `Format Painter: ${reason}`
				: `Format Painter: click to apply once, double-click to keep applying. ${VISIO_FORMAT_PAINTER_LIMITS}`;
	}
}
