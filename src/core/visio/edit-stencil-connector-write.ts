import type { VisioConnectorRoute } from './edit-connector-commands';
import type { VisioRoutePoint } from './connector-route';
import { effectiveCells, effectiveNumber, proveStencilConnector } from './edit-stencil-connector';
import { fail } from './package-common';
import { attribute, children } from './sheet';

/** Visio gives a connector that runs level or plumb a quarter-inch box across its run. */
const FLAT = 0.25;
const EPSILON = 1e-9;
const text = (value: number) => String(Math.abs(value) < 1e-12 ? 0 : value);
const same = (a: number, b: number) =>
	Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b));
const cellsOf = (parent: Element | undefined) =>
	new Map(children(parent, 'Cell').map((node) => [attribute(node, 'N') ?? '', node]));
const cached = (node: Element | undefined): number | undefined => {
	if (!node || node.hasAttribute('E')) return undefined;
	const value = Number(attribute(node, 'V'));
	return Number.isFinite(value) ? value : undefined;
};

function create(parent: Element, name: string): Element {
	return parent.ownerDocument!.createElementNS(parent.namespaceURI, name);
}
/** Append a cell after the parent's other cells (cells come before sections and rows). */
function addCell(parent: Element, name: string): Element {
	const node = create(parent, 'Cell');
	node.setAttribute('N', name);
	const tail = Array.from(parent.childNodes).find(
		(child) => child.nodeType === 1 && (child as Element).localName !== 'Cell',
	);
	parent.insertBefore(node, tail ?? null);
	return node;
}

/**
 * Write one cell as Visio saves it on an instance: a value that equals the master's cache and
 * needs no formula of its own is not written at all; otherwise the local cell carries the value
 * and `formula` (`Inh` for a refreshed cache of the master's formula).
 */
function put(
	parent: Element,
	inherited: Element | undefined,
	name: string,
	value: number,
	formula?: string,
): void {
	const local = cellsOf(parent).get(name);
	const base = cached(cellsOf(inherited).get(name));
	if ((formula === undefined || formula === 'Inh') && base !== undefined && same(base, value)) {
		// A glue formula on an end stays with its value even when that equals the master's.
		if (!local) return;
		if (formula === 'Inh' || !local.hasAttribute('F')) {
			parent.removeChild(local);
			return;
		}
	}
	const node = local ?? addCell(parent, name);
	node.setAttribute('V', text(value));
	node.removeAttribute('E');
	if (formula !== undefined) node.setAttribute('F', formula);
}

/** The point halfway along a polyline, where Visio puts a connector's text. */
function midpoint(points: readonly VisioRoutePoint[]): VisioRoutePoint {
	const lengths = points
		.slice(1)
		.map((point, index) => Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y));
	let left = lengths.reduce((sum, value) => sum + value, 0) / 2;
	for (const [index, length] of lengths.entries()) {
		if (left <= length && length > 0) {
			const from = points[index]!,
				to = points[index + 1]!;
			return {
				x: from.x + ((to.x - from.x) * left) / length,
				y: from.y + ((to.y - from.y) * left) / length,
			};
		}
		left -= length;
	}
	return points.at(-1)!;
}
const bezier = (p: readonly VisioRoutePoint[], t: number): VisioRoutePoint => {
	const u = 1 - t;
	const mix = (key: 'x' | 'y') =>
		u * u * u * p[0]![key] +
		3 * u * u * t * p[1]![key] +
		3 * u * t * t * p[2]![key] +
		t * t * t * p[3]![key];
	return { x: mix('x'), y: mix('y') };
};

function section(shape: Element, name: string, index?: string): Element {
	let node = children(shape, 'Section').find((item) => attribute(item, 'N') === name);
	if (!node) {
		node = create(shape, 'Section');
		node.setAttribute('N', name);
		if (index !== undefined) node.setAttribute('IX', index);
		// Visio's order on the instance: Control before Geometry, both before Text.
		const before = Array.from(shape.childNodes).find((child) => {
			if (child.nodeType !== 1) return false;
			const element = child as Element;
			if (element.localName === 'Cell') return false;
			if (element.localName !== 'Section') return true;
			return name === 'Control' && attribute(element, 'N') === 'Geometry';
		});
		shape.insertBefore(node, before ?? null);
	}
	return node;
}
const drop = (shape: Element, node: Element) => {
	if (!node.childNodes.length && node.parentNode === shape) shape.removeChild(node);
};

/**
 * Lay Visio's Dynamic connector (a stencil instance) out along `vertices`, the way Visio saves
 * it, recorded with `scripts/record-visio-instance-connector.ps1`:
 *
 * - the ends keep their glue formulas and take the new values;
 * - Width and Height are `GUARD(EndX-BeginX)` and `GUARD(EndY-BeginY)`, or `GUARD(0.25DL)` across
 *   a run whose ends are level or plumb, with the path drawn through the middle of that box;
 * - the pin, the local pin and the text pin are refreshed caches of the master's formulas (`Inh`);
 * - Geometry rows override only the master's row cells that differ, rows past the master's are
 *   added and unused master rows are marked deleted;
 * - the text control sits halfway along the path.
 */
export function writeStencilConnector(
	shape: Element,
	route: VisioConnectorRoute,
	vertices: readonly VisioRoutePoint[],
): void {
	const template = proveStencilConnector(shape);
	const effective = effectiveCells(shape);
	for (const [name, allowed] of [
		['ShapeRouteStyle', [0, 1, 16]],
		['ConLineRouteExt', [0, 1, 2]],
	] as const)
		if (!(allowed as readonly number[]).includes(effectiveNumber(effective, name, 0)))
			fail(
				'UNSUPPORTED_GEOMETRY_EDIT',
				'This connector uses a routing style (tree, organization chart or flowchart direction) that cannot be laid out here.',
			);
	const begin = vertices[0]!,
		end = vertices.at(-1)!;
	if (vertices.length < 2 || (same(begin.x, end.x) && same(begin.y, end.y)))
		fail('UNSUPPORTED_GEOMETRY_EDIT', 'The ends of a connector cannot be in the same place.');
	const dx = end.x - begin.x,
		dy = end.y - begin.y;
	// Recorded: an extent under a quarter inch takes the quarter-inch box, not only a zero one.
	const flatX = Math.abs(dx) < FLAT - EPSILON,
		flatY = Math.abs(dy) < FLAT - EPSILON;
	const width = flatX ? FLAT : dx,
		height = flatY ? FLAT : dy;
	put(shape, template, 'PinX', (begin.x + end.x) / 2, 'Inh');
	put(shape, template, 'PinY', (begin.y + end.y) / 2, 'Inh');
	put(shape, undefined, 'Width', width, flatX ? 'GUARD(0.25DL)' : 'GUARD(EndX-BeginX)');
	put(shape, undefined, 'Height', height, flatY ? 'GUARD(0.25DL)' : 'GUARD(EndY-BeginY)');
	put(shape, template, 'LocPinX', width / 2, 'Inh');
	put(shape, template, 'LocPinY', height / 2, 'Inh');
	for (const [name, value] of [
		['BeginX', begin.x],
		['BeginY', begin.y],
		['EndX', end.x],
		['EndY', end.y],
	] as const)
		put(shape, template, name, value);
	// Local coordinates run from the box corner the pin and local pin put under the path.
	const at = (point: VisioRoutePoint): VisioRoutePoint => ({
		x: point.x - (begin.x + end.x) / 2 + width / 2,
		y: point.y - (begin.y + end.y) / 2 + height / 2,
	});
	// A curve between level or plumb ends is the straight run itself.
	const curved = route === 'curved' && !flatX && !flatY && vertices.length === 4;
	const local = (curved || route !== 'curved' ? vertices : [begin, end]).map(at);
	const masterGeometry = children(template, 'Section').find(
		(item) => attribute(item, 'N') === 'Geometry',
	)!;
	const masterRows = children(masterGeometry, 'Row');
	const geometry = section(shape, 'Geometry', '0');
	for (const row of children(geometry, 'Row')) geometry.removeChild(row);
	const addRow = (index: number, type: string): Element => {
		const row = create(geometry, 'Row');
		row.setAttribute('T', type);
		row.setAttribute('IX', String(index));
		geometry.appendChild(row);
		return row;
	};
	const rows: { type: string; cells: [string, number | string, (string | undefined)?][] }[] = curved
		? [
				{
					type: 'MoveTo',
					cells: [
						['X', local[0]!.x, flatX ? undefined : 'Width*0'],
						['Y', local[0]!.y, flatY ? undefined : 'Height*0'],
					],
				},
				{
					type: 'NURBSTo',
					cells: [
						['X', local[3]!.x, flatX ? undefined : 'Width*1'],
						['Y', local[3]!.y, flatY ? undefined : 'Height*1'],
						['A', 0],
						['B', 1],
						['C', 0],
						['D', 1],
						[
							'E',
							`NURBS(1,3,1,1,${text(local[1]!.x - local[0]!.x)},${text(local[1]!.y - local[0]!.y)},0,1,${text(local[2]!.x - local[0]!.x)},${text(local[2]!.y - local[0]!.y)},0,1)`,
						],
					],
				},
			]
		: local.map((point, index) => ({
				type: index ? 'LineTo' : 'MoveTo',
				cells: [
					['X', point.x],
					['Y', point.y],
				],
			}));
	const count = Math.max(rows.length, masterRows.length);
	for (let index = 0; index < count; index++) {
		const wanted = rows[index];
		const base = masterRows[index];
		if (!wanted) {
			addRow(index + 1, attribute(base!, 'T') ?? 'LineTo').setAttribute('Del', '1');
			continue;
		}
		const inherited = base && attribute(base, 'T') === wanted.type ? cellsOf(base) : undefined;
		const changed = wanted.cells.filter(([name, value, formula]) => {
			if (typeof value !== 'number' || formula !== undefined) return true;
			const known = cached(inherited?.get(name));
			return known === undefined || !same(known, value);
		});
		if (!changed.length) continue;
		const row = addRow(index + 1, wanted.type);
		for (const [name, value, formula] of changed) {
			const node = create(row, 'Cell');
			node.setAttribute('N', name);
			node.setAttribute('V', typeof value === 'number' ? text(value) : value);
			if (typeof value === 'string') node.setAttribute('F', value);
			else if (formula !== undefined) node.setAttribute('F', formula);
			row.appendChild(node);
		}
	}
	drop(shape, geometry);
	const middle = curved ? bezier(local, 0.5) : midpoint(local);
	const masterControl = children(template, 'Section')
		.filter((item) => attribute(item, 'N') === 'Control')
		.flatMap((item) => children(item, 'Row'))
		.find((row) => attribute(row, 'N') === 'TextPosition')!;
	const control = section(shape, 'Control');
	let position = children(control, 'Row').find((row) => attribute(row, 'N') === 'TextPosition');
	if (!position) {
		position = create(control, 'Row');
		position.setAttribute('N', 'TextPosition');
		control.appendChild(position);
	}
	put(position, masterControl, 'X', middle.x);
	put(position, masterControl, 'Y', middle.y);
	put(position, masterControl, 'XDyn', middle.x, 'Inh');
	put(position, masterControl, 'YDyn', middle.y, 'Inh');
	drop(control, position);
	drop(shape, control);
	put(shape, template, 'TxtPinX', middle.x, 'Inh');
	put(shape, template, 'TxtPinY', middle.y, 'Inh');
}
