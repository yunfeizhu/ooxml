import { expect, it } from 'vitest';
import { editVsdx, type VisioEdit } from './edit';
import { parseVsdx } from './parser';
import { fixture } from './test-fixtures';
import { snapshotEdits } from './ui/edit-commands';
import { VISIO_BASIC_SHAPES, visioBasicShapeOutline, type VisioBasicShape } from './basic-shapes';

const create = (shape: VisioBasicShape): Extract<VisioEdit, { type: 'create-rectangle' }> => ({
	type: 'create-rectangle',
	pageId: '0',
	shapeId: '2',
	x: 2,
	y: 3,
	width: 2,
	height: 1,
	shape,
});

it('keeps every outline closed-able and inside its unit box', () => {
	for (const shape of VISIO_BASIC_SHAPES)
		for (const path of visioBasicShapeOutline(shape).paths) {
			expect(path.length).toBeGreaterThanOrEqual(3);
			for (const [x, y] of path) {
				expect(x).toBeGreaterThanOrEqual(-1e-9);
				expect(x).toBeLessThanOrEqual(1 + 1e-9);
				expect(y).toBeGreaterThanOrEqual(-1e-9);
				expect(y).toBeLessThanOrEqual(1 + 1e-9);
			}
		}
});

it.each(VISIO_BASIC_SHAPES)('creates, resizes and moves a %s', async (shape) => {
	const created = await editVsdx(await fixture(), [create(shape)]);
	const edited = await editVsdx(created.bytes, [
		{ type: 'resize-shape', pageId: '0', shapeId: '2', width: 4, height: 2 },
		{ type: 'move-shape', pageId: '0', shapeId: '2', x: 5, y: 6 },
	]);
	const drawn = (await parseVsdx(edited.bytes)).pages[0]!.shapes.find((s) => s.id === '2')!;
	expect(drawn.width).toBe(4);
	expect(drawn.height).toBe(2);
	expect(drawn.geometry).toHaveLength(visioBasicShapeOutline(shape).paths.length);
	for (const geometry of drawn.geometry) expect(geometry.path).toMatch(/^M [\d.e-]+ [\d.e-]+ L /);
});

it('draws a triangle from its outline and rounds the rounded rectangle', async () => {
	const triangle = await editVsdx(await fixture(), [create('triangle')]);
	const page = (await parseVsdx(triangle.bytes)).pages[0]!;
	// Local geometry is Y up: the apex is at the top centre of a 2 x 1 box.
	expect(page.shapes.find((s) => s.id === '2')!.geometry[0]!.path).toBe('M 0 0 L 2 0 L 1 1 L 0 0');
	const rounded = await editVsdx(await fixture(), [create('rounded-rectangle')]);
	const box = (await parseVsdx(rounded.bytes)).pages[0]!.shapes.find((s) => s.id === '2')!;
	expect(box.geometry[0]!.path).toContain(' A ');
});

it('snapshots the shape and rejects an unknown one', async () => {
	expect(snapshotEdits([create('star')])).toEqual([create('star')]);
	await expect(
		editVsdx(await fixture(), [{ ...create('star'), shape: 'blob' as VisioBasicShape }]),
	).rejects.toThrow(/Unknown outline shape/);
});
