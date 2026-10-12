import type { VisioTextRun } from 'ooxml-core/visio';

/** Visio's default superscript/subscript size (Document Properties) and baseline offset. */
const POSITION_SIZE = 2 / 3;
const POSITION_OFFSET = 1 / 3;

/** Displayed font size: super- and subscript runs shrink like Visio's defaults. */
export const runDisplaySize = (run: VisioTextRun): number =>
	run.position ? run.fontSize * POSITION_SIZE : run.fontSize;

/** Baseline shift in text units, down-positive (the text group is y-down). */
export const runBaselineShift = (run: VisioTextRun): number =>
	run.position === 'superscript'
		? -run.fontSize * POSITION_OFFSET
		: run.position === 'subscript'
			? run.fontSize * POSITION_OFFSET
			: 0;

/** Displayed characters for Char.Case; the stored text keeps its own case. */
export function runDisplayText(text: string, run: Pick<VisioTextRun, 'textCase'>): string {
	if (run.textCase === 'all-caps') return text.toUpperCase();
	if (run.textCase === 'initial-caps')
		return text.replace(/(^|[^\p{L}\p{N}'])(\p{Ll})/gu, (_, before: string, letter: string) => {
			return before + letter.toUpperCase();
		});
	return text;
}

/** Whether two runs draw identically, so wrapping may merge them. */
export const sameRunExtras = (a: VisioTextRun, b: VisioTextRun): boolean =>
	(a.letterSpacing ?? 0) === (b.letterSpacing ?? 0) &&
	a.position === b.position &&
	a.textCase === b.textCase;
