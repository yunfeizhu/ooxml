import { expect, it } from 'vitest';
import type { VisioPage } from '../model';
import { transform } from '../geometry';
import { demoDocument } from './demo-document';
import { visioArrangeCommands, type VisioArrangement } from './shape-arrange';

function page(): VisioPage {
	const template = demoDocument.pages[0]!.shapes[0]!;
	const shapes = [
		{ id: 'a', width: 2, height: 1, x: 3, y: 5 },
		{ id: 'b', width: 4, height: 3, x: 8, y: 2 },
		{ id: 'c', width: 1, height: 2, x: 11, y: 9 },
	].map(({ id, width, height, x, y }) => ({
		...structuredClone(template),
		id,
		width,
		height,
		rotation: { pinX: x, pinY: y, angle: 0 },
		transform: transform(x, y, width / 2, height / 2, 0),
	}));
	return { ...structuredClone(demoDocument.pages[0]!), shapes, connectors: [] };
}

it.each([
	['left', 4, 2],
	['center', 3, 2],
	['right', 2, 2],
	['top', 8, 4],
	['middle', 8, 5],
	['bottom', 8, 6],
] as const)('aligns %s against first-selected primary and preserves its pin', (edge, x, y) => {
	const scene = page();
	expect(visioArrangeCommands(scene, ['a', 'b'], { type: 'align', edge })).toEqual([
		{ type: 'move-shape', pageId: scene.id, shapeId: 'b', x, y },
	]);
	expect(scene.shapes[0]!.rotation).toMatchObject({ pinX: 3, pinY: 5 });
});

it('accounts for rotated alignment boxes and custom local pins without modifying angle', () => {
	const scene = page(),
		shape = scene.shapes[1]!;
	shape.width = 4;
	shape.height = 1;
	shape.rotation = { pinX: 8, pinY: 2, angle: Math.PI / 2 };
	shape.transform = transform(8, 2, 0.25, 0.5, Math.PI / 2);
	const left = visioArrangeCommands(scene, ['a', 'b'], { type: 'align', edge: 'left' })![0]!;
	expect(left).toMatchObject({ type: 'move-shape', shapeId: 'b', x: 2.5, y: 2 });
	const top = visioArrangeCommands(scene, ['a', 'b'], { type: 'align', edge: 'top' })![0]!;
	expect(top).toMatchObject({ type: 'move-shape', shapeId: 'b', x: 8, y: 1.75 });
	expect(shape.rotation.angle).toBe(Math.PI / 2);
});

it('distributes unequal boxes with equal edge gaps and keeps outer pins unchanged', () => {
	const scene = page();
	const horizontal = visioArrangeCommands(scene, ['c', 'a', 'b'], {
		type: 'distribute',
		axis: 'horizontal',
	})!;
	// Left boundary2, right11.5, total widths7: equal gaps1.25, middle center7.25.
	expect(horizontal).toEqual([
		{ type: 'move-shape', pageId: scene.id, shapeId: 'b', x: 7.25, y: 2 },
	]);
	expect(
		visioArrangeCommands(scene, ['b', 'c', 'a'], { type: 'distribute', axis: 'horizontal' }),
	).toEqual(horizontal);
	const vertical = visioArrangeCommands(scene, ['a', 'b', 'c'], {
		type: 'distribute',
		axis: 'vertical',
	})!;
	expect(vertical).toEqual([{ type: 'move-shape', pageId: scene.id, shapeId: 'a', x: 3, y: 5.75 }]);
});

it('converts final physical pin coordinates to drawing inches for scaled pages', () => {
	const scene = page();
	scene.drawingToPageScale = 0.5;
	expect(visioArrangeCommands(scene, ['a', 'b'], { type: 'align', edge: 'left' })).toEqual([
		{ type: 'move-shape', pageId: scene.id, shapeId: 'b', x: 8, y: 4 },
	]);
});

it('declines duplicate, absent, glued, layered and unsupported targets for the whole selection', () => {
	const scene = page();
	const action: VisioArrangement = { type: 'align', edge: 'left' };
	for (const ids of [['a'], ['a', 'a'], ['a', 'missing']])
		expect(visioArrangeCommands(scene, ids, action)).toBeUndefined();
	expect(
		visioArrangeCommands(scene, ['a', 'b'], { type: 'distribute', axis: 'horizontal' }),
	).toBeUndefined();
	for (const patch of [
		{ masterId: '1', layerIds: ['locked'] },
		{ layerIds: ['1'] },
		{ hidden: true },
		{ kind: 'group' as const },
		{ width: 0 },
		{ rotation: undefined },
	]) {
		const candidate = {
			...scene,
			shapes: [scene.shapes[0]!, { ...scene.shapes[1]!, ...patch }],
		} as VisioPage;
		expect(visioArrangeCommands(candidate, ['a', 'b'], action)).toBeUndefined();
	}
	scene.connectors.push({ fromShapeId: 'a', toShapeId: 'b', fromCell: 'BeginX', toCell: 'PinX' });
	expect(visioArrangeCommands(scene, ['a', 'b'], action)).toBeUndefined();
});

it.each([
	[
		'nested',
		[
			[0, 1],
			[2, 100],
			[3, 4],
		],
		['1', '2', '3'],
		[0.5, 51, 1.5],
	],
	[
		'overlap',
		[
			[0, 5],
			[3, 4],
			[4, 6],
		],
		['1', '2', '3'],
		[2.5, 4.5, 5],
	],
	[
		'enclosing',
		[
			[0, 100],
			[2, 3],
			[4, 5],
		],
		['1', '2', '3'],
		[50, 2.5, 1.5],
	],
	[
		'trailing tie',
		[
			[0, 1],
			[3, 5],
			[4, 5],
		],
		['1', '2', '3'],
		[0.5, 2.5, 4.5],
	],
	[
		'center tie',
		[
			[0, 4],
			[1, 3],
			[6, 7],
		],
		['1', '2', '3'],
		[2, 5, 6.5],
	],
	[
		'reversed center tie',
		[
			[0, 4],
			[1, 3],
			[6, 7],
		],
		['2', '1', '3'],
		[4.5, 2, 6.5],
	],
	[
		'all centers tied',
		[
			[0, 4],
			[1, 3],
			[0.5, 3.5],
		],
		['1', '2', '3'],
		[2, 2.25, 2],
	],
	[
		'all centers tied reversed',
		[
			[0, 4],
			[1, 3],
			[0.5, 3.5],
		],
		['3', '2', '1'],
		[2, 1.75, 2],
	],
] as const)(
	'matches native center ordering for %s on both axes',
	(_name, bounds, ids, expected) => {
		for (const axis of ['horizontal', 'vertical'] as const) {
			const scene = page(),
				template = scene.shapes[0]!;
			scene.shapes = bounds.map(([start, end], index) => {
				const width = axis === 'horizontal' ? end - start : 1;
				const height = axis === 'vertical' ? end - start : 1;
				const pinX = axis === 'horizontal' ? (start + end) / 2 : 2;
				const pinY = axis === 'vertical' ? (start + end) / 2 : 2;
				return {
					...structuredClone(template),
					id: String(index + 1),
					width,
					height,
					rotation: { pinX, pinY, angle: 0 },
					transform: transform(pinX, pinY, width / 2, height / 2, 0),
				};
			});
			const commands = visioArrangeCommands(scene, ids, { type: 'distribute', axis })!;
			expect(commands).toBeDefined();
			scene.shapes.forEach((shape, index) => {
				const command = commands.find(
					(item) => item.type === 'move-shape' && item.shapeId === shape.id,
				);
				const coordinate =
					command?.type === 'move-shape'
						? axis === 'horizontal'
							? command.x
							: command.y
						: axis === 'horizontal'
							? shape.rotation!.pinX
							: shape.rotation!.pinY;
				expect(coordinate).toBeCloseTo(expected[index]!, 10);
			});
		}
	},
);
