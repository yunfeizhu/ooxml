import { describe, expect, it } from 'vitest';
import { captureVisioClipboard, editVsdx, parseVsdx, type VisioEdit } from '../index';
import { visioConnectorCreationCommand } from './draw-plan';
import { createSampleVsdx } from './sample-drawing';

const PAGE = '0';
const page = async (bytes: Uint8Array) => (await parseVsdx(bytes)).pages[0]!;
const shape = async (bytes: Uint8Array, id: string) =>
	(await page(bytes)).shapes.find((item) => item.id === id);
const apply = async (bytes: Uint8Array, edits: VisioEdit[]) => (await editVsdx(bytes, edits)).bytes;

/**
 * The sample's boxes, and shapes dropped from a built-in stencil, are master instances. Every
 * ordinary whole-shape command has to take them, or the sample would look locked again.
 */
describe('the sample drawing and dropped stencil shapes stay editable', () => {
	it('resizes, formats, connects, orders, duplicates, copies, groups and deletes them', async () => {
		let bytes = await createSampleVsdx();
		// A shape dropped from the Shapes window is an instance too.
		bytes = await apply(bytes, [
			{
				type: 'drop-stencil-master',
				pageId: PAGE,
				shapeId: '20',
				master: 'flowchart-process',
				x: 6.5,
				y: 8,
			},
		]);
		expect((await shape(bytes, '20'))!.masterId).toBeDefined();
		expect((await shape(bytes, '1'))!.masterId).toBeDefined();

		// Resize and format a sample box (glued connectors follow) and the dropped shape.
		const glued = (await page(bytes)).connectors.length;
		bytes = await apply(bytes, [
			{ type: 'resize-shape', pageId: PAGE, shapeId: '2', width: 3.2, height: 0.9 },
			{ type: 'format-shape', pageId: PAGE, shapeId: '2', fillColor: '#ffcc00' },
		]);
		bytes = await apply(bytes, [
			{ type: 'resize-shape', pageId: PAGE, shapeId: '20', width: 1.5, height: 1 },
			{ type: 'format-text', pageId: PAGE, shapeId: '20', bold: true },
			{ type: 'replace-plain-text', pageId: PAGE, shapeId: '20', text: 'Dropped' },
		]);
		expect(await shape(bytes, '2')).toMatchObject({ width: 3.2, height: 0.9 });
		expect((await shape(bytes, '2'))!.style.fill).toBe('#ffcc00');
		expect(await shape(bytes, '20')).toMatchObject({ width: 1.5, height: 1 });
		expect((await shape(bytes, '20'))!.text.plainText).toBe('Dropped');
		expect((await page(bytes)).connectors).toHaveLength(glued);

		// Connect a sample box to the dropped shape.
		const from = (await shape(bytes, '1'))!,
			to = (await shape(bytes, '20'))!;
		const centre = (item: typeof from) => {
			const [, , , , x, y] = item.transform;
			return { x: x! + item.width / 2, y: y! + item.height / 2 };
		};
		const connector = visioConnectorCreationCommand(await page(bytes), centre(from), centre(to), {
			begin: '1',
			end: '20',
		});
		bytes = await apply(bytes, [connector]);
		expect(
			(await page(bytes)).connectors
				.filter((item) => item.fromShapeId === connector.shapeId)
				.map((item) => item.toShapeId)
				.sort(),
		).toEqual(['1', '20']);

		// Order, duplicate and copy.
		bytes = await apply(bytes, [
			{ type: 'reorder-shape', pageId: PAGE, shapeId: '4', order: 'front' },
		]);
		expect((await page(bytes)).shapes.at(-1)!.id).toBe('4');
		bytes = await apply(bytes, [
			{
				type: 'duplicate-shapes',
				pageId: PAGE,
				copies: [{ shapeId: '5', newShapeId: '30' }],
				offsetX: 0.25,
				offsetY: -0.25,
			},
		]);
		expect((await shape(bytes, '30'))!.masterId).toBe((await shape(bytes, '5'))!.masterId);
		const clipboard = await captureVisioClipboard(bytes, PAGE, ['5']);
		bytes = await apply(bytes, [
			{
				type: 'paste-shapes',
				pageId: PAGE,
				clipboard,
				copies: [{ shapeId: '5', newShapeId: '31' }],
				offsetX: 0.5,
				offsetY: -0.5,
			},
		]);
		expect((await shape(bytes, '31'))!.masterId).toBe((await shape(bytes, '5'))!.masterId);

		// Group the two copies, then delete the group's source shape and a copy-free instance.
		bytes = await apply(bytes, [
			{ type: 'group-shapes', pageId: PAGE, shapeId: '40', memberIds: ['30', '31'] },
		]);
		expect((await shape(bytes, '40'))!.children.map((child) => child.id).sort()).toEqual([
			'30',
			'31',
		]);
		const before = (await page(bytes)).shapes.length;
		bytes = await apply(bytes, [{ type: 'delete-shape', pageId: PAGE, shapeId: '5' }]);
		expect(await shape(bytes, '5')).toBeUndefined();
		expect((await page(bytes)).shapes).toHaveLength(before - 1);
		// The masters stay in the document stencil.
		expect((await parseVsdx(bytes)).masters!.map((master) => master.name)).toEqual([
			'Process',
			'Decision',
			'Rectangle',
		]);
	});
});
