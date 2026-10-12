import { fail } from './package-common';
import { attribute, children } from './sheet';
import { executableCellFormula } from './cell-formula';
import { cells, setCell } from './edit-geometry-cells';
import { createShape } from './edit-shape-create';
import type { VisioGuideEdit } from './edit-guide-commands';

/** A top-level local guide, never a master instance or a deleted sheet. */
function guideShape(root: Element, shapeId: string): Element {
	const matches = children(children(root, 'Shapes')[0], 'Shape').filter(
		(shape) => attribute(shape, 'ID') === shapeId,
	);
	if (matches.length !== 1) fail('EDIT_TARGET_NOT_FOUND', 'A unique top-level guide is required.');
	const shape = matches[0]!;
	if (
		attribute(shape, 'Type') !== 'Guide' ||
		['Master', 'MasterShape', 'Del'].some((name) => shape.hasAttribute(name))
	)
		fail('UNSUPPORTED_GUIDE_EDIT', 'Only local guide shapes can be moved or deleted as guides.');
	return shape;
}

/** Shapes glued to a guide carry formulas or Connect rows naming it; those need Visio's solver. */
function assertUnreferenced(
	roots: ReadonlyMap<string, Element>,
	shapeId: string,
	check: () => void,
): void {
	const reference = new RegExp(`\\bSheet\\.${shapeId}!`, 'i');
	for (const root of roots.values()) {
		for (const cell of Array.from(root.getElementsByTagNameNS(root.namespaceURI, 'Cell'))) {
			check();
			if (reference.test(executableCellFormula(attribute(cell, 'F')) ?? ''))
				fail('UNSUPPORTED_GUIDE_EDIT', 'A shape formula refers to this guide.');
		}
		for (const connects of children(root, 'Connects'))
			for (const row of children(connects, 'Connect'))
				if (attribute(row, 'ToSheet') === shapeId || attribute(row, 'FromSheet') === shapeId)
					fail('UNSUPPORTED_GUIDE_EDIT', 'Shapes are glued to this guide.');
	}
}

/** The native guide sheet: zero-size, an infinite line, rotated a quarter turn when vertical. */
function createGuide(root: Element, edit: Extract<VisioGuideEdit, { type: 'create-guide' }>) {
	const shape = createShape(root, edit.shapeId);
	shape.setAttribute('Type', 'Guide');
	const vertical = edit.orientation === 'vertical';
	for (const [name, value] of [
		['PinX', vertical ? edit.position : 0],
		['PinY', vertical ? 0 : edit.position],
		['Width', 0],
		['Height', 0],
		['LocPinX', 0],
		['LocPinY', 0],
		['Angle', vertical ? Math.PI / 2 : 0],
		['FlipX', 0],
		['FlipY', 0],
		['NoAlignBox', 1],
		['NoObjHandles', 1],
	] as const)
		setCell(shape, name, value);
	const node = (name: string) => root.ownerDocument!.createElementNS(root.namespaceURI, name);
	const section = node('Section');
	section.setAttribute('N', 'Geometry');
	section.setAttribute('IX', '0');
	for (const [name, value] of [
		['NoFill', 1],
		['NoLine', 0],
		['NoShow', 0],
		['NoSnap', 0],
	] as const)
		setCell(section, name, value);
	const row = node('Row');
	row.setAttribute('T', 'InfiniteLine');
	row.setAttribute('IX', '1');
	for (const [name, value] of [
		['X', 0],
		['Y', 0],
		['A', 1],
		['B', 0],
	] as const)
		setCell(row, name, value);
	section.appendChild(row);
	shape.appendChild(section);
}

/** Apply one guide command to its page root; other pages are read only for references. */
export function applyGuideEdit(
	roots: ReadonlyMap<string, Element>,
	edit: VisioGuideEdit,
	check: () => void,
): void {
	const root = roots.get(edit.pageId);
	if (!root) fail('EDIT_TARGET_NOT_FOUND', 'Page does not exist.');
	if (children(root, 'Shapes').length > 1)
		fail('UNSUPPORTED_GUIDE_EDIT', 'Duplicate Shapes containers.');
	if (edit.type === 'create-guide') {
		const reference = new RegExp(`\\bSheet\\.${edit.shapeId}!`, 'i');
		for (const page of roots.values())
			for (const cell of Array.from(page.getElementsByTagNameNS(page.namespaceURI, 'Cell'))) {
				check();
				if (reference.test(attribute(cell, 'F') ?? ''))
					fail('INVALID_SHAPE_ID', 'An existing formula already refers to the new shape ID.');
			}
		return createGuide(root!, edit);
	}
	const shape = guideShape(root!, edit.shapeId);
	assertUnreferenced(roots, edit.shapeId, check);
	if (edit.type === 'delete-guide') {
		shape.parentNode!.removeChild(shape);
		return;
	}
	const local = cells(shape);
	const angle = Number(attribute(local.get('Angle'), 'V') ?? '0');
	const vertical = Math.abs(Math.abs(angle) - Math.PI / 2) < 1e-6;
	if (!vertical && Math.abs(angle) > 1e-6)
		fail('UNSUPPORTED_GUIDE_EDIT', 'Only horizontal and vertical guides can be moved.');
	const name = vertical ? 'PinX' : 'PinY';
	const cell = local.get(name);
	if (cell && (cell.hasAttribute('E') || executableCellFormula(attribute(cell, 'F'))))
		fail('UNSUPPORTED_GUIDE_EDIT', 'The guide position is formula driven.');
	setCell(shape, name, edit.position);
}
