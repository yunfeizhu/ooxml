import type { VisioShape } from '../model';
import type { VisioTextFormatEdit } from '../edit-commands';
import type { VisioTextCase, VisioTextPosition } from '../edit-formatting-text-commands';

/** Every field of Visio's Text dialog this editor writes. Lengths are points, percentages 0-100. */
export interface VisioTextDialogValues {
	fontFamily: string;
	fontSize: number;
	bold: boolean;
	italic: boolean;
	underline: boolean;
	strikethrough: boolean;
	fontColor: string;
	fontTransparency: number;
	textCase: VisioTextCase;
	textPosition: VisioTextPosition;
	/** Windows LCID; 0 when the text has none. */
	language: number;
	letterSpacing: number;
	horizontalAlign: 'left' | 'center' | 'right' | 'justify';
	indentLeft: number;
	indentRight: number;
	indentFirst: number;
	spaceBefore: number;
	spaceAfter: number;
	lineSpacingKind: 'multiple' | 'exact';
	/** A multiple (1.2 is single) or points. */
	lineSpacing: number;
	verticalAlign: 'top' | 'middle' | 'bottom';
	marginLeft: number;
	marginRight: number;
	marginTop: number;
	marginBottom: number;
	textBackground: string;
	textBackgroundTransparency: number;
	bulletStyle: number;
	bulletText: string;
}
export type VisioTextDialogPatch = Omit<VisioTextFormatEdit, 'type' | 'pageId' | 'shapeId'>;

/** Visio's built-in bullet glyphs by Paragraph.Bullet value. */
export const VISIO_BULLET_STYLES: readonly { value: number; glyph: string; label: string }[] = [
	{ value: 0, glyph: '', label: 'None' },
	{ value: 1, glyph: '•', label: 'Round' },
	{ value: 2, glyph: '◆', label: 'Diamond' },
	{ value: 3, glyph: '■', label: 'Square' },
	{ value: 4, glyph: '☐', label: 'Box' },
	{ value: 5, glyph: '❖', label: 'Diamonds' },
	{ value: 6, glyph: '➤', label: 'Arrow' },
	{ value: 7, glyph: '✓', label: 'Check' },
];
/** Common proofing languages as Windows language identifiers. */
export const VISIO_TEXT_LANGUAGES: readonly { id: number; label: string }[] = [
	{ id: 1033, label: 'English (United States)' },
	{ id: 2057, label: 'English (United Kingdom)' },
	{ id: 3081, label: 'English (Australia)' },
	{ id: 7177, label: 'English (South Africa)' },
	{ id: 1036, label: 'French (France)' },
	{ id: 1031, label: 'German (Germany)' },
	{ id: 3082, label: 'Spanish (Spain)' },
	{ id: 1040, label: 'Italian (Italy)' },
	{ id: 1043, label: 'Dutch (Netherlands)' },
	{ id: 1078, label: 'Afrikaans' },
	{ id: 1046, label: 'Portuguese (Brazil)' },
	{ id: 2070, label: 'Portuguese (Portugal)' },
	{ id: 1053, label: 'Swedish' },
	{ id: 1044, label: 'Norwegian (Bokmal)' },
	{ id: 1030, label: 'Danish' },
	{ id: 1035, label: 'Finnish' },
	{ id: 1045, label: 'Polish' },
	{ id: 1049, label: 'Russian' },
	{ id: 1055, label: 'Turkish' },
	{ id: 1032, label: 'Greek' },
	{ id: 1037, label: 'Hebrew' },
	{ id: 1025, label: 'Arabic (Saudi Arabia)' },
	{ id: 1081, label: 'Hindi' },
	{ id: 1041, label: 'Japanese' },
	{ id: 1042, label: 'Korean' },
	{ id: 2052, label: 'Chinese (Simplified)' },
	{ id: 1028, label: 'Chinese (Traditional)' },
];
const points = (inches: number) => Number((inches * 72).toFixed(2));

/** The dialog's starting values from a shape's default character and first paragraph. */
export function visioTextDialogValues(shape: VisioShape): VisioTextDialogValues {
	const text = shape.text;
	const run = text.runs[0] ?? text;
	const paragraph = text.paragraphs?.[0];
	const bullet = paragraph?.bullet;
	const builtin = VISIO_BULLET_STYLES.find((style) => style.value && style.glyph === bullet?.text);
	const hex = (value: string | undefined, fallback: string) =>
		value && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
	return {
		fontFamily: run.fontFamily,
		fontSize: points(run.fontSize),
		bold: !!run.bold,
		italic: !!run.italic,
		underline: !!run.underline,
		strikethrough: !!run.strikethrough,
		fontColor: hex(run.color, '#000000'),
		fontTransparency: Math.round((1 - (run.opacity ?? 1)) * 100),
		textCase: run.textCase ?? 'normal',
		textPosition: run.position ?? 'normal',
		language: run.language ?? 0,
		letterSpacing: points(run.letterSpacing ?? 0),
		horizontalAlign:
			paragraph?.horizontalAlign === 'distributed'
				? 'justify'
				: (paragraph?.horizontalAlign ?? text.horizontalAlign),
		indentLeft: points(paragraph?.indentLeft ?? 0),
		indentRight: points(paragraph?.indentRight ?? 0),
		indentFirst: points(paragraph?.indentFirst ?? 0),
		spaceBefore: points(paragraph?.spaceBefore ?? 0),
		spaceAfter: points(paragraph?.spaceAfter ?? 0),
		lineSpacingKind: paragraph?.lineSpacing.kind ?? 'multiple',
		lineSpacing:
			paragraph?.lineSpacing.kind === 'exact'
				? points(paragraph.lineSpacing.value)
				: Number((paragraph?.lineSpacing.value ?? 1.2).toFixed(2)),
		verticalAlign: text.verticalAlign,
		marginLeft: points(text.margins.left),
		marginRight: points(text.margins.right),
		marginTop: points(text.margins.top),
		marginBottom: points(text.margins.bottom),
		textBackground: text.backgroundColor ? hex(text.backgroundColor, '#ffffff') : 'none',
		textBackgroundTransparency: Math.round((1 - (text.backgroundOpacity ?? 1)) * 100),
		bulletStyle: bullet ? (builtin?.value ?? 1) : 0,
		bulletText: bullet && !builtin ? bullet.text : '',
	};
}

/** Only the fields the user changed, as a format-text patch. */
export function visioTextDialogPatch(
	initial: VisioTextDialogValues,
	next: VisioTextDialogValues,
): VisioTextDialogPatch {
	const patch: VisioTextDialogPatch = {};
	const changed = (key: keyof VisioTextDialogValues) => initial[key] !== next[key];
	for (const key of [
		'fontFamily',
		'fontSize',
		'bold',
		'italic',
		'underline',
		'strikethrough',
		'fontColor',
		'fontTransparency',
		'textCase',
		'textPosition',
		'letterSpacing',
		'horizontalAlign',
		'indentLeft',
		'indentRight',
		'indentFirst',
		'spaceBefore',
		'spaceAfter',
		'verticalAlign',
		'textBackground',
		'textBackgroundTransparency',
		'bulletStyle',
	] as const)
		if (changed(key)) Object.assign(patch, { [key]: next[key] });
	if (changed('language') && next.language) patch.language = next.language;
	if (changed('lineSpacing') || changed('lineSpacingKind'))
		patch.lineSpacing = { kind: next.lineSpacingKind, value: next.lineSpacing };
	const margins = (['Left', 'Right', 'Top', 'Bottom'] as const).filter((side) =>
		changed(`margin${side}`),
	);
	if (margins.length)
		patch.margins = Object.fromEntries(
			margins.map((side) => [side.toLowerCase(), next[`margin${side}`]]),
		);
	if (changed('bulletText')) {
		patch.bulletText = next.bulletText;
		// A custom character needs a visible bullet style to show.
		if (next.bulletText && !next.bulletStyle) patch.bulletStyle = 1;
	}
	return patch;
}
