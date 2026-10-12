import { NS, buildXml, elements, parseXml, type XmlElement } from '../../xml/index';
import { formatRange, parseRange, type CellRange } from '../address';
import type { Table, Worksheet } from '../model';
import { addFuturePrefixes } from '../read/formula-text';
import { num } from './xml-out';

const xKids = (parent: XmlElement, local: string): XmlElement[] =>
	elements(parent).filter((e) => e.localName === local);
const xKid = (parent: XmlElement, local: string): XmlElement | undefined => xKids(parent, local)[0];

function setOrRemove(element: XmlElement, name: string, value: string | undefined): void {
	if (value === undefined) element.removeAttribute(name);
	else element.setAttribute(name, value);
}

const flag = (value: boolean | undefined, fallback: boolean): string =>
	(value ?? fallback) ? '1' : '0';

/** Inserts `child` before the first sibling whose local name is in `before` (else appends). */
function insertBefore(parent: XmlElement, child: XmlElement, before: readonly string[]): void {
	const next = elements(parent).find((e) => before.includes(e.localName));
	parent.insertBefore(child, next ?? null);
}

function setChildText(
	doc: Document,
	parent: XmlElement,
	local: string,
	text: string | undefined,
	before: readonly string[],
): void {
	const existing = xKid(parent, local);
	if (text === undefined) {
		if (existing) parent.removeChild(existing);
		return;
	}
	const node = existing ?? doc.createElementNS(NS.x, local);
	node.textContent = text;
	if (!existing) insertBefore(parent, node, before);
}

/** The autoFilter range of a table: the whole table less its totals row. */
export function tableFilterRange(table: Table): CellRange {
	return {
		start: table.range.start,
		end: { ...table.range.end, row: table.range.end.row - (table.totalsRow ? 1 : 0) },
	};
}

/** Matches current columns to their original XML nodes without relying on mutable names. */
function sourceColumnsForPatch(
	root: XmlElement,
	table: Table,
	names: readonly string[],
): (XmlElement | undefined)[] {
	const list = xKid(root, 'tableColumns');
	const source = list ? xKids(list, 'tableColumn') : [];
	const byId = new Map(source.map((c) => [Number(c.getAttribute('id')), c]));
	const byName = new Map(source.map((c) => [(c.getAttribute('name') ?? '').toLowerCase(), c]));
	const tracked =
		table.partName !== undefined || table.columns.some((c) => c.sourceId !== undefined);
	const used = new Set<XmlElement>();
	return names.map((name, index) => {
		const id = table.columns[index]?.sourceId;
		const match =
			id !== undefined
				? byId.get(id)
				: tracked
					? undefined
					: source.length === names.length
						? source[index]
						: byName.get(name.toLowerCase());
		if (!match || used.has(match)) return undefined;
		used.add(match);
		return match;
	});
}

/** Moves criteria with their source columns while preserving unmodelled filter markup. */
function patchAutoFilter(
	doc: Document,
	root: XmlElement,
	table: Table,
	before: CellRange,
	names: readonly string[],
): void {
	const existing = xKid(root, 'autoFilter');
	if (!table.headerRow) {
		if (existing) root.removeChild(existing);
		return;
	}
	const filter = existing ?? doc.createElementNS(NS.x, 'autoFilter');
	const range = tableFilterRange(table);
	filter.setAttribute('ref', formatRange(range));
	const list = xKid(root, 'tableColumns');
	const original = list ? xKids(list, 'tableColumn') : [];
	const current = new Map(sourceColumnsForPatch(root, table, names).map((c, index) => [c, index]));
	for (const column of xKids(filter, 'filterColumn')) {
		const old = original[Number(column.getAttribute('colId') ?? '0')];
		const index = old ? current.get(old) : undefined;
		if (index === undefined) filter.removeChild(column);
		else column.setAttribute('colId', num(index));
	}
	if (!existing) insertBefore(root, filter, ['sortState', 'tableColumns']);
	const sort = xKid(filter, 'sortState') ?? xKid(root, 'sortState');
	if (!sort) return;
	const moved =
		before.start.row !== table.range.start.row ||
		before.start.col !== table.range.start.col ||
		before.end.col !== table.range.end.col;
	if (moved) {
		sort.parentNode?.removeChild(sort);
		return;
	}
	// Only the row extent changed: stretch the sort range and its conditions to the data rows.
	const firstData = range.start.row + 1;
	const stretch = (ref: string | null): string | undefined => {
		const parsed = ref ? parseRange(ref) : undefined;
		if (!parsed) return undefined;
		return formatRange({
			start: { row: firstData, col: parsed.start.col },
			end: { row: Math.max(firstData, range.end.row), col: parsed.end.col },
		});
	};
	const sortRef = stretch(sort.getAttribute('ref'));
	if (sortRef) sort.setAttribute('ref', sortRef);
	for (const condition of xKids(sort, 'sortCondition')) {
		const ref = stretch(condition.getAttribute('ref'));
		if (ref) condition.setAttribute('ref', ref);
	}
}

const COLUMN_CHILD_ORDER = ['calculatedColumnFormula', 'totalsRowFormula', 'xmlColumnPr', 'extLst'];

/** Reuses surviving source column nodes to retain metadata through renames and axis edits. */
function patchColumns(
	doc: Document,
	root: XmlElement,
	sheet: Worksheet,
	table: Table,
	names: readonly string[],
): void {
	let list = xKid(root, 'tableColumns');
	if (!list) {
		list = doc.createElementNS(NS.x, 'tableColumns');
		insertBefore(root, list, ['tableStyleInfo', 'extLst']);
	}
	const sourceColumns = xKids(list, 'tableColumn');
	const ids = new Set<number>();
	const picked = sourceColumnsForPatch(root, table, names).map((match) => {
		if (!match) return undefined;
		const id = Number(match.getAttribute('id'));
		if (Number.isInteger(id) && id >= 0 && !ids.has(id)) ids.add(id);
		else match.removeAttribute('id');
		return match;
	});
	for (const column of sourceColumns) list.removeChild(column);
	let nextId = Math.max(0, ...ids) + 1;
	const totalsRow = table.range.end.row;
	names.forEach((name, index) => {
		const column = picked[index] ?? doc.createElementNS(NS.x, 'tableColumn');
		if (!column.getAttribute('id')) column.setAttribute('id', num(nextId++));
		column.setAttribute('name', name);
		const model = table.columns[index];
		const fn = table.totalsRow ? model?.totalsRowFunction : undefined;
		setOrRemove(column, 'totalsRowFunction', fn);
		setOrRemove(column, 'totalsRowLabel', table.totalsRow ? model?.totalsRowLabel : undefined);
		const calculated = model?.calculatedColumnFormula;
		setChildText(
			doc,
			column,
			'calculatedColumnFormula',
			calculated ? addFuturePrefixes(calculated) : undefined,
			COLUMN_CHILD_ORDER.slice(1),
		);
		if (fn !== 'custom') setChildText(doc, column, 'totalsRowFormula', undefined, []);
		else {
			const cellFormula = sheet.rows.get(totalsRow)?.get(table.range.start.col + index)?.formula;
			if (cellFormula)
				setChildText(
					doc,
					column,
					'totalsRowFormula',
					addFuturePrefixes(cellFormula),
					COLUMN_CHILD_ORDER.slice(2),
				);
		}
		list.appendChild(column);
	});
	list.setAttribute('count', num(names.length));
}

function patchStyleInfo(doc: Document, root: XmlElement, table: Table): void {
	let info = xKid(root, 'tableStyleInfo');
	if (!info) {
		info = doc.createElementNS(NS.x, 'tableStyleInfo');
		insertBefore(root, info, ['extLst']);
	}
	setOrRemove(info, 'name', table.styleName);
	info.setAttribute('showFirstColumn', flag(table.showFirstColumn, false));
	info.setAttribute('showLastColumn', flag(table.showLastColumn, false));
	info.setAttribute('showRowStripes', flag(table.showRowStripes, true));
	info.setAttribute('showColumnStripes', flag(table.showColumnStripes, false));
}

/**
 * Rewrites a table part read from the source package, changing only the modelled attributes
 * (id, names, range, header/totals rows, columns, style) and keeping everything else: the
 * autoFilter criteria and sort state, dxf ids, `totalsRowFormula`, `xr:uid`s and `extLst`.
 * Returns `undefined` when the source XML cannot be read (the caller then writes a fresh part).
 */
export function patchTableXml(
	sourceXml: string,
	sheet: Worksheet,
	table: Table,
	id: number,
	names: readonly string[],
): string | undefined {
	let doc: Document;
	try {
		doc = parseXml(sourceXml, { label: 'XLSX table' });
	} catch {
		return undefined;
	}
	const root = doc.documentElement;
	if (root.localName !== 'table') return undefined;
	const before = parseRange(root.getAttribute('ref') ?? '') ?? table.range;
	root.setAttribute('id', num(id));
	root.setAttribute('name', table.name);
	root.setAttribute('displayName', table.displayName || table.name);
	root.setAttribute('ref', formatRange(table.range));
	setOrRemove(root, 'headerRowCount', table.headerRow ? undefined : '0');
	if (table.totalsRow) {
		root.setAttribute('totalsRowCount', '1');
		root.removeAttribute('totalsRowShown');
	} else {
		root.removeAttribute('totalsRowCount');
		if (!root.hasAttribute('totalsRowShown')) root.setAttribute('totalsRowShown', '0');
	}
	patchAutoFilter(doc, root, table, before, names);
	patchColumns(doc, root, sheet, table, names);
	patchStyleInfo(doc, root, table);
	return buildXml(doc);
}
