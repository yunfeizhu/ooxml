import type { VisioEdit } from './edit-commands';
import {
	assertInstanceUnlocked,
	instanceView,
	pageShapes,
	shapeIsStructural,
	stencilInstance,
} from './edit-instance-shape';
import type { MasterTemplate } from './edit-text-instance';
import type { VisioPackage } from './package';
import { attribute } from './sheet';

/**
 * Whether any shape these reorder, group or ungroup commands act on is a container or a list
 * (by its own rows or its master's); see `assertShapeOrderPackageScope`.
 */
export async function orderTargetsAreStructural(
	roots: ReadonlyMap<string, Element>,
	commands: readonly VisioEdit[],
	template: MasterTemplate,
): Promise<boolean> {
	for (const command of commands) {
		const ids =
			command.type === 'reorder-shape' || command.type === 'ungroup-shape'
				? [command.shapeId]
				: command.type === 'group-shapes'
					? command.memberIds
					: [];
		const root = ids.length && 'pageId' in command ? roots.get(command.pageId) : undefined;
		for (const id of ids) {
			const shape = root && pageShapes(root).find((item) => attribute(item, 'ID') === id);
			if (!shape || (await shapeIsStructural(shape, template))) return true;
		}
	}
	return false;
}

/**
 * What ordering needs from the stencil instances of a page: for each one, a stand-in carrying
 * the display band and protection cells in effect (its own, else its master's). The shape being
 * moved must also not sit on a locked layer. Visio changes nothing but the position of the
 * shape among its siblings, for a stencil shape as for a drawn one.
 */
export async function instanceOrderViews(
	pkg: VisioPackage,
	pageId: string,
	root: Element,
	shapeId: string,
	template: MasterTemplate,
	check: () => void,
): Promise<Map<Element, Element>> {
	const views = new Map<Element, Element>();
	for (const shape of pageShapes(root)) {
		check();
		const id = attribute(shape, 'ID');
		if (id === undefined || !shape.hasAttribute('Master')) continue;
		const target = await stencilInstance(root, id, template, 'UNSUPPORTED_SHAPE_ORDER');
		if (!target) continue;
		if (id === shapeId) await assertInstanceUnlocked(pkg, pageId, target, [], 'reordering');
		views.set(shape, instanceView(target, ['DisplayLevel', 'LockSelect', 'LockFormat']));
	}
	return views;
}
