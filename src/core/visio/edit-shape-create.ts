import { attribute, children } from './sheet';
import { fail } from './package-common';
import { setCell } from './edit-geometry-cells';
import type { VisioGeometryEdit } from './edit-commands';
import { appendEllipseGeometry } from './edit-ellipse-geometry';
import { assertShapeLocks } from './edit-style-admission';
import { encodeVisioPlainText } from './plain-text';
import type { VisioBasicOutline } from './basic-shapes';
import { visioOutlineShape } from './stencil-shapes';

export function createShape(root: Element, shapeId: string): Element {
	const doc = root.ownerDocument!;
	const node = (name: string) => doc.createElementNS(root.namespaceURI, name);
	let container = children(root, 'Shapes')[0];
	if (children(root, 'Shapes').length > 1) fail('INVALID_SHAPE_ID', 'Duplicate Shapes containers.');
	const pending: Element[] = [root];
	while (pending.length) {
		const parent = pending.pop()!;
		for (const shapes of children(parent, 'Shapes'))
			for (const shape of children(shapes, 'Shape')) {
				if (attribute(shape, 'ID') === shapeId)
					fail('INVALID_SHAPE_ID', 'Shape ID already exists.');
				pending.push(shape);
			}
	}
	if (!container) {
		container = node('Shapes');
		root.insertBefore(container, children(root, 'Connects')[0] ?? null);
	}
	const shape = node('Shape');
	shape.setAttribute('ID', shapeId);
	shape.setAttribute('Type', 'Shape');
	container.appendChild(shape);
	return shape;
}

export function createBox(
	root: Element,
	document: Element,
	edit: Extract<
		VisioGeometryEdit,
		{ type: 'create-rectangle' | 'create-ellipse' | 'create-text-box' }
	>,
): Element {
	const shape = createShape(root, edit.shapeId);
	applyShapeCreationStyles(shape, document);
	for (const [name, value] of Object.entries({
		PinX: edit.x,
		PinY: edit.y,
		Width: edit.width,
		Height: edit.height,
		LocPinX: edit.width / 2,
		LocPinY: edit.height / 2,
		Angle: 0,
	}))
		setCell(
			shape,
			name,
			value,
			name === 'LocPinX' ? 'Width*0.5' : name === 'LocPinY' ? 'Height*0.5' : undefined,
		);
	return shape;
}

export function createRectangle(
	root: Element,
	document: Element,
	edit: Extract<VisioGeometryEdit, { type: 'create-rectangle' | 'create-text-box' }>,
): Element {
	if (edit.type === 'create-text-box') {
		const planned = root.ownerDocument!.createElementNS(root.namespaceURI, 'Shape');
		applyShapeCreationStyles(planned, document);
		assertShapeLocks(planned, document, ['LockTextEdit']);
	}
	const shape = createBox(root, document, edit);
	if (edit.type === 'create-text-box') {
		setCell(shape, 'LinePattern', 0);
		setCell(shape, 'FillPattern', 0);
	}
	const doc = root.ownerDocument!;
	const node = (name: string) => doc.createElementNS(root.namespaceURI, name);
	const outline = visioOutlineShape(
		edit.type === 'create-rectangle' ? (edit.shape ?? 'rectangle') : 'rectangle',
	);
	if (outline.rounding)
		setCell(shape, 'Rounding', outline.rounding * Math.min(edit.width, edit.height));
	for (const section of outlineGeometrySections(shape, outline)) shape.appendChild(section);
	const text = node('Text');
	text.appendChild(doc.createTextNode(encodeVisioPlainText(edit.text ?? '')));
	shape.appendChild(text);
	return shape;
}

/** Detached Geometry sections (IX 0, 1, ...) of closed relative polylines in the shape's box,
 * followed by the outline's open interior lines as unfilled sections. */
export function outlineGeometrySections(shape: Element, outline: VisioBasicOutline): Element[] {
	const node = (name: string) => shape.ownerDocument!.createElementNS(shape.namespaceURI, name);
	const runs = [
		...outline.paths.map((points) => ({ points: [...points, points[0]!], open: false })),
		...(outline.lines ?? []).map((points) => ({ points, open: true })),
	];
	return runs.map(({ points, open }, sectionIndex) => {
		const section = node('Section');
		section.setAttribute('N', 'Geometry');
		section.setAttribute('IX', String(sectionIndex));
		if (open) setCell(section, 'NoFill', 1);
		for (const [index, [x, y]] of points.entries()) {
			const row = node('Row');
			row.setAttribute('IX', String(index + 1));
			row.setAttribute('T', index ? 'RelLineTo' : 'RelMoveTo');
			setCell(row, 'X', x);
			setCell(row, 'Y', y);
			section.appendChild(row);
		}
		return section;
	});
}

export function createEllipse(
	root: Element,
	document: Element,
	edit: Extract<VisioGeometryEdit, { type: 'create-ellipse' }>,
): Element {
	const shape = createBox(root, document, edit);
	appendEllipseGeometry(shape, edit.width, edit.height);
	if (edit.text !== undefined) {
		const text = root.ownerDocument!.createElementNS(root.namespaceURI, 'Text');
		text.appendChild(root.ownerDocument!.createTextNode(encodeVisioPlainText(edit.text)));
		shape.appendChild(text);
	}
	return shape;
}

/** Native drawing style references for newly drawn geometry, shared with detached scope admission. */
export function applyShapeCreationStyles(shape: Element, document: Element): void {
	const settings = children(document, 'DocumentSettings')[0];
	for (const category of ['LineStyle', 'FillStyle', 'TextStyle']) {
		const id = attribute(settings, `Default${category}`);
		if (id !== undefined) shape.setAttribute(category, id);
	}
}

export function createLine(
	root: Element,
	document: Element,
	edit: Extract<VisioGeometryEdit, { type: 'create-line' }>,
): Element {
	const shape = createShape(root, edit.shapeId);
	applyShapeCreationStyles(shape, document);
	const width = Math.hypot(edit.endX - edit.beginX, edit.endY - edit.beginY);
	const entries: [string, number, string?][] = [
		['BeginX', edit.beginX],
		['BeginY', edit.beginY],
		['EndX', edit.endX],
		['EndY', edit.endY],
		['PinX', (edit.beginX + edit.endX) / 2, '(BeginX+EndX)/2'],
		['PinY', (edit.beginY + edit.endY) / 2, '(BeginY+EndY)/2'],
		['Width', width, 'SQRT((EndX-BeginX)^2+(EndY-BeginY)^2)'],
		['Height', 0],
		['LocPinX', width / 2, 'Width*0.5'],
		['LocPinY', 0, 'Height*0.5'],
		[
			'Angle',
			Math.atan2(edit.endY - edit.beginY, edit.endX - edit.beginX),
			'ATAN2(EndY-BeginY,EndX-BeginX)',
		],
		['FlipX', 0],
		['FlipY', 0],
		['ResizeMode', 0],
		...['Line', 'Fill', 'Effects', 'Font'].map((kind): [string, number] => [
			`QuickStyle${kind}Matrix`,
			1,
		]),
	];
	for (const [name, value, formula] of entries) setCell(shape, name, value, formula);
	const section = root.ownerDocument!.createElementNS(root.namespaceURI, 'Section');
	section.setAttribute('N', 'Geometry');
	section.setAttribute('IX', '0');
	for (const [name, value] of [
		['NoFill', 1],
		['NoLine', 0],
		['NoShow', 0],
		['NoSnap', 0],
		['NoQuickDrag', 0],
	] as const)
		setCell(section, name, value);
	for (let index = 0; index < 2; index++) {
		const row = root.ownerDocument!.createElementNS(root.namespaceURI, 'Row');
		row.setAttribute('IX', String(index + 1));
		row.setAttribute('T', index ? 'LineTo' : 'MoveTo');
		setCell(row, 'X', index * width, `Width*${index}`);
		setCell(row, 'Y', 0);
		section.appendChild(row);
	}
	shape.appendChild(section);
	return shape;
}
