/**
 * The Design tab's Backgrounds and Borders & Titles catalogue. These are this package's own
 * simple designs, not Visio's stencil masters: each places plain local rectangles on the page's
 * Visio-managed background page. Shapes are recognised again by their sheet names.
 */
export const VISIO_BACKGROUND_STYLES = Object.freeze([
	Object.freeze({ id: 'solid', label: 'Solid', color: '#DEEBF7' }),
	Object.freeze({ id: 'band', label: 'Band', color: '#E2F0D9' }),
	Object.freeze({ id: 'verticals', label: 'Verticals', color: '#FBE5D6' }),
] as const);
export const VISIO_BORDER_STYLES = Object.freeze([
	Object.freeze({ id: 'simple', label: 'Simple' }),
	Object.freeze({ id: 'banner', label: 'Banner' }),
	Object.freeze({ id: 'underline', label: 'Underline' }),
] as const);
export type VisioBackgroundStyle = (typeof VISIO_BACKGROUND_STYLES)[number]['id'];
export type VisioBorderStyle = (typeof VISIO_BORDER_STYLES)[number]['id'];
/** Visio's name for the background page its Backgrounds gallery creates. */
export const VISIO_MANAGED_BACKGROUND = /^VBackground(?:-[1-9]\d{0,8})?$/;
export const VISIO_TITLE_SHAPE = 'Title';
export const VISIO_DEFAULT_TITLE = 'Title';
const ACCENT = { background: 'Background Accent', border: 'Border Accent' } as const;

/** One decoration rectangle in physical page inches (bottom-left origin, y up). */
export interface VisioDecorationShape {
	readonly name: string;
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
	/** Solid fill, or none. */
	readonly fill?: string;
	/** Solid outline, or none. */
	readonly line?: string;
	/** Plain text and its colour and size in inches. */
	readonly text?: string;
	readonly textColor?: string;
	readonly textSize?: number;
}

/** Mix a #RRGGBB colour toward black by `amount` (0..1). */
export function visioShade(color: string, amount: number): string {
	const value = Number.parseInt(color.slice(1), 16);
	const channel = (shift: number) =>
		Math.round(((value >> shift) & 255) * (1 - amount))
			.toString(16)
			.padStart(2, '0');
	return `#${channel(16)}${channel(8)}${channel(0)}`.toUpperCase();
}

/** Decoration kind and style recognised from a sheet name, if it is one of these shapes. */
export function visioDecorationName(
	name: string,
):
	| { kind: 'background'; style?: VisioBackgroundStyle }
	| { kind: 'border'; style?: VisioBorderStyle; title?: true }
	| undefined {
	if (name === ACCENT.background) return { kind: 'background' };
	if (name === ACCENT.border) return { kind: 'border' };
	if (name === VISIO_TITLE_SHAPE) return { kind: 'border', title: true };
	const background = VISIO_BACKGROUND_STYLES.find((item) => name === `Background ${item.label}`);
	if (background) return { kind: 'background', style: background.id };
	const border = VISIO_BORDER_STYLES.find((item) => name === `Border ${item.label}`);
	return border ? { kind: 'border', style: border.id } : undefined;
}

/** The background rectangles for a page of `width` by `height` physical inches, back to front. */
export function visioBackgroundShapes(
	style: VisioBackgroundStyle,
	width: number,
	height: number,
	color?: string,
): VisioDecorationShape[] {
	const spec = VISIO_BACKGROUND_STYLES.find((item) => item.id === style)!;
	const fill = color ?? spec.color;
	const main = { name: `Background ${spec.label}`, x: 0, y: 0, width, height, fill };
	if (style === 'band')
		return [
			main,
			{
				name: ACCENT.background,
				x: 0,
				y: 0,
				width,
				height: height * 0.12,
				fill: visioShade(fill, 0.25),
			},
		];
	if (style === 'verticals')
		return [
			main,
			{
				name: ACCENT.background,
				x: 0,
				y: 0,
				width: width * 0.06,
				height,
				fill: visioShade(fill, 0.25),
			},
		];
	return [main];
}

/** The border and title rectangles for a page, back to front. The title is plain text. */
export function visioBorderShapes(
	style: VisioBorderStyle,
	width: number,
	height: number,
	title = VISIO_DEFAULT_TITLE,
): VisioDecorationShape[] {
	const spec = VISIO_BORDER_STYLES.find((item) => item.id === style)!;
	const inset = Math.min(0.25, width / 8, height / 8);
	const frame = {
		name: `Border ${spec.label}`,
		x: inset,
		y: inset,
		width: width - 2 * inset,
		height: height - 2 * inset,
		line: '#404040',
	};
	const titleHeight = Math.min(0.6, (height - 2 * inset) / 4);
	const top = height - inset - titleHeight;
	const titleShape = (color: string) => ({
		name: VISIO_TITLE_SHAPE,
		x: inset + 0.1,
		y: top,
		width: width - 2 * inset - 0.2,
		height: titleHeight,
		text: title,
		textColor: color,
		textSize: Math.min(0.333333, titleHeight * 0.6),
	});
	if (style === 'banner')
		return [
			frame,
			{
				name: ACCENT.border,
				x: inset,
				y: top,
				width: width - 2 * inset,
				height: titleHeight,
				fill: '#2F5597',
			},
			titleShape('#FFFFFF'),
		];
	if (style === 'underline')
		return [
			frame,
			{
				name: ACCENT.border,
				x: inset + 0.1,
				y: top - 0.03,
				width: width - 2 * inset - 0.2,
				height: 0.03,
				fill: '#2F5597',
			},
			titleShape('#1F3864'),
		];
	return [frame, titleShape('#262626')];
}
