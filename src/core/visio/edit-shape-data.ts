import { attribute, children } from './sheet';
import { fail } from './package-common';
import { executableCellFormula } from './cell-formula';
import {
	VISIO_SHAPE_DATA_TYPES,
	type VisioShapeDataEdit,
	type VisioShapeDataFields,
} from './edit-shape-data-commands';

const UNITS: Record<VisioShapeDataFields['type'], string | undefined> = {
	string: 'STR',
	'fixed-list': 'STR',
	'variable-list': 'STR',
	number: undefined,
	boolean: 'BOOL',
	date: 'DATE',
};
/** Native row cell order for a new Property row. */
const ROW_CELLS = [
	'Value',
	'Prompt',
	'Label',
	'Format',
	'SortKey',
	'Type',
	'Invisible',
	'Verify',
	'DataLinked',
	'LangID',
	'Calendar',
] as const;

/**
 * One unique page shape that can own local Property rows: a local shape or a top-level master
 * instance (a local row of the same name overrides the master's row). Shapes inside a master
 * instance (MasterShape) or deleted shapes are refused.
 */
export function shapeDataOwner(root: Element, shapeId: string): Element {
	const matches = Array.from(root.getElementsByTagNameNS(root.namespaceURI, 'Shape')).filter(
		(shape) => attribute(shape, 'ID') === shapeId,
	);
	if (matches.length !== 1) fail('EDIT_TARGET_NOT_FOUND', 'A unique page shape is required.');
	const shape = matches[0]!;
	for (let node: Element | null = shape; node && node !== root; node = node.parentElement) {
		if (node.localName !== 'Shape') continue;
		if (node.hasAttribute('MasterShape') || node.hasAttribute('Del'))
			fail(
				'UNSUPPORTED_SHAPE_DATA_EDIT',
				'Shape Data on shapes inside a master instance is not supported.',
			);
		if (node !== shape && node.hasAttribute('Master'))
			fail(
				'UNSUPPORTED_SHAPE_DATA_EDIT',
				'Shape Data on shapes inside a master instance is not supported.',
			);
	}
	return shape;
}

/** Refuse when a ShapeSheet formula anywhere reads one of the rows being changed. */
export function assertShapeDataUnreferenced(
	roots: Iterable<Element>,
	rows: ReadonlySet<string>,
	check: () => void,
): void {
	if (!rows.size) return;
	const names = [...rows].map((name) => name.replace(/[^\w]/g, ''));
	const pattern = new RegExp(`\\bProp\\.(?:${names.join('|')})\\b`, 'i');
	for (const root of roots)
		for (const cell of Array.from(root.getElementsByTagNameNS(root.namespaceURI, 'Cell'))) {
			check();
			const formula = executableCellFormula(attribute(cell, 'F'));
			if (formula && pattern.test(formula))
				fail(
					'UNSUPPORTED_SHAPE_DATA_EDIT',
					'A ShapeSheet formula reads this Shape Data row; recalculating it is not supported.',
				);
		}
}

export function propertySection(shape: Element, create: boolean): Element | undefined {
	const sections = children(shape, 'Section').filter((node) =>
		['Property', 'Prop'].includes(attribute(node, 'N') ?? ''),
	);
	if (sections.length > 1) fail('UNSUPPORTED_SHAPE_DATA_EDIT', 'Duplicate Property sections.');
	if (sections[0]?.hasAttribute('Del'))
		fail('UNSUPPORTED_SHAPE_DATA_EDIT', 'Deleted Property sections are not supported.');
	if (sections[0] || !create) return sections[0];
	const section = shape.ownerDocument!.createElementNS(shape.namespaceURI, 'Section');
	section.setAttribute('N', 'Property');
	const after = Array.from(shape.childNodes).find(
		(node) =>
			node.nodeType === 1 &&
			['Text', 'Data1', 'Data2', 'Data3', 'ForeignData', 'Shapes'].includes(
				(node as Element).localName,
			),
	);
	shape.insertBefore(section, after ?? null);
	return section;
}

export function propertyRow(section: Element | undefined, name: string): Element | undefined {
	const rows = children(section, 'Row').filter(
		(node) => (attribute(node, 'N') ?? '').toLowerCase() === name.toLowerCase(),
	);
	if (rows.length > 1) fail('UNSUPPORTED_SHAPE_DATA_EDIT', `Duplicate Prop.${name} rows.`);
	if (rows[0]?.hasAttribute('Del'))
		fail('UNSUPPORTED_SHAPE_DATA_EDIT', 'Deleted Shape Data rows are not supported.');
	return rows[0];
}

function rowCell(row: Element, name: string, create: boolean): Element | undefined {
	const matches = children(row, 'Cell').filter((cell) => attribute(cell, 'N') === name);
	if (matches.length > 1) fail('UNSUPPORTED_SHAPE_DATA_EDIT', `Duplicate ${name} cells.`);
	const cell = matches[0];
	if (cell && (cell.hasAttribute('E') || executableCellFormula(attribute(cell, 'F'))))
		fail(
			'UNSUPPORTED_SHAPE_DATA_EDIT',
			`The Shape Data ${name} cell is formula driven and cannot be replaced.`,
		);
	if (cell || !create) return cell;
	const created = row.ownerDocument!.createElementNS(row.namespaceURI, 'Cell');
	created.setAttribute('N', name);
	row.appendChild(created);
	return created;
}

function setRowCell(row: Element, name: string, value: string, unit?: string): boolean {
	const cell = rowCell(row, name, true)!;
	const changed =
		attribute(cell, 'V') !== value ||
		attribute(cell, 'U') !== unit ||
		cell.hasAttribute('F') ||
		cell.hasAttribute('E');
	cell.setAttribute('V', value);
	cell.removeAttribute('F');
	if (unit === undefined) cell.removeAttribute('U');
	else cell.setAttribute('U', unit);
	return changed;
}

/**
 * Write one Property row's label, prompt, type, format and value; a missing row is created with
 * the native cell set. `linked` sets the DataLinked cell of an external-data row. Returns
 * whether anything changed.
 */
export function writePropertyRow(
	shape: Element,
	name: string,
	data: VisioShapeDataFields,
	linked?: boolean,
): boolean {
	const section = propertySection(shape, true)!;
	let row = propertyRow(section, name);
	let changed = false;
	if (!row) {
		row = shape.ownerDocument!.createElementNS(shape.namespaceURI, 'Row');
		row.setAttribute('N', name);
		for (const cell of ROW_CELLS) {
			const node = shape.ownerDocument!.createElementNS(shape.namespaceURI, 'Cell');
			node.setAttribute('N', cell);
			node.setAttribute(
				'V',
				cell === 'LangID'
					? 'en-US'
					: ['Invisible', 'Verify', 'DataLinked', 'Calendar'].includes(cell)
						? '0'
						: '',
			);
			row.appendChild(node);
		}
		section.appendChild(row);
		changed = true;
	}
	changed = setRowCell(row, 'Value', data.value, UNITS[data.type]) || changed;
	changed = setRowCell(row, 'Prompt', data.prompt) || changed;
	changed = setRowCell(row, 'Label', data.label) || changed;
	changed = setRowCell(row, 'Format', data.format) || changed;
	changed = setRowCell(row, 'Type', String(VISIO_SHAPE_DATA_TYPES.indexOf(data.type))) || changed;
	changed = setRowCell(row, 'Invisible', data.invisible ? '1' : '0') || changed;
	if (linked !== undefined) changed = setRowCell(row, 'DataLinked', linked ? '1' : '0') || changed;
	return changed;
}

/** Remove one Property row (and an emptied section). Returns whether it existed. */
export function removePropertyRow(shape: Element, name: string): boolean {
	const section = propertySection(shape, false);
	const row = propertyRow(section, name);
	if (!section || !row) return false;
	for (const cell of children(row, 'Cell'))
		if (cell.hasAttribute('E') || executableCellFormula(attribute(cell, 'F')))
			fail('UNSUPPORTED_SHAPE_DATA_EDIT', 'Formula-driven Shape Data rows cannot be removed.');
	section.removeChild(row);
	if (!children(section, 'Row').length) shape.removeChild(section);
	return true;
}

/** Apply a Shape Data edit to cloned page roots. Returns whether the page changed. */
export function applyShapeDataEdit(
	roots: ReadonlyMap<string, Element>,
	edit: VisioShapeDataEdit,
	check: () => void,
): boolean {
	const root = roots.get(edit.pageId);
	if (!root) fail('EDIT_TARGET_NOT_FOUND', 'Page does not exist.');
	const shape = shapeDataOwner(root, edit.shapeId);
	assertShapeDataUnreferenced(roots.values(), new Set([edit.row]), check);
	if (edit.data) return writePropertyRow(shape, edit.row, edit.data);
	if (!removePropertyRow(shape, edit.row))
		fail('EDIT_TARGET_NOT_FOUND', 'The Shape Data row does not exist on this shape.');
	return true;
}
