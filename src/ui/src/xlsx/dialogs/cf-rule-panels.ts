// Rule description panels of the New / Edit Formatting Rule dialog for the rule types that
// carry a format: cell contents, top / bottom, average, unique / duplicate and formula.
import type { ConditionalOperator, ConditionalRule, DifferentialStyle } from 'ooxml-core/xlsx';
import type { EditorContext } from 'ooxml-core/xlsx/ui';
import { OPERATORS, TIME_PERIOD_LABELS, operand, operandText } from './cf-common';
import { checkbox, el, field, numberInput, row, select, textInput } from './fields';

export type PanelRead =
	| ConditionalRule
	| { error: string; control: HTMLElement; vars?: Record<string, string | number> };

export interface RulePanel {
	element: HTMLElement;
	/** Whether the panel's rules take a differential style (Format... button). */
	styled: boolean;
	load(rule: ConditionalRule): void;
	read(style: DifferentialStyle): PanelRead;
	focus(): void;
}

const panel = (ctx: EditorContext, ...children: HTMLElement[]): HTMLDivElement => {
	const div = el(ctx, 'div', 'xve-cf-panel');
	div.append(...children);
	return div;
};

const TEXT_OPS = [
	['containsText', 'containing'],
	['notContainsText', 'not containing'],
	['beginsWith', 'beginning with'],
	['endsWith', 'ending with'],
] as const;

export function containsPanel(ctx: EditorContext): RulePanel {
	const what = select(
		ctx,
		[
			['cellIs', 'Cell Value'],
			['text', 'Specific Text'],
			['timePeriod', 'Dates Occurring'],
			['containsBlanks', 'Blanks'],
			['notContainsBlanks', 'No Blanks'],
			['containsErrors', 'Errors'],
			['notContainsErrors', 'No Errors'],
		],
		'cellIs',
	);
	const op = select(ctx, OPERATORS, 'between');
	const textOp = select(ctx, TEXT_OPS, 'containsText');
	const v1 = textInput(ctx);
	const v2 = textInput(ctx);
	const textValue = textInput(ctx);
	const period = select(ctx, TIME_PERIOD_LABELS, 'yesterday');
	const f1 = field(ctx, 'Value', v1);
	const f2 = field(ctx, 'and', v2);
	const fOp = field(ctx, 'Operator', op);
	const fTextOp = field(ctx, 'Text operator', textOp);
	const fText = field(ctx, 'Text', textValue);
	const fPeriod = field(ctx, 'Date', period);
	const sync = (): void => {
		const cell = what.value === 'cellIs';
		const text = what.value === 'text';
		fOp.hidden = !cell;
		f1.hidden = !cell;
		f2.hidden = !cell || (op.value !== 'between' && op.value !== 'notBetween');
		fTextOp.hidden = !text;
		fText.hidden = !text;
		fPeriod.hidden = what.value !== 'timePeriod';
	};
	what.addEventListener('change', sync);
	op.addEventListener('change', sync);
	sync();
	return {
		element: panel(
			ctx,
			text(ctx, 'Format only cells with:'),
			field(ctx, 'Cells with', what),
			fOp,
			f1,
			f2,
			fTextOp,
			fText,
			fPeriod,
		),
		styled: true,
		load(rule) {
			if (rule.type === 'cellIs') {
				what.value = 'cellIs';
				op.value = rule.operator;
				v1.value = operandText(rule.formulas[0]);
				v2.value = operandText(rule.formulas[1]);
			} else if (
				rule.type === 'containsText' ||
				rule.type === 'notContainsText' ||
				rule.type === 'beginsWith' ||
				rule.type === 'endsWith'
			) {
				what.value = 'text';
				textOp.value = rule.type;
				textValue.value = rule.text;
			} else if (rule.type === 'timePeriod') {
				what.value = 'timePeriod';
				period.value = rule.timePeriod;
			} else what.value = rule.type;
			sync();
		},
		read(style) {
			const priority = 1;
			if (what.value === 'cellIs') {
				const two = op.value === 'between' || op.value === 'notBetween';
				if (!v1.value.trim()) return { error: 'Enter a value.', control: v1 };
				if (two && !v2.value.trim()) return { error: 'Enter a value.', control: v2 };
				const formulas = two ? [operand(v1.value), operand(v2.value)] : [operand(v1.value)];
				return {
					type: 'cellIs',
					operator: op.value as ConditionalOperator,
					formulas,
					style,
					priority,
				};
			}
			if (what.value === 'text') {
				if (!textValue.value) return { error: 'Enter a value.', control: textValue };
				return {
					type: textOp.value as (typeof TEXT_OPS)[number][0],
					text: textValue.value,
					style,
					priority,
				};
			}
			if (what.value === 'timePeriod') {
				const timePeriod = TIME_PERIOD_LABELS.find(([p]) => p === period.value)?.[0] ?? 'today';
				return { type: 'timePeriod', timePeriod, style, priority };
			}
			return { type: what.value as 'containsBlanks', style, priority };
		},
		focus: () => what.focus(),
	};
}

function text(ctx: EditorContext, key: string): HTMLParagraphElement {
	const p = el(ctx, 'p', 'xve-field-label');
	p.textContent = ctx.t(key);
	return p;
}

export function topPanel(ctx: EditorContext): RulePanel {
	const side = select(
		ctx,
		[
			['top', 'Top'],
			['bottom', 'Bottom'],
		],
		'top',
	);
	const rank = numberInput(ctx, 10, 1, 1000);
	const percent = checkbox(ctx, '% of the selected range');
	return {
		element: panel(
			ctx,
			text(ctx, 'Format values that rank in the:'),
			row(ctx, field(ctx, 'Rank', side), field(ctx, 'Count', rank)),
			percent.wrapper,
		),
		styled: true,
		load(rule) {
			if (rule.type !== 'top10') return;
			side.value = rule.bottom ? 'bottom' : 'top';
			rank.value = String(rule.rank);
			percent.input.checked = !!rule.percent;
		},
		read(style) {
			const n = Number(rank.value);
			const max = percent.input.checked ? 100 : 1000;
			if (!Number.isInteger(n) || n < 1 || n > max)
				return {
					error: 'Enter a whole number between {min} and {max}.',
					control: rank,
					vars: { min: 1, max },
				};
			const rule: ConditionalRule = { type: 'top10', rank: n, style, priority: 1 };
			if (side.value === 'bottom') rule.bottom = true;
			if (percent.input.checked) rule.percent = true;
			return rule;
		},
		focus: () => side.focus(),
	};
}

export function averagePanel(ctx: EditorContext): RulePanel {
	const which = select(
		ctx,
		[
			['above', 'above'],
			['below', 'below'],
			['equalAbove', 'equal or above'],
			['equalBelow', 'equal or below'],
		],
		'above',
	);
	return {
		element: panel(
			ctx,
			field(ctx, 'Format values that are:', which),
			text(ctx, 'the average for the selected range'),
		),
		styled: true,
		load(rule) {
			if (rule.type !== 'aboveAverage') return;
			which.value = rule.equalAverage
				? rule.below
					? 'equalBelow'
					: 'equalAbove'
				: rule.below
					? 'below'
					: 'above';
		},
		read(style) {
			const rule: ConditionalRule = { type: 'aboveAverage', style, priority: 1 };
			if (which.value.toLowerCase().includes('below')) rule.below = true;
			if (which.value.startsWith('equal')) rule.equalAverage = true;
			return rule;
		},
		focus: () => which.focus(),
	};
}

export function uniquePanel(ctx: EditorContext): RulePanel {
	const which = select(
		ctx,
		[
			['duplicateValues', 'duplicate'],
			['uniqueValues', 'unique'],
		],
		'duplicateValues',
	);
	return {
		element: panel(
			ctx,
			field(ctx, 'Format all:', which),
			text(ctx, 'values in the selected range'),
		),
		styled: true,
		load(rule) {
			if (rule.type === 'duplicateValues' || rule.type === 'uniqueValues') which.value = rule.type;
		},
		read: (style) => ({ type: which.value as 'duplicateValues', style, priority: 1 }),
		focus: () => which.focus(),
	};
}

export function formulaPanel(ctx: EditorContext): RulePanel {
	const input = textInput(ctx);
	return {
		element: panel(ctx, field(ctx, 'Format values where this formula is true:', input)),
		styled: true,
		load(rule) {
			if (rule.type === 'expression') input.value = `=${rule.formula}`;
		},
		read(style) {
			const formula = input.value.trim().replace(/^=/, '');
			if (!formula) return { error: 'Enter a formula.', control: input };
			return { type: 'expression', formula, style, priority: 1 };
		},
		focus: () => input.focus(),
	};
}
