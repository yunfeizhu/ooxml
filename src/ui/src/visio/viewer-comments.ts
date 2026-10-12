import type { VisioComment, VisioEdit, VisioPage, VisioShape } from 'ooxml-core/visio';
import { visioSelectionIsOnPage } from 'ooxml-core/visio/ui';
import type { OfficeUiCommentsPane } from '../comments/comments-pane';
import { commentInitials, readOfficeProfile } from '../controls';
import type { ViewerController, ViewerState } from './controller';
import type { RibbonCommand } from './ribbon-parts';
import {
	commentThreadId,
	drawCommentMarkers,
	findCommentShape,
	PAGE_THREAD,
	threadShapeId,
	visioCommentThreads,
} from './viewer-comment-threads';

export { visioCommentThreads } from './viewer-comment-threads';

type Run = (action: () => Promise<void>, success: string) => void;

/**
 * Review comments: the shared comments pane in a side pane, comment markers on the canvas, and
 * the add, reply, edit, delete and resolve edits. The author is the shared Office profile name.
 */
export class ViewerComments {
	readonly host: HTMLElement;
	readonly pane: OfficeUiCommentsPane;
	#pageAnchor = false;
	#threadsKey: unknown[] = [];
	#markers: { svg: SVGSVGElement | null; key: unknown[] } = { svg: null, key: [] };
	constructor(
		private readonly root: ShadowRoot,
		private readonly viewport: HTMLElement,
		private readonly controller: ViewerController,
		private readonly announce: (message: string) => void,
		private readonly run: Run,
	) {
		const doc = root.ownerDocument;
		this.host = doc.createElement('aside');
		this.host.className = 'review-pane comments-pane-host';
		this.host.setAttribute('aria-label', 'Comments');
		this.host.hidden = true;
		this.pane = doc.createElement('office-ui-comments-pane') as OfficeUiCommentsPane;
		this.pane.closable = true;
		this.pane.labels = { empty: 'No comments on this page.' };
		this.host.append(this.pane);
		(root.querySelector('.workspace') ?? root).append(this.host);
	}
	get open(): boolean {
		return !this.host.hidden;
	}
	#author(): { author: string; initials: string } {
		const profile = readOfficeProfile();
		const author = profile.displayName.trim() || 'Anonymous';
		return { author, initials: (profile.initial || commentInitials(author)).slice(0, 16) };
	}
	#editable(state = this.controller.state): boolean {
		return state.edit.sourceAvailable && !state.loading && !state.edit.busy;
	}
	#page(state = this.controller.state): VisioPage | undefined {
		return state.document?.pages[state.pageIndex];
	}
	/** The shape a new comment attaches to: the single selected shape on this page, if any. */
	#target(state = this.controller.state): VisioShape | undefined {
		const page = this.#page(state);
		const selected = state.selectedShape;
		if (this.#pageAnchor || !page || state.selectedShapes.length !== 1 || !selected)
			return undefined;
		if (!visioSelectionIsOnPage(selected, page.id)) return undefined;
		return findCommentShape(page.shapes, selected.id);
	}
	show(open = true): void {
		this.host.hidden = !open;
		if (!open) this.#pageAnchor = false;
		this.render(this.controller.state);
	}
	/** Review > New Comment (or the page menu's Add Comment): open the pane at its new-comment box. */
	newComment(onPage: boolean): void {
		const state = this.controller.state;
		if (!this.#page(state) || !this.#editable(state)) return;
		this.#pageAnchor = onPage;
		this.show(true);
		this.pane.updateComplete
			.then(() => this.pane.shadowRoot?.querySelector<HTMLTextAreaElement>('textarea.new')?.focus())
			.catch(() => {});
	}
	#comment(id: string): VisioComment | undefined {
		const page = this.#page();
		return this.controller.state.document?.comments?.find(
			(comment) => comment.id === id && comment.pageId === page?.id,
		);
	}
	#apply(edits: VisioEdit[], message: string): void {
		if (!edits.length || !this.#editable()) return;
		this.run(() => this.controller.applyEdits(edits), message);
	}
	#add(text: string, shapeId: string | undefined): void {
		const page = this.#page();
		if (!page) return;
		this.#apply(
			[
				{
					type: 'add-comment',
					pageId: page.id,
					...(shapeId === undefined ? {} : { shapeId }),
					...this.#author(),
					text,
					date: new Date().toISOString(),
				},
			],
			'Added a comment.',
		);
		this.#pageAnchor = false;
	}
	#threadComments(thread: string): VisioComment[] {
		const page = this.#page();
		return (this.controller.state.document?.comments ?? []).filter(
			(comment) => comment.pageId === page?.id && commentThreadId(comment) === thread,
		);
	}
	#legacy(comments: readonly (VisioComment | undefined)[]): boolean {
		if (!comments.some((comment) => comment?.legacy)) return false;
		this.announce('Visio 2010 annotations are shown read only.');
		return true;
	}
	wire(): () => void {
		const Abort = this.root.ownerDocument.defaultView?.AbortController ?? AbortController;
		const events = new Abort();
		const options = { signal: events.signal };
		const on = <T>(name: string, listener: (detail: T) => void) =>
			this.pane.addEventListener(
				name,
				(event) => listener((event as CustomEvent<T>).detail),
				options,
			);
		on<{ text: string }>('comment-add', ({ text }) => this.#add(text, this.#target()?.id));
		on<{ threadId: string; text: string }>('comment-reply', ({ threadId, text }) =>
			this.#add(text, threadShapeId(threadId)),
		);
		on<{ commentId: string; text: string }>('comment-edit', ({ commentId, text }) => {
			const comment = this.#comment(commentId);
			if (!comment || this.#legacy([comment])) return;
			this.#apply(
				[
					{
						type: 'edit-comment',
						pageId: comment.pageId,
						commentId,
						text,
						date: new Date().toISOString(),
					},
				],
				'Edited the comment.',
			);
		});
		on<{ commentId: string }>('comment-delete', ({ commentId }) => {
			const comment = this.#comment(commentId);
			if (!comment || this.#legacy([comment])) return;
			this.#apply(
				[{ type: 'delete-comment', pageId: comment.pageId, commentId }],
				'Deleted the comment.',
			);
		});
		for (const [name, done] of [
			['thread-resolve', true],
			['thread-reopen', false],
		] as const)
			on<{ threadId: string }>(name, ({ threadId }) => {
				const comments = this.#threadComments(threadId);
				if (this.#legacy(comments)) return;
				const date = new Date().toISOString();
				this.#apply(
					comments
						.filter((comment) => !!comment.done !== done)
						.map((comment) => ({
							type: 'edit-comment' as const,
							pageId: comment.pageId,
							commentId: comment.id,
							done,
							date,
						})),
					done ? 'Resolved the comments.' : 'Reopened the comments.',
				);
			});
		on<{ threadId: string }>('thread-select', ({ threadId }) => this.#select(threadId));
		on('comments-close', () => this.show(false));
		// A canvas marker opens its conversation; it never starts a selection drag or marquee.
		const marker = (event: Event) =>
			(event.target as Element | null)?.closest?.<SVGGElement>('[data-comment-marker]');
		this.viewport.addEventListener(
			'pointerdown',
			(event) => {
				if (marker(event)) event.stopPropagation();
			},
			{ ...options, capture: true },
		);
		this.viewport.addEventListener(
			'click',
			(event) => {
				const target = marker(event);
				if (!target) return;
				event.stopPropagation();
				event.preventDefault();
				this.#pageAnchor = false;
				this.show(true);
				this.#select(target.dataset.commentMarker!);
			},
			{ ...options, capture: true },
		);
		return () => events.abort();
	}
	#select(thread: string): void {
		this.pane.activeThreadId = thread;
		if (thread === PAGE_THREAD) return this.controller.selectShape(null);
		const page = this.#page();
		const shape = page && findCommentShape(page.shapes, threadShapeId(thread)!);
		if (shape) this.controller.selectShape({ id: shape.id, name: shape.name });
	}
	render(state: ViewerState): void {
		const page = this.#page(state);
		const editable = this.#editable(state);
		const key = [state.document, state.pageIndex];
		if (key.some((value, index) => value !== this.#threadsKey[index])) {
			this.#threadsKey = key;
			this.pane.threads = state.document && page ? visioCommentThreads(state.document, page) : [];
		}
		this.pane.readOnly = !editable;
		this.pane.addDisabled = !page;
		this.pane.currentAuthor = this.#author().author;
		const target = this.#target(state);
		const newComment = target
			? `New comment on ${target.name || `shape ${target.id}`}`
			: `New comment on ${page ? page.name : 'the page'}`;
		if (this.pane.labels.newComment !== newComment)
			this.pane.labels = { empty: 'No comments on this page.', newComment };
		const button = (name: string) => this.root.querySelector<RibbonCommand>(`[command="${name}"]`);
		const reason = !page
			? 'Open a drawing first.'
			: !state.edit.sourceAvailable
				? 'Open a .vsdx file to add comments.'
				: !editable
					? 'Wait for the current operation to finish.'
					: '';
		for (const name of ['new-comment', 'ctx-comment', 'ctx-page-comment']) {
			const control = button(name);
			if (!control) continue;
			control.disabled = !!reason;
			control.title = reason ? `Add a comment: ${reason}` : 'Add a comment (saved in the drawing).';
		}
		const pane = button('comments-pane');
		if (pane) {
			pane.disabled = !page;
			pane.setAttribute('pressed', String(this.open));
		}
		this.#renderMarkers(state, page);
	}
	/** Comment markers follow every canvas re-render, page change and zoom. */
	#renderMarkers(state: ViewerState, page: VisioPage | undefined): void {
		const svg = this.viewport.querySelector<SVGSVGElement>('svg.paper');
		const key = [state.document, state.pageIndex, state.zoom];
		if (
			svg === this.#markers.svg &&
			svg?.querySelector('[data-comment-markers]') &&
			key.every((value, index) => value === this.#markers.key[index])
		)
			return;
		this.#markers = { svg, key };
		svg?.querySelector('[data-comment-markers]')?.remove();
		if (svg && page && state.document) drawCommentMarkers(svg, state.document, page, state.zoom);
	}
}
