import { parseXml } from '../../xml/index';
import { parseRange } from '../address';
import type { Table, TableColumn } from '../model';
import { stripFuturePrefixes } from './formula-text';
import { att, boolAttr, numAttr, xChildren, xFirst, xText } from './xml-util';

/** Reads a table part; `undefined` when it has no usable range. */
export function parseTable(xml: string, partName: string): Table | undefined {
	const root = parseXml(xml, { label: 'XLSX table' }).documentElement;
	const range = parseRange(att(root, 'ref') ?? '');
	if (!range) return undefined;
	const name = att(root, 'name') ?? att(root, 'displayName') ?? 'Table';
	const columns: TableColumn[] = xChildren(xFirst(root, 'tableColumns') ?? root, 'tableColumn').map(
		(node) => {
			const column: TableColumn = { name: att(node, 'name') ?? '' };
			const id = numAttr(node, 'id');
			if (id !== undefined && Number.isInteger(id) && id >= 0) column.sourceId = id;
			const fn = att(node, 'totalsRowFunction');
			if (fn && fn !== 'none') column.totalsRowFunction = fn;
			const label = att(node, 'totalsRowLabel');
			if (label !== undefined) column.totalsRowLabel = label;
			const calculated = xFirst(node, 'calculatedColumnFormula');
			if (calculated) column.calculatedColumnFormula = stripFuturePrefixes(xText(calculated));
			return column;
		},
	);
	const table: Table = {
		id: numAttr(root, 'id') ?? 1,
		name,
		displayName: att(root, 'displayName') ?? name,
		range,
		headerRow: (numAttr(root, 'headerRowCount') ?? 1) > 0,
		totalsRow: (numAttr(root, 'totalsRowCount') ?? 0) > 0,
		columns,
		partName,
	};
	const info = xFirst(root, 'tableStyleInfo');
	if (info) {
		const style = att(info, 'name');
		if (style) table.styleName = style;
		table.showRowStripes = boolAttr(info, 'showRowStripes', false);
		table.showColumnStripes = boolAttr(info, 'showColumnStripes', false);
		table.showFirstColumn = boolAttr(info, 'showFirstColumn', false);
		table.showLastColumn = boolAttr(info, 'showLastColumn', false);
	}
	return table;
}
