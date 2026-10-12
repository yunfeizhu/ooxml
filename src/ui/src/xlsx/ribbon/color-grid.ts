/**
 * Excel's colour picker on the shared `office-ui-color-grid`: Automatic (or No Fill), Theme Colors
 * (ten columns, each a theme slot over five tints of the workbook theme), Standard Colors and More
 * Colors (the browser's colour input). The choice is a SpreadsheetML `Color` (`{ theme, tint }`
 * or `{ rgb }`), or undefined. This module is the thin adapter between that colour model and the
 * grid's swatches.
 */
import { DEFAULT_THEME, resolveColor, type Color, type ThemePalette } from 'ooxml-core/xlsx';
import { defineColorGrid, type OfficeColorPick, type OfficeUiColorGrid } from '../../controls';
import { closeRibbonPopover, mountPopover } from './popover';

/** Theme slots in Excel's column order with their role names. */
const THEME_COLUMNS: readonly string[] = [
	'Background 1',
	'Text 1',
	'Background 2',
	'Text 2',
	'Accent 1',
	'Accent 2',
	'Accent 3',
	'Accent 4',
	'Accent 5',
	'Accent 6',
];

const STANDARD_COLORS: ReadonlyArray<readonly [string, string]> = [
	['C00000', 'Dark Red'],
	['FF0000', 'Red'],
	['FFC000', 'Orange'],
	['FFFF00', 'Yellow'],
	['92D050', 'Light Green'],
	['00B050', 'Green'],
	['00B0F0', 'Light Blue'],
	['0070C0', 'Blue'],
	['002060', 'Dark Blue'],
	['7030A0', 'Purple'],
];

type Translate = (key: string, vars?: Record<string, string | number>) => string;

export interface ColorGridOptions {
	/** First row: 'Automatic' (font colour) or 'No Fill' (fill colour). */
	automaticLabel?: string;
	theme?: ThemePalette;
	t: Translate;
}

/** The CSS colour a `Color` shows in the workbook theme (for swatches and the split bar). */
export function cssColor(color: Color | undefined, theme: ThemePalette = DEFAULT_THEME): string {
	return resolveColor(color, theme) ?? 'transparent';
}

/** `#rrggbb` for the grid from a resolved colour (`RRGGBB`, `AARRGGBB` or `#rrggbb`). */
const hex = (css: string | undefined): string | undefined => {
	const digits = css?.replace(/^#/, '').slice(-6);
	return digits && /^[0-9a-f]{6}$/i.test(digits) ? `#${digits.toLowerCase()}` : undefined;
};

/**
 * The shared colour grid showing a workbook theme, with every name translated. `noneLabel` is
 * the first row's command (Automatic, No Fill, No Color): choosing it picks no colour.
 */
export function excelColorGrid(
	doc: Document,
	theme: ThemePalette,
	t: Translate,
	options: { noneLabel?: string; moreLabel?: string; label?: string } = {},
): OfficeUiColorGrid {
	defineColorGrid();
	const grid = doc.createElement('office-ui-color-grid') as OfficeUiColorGrid;
	grid.themeColors = THEME_COLUMNS.map((_, slot) => hex(resolveColor({ theme: slot }, theme)));
	grid.themeNames = THEME_COLUMNS.map((name) => t(name));
	grid.variantLabel = (column, variant) =>
		`${column}, ${t(variant.kind === 'lighter' ? 'Lighter {percent}%' : 'Darker {percent}%', {
			percent: variant.percent,
		})}`;
	grid.standardColors = STANDARD_COLORS.map(([rgb, name]) => ({
		hex: `#${rgb.toLowerCase()}`,
		label: t(name),
	}));
	grid.themeHeading = t('Theme Colors');
	grid.standardHeading = t('Standard Colors');
	if (options.label) grid.label = options.label;
	if (options.noneLabel) grid.automaticLabel = t(options.noneLabel);
	if (options.moreLabel) grid.moreLabel = t(options.moreLabel);
	return grid;
}

/**
 * The SpreadsheetML colour a pick stands for: a theme swatch keeps its slot and tint (so it
 * follows the workbook theme), anything else is its RGB. `alpha` writes `FFRRGGBB`.
 */
export function pickedExcelColor(pick: OfficeColorPick, alpha = false): Color | undefined {
	if (pick.source === 'automatic' || pick.source === 'none') return undefined;
	if (pick.source === 'theme' && pick.theme) {
		const variant = pick.theme.variant;
		const tint = variant ? (variant.kind === 'lighter' ? 1 : -1) * (variant.percent / 100) : 0;
		return tint ? { theme: pick.theme.column, tint } : { theme: pick.theme.column };
	}
	const rgb = pick.color.slice(1).toUpperCase();
	return { rgb: alpha ? `FF${rgb}` : rgb };
}

/** The grid's `value` for a colour: its resolved hex, or the none command. */
export function excelGridValue(color: Color | undefined, theme: ThemePalette): string {
	return (color ? hex(resolveColor(color, theme)) : undefined) ?? 'automatic';
}

export function openColorGrid(
	anchor: HTMLElement,
	choose: (color: Color | undefined) => void,
	options: ColorGridOptions,
): void {
	const theme = options.theme ?? DEFAULT_THEME;
	const doc = anchor.ownerDocument;
	const pop = doc.createElement('div');
	pop.className = 'ribbon-popover color-grid';
	const pick = (color: Color | undefined) => {
		closeRibbonPopover();
		choose(color);
	};
	const grid = excelColorGrid(doc, theme, options.t, {
		...(options.automaticLabel ? { noneLabel: options.automaticLabel } : {}),
		moreLabel: 'More Colors...',
	});
	const input = doc.createElement('input');
	input.type = 'color';
	input.className = 'color-grid-input';
	input.tabIndex = -1;
	input.addEventListener('change', () => pick({ rgb: input.value.slice(1).toUpperCase() }));
	grid.addEventListener('office-color-pick', (event) =>
		pick(pickedExcelColor((event as CustomEvent<OfficeColorPick>).detail)),
	);
	grid.addEventListener('office-color-more', () => input.click());
	// A press on a swatch must not take the focus from the cell being edited.
	pop.addEventListener('mousedown', (event) => event.preventDefault());
	pop.append(grid, input);
	if (!mountPopover(anchor, pop)) return;
	grid.focus();
}
