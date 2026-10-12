/**
 * Colours picked from the Theme Colors grid are saved as theme formulas with the resolved colour
 * cached beside them (`theme-color-ref.ts`). Visio recalculates those caches when a page's theme
 * changes; this does the same for a page edited here, so the drawing shows the new theme at once
 * and in readers that only read cached values.
 */
import { attribute, children } from './sheet';
import {
	parseVisioThemeColorFormula,
	resolveVisioThemeColor,
	type VisioThemeColorValues,
} from './theme-color-ref';

function refresh(cell: Element, colors: VisioThemeColorValues): boolean {
	if (cell.hasAttribute('E')) return false;
	const ref = parseVisioThemeColorFormula(attribute(cell, 'F'));
	const color = ref ? resolveVisioThemeColor(ref, colors) : undefined;
	if (!color || attribute(cell, 'V')?.toLowerCase() === color) return false;
	cell.setAttribute('V', color);
	cell.removeAttribute('U');
	return true;
}

/** Recalculate the theme-colour caches of every shape on the page; true when any cell changed. */
export function refreshThemeColorCaches(
	root: Element,
	colors: VisioThemeColorValues,
	check: () => void,
): boolean {
	let changed = false;
	for (const shape of Array.from(root.getElementsByTagNameNS(root.namespaceURI, 'Shape'))) {
		check();
		if (shape.hasAttribute('Del')) continue;
		for (const cell of children(shape, 'Cell'))
			if (['FillForegnd', 'FillBkgnd', 'LineColor'].includes(attribute(cell, 'N') ?? ''))
				changed = refresh(cell, colors) || changed;
		for (const section of children(shape, 'Section')) {
			if (attribute(section, 'N') !== 'Character' || section.hasAttribute('Del')) continue;
			for (const row of children(section, 'Row'))
				if (!row.hasAttribute('Del'))
					for (const cell of children(row, 'Cell'))
						if (attribute(cell, 'N') === 'Color') changed = refresh(cell, colors) || changed;
		}
	}
	return changed;
}
