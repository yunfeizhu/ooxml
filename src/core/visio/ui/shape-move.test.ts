import { expect, it } from 'vitest';
import { demoDocument } from './demo-document';
import { transform } from '../geometry';
import {
	visioMoveCommands,
	visioMovePreviewTransform,
	visioNudgeCommands,
	visioPageDragDelta,
} from './shape-move';

function page() {
	const page = structuredClone(demoDocument.pages[0]!);
	page.connectors = [];
	page.shapes = ['a', 'b'].map((id, index) => ({
		...structuredClone(page.shapes[0]!),
		id,
		width: 2,
		height: 1,
		rotation: { pinX: 3 + index, pinY: 5, angle: Math.PI / 4 },
		transform: transform(3 + index, 5, 0.25, 0.75, Math.PI / 4),
	}));
	return page;
}
it.each([0.5, 1, 2])('translates every pin by one physical delta at scale %s', (scale) => {
	const scene = page();
	scene.drawingToPageScale = scale;
	const before = structuredClone(scene);
	const delta = visioPageDragDelta({ x: 1, y: 3 }, { x: 2.25, y: 2.5 });
	expect(delta).toEqual({ x: 1.25, y: 0.5 });
	expect(visioMoveCommands(scene, ['b', 'a'], delta)).toEqual([
		{ type: 'move-shape', pageId: scene.id, shapeId: 'b', x: 5.25 / scale, y: 5.5 / scale },
		{ type: 'move-shape', pageId: scene.id, shapeId: 'a', x: 4.25 / scale, y: 5.5 / scale },
	]);
	const [a, b, c, d, e, f] = scene.shapes[0]!.transform;
	expect(visioMovePreviewTransform(scene.shapes[0]!, delta)).toEqual([
		a,
		b,
		c,
		d,
		e + 1.25,
		f + 0.5,
	]);
	expect(scene).toEqual(before);
});
it('declines the entire selection when any member is unsupported, glued or ambiguous', () => {
	for (const patch of [
		{ kind: 'connector' },
		{ masterId: '1', layerIds: ['locked'] },
		{ layerIds: ['1'] },
		{ hidden: true },
		{ children: [page().shapes[0]!] },
	]) {
		const scene = page();
		Object.assign(scene.shapes[1]!, patch);
		expect(visioMoveCommands(scene, ['a', 'b'], { x: 1, y: 1 })).toBeUndefined();
	}
	const scene = page();
	for (const ids of [[], ['a', 'a'], ['a', 'missing']])
		expect(visioMoveCommands(scene, ids, { x: 1, y: 1 })).toBeUndefined();
	scene.connectors.push({ fromShapeId: 'a', toShapeId: 'b' } as (typeof scene.connectors)[number]);
	expect(visioMoveCommands(scene, ['a'], { x: 1, y: 1 })).toBeUndefined();
	// A glue target moves; core reroutes the connectors glued to it.
	expect(visioMoveCommands(scene, ['b'], { x: 1, y: 1 })).toHaveLength(1);
});
it('admits an unchanged eligible selection but rejects nonfinite or overflowing translations', () => {
	const scene = page();
	expect(visioMoveCommands(scene, ['a', 'b'], { x: 0, y: 0 })).toEqual([]);
	expect(visioMoveCommands(scene, ['a'], { x: NaN, y: 1 })).toBeUndefined();
	scene.shapes[0]!.rotation!.pinX = Number.MAX_VALUE;
	expect(visioMoveCommands(scene, ['a'], { x: Number.MAX_VALUE, y: 1 })).toBeUndefined();
	scene.shapes[0]!.transform = [1, 0, 0, 1, Number.MAX_VALUE, 0];
	expect(
		visioMovePreviewTransform(scene.shapes[0]!, { x: Number.MAX_VALUE, y: 0 }),
	).toBeUndefined();
});

it('nudges the selection in the arrow direction with upward page y', () => {
	const scene = page();
	expect(visioNudgeCommands(scene, ['a'], 'ArrowUp', 0.0625)).toEqual([
		{ type: 'move-shape', pageId: scene.id, shapeId: 'a', x: 3, y: 5.0625 },
	]);
	expect(visioNudgeCommands(scene, ['a', 'b'], 'ArrowLeft', 0.5)).toEqual([
		{ type: 'move-shape', pageId: scene.id, shapeId: 'a', x: 2.5, y: 5 },
		{ type: 'move-shape', pageId: scene.id, shapeId: 'b', x: 3.5, y: 5 },
	]);
	expect(visioNudgeCommands(scene, ['a'], 'Home', 1)).toBeNull();
	expect(visioNudgeCommands(scene, ['a'], 'ArrowDown', 0)).toBeUndefined();
	expect(visioNudgeCommands(scene, ['missing'], 'ArrowDown', 1)).toBeUndefined();
});
