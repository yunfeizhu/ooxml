import { describe, expect, it } from 'vitest';
import {
	OFFICE_STANDARD_COLORS,
	OFFICE_THEME_PALETTE_COLORS,
	applyThemePaletteVariant,
	buildThemePalette,
	normalizePaletteHex,
	pushRecentColor,
	themePaletteVariantLuminance,
	themePaletteVariantsForLuminance,
} from './theme-palette';

const names = (l: number) =>
	themePaletteVariantsForLuminance(l).map((variant) => `${variant.kind}${variant.percent}`);

describe('theme palette', () => {
	it('picks the five variants from the base luminance, as Office does', () => {
		expect(names(0)).toEqual(['lighter50', 'lighter35', 'lighter25', 'lighter15', 'lighter5']);
		expect(names(0.2)).toEqual(['lighter90', 'lighter75', 'lighter50', 'lighter25', 'lighter10']);
		expect(names(0.5)).toEqual(['lighter80', 'lighter60', 'lighter40', 'darker25', 'darker50']);
		expect(names(0.9)).toEqual(['darker10', 'darker25', 'darker50', 'darker75', 'darker90']);
		expect(names(1)).toEqual(['darker5', 'darker15', 'darker25', 'darker35', 'darker50']);
	});

	it('maps a variant to lumMod and lumOff', () => {
		expect(themePaletteVariantLuminance({ kind: 'lighter', percent: 80 })).toEqual({
			lumMod: 0.2,
			lumOff: 0.8,
		});
		expect(themePaletteVariantLuminance({ kind: 'darker', percent: 25 })).toEqual({ lumMod: 0.75 });
	});

	it('applies variants in HSL space', () => {
		// Office's own swatches for Accent 1 (#4472C4): Lighter 80% and Darker 25%. Office truncates
		// each channel, so white at Darker 50% is #7F7F7F.
		expect(applyThemePaletteVariant('#4472c4', { kind: 'lighter', percent: 80 })).toBe('#d9e2f3');
		expect(applyThemePaletteVariant('#4472c4', { kind: 'darker', percent: 25 })).toBe('#2f5496');
		expect(applyThemePaletteVariant('#ffffff', { kind: 'darker', percent: 50 })).toBe('#7f7f7f');
		expect(applyThemePaletteVariant('#000000', { kind: 'lighter', percent: 50 })).toBe('#7f7f7f');
		expect(applyThemePaletteVariant('nonsense', { kind: 'darker', percent: 50 })).toBe('nonsense');
	});

	it('builds ten columns of a base and five named variants', () => {
		const palette = buildThemePalette();
		expect(palette).toHaveLength(10);
		expect(palette.map((column) => column.base.hex)).toEqual(OFFICE_THEME_PALETTE_COLORS);
		expect(palette.every((column) => column.variants.length === 5)).toBe(true);
		expect(palette[4]!.base.label).toBe('Accent 1');
		expect(palette[4]!.variants[0]).toEqual({
			hex: '#d9e2f3',
			label: 'Accent 1, Lighter 80%',
			variant: { kind: 'lighter', percent: 80 },
		});
		expect(palette[0]!.variants.map((swatch) => swatch.label)[0]).toBe('Background 1, Darker 5%');
	});

	it('falls back to the Office colour for a missing or bad column', () => {
		const palette = buildThemePalette(['#FFF', 'oops', undefined, '112233']);
		expect(palette[0]!.base.hex).toBe('#ffffff');
		expect(palette[1]!.base.hex).toBe('#000000');
		expect(palette[2]!.base.hex).toBe('#e7e6e6');
		expect(palette[3]!.base.hex).toBe('#112233');
		expect(palette[9]!.base.hex).toBe('#70ad47');
	});

	it('lists the ten standard colours and normalises hex text', () => {
		expect(OFFICE_STANDARD_COLORS.map((swatch) => swatch.label)).toEqual([
			'Dark Red',
			'Red',
			'Orange',
			'Yellow',
			'Light Green',
			'Green',
			'Light Blue',
			'Blue',
			'Dark Blue',
			'Purple',
		]);
		expect(normalizePaletteHex('AbCdEf')).toBe('#abcdef');
		expect(normalizePaletteHex('#0f0')).toBe('#00ff00');
		expect(normalizePaletteHex('zz')).toBeUndefined();
	});

	it('keeps recent colours unique, newest first and bounded', () => {
		expect(pushRecentColor(['#111111', '#222222'], '#222222')).toEqual(['#222222', '#111111']);
		expect(pushRecentColor(['#111111'], 'ABCDEF')).toEqual(['#abcdef', '#111111']);
		expect(pushRecentColor(['#111111'], 'nope')).toEqual(['#111111']);
		expect(
			pushRecentColor(
				['#1', '#2', '#3'].map(() => '#000000'),
				'#ffffff',
				2,
			),
		).toEqual(['#ffffff', '#000000']);
	});
});
