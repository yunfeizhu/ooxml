import type { VisioShapeOrderEdit } from './edit-commands';
import { assertShapeLocks, assertUnlayeredShape, effectiveShapeCell } from './edit-style-admission';
import { executableCellFormula } from './cell-formula';
import { analyzeVisioFormula, evaluateVisioFormula, visioFormulaCachedValue } from './formula';
import { fail } from './package-common';
import { attribute, children } from './sheet';
import type { VisioPackage } from './package';
import {
	isKnownVisioFunction,
	visioFormulaFunctions,
	VISIO_STRUCTURE_FUNCTIONS,
	VISIO_TEXT_REFERENCE_FUNCTIONS,
} from './formula-functions';

/** A container or a list: Visio marks both with a `User.msvStructureType` row. */
export function isStructureSheet(shape: Element | undefined): boolean {
	if (!shape) return false;
	return [shape, ...Array.from(shape.getElementsByTagName('*'))].some(
		(node) =>
			node.localName === 'Row' &&
			attribute(node, 'N') === 'msvStructureType' &&
			attribute(node.parentNode as Element, 'N') === 'User',
	);
}

/**
 * What a change of stacking order, or a new shape, can disturb elsewhere in the package. The
 * masters of Visio's own stencils use SETATREF, SHAPETEXT, CONTAINERSHEETREF and event functions
 * in every drawing, so a blanket refusal of such formulas would refuse every real file. Refused:
 * a function this editor has never heard of, a reference built from text (INDIRECT), and, when
 * the shape concerned is itself a container or a list (`structural`), any lookup through
 * containers, whose result can depend on how containers are stacked.
 */
export async function assertShapeOrderPackageScope(
	pkg: VisioPackage,
	check: () => void,
	structural = true,
): Promise<void> {
	const refuse = (message: string): never => fail('UNSUPPORTED_SHAPE_ORDER', message);
	for (const path of pkg.paths()) {
		if (!/^visio\/.*\.xml$/i.test(path)) continue;
		const pending = [await pkg.readXml(path)];
		while (pending.length) {
			check();
			const node = pending.pop()!;
			const source = executableCellFormula(attribute(node, 'F'));
			for (const name of source ? visioFormulaFunctions(source) : []) {
				if (!isKnownVisioFunction(name))
					refuse(`A formula in this drawing uses ${name}, a function this editor does not know.`);
				if (VISIO_TEXT_REFERENCE_FUNCTIONS.has(name))
					refuse('A formula in this drawing builds a cell reference from text.');
				if (structural && VISIO_STRUCTURE_FUNCTIONS.has(name))
					refuse('Formulas in this drawing look shapes up through their containers.');
			}
			for (const child of Array.from(node.childNodes))
				if (child.nodeType === 1) pending.push(child as Element);
		}
	}
}

/** Ordering is limited to the ordinary display band until native band transitions are proven. */
function ordinaryDisplayBand(shape: Element, document: Element): void {
	for (const category of ['LineStyle', 'FillStyle', 'TextStyle'] as const) {
		const node = effectiveShapeCell(shape, document, 'DisplayLevel', category);
		if (!node) continue;
		const cached = visioFormulaCachedValue(attribute(node, 'V') ?? '', attribute(node, 'U'));
		if (node.hasAttribute('E') || cached.unit !== 'scalar' || cached.value !== 0)
			fail('UNSUPPORTED_SHAPE_ORDER', 'Only the ordinary zero display band can be reordered.');
		const source = executableCellFormula(attribute(node, 'F'));
		if (!source) continue;
		const analysis = analyzeVisioFormula(source);
		if (analysis.dynamic || analysis.references.length || analysis.unsupportedFunctions.length)
			fail('UNSUPPORTED_SHAPE_ORDER', 'Display band formulas must be constant.');
		const result = evaluateVisioFormula(source, () =>
			fail('UNSUPPORTED_SHAPE_ORDER', 'Display band dependencies cannot be resolved.'),
		);
		if (result.unit !== 'scalar' || result.value !== cached.value)
			fail('UNSUPPORTED_SHAPE_ORDER', 'Display band formula cache is stale.');
	}
}

/**
 * Move an intact shape node among its siblings; identifiers, connections, geometry and text stay
 * unchanged. The target is a local ordinary shape or a stencil instance; its siblings may be
 * anything (groups, pictures, Visio's Dynamic connectors) as long as every one sits in the
 * ordinary display band. `views` gives each stencil instance the cells it inherits from its
 * master (`instanceOrderViews`), since its own XML carries almost none.
 */
export function reorderVisioShape(
	root: Element,
	document: Element,
	edit: VisioShapeOrderEdit,
	check: () => void,
	views: ReadonlyMap<Element, Element> = new Map(),
): boolean {
	check();
	const containers = children(root, 'Shapes');
	if (containers.length !== 1)
		fail('UNSUPPORTED_SHAPE_ORDER', 'One local Shapes container is required.');
	const container = containers[0]!;
	const siblings = children(container, 'Shape');
	const ids = new Set<string>();
	for (const shape of siblings) {
		check();
		const id = attribute(shape, 'ID');
		if (!id || ids.has(id)) fail('INVALID_SHAPE_ID', 'Shape IDs must be present and unique.');
		ids.add(id);
		if (shape.hasAttribute('MasterShape') || (shape.hasAttribute('Master') && !views.has(shape)))
			fail('UNSUPPORTED_SHAPE_ORDER', 'A stencil shape on this page cannot be resolved.');
		ordinaryDisplayBand(views.get(shape) ?? shape, document);
	}
	const index = siblings.findIndex((shape) => attribute(shape, 'ID') === edit.shapeId);
	if (index < 0) fail('EDIT_TARGET_NOT_FOUND', 'A top-level local shape is required.');
	const target = siblings[index]!;
	const view = views.get(target);
	if (
		!view &&
		(target.hasAttribute('Del') ||
			children(target, 'Shapes').length ||
			children(target, 'ForeignData').length ||
			children(target, 'Rel').length ||
			(attribute(target, 'Type') !== undefined && attribute(target, 'Type') !== 'Shape'))
	)
		fail('UNSUPPORTED_SHAPE_ORDER', 'Groups and pictures cannot be reordered yet.');
	assertShapeLocks(view ?? target, document, ['LockSelect', 'LockFormat']);
	// A stencil shape sits on its stencil's layer; the caller checked that layer is not locked.
	if (!view) assertUnlayeredShape(target, document);
	const destination =
		edit.order === 'front'
			? siblings.length - 1
			: edit.order === 'back'
				? 0
				: edit.order === 'forward'
					? Math.min(siblings.length - 1, index + 1)
					: Math.max(0, index - 1);
	if (destination === index) return false;
	const anchor = siblings[destination]!;
	container.insertBefore(target, destination > index ? anchor.nextSibling : anchor);
	return true;
}
