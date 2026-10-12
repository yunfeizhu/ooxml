import { executableCellFormula } from './cell-formula';
import type { VisioConnectorRoute } from './edit-connector-commands';
import type { MasterTemplate } from './edit-text-instance';
import { visioFormulaCachedValue } from './formula';
import { fail, VisioPackageError } from './package-common';
import { attribute, children } from './sheet';

/**
 * Stencil (master) instances on the pages of one edit, with the single master shape each
 * inherits from. Masters are read asynchronously before the edits run, so the synchronous glue
 * and routing code can ask for a shape's master cells. Keyed by the page's shape element, which
 * lives only as long as the transaction that registered it.
 */
const templates = new WeakMap<Element, Element>();

const topShapes = (root: Element): Element[] => children(children(root, 'Shapes')[0], 'Shape');
const deleted = (node: Element) => ['1', 'true'].includes(attribute(node, 'Del') ?? '');
const plain = (shape: Element) =>
	['Shape', undefined].includes(attribute(shape, 'Type')) &&
	!children(shape, 'Shapes').length &&
	!children(shape, 'ForeignData').length &&
	!deleted(shape);

/**
 * Resolve the master of every top-level one-shape stencil instance on these pages. Instances
 * whose master cannot be merged exactly (groups, chained masters, pictures) are left out and
 * stay refused wherever a master is not allowed.
 */
export async function registerStencilShapes(
	roots: ReadonlyMap<string, Element>,
	template: MasterTemplate,
	check: () => void,
): Promise<void> {
	for (const root of roots.values())
		for (const shape of topShapes(root)) {
			const master = attribute(shape, 'Master');
			if (master === undefined || shape.hasAttribute('MasterShape') || !plain(shape)) continue;
			check();
			try {
				const source = await template(master);
				if (plain(source) && !source.hasAttribute('Master') && !source.hasAttribute('MasterShape'))
					templates.set(shape, source);
			} catch (error) {
				if (!(error instanceof VisioPackageError) || error.code.startsWith('LIMIT_')) throw error;
			}
		}
}

/** The master shape a registered stencil instance inherits from. */
export const stencilTemplate = (shape: Element | undefined): Element | undefined =>
	shape ? templates.get(shape) : undefined;

/** For tests and for shapes created during an edit (a dropped master instance). */
export function registerStencilShape(shape: Element, template: Element): void {
	templates.set(shape, template);
}

const cellMap = (parent: Element | undefined) =>
	new Map(children(parent, 'Cell').map((node) => [attribute(node, 'N') ?? '', node]));

/** The cells in effect on a shape: its master's, overridden by local cells that carry a value. */
export function effectiveCells(shape: Element): Map<string, Element> {
	const result = cellMap(templates.get(shape));
	for (const [name, node] of cellMap(shape)) if (node.hasAttribute('V')) result.set(name, node);
	return result;
}

/** A cached number of an effective cell, or the fallback when the cell is absent. */
export function effectiveNumber(
	cells: ReadonlyMap<string, Element>,
	name: string,
	fallback?: number,
): number {
	const node = cells.get(name);
	if (!node && fallback !== undefined) return fallback;
	if (!node || node.hasAttribute('E'))
		fail('UNSUPPORTED_GEOMETRY_EDIT', `The stencil shape has no usable ${name}.`);
	const value = visioFormulaCachedValue(attribute(node, 'V') ?? '', attribute(node, 'U')).value;
	if (!Number.isFinite(value) || Math.abs(value) > 1e6)
		fail('UNSUPPORTED_GEOMETRY_EDIT', `${name} of the stencil shape is out of range.`);
	return value;
}

const sectionRows = (shape: Element | undefined, name: string) =>
	children(shape, 'Section')
		.filter((section) => attribute(section, 'N') === name && !deleted(section))
		.flatMap((section) => children(section, 'Row'));

/** The effective rows of a section by zero-based IX: master cells with local overrides merged in. */
export function effectiveRows(shape: Element, section: string): Map<number, Map<string, Element>> {
	const rows = new Map<number, Map<string, Element>>();
	const gone = new Set<number>();
	for (const source of [templates.get(shape), shape])
		for (const row of sectionRows(source, section)) {
			const index = Number(attribute(row, 'IX') ?? '0');
			if (deleted(row)) {
				gone.add(index);
				continue;
			}
			gone.delete(index);
			const merged = rows.get(index) ?? new Map<string, Element>();
			for (const [name, node] of cellMap(row)) if (node.hasAttribute('V')) merged.set(name, node);
			rows.set(index, merged);
		}
	for (const index of gone) rows.delete(index);
	return rows;
}

const END_CELLS = ['BeginX', 'BeginY', 'EndX', 'EndY'] as const;
const normal = (source: string | undefined) =>
	executableCellFormula(source)?.replace(/\s+/g, '').toLowerCase();

/** Visio's Dynamic connector master: a transform that follows the ends, and one open path. */
const MASTER_FORM: readonly (readonly [string, readonly string[]])[] = [
	['PinX', ['guard((beginx+endx)/2)']],
	['PinY', ['guard((beginy+endy)/2)']],
	['Width', ['guard(endx-beginx)']],
	['Height', ['guard(endy-beginy)']],
	['LocPinX', ['guard(width*0.5)']],
	['LocPinY', ['guard(height*0.5)']],
	['TxtPinX', ['setatref(controls.textposition)']],
	['TxtPinY', ['setatref(controls.textposition.y)']],
];
/** Local forms of the cells Visio rewrites when it lays the connector out. */
const LOCAL_FORM: Readonly<Record<string, readonly string[]>> = {
	PinX: ['inh'],
	PinY: ['inh'],
	LocPinX: ['inh'],
	LocPinY: ['inh'],
	TxtPinX: ['inh'],
	TxtPinY: ['inh'],
	Width: ['inh', 'guard(endx-beginx)', 'guard(0.25dl)'],
	Height: ['inh', 'guard(endy-beginy)', 'guard(0.25dl)'],
};

function masterIsDynamicConnector(template: Element): boolean {
	const cells = cellMap(template);
	if (!END_CELLS.every((name) => cells.has(name))) return false;
	if (
		!MASTER_FORM.every(([name, forms]) =>
			forms.includes(normal(attribute(cells.get(name), 'F')) ?? ''),
		)
	)
		return false;
	for (const name of ['Angle', 'FlipX', 'FlipY']) {
		const node = cells.get(name);
		if (node && Number(attribute(node, 'V') ?? '0') !== 0) return false;
	}
	const geometry = children(template, 'Section').filter(
		(node) => attribute(node, 'N') === 'Geometry',
	);
	if (geometry.length !== 1 || deleted(geometry[0]!)) return false;
	const rows = children(geometry[0]!, 'Row');
	if (
		!rows.length ||
		attribute(rows[0]!, 'T') !== 'MoveTo' ||
		rows.some(
			(row, index) =>
				attribute(row, 'IX') !== String(index + 1) ||
				deleted(row) ||
				(index > 0 && attribute(row, 'T') !== 'LineTo') ||
				children(row, 'Cell').some((cell) => executableCellFormula(attribute(cell, 'F'))),
		)
	)
		return false;
	const control = sectionRows(template, 'Control').filter(
		(row) => attribute(row, 'N') === 'TextPosition',
	);
	if (control.length !== 1) return false;
	const position = cellMap(control[0]!);
	return (
		normal(attribute(position.get('XDyn'), 'F')) === 'controls.textposition' &&
		normal(attribute(position.get('YDyn'), 'F')) === 'controls.textposition.y'
	);
}

/** A registered stencil instance of a 1-D master (a connector or line from a stencil). */
export function isStencilConnector(shape: Element | undefined): boolean {
	const template = stencilTemplate(shape);
	return !!template && END_CELLS.some((name) => cellMap(template).has(name));
}

export const STENCIL_CONNECTOR_FORM =
	"This connector comes from a stencil and is not built like Visio's Dynamic connector, so it cannot be rerouted here; it and the shapes glued to it cannot be moved or resized.";

/**
 * Prove a stencil connector is an instance of Visio's Dynamic connector whose local cells are
 * the ones Visio writes when it lays the connector out, so writing that form again loses nothing.
 */
export function proveStencilConnector(shape: Element): Element {
	const template = stencilTemplate(shape);
	const refuse = (): never => fail('UNSUPPORTED_GEOMETRY_EDIT', STENCIL_CONNECTOR_FORM);
	if (!template || !masterIsDynamicConnector(template)) return refuse();
	const local = cellMap(shape);
	for (const [name, forms] of Object.entries(LOCAL_FORM)) {
		const node = local.get(name);
		if (!node) continue;
		const source = attribute(node, 'F');
		if (
			node.hasAttribute('E') ||
			!forms.includes(source === 'Inh' ? 'inh' : (normal(source) ?? ''))
		)
			refuse();
	}
	for (const name of ['Angle', 'FlipX', 'FlipY']) if (local.has(name)) refuse();
	for (const section of children(shape, 'Section')) {
		const name = attribute(section, 'N');
		if (name === 'Geometry') {
			if (deleted(section) || (attribute(section, 'IX') ?? '0') !== '0') refuse();
			// Section cells (NoFill, NoShow) may be local; rows are rewritten.
		} else if (name === 'Control') {
			for (const row of children(section, 'Row'))
				if (attribute(row, 'N') !== 'TextPosition' || deleted(row)) refuse();
		}
	}
	return template;
}

/** A stencil connector's route: Visio's Dynamic connector is right-angle unless its cells say otherwise. */
export function stencilConnectorRoute(shape: Element): VisioConnectorRoute {
	const cells = effectiveCells(shape);
	if (effectiveNumber(cells, 'ConLineRouteExt', 0) === 2) return 'curved';
	return effectiveNumber(cells, 'ShapeRouteStyle', 0) === 16 ? 'straight' : 'right-angle';
}
