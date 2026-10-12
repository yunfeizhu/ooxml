import {
	evaluateVisioFormula,
	parseVisioFormula,
	type VisioFormulaReference,
	type VisioFormulaValue,
} from './formula';

/** Document properties a field can show (core and extended properties). */
export interface VisioFieldProperties {
	title?: string;
	subject?: string;
	creator?: string;
	keywords?: string;
	description?: string;
	category?: string;
	company?: string;
	manager?: string;
	/** W3CDTF timestamps. */
	created?: string;
	modified?: string;
	lastPrinted?: string;
}
export interface VisioFieldContext {
	pageName?: string;
	pageNumber?: number;
	pageCount?: number;
	properties?: VisioFieldProperties;
	/** The moment NOW() shows; omitted leaves NOW() fields at their cached value. */
	now?: Date;
	/** Numeric cell lookup for custom and geometry formulas (internal units). */
	resolve?: (reference: VisioFormulaReference) => VisioFormulaValue;
}
/** A field result. Dates are wall-clock components held in a UTC Date. */
export type VisioFieldValue =
	| { kind: 'string'; text: string }
	| { kind: 'number'; value: number; unit: VisioFormulaValue['unit'] }
	| { kind: 'date'; date: Date };

const PROPERTY_FUNCTIONS: Record<string, keyof VisioFieldProperties> = {
	TITLE: 'title',
	SUBJECT: 'subject',
	CREATOR: 'creator',
	KEYWORDS: 'keywords',
	DESCRIPTION: 'description',
	CATEGORY: 'category',
	COMPANY: 'company',
	MANAGER: 'manager',
};
const DATE_FUNCTIONS: Record<string, keyof VisioFieldProperties | undefined> = {
	NOW: undefined,
	DOCCREATION: 'created',
	DOCLASTSAVE: 'modified',
	DOCLASTEDIT: 'modified',
	DOCLASTPRINT: 'lastPrinted',
};
/** Field functions that read document context, never ShapeSheet cells. */
export const VISIO_FIELD_FUNCTIONS: readonly string[] = [
	...Object.keys(PROPERTY_FUNCTIONS),
	...Object.keys(DATE_FUNCTIONS),
	'PAGENAME',
];

/** Wall-clock components of a local moment, held as UTC so formatting is zone-independent. */
export function visioWallClock(date: Date): Date {
	return new Date(
		Date.UTC(
			date.getFullYear(),
			date.getMonth(),
			date.getDate(),
			date.getHours(),
			date.getMinutes(),
			date.getSeconds(),
		),
	);
}
const EPOCH = Date.UTC(1899, 11, 30);
/** Visio DATE caches count days since 30 December 1899. */
export const visioDateSerial = (date: Date): number =>
	Number(((date.getTime() - EPOCH) / 86_400_000).toFixed(8));
export const visioSerialDate = (serial: number): Date | undefined =>
	Number.isFinite(serial) && Math.abs(serial) < 3_000_000
		? new Date(EPOCH + Math.round(serial * 86_400_000))
		: undefined;

/**
 * Evaluate a field formula against its document context. Undefined means the formula is outside
 * this evaluator; the caller keeps the cached text.
 */
export function evaluateVisioTextField(
	formula: string,
	context: VisioFieldContext,
): VisioFieldValue | undefined {
	let ast;
	try {
		ast = parseVisioFormula(formula, { maxLength: 4096 });
	} catch {
		return undefined;
	}
	if (ast.kind === 'call') {
		const name = ast.name;
		if (Object.hasOwn(PROPERTY_FUNCTIONS, name) && !ast.args.length) {
			const value = context.properties?.[PROPERTY_FUNCTIONS[name]!];
			return value === undefined ? undefined : { kind: 'string', text: value };
		}
		if (Object.hasOwn(DATE_FUNCTIONS, name) && !ast.args.length) {
			if (name === 'NOW') return context.now ? { kind: 'date', date: context.now } : undefined;
			const stamp = context.properties?.[DATE_FUNCTIONS[name]!];
			const time = stamp ? Date.parse(stamp) : Number.NaN;
			return Number.isFinite(time)
				? { kind: 'date', date: visioWallClock(new Date(time)) }
				: undefined;
		}
		if (name === 'PAGENAME' && ast.args.length <= 1)
			return context.pageName === undefined
				? undefined
				: { kind: 'string', text: context.pageName };
	}
	try {
		const result = evaluateVisioFormula(
			ast,
			context.resolve ??
				(() => {
					throw new Error('No cell context');
				}),
			{
				...(context.pageNumber === undefined ? {} : { pageNumber: context.pageNumber }),
				...(context.pageCount === undefined ? {} : { pageCount: context.pageCount }),
			},
		);
		return { kind: 'number', value: result.value, unit: result.unit };
	} catch {
		return undefined;
	}
}

const MONTHS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December',
];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const pad = (value: number, length = 2) => String(value).padStart(length, '0');

/** The text of one date-picture token, or `undefined` when `token` is not one. */
function dateToken(date: Date, token: string): string | undefined {
	const hours = date.getUTCHours();
	switch (token) {
		case 'yyyy':
			return pad(date.getUTCFullYear(), 4);
		case 'yy':
			return pad(date.getUTCFullYear() % 100);
		case 'MMMM':
			return MONTHS[date.getUTCMonth()]!;
		case 'MMM':
			return MONTHS[date.getUTCMonth()]!.slice(0, 3);
		case 'MM':
			return pad(date.getUTCMonth() + 1);
		case 'M':
			return String(date.getUTCMonth() + 1);
		case 'dddd':
			return DAYS[date.getUTCDay()]!;
		case 'ddd':
			return DAYS[date.getUTCDay()]!.slice(0, 3);
		case 'dd':
			return pad(date.getUTCDate());
		case 'd':
			return String(date.getUTCDate());
		case 'HH':
			return pad(hours);
		case 'H':
			return String(hours);
		case 'hh':
			return pad(hours % 12 || 12);
		case 'h':
			return String(hours % 12 || 12);
		case 'mm':
			return pad(date.getUTCMinutes());
		case 'ss':
			return pad(date.getUTCSeconds());
		case 'tt':
			return hours < 12 ? 'AM' : 'PM';
		default:
			return undefined;
	}
}

function formatDate(date: Date, picture: string): string {
	return picture.replace(
		/yyyy|yy|MMMM|MMM|MM|M|dddd|ddd|dd|d|HH|H|hh|h|mm|ss|tt|"[^"]*"/g,
		(token) => {
			if (token.startsWith('"')) return token.slice(1, -1);
			return dateToken(date, token) ?? token;
		},
	);
}

function formatNumber(value: number, picture: string): string | undefined {
	const match = /^(#,##)?0(?:\.(0+|#+))?$/.exec(picture);
	if (!match) return undefined;
	const decimals = match[2]?.length ?? 0;
	const optional = match[2]?.startsWith('#') ?? false;
	let text = value.toFixed(decimals);
	if (optional && text.includes('.')) text = text.replace(/\.?0+$/, '');
	if (match[1]) {
		const [whole, fraction] = text.split('.');
		text = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction ? `.${fraction}` : '');
	}
	return text === '-0' ? '0' : text;
}

/** Supported format pictures: `{{date picture}}`, `0`, `0.00`, `0.##`, `#,##0` (with ` u`), `@`. */
export const VISIO_FIELD_FORMATS = {
	shortDate: '{{M/d/yyyy}}',
	longDate: '{{dddd, MMMM d, yyyy}}',
	time: '{{h:mm tt}}',
	dateTime: '{{M/d/yyyy h:mm tt}}',
	text: '@',
	integer: '0',
	decimal: '0.00',
	decimalUnits: '0.00 u',
	integerUnits: '0 u',
} as const;

/** Display text for a value; undefined when the picture is outside the supported subset. */
export function formatVisioFieldValue(value: VisioFieldValue, format = ''): string | undefined {
	const picture = format.trim();
	if (value.kind === 'string') return picture === '' || picture === '@' ? value.text : undefined;
	if (value.kind === 'date') {
		const date = /^\{\{(.+)\}\}$/.exec(picture)?.[1] ?? (picture ? undefined : 'M/d/yyyy');
		return date === undefined ? undefined : formatDate(value.date, date);
	}
	const units = / u$/.test(picture);
	const body = picture.replace(/ u$/, '');
	let number = value.value,
		suffix = '';
	if (value.unit === 'angle') {
		number = (number * 180) / Math.PI;
		suffix = ' deg.';
	} else if (value.unit === 'length') suffix = ' in.';
	else if (value.unit !== 'scalar') return undefined;
	const text =
		body === '' || body === '@'
			? String(Number(number.toFixed(4)))
			: formatNumber(Number(number.toFixed(10)), body);
	if (text === undefined) return undefined;
	return units || body === '' ? `${text}${suffix}` : text;
}
