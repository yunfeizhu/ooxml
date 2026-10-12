import { fail } from './package-common';
import { VISIO_COMMENT_AUTHOR_LIMIT, VISIO_COMMENT_TEXT_LIMIT } from './comments';

/** Add a comment to a page, or to a shape on it. `date` is an xsd:dateTime (UTC `Z` allowed). */
export interface VisioCommentAddEdit {
	type: 'add-comment';
	pageId: string;
	shapeId?: string;
	author: string;
	initials?: string;
	text: string;
	date: string;
}
/** Change a comment's text (stamping EditDate) and/or its Done (resolved) flag. */
export interface VisioCommentUpdateEdit {
	type: 'edit-comment';
	pageId: string;
	/** The model ID (`VisioComment.id`). */
	commentId: string;
	text?: string;
	done?: boolean;
	date: string;
}
export interface VisioCommentDeleteEdit {
	type: 'delete-comment';
	pageId: string;
	commentId: string;
}
export type VisioCommentEdit =
	| VisioCommentAddEdit
	| VisioCommentUpdateEdit
	| VisioCommentDeleteEdit;

export const isVisioCommentEdit = (edit: { type: string }): edit is VisioCommentEdit =>
	edit.type === 'add-comment' || edit.type === 'edit-comment' || edit.type === 'delete-comment';

const invalidText =
	/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u;
const dateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?(?:Z|[+-]\d{2}:\d{2})?$/;

function string(value: unknown, limit: number, label: string, required = true): string {
	if (typeof value !== 'string' || value.length > limit || (required && !value.trim()))
		fail('INVALID_EDIT', `${label} must be a non-empty string within its length limit.`);
	if (invalidText.test(value as string))
		fail('INVALID_EDIT_TEXT', `${label} contains invalid XML characters.`);
	return value as string;
}
const id = (value: unknown, label: string): string => {
	if (typeof value !== 'string' || !/^(0|[1-9]\d{0,9})$/.test(value) || Number(value) > 0xffffffff)
		fail('INVALID_EDIT', `${label} must be a canonical unsigned integer.`);
	return value as string;
};
const date = (value: unknown): string => {
	if (typeof value !== 'string' || !dateTime.test(value) || Number.isNaN(Date.parse(value)))
		fail('INVALID_EDIT', 'Comment dates must be xsd:dateTime values.');
	return value as string;
};
const commentId = (value: unknown): string => {
	if (typeof value !== 'string' || !/^(?:n?(0|[1-9]\d{0,9}))$/.test(value))
		fail('INVALID_EDIT', 'Invalid comment ID.');
	return value as string;
};

/** Copy and validate a comment command; the package transaction stays authoritative. */
export function snapshotCommentEdit(edit: VisioCommentEdit): VisioCommentEdit {
	const pageId = id(edit.pageId, 'Comment page ID');
	if (edit.type === 'delete-comment')
		return { type: edit.type, pageId, commentId: commentId(edit.commentId) };
	if (edit.type === 'edit-comment') {
		if (edit.text === undefined && edit.done === undefined)
			fail('INVALID_EDIT', 'A comment edit needs new text or a Done flag.');
		if (edit.done !== undefined && typeof edit.done !== 'boolean')
			fail('INVALID_EDIT', 'The Done flag must be a boolean.');
		return {
			type: edit.type,
			pageId,
			commentId: commentId(edit.commentId),
			...(edit.text === undefined
				? {}
				: { text: string(edit.text, VISIO_COMMENT_TEXT_LIMIT, 'Comment text') }),
			...(edit.done === undefined ? {} : { done: edit.done }),
			date: date(edit.date),
		};
	}
	if (edit.type !== 'add-comment') fail('INVALID_EDIT', 'Unsupported comment command.');
	return {
		type: 'add-comment',
		pageId,
		...(edit.shapeId === undefined ? {} : { shapeId: id(edit.shapeId, 'Comment shape ID') }),
		author: string(edit.author, VISIO_COMMENT_AUTHOR_LIMIT, 'Comment author'),
		...(edit.initials === undefined || edit.initials === ''
			? {}
			: { initials: string(edit.initials, 16, 'Comment initials') }),
		text: string(edit.text, VISIO_COMMENT_TEXT_LIMIT, 'Comment text'),
		date: date(edit.date),
	};
}
