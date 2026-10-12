import { describe, expect, it } from 'vitest';
import { editVsdx, parseVsdx } from '../index';
import { cell, fixture, rectangle, shape } from '../test-fixtures';
import {
	visioShapeLocalPoint,
	visioTextBlockDrag,
	visioTextBlockEdit,
	visioTextBlockFrame,
	visioTextBlockMatrix,
	visioTextBlockShape,
} from './text-block';

const source = () =>
	fixture({
		pages: [
			{
				id: '0',
				contents: `<Shapes>${shape(
					'1',
					cell('PinX', 3) +
						cell('PinY', 4) +
						cell('Width', 4) +
						cell('Height', 2) +
						cell('LocPinX', 2) +
						cell('LocPinY', 1) +
						rectangle +
						'<Text>Block</Text>',
				)}</Shapes>`,
			},
		],
	});

describe('Text Block tool geometry', () => {
	it('reads, moves, resizes and rotates the text block and saves it as proportions', async () => {
		const bytes = await source();
		const page = (await parseVsdx(bytes)).pages[0]!;
		const shape = visioTextBlockShape(page, '1')!;
		const frame = visioTextBlockFrame(shape);
		expect(frame).toMatchObject({ x: 2, y: 1, width: 4, height: 2 });
		expect(frame.angle).toBeCloseTo(0);
		const local = visioShapeLocalPoint(shape, { x: 3, y: 4 })!;
		expect(local.x).toBeCloseTo(2);
		expect(local.y).toBeCloseTo(1);
		const matrix = visioTextBlockMatrix(frame);
		expect(matrix[4]).toBeCloseTo(0);
		expect(matrix[5]).toBeCloseTo(0);
		const moved = visioTextBlockDrag(frame, 'move', { x: 2, y: 1 }, { x: 3, y: 1.5 });
		expect(moved).toMatchObject({ x: 3, y: 1.5 });
		const resized = visioTextBlockDrag(frame, 'ne', { x: 4, y: 2 }, { x: 3, y: 1.5 });
		expect(resized.x).toBeCloseTo(1.5);
		expect(resized.y).toBeCloseTo(0.75);
		expect(resized.width).toBeCloseTo(3);
		expect(resized.height).toBeCloseTo(1.5);
		const rotated = visioTextBlockDrag(frame, 'rotate', { x: 2, y: 2 }, { x: 1, y: 1 });
		expect((rotated.angle * 180) / Math.PI).toBeCloseTo(90);
		const saved = await editVsdx(bytes, [visioTextBlockEdit(page, shape, resized)]);
		const after = visioTextBlockFrame((await parseVsdx(saved.bytes)).pages[0]!.shapes[0]!);
		expect(after.x).toBeCloseTo(1.5);
		expect(after.width).toBeCloseTo(3);
	});
});
