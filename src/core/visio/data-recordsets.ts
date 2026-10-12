import { elements } from '../xml/index';
import type { VisioPackage } from './package';
import { VisioPackageError } from './package-common';
import { indexedPart, related, visioXml } from './parts';
import { attribute, children } from './sheet';

/** Column types the importer infers and Shape Data rows receive. */
export type VisioDataColumnType = 'string' | 'number' | 'boolean' | 'date';
export interface VisioDataColumn {
	/** Source column name (DataColumn ColumnNameID); also names the linked Prop row. */
	name: string;
	label: string;
	type: VisioDataColumnType;
}
export interface VisioDataRow {
	/** Visio identifies rows by order here (RowOrder): the 1-based position. */
	id: string;
	/** Cached text per column; dates are ISO text, Booleans TRUE/FALSE. Empty means no value. */
	values: string[];
}
/** A shape linked to a recordset row (DataRecordSet RowMap). */
export interface VisioDataLink {
	rowId: string;
	pageId: string;
	shapeId: string;
}
/** An external data recordset saved in the drawing (DataRecordSets part). Inert cached data. */
export interface VisioDataRecordset {
	id: string;
	name: string;
	columns: VisioDataColumn[];
	rows: VisioDataRow[];
	links: VisioDataLink[];
	/** TimeRefreshed as saved, ISO text. */
	refreshed?: string;
}

export const VISIO_DATA_LIMITS = {
	maxRecordsets: 64,
	maxColumns: 256,
	maxRows: 10_000,
	maxValueCharacters: 4096,
	maxTotalCharacters: 4_000_000,
} as const;
export const DATA_RECORDSETS_TYPE = 'application/vnd.ms-visio.recordsets+xml';
export const DATA_RECORDSET_TYPE = 'application/vnd.ms-visio.recordset+xml';
export const ADO_NS = {
	s: 'uuid:BDC6E3F0-6DA3-11d1-A2A3-00AA00C14882',
	dt: 'uuid:C2F41010-65B3-11d1-A29F-00AA00C14882',
	rs: 'urn:schemas-microsoft-com:rowset',
	z: '#RowsetSchema',
} as const;
/** DataColumn DataType: the Shape Data Type code of the linked row. */
export const DATA_TYPE_CODES: Record<VisioDataColumnType, number> = {
	string: 0,
	number: 2,
	boolean: 3,
	date: 5,
};
const ADO_TYPES: Record<VisioDataColumnType, string> = {
	string: 'string',
	number: 'float',
	boolean: 'boolean',
	date: 'dateTime',
};

const escape = (value: string) =>
	value.replace(
		/[&<>"\r\n\t]/g,
		(char) =>
			({
				'&': '&amp;',
				'<': '&lt;',
				'>': '&gt;',
				'"': '&quot;',
				'\r': '&#13;',
				'\n': '&#10;',
				'\t': '&#9;',
			})[char]!,
	);

/** ADO persisted rowset XML (the Data Recordset part), as Visio saves external data. */
export function adoRecordsetXml(
	columns: readonly VisioDataColumn[],
	rows: readonly VisioDataRow[],
) {
	const schema = columns
		.map(
			(column, index) =>
				`<s:AttributeType name="c${index}" rs:name="${escape(column.name)}" rs:number="${index + 1}" rs:nullable="true" rs:write="true"><s:datatype dt:type="${ADO_TYPES[column.type]}"${column.type === 'string' ? ' dt:maxLength="4096"' : ''}/></s:AttributeType>`,
		)
		.join('');
	const data = rows
		.map(
			(row) =>
				`<z:row${row.values
					.map((value, index) => (value === '' ? '' : ` c${index}="${escape(value)}"`))
					.join('')}/>`,
		)
		.join('');
	return (
		`<?xml version="1.0" encoding="utf-8"?>\n<xml xmlns:s="${ADO_NS.s}" xmlns:dt="${ADO_NS.dt}" xmlns:rs="${ADO_NS.rs}" xmlns:z="${ADO_NS.z}">` +
		`<s:Schema id="RowsetSchema"><s:ElementType name="row" content="eltOnly" rs:updatable="true">${schema}<s:extends type="rs:rowbase"/></s:ElementType></s:Schema>` +
		`<rs:data>${data}</rs:data></xml>`
	);
}

const invalid = (message: string): never => {
	throw new VisioPackageError('INVALID_DATA_RECORDSET', message);
};
const typeFromCode = (code: string | undefined): VisioDataColumnType =>
	code === '2' || code === '7'
		? 'number'
		: code === '3'
			? 'boolean'
			: code === '5'
				? 'date'
				: 'string';
const typeFromAdo = (type: string | undefined): VisioDataColumnType | undefined =>
	!type
		? undefined
		: /^(string|char|bin\.|uuid)/i.test(type)
			? 'string'
			: /^(boolean)$/i.test(type)
				? 'boolean'
				: /^(date|time)/i.test(type)
					? 'date'
					: /^(float|number|int|i\d|ui\d|r\d|fixed)/i.test(type)
						? 'number'
						: 'string';

/** Read one ADO rowset: column names in order and every row's text by column name. */
export function readAdoRecordset(
	root: Element,
	budget: { characters: number },
	check: () => void,
): { columns: { name: string; type?: VisioDataColumnType }[]; rows: Map<string, string>[] } {
	if (root.localName !== 'xml') invalid('The recordset part is not ADO rowset XML.');
	const all = (node: Element, local: string, ns: string): Element[] =>
		Array.from(node.getElementsByTagNameNS(ns, local));
	const columns: { name: string; type?: VisioDataColumnType; key: string }[] = [];
	for (const type of all(root, 'AttributeType', ADO_NS.s)) {
		check();
		const key = type.getAttribute('name') ?? '';
		const name = type.getAttributeNS(ADO_NS.rs, 'name') || key;
		if (!key || name.length > 255) invalid('Invalid recordset column.');
		const adoType = typeFromAdo(
			all(type, 'datatype', ADO_NS.s)[0]?.getAttributeNS(ADO_NS.dt, 'type') ?? undefined,
		);
		columns.push({ name, key, ...(adoType ? { type: adoType } : {}) });
		if (columns.length > VISIO_DATA_LIMITS.maxColumns) invalid('Too many recordset columns.');
	}
	const rows: Map<string, string>[] = [];
	for (const data of all(root, 'data', ADO_NS.rs))
		for (const row of elements(data)) {
			check();
			if (row.localName !== 'row') continue;
			if (rows.length >= VISIO_DATA_LIMITS.maxRows) invalid('Too many recordset rows.');
			const values = new Map<string, string>();
			for (const column of columns) {
				const value = row.getAttribute(column.key);
				if (value === null) continue;
				if (value.length > VISIO_DATA_LIMITS.maxValueCharacters)
					invalid('A recordset value is too long.');
				budget.characters += value.length;
				if (budget.characters > VISIO_DATA_LIMITS.maxTotalCharacters)
					invalid('The recordsets exceed the character limit.');
				values.set(column.name, value);
			}
			rows.push(values);
		}
	return { columns: columns.map(({ key: _key, ...column }) => column), rows };
}

/** Normalise an ADO cell to the model text of its column type. */
function modelValue(value: string | undefined, type: VisioDataColumnType): string {
	if (value === undefined) return '';
	if (type === 'boolean')
		return /^(true|1|-1)$/i.test(value) ? 'TRUE' : /^(false|0)$/i.test(value) ? 'FALSE' : value;
	if (type === 'date') return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 19) : value;
	return value;
}

/**
 * Read the drawing's DataRecordSets part and its ADO rowsets. Data connections are never
 * opened; only cached rows saved in the package are returned.
 */
export async function readDataRecordsets(
	pkg: VisioPackage,
	documentPart: string,
	check: () => void,
): Promise<VisioDataRecordset[]> {
	const part = await related(pkg, documentPart, 'recordsets', false);
	if (!part) return [];
	const root = await visioXml(pkg, part, 'DataRecordSets');
	const result: VisioDataRecordset[] = [];
	const budget = { characters: 0 };
	const ids = new Set<string>();
	for (const set of children(root, 'DataRecordSet')) {
		check();
		if (result.length >= VISIO_DATA_LIMITS.maxRecordsets) invalid('Too many data recordsets.');
		const id = attribute(set, 'ID') ?? '';
		if (!/^\d{1,9}$/.test(id) || ids.has(id)) invalid('Data recordset IDs must be unique.');
		ids.add(id);
		const ado = readAdoRecordset(
			await pkg.readXml(await indexedPart(pkg, part, set, 'recordset')),
			budget,
			check,
		);
		const declared = children(children(set, 'DataColumns')[0], 'DataColumn');
		const columns: VisioDataColumn[] = (declared.length ? declared : []).map((node) => {
			const name = attribute(node, 'ColumnNameID') ?? attribute(node, 'Name') ?? '';
			const label = attribute(node, 'Label') ?? attribute(node, 'Name') ?? name;
			if (!name || name.length > 255 || label.length > 255) invalid('Invalid data column.');
			return { name, label, type: typeFromCode(attribute(node, 'DataType')) };
		});
		if (!columns.length)
			for (const column of ado.columns)
				columns.push({ name: column.name, label: column.name, type: column.type ?? 'string' });
		if (columns.length > VISIO_DATA_LIMITS.maxColumns) invalid('Too many recordset columns.');
		const links: VisioDataLink[] = children(set, 'RowMap').flatMap((node) => {
			const rowId = attribute(node, 'RowID'),
				pageId = attribute(node, 'PageID'),
				shapeId = attribute(node, 'ShapeID');
			return rowId && pageId && shapeId && [rowId, pageId, shapeId].every((v) => v.length <= 32)
				? [{ rowId, pageId, shapeId }]
				: [];
		});
		const name = attribute(set, 'Name') ?? `Recordset ${id}`;
		const refreshed = attribute(set, 'TimeRefreshed');
		result.push({
			id,
			name: name.slice(0, 255),
			columns,
			rows: ado.rows.map((row, index) => ({
				id: String(index + 1),
				values: columns.map((column) => modelValue(row.get(column.name), column.type)),
			})),
			links: links.slice(0, VISIO_DATA_LIMITS.maxRows * 4),
			...(refreshed && refreshed.length <= 64 ? { refreshed } : {}),
		});
	}
	return result;
}
