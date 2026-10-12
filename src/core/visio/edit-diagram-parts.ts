import { attribute, children } from './sheet';
import { fail } from './package-common';
import { setCell } from './edit-geometry-cells';
import {
	applyShapeCreationStyles,
	createShape,
	outlineGeometrySections,
} from './edit-shape-create';
import { appendEllipseGeometry } from './edit-ellipse-geometry';
import { applyGeometryEdit } from './edit-geometry';
import { visioShapeBounds } from './edit-group';
import { encodeVisioPlainText } from './plain-text';
import type { VisioOutlinePoint } from './basic-shapes';
import {
	VISIO_CALLOUT_LEADER_ROW,
	VISIO_CALLOUT_TARGET_ROW,
	VISIO_CONTAINER_HEADING,
	VISIO_CONTAINER_MARGIN,
	VISIO_CONTAINER_MEMBERS_ROW,
	type VisioCalloutStyle,
	type VisioContainerStyle,
	type VisioInsertCalloutEdit,
	type VisioInsertContainerEdit,
	type VisioPartBox,
} from './edit-diagram-parts-commands';

const CONTAINER_LOOK: Record<
	VisioContainerStyle,
	{ fill?: string; band?: boolean; divider?: boolean; line: string; dashed?: boolean }
> = {
	classic: { fill: '#F2F2F2', divider: true, line: '#7F7F7F' },
	plain: { fill: '#FFFFFF', line: '#A6A6A6' },
	banner: { band: true, fill: '#DEEBF7', line: '#5B9BD5' },
	dashed: { line: '#7F7F7F', dashed: true },
};

function node(shape: Element, name: string): Element {
	return shape.ownerDocument!.createElementNS(shape.namespaceURI, name);
}
/** A string- or unit-typed cell, written after the shape's existing cells. */
function valueCell(parent: Element, name: string, value: string, unit?: string): void {
	const cell = node(parent, 'Cell');
	cell.setAttribute('N', name);
	cell.setAttribute('V', value);
	if (unit) cell.setAttribute('U', unit);
	const before = Array.from(parent.childNodes).find(
		(child) => child.nodeType === 1 && (child as Element).localName !== 'Cell',
	);
	parent.insertBefore(cell, before ?? null);
}
/** A User section with string rows (Visio's msvStructureType and the editor's own rows). */
function userSection(shape: Element, rows: readonly [string, string, string?][]): Element {
	const section = node(shape, 'Section');
	section.setAttribute('N', 'User');
	for (const [name, value, unit] of rows) {
		const row = node(shape, 'Row');
		row.setAttribute('N', name);
		valueCell(row, 'Value', value, unit ?? 'STR');
		valueCell(row, 'Prompt', '', 'STR');
		section.appendChild(row);
	}
	return section;
}
function textNode(shape: Element, value: string): Element {
	const element = node(shape, 'Text');
	element.appendChild(shape.ownerDocument!.createTextNode(encodeVisioPlainText(value)));
	return element;
}
/** Pin, size and the default local pin of a new unrotated 2D box. */
function placeBox(shape: Element, box: VisioPartBox): void {
	for (const [name, value, formula] of [
		['PinX', box.x],
		['PinY', box.y],
		['Width', box.width],
		['Height', box.height],
		['LocPinX', box.width / 2, 'Width*0.5'],
		['LocPinY', box.height / 2, 'Height*0.5'],
		['Angle', 0],
	] as const)
		setCell(shape, name, value, formula);
}
const band = (fraction: number): VisioOutlinePoint[] => [
	[0, 1 - fraction],
	[1, 1 - fraction],
	[1, 1],
	[0, 1],
];
const box: VisioOutlinePoint[] = [
	[0, 0],
	[1, 0],
	[1, 1],
	[0, 1],
];

/**
 * Insert > Container: a local 2D sheet with User.msvStructureType = "Container" framing the
 * members' alignment boxes, placed directly behind the lowest member. Members are untouched and
 * stay on the page (no group). Membership is recorded in a User row; Visio's own Relationships
 * (DEPENDSON) formulas are not written, so Visio opens it as a plain shape. Returns its box.
 */
export function insertVisioContainer(
	root: Element,
	document: Element,
	edit: VisioInsertContainerEdit,
	check: () => void,
): VisioPartBox {
	check();
	const containers = children(root, 'Shapes');
	if (containers.length > 1) fail('UNSUPPORTED_GEOMETRY_EDIT', 'One Shapes container is required.');
	const siblings = children(containers[0], 'Shape');
	const wanted = new Set(edit.memberIds);
	const members = siblings.filter((shape) => wanted.has(attribute(shape, 'ID') ?? ''));
	if (members.length !== wanted.size)
		fail('EDIT_TARGET_NOT_FOUND', 'Container members must be unique top-level local shapes.');
	let frame: VisioPartBox;
	if (members.length) {
		const bounds = visioShapeBounds(members);
		const margin = VISIO_CONTAINER_MARGIN;
		const width = bounds.maxX - bounds.minX + 2 * margin;
		const height = bounds.maxY - bounds.minY + 2 * margin + VISIO_CONTAINER_HEADING;
		frame = {
			x: bounds.minX - margin + width / 2,
			y: bounds.minY - margin + height / 2,
			width,
			height,
		};
	} else frame = edit.box!;
	if (![frame.x, frame.y, frame.width, frame.height].every((v) => Math.abs(v) <= 1e6))
		fail('UNSUPPORTED_GEOMETRY_EDIT', 'Container bounds exceed coordinate limits.');
	check();
	const shape = createShape(root, edit.shapeId);
	applyShapeCreationStyles(shape, document);
	placeBox(shape, frame);
	const look = CONTAINER_LOOK[edit.style];
	const fraction = Math.min(0.5, VISIO_CONTAINER_HEADING / frame.height);
	setCell(shape, 'LineWeight', 0.01);
	setCell(shape, 'LinePattern', look.dashed ? 2 : 1);
	setCell(shape, 'FillPattern', look.fill ? 1 : 0);
	valueCell(shape, 'LineColor', look.line);
	if (look.fill) valueCell(shape, 'FillForegnd', look.fill);
	for (const [name, value, formula] of [
		['TxtPinX', frame.width / 2, 'Width*0.5'],
		['TxtPinY', frame.height * (1 - fraction / 2), `Height*${1 - fraction / 2}`],
		['TxtWidth', frame.width, 'Width*1'],
		['TxtHeight', frame.height * fraction, `Height*${fraction}`],
		['TxtLocPinX', frame.width / 2, 'TxtWidth*0.5'],
		['TxtLocPinY', (frame.height * fraction) / 2, 'TxtHeight*0.5'],
		['VerticalAlign', 1],
	] as const)
		setCell(shape, name, value, formula);
	const sections = outlineGeometrySections(shape, {
		paths: look.band ? [box, band(fraction)] : [box],
		...(look.divider ? { lines: [band(fraction).slice(0, 2)] } : {}),
	});
	// The banner's body is a frame; its heading band carries the fill.
	if (look.band) setCell(sections[0]!, 'NoFill', 1);
	for (const section of sections) shape.appendChild(section);
	const paragraph = node(shape, 'Section');
	paragraph.setAttribute('N', 'Paragraph');
	const row = node(shape, 'Row');
	row.setAttribute('IX', '0');
	setCell(row, 'HorzAlign', 0);
	paragraph.appendChild(row);
	shape.appendChild(paragraph);
	shape.appendChild(
		userSection(shape, [
			['msvStructureType', 'Container'],
			['msvSDContainerMargin', String(VISIO_CONTAINER_MARGIN), 'IN'],
			[VISIO_CONTAINER_MEMBERS_ROW, edit.memberIds.join(',')],
		]),
	);
	shape.appendChild(textNode(shape, edit.heading));
	// Behind every member, as Visio places a container under the shapes it frames.
	const lowest = members[0];
	if (lowest) lowest.parentNode!.insertBefore(shape, lowest);
	return frame;
}

const CALLOUT_LOOK: Record<
	VisioCalloutStyle,
	{ rounded?: boolean; oval?: boolean; bare?: boolean }
> = { rectangle: {}, rounded: { rounded: true }, oval: { oval: true }, text: { bare: true } };

/**
 * Insert > Callout: a text box with User.msvStructureType = "Callout" and a straight leader
 * connector glued from the callout to its target with the core's dynamic glue, so moving either
 * shape reroutes the leader. Visio draws the leader inside the callout master and associates the
 * two through Relationships formulas; neither is reproduced here. Returns the changed page IDs.
 */
export function insertVisioCallout(
	roots: ReadonlyMap<string, Element>,
	document: Element,
	edit: VisioInsertCalloutEdit,
	check: () => void,
): readonly string[] {
	check();
	const root = roots.get(edit.pageId)!;
	const shape = createShape(root, edit.shapeId);
	applyShapeCreationStyles(shape, document);
	placeBox(shape, edit.box);
	const look = CALLOUT_LOOK[edit.style];
	setCell(shape, 'LineWeight', 0.01);
	setCell(shape, 'FillPattern', look.bare ? 0 : 1);
	setCell(shape, 'LinePattern', look.bare ? 0 : 1);
	valueCell(shape, 'LineColor', '#7F7F7F');
	valueCell(shape, 'FillForegnd', '#FFFFFF');
	if (look.rounded) setCell(shape, 'Rounding', 0.15 * Math.min(edit.box.width, edit.box.height));
	if (look.oval) appendEllipseGeometry(shape, edit.box.width, edit.box.height);
	else
		for (const section of outlineGeometrySections(shape, { paths: [box] }))
			shape.appendChild(section);
	shape.appendChild(
		userSection(shape, [
			['msvStructureType', 'Callout'],
			[VISIO_CALLOUT_TARGET_ROW, edit.targetId],
			[VISIO_CALLOUT_LEADER_ROW, edit.leaderId],
		]),
	);
	shape.appendChild(textNode(shape, edit.text));
	const pages = new Set<string>([edit.pageId]);
	for (const page of applyGeometryEdit(
		roots,
		document,
		{
			type: 'create-line',
			pageId: edit.pageId,
			shapeId: edit.leaderId,
			beginX: edit.box.x,
			beginY: edit.box.y,
			endX: edit.box.x + 1,
			endY: edit.box.y,
			connect: { begin: edit.shapeId, end: edit.targetId },
		},
		check,
	))
		pages.add(page);
	// A leader points without an arrowhead, as Visio's callouts do.
	const leader = children(children(root, 'Shapes')[0], 'Shape').find(
		(candidate) => attribute(candidate, 'ID') === edit.leaderId,
	)!;
	setCell(leader, 'EndArrow', 0);
	return [...pages];
}
