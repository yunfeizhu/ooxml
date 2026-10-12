import { attribute, children } from './sheet';
import { fail } from './package-common';
import { cells, numeric, setCell } from './edit-geometry-cells';
import { admitted, isLineSheet } from './edit-geometry-admission';
import { isNativeGlueCell } from './edit-connector-glue';
import type { VisioGeometryEdit } from './edit-commands';
import { ENDS, prefix } from './edit-connector-layout';
import {
	connectionRows,
	glueEnd,
	glueParticipants,
	topShape,
	unglueConnector,
} from './edit-connector';

type AddPoint = Extract<VisioGeometryEdit, { type: 'add-connection-point' }>;
type DeletePoint = Extract<VisioGeometryEdit, { type: 'delete-connection-point' }>;
const MAX_POINTS = 256;
const INHERITED =
	'Connection points of master instances come from the master: glue to them, edit them in the master.';

/** A local, top-level 2D shape whose Connection rows this editor may change. */
function pointOwner(root: Element, shapeId: string): Element {
	const shape = topShape(root, shapeId);
	if (shape && (shape.hasAttribute('Master') || shape.hasAttribute('MasterShape')))
		fail('UNSUPPORTED_GEOMETRY_EDIT', INHERITED);
	const owner = admitted(root, shapeId);
	if (isLineSheet(cells(owner)))
		fail('UNSUPPORTED_GEOMETRY_EDIT', 'Connection points can be added to 2D shapes only.');
	return owner;
}
const round = (value: number) => Math.round(value * 1e6) / 1e6;

/**
 * Home > Tools > Connection Point: add a Connection row at fractions of the shape's size, with
 * Width*x and Height*y formulas so the point follows resizing.
 */
export function addConnectionPoint(root: Element, edit: AddPoint): readonly string[] {
	const shape = pointOwner(root, edit.shapeId);
	const local = cells(shape);
	const width = numeric(local.get('Width')),
		height = numeric(local.get('Height'));
	const x = round(edit.x),
		y = round(edit.y);
	const rows = connectionRows(shape);
	if (rows.size >= MAX_POINTS)
		fail(
			'UNSUPPORTED_GEOMETRY_EDIT',
			`A shape holds at most ${MAX_POINTS} connection points here.`,
		);
	for (const row of rows.values()) {
		const point = cells(row);
		if (
			Math.abs(numeric(point.get('X')) - width * x) < 1e-6 &&
			Math.abs(numeric(point.get('Y')) - height * y) < 1e-6
		)
			fail('INVALID_EDIT', 'The shape already has a connection point there.');
	}
	const doc = root.ownerDocument!;
	const sections = children(shape, 'Section').filter(
		(node) => attribute(node, 'N') === 'Connection',
	);
	if (sections.length > 1) fail('UNSUPPORTED_GEOMETRY_EDIT', 'Ambiguous Connection sections.');
	let section = sections[0];
	if (section && ['1', 'true'].includes(attribute(section, 'Del') ?? ''))
		fail('UNSUPPORTED_GEOMETRY_EDIT', INHERITED);
	if (!section) {
		section = doc.createElementNS(root.namespaceURI, 'Section');
		section.setAttribute('N', 'Connection');
		const geometry = children(shape, 'Section').find((node) => attribute(node, 'N') === 'Geometry');
		shape.insertBefore(section, geometry ?? null);
	}
	const used = children(section, 'Row').map((row) => Number(attribute(row, 'IX') ?? '0'));
	const row = doc.createElementNS(root.namespaceURI, 'Row');
	row.setAttribute('IX', String(used.length ? Math.max(...used) + 1 : 0));
	setCell(row, 'X', width * x, `Width*${x}`);
	setCell(row, 'Y', height * y, `Height*${y}`);
	for (const name of ['DirX', 'DirY', 'Type', 'AutoGen']) setCell(row, name, 0);
	section.appendChild(row);
	return [edit.pageId];
}

/** Formulas other than native glue that read a shape's Connections cells cannot be renumbered. */
function assertUnreferenced(root: Element, shapeId: string): void {
	const remote = new RegExp(`Sheet\\.${shapeId}!Connections\\.`, 'i');
	for (const node of Array.from(root.getElementsByTagName('Cell'))) {
		const formula = attribute(node, 'F') ?? '';
		if (!/Connections\./i.test(formula) || isNativeGlueCell(attribute(node, 'N') ?? '', formula))
			continue;
		let owner = node.parentNode as Element | null;
		while (owner && owner.localName !== 'Shape') owner = owner.parentNode as Element | null;
		if (remote.test(formula) || (owner && attribute(owner, 'ID') === shapeId))
			fail(
				'EDIT_UNSUPPORTED_DEPENDENCY',
				'A formula reads the connection points of this shape; they cannot be renumbered here.',
			);
	}
}

/**
 * Delete a Connection row. Ends glued to it are unglued where they are; ends glued to later rows
 * follow their renumbered rows, as in Visio.
 */
export function deleteConnectionPoint(root: Element, edit: DeletePoint): readonly string[] {
	const shape = pointOwner(root, edit.shapeId);
	const rows = connectionRows(shape);
	const row = rows.get(edit.index);
	if (!row) fail('EDIT_TARGET_NOT_FOUND', 'The connection point does not exist.');
	assertUnreferenced(root, edit.shapeId);
	const { connectors } = glueParticipants(root, edit.shapeId);
	const moved: { glue: (typeof connectors)[number]; end: (typeof ENDS)[number]; point: number }[] =
		[];
	for (const glue of connectors)
		for (const end of ENDS) {
			const target = glue.ends[end];
			if (target?.target !== edit.shapeId || target.point === undefined) continue;
			if (target.point === edit.index) unglueConnector(root, glue, [end]);
			else if (target.point > edit.index) moved.push({ glue, end, point: target.point - 1 });
		}
	for (const { glue, end } of moved) unglueConnector(root, glue, [end]);
	const section = row.parentNode as Element;
	section.removeChild(row);
	for (const later of children(section, 'Row')) {
		const index = Number(attribute(later, 'IX') ?? '0');
		if (index > edit.index) later.setAttribute('IX', String(index - 1));
	}
	if (!children(section, 'Row').length) shape.removeChild(section);
	for (const { glue, end, point } of moved) {
		glueEnd(root, glue.shape, end, { target: edit.shapeId, point });
		glue.ends[end] = { target: edit.shapeId, point };
		// Renumbering keeps the end where it is; only the formulas and Connect row change.
		for (const axis of ['X', 'Y']) numeric(cells(glue.shape).get(`${prefix(end)}${axis}`));
	}
	return [edit.pageId];
}
