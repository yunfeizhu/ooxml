import {
	instanceSheet,
	instanceTarget,
	type InstanceCell,
	type InstanceSheet,
} from './edit-instance-sheet';
import type { MasterTemplate } from './edit-text-instance';
import { fail, VisioPackageError } from './package-common';
import { attribute, children } from './sheet';

/** Sub-shapes of one group instance this editor recalculates; a larger group is refused. */
const MAX_MEMBERS = 2_000;

/**
 * The sheets one edit of a stencil instance can reach: the instance itself and, for an instance
 * of a group master, every sub-shape at any depth. A master's formulas name the master's shape
 * IDs (`Sheet.5!Width`), a formula written on the page names the page's (`Sheet.12!Width`);
 * `resolve` maps both onto the instance's sheets.
 */
export interface InstanceScope {
	root: InstanceSheet;
	sheets: readonly InstanceSheet[];
	cells: readonly InstanceCell[];
	owner(cell: InstanceCell): InstanceSheet;
	/** `local`: the formula was written on the page, so `shapeId` is a page shape ID. */
	resolve(
		from: InstanceCell,
		name: string,
		shapeId: string | undefined,
		local: boolean,
	): InstanceCell | undefined;
}

function scopeOf(
	sheets: readonly InstanceSheet[],
	byMaster: ReadonlyMap<string, InstanceSheet>,
): InstanceScope {
	const owners = new Map<InstanceCell, InstanceSheet>();
	const byPage = new Map<string, InstanceSheet>();
	for (const sheet of sheets) {
		const id = attribute(sheet.instance, 'ID');
		if (id !== undefined) byPage.set(id, sheet);
		for (const cell of sheet.cells) owners.set(cell, sheet);
	}
	const owner = (cell: InstanceCell) => owners.get(cell) ?? sheets[0]!;
	return {
		root: sheets[0]!,
		sheets,
		cells: sheets.flatMap((sheet) => sheet.cells),
		owner,
		resolve(from, name, shapeId, local) {
			const sheet = shapeId === undefined ? owner(from) : (local ? byPage : byMaster).get(shapeId);
			return sheet?.byName.get(name.toLowerCase());
		},
	};
}

/** The scope of an instance of a single-shape master. */
export function singleScope(sheet: InstanceSheet): InstanceScope {
	const master = attribute(sheet.template, 'ID');
	return scopeOf([sheet], new Map(master === undefined ? [] : [[master, sheet]]));
}

const members = (shape: Element): Element[] =>
	children(shape, 'Shapes').flatMap((container) => children(container, 'Shape'));

/** Whether a top-level stencil instance is a group: it has sub-shapes of its own. */
export const isGroupInstance = (instance: Element): boolean =>
	attribute(instance, 'Type') === 'Group' || members(instance).length > 0;

/**
 * The scope of a top-level instance of a group master. A master with several top-level shapes
 * has no shape of its own for the group Visio makes on the drop: that group's cells are all
 * local, so its sheet is laid over an empty template.
 */
export async function groupScope(
	instance: Element,
	template: MasterTemplate,
	code = 'UNSUPPORTED_INSTANCE_EDIT',
): Promise<InstanceScope> {
	const masterId = attribute(instance, 'Master')!;
	const resolved = async (masterShapeId?: string): Promise<Element | undefined> => {
		try {
			return await template(masterId, masterShapeId);
		} catch (error) {
			if (error instanceof VisioPackageError && error.code === 'UNSUPPORTED_TEXT_EDIT')
				return undefined;
			throw error;
		}
	};
	const sheet = (node: Element, base: Element): InstanceSheet => {
		try {
			return instanceSheet(node, base, { group: true });
		} catch (error) {
			if (error instanceof VisioPackageError && error.code === 'UNSUPPORTED_INSTANCE_EDIT')
				fail(code, error.message);
			throw error;
		}
	};
	const sheets: InstanceSheet[] = [];
	const byMaster = new Map<string, InstanceSheet>();
	const add = (node: Element, base: Element) => {
		const item = sheet(node, base);
		sheets.push(item);
		const id = attribute(base, 'ID');
		if (id !== undefined) byMaster.set(id, item);
	};
	const rootTemplate = await resolved();
	if (!rootTemplate && !members(instance).length)
		fail(code, 'The master of this stencil shape cannot be resolved.');
	// No shape of the master stands behind the group of a master with several top-level shapes.
	add(
		instance,
		rootTemplate ?? instance.ownerDocument!.createElementNS(instance.namespaceURI, 'Shape'),
	);
	const pending = members(instance);
	while (pending.length) {
		const node = pending.shift()!;
		if (sheets.length >= MAX_MEMBERS) fail(code, 'The stencil shape has too many parts to change.');
		const masterShapeId = attribute(node, 'MasterShape');
		const base =
			masterShapeId === undefined || node.hasAttribute('Master')
				? undefined
				: await resolved(masterShapeId);
		if (!base) fail(code, 'The stencil shape holds a part that does not come from its master.');
		add(node, base);
		pending.push(...members(node));
	}
	return scopeOf(sheets, byMaster);
}

/** The scope of the top-level stencil instance `shapeId`: one sheet, or a group's. */
export async function instanceScope(
	root: Element,
	shapeId: string,
	template: MasterTemplate,
	code = 'UNSUPPORTED_INSTANCE_EDIT',
): Promise<InstanceScope | undefined> {
	const containers = children(root, 'Shapes');
	const candidates =
		containers.length === 1
			? children(containers[0], 'Shape').filter((shape) => attribute(shape, 'ID') === shapeId)
			: [];
	const instance = candidates.length === 1 ? candidates[0]! : undefined;
	if (!instance || !instance.hasAttribute('Master')) return undefined;
	if (isGroupInstance(instance)) return groupScope(instance, template, code);
	const target = await instanceTarget(root, shapeId, template, code);
	return target && singleScope(instanceSheet(target.instance, target.template));
}
