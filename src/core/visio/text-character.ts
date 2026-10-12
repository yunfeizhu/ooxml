import type { VisioTextRun } from './model';
import { number, type Cells, type Report } from './sheet';

const CASES = [undefined, 'all-caps', 'initial-caps', 'small-caps'] as const;
const POSITIONS = [undefined, 'superscript', 'subscript'] as const;

/** Character cells beyond font, size, colour and style bits; omitted at their defaults. */
export function characterExtras(
	cells: Cells,
	report: Report,
): Pick<VisioTextRun, 'letterSpacing' | 'position' | 'textCase' | 'language'> {
	const spacing = number(cells, 'Letterspace', 0, report);
	const textCase = CASES[number(cells, 'Case', 0, report)];
	const position = POSITIONS[number(cells, 'Pos', 0, report)];
	const language = number(cells, 'LangID', 0, report);
	return {
		...(spacing && Math.abs(spacing) <= 22 ? { letterSpacing: spacing } : {}),
		...(textCase ? { textCase } : {}),
		...(position ? { position } : {}),
		...(Number.isSafeInteger(language) && language > 0 && language <= 0xffff ? { language } : {}),
	};
}
