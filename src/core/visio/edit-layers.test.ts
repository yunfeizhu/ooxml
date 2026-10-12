import { describe, expect, it } from 'vitest';
import { editVsdx, type VisioEdit } from './edit';
import { parseVsdx } from './parser';
import { cell, fixture } from './test-fixtures';
import { snapshotEdits } from './ui/edit-commands';
import { VisioPackageError } from './package';

const layerRow = (index: number, name: string, lock = 0) =>
	`<Row IX="${index}">${cell('Name', name)}${cell('Visible', 1)}${cell('Print', 1)}${cell('Lock', lock)}</Row>`;
const box = (shapeId: string, x: number): VisioEdit => ({
	type: 'create-rectangle',
	pageId: '0',
	shapeId,
	x,
	y: 2,
	width: 1,
	height: 1,
});
async function drawing(
	layers = layerRow(0, 'Flow') + layerRow(1, 'Notes') + layerRow(2, 'Frozen', 1),
) {
	const blank = await fixture({
		pages: [{ id: '0', contents: '', pageCells: `<Section N="Layer">${layers}</Section>` }],
	});
	return (await editVsdx(blank, [box('1', 1), box('2', 3), box('3', 5)])).bytes;
}
const assign = (edit: Partial<VisioEdit> & Record<string, unknown>) =>
	({ type: 'assign-layers', pageId: '0', shapeIds: ['1'], layerIds: [], ...edit }) as VisioEdit;
const layerIds = async (bytes: Uint8Array, id: string) =>
	(await parseVsdx(bytes)).pages[0]!.shapes.find((shape) => shape.id === id)!.layerIds;
const code = async (promise: Promise<unknown>) => {
	try {
		await promise;
	} catch (error) {
		return error instanceof VisioPackageError ? error.code : String(error);
	}
	return 'resolved';
};

describe('assign-layers', () => {
	it('sets LayerMember on selected shapes and round-trips', async () => {
		const bytes = await drawing();
		const edited = await editVsdx(bytes, [assign({ shapeIds: ['1', '2'], layerIds: ['0', '1'] })]);
		expect(await layerIds(edited.bytes, '1')).toEqual(['0', '1']);
		expect(await layerIds(edited.bytes, '2')).toEqual(['0', '1']);
		expect(await layerIds(edited.bytes, '3')).toEqual([]);
		expect(edited.diagnostics.map((entry) => entry.code)).toEqual(['edit-layers-experimental']);
		const cleared = await editVsdx(edited.bytes, [assign({ shapeIds: ['1'], layerIds: [] })]);
		expect(await layerIds(cleared.bytes, '1')).toEqual([]);
	});
	it('adds new layers to the page sheet and assigns them', async () => {
		const edited = await editVsdx(await drawing(), [
			assign({ shapeIds: ['3'], layerIds: ['1'], newLayers: ['Review', 'Draft'] }),
		]);
		const page = (await parseVsdx(edited.bytes)).pages[0]!;
		expect(
			page.layers!.map((layer) => [layer.id, layer.name, layer.visible, layer.locked]),
		).toEqual([
			['0', 'Flow', true, false],
			['1', 'Notes', true, false],
			['2', 'Frozen', true, true],
			['3', 'Review', true, false],
			['4', 'Draft', true, false],
		]);
		expect(page.shapes.find((shape) => shape.id === '3')!.layerIds).toEqual(['1', '3', '4']);
		expect(edited.changedParts).toContain('visio/pages/pages.xml');
	});
	it('keeps layered shapes movable and deletable', async () => {
		const edited = await editVsdx(await drawing(), [assign({ layerIds: ['0'] })]);
		const moved = await editVsdx(edited.bytes, [
			{ type: 'move-shape', pageId: '0', shapeId: '1', x: 4, y: 4 },
		]);
		const page = (await parseVsdx(moved.bytes)).pages[0]!;
		expect(page.shapes.find((shape) => shape.id === '1')!.rotation).toMatchObject({
			pinX: 4,
			pinY: 4,
		});
		const deleted = await editVsdx(edited.bytes, [
			{ type: 'delete-shape', pageId: '0', shapeId: '1' },
		]);
		expect((await parseVsdx(deleted.bytes)).pages[0]!.shapes).toHaveLength(2);
	});
	it('creates the Layer section on a page without layers', async () => {
		const blank = await fixture({ pages: [{ id: '0', contents: '' }] });
		const bytes = (await editVsdx(blank, [box('1', 1)])).bytes;
		const edited = await editVsdx(bytes, [assign({ newLayers: ['Connector'] })]);
		const page = (await parseVsdx(edited.bytes)).pages[0]!;
		expect(page.layers!.map((layer) => layer.name)).toEqual(['Connector']);
		expect(page.shapes[0]!.layerIds).toEqual(['0']);
	});
	it('refuses locked layers, unknown layers, duplicate names, groups and mixed transactions', async () => {
		const bytes = await drawing();
		expect(await code(editVsdx(bytes, [assign({ layerIds: ['2'] })]))).toBe('EDIT_PROTECTED_LAYER');
		expect(await code(editVsdx(bytes, [assign({ layerIds: ['9'] })]))).toBe(
			'EDIT_TARGET_NOT_FOUND',
		);
		expect(await code(editVsdx(bytes, [assign({ newLayers: ['flow'] })]))).toBe('INVALID_EDIT');
		expect(await code(editVsdx(bytes, [assign({ shapeIds: ['8'] })]))).toBe(
			'EDIT_TARGET_NOT_FOUND',
		);
		expect(await code(editVsdx(bytes, [assign({}), box('9', 7)]))).toBe(
			'EDIT_MIXED_LAYER_TRANSACTION',
		);
		const grouped = await editVsdx(bytes, [
			{ type: 'group-shapes', pageId: '0', shapeId: '7', memberIds: ['1', '2'] },
		]);
		expect(
			await code(editVsdx(grouped.bytes, [assign({ shapeIds: ['7'], layerIds: ['0'] })])),
		).toBe('UNSUPPORTED_LAYER_EDIT');
	});
	it('validates commands before any package work', () => {
		expect(() => snapshotEdits([assign({ shapeIds: [] })])).toThrow();
		expect(() => snapshotEdits([assign({ layerIds: ['01'] })])).toThrow();
		expect(() => snapshotEdits([assign({ newLayers: ['a;b'] })])).toThrow();
		expect(() => snapshotEdits([assign({ newLayers: ['A', 'a'] })])).toThrow();
		expect(snapshotEdits([assign({ layerIds: ['0'], extra: 1 })])).toEqual([
			{ type: 'assign-layers', pageId: '0', shapeIds: ['1'], layerIds: ['0'] },
		]);
	});
});
