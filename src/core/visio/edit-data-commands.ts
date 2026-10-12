import { fail } from './package-common';
import {
	VISIO_DATA_LIMITS,
	type VisioDataColumn,
	type VisioDataColumnType,
} from './data-recordsets';
import { canonicalShapeDataValue, shapeDataText } from './edit-shape-data-commands';

/** Import a table as a new recordset (Data > Quick Import / Custom Import). */
export interface VisioDataImportEdit {
	type: 'import-data-recordset';
	/** The page the user is on; the recordset is document level. */
	pageId: string;
	name: string;
	columns: VisioDataColumn[];
	/** Text per column: numbers, TRUE/FALSE, ISO dates (yyyy-mm-dd) or strings; '' is empty. */
	rows: string[][];
}
/** Replace a recordset's rows (Refresh); linked shapes get the new values by row order. */
export interface VisioDataRefreshEdit {
	type: 'refresh-data-recordset';
	pageId: string;
	recordsetId: string;
	columns: VisioDataColumn[];
	rows: string[][];
}
/** Remove a recordset; linked shapes keep their Shape Data, no longer linked. */
export interface VisioDataDeleteEdit {
	type: 'delete-data-recordset';
	pageId: string;
	recordsetId: string;
}
/** Link shapes on one page to recordset rows: each column becomes a linked Shape Data row. */
export interface VisioDataLinkEdit {
	type: 'link-data-rows';
	pageId: string;
	recordsetId: string;
	links: { shapeId: string; rowId: string }[];
}
/** Unlink shapes on one page; their Shape Data stays as plain values. */
export interface VisioDataUnlinkEdit {
	type: 'unlink-data-rows';
	pageId: string;
	recordsetId: string;
	shapeIds: string[];
}
export type VisioDataEdit =
	| VisioDataImportEdit
	| VisioDataRefreshEdit
	| VisioDataDeleteEdit
	| VisioDataLinkEdit
	| VisioDataUnlinkEdit;

const TYPES = [
	'import-data-recordset',
	'refresh-data-recordset',
	'delete-data-recordset',
	'link-data-rows',
	'unlink-data-rows',
];
export const isVisioDataEdit = (edit: { type: string }): edit is VisioDataEdit =>
	TYPES.includes(edit.type);

const id = (value: unknown, label: string): string => {
	if (typeof value !== 'string' || !/^(0|[1-9]\d{0,9})$/.test(value) || Number(value) > 0xffffffff)
		fail('INVALID_EDIT', `Invalid ${label}.`);
	return value as string;
};
const name = (value: unknown, label: string): string => {
	const text = shapeDataText(value, label);
	if (!text.trim() || text.length > 255)
		fail('INVALID_EDIT', `${label} must be 1 to 255 characters.`);
	return text;
};

function table(columns: unknown, rows: unknown): { columns: VisioDataColumn[]; rows: string[][] } {
	if (!Array.isArray(columns) || !columns.length || columns.length > VISIO_DATA_LIMITS.maxColumns)
		fail('INVALID_EDIT', `A recordset needs 1 to ${VISIO_DATA_LIMITS.maxColumns} columns.`);
	if (!Array.isArray(rows) || rows.length > VISIO_DATA_LIMITS.maxRows)
		fail('LIMIT_DATA', `A recordset holds at most ${VISIO_DATA_LIMITS.maxRows} rows.`);
	const seen = new Set<string>();
	const copied = (columns as VisioDataColumn[]).map((column) => {
		if (!column || typeof column !== 'object') fail('INVALID_EDIT', 'Invalid data column.');
		const type: VisioDataColumnType = column.type;
		if (!['string', 'number', 'boolean', 'date'].includes(type))
			fail('INVALID_EDIT', 'Unsupported data column type.');
		const result = {
			name: name(column.name, 'A column name'),
			label: name(column.label, 'A column label'),
			type,
		};
		const key = result.name.toLowerCase();
		if (seen.has(key)) fail('INVALID_EDIT', 'Column names must be unique.');
		seen.add(key);
		return result;
	});
	let characters = 0;
	const values = (rows as unknown[]).map((row) => {
		if (!Array.isArray(row) || row.length !== copied.length)
			fail('INVALID_EDIT', 'Every row needs one value per column.');
		return copied.map((column, index) => {
			const text = shapeDataText((row as unknown[])[index], 'A data value');
			characters += text.length;
			if (characters > VISIO_DATA_LIMITS.maxTotalCharacters)
				fail('LIMIT_DATA', 'The recordset exceeds the character limit.');
			if (text === '' || column.type === 'string') return text;
			return canonicalShapeDataValue(column.type, text);
		});
	});
	return { columns: copied, rows: values };
}

/** Copy and validate a data command; host properties never reach the transaction. */
export function snapshotDataEdit(edit: VisioDataEdit): VisioDataEdit {
	if (typeof edit.pageId !== 'string' || !edit.pageId || edit.pageId.length > 256)
		fail('INVALID_EDIT', 'Invalid edit target.');
	const pageId = edit.pageId;
	switch (edit.type) {
		case 'import-data-recordset':
			return {
				type: edit.type,
				pageId,
				name: name(edit.name, 'The recordset name'),
				...table(edit.columns, edit.rows),
			};
		case 'refresh-data-recordset':
			return {
				type: edit.type,
				pageId,
				recordsetId: id(edit.recordsetId, 'recordset'),
				...table(edit.columns, edit.rows),
			};
		case 'delete-data-recordset':
			return { type: edit.type, pageId, recordsetId: id(edit.recordsetId, 'recordset') };
		case 'link-data-rows': {
			if (!Array.isArray(edit.links) || !edit.links.length || edit.links.length > 10_000)
				fail('INVALID_EDIT', 'Link 1 to 10000 shapes at a time.');
			const shapes = new Set<string>();
			const links = edit.links.map((link) => {
				const shapeId = id(link?.shapeId, 'shape');
				if (shapeId === '0' || shapes.has(shapeId))
					fail('INVALID_EDIT', 'Each shape links to one row.');
				shapes.add(shapeId);
				const rowId = id(link.rowId, 'row');
				if (rowId === '0') fail('INVALID_EDIT', 'Invalid row.');
				return { shapeId, rowId };
			});
			return { type: edit.type, pageId, recordsetId: id(edit.recordsetId, 'recordset'), links };
		}
		case 'unlink-data-rows': {
			if (!Array.isArray(edit.shapeIds) || !edit.shapeIds.length || edit.shapeIds.length > 10_000)
				fail('INVALID_EDIT', 'Unlink 1 to 10000 shapes at a time.');
			return {
				type: edit.type,
				pageId,
				recordsetId: id(edit.recordsetId, 'recordset'),
				shapeIds: [...new Set(edit.shapeIds.map((shape) => id(shape, 'shape')))],
			};
		}
		default:
			return fail('INVALID_EDIT', 'Unsupported data command.');
	}
}
