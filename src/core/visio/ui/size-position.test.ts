import { expect, it } from 'vitest';
import JSZip from 'jszip';
import { createVsdx } from '../create-document';
import { editVsdx } from '../edit';
import { parseVsdx } from '../parser';
import { demoDocument } from './demo-document';
import {
	visioSizePositionState,
	visioSizePositionCommand,
	type VisioSizePositionField,
} from './size-position';

it.each([0.5, 1, 2])('uses drawing inches and degree rotation at scale %s', async (scale) => {
	const zip = await JSZip.loadAsync(await createVsdx());
	const path = 'visio/pages/pages.xml';
	zip.file(
		path,
		(await zip.file(path)!.async('string')).replace(
			'N="DrawingScale" V="1"',
			`N="DrawingScale" V="${1 / scale}"`,
		),
	);
	const initial = await editVsdx(await zip.generateAsync({ type: 'uint8array' }), [
		{
			type: 'create-rectangle',
			pageId: '0',
			shapeId: '1',
			x: 2,
			y: 3,
			width: 2,
			height: 1,
		},
	]);
	const rotated = await editVsdx(initial.bytes, [
		{ type: 'rotate-shape', pageId: '0', shapeId: '1', angle: Math.PI / 6 },
	]);
	const page = (await parseVsdx(rotated.bytes)).pages[0]!;
	expect(page.drawingToPageScale ?? 1).toBe(scale);
	const before = structuredClone(page);
	const state = visioSizePositionState(page, '1')!;
	expect(state).toMatchObject({ pageId: '0', shapeId: '1', x: 2, y: 3, width: 2, height: 1 });
	expect(state.angle).toBeCloseTo(30, 10);
	expect(Object.isFrozen(state)).toBe(true);
	for (const field of ['x', 'y', 'width', 'height', 'angle'] as const)
		expect(visioSizePositionCommand(page, '1', field, state[field])).toEqual([]);
	const move = visioSizePositionCommand(page, '1', 'x', 4)!;
	expect(move).toEqual([{ type: 'move-shape', pageId: '0', shapeId: '1', x: 4, y: 3 }]);
	const moved = await editVsdx(rotated.bytes, move);
	const movedPage = (await parseVsdx(moved.bytes)).pages[0]!;
	expect(movedPage.shapes[0]!.rotation!.pinX).toBe(4 * scale);
	expect(movedPage.shapes[0]!.rotation!.pinY).toBe(3 * scale);
	const resize = visioSizePositionCommand(movedPage, '1', 'width', 3)!;
	expect(resize).toEqual([
		{ type: 'resize-shape', pageId: '0', shapeId: '1', width: 3, height: 1 },
	]);
	const resized = await editVsdx(moved.bytes, resize);
	const resizedPage = (await parseVsdx(resized.bytes)).pages[0]!;
	expect(resizedPage.shapes[0]!.width).toBe(3 * scale);
	expect(resizedPage.shapes[0]!.rotation).toEqual(movedPage.shapes[0]!.rotation);
	const negativeAngle = visioSizePositionCommand(resizedPage, '1', 'angle', -45)!;
	const changed = await editVsdx(resized.bytes, negativeAngle);
	expect((await parseVsdx(changed.bytes)).pages[0]!.shapes[0]!.rotation!.angle).toBeCloseTo(
		-Math.PI / 4,
		12,
	);
	expect(page).toEqual(before);
});

it('declines invalid input and unsupported candidates without mutating scene data', () => {
	const page = structuredClone(demoDocument.pages[0]!);
	page.connectors = [];
	page.shapes = [page.shapes.find((shape) => shape.kind === 'shape')!];
	const shape = page.shapes[0]!;
	shape.rotation = { pinX: 2, pinY: 3, angle: 0.123456789 };
	expect(visioSizePositionState(page, shape.id)).toBeDefined();
	const before = structuredClone(page);
	for (const value of [NaN, Infinity, -Infinity])
		expect(visioSizePositionCommand(page, shape.id, 'angle', value)).toBeUndefined();
	for (const value of [0, -1, 1_000_001])
		expect(visioSizePositionCommand(page, shape.id, 'width', value)).toBeUndefined();
	expect(visioSizePositionCommand(page, shape.id, 'x', -1_000_001)).toBeUndefined();
	expect(visioSizePositionCommand(page, shape.id, 'angle', Number.MAX_VALUE)).toBeUndefined();
	expect(
		visioSizePositionCommand(page, shape.id, '__proto__' as VisioSizePositionField, 1),
	).toBeUndefined();
	expect(visioSizePositionState(page, 'missing')).toBeUndefined();
	expect(page).toEqual(before);
	// A stencil shape is sized and placed like a drawn one, unless its layer is locked or unknown.
	shape.masterId = '1';
	expect(visioSizePositionState(page, shape.id)).toMatchObject({ shapeId: shape.id });
	shape.layerIds = ['locked'];
	expect(visioSizePositionState(page, shape.id)).toBeUndefined();
	delete shape.layerIds;
	delete shape.masterId;
	page.drawingToPageScale = 0;
	expect(visioSizePositionState(page, shape.id)).toBeUndefined();
});

it('leaves source protection authoritative and keeps rejected bytes unchanged', async () => {
	const initial = await editVsdx(await createVsdx(), [
		{ type: 'create-rectangle', pageId: '0', shapeId: '1', x: 2, y: 3, width: 2, height: 1 },
	]);
	const zip = await JSZip.loadAsync(initial.bytes),
		path = 'visio/pages/page1.xml';
	zip.file(
		path,
		(await zip.file(path)!.async('string')).replace(
			'</Shape>',
			'<Cell N="LockWidth" V="1"/></Shape>',
		),
	);
	const bytes = await zip.generateAsync({ type: 'uint8array' }),
		copy = bytes.slice();
	const page = (await parseVsdx(bytes)).pages[0]!;
	const command = visioSizePositionCommand(page, '1', 'width', 3)!;
	expect(command).toHaveLength(1);
	await expect(editVsdx(bytes, command)).rejects.toMatchObject({ code: 'EDIT_PROTECTED_CELL' });
	expect(bytes).toEqual(copy);
});
