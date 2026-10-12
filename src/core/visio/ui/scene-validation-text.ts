import type { VisioText, VisioTextRun } from '../model';

const fail = (label: string): never => {
	throw new Error(`The scene has an invalid ${label}.`);
};
type RunExtras = Pick<VisioTextRun, 'letterSpacing' | 'position' | 'textCase' | 'language'>;

/** Character extras are bounded scalars or members of their closed vocabularies. */
export function assertRunExtras(run: RunExtras): void {
	if (
		run.letterSpacing !== undefined &&
		(!Number.isFinite(run.letterSpacing) || Math.abs(run.letterSpacing) > 22)
	)
		fail('letter spacing');
	if (run.position !== undefined && !['superscript', 'subscript'].includes(run.position))
		fail('text position');
	if (
		run.textCase !== undefined &&
		!['all-caps', 'initial-caps', 'small-caps'].includes(run.textCase)
	)
		fail('text case');
	if (
		run.language !== undefined &&
		(!Number.isSafeInteger(run.language) || run.language <= 0 || run.language > 0xffff)
	)
		fail('text language');
}

/** Field spans are ordered, non-overlapping and inside the plain text. */
export function assertTextFields(text: VisioText): void {
	if (text.fields === undefined) return;
	if (!Array.isArray(text.fields) || text.fields.length > 10_000) fail('text field list');
	let end = 0;
	for (const field of text.fields) {
		if (
			!Number.isSafeInteger(field.start) ||
			!Number.isSafeInteger(field.end) ||
			field.start < end ||
			field.end < field.start ||
			field.end > text.plainText.length ||
			typeof field.cached !== 'string' ||
			field.cached.length > 100_000 ||
			(field.formula !== undefined &&
				(typeof field.formula !== 'string' || field.formula.length > 8192))
		)
			fail('text field');
		end = field.end;
	}
}
