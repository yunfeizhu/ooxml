import { describe, expect, it } from 'vitest';
import { editVsdx, parseVsdx } from '../index';
import { cell, fixture, rectangle, shape } from '../test-fixtures';
import {
	visioMasterDropCommand,
	visioMasterDropRefusal,
	visioMasterDropSize,
	visioMasterPreviewBox,
} from './master-drop';

const box = cell('PinX', 2) + cell('PinY', 2) + cell('Width', 1) + cell('Height', 0.5);
const local = cell('LocPinX', 0.5) + cell('LocPinY', 0.25);
const line = cell('BeginX', 0) + cell('BeginY', 0) + cell('EndX', 1) + cell('EndY', 1);
const drawing = () =>
	fixture({
		masters: [
			{
				id: '2',
				shapes: shape('5', box + local + rectangle),
				attributes: 'NameU="Process"',
				sheet: cell('PageWidth', 4) + cell('PageHeight', 4),
			},
			{ id: '4', shapes: shape('5', line + box), attributes: 'NameU="Dynamic connector"' },
			{ id: '6', shapes: shape('5', box) + shape('6', box), attributes: 'NameU="Pair"' },
		],
		pages: [{ id: '0', contents: `<Shapes>${shape('7', box + rectangle)}</Shapes>` }],
	});

describe('dropping a document-stencil master', () => {
	it('says why a master cannot be dropped', async () => {
		const [process, connector, pair] = (await parseVsdx(await drawing())).masters!;
		expect(visioMasterDropRefusal(process!)).toBeUndefined();
		// A line master that is not built like Visio's Dynamic connector is not dropped.
		expect(visioMasterDropRefusal(connector!)).toMatch(/Dynamic connector/);
		expect(visioMasterDropRefusal({ ...connector!, dynamicConnector: true })).toBeUndefined();
		// Several top-level shapes drop as the group Visio makes.
		expect(visioMasterDropRefusal(pair!)).toBeUndefined();
		const page = (await parseVsdx(await drawing())).pages[0]!;
		expect(() => visioMasterDropCommand(page, connector!)).toThrow(/Dynamic connector/);
	});

	it('crops the preview to the shape, not the master page', async () => {
		const [process] = (await parseVsdx(await drawing())).masters!;
		expect(visioMasterDropSize(process!)).toEqual({ width: 1, height: 0.5 });
		const preview = visioMasterPreviewBox(process!);
		expect(preview.x).toBeCloseTo(1.5);
		expect(preview.y).toBeCloseTo(1.75);
		expect(preview.width).toBeCloseTo(1);
		expect(preview.height).toBeCloseTo(0.5);
		expect(visioMasterPreviewBox({ ...process!, shapes: [] })).toEqual({
			x: 0,
			y: 0,
			width: 4,
			height: 4,
		});
	});

	it('drops at the pointer, kept on the page, as an edit the core applies', async () => {
		const bytes = await drawing();
		const model = await parseVsdx(bytes);
		const page = model.pages[0]!,
			master = model.masters![0]!;
		// Pointer positions are y down; the edit is y up.
		expect(visioMasterDropCommand(page, master, { x: 3, y: 1 })).toEqual({
			type: 'insert-master-instance',
			pageId: '0',
			shapeId: '8',
			masterId: '2',
			x: 3,
			y: 10,
		});
		expect(visioMasterDropCommand(page, master)).toMatchObject({ x: 4.25, y: 5.5 });
		expect(visioMasterDropCommand(page, master, { x: -5, y: 99 })).toMatchObject({
			x: 0.5,
			y: 0.25,
		});
		const saved = await editVsdx(bytes, [visioMasterDropCommand(page, master, { x: 3, y: 1 })]);
		const dropped = (await parseVsdx(saved.bytes)).pages[0]!.shapes.find(
			(item) => item.id === '8',
		)!;
		expect(dropped).toMatchObject({ masterId: '2', width: 1, height: 0.5 });
	});
});
