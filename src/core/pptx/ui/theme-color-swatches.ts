/**
 * PowerPoint's "Theme Colors" palette as a pure descriptor: ten columns
 * (Background 1, Text 1, Background 2, Text 2, Accent 1..6), each with its base
 * colour plus the five luminance variants PowerPoint derives from it.
 *
 * Every swatch carries both the resolved hex (for painting the button) and the
 * typed {@link PptxThemeColorRef} the editor must store, so a picked theme
 * colour saves as `<a:schemeClr>` with `lumMod`/`lumOff` rather than as a
 * canonical sRGB that loses its theme identity.
 *
 * Variant rule (PowerPoint's own, by base luminance L):
 * - L < 0.05 (black-ish): Lighter 50 / 35 / 25 / 15 / 5
 * - L < 0.25 (dark): Lighter 90 / 75 / 50 / 25 / 10
 * - L < 0.75 (mid): Lighter 80 / 60 / 40, Darker 25 / 50
 * - L < 0.95 (light): Darker 10 / 25 / 50 / 75 / 90
 * - otherwise (white-ish): Darker 5 / 15 / 25 / 35 / 50
 * "Lighter N%" is `lumMod = 1 - N`, `lumOff = N`; "Darker N%" is `lumMod = 1 - N`.
 *
 */
import {
	hexToRgbChannels,
	rgbToHsl,
	themePaletteVariantLuminance,
	themePaletteVariantsForLuminance,
	type ThemePaletteVariant,
} from '../../color/index';
import { resolveThemeColorRef } from '../core/color/theme-color-ref';
import type { PptxThemeColorRef, PptxThemeColorSchemeName } from '../core/types/color-ref';
import { THEME_COLOR_PALETTE_COLUMNS } from '../core/types/color-ref';

/** One swatch of the theme palette. */
export interface ThemeColorSwatch {
	/** What the editor stores; serialises as `<a:schemeClr>`. */
	readonly ref: PptxThemeColorRef;
	/** Resolved `#rrggbb` for painting the swatch. */
	readonly hex: string;
	/** English label, e.g. "Accent 1, Lighter 80%" (for `title` / `aria-label`). */
	readonly label: string;
	/** Structured variant, for hosts that localise the label themselves. */
	readonly variant: ThemeColorVariant | undefined;
}

/** A luminance variant of a base theme colour (the shared Office palette's). */
export type ThemeColorVariant = ThemePaletteVariant;

/** One palette column: the base swatch followed by its five variants. */
export interface ThemeColorSwatchColumn {
	readonly scheme: PptxThemeColorSchemeName;
	readonly base: ThemeColorSwatch;
	readonly variants: readonly ThemeColorSwatch[];
}

const COLUMN_LABELS: Readonly<Record<string, string>> = {
	bg1: 'Background 1',
	tx1: 'Text 1',
	bg2: 'Background 2',
	tx2: 'Text 2',
	accent1: 'Accent 1',
	accent2: 'Accent 2',
	accent3: 'Accent 3',
	accent4: 'Accent 4',
	accent5: 'Accent 5',
	accent6: 'Accent 6',
	dk1: 'Text 1',
	lt1: 'Background 1',
	dk2: 'Text 2',
	lt2: 'Background 2',
	hlink: 'Hyperlink',
	folHlink: 'Followed Hyperlink',
};

const lighter = (percent: number): ThemeColorVariant => ({ kind: 'lighter', percent });
const darker = (percent: number): ThemeColorVariant => ({ kind: 'darker', percent });

/**
 * The five variants PowerPoint shows under a base colour of luminance `l` (0..1). The rule is
 * Office's, shared by every product: see `themePaletteVariantsForLuminance` in the color area.
 */
export function themeColorVariantsForLuminance(l: number): readonly ThemeColorVariant[] {
	return themePaletteVariantsForLuminance(l);
}

/** The `lumMod`/`lumOff` pair a variant serialises as. */
export function themeColorVariantToRef(
	scheme: PptxThemeColorSchemeName,
	variant: ThemeColorVariant,
): PptxThemeColorRef {
	return { scheme, ...themePaletteVariantLuminance(variant) };
}

/** Human label for a swatch: "Accent 1" or "Accent 1, Lighter 80%". */
export function describeThemeColorSwatch(
	ref: PptxThemeColorRef,
	variant: ThemeColorVariant | undefined,
): string {
	const column = COLUMN_LABELS[ref.scheme] ?? ref.scheme;
	if (!variant) {
		return column;
	}
	const word = variant.kind === 'lighter' ? 'Lighter' : 'Darker';
	return `${column}, ${word} ${variant.percent}%`;
}

/**
 * Recover the PowerPoint variant a stored ref corresponds to, or `undefined`
 * for a base colour or a ref whose transforms are not a plain lighter/darker step.
 */
export function themeColorVariantOfRef(ref: PptxThemeColorRef): ThemeColorVariant | undefined {
	if (ref.lumMod === undefined || ref.tint !== undefined || ref.shade !== undefined) {
		return undefined;
	}
	const percent = Math.round((1 - ref.lumMod) * 100);
	if (ref.lumOff !== undefined) {
		return Math.round(ref.lumOff * 100) === percent ? lighter(percent) : undefined;
	}
	return darker(percent);
}

/**
 * Build the palette for a deck's resolved theme colour map (`PptxData.themeColorMap`,
 * which already applies the slide master's `p:clrMap` aliases). Columns whose
 * base colour the map cannot resolve are skipped, so a partial map still yields
 * a usable palette.
 */
export function buildThemeColorSwatchGrid(
	themeColorMap: Readonly<Record<string, string>> | undefined,
): readonly ThemeColorSwatchColumn[] {
	if (!themeColorMap) {
		return [];
	}
	const columns: ThemeColorSwatchColumn[] = [];
	for (const scheme of THEME_COLOR_PALETTE_COLUMNS) {
		const baseRef: PptxThemeColorRef = { scheme };
		const baseHex = resolveThemeColorRef(baseRef, themeColorMap);
		const rgb = baseHex ? hexToRgbChannels(baseHex) : null;
		if (!baseHex || !rgb) {
			continue;
		}
		const { l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
		const variants: ThemeColorSwatch[] = [];
		for (const variant of themeColorVariantsForLuminance(l)) {
			const ref = themeColorVariantToRef(scheme, variant);
			const hex = resolveThemeColorRef(ref, themeColorMap);
			if (hex) {
				variants.push({ ref, hex, label: describeThemeColorSwatch(ref, variant), variant });
			}
		}
		columns.push({
			scheme,
			base: {
				ref: baseRef,
				hex: baseHex,
				label: describeThemeColorSwatch(baseRef, undefined),
				variant: undefined,
			},
			variants,
		});
	}
	return columns;
}
