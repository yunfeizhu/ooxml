import type { VisioChangeShapeEdit } from './edit-change-shape-commands';
import { visioBasicShapeOutline } from './basic-shapes';
import { attribute, children } from './sheet';
import { fail, VisioPackageError } from './package-common';
import { cells, editableCell, isLineSheet, numeric, setCell } from './edit-geometry-admission';
import { assertShapeLocks } from './edit-style-admission';
import { ellipseGeometrySection } from './edit-ellipse-geometry';
import { outlineGeometrySections } from './edit-shape-create';
import { indexCells } from './edit-recalculate-index';
import { recalculateVisioCells, type VisioCellKey } from './edit-recalculate';

const refuse = (message: string): never => fail('UNSUPPORTED_CHANGE_SHAPE', message);
const geometrySections = (shape: Element) =>
	children(shape, 'Section').filter((section) => attribute(section, 'N') === 'Geometry');
/** Shape children that follow the sections in schema order. */
const AFTER_SECTIONS = new Set(['Text', 'Data1', 'Data2', 'Data3', 'ForeignData', 'Shapes']);

/** The unique top-level local shape the command names, admitted for outline replacement. */
function admittedShape(root: Element, document: Element, shapeId: string): Element {
	const containers = children(root, 'Shapes');
	if (containers.length !== 1) refuse('One local Shapes container is required.');
	const matches = children(containers[0], 'Shape').filter(
		(node) => attribute(node, 'ID') === shapeId,
	);
	if (matches.length !== 1)
		fail('EDIT_TARGET_NOT_FOUND', 'Change Shape needs a unique top-level shape on the page.');
	const shape = matches[0]!;
	if (shape.hasAttribute('Master') || shape.hasAttribute('MasterShape'))
		refuse('Master shapes inherit their geometry; replacing the master is not supported yet.');
	if (attribute(shape, 'Type') === 'Group' || children(shape, 'Shapes').length)
		refuse('Groups cannot change shape; change their member shapes instead.');
	if (
		(attribute(shape, 'Type') ?? 'Shape') !== 'Shape' ||
		children(shape, 'ForeignData').length ||
		children(shape, 'Rel').length
	)
		refuse('Pictures and embedded objects have no outline to change.');
	if (['1', 'true'].includes(attribute(shape, 'Del') ?? '')) refuse('The shape is deleted.');
	const local = cells(shape);
	if (isLineSheet(local)) refuse('Lines and connectors (1D shapes) cannot change shape.');
	for (const connects of children(root, 'Connects'))
		for (const connect of children(connects, 'Connect'))
			if (['FromSheet', 'ToSheet'].some((name) => attribute(connect, name) === shapeId))
				refuse('Glued connectors would need rerouting, which is not supported yet.');
	if (children(shape, 'Section').some((section) => attribute(section, 'N') === 'Controls'))
		refuse('Control handles belong to the current outline; replacing them is not supported yet.');
	if (
		geometrySections(shape).some((section) =>
			['1', 'true'].includes(attribute(section, 'Del') ?? ''),
		)
	)
		refuse('Deleted inherited geometry cannot be replaced.');
	if (!(numeric(local.get('Width')) > 0) || !(numeric(local.get('Height')) > 0))
		refuse('Positive local Width and Height caches are required.');
	try {
		assertShapeLocks(shape, document, ['LockReplace', 'LockVtxEdit']);
	} catch (error) {
		if (error instanceof VisioPackageError)
			fail('EDIT_PROTECTED_CELL', 'The shape is protected against replacing its geometry.');
		throw error;
	}
	return shape;
}

/** No retained formula may read the outline or rounding being replaced. */
function assertOutlineUnreferenced(
	roots: ReadonlyMap<string, Element>,
	pageId: string,
	shape: Element,
	check: () => void,
): void {
	const shapeId = attribute(shape, 'ID')!;
	const owned = new Set<Element>();
	for (const section of geometrySections(shape))
		for (const node of section.getElementsByTagNameNS(section.namespaceURI!, 'Cell'))
			owned.add(node);
	const prefix = JSON.stringify([pageId, shapeId]).slice(0, -1) + ',';
	for (const cell of indexCells(roots, { check }).values()) {
		check();
		if (cell.node && owned.has(cell.node)) continue;
		for (const dependency of cell.dependencies) {
			if (!dependency.startsWith(prefix)) continue;
			const name = (JSON.parse(dependency) as string[])[2]!;
			if (/^geometry\d+\./.test(name) || name === 'rounding')
				fail(
					'EDIT_UNSUPPORTED_DEPENDENCY',
					'A formula reads the outline being replaced, so the shape cannot change.',
				);
		}
	}
}

/** Replace the Geometry sections of one local 2D shape; true when the page changed. */
export function changeVisioShape(
	roots: ReadonlyMap<string, Element>,
	document: Element,
	edit: Extract<VisioChangeShapeEdit, { shape: unknown }>,
	check: () => void,
): boolean {
	check();
	const root = roots.get(edit.pageId);
	if (!root) fail('EDIT_TARGET_NOT_FOUND', 'Page does not exist.');
	const shape = admittedShape(root, document, edit.shapeId);
	assertOutlineUnreferenced(roots, edit.pageId, shape, check);
	const local = cells(shape);
	const width = numeric(local.get('Width')),
		height = numeric(local.get('Height'));
	const target = edit.shape;
	const outline =
		target === 'ellipse' || target === 'circle' ? undefined : visioBasicShapeOutline(target);
	const replacement = outline
		? outlineGeometrySections(shape, outline)
		: [ellipseGeometrySection(shape, width, height)];
	const old = geometrySections(shape);
	const anchor =
		old[0] ??
		Array.from(shape.children).find((child) => AFTER_SECTIONS.has(child.localName)) ??
		null;
	const changed: VisioCellKey[] = [];
	// Rounding is part of the outline: set for rounded outlines, cleared where set locally.
	const rounding = outline?.rounding ? outline.rounding * Math.min(width, height) : 0;
	const roundingCell = local.get('Rounding');
	if (rounding || (roundingCell && numeric(roundingCell, 0) !== 0)) {
		editableCell(roundingCell);
		setCell(shape, 'Rounding', rounding);
		changed.push({ pageId: edit.pageId, shapeId: edit.shapeId, cell: 'Rounding' });
	}
	for (const section of replacement) shape.insertBefore(section, anchor);
	for (const section of old) shape.removeChild(section);
	// Recalculate the new dimension-dependent rows from Width and Height, proving their caches.
	for (const [sectionIndex, section] of replacement.entries())
		for (const row of children(section, 'Row'))
			for (const node of children(row, 'Cell'))
				if (attribute(node, 'F'))
					changed.push({
						pageId: edit.pageId,
						shapeId: edit.shapeId,
						cell: `Geometry${sectionIndex + 1}.${attribute(node, 'N')}${attribute(row, 'IX')}`,
					});
	if (changed.length) recalculateVisioCells(roots, changed, { check });
	const result = cells(shape);
	if (numeric(result.get('Width')) !== width || numeric(result.get('Height')) !== height)
		fail('EDIT_UNSUPPORTED_DEPENDENCY', 'Dependent formulas would change the shape size.');
	return true;
}
