/**
 * Office's colour picker palette, format-neutral: the "Theme Colors" grid (ten columns, each a
 * base colour over the five lighter and darker variants Office derives from its luminance) and
 * the ten "Standard Colors". PowerPoint, Excel, Word and Visio all show this grid; a product maps
 * a picked swatch onto its own colour model (`a:schemeClr` with `lumMod`/`lumOff`, a theme index
 * and tint, or plain sRGB).
 */
import { hexToRgbChannels, hslToRgb, rgbToHsl, toHex } from './color-primitives';

/** A luminance variant of a base theme colour. */
export interface ThemePaletteVariant {
	readonly kind: 'lighter' | 'darker';
	/** Whole percent as Office labels it (80 for "Lighter 80%"). */
	readonly percent: number;
}

/** One swatch of the grid. */
export interface ThemePaletteSwatch {
	/** Lower-case `#rrggbb`. */
	readonly hex: string;
	/** English name: "Accent 1" or "Accent 1, Lighter 80%". */
	readonly label: string;
	/** Absent for the base colour of a column. */
	readonly variant?: ThemePaletteVariant;
}

/** One column: the base swatch, then its five variants from top to bottom. */
export interface ThemePaletteColumn {
	/** Column name, in Office's order: "Background 1", "Text 1", ... "Accent 6". */
	readonly name: string;
	readonly base: ThemePaletteSwatch;
	readonly variants: readonly ThemePaletteSwatch[];
}

/** The ten columns of the Theme Colors grid, in Office's order. */
export const THEME_PALETTE_COLUMN_NAMES: readonly string[] = [
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

/** The Office theme's ten base colours, for a document that has no theme of its own. */
export const OFFICE_THEME_PALETTE_COLORS: readonly string[] = [
	'#ffffff',
	'#000000',
	'#e7e6e6',
	'#44546a',
	'#4472c4',
	'#ed7d31',
	'#a5a5a5',
	'#ffc000',
	'#5b9bd5',
	'#70ad47',
];

/** Office's "Standard Colors" row, left to right. */
export const OFFICE_STANDARD_COLORS: readonly ThemePaletteSwatch[] = [
	{ hex: '#c00000', label: 'Dark Red' },
	{ hex: '#ff0000', label: 'Red' },
	{ hex: '#ffc000', label: 'Orange' },
	{ hex: '#ffff00', label: 'Yellow' },
	{ hex: '#92d050', label: 'Light Green' },
	{ hex: '#00b050', label: 'Green' },
	{ hex: '#00b0f0', label: 'Light Blue' },
	{ hex: '#0070c0', label: 'Blue' },
	{ hex: '#002060', label: 'Dark Blue' },
	{ hex: '#7030a0', label: 'Purple' },
];

const lighter = (percent: number): ThemePaletteVariant => ({ kind: 'lighter', percent });
const darker = (percent: number): ThemePaletteVariant => ({ kind: 'darker', percent });

/**
 * The five variants Office shows under a base colour of HSL lightness `l` (0..1):
 * black-ish and dark colours only lighten, light and white-ish ones only darken, and the rest
 * get three lighter and two darker steps.
 */
export function themePaletteVariantsForLuminance(l: number): readonly ThemePaletteVariant[] {
	if (l < 0.05) return [lighter(50), lighter(35), lighter(25), lighter(15), lighter(5)];
	if (l < 0.25) return [lighter(90), lighter(75), lighter(50), lighter(25), lighter(10)];
	if (l < 0.75) return [lighter(80), lighter(60), lighter(40), darker(25), darker(50)];
	if (l < 0.95) return [darker(10), darker(25), darker(50), darker(75), darker(90)];
	return [darker(5), darker(15), darker(25), darker(35), darker(50)];
}

/** The `lumMod` / `lumOff` fractions a variant stands for ("Lighter N%" is `1 - N` and `N`). */
export function themePaletteVariantLuminance(variant: ThemePaletteVariant): {
	lumMod: number;
	lumOff?: number;
} {
	const fraction = variant.percent / 100;
	const lumMod = Math.round((1 - fraction) * 100000) / 100000;
	return variant.kind === 'lighter' ? { lumMod, lumOff: fraction } : { lumMod };
}

/** Normalises `#rgb`, `#rrggbb` or bare hex digits to lower-case `#rrggbb`. */
export function normalizePaletteHex(value: string): string | undefined {
	const digits = value.trim().replace(/^#/, '');
	const rgb = hexToRgbChannels(
		/^[0-9a-f]{3}$/i.test(digits) ? digits.replace(/./g, '$&$&') : digits,
	);
	return rgb ? `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`.toLowerCase() : undefined;
}

/** `hex` with a variant applied in HSL space, as DrawingML's `lumMod` and `lumOff` do. */
export function applyThemePaletteVariant(hex: string, variant: ThemePaletteVariant): string {
	const rgb = hexToRgbChannels(hex);
	if (!rgb) return hex;
	const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
	const { lumMod, lumOff } = themePaletteVariantLuminance(variant);
	// Office truncates each channel (recorded from Visio and Word: Accent 1 #4472C4, Lighter 80% is
	// #D9E2F3, not the rounded #DAE3F3); the epsilon keeps exact values such as 204.0 whole.
	const next = hslToRgb(h, s, l * lumMod + (lumOff ?? 0), (value) => Math.floor(value + 1e-6));
	return `#${toHex(next.r)}${toHex(next.g)}${toHex(next.b)}`.toLowerCase();
}

/** "Accent 1" or "Accent 1, Lighter 80%". */
export function describeThemePaletteSwatch(name: string, variant?: ThemePaletteVariant): string {
	if (!variant) return name;
	return `${name}, ${variant.kind === 'lighter' ? 'Lighter' : 'Darker'} ${variant.percent}%`;
}

/**
 * The Theme Colors grid for ten base colours in Office's column order (Background 1, Text 1,
 * Background 2, Text 2, Accent 1-6). A missing or unparsable colour falls back to the Office
 * theme's colour for that column, so a partial theme still gives a full grid. `names` replaces
 * the column names for a product whose grid differs (Visio: White, Black, Light, Dark, accents).
 */
export function buildThemePalette(
	colors: readonly (string | undefined)[] = OFFICE_THEME_PALETTE_COLORS,
	names: readonly string[] = THEME_PALETTE_COLUMN_NAMES,
): readonly ThemePaletteColumn[] {
	return THEME_PALETTE_COLUMN_NAMES.map((fallback, index) => {
		const name = names[index] ?? fallback;
		const hex =
			(colors[index] === undefined ? undefined : normalizePaletteHex(colors[index])) ??
			OFFICE_THEME_PALETTE_COLORS[index]!;
		const rgb = hexToRgbChannels(hex)!;
		const { l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
		return {
			name,
			base: { hex, label: name },
			variants: themePaletteVariantsForLuminance(l).map((variant) => ({
				hex: applyThemePaletteVariant(hex, variant),
				label: describeThemePaletteSwatch(name, variant),
				variant,
			})),
		};
	});
}

/** `recent` with `hex` moved to the front, without duplicates, at most `limit` long. */
export function pushRecentColor(recent: readonly string[], hex: string, limit = 10): string[] {
	const color = normalizePaletteHex(hex);
	if (!color) return [...recent];
	return [color, ...recent.filter((item) => item.toLowerCase() !== color)].slice(0, limit);
}
