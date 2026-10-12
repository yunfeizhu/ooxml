import type { VisioPackage } from './package';
import { related, visioXml } from './parts';
import { attribute, children, child, sectionRows, yes, type Report, type Sheet } from './sheet';

/** The comments part Visio 2013 and later write (`visio/comments.xml`, from the document part). */
export const VISIO_COMMENTS_CONTENT_TYPE = 'application/vnd.ms-visio.comments+xml';
export const VISIO_COMMENTS_RELATIONSHIP =
	'http://schemas.microsoft.com/visio/2010/relationships/comments';
/** Most comments read or kept in one drawing. */
export const VISIO_COMMENT_LIMIT = 10_000;
/** Longest comment text accepted by the editor (and kept by the reader). */
export const VISIO_COMMENT_TEXT_LIMIT = 16_384;
/** Longest author name or initials written for a comment. */
export const VISIO_COMMENT_AUTHOR_LIMIT = 256;

/**
 * One review comment. Visio threads are flat: every comment is anchored to a page, or to a shape
 * on it, and comments on the same anchor read as one conversation.
 */
export interface VisioComment {
	/** Stable in this document: the saved CommentID, or `n<index>` when the entry has none. */
	id: string;
	pageId: string;
	/** Absent for a comment on the page itself. */
	shapeId?: string;
	author: string;
	initials?: string;
	/** Saved xsd:dateTime text, unchanged. */
	date?: string;
	editDate?: string;
	text: string;
	/** Visio's Done flag (the comment is resolved). */
	done?: boolean;
	/** A Visio 2010 Annotation section row: shown, never edited here. */
	legacy?: boolean;
}

const unsigned = (value: string | undefined): string | undefined =>
	value !== undefined && /^(0|[1-9]\d{0,9})$/.test(value) && Number(value) <= 0xffffffff
		? value
		: undefined;

/** The ID an entry has in the model: its CommentID, else its position in the comment list. */
export function visioCommentId(entry: Element, index: number): string {
	return unsigned(attribute(entry, 'CommentID')) ?? `n${index}`;
}

/** Comments of `visio/comments.xml`. Invalid entries are skipped with a diagnostic. */
export async function readVisioComments(
	pkg: VisioPackage,
	documentPart: string,
	report: Report,
): Promise<VisioComment[]> {
	const path = await related(pkg, documentPart, 'comments', false);
	if (!path) return [];
	const root = await visioXml(pkg, path, 'Comments');
	const authors = new Map<string, { name: string; initials?: string }>();
	for (const author of children(child(root, 'AuthorList'), 'AuthorEntry')) {
		const id = unsigned(attribute(author, 'ID'));
		if (id === undefined) continue;
		const initials = attribute(author, 'Initials');
		authors.set(id, {
			name: (attribute(author, 'Name') ?? '').slice(0, VISIO_COMMENT_AUTHOR_LIMIT),
			...(initials ? { initials: initials.slice(0, 64) } : {}),
		});
	}
	const entries = children(child(root, 'CommentList'), 'CommentEntry');
	if (entries.length > VISIO_COMMENT_LIMIT) {
		report('comment-limit', `Only the first ${VISIO_COMMENT_LIMIT} comments are shown.`, {
			part: path,
		});
	}
	const comments: VisioComment[] = [];
	const ids = new Set<string>();
	let characters = 0;
	entries.slice(0, VISIO_COMMENT_LIMIT).forEach((entry, index) => {
		const pageId = unsigned(attribute(entry, 'PageID'));
		const id = visioCommentId(entry, index);
		const text = entry.textContent ?? '';
		characters += text.length;
		if (pageId === undefined || ids.has(id) || characters > 1_000_000) {
			report(
				'invalid-comment',
				'A comment without a page, with a repeated ID or over the text budget was omitted.',
				{
					part: path,
				},
			);
			return;
		}
		ids.add(id);
		const shapeId = unsigned(attribute(entry, 'ShapeID'));
		const author = authors.get(attribute(entry, 'AuthorID') ?? '');
		const date = attribute(entry, 'Date');
		const editDate = attribute(entry, 'EditDate');
		comments.push({
			id,
			pageId,
			...(shapeId && shapeId !== '0' ? { shapeId } : {}),
			author: author?.name ?? '',
			...(author?.initials ? { initials: author.initials } : {}),
			...(date ? { date: date.slice(0, 64) } : {}),
			...(editDate ? { editDate: editDate.slice(0, 64) } : {}),
			text: text.slice(0, VISIO_COMMENT_TEXT_LIMIT),
			...(yes(attribute(entry, 'Done')) ? { done: true } : {}),
		});
	});
	return comments;
}

/** Visio 2010 reviewer markup: the page's Annotation section rows, read only. */
export function readVisioAnnotations(sheet: Sheet, pageId: string): VisioComment[] {
	return sectionRows(sheet, 'Annotation')
		.slice(0, 1000)
		.flatMap((row, index) => {
			const text = row.cells.get('Comment')?.value;
			if (!text) return [];
			return [
				{
					id: `a${pageId}-${index}`,
					pageId,
					author: '',
					text: text.slice(0, VISIO_COMMENT_TEXT_LIMIT),
					legacy: true,
				},
			];
		});
}
