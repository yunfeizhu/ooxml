import { executableCellFormula } from './cell-formula';
import { assertInstanceLayersUnlocked } from './edit-instance-format';
import { assertOverridable, recalculateInstanceCaches } from './edit-instance-recalculate';
import { instanceSheet, writeInstanceCell, type InstanceCell } from './edit-instance-sheet';
import { isStructureSheet } from './edit-shape-order';
import type { MasterTemplate } from './edit-text-instance';
import { visioFormulaCachedValue } from './formula';
import type { VisioPackage } from './package';
import { fail, VisioPackageError } from './package-common';
import { attribute, children } from './sheet';

/**
 * Whole-shape commands on stencil (master) instances: what Delete, Duplicate, Paste, ordering,
 * grouping and layers need to know about a shape whose cells mostly live in its master. Recorded
 * with `scripts/record-visio-instance-shape.ps1`.
 */
export interface StencilInstance {
	instance: Element;
	/** The master's top-level shape. */
	template: Element;
}

const deleted = (node: Element) => ['1', 'true'].includes(attribute(node, 'Del') ?? '');

/** The top-level shapes of a page. */
export const pageShapes = (root: Element): Element[] =>
	children(root, 'Shapes').flatMap((container) => children(container, 'Shape'));

/** The top-level shape `shapeId` when it is a stencil instance, with its master shape. */
export async function stencilInstance(
	root: Element,
	shapeId: string,
	template: MasterTemplate,
	code = 'UNSUPPORTED_INSTANCE_EDIT',
): Promise<StencilInstance | undefined> {
	const matches = pageShapes(root).filter((shape) => attribute(shape, 'ID') === shapeId);
	const instance = matches.length === 1 ? matches[0]! : undefined;
	const masterId = instance && attribute(instance, 'Master');
	if (!instance || masterId === undefined) return undefined;
	if (deleted(instance)) fail(code, 'The stencil shape is deleted.');
	try {
		return { instance, template: await template(masterId) };
	} catch (error) {
		if (error instanceof VisioPackageError && error.code === 'UNSUPPORTED_TEXT_EDIT')
			fail(code, error.message);
		throw error;
	}
}

const cellNamed = (sheet: Element, name: string): Element | undefined => {
	const found = children(sheet, 'Cell').filter((cell) => attribute(cell, 'N') === name);
	if (found.length > 1) fail('EDIT_AMBIGUOUS_CELL', `Duplicate ${name} in a stencil shape.`);
	return found[0];
};

/** The cell in effect for a top-level cell name: the instance's own value, else the master's. */
export function instanceCell(target: StencilInstance, name: string): Element | undefined {
	const local = cellNamed(target.instance, name);
	return local?.hasAttribute('V') ? local : (cellNamed(target.template, name) ?? local);
}

/** A protection or state flag in effect; an error or non-number counts as set. */
export function instanceFlag(target: StencilInstance, name: string): number {
	const cell = instanceCell(target, name);
	if (!cell) return 0;
	if (cell.hasAttribute('E')) return 1;
	try {
		return visioFormulaCachedValue(attribute(cell, 'V') ?? '', attribute(cell, 'U')).value;
	} catch {
		return 1;
	}
}

/**
 * A detached stand-in for checks written for local shapes: the master shape's attributes with the
 * instance's own style references, and the cells in effect for `names`. Style inheritance then
 * resolves as it does for the instance.
 */
export function instanceView(target: StencilInstance, names: readonly string[]): Element {
	const view = target.template.cloneNode(false) as Element;
	for (const name of ['ID', 'LineStyle', 'FillStyle', 'TextStyle']) {
		const value = attribute(target.instance, name);
		if (value !== undefined) view.setAttribute(name, value);
	}
	for (const name of names) {
		const local = cellNamed(target.instance, name);
		const inherited = cellNamed(target.template, name);
		const cell = ((local?.hasAttribute('V') ? local : inherited) ?? local)?.cloneNode(true) as
			| Element
			| undefined;
		if (!cell) continue;
		// A local `Inh` cache keeps the master's formula with the instance's value.
		if (attribute(cell, 'F') === 'Inh') {
			const formula = attribute(inherited, 'F');
			if (formula !== undefined) cell.setAttribute('F', formula);
			else cell.removeAttribute('F');
		}
		view.appendChild(cell);
	}
	return view;
}

/** Refuse when the shape protects itself against `what`, or sits on a locked layer. */
export async function assertInstanceUnlocked(
	pkg: VisioPackage,
	pageId: string,
	target: StencilInstance,
	locks: readonly string[],
	what: string,
): Promise<void> {
	for (const lock of locks)
		if (instanceFlag(target, lock) !== 0)
			fail('EDIT_PROTECTED_CELL', `The stencil shape is protected against ${what}.`);
	await assertInstanceLayersUnlocked(
		pkg,
		pageId,
		attribute(cellNamed(target.instance, 'LayerMember'), 'V'),
	);
}

/**
 * Moving, resizing, rotating or flipping a stencil shape is refused while it sits on a locked
 * layer. The interface greys the commands out; this is the check for every other caller.
 */
export async function assertInstanceLayerUnlocked(
	pkg: VisioPackage,
	root: Element | undefined,
	pageId: string,
	shapeId: string,
): Promise<void> {
	const shape = root && pageShapes(root).find((item) => attribute(item, 'ID') === shapeId);
	if (shape)
		await assertInstanceLayersUnlocked(
			pkg,
			pageId,
			attribute(cellNamed(shape, 'LayerMember'), 'V'),
		);
}

/**
 * Whether a shape is a container or a list, by its own rows or its master's. A master that
 * cannot be read counts as one: the caller then keeps its strictest checks.
 */
export async function shapeIsStructural(
	shape: Element,
	template: MasterTemplate,
): Promise<boolean> {
	if (isStructureSheet(shape)) return true;
	const masterId = attribute(shape, 'Master');
	if (masterId === undefined) return false;
	try {
		return isStructureSheet(await template(masterId));
	} catch {
		return true;
	}
}

/** Every shape ID inside a shape, itself included. */
export function shapeIds(shape: Element): string[] {
	const ids: string[] = [];
	const pending = [shape];
	while (pending.length) {
		const node = pending.pop()!;
		const id = attribute(node, 'ID');
		if (id !== undefined) ids.push(id);
		for (const container of children(node, 'Shapes')) pending.push(...children(container, 'Shape'));
	}
	return ids;
}

const format = (value: number) => String(Object.is(value, -0) ? 0 : value);

/**
 * Put an instance's pin at (`x`, `y`): local PinX and PinY, and a refreshed `F="Inh"` cache for
 * every inherited cell that follows them. A group instance takes plain local pins, which is all
 * Visio writes for it; a pin the shape computes itself is refused.
 */
export function placeInstance(target: StencilInstance, x: number, y: number, check: () => void) {
	const refuse = (): never =>
		fail(
			'UNSUPPORTED_INSTANCE_EDIT',
			'The stencil shape computes its own position, so a copy cannot be placed.',
		);
	let sheet;
	try {
		sheet = instanceSheet(target.instance, target.template);
	} catch (error) {
		if (!(error instanceof VisioPackageError) || error.code !== 'UNSUPPORTED_INSTANCE_EDIT')
			throw error;
		// A group master: its members sit in the group's own coordinates and follow its pin.
		for (const [name, value] of [
			['PinX', x],
			['PinY', y],
		] as const) {
			const cell = cellNamed(target.instance, name);
			if (!cell || executableCellFormula(attribute(cell, 'F')) || attribute(cell, 'F') === 'Inh')
				refuse();
			cell!.setAttribute('V', format(value));
			cell!.removeAttribute('E');
		}
		return;
	}
	const overrides = new Map<InstanceCell, number>();
	const local = new Map<string, number>();
	for (const [name, value] of [
		['PinX', x],
		['PinY', y],
	] as const) {
		const cell = sheet.byName.get(name.toLowerCase());
		try {
			assertOverridable(cell, 'The position');
		} catch {
			refuse();
		}
		local.set(name, value);
		if (cell) overrides.set(cell, value);
	}
	const { writes } = recalculateInstanceCaches(sheet, overrides, check);
	for (const [name, value] of local) {
		const cell: InstanceCell = sheet.byName.get(name.toLowerCase()) ?? {
			names: [name.toLowerCase()],
			name,
			relative: false,
		};
		const created = !cell.local;
		const node = writeInstanceCell(sheet, cell, format(value));
		// Visio leaves a local pin bare.
		if (created) node.removeAttribute('U');
	}
	for (const write of writes) {
		check();
		const own = write.cell.local;
		if (own && executableCellFormula(attribute(own, 'F'))) {
			own.setAttribute('V', format(write.value));
			own.removeAttribute('E');
		} else writeInstanceCell(sheet, write.cell, format(write.value), { formula: 'Inh' });
	}
}

/** The pin in effect, in the coordinates of the instance's parent. */
export function instancePin(target: StencilInstance): { x: number; y: number } {
	const read = (name: string): number => {
		const cell = instanceCell(target, name);
		if (!cell || cell.hasAttribute('E'))
			fail('UNSUPPORTED_INSTANCE_EDIT', `The stencil shape has no usable ${name}.`);
		try {
			return visioFormulaCachedValue(attribute(cell, 'V') ?? '', attribute(cell, 'U')).value;
		} catch {
			return fail('UNSUPPORTED_INSTANCE_EDIT', `${name} of the stencil shape is not a number.`);
		}
	};
	return { x: read('PinX'), y: read('PinY') };
}
