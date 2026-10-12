import { fail } from './package-common';
import { attribute, children } from './sheet';
import { assertShapeLocks } from './edit-style-admission';

/** A text edit target and its master linkage, when it is a stencil (master) instance. */
export interface TextTarget {
	node: Element;
	/** The `Master` ID of the instance this shape is, or belongs to. */
	masterId?: string;
	/** The `MasterShape` ID of a sub-shape inside a group instance. */
	masterShapeId?: string;
}

/** Find a shape on the page with its master linkage; deleted shapes are refused. */
export function textTarget(root: Element, shapeId: string, check: () => void): TextTarget {
	const shapeChildren = (parent: Element): Element[] => {
		const containers = children(parent, 'Shapes');
		if (containers.length > 1)
			fail('INVALID_SHAPE_ID', 'Duplicate Shapes containers are ambiguous.');
		return children(containers[0], 'Shape');
	};
	interface Item {
		node: Element;
		masterId: string | undefined;
		deleted: boolean;
	}
	const shapes = new Map<string, Item>();
	const pending: Item[] = shapeChildren(root).map((node) => ({
		node,
		masterId: undefined,
		deleted: false,
	}));
	while (pending.length) {
		check();
		const item = pending.pop()!,
			id = attribute(item.node, 'ID');
		if (!id || shapes.has(id))
			fail('INVALID_SHAPE_ID', 'Local shape IDs must be present and unique.');
		const masterId = attribute(item.node, 'Master') ?? item.masterId;
		const deleted = item.deleted || ['1', 'true'].includes(attribute(item.node, 'Del') ?? '');
		shapes.set(id, { node: item.node, masterId, deleted });
		for (const node of shapeChildren(item.node)) pending.push({ node, masterId, deleted });
	}
	const target = shapes.get(shapeId);
	if (!target) fail('EDIT_TARGET_NOT_FOUND', 'Local shape does not exist.');
	if (target.deleted) fail('UNSUPPORTED_TEXT_EDIT', 'Deleted shapes cannot be edited.');
	const masterShapeId = attribute(target.node, 'MasterShape');
	if (masterShapeId !== undefined && target.masterId === undefined)
		fail('UNSUPPORTED_TEXT_EDIT', 'The shape refers to a master that is not on this page.');
	return {
		node: target.node,
		...(target.masterId !== undefined ? { masterId: target.masterId } : {}),
		...(masterShapeId !== undefined ? { masterShapeId } : {}),
	};
}

/** Shared source target identity and effective text protection proof for a local shape. */
export function localTextTarget(
	root: Element,
	document: Element,
	shapeId: string,
	check: () => void,
): Element {
	const target = textTarget(root, shapeId, check);
	if (target.masterId !== undefined)
		fail('UNSUPPORTED_TEXT_EDIT', 'Text ranges and fields of stencil shapes cannot be edited.');
	assertShapeLocks(target.node, document, ['LockTextEdit']);
	return target.node;
}
