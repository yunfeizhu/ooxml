import { visioFormulaCachedValue } from './formula';
import { attribute, children } from './sheet';
import { cells, numeric, isLineSheet, assertLengthTransformCells } from './edit-geometry-admission';
import { fail } from './package-common';
import type { VisioGeometryEdit } from './edit-commands';

/**
 * Stencil instances proved to be 2D shapes of a resolvable master (`groupInstances`). Their
 * cells live in the master, so the local-cache proof below takes them as one opaque member.
 */
const stencilMembers = new WeakSet<Element>();
export const markStencilMember = (shape: Element): void => void stencilMembers.add(shape);
export const isStencilMember = (shape: Element): boolean => stencilMembers.has(shape);

/** Prove a local 2D sheet tree without unproved masters, lines or foreign objects; returns its IDs. */
export function proveLocalShapeTree(top: Element, check: () => void): Set<string> {
	const pending = [top],
		ids = new Set<string>();
	while (pending.length) {
		check();
		const shape = pending.pop()!;
		if (stencilMembers.has(shape)) {
			const inner = [shape];
			while (inner.length) {
				const node = inner.pop()!;
				const id = attribute(node, 'ID');
				if (!id || ids.has(id) || ids.size >= 10000)
					fail('UNSUPPORTED_GEOMETRY_EDIT', 'A stencil shape in the group has invalid sheet IDs.');
				ids.add(id);
				for (const container of children(node, 'Shapes'))
					inner.push(...children(container, 'Shape'));
			}
			continue;
		}
		const id = attribute(shape, 'ID');
		const local = cells(shape),
			containers = children(shape, 'Shapes');
		const descendants = containers.flatMap((container) => children(container, 'Shape'));
		if (
			!id ||
			ids.has(id) ||
			ids.size >= 10000 ||
			shape.hasAttribute('Master') ||
			shape.hasAttribute('MasterShape') ||
			['1', 'true'].includes(attribute(shape, 'Del') ?? '') ||
			children(shape, 'ForeignData').length ||
			children(shape, 'Rel').length ||
			containers.length > 1 ||
			isLineSheet(local) ||
			(descendants.length
				? attribute(shape, 'Type') !== 'Group'
				: attribute(shape, 'Type') !== 'Shape')
		)
			fail(
				'UNSUPPORTED_GEOMETRY_EDIT',
				'Group transforms require a local unglued 2D tree without masters or foreign objects.',
			);
		ids.add(id);
		for (const name of [
			'PinX',
			'PinY',
			'Width',
			'Height',
			'LocPinX',
			'LocPinY',
			'Angle',
			'FlipX',
			'FlipY',
		]) {
			const cell = local.get(name);
			if (cell?.hasAttribute('E') || attribute(cell, 'F')?.trim().toLowerCase() === 'inh')
				fail('UNSUPPORTED_GEOMETRY_EDIT', 'Group transforms require local error-free caches.');
		}
		assertLengthTransformCells(local);
		const angleUnit = attribute(local.get('Angle'), 'U');
		if (angleUnit && visioFormulaCachedValue('0', angleUnit).unit !== 'angle')
			fail('EDIT_FORMULA_UNIT', 'Group descendant angles require angular units.');
		for (const name of ['FlipX', 'FlipY']) {
			const flag = local.get(name),
				unit = attribute(flag, 'U');
			if (
				![0, 1].includes(numeric(flag, 0)) ||
				(unit && visioFormulaCachedValue('0', unit).unit !== 'scalar')
			)
				fail('EDIT_FORMULA_UNIT', 'Group descendant flip flags must be scalar booleans.');
		}

		if (!(numeric(local.get('Width')) > 0 && numeric(local.get('Height')) > 0))
			fail('UNSUPPORTED_GEOMETRY_EDIT', 'Group descendants require positive local dimensions.');
		for (const name of ['PinX', 'PinY', 'LocPinX', 'LocPinY', 'Angle']) numeric(local.get(name));
		pending.push(...descendants);
	}
	return ids;
}

/** Refuse a tree when a page Connect record names any of its sheets. */
export function assertUngluedTree(root: Element, ids: ReadonlySet<string>, message: string): void {
	for (const container of children(root, 'Connects'))
		for (const connection of children(container, 'Connect'))
			if (['FromSheet', 'ToSheet'].some((name) => ids.has(attribute(connection, name) ?? '')))
				fail('UNSUPPORTED_GEOMETRY_EDIT', message);
}

/** Authorize only a local group Angle leaf (rotation) or its explicit pins (move).
 * Descendants remain read-only and unsafe to recalculate.
 */
export function proveLocalGroupRotation(root: Element, edit: VisioGeometryEdit, check: () => void) {
	const groups = new Set<Element>(),
		angleCells = new Set<Element>();
	if (edit.type !== 'rotate-shape' && edit.type !== 'move-shape') return { groups, angleCells };
	const candidates = children(children(root, 'Shapes')[0], 'Shape').filter(
		(node) => attribute(node, 'ID') === edit.shapeId,
	);
	if (candidates.length !== 1 || attribute(candidates[0], 'Type') !== 'Group')
		return { groups, angleCells };
	const group = candidates[0]!;
	assertUngluedTree(
		root,
		proveLocalShapeTree(group, check),
		edit.type === 'move-shape'
			? 'Group moves cannot update glued descendant connections.'
			: 'Group rotation cannot update glued descendant connections.',
	);
	groups.add(group);
	if (edit.type === 'rotate-shape') angleCells.add(cells(group).get('Angle')!);
	else
		for (const name of ['PinX', 'PinY']) {
			const cell = cells(group).get(name);
			if (!cell) fail('UNSUPPORTED_GEOMETRY_EDIT', 'Group moves require explicit local pins.');
			angleCells.add(cell);
		}
	return { groups, angleCells };
}
