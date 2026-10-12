import { executableCellFormula } from './cell-formula';
import type { VisioEdit } from './edit-commands';
import { markStencilMember } from './edit-group-rotation';
import { assertInstanceLayersUnlocked } from './edit-instance-format';
import {
	instanceCell,
	instanceFlag,
	instanceView,
	pageShapes,
	type StencilInstance,
} from './edit-instance-shape';
import type { MasterTemplate } from './edit-text-instance';
import { visioFormulaFunctions } from './formula-functions';
import type { VisioPackage } from './package';
import { fail, VisioPackageError } from './package-common';
import { attribute, children } from './sheet';

/** Functions whose value depends on which sheet is the parent: grouping changes it. */
export const VISIO_PARENT_FUNCTIONS: ReadonlySet<string> = new Set([
	'PARENT',
	'PAR',
	'LOCTOPAR',
	'ANGLETOPAR',
	'LOCTOLOC',
	'ANGLETOLOC',
]);

/** The transform cells a group needs from a member, in effect for a stencil instance. */
const TRANSFORM = [
	'PinX',
	'PinY',
	'Width',
	'Height',
	'LocPinX',
	'LocPinY',
	'Angle',
	'FlipX',
	'FlipY',
] as const;

/** A stencil member of a group, with a stand-in that carries its transform cells in effect. */
export interface GroupInstance extends StencilInstance {
	view: Element;
}

async function prove(
	pkg: VisioPackage,
	pageId: string,
	instance: Element,
	template: MasterTemplate,
	/** Grouping or ungrouping changes the member's parent; moving its group does not. */
	regroup: boolean,
): Promise<GroupInstance> {
	const refuse = (message: string): never => fail('UNSUPPORTED_GROUP_EDIT', message);
	if (['1', 'true'].includes(attribute(instance, 'Del') ?? ''))
		refuse('A stencil shape is deleted.');
	let master: Element;
	try {
		master = await template(attribute(instance, 'Master')!);
	} catch (error) {
		if (!(error instanceof VisioPackageError) || error.code.startsWith('LIMIT_')) throw error;
		return refuse('The master of a stencil shape cannot be resolved.');
	}
	const target = { instance, template: master };
	if (['BeginX', 'EndX'].some((name) => instanceCell(target, name)))
		refuse('Lines and connectors that come from a stencil cannot be part of a group yet.');
	const layers = children(instance, 'Cell').find((cell) => attribute(cell, 'N') === 'LayerMember');
	await assertInstanceLayersUnlocked(pkg, pageId, attribute(layers, 'V'));
	if (regroup) {
		if (instanceFlag(target, 'LockGroup') !== 0)
			fail('EDIT_PROTECTED_CELL', 'The stencil shape is protected against grouping.');
		// A master formula that reads its parent sheet would change value with the new parent.
		for (const node of [master, ...Array.from(master.getElementsByTagName('*'))]) {
			const source = executableCellFormula(attribute(node, 'F'));
			if (source && visioFormulaFunctions(source).some((name) => VISIO_PARENT_FUNCTIONS.has(name)))
				refuse('The stencil shape computes cells from the sheet it sits in.');
		}
	}
	const view = instanceView(target, TRANSFORM);
	if (
		!TRANSFORM.slice(0, 4).every((name) =>
			children(view, 'Cell').some((cell) => attribute(cell, 'N') === name),
		)
	)
		refuse('A stencil shape has no size or position to group.');
	markStencilMember(instance);
	return { ...target, view };
}

/** The stencil instances inside a shape tree; their own sub-shapes belong to them. */
function instancesIn(top: Element): Element[] {
	const found: Element[] = [];
	const pending = [top];
	while (pending.length) {
		const shape = pending.pop()!;
		if (shape.hasAttribute('Master')) {
			found.push(shape);
			continue;
		}
		for (const container of children(shape, 'Shapes'))
			pending.push(...children(container, 'Shape'));
	}
	return found;
}

/**
 * The stencil instances that group, ungroup, move or rotate commands reach: members to be
 * grouped, and the instances inside a group that is ungrouped, moved or rotated. Each is proved
 * to be a 2D shape of a resolvable master, free to group and off locked layers. Visio keeps a
 * grouped stencil shape an instance of its master, and so does this editor.
 */
export async function groupInstances(
	pkg: VisioPackage,
	roots: ReadonlyMap<string, Element>,
	commands: readonly VisioEdit[],
	template: MasterTemplate,
	check: () => void,
): Promise<Map<Element, GroupInstance>> {
	const result = new Map<Element, GroupInstance>();
	for (const command of commands) {
		check();
		const grouping = command.type === 'group-shapes';
		if (
			!grouping &&
			command.type !== 'ungroup-shape' &&
			command.type !== 'move-shape' &&
			command.type !== 'rotate-shape'
		)
			continue;
		const root = roots.get(command.pageId);
		if (!root) continue;
		const ids = new Set(grouping ? command.memberIds : [command.shapeId]);
		for (const shape of pageShapes(root)) {
			if (!ids.has(attribute(shape, 'ID') ?? '')) continue;
			// A top-level instance that is moved or rotated takes the instance path, not this one.
			const instances = shape.hasAttribute('Master')
				? grouping
					? [shape]
					: []
				: instancesIn(shape);
			const regroup = grouping || command.type === 'ungroup-shape';
			for (const instance of instances)
				if (!result.has(instance))
					result.set(instance, await prove(pkg, command.pageId, instance, template, regroup));
		}
	}
	return result;
}
