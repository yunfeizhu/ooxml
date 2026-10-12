// Format Cells > Number: the category list, each category's options and a live sample formatted
// by the core's formatValue.
import { BUILTIN_NUMBER_FORMATS, type CellValue, formatValue } from 'ooxml-core/xlsx';
import { checkbox, el, field, listBox, numberInput, row, select, text, textInput } from '../fields';
import {
	CATEGORIES,
	type CategoryId,
	DATE_CODES,
	DEFAULT_OPTIONS,
	FRACTION_CODES,
	type NumberOptions,
	SPECIAL_CODES,
	SYMBOLS,
	TIME_CODES,
	buildCode,
	detectCategory,
	negativeCodes,
} from 'ooxml-core/xlsx/ui';
import type { FormatTab, TabInit } from 'ooxml-core/xlsx/ui';

const NOTES: Partial<Record<CategoryId, string>> = {
	general: 'General format cells have no specific number format.',
	number:
		'Number is used for general display of numbers. Currency and Accounting offer specialized formatting for monetary value.',
	currency:
		'Currency formats are used for general monetary values. Use Accounting formats to align decimal points in a column.',
	accounting: 'Accounting formats line up the currency symbols and decimal points in a column.',
	date: 'Date formats display date and time serial numbers as date values.',
	time: 'Time formats display date and time serial numbers as time values.',
	percentage:
		'Percentage formats multiply the cell value by 100 and display the result with a percent symbol.',
	text: 'Text format cells are treated as text even when a number is in the cell.',
	special: 'Special formats are useful for tracking list and database values.',
	custom: 'Type the number format code, using one of the existing codes as a starting point.',
};

const LISTS: Partial<Record<CategoryId, readonly string[]>> = {
	date: DATE_CODES,
	time: TIME_CODES,
	fraction: FRACTION_CODES.map(([c]) => c),
	special: SPECIAL_CODES.map(([c]) => c),
};

const SAMPLE_DATE = 40982.5625;

export function format(
	value: CellValue,
	code: string,
	date1904: boolean,
): { text: string; color?: string } {
	try {
		return formatValue(value, code, { date1904 });
	} catch {
		return { text: '' };
	}
}

export function numberTab(init: TabInit): FormatTab {
	const { ctx } = init;
	const detected = detectCategory(init.style.numFmt);
	const requested = CATEGORIES.find(([id]) => id === init.props.category)?.[0];
	let category: CategoryId = requested ?? detected.category;
	let options: NumberOptions = { ...detected.options };
	let dirty = false;
	let ready = false;
	if (requested && requested !== detected.category) {
		dirty = true;
		options = { ...DEFAULT_OPTIONS, code: LISTS[requested]?.[0] ?? init.style.numFmt };
	}
	const sampleValue = (): CellValue => {
		const v = init.value;
		if (typeof v === 'number') return v;
		if (category === 'date' || category === 'time') return SAMPLE_DATE;
		if (category === 'text' || category === 'general' || category === 'custom') return v ?? '';
		return 1234.5;
	};
	const code = (): string => buildCode(category, options);
	const sample = el(ctx, 'div', 'xve-sample');
	sample.setAttribute('aria-live', 'polite');
	sample.dataset.sample = '';
	const area = el(ctx, 'div', 'xve-number-options');
	const note = el(ctx, 'p', 'xve-note');
	const update = (): void => {
		const out = format(sampleValue(), code(), init.date1904);
		sample.textContent = out.text;
		sample.style.color = out.color ?? '';
	};
	const changed = (): void => {
		if (ready) dirty = true;
		update();
	};
	const decimalsField = () => {
		const input = numberInput(ctx, options.decimals, 0, 30);
		input.addEventListener('input', () => {
			const n = Math.round(Number(input.value));
			if (Number.isFinite(n)) options.decimals = Math.max(0, Math.min(30, n));
			changed();
			renderNegatives();
		});
		return field(ctx, 'Decimal places:', input);
	};
	let negatives: ReturnType<typeof listBox> | undefined;
	const renderNegatives = (): void => {
		if (!negatives) return;
		const base = buildCode(category, { ...options, negative: 0 });
		const codes = negativeCodes(base.split(';')[0] ?? base);
		negatives.setItems(codes.map((c, i) => [String(i), format(-1234.1, c, false).text] as const));
		negatives.select(String(options.negative));
		negatives.element.querySelectorAll<HTMLElement>('[role="option"]').forEach((o, i) => {
			o.style.color = i % 2 ? '#c00000' : '';
		});
	};
	const codeList = (label: string, items: ReadonlyArray<readonly [string, string]>) => {
		const list = listBox(ctx, label, (v) => {
			options.code = v;
			changed();
		});
		list.setItems(items);
		if (!items.some(([v]) => v === options.code)) options.code = items[0]?.[0] ?? options.code;
		list.select(options.code);
		return [text(ctx, label, 'xve-field-label'), list.element];
	};
	const renderOptions = (): void => {
		const parts: HTMLElement[] = [];
		negatives = undefined;
		if (['number', 'currency', 'accounting', 'percentage', 'scientific'].includes(category))
			parts.push(decimalsField());
		if (category === 'number') {
			const sep = checkbox(ctx, 'Use 1000 Separator (,)', options.thousands);
			sep.input.addEventListener('change', () => {
				options.thousands = sep.input.checked;
				changed();
				renderNegatives();
			});
			parts.push(sep.wrapper);
		}
		if (category === 'currency' || category === 'accounting') {
			const sym = select(
				ctx,
				SYMBOLS.map(([label], i) => [String(i), i ? label : ctx.t(label)] as const),
				String(options.symbol),
				true,
			);
			sym.addEventListener('change', () => {
				options.symbol = Number(sym.value);
				changed();
				renderNegatives();
			});
			parts.push(field(ctx, 'Symbol:', sym));
		}
		if (category === 'number' || category === 'currency') {
			negatives = listBox(ctx, 'Negative numbers:', (v) => {
				options.negative = Number(v);
				changed();
			});
			parts.push(text(ctx, 'Negative numbers:', 'xve-field-label'), negatives.element);
		}
		if (category === 'date' || category === 'time')
			parts.push(
				...codeList(
					'Type:',
					(LISTS[category] ?? []).map((c) => [c, format(SAMPLE_DATE, c, false).text] as const),
				),
			);
		if (category === 'fraction')
			parts.push(
				...codeList(
					'Type:',
					FRACTION_CODES.map(([c, l]) => [c, ctx.t(l)] as const),
				),
			);
		if (category === 'special')
			parts.push(
				...codeList(
					'Type:',
					SPECIAL_CODES.map(([c, l]) => [c, ctx.t(l)] as const),
				),
			);
		if (category === 'custom') {
			const input = textInput(ctx, options.code);
			input.addEventListener('input', () => {
				options.code = input.value;
				changed();
			});
			const known = [
				...new Set([
					...ctx.workbook()!.styles.map((s) => s.numFmt),
					...Object.values(BUILTIN_NUMBER_FORMATS),
				]),
			].filter(Boolean);
			const list = listBox(ctx, 'Type:', (v) => {
				input.value = v;
				options.code = v;
				changed();
			});
			list.setItems(known.map((c) => [c, c] as const));
			parts.push(field(ctx, 'Type:', input), list.element);
		}
		note.textContent = NOTES[category] ? ctx.t(NOTES[category]!) : '';
		area.replaceChildren(...parts);
		renderNegatives();
	};
	const categories = listBox(ctx, 'Category:', (value) => {
		if (!ready) return;
		const previous = code();
		category = value as CategoryId;
		options.code = category === 'custom' ? previous : (LISTS[category]?.[0] ?? options.code);
		dirty = true;
		renderOptions();
		update();
	});
	categories.setItems(CATEGORIES.map(([id, label]) => [id, ctx.t(label)] as const));
	categories.select(category);
	renderOptions();
	update();
	ready = true;
	const sampleBox = el(ctx, 'div');
	sampleBox.append(text(ctx, 'Sample', 'xve-field-label'), sample);
	const right = el(ctx, 'div', 'xve-col');
	right.append(sampleBox, area);
	const left = el(ctx, 'div');
	left.append(text(ctx, 'Category:', 'xve-field-label'), categories.element);
	const panel = el(ctx, 'div');
	panel.append(row(ctx, left, right), note);
	return {
		id: 'number',
		label: 'Number',
		panel,
		dirty: () => dirty,
		patch: () => ({ numFmt: code() }),
		toDxf: (dxf) => {
			dxf.numFmt = code();
		},
		focus: () => categories.element.focus(),
	};
}
