import { describe, expect, it } from 'vitest';
import { editVsdx } from './edit';
import { parseVsdx } from './parser';
import { cell, fixture, shape } from './test-fixtures';
import { VisioPackageError } from './package';
import { snapshotEdits } from './ui/edit-commands';

const code = async (promise: Promise<unknown>) => {
	try {
		await promise;
	} catch (error) {
		return error instanceof VisioPackageError ? error.code : String(error);
	}
	return 'resolved';
};
async function guides() {
	const blank = await fixture({ pages: [{ id: '0', contents: '' }] });
	return editVsdx(blank, [
		{ type: 'create-rectangle', pageId: '0', shapeId: '1', x: 2, y: 2, width: 1, height: 1 },
		{ type: 'create-guide', pageId: '0', shapeId: '2', orientation: 'horizontal', position: 5 },
		{ type: 'create-guide', pageId: '0', shapeId: '3', orientation: 'vertical', position: 3 },
	]);
}

describe('ruler guides', () => {
	it('creates native horizontal and vertical guide shapes', async () => {
		const created = await guides();
		expect(created.diagnostics.map((entry) => entry.code)).toContain('edit-guides');
		const page = (await parseVsdx(created.bytes)).pages[0]!;
		const [horizontal, vertical] = [page.shapes[1]!, page.shapes[2]!];
		expect(horizontal.visibility?.guide).toBe(true);
		expect(horizontal.hidden).toBe(true);
		expect(horizontal.rotation).toMatchObject({ pinY: 5, angle: 0 });
		expect(vertical.rotation!.pinX).toBe(3);
		expect(vertical.rotation!.angle).toBeCloseTo(Math.PI / 2, 12);
	});
	it('moves and deletes guides as single undoable edits', async () => {
		const created = await guides();
		const moved = await editVsdx(created.bytes, [
			{ type: 'move-guide', pageId: '0', shapeId: '2', position: 6.5 },
			{ type: 'move-guide', pageId: '0', shapeId: '3', position: 1 },
		]);
		const page = (await parseVsdx(moved.bytes)).pages[0]!;
		expect(page.shapes[1]!.rotation!.pinY).toBe(6.5);
		expect(page.shapes[2]!.rotation!.pinX).toBe(1);
		const deleted = await editVsdx(moved.bytes, [
			{ type: 'delete-guide', pageId: '0', shapeId: '2' },
		]);
		expect((await parseVsdx(deleted.bytes)).pages[0]!.shapes.map((shape) => shape.id)).toEqual([
			'1',
			'3',
		]);
	});
	it('refuses ordinary shapes, glued guides and invalid commands', async () => {
		const created = await guides();
		expect(
			await code(editVsdx(created.bytes, [{ type: 'delete-guide', pageId: '0', shapeId: '1' }])),
		).toBe('UNSUPPORTED_GUIDE_EDIT');
		expect(
			await code(
				editVsdx(created.bytes, [
					{ type: 'create-guide', pageId: '0', shapeId: '2', orientation: 'vertical', position: 1 },
				]),
			),
		).toBe('INVALID_SHAPE_ID');
		const referenced = await fixture({
			pages: [
				{
					id: '0',
					contents: `<Shapes>${shape('1', '', 'Type="Shape"').replace('<Shape ID="1" Type="Shape">', `<Shape ID="1" Type="Shape">${cell('PinY', 5, 'Sheet.2!PinY')}`)}${shape('2', cell('PinY', 5), 'Type="Guide"')}</Shapes>`,
				},
			],
		});
		expect(
			await code(
				editVsdx(referenced, [{ type: 'move-guide', pageId: '0', shapeId: '2', position: 1 }]),
			),
		).toBe('UNSUPPORTED_GUIDE_EDIT');
		expect(() =>
			snapshotEdits([
				{
					type: 'create-guide',
					pageId: '0',
					shapeId: '4',
					orientation: 'diagonal',
					position: 1,
				} as never,
			]),
		).toThrow();
		expect(() =>
			snapshotEdits([{ type: 'move-guide', pageId: '0', shapeId: '4', position: Number.NaN }]),
		).toThrow();
	});
});
