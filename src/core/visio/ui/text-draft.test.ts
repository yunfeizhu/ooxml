import { describe, expect, it } from 'vitest';
import type { VisioPage, VisioText } from '../model';
import { visioTextAppendEdit, visioTextDraftEdit, visioTextSource } from './text-draft';

const page = (text: Partial<VisioText>): VisioPage =>
	({
		id: '0',
		shapes: [{ id: '1', children: [], text: { plainText: '', runs: [], ...text } }],
	}) as unknown as VisioPage;
// "Hi 4.00 in. there": the field displays "4.00 in." but caches "4 in.".
const withField = page({
	plainText: 'Hi 4.00 in. there',
	fields: [{ start: 3, end: 11, cached: '4 in.' }],
});

describe('text drafts with atomic fields', () => {
	it('maps display offsets to the cached source text', () => {
		const source = visioTextSource(withField.shapes[0]!.text);
		expect(source.source).toBe('Hi 4 in. there');
		expect(source.toSource(12)).toBe(9);
		expect(source.fieldAt(5)).toBe(true);
		expect(source.fieldAt(3)).toBe(false);
	});

	it('keeps whole-text replacement without fields and ranges around fields', () => {
		expect(visioTextDraftEdit(page({ plainText: 'a' }), '1', 'b')).toEqual({
			type: 'replace-plain-text',
			pageId: '0',
			shapeId: '1',
			text: 'b',
		});
		expect(visioTextDraftEdit(withField, '1', 'Hello 4.00 in. there')).toEqual({
			type: 'replace-text-ranges',
			pageId: '0',
			shapeId: '1',
			expectedText: 'Hi 4 in. there',
			ranges: [{ start: 1, end: 2, text: 'ello' }],
		});
		expect(visioTextDraftEdit(withField, '1', 'Hi 4.00 in. here')).toMatchObject({
			ranges: [{ start: 9, end: 10, text: '' }],
		});
		expect(visioTextDraftEdit(withField, '1', withField.shapes[0]!.text.plainText)).toBeUndefined();
	});

	it('absorbs a neighbour for pure insertions and refuses field or paragraph changes', () => {
		expect(visioTextDraftEdit(withField, '1', 'Hi 4.00 in.! there')).toMatchObject({
			ranges: [{ start: 8, end: 9, text: '! ' }],
		});
		expect(() => visioTextDraftEdit(withField, '1', 'Hi 4.50 in. there')).toThrow(/atomic/);
		expect(() => visioTextDraftEdit(withField, '1', 'Hi\n4.00 in. there')).toThrow(/Paragraph/);
		const only = page({ plainText: 'X', fields: [{ start: 0, end: 1, cached: 'X' }] });
		expect(() => visioTextDraftEdit(only, '1', 'XY')).toThrow(/next to/);
	});

	it('appends symbols as range edits or replaces empty text', () => {
		expect(visioTextAppendEdit(page({ plainText: '' }), '1', '©')).toMatchObject({
			type: 'replace-plain-text',
			text: '©',
		});
		expect(visioTextAppendEdit(page({ plainText: 'ab' }), '1', '™')).toMatchObject({
			type: 'replace-text-ranges',
			ranges: [{ start: 1, end: 2, text: 'b™' }],
		});
		expect(visioTextAppendEdit(page({ plainText: 'a😀' }), '1', '!')).toMatchObject({
			ranges: [{ start: 1, end: 3, text: '😀!' }],
		});
	});
});
