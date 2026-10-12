import { isSafeHyperlinkHref } from '../opc/safe-href';
import { metadata } from './metadata';
import { VisioPackageError } from './package';
import type { Cells, Report, Row, Sheet } from './sheet';

export interface VisioShapeData {
	id: string;
	name: string;
	label?: string;
	/** ShapeSheet Type code 0..7; -1 denotes a missing/invalid cached Type. */
	type: number;
	rawType?: string;
	valueKind:
		| 'string'
		| 'fixed-list'
		| 'number'
		| 'boolean'
		| 'variable-list'
		| 'date'
		| 'duration'
		| 'currency'
		| 'unparsed';
	/** Exact cached V text, not a formula or a formatted display value. */
	rawValue?: string;
	/** Dates are serial days from 1899-12-30; durations are days. Format is not applied. */
	value?: string | number | boolean;
	unit?: string;
	error?: string;
	format?: string;
	prompt?: string;
	invisible?: boolean;
	sortKey?: string;
	/** Cached DataLinked cell: the row came from a linked external data recordset. */
	dataLinked?: boolean;
}
export interface VisioHyperlink {
	id: string;
	name: string;
	description?: string;
	/** Untrusted original cached text. Never use this field directly as a navigation target. */
	address?: string;
	/** Unresolved page/shape/anchor text. No guessed page or shape identifiers. */
	subAddress?: string;
	default?: boolean;
	newWindow?: boolean;
	invisible?: boolean;
	sortKey?: string;
	/** Inert data only. Even validated external addresses require explicit host/user action. */
	target:
		| { kind: 'external'; href: string }
		| { kind: 'internal'; subAddress: string }
		| { kind: 'unresolved'; reason: string };
}
export interface VisioMetadataOptions {
	maxRows?: number;
	maxCharacters?: number;
}
export interface VisioMetadataBudget {
	consumeRow(): void;
	retain(value: string): string;
}
/** Share one budget across every page and inherited shape in a document. */
export function createMetadataBudget(options: VisioMetadataOptions = {}): VisioMetadataBudget {
	const maxRows = options.maxRows ?? 100_000,
		maxCharacters = options.maxCharacters ?? 5_000_000;
	if (![maxRows, maxCharacters].every((v) => Number.isSafeInteger(v) && v > 0))
		throw new VisioPackageError('INVALID_LIMIT', 'Metadata limits must be positive safe integers.');
	let rows = 0,
		characters = 0;
	return {
		consumeRow() {
			if (++rows > maxRows)
				throw new VisioPackageError('METADATA_LIMIT', 'Shape metadata row budget exceeded.');
		},
		retain(value) {
			metadata(value, 8192, 'Shape metadata string');
			characters += value.length;
			if (characters > maxCharacters)
				throw new VisioPackageError('METADATA_LIMIT', 'Shape metadata character budget exceeded.');
			return value;
		},
	};
}
const kinds = [
	'string',
	'fixed-list',
	'number',
	'boolean',
	'variable-list',
	'date',
	'duration',
	'currency',
] as const;
const numeric = (text: string | undefined): number | undefined => {
	if (
		text === undefined ||
		text.length > 128 ||
		!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text.trim())
	)
		return undefined;
	const value = Number(text);
	return Number.isFinite(value) ? value : undefined;
};
function cached(
	cells: Cells,
	key: string,
	budget: VisioMetadataBudget,
	report: Report,
): string | undefined {
	const cell = cells.get(key);
	if (!cell) return undefined;
	if (cell.error !== undefined)
		report(
			'metadata-cell-error',
			`Metadata cell ${key} has a saved error; its cached value may be stale.`,
		);
	if (cell.value === undefined)
		report(
			'missing-metadata-cache',
			`Metadata cell ${key} has no cached value; its formula was not evaluated.`,
		);
	return cell.value === undefined ? undefined : budget.retain(cell.value);
}
function boolean(
	cells: Cells,
	key: string,
	budget: VisioMetadataBudget,
	report: Report,
): boolean | undefined {
	const text = cached(cells, key, budget, report);
	if (text === undefined) return undefined;
	const value = booleanValue(text);
	if (value === undefined || cells.get(key)?.error !== undefined) {
		report('invalid-metadata-boolean', `Metadata cell ${key} has no usable cached Boolean value.`);
		return undefined;
	}
	return value;
}
function booleanValue(text: string): boolean | undefined {
	if (/^true$/i.test(text.trim())) return true;
	if (/^false$/i.test(text.trim())) return false;
	const value = numeric(text);
	return value === undefined ? undefined : value !== 0;
}
/** VSDX saves Shape Data dates as ISO text (U="DATE"); the model keeps serial days. */
function isoSerialDays(text: string): number | undefined {
	const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?)?$/.exec(
		text.trim(),
	);
	if (!match) return undefined;
	const [year, month, day, hour, minute, second] = match.slice(1).map((part) => Number(part ?? 0));
	const time = Date.UTC(year!, month! - 1, day!, hour, minute, second);
	return Number.isFinite(time) ? (time - Date.UTC(1899, 11, 30)) / 86_400_000 : undefined;
}
function property(row: Row, budget: VisioMetadataBudget, report: Report): VisioShapeData {
	const get = (key: string) => cached(row.cells, key, budget, report);
	const rawType = get('Type'),
		rawValue = get('Value');
	const typeValue = row.cells.has('Type') ? numeric(rawType) : 0;
	const type =
		typeValue !== undefined &&
		Number.isInteger(typeValue) &&
		typeValue >= 0 &&
		typeValue <= 7 &&
		row.cells.get('Type')?.error === undefined
			? typeValue
			: -1;
	let valueKind: VisioShapeData['valueKind'] = kinds[type] ?? 'unparsed';
	let value: VisioShapeData['value'];
	if (rawValue !== undefined && row.cells.get('Value')?.error === undefined) {
		if (type === 0 || type === 1 || type === 4) value = budget.retain(rawValue);
		else if (type === 3) value = booleanValue(rawValue);
		else if (type === 5) value = numeric(rawValue) ?? isoSerialDays(rawValue);
		else if (valueKind !== 'unparsed') value = numeric(rawValue);
	}
	if (value === undefined) {
		valueKind = 'unparsed';
		report(
			'unsupported-shape-data-value',
			'Shape data has no supported current cached typed value; original cached text is retained.',
		);
	}
	const label = get('Label'),
		format = get('Format'),
		prompt = get('Prompt'),
		sortKey = get('SortKey');
	const invisible = boolean(row.cells, 'Invisible', budget, report);
	const dataLinked = row.cells.has('DataLinked')
		? boolean(row.cells, 'DataLinked', budget, report)
		: undefined;
	const unit = row.cells.get('Value')?.unit,
		error = row.cells.get('Value')?.error;
	return {
		id: budget.retain(row.index),
		name: budget.retain(row.name ?? row.index),
		type,
		valueKind,
		...(rawType === undefined ? {} : { rawType }),
		...(rawValue === undefined ? {} : { rawValue }),
		...(value === undefined ? {} : { value }),
		...(label === undefined ? {} : { label }),
		...(format === undefined ? {} : { format }),
		...(prompt === undefined ? {} : { prompt }),
		...(sortKey === undefined ? {} : { sortKey }),
		...(invisible === undefined ? {} : { invisible }),
		...(dataLinked ? { dataLinked } : {}),
		...(unit === undefined ? {} : { unit: budget.retain(unit) }),
		...(error === undefined ? {} : { error: budget.retain(error) }),
	};
}
const controls = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/;
/** The shared OPC scheme allowlist is necessary but not sufficient for a usable URL. */
function safeAddress(address: string): string | undefined {
	if (!isSafeHyperlinkHref(address) || /\s|\\/.test(address) || controls.test(address))
		return undefined;
	try {
		const decoded = decodeURIComponent(address);
		if (controls.test(decoded) || decoded.includes('\\')) return undefined;
		const url = new URL(address);
		if (url.username || url.password) return undefined;
		if (url.protocol === 'http:' || url.protocol === 'https:') {
			const authority = /^https?:\/\/([^/?#]+)/i.exec(address)?.[1];
			if (!authority || authority.includes('@') || !url.hostname) return undefined;
		} else if (url.protocol === 'mailto:') {
			if (
				url.host ||
				!url.pathname ||
				!url.pathname
					.split(',')
					.every((recipient) => /^[^\s<>:;/@]+@[^\s<>:;/@]+$/.test(decodeURIComponent(recipient)))
			)
				return undefined;
		} else return undefined;
		return url.href;
	} catch {
		return undefined;
	}
}
function hyperlink(row: Row, budget: VisioMetadataBudget, report: Report): VisioHyperlink {
	const get = (key: string) => cached(row.cells, key, budget, report);
	const description = get('Description'),
		address = get('Address'),
		subAddress = get('SubAddress');
	const isDefault = boolean(row.cells, 'Default', budget, report),
		newWindow = boolean(row.cells, 'NewWindow', budget, report);
	const invisible = boolean(row.cells, 'Invisible', budget, report),
		sortKey = get('SortKey');
	let target: VisioHyperlink['target'] = { kind: 'unresolved', reason: 'missing-target' };
	if (
		['Address', 'SubAddress'].some((key) => {
			const cell = row.cells.get(key);
			return cell && (cell.error !== undefined || cell.value === undefined);
		})
	) {
		target = { kind: 'unresolved', reason: 'missing-or-stale-cache' };
	} else if (subAddress !== undefined && controls.test(subAddress)) {
		target = { kind: 'unresolved', reason: 'invalid-subaddress' };
	} else if (address && subAddress) {
		target = { kind: 'unresolved', reason: 'unsupported-external-subaddress' };
	} else if (address) {
		const href = safeAddress(address);
		target =
			href === undefined
				? { kind: 'unresolved', reason: 'unsafe-or-unsupported-address' }
				: { kind: 'external', href: budget.retain(href) };
	} else if (subAddress) target = { kind: 'internal', subAddress: budget.retain(subAddress) };
	if (
		['ExtraInfo', 'Frame'].some((key) => {
			const cell = row.cells.get(key);
			return cell && (cell.value !== '' || cell.error !== undefined);
		})
	) {
		report(
			'unsupported-hyperlink-options',
			'Hyperlink Frame/ExtraInfo semantics are unsupported; the target remains unresolved.',
		);
		target = { kind: 'unresolved', reason: 'unsupported-options' };
	}
	if (target.kind === 'unresolved')
		report('unresolved-hyperlink', `Hyperlink was retained as inert metadata (${target.reason}).`);
	return {
		id: budget.retain(row.index),
		name: budget.retain(row.name ?? row.index),
		target,
		...(description === undefined ? {} : { description }),
		...(address === undefined ? {} : { address }),
		...(subAddress === undefined ? {} : { subAddress }),
		...(isDefault === undefined ? {} : { default: isDefault }),
		...(newWindow === undefined ? {} : { newWindow }),
		...(invisible === undefined ? {} : { invisible }),
		...(sortKey === undefined ? {} : { sortKey }),
	};
}
/**
 * Read resolved master/local sheets. Formatting style sections do not supply shape data.
 * Microsoft reference: /office/client-developer/visio/type-cell-shape-data-section,
 * cell-element-shape-data-sectionvisio-xml and cell-element-hyperlink-rowvisio-xml.
 * Only cached V values are interpreted. Formulas, links and external data are never run.
 */
export function shapeMetadata(
	sheet: Sheet,
	report: Report,
	budget = createMetadataBudget(),
): { shapeData: VisioShapeData[]; hyperlinks: VisioHyperlink[]; screenTip?: string } {
	const shapeData: VisioShapeData[] = [],
		hyperlinks: VisioHyperlink[] = [];
	let count = 0;
	for (const section of sheet.sections.values()) {
		if (section.deleted || !['Property', 'Prop', 'Hyperlink'].includes(section.name)) continue;
		for (const row of section.rows.values()) {
			if (row.deleted) continue;
			if (++count > 1024)
				throw new VisioPackageError('METADATA_LIMIT', 'Per-shape metadata row limit exceeded.');
			budget.consumeRow();
			if (section.name === 'Hyperlink') hyperlinks.push(hyperlink(row, budget, report));
			else shapeData.push(property(row, budget, report));
		}
	}
	const comment = sheet.cells.get('Comment');
	const screenTip =
		comment?.value && comment.error === undefined ? budget.retain(comment.value) : undefined;
	return { shapeData, hyperlinks, ...(screenTip === undefined ? {} : { screenTip }) };
}
