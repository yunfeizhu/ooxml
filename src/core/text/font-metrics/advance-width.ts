import { DESIGN_ADVANCES } from './design-advances.generated';

const FIRST = 32;
const decoded = new Map<string, readonly number[]>();

function advances(family: string, bold: boolean): readonly number[] | undefined {
	const name = family.trim().toLowerCase();
	const key = `${name}|${bold ? 'b' : 'r'}`;
	const known = decoded.get(key);
	if (known) return known;
	const table = Object.hasOwn(DESIGN_ADVANCES, name) ? DESIGN_ADVANCES[name] : undefined;
	if (!table) return undefined;
	const values = (bold ? table.bold : table.regular).split(' ').map(Number);
	decoded.set(key, values);
	return values;
}

/** Whether `family` has measured design advances (regular and bold upright faces). */
export const hasDesignAdvances = (family: string): boolean => !!advances(family, false);

/**
 * The unhinted, unkerned width of `text` in em (multiply by the font size) from the font's own
 * advance widths. `undefined` when the family was not measured or a character is outside
 * printable ASCII: a caller that needs a width it can rely on must not get a guess.
 */
export function designTextWidthEm(text: string, family: string, bold = false): number | undefined {
	const table = advances(family, bold);
	if (!table) return undefined;
	let units = 0;
	for (let index = 0; index < text.length; ++index) {
		const advance = table[text.charCodeAt(index) - FIRST];
		if (advance === undefined || Number.isNaN(advance)) return undefined;
		units += advance;
	}
	return units / 1000;
}
