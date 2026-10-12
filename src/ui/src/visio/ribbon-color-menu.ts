import {
	visioPageThemeColors,
	type VisioPage,
	type VisioThemeColorRef,
	type VisioThemeColorSlot,
} from 'ooxml-core/visio';
import type { OfficeColorPick, OfficeUiColorGrid } from '../controls';
import type { VisioFormattingAction } from './ribbon-action';

/** What a colour menu paints: a shape's fill, its line, or its text. */
export type ColorTarget = 'fill' | 'line' | 'font';

const GRIDS: Readonly<Record<ColorTarget, { label: string; none?: string }>> = {
	fill: { label: 'Fill colors', none: 'No Fill' },
	line: { label: 'Line colors', none: 'No Line' },
	font: { label: 'Font colors' },
};
export const MORE_COLORS = 'More Colors...';

/**
 * Office's colour picker for a ribbon menu or the Format Shape pane: Theme Colors, Standard
 * Colors, recent colours, No Fill or No Line, and More Colors. `data-color-grid` names the target.
 */
export function colorGrid(doc: Document, target: ColorTarget): OfficeUiColorGrid {
	const grid = doc.createElement('office-ui-color-grid') as OfficeUiColorGrid;
	grid.dataset.colorGrid = target;
	// The menu's arrow keys and its opening focus go through the grid.
	grid.dataset.menuItem = '';
	grid.setAttribute('label', GRIDS[target].label);
	if (GRIDS[target].none) grid.setAttribute('none-label', GRIDS[target].none!);
	grid.setAttribute('more-label', MORE_COLORS);
	return grid;
}

/**
 * The formatting action a picked colour (`#rrggbb` or `'none'`) stands for. `theme` is the Theme
 * Colors swatch it came from: the colour is then saved as Visio's theme formula.
 */
export function colorAction(
	target: ColorTarget,
	color: string,
	theme?: VisioThemeColorRef,
): VisioFormattingAction {
	if (target === 'font') return { type: 'font-color', value: color, ...(theme ? { theme } : {}) };
	if (target === 'fill')
		return {
			type: 'shape-format',
			patch: { fillColor: color, ...(theme && color !== 'none' ? { fillColorTheme: theme } : {}) },
		};
	return color === 'none'
		? { type: 'shape-format', patch: { linePattern: 0 } }
		: {
				type: 'shape-format',
				patch: { lineColor: color, ...(theme ? { lineColorTheme: theme } : {}) },
			};
}

/** Visio's ten Theme Colors columns: fixed White and Black, then the theme's own colours. */
const COLUMNS: readonly (VisioThemeColorSlot | `#${string}`)[] = [
	'#ffffff',
	'#000000',
	'light',
	'dark',
	'accent1',
	'accent2',
	'accent3',
	'accent4',
	'accent5',
	'accent6',
];
export const THEME_COLUMN_NAMES: readonly string[] = [
	'White',
	'Black',
	'Light',
	'Dark',
	...[1, 2, 3, 4, 5, 6].map((index) => `Accent ${index}`),
];

/** The page's Theme Colors as the picker shows them: ten columns and the variant colours row. */
export function pageThemeGrid(page: VisioPage | undefined): {
	colors: string[];
	variants: { hex: string; label: string }[];
} {
	const values = visioPageThemeColors(page?.theme);
	return {
		colors: COLUMNS.map((column) => (column.startsWith('#') ? column : values[column as 'light'])),
		variants: [1, 2, 3, 4, 5, 6, 7].map((index) => ({
			hex: values[`variant${index}` as 'variant1'],
			label: `Variant Accent ${index}`,
		})),
	};
}

/** The theme reference a pick from the grid stands for; undefined for a fixed colour. */
export function pickedThemeColor(pick: OfficeColorPick): VisioThemeColorRef | undefined {
	if (pick.source === 'extra' && pick.index !== undefined && pick.index < 7)
		return { base: `variant${pick.index + 1}` as VisioThemeColorSlot };
	const base = pick.source === 'theme' && pick.theme ? COLUMNS[pick.theme.column] : undefined;
	if (!base) return undefined;
	const variant = pick.theme!.variant;
	// The fixed columns' base swatches are plain white and black.
	if (!variant) return base.startsWith('#') ? undefined : { base };
	return { base, tint: variant.kind === 'lighter' ? variant.percent : -variant.percent };
}

/** The value all `values` share, or undefined when they differ or there are none. */
export function commonColor(values: readonly (string | undefined)[]): string | undefined {
	const first = values[0]?.toLowerCase();
	return first !== undefined && values.every((value) => value?.toLowerCase() === first)
		? first
		: undefined;
}
