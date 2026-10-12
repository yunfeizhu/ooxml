import type { VisioPageTheme } from './model';
import type { Cells } from './sheet';
import type { VisioTheme } from './theme';
import { drawingColor, integer } from './theme-color';
import { VISIO_BUILT_IN_THEMES } from './theme-builtins';

/**
 * The theme a page selects through its (style-inherited) ColorSchemeIndex, summarised for the
 * Design tab: name, built-in identity, the selected variant and preview colours.
 */
export function visioPageTheme(
	themes: readonly VisioTheme[] | undefined,
	pageCells: Cells,
): VisioPageTheme | undefined {
	const id = integer(pageCells.get('ColorSchemeIndex')?.value);
	if (!themes || id === undefined || id === 0 || id >= 65534) return undefined;
	const matches = themes.filter((theme) => theme.colorId === id);
	if (matches.length !== 1) return undefined;
	const theme = matches[0]!;
	const variant = Math.min(3, integer(pageCells.get('VariationColorIndex')?.value) ?? 0);
	const accents = [1, 2, 3, 4, 5, 6].map(
		(index) => drawingColor(theme.colors.get(`accent${index}`), theme.colors) ?? '#808080',
	);
	const light = drawingColor(theme.colors.get('lt1'), theme.colors);
	const dark = drawingColor(theme.colors.get('dk1'), theme.colors);
	const builtIn = VISIO_BUILT_IN_THEMES.find(
		(entry) => entry.schemeId === id && entry.name === theme.name,
	);
	return {
		name: theme.name ?? `Theme ${id}`,
		...(builtIn ? { builtIn: builtIn.id } : {}),
		variant,
		accents,
		...(light ? { light } : {}),
		...(dark ? { dark } : {}),
		variants: theme.variants.map((colors) =>
			[1, 2, 3, 4, 5, 6, 7].map(
				(index) => drawingColor(colors.get(String(index)), theme.colors) ?? '#808080',
			),
		),
	};
}
