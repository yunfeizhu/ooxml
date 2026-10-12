import type { VisioPage, VisioShape, VisioText } from '../model';
import type { VisioEdit } from '../edit-commands';

/** A user-facing refusal of a text draft (fields, paragraph breaks), with an exact reason. */
export class VisioTextDraftError extends Error {
	override name = 'VisioTextDraftError';
}
const refuse = (message: string): never => {
	throw new VisioTextDraftError(message);
};

/** Find a shape on a page at any depth. */
export function visioTextShape(page: VisioPage, shapeId: string): VisioShape | undefined {
	const pending = [...page.shapes];
	while (pending.length) {
		const shape = pending.pop()!;
		if (shape.id === shapeId) return shape;
		pending.push(...shape.children);
	}
	return undefined;
}

/** The source text editors compare against: each field's display span replaced by its cache. */
export function visioTextSource(text: VisioText): {
	source: string;
	toSource(offset: number): number;
	fieldAt(offset: number): boolean;
} {
	const fields = text.fields ?? [];
	let source = '',
		from = 0;
	for (const field of fields) {
		source += text.plainText.slice(from, field.start) + field.cached;
		from = field.end;
	}
	source += text.plainText.slice(from);
	return {
		source,
		toSource: (offset) =>
			fields.reduce(
				(value, field) =>
					field.end <= offset ? value + field.cached.length - (field.end - field.start) : value,
				offset,
			),
		/** True when the offset is strictly inside a field. */
		fieldAt: (offset) => fields.some((field) => offset > field.start && offset < field.end),
	};
}

const high = (value: string | undefined) => !!value && /[\ud800-\udbff]/.test(value);
const low = (value: string | undefined) => !!value && /[\udc00-\udfff]/.test(value);

/**
 * The edit that turns a shape's displayed text into `draft`. Text without fields keeps whole-text
 * replacement unless `ranges` is set; text with fields becomes one range edit around the fields,
 * which stay atomic. Undefined means nothing changed.
 */
export function visioTextDraftEdit(
	page: VisioPage,
	shapeId: string,
	draft: string,
	options: { ranges?: boolean } = {},
): VisioEdit | undefined {
	const shape = visioTextShape(page, shapeId);
	if (!shape) return refuse('The shape is no longer on this page.');
	const text = shape.text;
	const display = text.plainText;
	if (draft === display) return undefined;
	const fields = text.fields ?? [];
	const target = { pageId: page.id, shapeId };
	if (!fields.length && !options.ranges)
		return { type: 'replace-plain-text', ...target, text: draft };
	let start = 0;
	const limit = Math.min(display.length, draft.length);
	while (start < limit && display[start] === draft[start]) start++;
	if (high(display[start - 1]) && start < display.length) start--;
	let suffix = 0;
	while (
		suffix < limit - start &&
		display[display.length - 1 - suffix] === draft[draft.length - 1 - suffix]
	)
		suffix++;
	if (low(display[display.length - suffix]) && suffix > 0) suffix--;
	let end = display.length - suffix;
	let replacement = draft.slice(start, draft.length - suffix);
	const inField = (from: number, to: number) =>
		fields.some((field) =>
			from === to ? from > field.start && from < field.end : from < field.end && to > field.start,
		);
	if (inField(start, end))
		refuse('Text fields are atomic: edit the text around a field, or delete the whole shape text.');
	if (replacement.includes('\n') || display.slice(start, end).includes('\n'))
		refuse('Paragraph breaks cannot be added or removed in text with fields or formatting runs.');
	if (start === end) {
		// Range edits replace at least one character: absorb a neighbour that is not a field.
		const before = high(display[start - 2]) ? 2 : 1;
		const after = high(display[end]) ? 2 : 1;
		if (start >= before && display[start - 1] !== '\n' && !inField(start - before, start)) {
			start -= before;
			replacement = display.slice(start, start + before) + replacement;
		} else if (
			end + after <= display.length &&
			display[end] !== '\n' &&
			!inField(end, end + after)
		) {
			replacement += display.slice(end, end + after);
			end += after;
		} else
			refuse(
				'Type next to at least one character that is not part of a field, or insert into empty text.',
			);
	}
	const { source, toSource } = visioTextSource(text);
	return {
		type: 'replace-text-ranges',
		...target,
		expectedText: source,
		ranges: [{ start: toSource(start), end: toSource(end), text: replacement }],
	};
}

/** Append text (a symbol) to a shape: empty text is replaced, other text gets a range edit. */
export function visioTextAppendEdit(
	page: VisioPage,
	shapeId: string,
	insertion: string,
): VisioEdit | undefined {
	const shape = visioTextShape(page, shapeId);
	if (!shape) return refuse('The shape is no longer on this page.');
	const display = shape.text.plainText;
	if (!display) return { type: 'replace-plain-text', pageId: page.id, shapeId, text: insertion };
	return visioTextDraftEdit(page, shapeId, display + insertion, { ranges: true });
}
