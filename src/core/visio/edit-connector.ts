import { attribute, children } from './sheet';
import { fail } from './package-common';
import { transform } from './geometry';
import { executableCellFormula } from './cell-formula';
import { cells, numeric, setCell } from './edit-geometry-cells';
import { admitted, isLineSheet } from './edit-geometry-admission';
import type { VisioGeometryEdit } from './edit-commands';
import {
	VISIO_WALK_GLUE,
	isNativeGlueCell,
	visioGlueTrigger,
	visioGlueTriggerTarget,
	visioPointGlue,
	visioPointGlueTarget,
	type VisioGlueBox,
} from './edit-connector-glue';
import {
	effectiveCells,
	effectiveNumber,
	effectiveRows,
	isStencilConnector,
	proveStencilConnector,
	stencilTemplate,
} from './edit-stencil-connector';
import {
	ENDS,
	chooseSites,
	dynamicSites,
	pointSite,
	prefix,
	setRouteCells,
	type ConnectorSite,
	type End,
} from './edit-connector-layout';

const triggerName = (end: End) => (end === 'begin' ? 'BegTrigger' : 'EndTrigger');
const UNSUPPORTED = 'Glued connections outside owned straight dynamic glue are unsupported.';
/** Visio's own Dynamic connector is a master instance; its inherited cell form is not written yet. */
export const STENCIL_CONNECTOR =
	'A connector that comes from a grouped or unreadable stencil master cannot be rerouted here, so it and the shapes glued to it cannot be moved or resized.';
type LineCreate = Extract<VisioGeometryEdit, { type: 'create-line' }>;
/** What one connector end is glued to: a shape (dynamic glue) or one of its connection points. */
export interface GlueEnd {
	target: string;
	point?: number;
}
export interface ConnectorGlue {
	shape: Element;
	ends: Partial<Record<End, GlueEnd>>;
}

export const connectRows = (root: Element) =>
	children(root, 'Connects').flatMap((container) => children(container, 'Connect'));
export function topShape(root: Element, shapeId: string): Element | undefined {
	return children(children(root, 'Shapes')[0], 'Shape').find(
		(shape) => attribute(shape, 'ID') === shapeId,
	);
}

/** A glue target's alignment box and transform, read from its own proven caches. */
export function glueBox(root: Element, shapeId: string): VisioGlueBox {
	// A stencil shape's size and pin may live in its master: read the cells in effect.
	const stencil = topShape(root, shapeId);
	const shape = stencilTemplate(stencil) ? stencil! : admitted(root, shapeId);
	const local = stencilTemplate(shape) ? effectiveCells(shape) : cells(shape);
	if (isLineSheet(local)) fail('UNSUPPORTED_GEOMETRY_EDIT', 'Connectors glue to 2D shapes only.');
	const width = numeric(local.get('Width')),
		height = numeric(local.get('Height'));
	if (!(width > 0) || !(height > 0))
		fail('UNSUPPORTED_GEOMETRY_EDIT', 'Connectors glue to shapes with a positive size.');
	const flip = (name: string) => numeric(local.get(name), 0) !== 0;
	return {
		width,
		height,
		transform: transform(
			numeric(local.get('PinX'), width / 2),
			numeric(local.get('PinY'), height / 2),
			numeric(local.get('LocPinX'), width / 2),
			numeric(local.get('LocPinY'), height / 2),
			numeric(local.get('Angle'), 0),
			flip('FlipX'),
			flip('FlipY'),
		),
	};
}
/** The local Connection rows of a shape (not deleted), by zero-based IX. */
export function connectionRows(shape: Element): Map<number, Element> {
	const rows = new Map<number, Element>();
	for (const section of children(shape, 'Section'))
		if (
			attribute(section, 'N') === 'Connection' &&
			!['1', 'true'].includes(attribute(section, 'Del') ?? '')
		)
			for (const row of children(section, 'Row'))
				if (!['1', 'true'].includes(attribute(row, 'Del') ?? ''))
					rows.set(Number(attribute(row, 'IX') ?? '0'), row);
	return rows;
}
/** Candidate sites of a glued end: four side midpoints, or the one connection point. */
export function glueSites(root: Element, end: GlueEnd): ConnectorSite[] {
	const box = glueBox(root, end.target);
	if (end.point === undefined) return dynamicSites(box);
	const target = topShape(root, end.target)!;
	// A stencil shape's connection points are its master's rows with any local overrides.
	const local = stencilTemplate(target)
		? effectiveRows(target, 'Connection').get(end.point)
		: ((row) => (row ? cells(row) : undefined))(connectionRows(target).get(end.point));
	if (!local) fail('EDIT_TARGET_NOT_FOUND', 'The connection point does not exist.');
	return [pointSite(box, numeric(local.get('X')), numeric(local.get('Y')))];
}
const asGlue = (connect: LineCreate['connect'], end: End): GlueEnd | undefined => {
	const target = connect?.[end];
	if (target === undefined) return undefined;
	const point = connect?.[`${end}Point`];
	return { target, ...(point === undefined ? {} : { point }) };
};

/** Endpoints of a new connector after its glued ends move onto their shapes or points. */
export function planConnector(root: Element, edit: LineCreate): LineCreate {
	if (!edit.connect) return edit;
	const sites = (end: End): ConnectorSite[] => {
		const glue = asGlue(edit.connect, end);
		if (glue) return glueSites(root, glue);
		return [
			{
				point:
					end === 'begin' ? { x: edit.beginX, y: edit.beginY } : { x: edit.endX, y: edit.endY },
			},
		];
	};
	const points = chooseSites(sites('begin'), sites('end'));
	return {
		...edit,
		beginX: points.begin.point.x,
		beginY: points.begin.point.y,
		endX: points.end.point.x,
		endY: points.end.point.y,
	};
}

/**
 * Visio turns a shape it was left to decide about (ObjType 0 or none) into a placeable one
 * (ObjType 1) when a dynamic connector is glued to it; other connectors then route around it.
 * A shape that says otherwise, or computes ObjType with a formula, is left alone.
 */
function markPlaceable(target: Element | undefined): void {
	if (!target) return;
	const node = (stencilTemplate(target) ? effectiveCells(target) : cells(target)).get('ObjType');
	if (node && (node.hasAttribute('F') || numeric(node) !== 0)) return;
	setCell(target, 'ObjType', 1);
}

/** Glue one end: native formulas, trigger and a Connect row (Visio's dynamic or point glue). */
export function glueEnd(root: Element, shape: Element, end: End, glue: GlueEnd): void {
	const doc = root.ownerDocument!;
	const local = cells(shape);
	setCell(shape, triggerName(end), 2, visioGlueTrigger(glue.target));
	for (const axis of ['X', 'Y']) {
		const name = `${prefix(end)}${axis}`;
		// Visio names the end's own trigger first; a stencil connector is written exactly as Visio's.
		const walk =
			end === 'end' && stencilTemplate(shape)
				? '_WALKGLUE(EndTrigger,BegTrigger,WalkPreference)'
				: VISIO_WALK_GLUE;
		const formula = glue.point === undefined ? walk : visioPointGlue(glue.target, glue.point);
		const node = local.get(name);
		if (node) node.setAttribute('F', formula);
		else
			setCell(
				shape,
				name,
				stencilTemplate(shape) ? effectiveNumber(effectiveCells(shape), name, 0) : 0,
				formula,
			);
	}
	let container = children(root, 'Connects')[0];
	if (!container) {
		container = doc.createElementNS(root.namespaceURI, 'Connects');
		root.insertBefore(container, children(root, 'Shapes')[0]!.nextSibling);
	}
	markPlaceable(topShape(root, glue.target));
	const row = doc.createElementNS(root.namespaceURI, 'Connect');
	for (const [name, value] of [
		['FromSheet', attribute(shape, 'ID')!],
		['FromCell', `${prefix(end)}X`],
		['FromPart', end === 'begin' ? '9' : '12'],
		['ToSheet', glue.target],
		['ToCell', glue.point === undefined ? 'PinX' : `Connections.X${glue.point + 1}`],
		['ToPart', glue.point === undefined ? '3' : String(100 + glue.point)],
	] as const)
		row.setAttribute(name, value);
	container.appendChild(row);
}

/** Turn a freshly drawn line into a native dynamic connector with Connect rows. */
export function glueNewConnector(root: Element, shape: Element, edit: LineCreate): void {
	if (!edit.connect && !edit.route) return;
	setCell(shape, 'ObjType', 2);
	setCell(shape, 'EndArrow', 4);
	// Right-angle and curved routes take their cells when the new connector is laid out.
	if (edit.route === 'straight') setRouteCells(shape, edit.route);
	for (const end of ENDS) {
		const glue = asGlue(edit.connect, end);
		if (glue) glueEnd(root, shape, end, glue);
		else setCell(shape, triggerName(end), 0);
	}
}

/** Prove a connector's Connect rows and glue formulas are the owned dynamic or point glue. */
export function proveConnector(root: Element, connectorId: string): ConnectorGlue {
	const shape = topShape(root, connectorId);
	// Visio's own Dynamic connector is a stencil instance: its glue cells are local, as here.
	if (isStencilConnector(shape)) proveStencilConnector(shape!);
	else if (shape?.hasAttribute('Master') || shape?.hasAttribute('MasterShape'))
		fail('UNSUPPORTED_GEOMETRY_EDIT', STENCIL_CONNECTOR);
	if (
		!shape ||
		(attribute(shape, 'Type') ?? 'Shape') !== 'Shape' ||
		children(shape, 'Shapes').length
	)
		fail('UNSUPPORTED_GEOMETRY_EDIT', UNSUPPORTED);
	const local = cells(shape);
	const formula = (name: string) => executableCellFormula(attribute(local.get(name), 'F'));
	const ends: Partial<Record<End, GlueEnd>> = {};
	for (const row of connectRows(root)) {
		if (attribute(row, 'FromSheet') !== connectorId) continue;
		const end = ENDS.find((value) => attribute(row, 'FromCell') === `${prefix(value)}X`);
		const target = attribute(row, 'ToSheet');
		const toCell = attribute(row, 'ToCell') ?? '';
		const point = /^Connections\.X([1-9]\d{0,4})$/.exec(toCell);
		const index = point ? Number(point[1]) - 1 : undefined;
		const glued = (axis: string) => {
			const source = formula(`${prefix(end!)}${axis}`) ?? '';
			if (!isNativeGlueCell(`${prefix(end!)}${axis}`, source)) return false;
			const named = visioPointGlueTarget(source);
			return index === undefined
				? !named
				: !!named && named.shapeId === target && named.index === index;
		};
		if (
			!end ||
			!target ||
			ends[end] !== undefined ||
			(index === undefined
				? toCell !== 'PinX' || attribute(row, 'ToPart') !== '3'
				: attribute(row, 'ToPart') !== String(100 + index)) ||
			visioGlueTriggerTarget(formula(triggerName(end))) !== target ||
			!glued('X') ||
			!glued('Y')
		)
			fail('UNSUPPORTED_GEOMETRY_EDIT', UNSUPPORTED);
		ends[end] = { target, ...(index === undefined ? {} : { point: index }) };
	}
	return { shape, ends };
}

/** Classify a geometry target: connectors glued to it, and whether it is itself glued. */
export function glueParticipants(
	root: Element,
	shapeId: string,
): { connectors: ConnectorGlue[]; connector?: ConnectorGlue } {
	const connectorIds = new Set<string>();
	let own = false;
	for (const row of connectRows(root)) {
		if (attribute(row, 'ToSheet') === shapeId) connectorIds.add(attribute(row, 'FromSheet') ?? '');
		if (attribute(row, 'FromSheet') === shapeId) own = true;
	}
	if (own && connectorIds.size) fail('UNSUPPORTED_GEOMETRY_EDIT', UNSUPPORTED);
	return {
		connectors: [...connectorIds].map((id) => proveConnector(root, id)),
		...(own ? { connector: proveConnector(root, shapeId) } : {}),
	};
}

/** Detach connector ends: values stay, formulas, triggers and Connect rows go (Visio's unglue). */
export function unglueConnector(root: Element, glue: ConnectorGlue, ends: readonly End[]): void {
	const id = attribute(glue.shape, 'ID');
	for (const end of ends) {
		if (glue.ends[end] === undefined) continue;
		const local = cells(glue.shape);
		if (stencilTemplate(glue.shape)) {
			// As Visio: the end keeps its value without the glue formula; the trigger is left as it is.
			for (const axis of ['X', 'Y']) local.get(`${prefix(end)}${axis}`)?.removeAttribute('F');
		} else {
			for (const axis of ['X', 'Y'])
				setCell(glue.shape, `${prefix(end)}${axis}`, numeric(local.get(`${prefix(end)}${axis}`)));
			setCell(glue.shape, triggerName(end), 0);
		}
		for (const row of connectRows(root))
			if (attribute(row, 'FromSheet') === id && attribute(row, 'FromCell') === `${prefix(end)}X`)
				row.parentNode!.removeChild(row);
		delete glue.ends[end];
	}
	for (const container of children(root, 'Connects'))
		if (!children(container, 'Connect').length) root.removeChild(container);
}

/** Before deletion: drop removed connectors' rows and unglue retained connectors from removed shapes. */
export function releaseDeletedGlue(
	roots: ReadonlyMap<string, Element>,
	removed: ReadonlyMap<string, ReadonlySet<string>>,
): void {
	for (const [pageId, ids] of removed) {
		const root = roots.get(pageId);
		if (!root) continue;
		const touched = new Set<string>();
		for (const row of connectRows(root)) {
			const from = attribute(row, 'FromSheet') ?? '',
				to = attribute(row, 'ToSheet') ?? '';
			if (ids.has(from) || ids.has(to)) touched.add(from);
		}
		for (const connectorId of touched) {
			let glue: ConnectorGlue;
			try {
				glue = proveConnector(root, connectorId);
			} catch {
				// Foreign glue is not healed by guessing; the shared delete guard reports it.
				fail('EDIT_REFERENCED_DELETE', 'Shape participates in a Connect record.');
			}
			unglueConnector(
				root,
				glue,
				ids.has(connectorId) ? ENDS : ENDS.filter((end) => ids.has(glue.ends[end]?.target ?? '')),
			);
		}
	}
}
