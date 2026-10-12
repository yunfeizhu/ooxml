import { describe, expect, it } from 'vitest';
import { createVsdx } from './create-document';
import { editVsdx, type VisioEdit } from './edit';
import { parseVsdx } from './parser';
import { cell, fixture, rectangle, shape } from './test-fixtures';
import { visioAutoConnectPlan, visioAutoConnectShape } from './ui/auto-connect';
import { visioStencilDropCommand } from './ui/master-drop';

const drop = (master: string, shapeId: string, x: number, y: number): VisioEdit => ({
	type: 'drop-stencil-master',
	pageId: '0',
	shapeId,
	master,
	x,
	y,
});
const connect = (shapeId: string, begin: string, end: string): VisioEdit => ({
	type: 'create-line',
	pageId: '0',
	shapeId,
	beginX: 0,
	beginY: 0,
	endX: 1,
	endY: 1,
	connect: { begin, end },
});
const box = (page: Awaited<ReturnType<typeof parseVsdx>>['pages'][number], id: string) => {
	const found = page.shapes.find((item) => item.id === id)!;
	return { ...found.rotation!, width: found.width, height: found.height };
};

describe('connectors and dropped stencil instances', () => {
	it('glues to an instance and follows it when it moves or is resized', async () => {
		const drawn = await editVsdx(await createVsdx(), [
			drop('rectangle', '1', 2, 3),
			drop('diamond', '2', 5, 3),
			connect('3', '1', '2'),
		]);
		const page = (await parseVsdx(drawn.bytes)).pages[0]!;
		expect(page.connectors.map((row) => row.toShapeId).sort()).toEqual(['1', '2']);
		// The ends sit on the facing sides: x = 2.5 (right of the rectangle) to 4.5 (left of the diamond).
		expect(box(page, '3')).toMatchObject({ pinX: 3.5, pinY: 3, width: 2 });
		const moved = (
			await parseVsdx(
				(
					await editVsdx(drawn.bytes, [
						{ type: 'move-shape', pageId: '0', shapeId: '2', x: 7, y: 3 },
					])
				).bytes,
			)
		).pages[0]!;
		expect(box(moved, '3')).toMatchObject({ pinX: 4.5, width: 4 });
		const resized = (
			await parseVsdx(
				(
					await editVsdx(drawn.bytes, [
						{ type: 'resize-shape', pageId: '0', shapeId: '1', width: 2, height: 1 },
					])
				).bytes,
			)
		).pages[0]!;
		expect(box(resized, '1')).toMatchObject({ width: 2, height: 1 });
		expect(box(resized, '3').width).toBeCloseTo(1.5);
	});

	it('glues to an instance that carries only its pin, reading its size from the master', async () => {
		const size = cell('PinX', 2) + cell('PinY', 2) + cell('Width', 1) + cell('Height', 1);
		const bytes = await fixture({
			masters: [{ id: '2', shapes: shape('5', size + rectangle) }],
			pages: [
				{
					id: '0',
					contents: `<Shapes>${shape('1', cell('PinX', 2) + cell('PinY', 2), 'Master="2"')}${shape('4', size + rectangle)}</Shapes>`,
				},
			],
		});
		const glued = await editVsdx(bytes, [connect('9', '1', '4')]);
		const page = (await parseVsdx(glued.bytes)).pages[0]!;
		expect(page.connectors.map((item) => item.toShapeId).sort()).toEqual(['1', '4']);
	});
});

describe('stencil drops planned for the editor', () => {
	it('drops at the pointer, kept on the page, in drawing inches', async () => {
		const page = (await parseVsdx(await createVsdx({ width: 8, height: 6 }))).pages[0]!;
		expect(visioStencilDropCommand(page, 'flowchart-process', { x: 2, y: 1 })).toEqual({
			type: 'drop-stencil-master',
			pageId: '0',
			shapeId: '1',
			master: 'flowchart-process',
			x: 2,
			y: 5,
		});
		// The master is 1 x 0.75 in., so its pin stays half a shape inside the page.
		expect(visioStencilDropCommand(page, 'flowchart-process', { x: -3, y: 9 })).toMatchObject({
			x: 0.5,
			y: 0.375,
		});
		expect(
			visioStencilDropCommand(page, 'flowchart-process', { x: -3, y: 9 }, false),
		).toMatchObject({ x: -3, y: -3 });
		expect(visioStencilDropCommand(page, 'circle')).toMatchObject({ x: 4, y: 3 });
		expect(() => visioStencilDropCommand(page, 'nothing')).toThrow(/no such master/);
	});

	it('lets AutoConnect start from an instance and add another one', async () => {
		const drawn = await editVsdx(await createVsdx(), [drop('flowchart-process', '1', 2, 6)]);
		const page = (await parseVsdx(drawn.bytes)).pages[0]!;
		expect(visioAutoConnectShape(page, '1')?.id).toBe('1');
		const plan = visioAutoConnectPlan(page, '1', 'right', {
			master: { kind: 'stencil', master: 'flowchart-decision' },
			size: { width: 1, height: 0.75 },
		})!;
		expect(plan.edits.map((edit) => edit.type)).toEqual(['drop-stencil-master', 'create-line']);
		const edited = (await parseVsdx((await editVsdx(drawn.bytes, plan.edits)).bytes)).pages[0]!;
		const added = edited.shapes.find((item) => item.id === plan.targetId)!;
		expect(added).toMatchObject({ name: 'Decision', width: 1, height: 0.75 });
		// 0.375 in. between the facing sides, as Visio leaves.
		expect(added.rotation!.pinX).toBeCloseTo(2 + 0.5 + 0.375 + 0.5);
		expect(
			edited.connectors
				.filter((row) => row.fromShapeId === plan.connectorId)
				.map((row) => row.toShapeId)
				.sort(),
		).toEqual(['1', plan.targetId].sort());
	});
});
