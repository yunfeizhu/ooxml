import { executableCellFormula } from './cell-formula';
import { connectRows } from './edit-connector';
import {
	assertInstanceUnlocked,
	instanceCell,
	instancePin,
	placeInstance,
	type StencilInstance,
} from './edit-instance-shape';
import { mapVisioFormulaSyntax } from './formula-source';
import type { VisioPackage } from './package';
import { fail } from './package-common';
import { attribute, children } from './sheet';

/**
 * Admit one stencil instance as the source of a copy and return where the copy's pin goes. Visio
 * duplicates the instance as it is: same master, same local cells, a new sheet ID and name. A
 * connector glued to the source stays with the source; the copy has no glue.
 */
export async function planInstanceCopy(
	pkg: VisioPackage,
	pageId: string,
	sourceRoot: Element,
	target: StencilInstance,
	offsetX: number,
	offsetY: number,
	code = 'UNSUPPORTED_DUPLICATE',
): Promise<{ x: number; y: number }> {
	const id = attribute(target.instance, 'ID');
	if (
		['BeginX', 'EndX'].some((name) => instanceCell(target, name)) ||
		connectRows(sourceRoot).some((row) => attribute(row, 'FromSheet') === id)
	)
		fail(code, 'Lines and connectors that come from a stencil cannot be copied yet.');
	await assertInstanceUnlocked(pkg, pageId, target, ['LockSelect'], 'selection');
	const pin = instancePin(target);
	const x = pin.x + offsetX,
		y = pin.y + offsetY;
	if (Math.abs(x) > 1e6 || Math.abs(y) > 1e6)
		fail(code, 'Duplicated pins exceed coordinate limits.');
	return { x, y };
}

/**
 * Finish a cloned instance: its sub-shapes (a group master) take the next free sheet IDs, with
 * the copy's own `Sheet.N!` references following, and the pin moves to (`x`, `y`).
 */
export function finishInstanceCopy(
	clone: Element,
	template: Element,
	x: number,
	y: number,
	taken: Set<string>,
	check: () => void,
): string[] {
	const mapping = new Map<string, string>();
	let next = 0;
	for (const id of taken) next = Math.max(next, Number(id) || 0);
	const pending = children(clone, 'Shapes').flatMap((container) => children(container, 'Shape'));
	while (pending.length) {
		check();
		const shape = pending.shift()!;
		const old = attribute(shape, 'ID');
		do next++;
		while (taken.has(String(next)));
		if (next > 0xffffffff) fail('LIMIT_DUPLICATE', 'The page has no free shape IDs.');
		const id = String(next);
		taken.add(id);
		if (old !== undefined) mapping.set(old, id);
		shape.setAttribute('ID', id);
		shape.removeAttribute('UniqueID');
		// Sub-shape names would collide with the source's; Visio names them again when it opens.
		shape.removeAttribute('Name');
		shape.removeAttribute('NameU');
		for (const container of children(shape, 'Shapes'))
			pending.push(...children(container, 'Shape'));
	}
	if (mapping.size)
		for (const node of Array.from(clone.getElementsByTagName('*'))) {
			const source = executableCellFormula(attribute(node, 'F'));
			if (!source || !/\bSheet\.\d+!/i.test(source)) continue;
			node.setAttribute(
				'F',
				mapVisioFormulaSyntax(source, (segment) =>
					segment.replace(/\bSheet\.(\d+)!/gi, (match, id: string) =>
						mapping.has(id) ? `Sheet.${mapping.get(id)}!` : match,
					),
				),
			);
		}
	placeInstance({ instance: clone, template }, x, y, check);
	return [...mapping.values()];
}
