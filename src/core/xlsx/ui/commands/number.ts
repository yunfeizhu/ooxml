// Home > Number: the number format list (core FORMAT_PRESETS), accounting formats, percent,
// comma style and increase / decrease decimal.
import { BUILTIN_NUMBER_FORMATS, FORMAT_PRESETS, getCell, stepDecimals } from '../../index';
import type { Command } from '../commands';
import type { EditorContext } from '../context';
import { style } from './font';
import { icon } from './icons';
import { activeStyle, editing, target } from './util';

/** Accounting formats by currency (the Accounting split's menu). */
export const ACCOUNTING_FORMATS: ReadonlyArray<
	readonly [id: string, label: string, format: string]
> = [
	['usd', '$ English (United States)', BUILTIN_NUMBER_FORMATS[44] ?? ''],
	[
		'gbp',
		'£ English (United Kingdom)',
		'_-[$£-809]* #,##0.00_-;-[$£-809]* #,##0.00_-;_-[$£-809]* "-"??_-;_-@_-',
	],
	[
		'eur',
		'€ Euro (€ 123)',
		'_-[$€-x-euro2] * #,##0.00_-;-[$€-x-euro2] * #,##0.00_-;_-[$€-x-euro2] * "-"??_-;_-@_-',
	],
	[
		'cny',
		'¥ Chinese (PRC)',
		'_ [$¥-804]* #,##0.00_ ;_ [$¥-804]* -#,##0.00_ ;_ [$¥-804]* "-"??_ ;_ @_ ',
	],
	[
		'chf',
		'fr. French (Switzerland)',
		'_-* #,##0.00 [$CHF-100C]_-;-* #,##0.00 [$CHF-100C]_-;_-* "-"?? [$CHF-100C]_-;_-@_-',
	],
];

const COMMA = BUILTIN_NUMBER_FORMATS[43] ?? '_(* #,##0.00_);_(* \\(#,##0.00\\);_(* "-"??_);_(@_)';

/** The ribbon's number format options: the core presets plus the current custom code. */
export function numberFormatOptions(ctx: EditorContext): { value: string; label: string }[] {
	const options = FORMAT_PRESETS.map((p) => ({ value: p.format, label: ctx.t(p.label) }));
	const current = activeStyle(ctx)?.numFmt;
	if (current && !options.some((o) => o.value === current))
		options.push({ value: current, label: ctx.t('Custom') });
	return options;
}

const sampleNumber = (ctx: EditorContext): number | undefined => {
	const t = target(ctx);
	const value = t && getCell(t.ws, t.active.row, t.active.col)?.value;
	return typeof value === 'number' ? value : undefined;
};

export function numberCommands(): Command[] {
	const setFormat = (ctx: EditorContext, numFmt: string): void => style(ctx, { numFmt });
	return [
		editing({
			id: 'home.number-format',
			label: 'Number Format',
			icon: icon('numberFormat'),
			lock: 'formatCells',
			value: (ctx) => activeStyle(ctx)?.numFmt ?? 'General',
			run: (ctx, arg) => {
				if (typeof arg !== 'string' || !arg) return;
				const preset = FORMAT_PRESETS.find((p) => p.id === arg);
				setFormat(ctx, preset?.format ?? arg);
			},
		}),
		editing({
			id: 'home.accounting',
			label: 'Accounting Number Format',
			icon: icon('accounting'),
			lock: 'formatCells',
			run: (ctx, arg) => {
				const chosen = ACCOUNTING_FORMATS.find(([id]) => id === arg) ?? ACCOUNTING_FORMATS[0];
				if (chosen) setFormat(ctx, chosen[2]);
			},
		}),
		editing({
			id: 'home.accounting-more',
			label: 'More Accounting Formats...',
			icon: icon('accounting'),
			lock: 'formatCells',
			run: (ctx) =>
				void ctx.dialogs.open('format-cells', { tab: 'number', category: 'accounting' }),
		}),
		editing({
			id: 'home.percent',
			label: 'Percent Style',
			icon: icon('percent'),
			lock: 'formatCells',
			checked: (ctx) => activeStyle(ctx)?.numFmt === '0%',
			run: (ctx) => setFormat(ctx, '0%'),
		}),
		editing({
			id: 'home.comma',
			label: 'Comma Style',
			icon: icon('comma'),
			lock: 'formatCells',
			run: (ctx) => setFormat(ctx, COMMA),
		}),
		...([1, -1] as const).map((delta) =>
			editing({
				id: delta > 0 ? 'home.decimal-increase' : 'home.decimal-decrease',
				label: delta > 0 ? 'Increase Decimal' : 'Decrease Decimal',
				icon: icon(delta > 0 ? 'decimalIncrease' : 'decimalDecrease'),
				lock: 'formatCells',
				run: (ctx) =>
					setFormat(
						ctx,
						stepDecimals(activeStyle(ctx)?.numFmt ?? 'General', delta, sampleNumber(ctx)),
					),
			}),
		),
		editing({
			id: 'home.number-settings',
			label: 'Number Format Settings',
			icon: icon('formatCells'),
			lock: 'formatCells',
			run: (ctx) => void ctx.dialogs.open('format-cells', { tab: 'number' }),
		}),
		// Keyboard number formats (Ctrl+Shift+~ ! $ % @ # ^), mapped by the shell's keyboard.ts.
		...(
			[
				['home.format-general', 'General number format', 'General', 'Ctrl+Shift+~'],
				['home.format-number', 'Number format', '#,##0.00', 'Ctrl+Shift+!'],
				[
					'home.format-currency',
					'Currency format',
					'"$"#,##0.00_);\\("$"#,##0.00\\)',
					'Ctrl+Shift+$',
				],
				['home.format-percent', 'Percentage format', '0%', 'Ctrl+Shift+%'],
				['home.format-time', 'Time format', 'h:mm AM/PM', 'Ctrl+Shift+@'],
				['home.format-date', 'Date format', 'd-mmm-yy', 'Ctrl+Shift+#'],
				['home.format-scientific', 'Scientific format', '0.00E+00', 'Ctrl+Shift+^'],
			] as const
		).map(([id, label, format, shortcut]) =>
			editing({ id, label, shortcut, lock: 'formatCells', run: (ctx) => setFormat(ctx, format) }),
		),
	];
}
