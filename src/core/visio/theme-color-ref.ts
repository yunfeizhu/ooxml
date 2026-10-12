/**
 * A colour chosen from Visio's Theme Colors grid. Recorded from Visio 16 (Fill, Line and Font
 * Color pick the same formulas): a base swatch saves `THEMEGUARD(THEMEVAL("AccentColor"))`, a
 * lighter or darker one `THEMEGUARD(MSOTINT(THEMEVAL("AccentColor"),80))` (positive lightens,
 * negative darkens, in whole percent), and the fixed White and Black columns carry an RGB base
 * (`THEMEGUARD(MSOTINT(RGB(255,255,255),-5))`). The cached value is the resolved `#rrggbb`, and
 * Visio recalculates it when the page's theme changes.
 */
import { applyThemePaletteVariant } from '../color/index';
import { parseVisioFormula, type VisioFormulaAst } from './formula';
import type { VisioPageTheme } from './model';

const SLOTS = [
	['light', 'Light'],
	['dark', 'Dark'],
	['accent1', 'AccentColor'],
	['accent2', 'AccentColor2'],
	['accent3', 'AccentColor3'],
	['accent4', 'AccentColor4'],
	['accent5', 'AccentColor5'],
	['accent6', 'AccentColor6'],
	['variant1', 'VariantColor1'],
	['variant2', 'VariantColor2'],
	['variant3', 'VariantColor3'],
	['variant4', 'VariantColor4'],
	['variant5', 'VariantColor5'],
	['variant6', 'VariantColor6'],
	['variant7', 'VariantColor7'],
] as const;

/** A theme slot Visio's colour pickers offer. */
export type VisioThemeColorSlot = (typeof SLOTS)[number][0];
export const VISIO_THEME_COLOR_SLOTS: readonly VisioThemeColorSlot[] = SLOTS.map(([slot]) => slot);

export interface VisioThemeColorRef {
	/** A theme slot, or a fixed `#rrggbb` (Visio's White and Black columns). */
	base: VisioThemeColorSlot | `#${string}`;
	/** MSOTINT percent: 1 to 100 lightens, -1 to -100 darkens. Omitted for the base colour. */
	tint?: number;
}

/** The colours a page's theme gives each slot, `#rrggbb`. */
export type VisioThemeColorValues = Partial<Record<VisioThemeColorSlot, string>>;

const HEX = /^#[0-9a-f]{6}$/i;
const isSlot = (value: unknown): value is VisioThemeColorSlot =>
	SLOTS.some(([slot]) => slot === value);

/** Whether `value` is a well-formed reference (used to validate edits). */
export function isVisioThemeColorRef(value: unknown): value is VisioThemeColorRef {
	if (!value || typeof value !== 'object') return false;
	const { base, tint } = value as VisioThemeColorRef;
	if (!(isSlot(base) || (typeof base === 'string' && HEX.test(base)))) return false;
	return (
		tint === undefined ||
		(typeof tint === 'number' && Number.isInteger(tint) && tint !== 0 && Math.abs(tint) <= 100)
	);
}

/** The formula Visio saves for the reference. */
export function visioThemeColorFormula(ref: VisioThemeColorRef): string {
	const slot = SLOTS.find(([name]) => name === ref.base);
	const base = slot
		? `THEMEVAL("${slot[1]}")`
		: `RGB(${[1, 3, 5].map((index) => parseInt(ref.base.slice(index, index + 2), 16)).join(',')})`;
	return `THEMEGUARD(${ref.tint ? `MSOTINT(${base},${ref.tint})` : base})`;
}

const integer = (node: VisioFormulaAst | undefined): number | undefined => {
	const value =
		node?.kind === 'unary' && node.operator === '-' && node.operand.kind === 'number'
			? -node.operand.value
			: node?.kind === 'number'
				? node.value
				: undefined;
	return value !== undefined && Number.isInteger(value) ? value : undefined;
};

function base(node: VisioFormulaAst | undefined): VisioThemeColorRef['base'] | undefined {
	if (node?.kind !== 'call') return undefined;
	if (node.name === 'THEMEVAL' && node.args.length === 1 && node.args[0]?.kind === 'string') {
		const name = node.args[0].value.toLowerCase();
		return SLOTS.find(([, native]) => native.toLowerCase() === name)?.[0];
	}
	if (node.name !== 'RGB' || node.args.length !== 3) return undefined;
	const channels = node.args.map(integer);
	if (channels.some((value) => value === undefined || value < 0 || value > 255)) return undefined;
	return `#${channels.map((value) => value!.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The reference a saved formula stands for, or undefined when it is anything else. A plain
 * `THEMEGUARD(RGB(...))` is a fixed colour, not a theme reference, and is not returned.
 */
export function parseVisioThemeColorFormula(
	source: string | undefined,
): VisioThemeColorRef | undefined {
	if (!source || source.length > 128) return undefined;
	let ast: VisioFormulaAst | undefined;
	try {
		ast = parseVisioFormula(source);
	} catch {
		return undefined;
	}
	if (ast?.kind !== 'call' || ast.name !== 'THEMEGUARD' || ast.args.length !== 1) return undefined;
	const inner = ast.args[0]!;
	if (inner.kind === 'call' && inner.name === 'MSOTINT' && inner.args.length === 2) {
		const from = base(inner.args[0]);
		const tint = integer(inner.args[1]);
		return from && tint !== undefined && tint !== 0 && Math.abs(tint) <= 100
			? { base: from, tint }
			: undefined;
	}
	const from = base(inner);
	return from && !from.startsWith('#') ? { base: from } : undefined;
}

/** The colour the reference has under `colors`; undefined when the theme lacks the slot. */
export function resolveVisioThemeColor(
	ref: VisioThemeColorRef,
	colors: VisioThemeColorValues,
): string | undefined {
	const from = isSlot(ref.base) ? colors[ref.base] : ref.base;
	if (!from || !HEX.test(from)) return undefined;
	if (!ref.tint) return from.toLowerCase();
	return applyThemePaletteVariant(from, {
		kind: ref.tint > 0 ? 'lighter' : 'darker',
		percent: Math.abs(ref.tint),
	});
}

/**
 * What Visio 16 resolves the slots to on a page without a theme (recorded from its Fill gallery):
 * the picker's "Red, Accent 1" to "Gold, Accent 6", with the variant colours equal to the accents.
 */
export const VISIO_UNTHEMED_COLORS: Readonly<Required<VisioThemeColorValues>> = {
	light: '#ffffff',
	dark: '#000000',
	accent1: '#c05046',
	accent2: '#9dbb61',
	accent3: '#ab9ac0',
	accent4: '#4bacc6',
	accent5: '#f59d56',
	accent6: '#ffc000',
	variant1: '#c05046',
	variant2: '#9dbb61',
	variant3: '#ab9ac0',
	variant4: '#4bacc6',
	variant5: '#f59d56',
	variant6: '#ffc000',
	variant7: '#000000',
};

/** The slot colours of a page: its theme's, or Visio's own when the page has no theme. */
export function visioPageThemeColors(
	theme: VisioPageTheme | undefined,
): Required<VisioThemeColorValues> {
	if (!theme) return VISIO_UNTHEMED_COLORS;
	const variant = theme.variants[theme.variant] ?? [];
	const dark = theme.dark ?? VISIO_UNTHEMED_COLORS.dark;
	const result = {
		light: theme.light ?? VISIO_UNTHEMED_COLORS.light,
		dark,
	} as Required<VisioThemeColorValues>;
	for (let index = 1; index <= 6; index++) {
		const accent = theme.accents[index - 1] ?? VISIO_UNTHEMED_COLORS[`accent${index}` as 'accent1'];
		result[`accent${index}` as 'accent1'] = accent;
		result[`variant${index}` as 'variant1'] = variant[index - 1] ?? accent;
	}
	result.variant7 = variant[6] ?? dark;
	return result;
}
