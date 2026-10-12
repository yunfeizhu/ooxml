import { visioFormulaCachedValue } from './formula';
import { sectionRows, type Sheet } from './sheet';
import {
	evaluateVisioTextField,
	formatVisioFieldValue,
	visioSerialDate,
	type VisioFieldContext,
	type VisioFieldValue,
} from './text-fields';

/** The cached Value of a Field row, typed by its unit. */
function cachedValue(
	value: string | undefined,
	unit: string | undefined,
): VisioFieldValue | undefined {
	if (value === undefined) return undefined;
	if (unit === 'STR') return { kind: 'string', text: value };
	if (unit === 'DATE') {
		const date = visioSerialDate(Number(value));
		return date ? { kind: 'date', date } : undefined;
	}
	try {
		const cached = visioFormulaCachedValue(value, unit);
		return { kind: 'number', value: cached.value, unit: cached.unit };
	} catch {
		return undefined;
	}
}

/**
 * Display text of one `<fld>`: context functions (page, document, clock) are evaluated, other
 * values come from the Field row's cached Value. Unsupported formats keep the stored text.
 */
export function textFieldDisplay(
	element: Element,
	sheet: Sheet,
	context: VisioFieldContext | undefined,
): { text: string; cached: string; formula?: string } {
	const cached = element.textContent ?? '';
	const index = element.getAttribute('IX') ?? '0';
	const row = sectionRows(sheet, 'Field').find((candidate) => candidate.index === index);
	const value = row?.cells.get('Value'),
		format = row?.cells.get('Format');
	const formula = value?.formula && value.formula !== 'Inh' ? value.formula : undefined;
	const result = { cached, ...(formula ? { formula } : {}) };
	if (!row || !context || (format?.formula && /^\s*FIELDPICTURE\s*\(/i.test(format.formula)))
		return { text: cached, ...result };
	const picture = format?.value ?? '';
	const evaluated = formula ? evaluateVisioTextField(formula, context) : undefined;
	const source = evaluated ?? cachedValue(value?.value, value?.unit);
	const text = source ? formatVisioFieldValue(source, picture) : undefined;
	return { text: text ?? cached, ...result };
}
