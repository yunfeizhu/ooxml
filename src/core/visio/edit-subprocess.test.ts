import { describe, expect, it } from 'vitest';
import { createVsdx } from './create-document';
import { editVsdx, type VisioEdit } from './edit';
import { parseVsdx } from './parser';

async function drawing(): Promise<Uint8Array> {
	const blank = await createVsdx();
	return (
		await editVsdx(blank, [
			{
				type: 'create-rectangle',
				pageId: '0',
				shapeId: '1',
				x: 2,
				y: 3,
				width: 2,
				height: 1,
				text: 'A',
			},
			{
				type: 'create-rectangle',
				pageId: '0',
				shapeId: '2',
				x: 5,
				y: 3,
				width: 2,
				height: 1,
				text: 'B',
			},
			{
				type: 'create-rectangle',
				pageId: '0',
				shapeId: '3',
				x: 4,
				y: 8,
				width: 1,
				height: 1,
				text: 'C',
			},
		])
	).bytes;
}

describe('Visio subprocess', () => {
	it('Create New inserts a page after the source page and links the selected shape to it', async () => {
		const result = await editVsdx(await drawing(), [
			{ type: 'create-subprocess', pageId: '0', newPageId: '1', name: 'Approval', shapeId: '1' },
		]);
		const parsed = await parseVsdx(result.bytes);
		expect(parsed.pages.map((page) => [page.id, page.name])).toEqual([
			['0', 'Page-1'],
			['1', 'Approval'],
		]);
		const link = parsed.pages[0]!.shapes.find((shape) => shape.id === '1')!.hyperlinks![0]!;
		expect(link).toMatchObject({
			subAddress: 'Approval',
			description: 'Approval',
			target: { kind: 'internal', subAddress: 'Approval' },
		});
		expect(result.diagnostics.map((note) => note.code)).toContain('edit-subprocess');
	});

	it('Create from Selection moves the shapes to the new page and leaves one linking shape', async () => {
		const result = await editVsdx(await drawing(), [
			{
				type: 'create-subprocess',
				pageId: '0',
				newPageId: '1',
				name: 'Detail',
				selection: { shapeIds: ['1', '2'], shapeId: '4', x: 3.5, y: 3, width: 1.5, height: 0.75 },
			},
		]);
		const [source, target] = (await parseVsdx(result.bytes)).pages;
		expect(source!.shapes.map((shape) => shape.id)).toEqual(['3', '4']);
		const linking = source!.shapes[1]!;
		expect(linking.text.plainText).toBe('Detail');
		expect(linking.width).toBeCloseTo(1.5);
		expect(linking.hyperlinks?.[0]?.target).toEqual({ kind: 'internal', subAddress: 'Detail' });
		expect(target!.name).toBe('Detail');
		expect(target!.shapes.map((shape) => [shape.id, shape.text.plainText])).toEqual([
			['1', 'A'],
			['2', 'B'],
		]);
		// Moved shapes keep their page positions.
		expect(target!.shapes[0]!.transform).toEqual(
			(await parseVsdx(await drawing())).pages[0]!.shapes[0]!.transform,
		);
	});

	it('refuses invalid commands and refuses atomically when a step fails', async () => {
		const bytes = await drawing();
		const base = { type: 'create-subprocess', pageId: '0', newPageId: '1', name: 'X' } as const;
		await expect(editVsdx(bytes, [base as VisioEdit])).rejects.toMatchObject({
			code: 'INVALID_EDIT',
		});
		await expect(editVsdx(bytes, [{ ...base, shapeId: '1', name: ' ' }])).rejects.toMatchObject({
			code: 'INVALID_EDIT',
		});
		await expect(
			editVsdx(bytes, [
				{ ...base, selection: { shapeIds: ['1'], shapeId: '1', x: 1, y: 1, width: 1, height: 1 } },
			]),
		).rejects.toMatchObject({ code: 'INVALID_EDIT' });
		await expect(
			editVsdx(bytes, [
				{ ...base, shapeId: '1' },
				{ type: 'move-shape', pageId: '0', shapeId: '1', x: 1, y: 1 },
			]),
		).rejects.toMatchObject({ code: 'EDIT_MIXED_SUBPROCESS_TRANSACTION' });
		// The page ID is taken: page insertion refuses and nothing is returned.
		await expect(editVsdx(bytes, [{ ...base, newPageId: '0', shapeId: '1' }])).rejects.toBeTruthy();
		await expect(editVsdx(bytes, [{ ...base, shapeId: '99' }])).rejects.toBeTruthy();
	});
});
