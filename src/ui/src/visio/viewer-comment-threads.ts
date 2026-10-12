import type { VisioComment, VisioDocument, VisioPage, VisioShape } from 'ooxml-core/visio';
import { visioShapePageBox } from 'ooxml-core/visio/ui';
import type { OfficeCommentThread } from '../controls';

/** The conversation of the comments on the page itself; shape conversations are `shape:<id>`. */
export const PAGE_THREAD = 'page';
export const commentThreadId = (comment: Pick<VisioComment, 'shapeId'>) =>
	comment.shapeId === undefined ? PAGE_THREAD : `shape:${comment.shapeId}`;
export const threadShapeId = (thread: string) =>
	thread === PAGE_THREAD ? undefined : thread.slice('shape:'.length);

export function findCommentShape(
	shapes: readonly VisioShape[],
	id: string,
): VisioShape | undefined {
	for (const shape of shapes) {
		if (shape.id === id) return shape;
		const nested = findCommentShape(shape.children, id);
		if (nested) return nested;
	}
	return undefined;
}

/**
 * The page's comments as shared-pane threads: Visio's comments are flat, so the comments on one
 * shape (or on the page itself) read as one conversation, oldest first in saved order.
 */
export function visioCommentThreads(
	document: VisioDocument,
	page: VisioPage,
): OfficeCommentThread[] {
	const threads = new Map<string, OfficeCommentThread & { done: boolean[] }>();
	for (const comment of document.comments ?? []) {
		if (comment.pageId !== page.id) continue;
		const id = commentThreadId(comment);
		let thread = threads.get(id);
		if (!thread) {
			const shape =
				comment.shapeId === undefined ? undefined : findCommentShape(page.shapes, comment.shapeId);
			thread = {
				id,
				anchorLabel:
					comment.shapeId === undefined
						? `Page: ${page.name}`
						: shape
							? shape.name || `Shape ${shape.id}`
							: `Shape ${comment.shapeId} (not on the page)`,
				resolved: false,
				comments: [],
				done: [],
			};
			threads.set(id, thread);
		}
		thread.done.push(!!comment.done);
		thread.comments.push({
			id: comment.id,
			author: comment.author || (comment.legacy ? 'Visio 2010 annotation' : 'Unknown author'),
			...(comment.initials ? { initials: comment.initials } : {}),
			...(comment.date ? { created: comment.date } : {}),
			text: comment.text,
			...(comment.editDate ? { edited: true } : {}),
		});
	}
	return [...threads.values()].map(({ done, ...thread }) => ({
		...thread,
		resolved: done.every(Boolean),
	}));
}

const BUBBLE =
	'M2 -22h20a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-12l-5 4v-4h-3a2 2 0 0 1-2-2v-12a2 2 0 0 1 2-2Z';

/**
 * Speech-bubble count markers at the top right of commented shapes (a nested shape uses its
 * top-level shape) and at the page's top left corner, drawn in screen pixels on the paper SVG.
 */
export function drawCommentMarkers(
	svg: SVGSVGElement,
	document: VisioDocument,
	page: VisioPage,
	zoom: number,
): void {
	svg.querySelector('[data-comment-markers]')?.remove();
	const threads = visioCommentThreads(document, page);
	if (!threads.length) return;
	const create = <K extends keyof SVGElementTagNameMap>(name: K) =>
		svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg', name);
	const layer = create('g');
	layer.dataset.commentMarkers = '';
	const scale = 1 / (96 * zoom);
	for (const thread of threads) {
		let x = 0,
			y = 0;
		const id = threadShapeId(thread.id);
		if (id !== undefined) {
			const top = page.shapes.find(
				(shape) => shape.id === id || findCommentShape(shape.children, id),
			);
			const box = top && visioShapePageBox(page, top);
			if (!box) continue;
			x = box.x + box.width;
			y = box.y;
		}
		const marker = create('g');
		marker.dataset.commentMarker = thread.id;
		marker.setAttribute('role', 'button');
		const count = thread.comments.length;
		const label = `${count} comment${count === 1 ? '' : 's'}: ${thread.anchorLabel ?? ''}`;
		marker.setAttribute('aria-label', label);
		marker.setAttribute('transform', `translate(${x} ${y}) scale(${scale})`);
		const bubble = create('path');
		bubble.setAttribute('d', BUBBLE);
		const text = create('text');
		text.setAttribute('x', '12');
		text.setAttribute('y', '-10.5');
		text.textContent = String(count);
		const title = create('title');
		title.textContent = label;
		marker.append(title, bubble, text);
		marker.toggleAttribute('data-resolved', thread.resolved);
		layer.append(marker);
	}
	svg.append(layer);
}
