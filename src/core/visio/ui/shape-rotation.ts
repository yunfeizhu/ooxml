import type { VisioEdit } from '../edit';
import type { VisioPage, VisioShape } from '../model';
import { visioStencilInstanceShape } from './formatting';
/**
 * The model-level scope of local rotation: a shape or group drawn here. A group may hold 2D
 * stencil shapes; each stays an instance of its master and moves with the group as one member.
 * Source protections remain enforced by core edits.
 */
export function visioLocalRotationShape(
	page: VisioPage,
	shapeId: string,
	includeGroups = true,
): VisioShape | undefined {
	const shape = page.shapes.find((shape) => shape.id === shapeId);
	if (!shape || shape.hidden) return undefined;
	const pending = [shape],
		ids = new Set<string>();
	while (pending.length) {
		const node = pending.pop()!;
		if (node !== shape && node.masterId) {
			if (!['shape', 'group'].includes(node.kind) || !(node.width > 0 && node.height > 0))
				return undefined;
			const inner = [node];
			while (inner.length) {
				const item = inner.pop()!;
				if (ids.size >= 10000 || ids.has(item.id)) return undefined;
				ids.add(item.id);
				inner.push(...item.children);
			}
			continue;
		}
		if (
			ids.size >= 10000 ||
			ids.has(node.id) ||
			node.masterId ||
			!node.rotation ||
			!(node.width > 0 && node.height > 0) ||
			![...node.transform, node.rotation.pinX, node.rotation.pinY, node.rotation.angle].every(
				Number.isFinite,
			) ||
			(node.kind === 'group'
				? !includeGroups || !node.children.length
				: node.kind !== 'shape' || !!node.children.length)
		)
			return undefined;
		ids.add(node.id);
		pending.push(...node.children);
	}
	if (
		page.connectors.some(
			(connection) =>
				ids.has(connection.fromShapeId) ||
				(ids.has(connection.toShapeId) && connection.toShapeId !== shapeId),
		)
	)
		return undefined;
	return shape;
}
/**
 * What Rotate and Flip act on: a local shape or group, or a stencil instance (a group included), whose
 * angle and flip flags are saved as local values over its master.
 */
export function visioRotationShape(
	page: VisioPage,
	shapeId: string,
	includeGroups = true,
): VisioShape | undefined {
	const local = visioLocalRotationShape(page, shapeId, includeGroups);
	if (local) return local;
	const shape = visioStencilInstanceShape(page, shapeId);
	if (
		!shape?.rotation ||
		!(shape.width > 0 && shape.height > 0) ||
		![...shape.transform, shape.rotation.pinX, shape.rotation.pinY, shape.rotation.angle].every(
			Number.isFinite,
		) ||
		page.connectors.some((connection) => connection.fromShapeId === shapeId)
	)
		return undefined;
	return shape;
}
/** Native per-shape quarter turns normalize to signed angles while retaining the saved pin. */
export function visioQuarterTurnCommand(
	page: VisioPage,
	shapeId: string,
	direction: 'left' | 'right',
): Extract<VisioEdit, { type: 'rotate-shape' }> | undefined {
	const shape = visioRotationShape(page, shapeId);
	if (!shape?.rotation || !Number.isFinite(shape.rotation.angle)) return undefined;
	const angle = shape.rotation.angle + ((direction === 'left' ? 1 : -1) * Math.PI) / 2;
	let normalized = Math.atan2(Math.sin(angle), Math.cos(angle));
	// Native XML rounds angle caches; keep the signed half-turn rather than crossing the branch cut.
	if (Math.abs(Math.abs(normalized) - Math.PI) < 1e-12) normalized = Math.sign(angle) * Math.PI;
	return {
		type: 'rotate-shape',
		pageId: page.id,
		shapeId,
		angle: normalized,
	};
}
