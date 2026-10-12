import { fail } from './package-common';

export type VisioTextCase = 'normal' | 'all-caps' | 'initial-caps' | 'small-caps';
export type VisioTextPosition = 'normal' | 'superscript' | 'subscript';
export const VISIO_TEXT_CASES: readonly VisioTextCase[] = [
	'normal',
	'all-caps',
	'initial-caps',
	'small-caps',
];
export const VISIO_TEXT_POSITIONS: readonly VisioTextPosition[] = [
	'normal',
	'superscript',
	'subscript',
];
/** Text block placement as fractions of the shape's Width/Height, written as proportional formulas. */
export interface VisioTextBlockTransform {
	/** TxtPinX / Width and TxtPinY / Height: the text block centre. */
	x: number;
	y: number;
	/** TxtWidth / Width and TxtHeight / Height. */
	width: number;
	height: number;
	/** TxtAngle in radians, counter-clockwise. */
	angle: number;
}
export interface VisioTextMargins {
	left?: number;
	right?: number;
	top?: number;
	bottom?: number;
}
/** Text dialog properties (Font, Character, Paragraph, Text Block, Bullets). Lengths are points. */
export interface VisioTextFormatExtras {
	/** Character colour transparency in percent (Char.ColorTrans). */
	fontTransparency?: number;
	textCase?: VisioTextCase;
	textPosition?: VisioTextPosition;
	/** Windows language identifier (Char.LangID), for example 1033 for English (United States). */
	language?: number;
	/** Char.Letterspace in points; negative values condense. */
	letterSpacing?: number;
	indentRight?: number;
	/** First-line indent in points; negative values hang. */
	indentFirst?: number;
	spaceBefore?: number;
	spaceAfter?: number;
	/** `multiple` scales the font size (1.2 is Visio's single spacing); `exact` is in points. */
	lineSpacing?: { kind: 'multiple' | 'exact'; value: number };
	/** Paragraph.Bullet: 0 none, 1-7 Visio's built-in bullet styles. */
	bulletStyle?: number;
	/** Paragraph.BulletStr: a custom bullet character; empty clears it. */
	bulletText?: string;
	margins?: VisioTextMargins;
	/** TextBkgnd: an opaque colour or `none`. */
	textBackground?: string;
	textBackgroundTransparency?: number;
	textBlock?: VisioTextBlockTransform;
}
export const textExtraCharacterKeys = [
	'fontTransparency',
	'textCase',
	'textPosition',
	'language',
	'letterSpacing',
] as const;
export const textExtraParagraphKeys = [
	'indentRight',
	'indentFirst',
	'spaceBefore',
	'spaceAfter',
	'lineSpacing',
	'bulletStyle',
	'bulletText',
] as const;

const range = (value: unknown, minimum: number, maximum: number, what: string): number => {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum)
		fail('INVALID_EDIT', `${what} is outside supported limits.`);
	return value;
};

/** Copy and validate the Text dialog properties; unknown keys are dropped. */
export function snapshotTextFormatExtras(edit: VisioTextFormatExtras): VisioTextFormatExtras {
	const result: VisioTextFormatExtras = {};
	if (edit.fontTransparency !== undefined)
		result.fontTransparency =
			Math.round(range(edit.fontTransparency, 0, 100, 'Font transparency') * 2) / 2;
	if (edit.textCase !== undefined) {
		if (!VISIO_TEXT_CASES.includes(edit.textCase)) fail('INVALID_EDIT', 'Unknown text case.');
		result.textCase = edit.textCase;
	}
	if (edit.textPosition !== undefined) {
		if (!VISIO_TEXT_POSITIONS.includes(edit.textPosition))
			fail('INVALID_EDIT', 'Unknown text position.');
		result.textPosition = edit.textPosition;
	}
	if (edit.language !== undefined) {
		const value = range(edit.language, 0, 0xffff, 'Language identifier');
		if (!Number.isInteger(value)) fail('INVALID_EDIT', 'Language identifiers are integers.');
		result.language = value;
	}
	if (edit.letterSpacing !== undefined)
		result.letterSpacing = range(edit.letterSpacing, -1584, 1584, 'Letter spacing');
	for (const name of ['indentRight', 'spaceBefore', 'spaceAfter'] as const)
		if (edit[name] !== undefined) result[name] = range(edit[name], 0, 7200, 'Paragraph spacing');
	if (edit.indentFirst !== undefined)
		result.indentFirst = range(edit.indentFirst, -7200, 7200, 'First-line indent');
	if (edit.lineSpacing !== undefined) {
		const { kind, value } = edit.lineSpacing ?? {};
		if (kind !== 'multiple' && kind !== 'exact') fail('INVALID_EDIT', 'Unknown line spacing.');
		result.lineSpacing = {
			kind,
			value:
				kind === 'multiple'
					? range(value, 0.25, 10, 'Line spacing')
					: range(value, 1, 1584, 'Line spacing'),
		};
	}
	if (edit.bulletStyle !== undefined) {
		const value = range(edit.bulletStyle, 0, 7, 'Bullet style');
		if (!Number.isInteger(value)) fail('INVALID_EDIT', 'Bullet styles are integers.');
		result.bulletStyle = value;
	}
	if (edit.bulletText !== undefined) {
		if (
			typeof edit.bulletText !== 'string' ||
			Array.from(edit.bulletText).length > 1 ||
			/[\u0000-\u001f\u007f￾￿]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u.test(
				edit.bulletText,
			)
		)
			fail('INVALID_EDIT', 'A custom bullet is one printable character.');
		result.bulletText = edit.bulletText;
	}
	if (edit.margins !== undefined) {
		if (!edit.margins || typeof edit.margins !== 'object')
			fail('INVALID_EDIT', 'Invalid text margins.');
		const margins: VisioTextMargins = {};
		for (const side of ['left', 'right', 'top', 'bottom'] as const)
			if (edit.margins[side] !== undefined)
				margins[side] = range(edit.margins[side], 0, 7200, 'Text margin');
		if (!Object.keys(margins).length) fail('INVALID_EDIT', 'Text margins require a side.');
		result.margins = margins;
	}
	if (edit.textBackground !== undefined) {
		if (
			typeof edit.textBackground !== 'string' ||
			(edit.textBackground !== 'none' && !/^#[0-9a-f]{6}$/i.test(edit.textBackground))
		)
			fail('INVALID_EDIT', 'Text background requires six hexadecimal digits or none.');
		result.textBackground = edit.textBackground.toLowerCase();
	}
	if (edit.textBackgroundTransparency !== undefined)
		result.textBackgroundTransparency =
			Math.round(range(edit.textBackgroundTransparency, 0, 100, 'Text background') * 2) / 2;
	if (edit.textBlock !== undefined) {
		const block = edit.textBlock;
		if (!block || typeof block !== 'object') fail('INVALID_EDIT', 'Invalid text block.');
		result.textBlock = {
			x: range(block.x, -100, 100, 'Text block position'),
			y: range(block.y, -100, 100, 'Text block position'),
			width: range(block.width, 0.0001, 100, 'Text block size'),
			height: range(block.height, 0.0001, 100, 'Text block size'),
			angle: range(block.angle, -1000, 1000, 'Text block angle'),
		};
	}
	return result;
}
