import { fail } from './package-common';
import { analyzeVisioFormula, parseVisioFormula } from './formula';

/**
 * Insert a text field (`<fld>` plus a Field section row) into a local shape's text. The Value
 * formula is evaluated now for the cached text; offsets count each existing field as its cached
 * text, as the shape's source text does.
 */
export interface VisioTextFieldInsertEdit {
	type: 'insert-text-field';
	pageId: string;
	shapeId: string;
	/** Field Value formula: NOW(), DOCLASTSAVE(), TITLE(), CREATOR(), PAGENAME(), PAGENUMBER(),
	 * PAGECOUNT(), Width, Height, Angle or a numeric custom formula on this shape. */
	formula: string;
	/** Format picture from VISIO_FIELD_FORMATS (or the same subset); empty is general. */
	format?: string;
	/** Zero-based insertion offset in the source text; omitted appends. */
	offset?: number;
	/** Source text the offset refers to; required with `offset` so stale offsets refuse. */
	expectedText?: string;
}

export function snapshotTextFieldInsert(edit: VisioTextFieldInsertEdit): VisioTextFieldInsertEdit {
	const { pageId, shapeId } = edit;
	if ([pageId, shapeId].some((id) => typeof id !== 'string' || !id || id.length > 256))
		fail('INVALID_EDIT', 'Invalid text field target.');
	const formula = edit.formula;
	if (typeof formula !== 'string' || !formula.trim() || formula.length > 1024)
		fail('INVALID_EDIT', 'A text field needs a formula of at most 1024 characters.');
	let dynamic = true;
	try {
		dynamic = analyzeVisioFormula(parseVisioFormula(formula)).dynamic;
	} catch {
		fail('INVALID_EDIT', 'The text field formula is not valid ShapeSheet syntax.');
	}
	if (dynamic)
		fail('INVALID_EDIT', 'Text field formulas cannot use dynamic references (INDIRECT, REF...).');
	const format = edit.format ?? '';
	if (typeof format !== 'string' || format.length > 256 || /[\u0000-\u001f\u007f]/.test(format))
		fail('INVALID_EDIT', 'Invalid text field format.');
	const result: VisioTextFieldInsertEdit = {
		type: 'insert-text-field',
		pageId,
		shapeId,
		formula,
		format,
	};
	if (edit.offset !== undefined) {
		if (
			!Number.isSafeInteger(edit.offset) ||
			edit.offset < 0 ||
			typeof edit.expectedText !== 'string' ||
			edit.offset > edit.expectedText.length ||
			edit.expectedText.length > 1_000_000
		)
			fail('INVALID_EDIT', 'A field offset needs the source text it refers to.');
		result.offset = edit.offset;
		result.expectedText = edit.expectedText;
	}
	return result;
}
