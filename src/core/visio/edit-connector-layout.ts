import { attribute, children } from './sheet';
import { fail } from './package-common';
import { cells, numeric, setCell } from './edit-geometry-cells';
import { sameLineCoordinate } from './edit-line-move';
import { recalculateVisioCells, type VisioCellKey } from './edit-recalculate';
import type { VisioConnectorRoute } from './edit-connector-commands';
import { visioGlueSites, type VisioGlueBox, type VisioGluePoint } from './edit-connector-glue';
import {
	visioCurvedRoute,
	visioOrthogonalRoute,
	type VisioRouteBox,
	type VisioRouteEnd,
	type VisioRoutePoint,
} from './connector-route';

export type End = 'begin' | 'end';
export const ENDS: readonly End[] = ['begin', 'end'];
export const prefix = (end: End) => (end === 'begin' ? 'Begin' : 'End');

/**
 * Route cells as Visio's Design > Connectors writes them on a dynamic connector:
 * ShapeRouteStyle 1 (right angle) or 16 (center to center, Visio's straight), ConLineRouteExt 1
 * (straight segments) or 2 (curved).
 */
const ROUTE_CELLS: Record<VisioConnectorRoute, readonly [number, number]> = {
	'right-angle': [1, 1],
	straight: [16, 1],
	curved: [1, 2],
};
/** A connector's route from its cells; connectors without route cells are straight. */
export function connectorRoute(shape: Element): VisioConnectorRoute {
	const local = cells(shape);
	if (!local.has('ShapeRouteStyle') && !local.has('ConLineRouteExt')) return 'straight';
	if (numeric(local.get('ConLineRouteExt'), 0) === 2) return 'curved';
	return numeric(local.get('ShapeRouteStyle'), 0) === 16 ? 'straight' : 'right-angle';
}
export function setRouteCells(shape: Element, route: VisioConnectorRoute): void {
	const [style, extension] = ROUTE_CELLS[route];
	setCell(shape, 'ShapeRouteStyle', style);
	setCell(shape, 'ConLineRouteExt', extension);
}

/** A glued end's candidate sites: dynamic glue may sit on any side midpoint. */
export interface ConnectorSite {
	point: VisioGluePoint;
	normal?: VisioGluePoint;
	box?: VisioRouteBox;
}
const normalize = (x: number, y: number): VisioGluePoint => {
	const length = Math.hypot(x, y) || 1;
	return { x: x / length, y: y / length };
};
const apply = (box: VisioGlueBox, x: number, y: number): VisioGluePoint => {
	const [a, b, c, d, e, f] = box.transform;
	return { x: a * x + c * y + e, y: b * x + d * y + f };
};
export function routeBox(box: VisioGlueBox): VisioRouteBox {
	const corners = [
		[0, 0],
		[box.width, 0],
		[box.width, box.height],
		[0, box.height],
	].map(([x, y]) => apply(box, x!, y!));
	return {
		minX: Math.min(...corners.map((p) => p.x)),
		minY: Math.min(...corners.map((p) => p.y)),
		maxX: Math.max(...corners.map((p) => p.x)),
		maxY: Math.max(...corners.map((p) => p.y)),
	};
}
const SIDE_NORMALS = [
	[0, -1],
	[1, 0],
	[0, 1],
	[-1, 0],
] as const;
const sideNormal = (box: VisioGlueBox, side: number): VisioGluePoint => {
	const [a, b, c, d] = box.transform;
	const [x, y] = SIDE_NORMALS[side]!;
	return normalize(a * x + c * y, b * x + d * y);
};
/** The four side midpoints of a dynamic glue target, each with its outward normal. */
export function dynamicSites(box: VisioGlueBox): ConnectorSite[] {
	const bounds = routeBox(box);
	return visioGlueSites(box).map((point, side) => ({
		point,
		normal: sideNormal(box, side),
		box: bounds,
	}));
}
/** A connection point site: it leaves along the normal of the side nearest the point. */
export function pointSite(box: VisioGlueBox, x: number, y: number): ConnectorSite {
	const distances = [y, box.width - x, box.height - y, x].map(Math.abs);
	const side = distances.indexOf(Math.min(...distances));
	return { point: apply(box, x, y), normal: sideNormal(box, side), box: routeBox(box) };
}
/** The closest pair of candidate sites (Visio's walking glue picks facing sides). */
export function chooseSites(
	begin: readonly ConnectorSite[],
	end: readonly ConnectorSite[],
): Record<End, ConnectorSite> {
	let best: Record<End, ConnectorSite> | undefined;
	let length = Infinity;
	for (const from of begin)
		for (const to of end) {
			const value = Math.hypot(to.point.x - from.point.x, to.point.y - from.point.y);
			if (value > 1e-9 && value < length) {
				best = { begin: from, end: to };
				length = value;
			}
		}
	if (!best) fail('UNSUPPORTED_GEOMETRY_EDIT', 'Glued connector endpoints would coincide.');
	return best;
}

const toEnd = (site: ConnectorSite): VisioRouteEnd => ({
	point: site.point,
	...(site.normal ? { normal: site.normal } : {}),
	...(site.box ? { box: site.box } : {}),
});
/** The page-space vertices of a routed connector (a cubic's four controls when curved). */
export function routeVertices(
	route: VisioConnectorRoute,
	sites: Record<End, ConnectorSite>,
	obstacles: readonly VisioRouteBox[] = [],
): VisioRoutePoint[] {
	const begin = toEnd(sites.begin),
		end = toEnd(sites.end);
	if (route === 'curved') return visioCurvedRoute(begin, end);
	if (route === 'right-angle') return visioOrthogonalRoute(begin, end, obstacles);
	return [begin.point, end.point];
}

function geometryRows(shape: Element): Element {
	const sections = children(shape, 'Section').filter((node) => attribute(node, 'N') === 'Geometry');
	if (sections.length !== 1)
		fail('UNSUPPORTED_GEOMETRY_EDIT', 'A connector needs exactly one Geometry section.');
	const section = sections[0]!;
	for (const row of children(section, 'Row')) section.removeChild(row);
	return section;
}
function row(section: Element, type: string, values: [string, number | string, string?][]): void {
	const node = section.ownerDocument!.createElementNS(section.namespaceURI, 'Row');
	node.setAttribute('IX', String(children(section, 'Row').length + 1));
	node.setAttribute('T', type);
	for (const [name, value, formula] of values) {
		if (typeof value === 'number') setCell(node, name, value, formula);
		else {
			const cell = section.ownerDocument!.createElementNS(section.namespaceURI, 'Cell');
			cell.setAttribute('N', name);
			cell.setAttribute('V', value);
			cell.setAttribute('F', value);
			node.appendChild(cell);
		}
	}
	section.appendChild(node);
}
const round = (value: number) => (Math.abs(value) < 1e-12 ? 0 : value);

/**
 * Write a connector's transform and Geometry for its route. Straight connectors keep the native
 * DrawLine form (length Width, Angle); right-angle and curved ones take Visio's dynamic-connector
 * form: Angle 0, Width EndX-BeginX and Height EndY-BeginY (either may be negative), with the route
 * as local vertices from the begin point (a NURBSTo cubic when curved).
 */
export function writeConnectorShape(
	shape: Element,
	route: VisioConnectorRoute,
	vertices: readonly VisioRoutePoint[],
): void {
	const local = cells(shape);
	const begin = vertices[0]!,
		end = vertices.at(-1)!;
	for (const [name, value] of [
		['BeginX', begin.x],
		['BeginY', begin.y],
		['EndX', end.x],
		['EndY', end.y],
	] as const) {
		const node = local.get(name);
		if (node) node.setAttribute('V', String(value));
		else setCell(shape, name, value);
	}
	setCell(shape, 'PinX', (begin.x + end.x) / 2, '(BeginX+EndX)/2');
	setCell(shape, 'PinY', (begin.y + end.y) / 2, '(BeginY+EndY)/2');
	const section = geometryRows(shape);
	if (route === 'straight') {
		const width = Math.hypot(end.x - begin.x, end.y - begin.y);
		setCell(shape, 'Width', width, 'SQRT((EndX-BeginX)^2+(EndY-BeginY)^2)');
		setCell(shape, 'Height', 0);
		setCell(shape, 'LocPinX', width / 2, 'Width*0.5');
		setCell(shape, 'LocPinY', 0, 'Height*0.5');
		setCell(
			shape,
			'Angle',
			Math.atan2(end.y - begin.y, end.x - begin.x),
			'ATAN2(EndY-BeginY,EndX-BeginX)',
		);
		row(section, 'MoveTo', [
			['X', 0, 'Width*0'],
			['Y', 0],
		]);
		row(section, 'LineTo', [
			['X', width, 'Width*1'],
			['Y', 0],
		]);
		return;
	}
	const width = end.x - begin.x,
		height = end.y - begin.y;
	setCell(shape, 'Width', width, 'EndX-BeginX');
	setCell(shape, 'Height', height, 'EndY-BeginY');
	setCell(shape, 'LocPinX', width / 2, 'Width*0.5');
	setCell(shape, 'LocPinY', height / 2, 'Height*0.5');
	setCell(shape, 'Angle', 0);
	const at = (point: VisioRoutePoint) => [round(point.x - begin.x), round(point.y - begin.y)];
	row(section, 'MoveTo', [
		['X', 0],
		['Y', 0],
	]);
	if (route === 'curved') {
		const [, one, two] = vertices.map(at) as [number, number][];
		const [x, y] = at(end);
		row(section, 'NURBSTo', [
			['X', x!],
			['Y', y!],
			['A', 0],
			['B', 1],
			['C', 0],
			['D', 1],
			['E', `NURBS(1,3,1,1,${one![0]},${one![1]},0,1,${two![0]},${two![1]},0,1)`],
		]);
		return;
	}
	for (const vertex of vertices.slice(1)) {
		const [x, y] = at(vertex);
		row(section, 'LineTo', [
			['X', x!],
			['Y', y!],
		]);
	}
}

/**
 * Lay a connector out between its resolved ends and recalculate its dependants. Locked ends that
 * would move are refused.
 */
export function layoutConnectorShape(
	roots: ReadonlyMap<string, Element>,
	pageId: string,
	shape: Element,
	route: VisioConnectorRoute,
	sites: Record<End, ConnectorSite>,
	check: () => void,
	obstacles: readonly VisioRouteBox[] = [],
): readonly string[] {
	const local = cells(shape);
	const shapeId = attribute(shape, 'ID')!;
	for (const end of ENDS)
		for (const axis of ['X', 'Y'] as const)
			if (
				!sameLineCoordinate(
					numeric(local.get(`${prefix(end)}${axis}`)),
					sites[end].point[axis === 'X' ? 'x' : 'y'],
				) &&
				numeric(local.get(`Lock${prefix(end)}`), 0) !== 0
			)
				fail('EDIT_PROTECTED_CELL', `Lock${prefix(end)} prevents rerouting a glued connector.`);
	writeConnectorShape(shape, route, routeVertices(route, sites, obstacles));
	const changed: VisioCellKey[] = ENDS.flatMap((end) =>
		['X', 'Y'].map((axis) => ({ pageId, shapeId, cell: `${prefix(end)}${axis}` })),
	);
	const pages = recalculateVisioCells(roots, changed, {
		check,
		lineEditShapes: new Set([shape]),
		glueShapes: new Set([shape]),
	});
	return [...new Set([pageId, ...pages])];
}
