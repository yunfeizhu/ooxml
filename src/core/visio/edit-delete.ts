import type { VisioGeometryEdit } from './edit-commands';
import { admitted, cells, numeric, protectedShape } from './edit-geometry-admission';
import { fail } from './package-common';
import { assertVisioShapesUnreferenced } from './edit-recalculate';
import { releaseDeletedGlue } from './edit-connector';
import { releaseStencilGlue } from './edit-instance-delete';
import { pageShapes, shapeIds } from './edit-instance-shape';
import { attribute, children, VISIO_NS, VISIO_LEGACY_NS } from './sheet';

export type VisioShapeDelete = Extract<VisioGeometryEdit, { type: 'delete-shape' }>;

/** Pure deletion transactions remove reference-closed local leaves after complete admission.
 * Retained formulas and caches are unchanged. `instances` are stencil shapes the caller proved
 * deletable (`admitInstanceDeletes`): they go whole, sub-shapes included, and a stencil connector
 * glued to a deleted shape is released as Visio releases it.
 */
export function deleteVisioShapes(
	roots: ReadonlyMap<string, Element>,
	document: Element,
	edits: readonly VisioShapeDelete[],
	check: () => void,
	instances: ReadonlySet<Element> = new Set(),
): readonly string[] {
	const removed = new Map<string, Set<string>>();
	const shapes: Element[] = [];
	for (const edit of edits) {
		check();
		const ids = removed.get(edit.pageId) ?? new Set<string>();
		if (ids.has(edit.shapeId)) fail('INVALID_EDIT', 'A deletion target must occur only once.');
		ids.add(edit.shapeId);
		removed.set(edit.pageId, ids);
		const root = roots.get(edit.pageId);
		if (!root) fail('EDIT_TARGET_NOT_FOUND', 'Page does not exist.');
		const instance = pageShapes(root).find(
			(shape) => attribute(shape, 'ID') === edit.shapeId && instances.has(shape),
		);
		if (instance) {
			for (const id of shapeIds(instance)) ids.add(id);
			shapes.push(instance);
			continue;
		}
		const shape = admitted(root, edit.shapeId, undefined, undefined, 'delete');
		if (
			Array.from(shape.getElementsByTagName('*')).some(
				(node) =>
					(node.namespaceURI === VISIO_NS || node.namespaceURI === VISIO_LEGACY_NS) &&
					node.localName === 'Shape',
			)
		)
			fail(
				'UNSUPPORTED_GEOMETRY_EDIT',
				'Nested shape identities cannot be removed as a local leaf.',
			);
		protectedShape(shape, document);
		if (numeric(cells(shape).get('LockDelete'), 0) !== 0)
			fail('EDIT_PROTECTED_CELL', 'LockDelete prevents this operation.');
		shapes.push(shape);
	}
	releaseStencilGlue(roots, removed);
	releaseDeletedGlue(roots, removed);
	assertVisioShapesUnreferenced(roots, removed, { check });
	// No mutation occurs until every target and every retained dependency has been proved.
	check();
	for (const shape of shapes) shape.parentNode!.removeChild(shape);
	// Visio writes no Connects element once the last glue is gone.
	for (const pageId of removed.keys())
		for (const container of children(roots.get(pageId)!, 'Connects'))
			if (!children(container, 'Connect').length) container.parentNode!.removeChild(container);
	return [...removed.keys()];
}
