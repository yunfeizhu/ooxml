import { fail } from './package-common';
import { VISIO_METADATA_TEXT_LIMIT } from './edit-metadata-commands';

/** Shape Data types the editor writes (Visio Type cell 0, 1, 2, 3, 4 and 5). */
export const VISIO_SHAPE_DATA_TYPES = [
	'string',
	'fixed-list',
	'number',
	'boolean',
	'variable-list',
	'date',
] as const;
export type VisioShapeDataType = (typeof VISIO_SHAPE_DATA_TYPES)[number];

/** One Property (Shape Data) row as the Define Shape Data dialog edits it. */
export interface VisioShapeDataFields {
	label: string;
	prompt: string;
	type: VisioShapeDataType;
	/** Number or date picture, or the `;`-separated choices of a list. */
	format: string;
	/** Text as typed: a number, TRUE/FALSE, an ISO date (yyyy-mm-dd) or any string. */
	value: string;
	/** Hidden rows stay out of the Shape Data window (Invisible cell). */
	invisible?: boolean;
}
/** Add (`row` is a new name), replace (`row` exists) or remove (`data: null`) a Prop row. */
export interface VisioShapeDataEdit {
	type: 'set-shape-data';
	pageId: string;
	shapeId: string;
	/** ShapeSheet row name without the `Prop.` prefix, for example `Cost_Center`. */
	row: string;
	data: VisioShapeDataFields | null;
}

const invalidText =
	/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u;
export function shapeDataText(value: unknown, label: string): string {
	if (typeof value !== 'string' || value.length > VISIO_METADATA_TEXT_LIMIT)
		fail('INVALID_EDIT', `${label} must be a string within the length limit.`);
	if (invalidText.test(value) || /[\r\n\t]/.test(value))
		fail('INVALID_EDIT_TEXT', `${label} contains invalid characters.`);
	return value;
}
/** Visio row names: a letter or underscore, then letters, digits and underscores. */
export function shapeDataRowName(value: unknown): string {
	if (typeof value !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(value))
		fail('INVALID_EDIT', 'Shape Data row names use letters, digits and underscores.');
	return value;
}
/** A row name derived from a label, as Visio's Define Shape Data dialog does. */
export function visioShapeDataRowName(label: string, taken: Iterable<string> = []): string {
	const used = new Set([...taken].map((name) => name.toLowerCase()));
	let base = label
		.normalize('NFKD')
		.replace(/[^\w]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.slice(0, 48);
	if (!base) base = 'Property';
	if (/^\d/.test(base)) base = `_${base}`;
	let name = base;
	for (let index = 2; used.has(name.toLowerCase()); index++) name = `${base}_${index}`;
	return name;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/;
/** Validate and canonicalise a typed value for its Shape Data type. */
export function canonicalShapeDataValue(type: VisioShapeDataType, value: string): string {
	const text = value.trim();
	if (type === 'number') {
		if (text === '') return '0';
		if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text) || !Number.isFinite(+text))
			fail('INVALID_EDIT', 'A Number value must be a finite decimal number.');
		return String(Number(text));
	}
	if (type === 'boolean') {
		if (/^(true|1|yes)$/i.test(text)) return 'TRUE';
		if (/^(false|0|no|)$/i.test(text)) return 'FALSE';
		fail('INVALID_EDIT', 'A Boolean value must be TRUE or FALSE.');
	}
	if (type === 'date') {
		if (text === '') return '';
		const match = ISO_DATE.exec(text);
		const parts = match?.slice(1).map((part) => Number(part ?? 0)) ?? [];
		const date = new Date(
			Date.UTC(parts[0]!, parts[1]! - 1, parts[2]!, parts[3], parts[4], parts[5]),
		);
		if (
			!match ||
			date.getUTCFullYear() !== parts[0] ||
			date.getUTCMonth() !== parts[1]! - 1 ||
			date.getUTCDate() !== parts[2] ||
			parts[3]! > 23 ||
			parts[4]! > 59 ||
			parts[5]! > 59
		)
			fail('INVALID_EDIT', 'A Date value must be a valid yyyy-mm-dd date.');
		return date.toISOString().slice(0, 19);
	}
	return value;
}

/** Copy and validate a Shape Data command; host properties never reach the transaction. */
export function snapshotShapeDataEdit(edit: VisioShapeDataEdit): VisioShapeDataEdit {
	if (
		typeof edit.pageId !== 'string' ||
		!edit.pageId ||
		edit.pageId.length > 256 ||
		typeof edit.shapeId !== 'string' ||
		!/^[1-9]\d{0,9}$/.test(edit.shapeId) ||
		Number(edit.shapeId) > 0xffffffff
	)
		fail('INVALID_EDIT', 'Invalid edit shape target.');
	const base = {
		type: 'set-shape-data' as const,
		pageId: edit.pageId,
		shapeId: edit.shapeId,
		row: shapeDataRowName(edit.row),
	};
	if (edit.data === null) return { ...base, data: null };
	const data = edit.data;
	if (!data || typeof data !== 'object') fail('INVALID_EDIT', 'Invalid Shape Data fields.');
	if (!VISIO_SHAPE_DATA_TYPES.includes(data.type))
		fail('INVALID_EDIT', 'Unsupported Shape Data type.');
	if (data.invisible !== undefined && typeof data.invisible !== 'boolean')
		fail('INVALID_EDIT', 'Invisible must be a Boolean.');
	return {
		...base,
		data: {
			label: shapeDataText(data.label, 'The label'),
			prompt: shapeDataText(data.prompt, 'The prompt'),
			type: data.type,
			format: shapeDataText(data.format, 'The format'),
			value: canonicalShapeDataValue(data.type, shapeDataText(data.value, 'The value')),
			...(data.invisible === undefined ? {} : { invisible: data.invisible }),
		},
	};
}
