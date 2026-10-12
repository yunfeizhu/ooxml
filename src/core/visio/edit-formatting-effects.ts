/**
 * Shape Styles edits: theme Quick Styles and outer shadow presets.
 * MS-VSDX QuickStyleFillColor (2.4.4.270) and QuickStyleFillMatrix (2.4.4.271) select a theme
 * colour slot and a theme format; THEMEVAL() cells then read the selected theme values.
 * https://learn.microsoft.com/en-us/openspecs/sharepoint_protocols/ms-vsdx/1e7e9b7e-d116-41c0-9c53-5e57c26042a4
 * Shadow cells: https://learn.microsoft.com/en-us/office/client-developer/visio/shapeshdwoffsetx-cell-fill-format-section
 */
import type { VisioPackage } from './package';
import type { Cells } from './sheet';
import { children } from './sheet';
import type { FormattingWrite } from './edit-formatting';
import { assertFormattingText } from './edit-formatting-rows';
import { formattingRowContext, type FormattingRowContext } from './edit-style-admission';
import { shapeThemeContext } from './edit-formatting-theme-context';
import { themeColor } from './theme-resolve';

/** Theme colour slots offered by the gallery: 0 is Dark 1, 2-7 are Accent 1-6. */
export const VISIO_QUICK_STYLE_COLORS = [0, 2, 3, 4, 5, 6, 7] as const;
/** Variant colours 1-7 of the page's theme variant (MS-VSDX QuickStyleFillColor 100-106). */
export const VISIO_QUICK_STYLE_VARIANT_COLORS = [100, 101, 102, 103, 104, 105, 106] as const;
export type VisioQuickStyleColor =
	| (typeof VISIO_QUICK_STYLE_COLORS)[number]
	| (typeof VISIO_QUICK_STYLE_VARIANT_COLORS)[number];
export interface VisioQuickStyle {
	color: VisioQuickStyleColor;
	/** Theme style matrix 1 (subtle) to 6 (intense). */
	matrix: number;
}
export const isVisioQuickStyleColor = (value: unknown): value is VisioQuickStyleColor =>
	(VISIO_QUICK_STYLE_COLORS as readonly unknown[]).includes(value) ||
	(VISIO_QUICK_STYLE_VARIANT_COLORS as readonly unknown[]).includes(value);

/** Outer shadow presets named by the direction the shadow falls. */
export const VISIO_SHADOW_PRESETS = [
	'none',
	'bottom-right',
	'bottom',
	'bottom-left',
	'right',
	'center',
	'left',
	'top-right',
	'top',
	'top-left',
] as const;
export type VisioShadowPreset = (typeof VISIO_SHADOW_PRESETS)[number];
export const isVisioShadowPreset = (value: unknown): value is VisioShadowPreset =>
	(VISIO_SHADOW_PRESETS as readonly unknown[]).includes(value);

/** Offset in points (page coordinates, Y up) and blur in points for each preset. */
export function visioShadowPresetGeometry(preset: Exclude<VisioShadowPreset, 'none'>): {
	x: number;
	y: number;
	blur: number;
} {
	const x = preset.endsWith('right') ? 3 : preset.endsWith('left') ? -3 : 0;
	const y = preset.startsWith('bottom') ? -3 : preset.startsWith('top') ? 3 : 0;
	return { x, y, blur: preset === 'center' ? 8 : 4 };
}

/** Office theme colours used only when the drawing has no usable theme. */
const OFFICE_FALLBACK = [
	'#000000',
	'#ffffff',
	'#5b9bd5',
	'#ed7d31',
	'#a5a5a5',
	'#ffc000',
	'#4472c4',
	'#70ad47',
];
function mix(color: string, target: number, amount: number): string {
	return `#${[1, 3, 5]
		.map((index) => {
			const value = parseInt(color.slice(index, index + 2), 16);
			return Math.round(value + (target - value) * amount)
				.toString(16)
				.padStart(2, '0');
		})
		.join('')}`;
}
/**
 * Fixed approximation of the six Office theme styles, used when no theme resolves: lighter fills
 * with dark text for matrices 1-3, solid and darker fills with light text for 4-6.
 */
export function visioFallbackQuickStyle(style: VisioQuickStyle): {
	fill: string;
	line: string;
	font: string;
} {
	// Built-in theme variant 0 maps variant colours 1-6 to Accent 1-6 and colour 7 to Dark 2.
	const base =
		style.color >= 100
			? style.color === 106
				? '#44546a'
				: OFFICE_FALLBACK[style.color - 98]!
			: OFFICE_FALLBACK[style.color]!;
	const dark = OFFICE_FALLBACK[0]!,
		light = OFFICE_FALLBACK[1]!;
	switch (style.matrix) {
		case 1:
			return { fill: light, line: base, font: dark };
		case 2:
			return { fill: mix(base, 255, 0.8), line: base, font: dark };
		case 3:
			return { fill: mix(base, 255, 0.6), line: base, font: dark };
		case 4:
			return { fill: base, line: mix(base, 0, 0.25), font: light };
		case 5:
			return { fill: mix(base, 0, 0.25), line: mix(base, 0, 0.5), font: light };
		default:
			return { fill: mix(base, 0, 0.5), line: mix(base, 0, 0.5), font: light };
	}
}

const rgb = (color: string) =>
	`RGB(${[1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16)).join(',')})`;
type Add = (
	name: string,
	value: string | number,
	category: FormattingWrite['category'],
	unit?: string,
	formula?: string,
) => void;

export function shadowWrites(preset: VisioShadowPreset, add: Add): void {
	if (preset === 'none') {
		add('ShdwPattern', 0, 'FillStyle');
		return;
	}
	const { x, y, blur } = visioShadowPresetGeometry(preset);
	add('ShdwPattern', 1, 'FillStyle');
	add('ShdwForegnd', '#000000', 'FillStyle', undefined, rgb('#000000'));
	add('ShdwForegndTrans', 0.6, 'FillStyle');
	add('ShapeShdwType', 1, 'FillStyle');
	add('ShapeShdwOffsetX', x / 72, 'FillStyle', 'PT');
	add('ShapeShdwOffsetY', y / 72, 'FillStyle', 'PT');
	add('ShapeShdwBlur', blur / 72, 'FillStyle', 'PT');
}

/**
 * Write the Quick Style selectors and reset fill, line and font paint so the style shows, as
 * Visio does. With a resolvable theme the paint cells become THEMEVAL(); without one they get
 * fixed colours from `visioFallbackQuickStyle` and the selectors are kept for a later theme.
 */
export async function quickStyleWrites(
	pkg: VisioPackage,
	document: Element,
	shape: Element,
	pageId: string,
	style: VisioQuickStyle,
	add: Add,
	check: () => void,
): Promise<Map<string, FormattingRowContext>> {
	const { sheet, resources } = await shapeThemeContext(pkg, document, shape, pageId, check);
	const selectors: [string, number, FormattingWrite['category']][] = [
		['QuickStyleFillColor', style.color, 'FillStyle'],
		['QuickStyleShadowColor', style.color, 'FillStyle'],
		['QuickStyleLineColor', style.color, 'LineStyle'],
		['QuickStyleFontColor', style.color, 'TextStyle'],
		['QuickStyleFillMatrix', style.matrix, 'FillStyle'],
		['QuickStyleEffectsMatrix', style.matrix, 'FillStyle'],
		['QuickStyleLineMatrix', style.matrix, 'LineStyle'],
		['QuickStyleFontMatrix', style.matrix, 'TextStyle'],
		['QuickStyleVariation', 0, 'FillStyle'],
	];
	const cells: Cells = new Map(sheet.cells);
	for (const [name, value] of selectors) cells.set(name, { value: String(value) });
	const ignore = () => {};
	const themed = ['FillForegnd', 'LineColor', 'Color'].every(
		(name) => themeColor(cells, name, resources, ignore, true) !== undefined,
	);
	for (const [name, value, category] of selectors) add(name, value, category);
	const fallback = visioFallbackQuickStyle(style);
	const paint = (name: string, category: FormattingWrite['category'], color: string) =>
		themed
			? add(name, 'Themed', category, undefined, 'THEMEVAL()')
			: add(name, color, category, undefined, rgb(color));
	add('FillPattern', 1, 'FillStyle');
	add('FillForegndTrans', 0, 'FillStyle');
	add('LinePattern', 1, 'LineStyle');
	add('LineColorTrans', 0, 'LineStyle');
	if (!themed) {
		add('FillGradientEnabled', 0, 'FillStyle');
		add('LineGradientEnabled', 0, 'LineStyle');
	}
	paint('FillForegnd', 'FillStyle', fallback.fill);
	paint('LineColor', 'LineStyle', fallback.line);
	const rows = new Map([['Character', formattingRowContext(shape, document, 'Character')]]);
	const characters = rows.get('Character')!.source;
	const hasText = children(shape, 'Text').length > 0;
	if (hasText) assertFormattingText(shape, characters);
	for (const index of hasText ? new Set(['0', ...characters.keys()]) : ['0']) {
		check();
		paint(`Character.${index}.Color`, 'TextStyle', fallback.font);
		add(`Character.${index}.ColorTrans`, 0, 'TextStyle');
	}
	return rows;
}
