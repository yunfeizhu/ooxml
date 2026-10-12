import { VISIO_SHADOW_PRESETS, type VisioShape, type VisioShapeFormatEdit } from 'ooxml-core/visio';
import { visioShapeEffectValues, visioShapeFormattingState } from 'ooxml-core/visio/ui';

export type PanePatch = Omit<VisioShapeFormatEdit, 'type' | 'pageId' | 'shapeId'>;
/** Where a field sits: under the fill choices, under the line choices, or in Effects. */
export type PaneFieldGroup = 'fill' | 'line' | 'effects';

/** What a field reads its value from: the selection and its common formatting. */
export interface PaneFieldContext {
	shapes: readonly VisioShape[];
	common: ReturnType<typeof visioShapeFormattingState>;
	effects: readonly ReturnType<typeof visioShapeEffectValues>[];
}
export interface PaneField {
	key: string;
	label: string;
	group: PaneFieldGroup;
	/** A list of choices; without it the field is a number. */
	options?: readonly { value: string; label: string }[];
	/** Largest number accepted, and what the reason calls the value. */
	max?: number;
	step?: string;
	name?: string;
	/** The selection's value as field text; empty when the shapes differ. */
	read(context: PaneFieldContext): string;
	patch(value: number, context: PaneFieldContext): PanePatch;
}

const same = <T>(values: readonly T[]): T | undefined =>
	values.length && values.every((value) => value === values[0]) ? values[0] : undefined;
const text = (value: number | undefined) => (value === undefined ? '' : String(value));
const round = (value: number) => Math.round(value * 100) / 100;
const style = <T>(context: PaneFieldContext, read: (shape: VisioShape) => T) =>
	same(context.shapes.map(read));
const numbered = (count: number, first: string, rest: string) =>
	Array.from({ length: count }, (_, index) => ({
		value: String(index),
		label: index === 0 ? first : `${rest} ${index}`,
	}));

const ARROW_SIZES = ['Very small', 'Small', 'Medium', 'Large', 'Extra large', 'Jumbo', 'Colossal'];
const sizes = ARROW_SIZES.map((label, index) => ({ value: String(index), label }));
/** The model's SVG cap names against Visio's LineCap codes. */
const CAPS = { round: 0, butt: 1, square: 2 } as const;

const glow = (context: PaneFieldContext) => context.effects[0]?.glow;
const reflection = (context: PaneFieldContext) => context.effects[0]?.reflection;
const effect = <T>(
	context: PaneFieldContext,
	read: (values: PaneFieldContext['effects'][number]) => T,
) => same(context.effects.map(read));
/** The glow as it is now, with one value replaced: the edit takes the whole effect. */
const withGlow = (context: PaneFieldContext, next: Partial<NonNullable<PanePatch['glow']>>) => ({
	glow: { size: 0, color: '#000000', transparency: 0, ...glow(context), ...next },
});
const withReflection = (
	context: PaneFieldContext,
	next: Partial<NonNullable<PanePatch['reflection']>>,
) => ({
	reflection: { size: 0, transparency: 0, distance: 0, blur: 0, ...reflection(context), ...next },
});

/**
 * The Format Shape pane's fields beyond colour, transparency, width and dash: Visio's fill
 * pattern, line cap, line ends and rounding, and the Effects section. Each is one existing
 * `format-shape` property, read from the selection and applied at once.
 */
export const PANE_FIELDS: readonly PaneField[] = [
	{
		key: 'fillPattern',
		label: 'Pattern',
		group: 'fill',
		options: numbered(25, '', 'Pattern')
			.slice(1)
			.map((item) => (item.value === '1' ? { value: '1', label: 'Solid' } : item)),
		read: (context) => text(context.common.fillPatternIndex),
		patch: (value) => ({ fillPattern: value }),
	},
	{
		key: 'lineCap',
		label: 'Cap type',
		group: 'line',
		options: [
			{ value: '0', label: 'Round' },
			{ value: '1', label: 'Square' },
			{ value: '2', label: 'Extended' },
		],
		read: (context) => {
			const cap = style(context, (shape) => shape.style.lineCap);
			return cap ? String(CAPS[cap]) : '';
		},
		patch: (value) => ({ lineCap: value }),
	},
	{
		key: 'rounding',
		label: 'Rounding size (pt)',
		group: 'line',
		max: 720,
		step: '1',
		name: 'a rounding size',
		read: (context) => text(style(context, (shape) => round((shape.style.rounding ?? 0) * 72))),
		patch: (value) => ({ rounding: value }),
	},
	{
		key: 'beginArrow',
		label: 'Begin arrow type',
		group: 'line',
		options: numbered(46, 'None', 'Arrow'),
		read: (context) => text(style(context, (shape) => shape.style.startArrow)),
		patch: (value) => ({ beginArrow: value }),
	},
	{
		key: 'beginArrowSize',
		label: 'Begin arrow size',
		group: 'line',
		options: sizes,
		read: (context) => text(style(context, (shape) => shape.style.startArrowSize ?? 2)),
		patch: (value) => ({ beginArrowSize: value }),
	},
	{
		key: 'endArrow',
		label: 'End arrow type',
		group: 'line',
		options: numbered(46, 'None', 'Arrow'),
		read: (context) => text(style(context, (shape) => shape.style.endArrow)),
		patch: (value) => ({ endArrow: value }),
	},
	{
		key: 'endArrowSize',
		label: 'End arrow size',
		group: 'line',
		options: sizes,
		read: (context) => text(style(context, (shape) => shape.style.endArrowSize ?? 2)),
		patch: (value) => ({ endArrowSize: value }),
	},
	{
		key: 'shadow',
		label: 'Shadow',
		group: 'effects',
		options: VISIO_SHADOW_PRESETS.map((preset, index) => ({
			value: String(index),
			label: preset === 'none' ? 'No Shadow' : `Offset: ${preset.replace('-', ' ')}`,
		})),
		read: (context) => {
			const preset = context.common.shadowPreset;
			const index = preset ? VISIO_SHADOW_PRESETS.indexOf(preset) : -1;
			return index < 0 ? '' : String(index);
		},
		patch: (value) => ({ shadow: VISIO_SHADOW_PRESETS[value]! }),
	},
	{
		key: 'glowSize',
		label: 'Glow size (pt)',
		group: 'effects',
		max: 150,
		step: '0.5',
		name: 'a glow size',
		read: (context) => text(effect(context, (values) => values.glow.size)),
		patch: (value, context) => withGlow(context, { size: value }),
	},
	{
		key: 'glowTransparency',
		label: 'Glow transparency (%)',
		group: 'effects',
		max: 100,
		step: '1',
		name: 'a glow transparency',
		read: (context) => text(effect(context, (values) => values.glow.transparency)),
		patch: (value, context) => withGlow(context, { transparency: value }),
	},
	{
		key: 'softEdges',
		label: 'Soft edges size (pt)',
		group: 'effects',
		max: 100,
		step: '0.5',
		name: 'a soft edge size',
		read: (context) => text(effect(context, (values) => values.softEdges)),
		patch: (value) => ({ softEdges: value }),
	},
	...(
		[
			['size', 'Reflection size (%)', 'a reflection size'],
			['transparency', 'Reflection transparency (%)', 'a reflection transparency'],
			['distance', 'Reflection distance (pt)', 'a reflection distance'],
			['blur', 'Reflection blur (pt)', 'a reflection blur'],
		] as const
	).map(([part, label, name]): PaneField => ({
		key: `reflection${part[0]!.toUpperCase()}${part.slice(1)}`,
		label,
		group: 'effects',
		max: 100,
		step: '0.5',
		name,
		read: (context) => text(effect(context, (values) => values.reflection[part])),
		patch: (value, context) => withReflection(context, { [part]: value }),
	})),
];

export function paneFieldContext(shapes: readonly VisioShape[]): PaneFieldContext {
	return {
		shapes,
		common: visioShapeFormattingState(shapes),
		effects: shapes.map(visioShapeEffectValues),
	};
}

/** The glow colour is a colour control of its own; the patch keeps the glow's other values. */
export const glowColorPatch = (shapes: readonly VisioShape[], color: string): PanePatch =>
	withGlow(paneFieldContext(shapes), { color });

/** One labelled row with a select or number input carrying `data-pane-field`. */
export function paneFieldRow(
	doc: Document,
	field: PaneField,
): { row: HTMLLabelElement; input: HTMLInputElement | HTMLSelectElement } {
	const row = doc.createElement('label');
	row.className = 'format-pane-row';
	const caption = doc.createElement('span');
	caption.textContent = field.label;
	let input: HTMLInputElement | HTMLSelectElement;
	if (field.options) {
		input = doc.createElement('select');
		// A mixed selection shows no choice.
		const blank = doc.createElement('option');
		blank.value = '';
		blank.hidden = true;
		input.append(blank);
		for (const { value, label } of field.options) {
			const option = doc.createElement('option');
			option.value = value;
			option.textContent = label;
			input.append(option);
		}
	} else {
		input = doc.createElement('input');
		input.type = 'number';
		input.min = '0';
		input.max = String(field.max ?? 100);
		input.step = field.step ?? '1';
	}
	input.dataset.paneField = field.key;
	row.append(caption, input);
	return { row, input };
}
