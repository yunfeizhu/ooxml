/**
 * Quick-styled local shapes and a page theme. Shapes styled while the drawing had no theme carry
 * their Quick Style selectors with fixed fallback colours (`visioFallbackQuickStyle`); applying a
 * theme turns exactly those colours into THEMEVAL() so the shapes follow the theme, and clearing it
 * turns THEMEVAL() paint of such shapes back into the fallback colours. Any other colour, a master
 * instance and a format-locked shape are left alone.
 */
import { attribute, children } from './sheet';
import {
	isVisioQuickStyleColor,
	visioFallbackQuickStyle,
	type VisioQuickStyle,
} from './edit-formatting-effects';

const rgb = (color: string) =>
	`RGB(${[1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16)).join(',')})`;
/** The one local cell of that name; duplicates are left alone rather than guessed. */
function formattingCell(sheet: Element, name: string): Element | undefined {
	const matches = children(sheet, 'Cell').filter((cell) => attribute(cell, 'N') === name);
	return matches.length === 1 ? matches[0] : undefined;
}
const normal = (formula: string | undefined) => formula?.replace(/\s+/g, '').toUpperCase();

function localNumber(shape: Element, name: string): number | undefined {
	const cell = formattingCell(shape, name);
	if (!cell || cell.hasAttribute('E')) return undefined;
	const formula = attribute(cell, 'F');
	if (formula !== undefined && formula !== 'No Formula' && !/^\d+$/.test(formula)) return undefined;
	const value = attribute(cell, 'V');
	return value !== undefined && /^\d{1,3}$/.test(value) ? Number(value) : undefined;
}
function style(shape: Element, kind: 'Fill' | 'Line' | 'Font'): VisioQuickStyle | undefined {
	const color = localNumber(shape, `QuickStyle${kind}Color`);
	const matrix = localNumber(shape, `QuickStyle${kind}Matrix`);
	if (!isVisioQuickStyleColor(color) || matrix === undefined || matrix < 1 || matrix > 6)
		return undefined;
	return { color, matrix };
}
function convert(cell: Element | undefined, fallback: string, mode: 'themed' | 'fallback') {
	if (!cell || cell.hasAttribute('E')) return false;
	if (mode === 'themed') {
		if (normal(attribute(cell, 'F')) !== rgb(fallback)) return false;
		cell.setAttribute('V', 'Themed');
		cell.setAttribute('F', 'THEMEVAL()');
	} else {
		if (normal(attribute(cell, 'F')) !== 'THEMEVAL()' || attribute(cell, 'V') !== 'Themed')
			return false;
		cell.setAttribute('V', fallback);
		cell.setAttribute('F', rgb(fallback));
	}
	cell.removeAttribute('U');
	return true;
}

/** Convert the page's quick-styled local shapes; returns whether any cell changed. */
export function recolorQuickStyledShapes(
	root: Element,
	mode: 'themed' | 'fallback',
	check: () => void,
): boolean {
	let changed = false;
	for (const shape of Array.from(root.getElementsByTagNameNS(root.namespaceURI, 'Shape'))) {
		check();
		if (['Master', 'MasterShape', 'Del'].some((name) => shape.hasAttribute(name))) continue;
		if (localNumber(shape, 'LockFormat') === 1 || localNumber(shape, 'LockThemeColors') === 1)
			continue;
		const fill = style(shape, 'Fill');
		if (fill)
			changed =
				convert(formattingCell(shape, 'FillForegnd'), visioFallbackQuickStyle(fill).fill, mode) ||
				changed;
		const line = style(shape, 'Line');
		if (line)
			changed =
				convert(formattingCell(shape, 'LineColor'), visioFallbackQuickStyle(line).line, mode) ||
				changed;
		const font = style(shape, 'Font');
		if (!font) continue;
		const color = visioFallbackQuickStyle(font).font;
		for (const section of children(shape, 'Section'))
			if (attribute(section, 'N') === 'Character' && !section.hasAttribute('Del'))
				for (const row of children(section, 'Row'))
					if (!row.hasAttribute('Del'))
						changed = convert(formattingCell(row, 'Color'), color, mode) || changed;
	}
	return changed;
}
