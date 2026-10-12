import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { editVsdx } from './edit';
import { parseVsdx } from './parser';
import { cell, fixture, rectangle, shape } from './test-fixtures';

const PAGE = 'visio/pages/page1.xml';
const RELS = 'visio/pages/_rels/page1.xml.rels';
const size = cell('PinX', 2) + cell('PinY', 2) + cell('Width', 1) + cell('Height', 0.75);
const process = shape('5', size + rectangle + '<Text>Step\n</Text>');
const group = shape(
	'5',
	size +
		`<Shapes>${shape('6', size + rectangle)}${shape('7', size + `<Shapes>${shape('8', size + rectangle)}</Shapes>`, 'Type="Group"')}</Shapes>`,
	'Type="Group"',
);
const connector = shape(
	'5',
	cell('BeginX', 0) + cell('BeginY', 0) + cell('EndX', 1) + cell('EndY', 1) + size,
);
const source = (
	masters: { id: string; shapes: string; attributes?: string; sheet?: string }[],
	contents = '<Shapes/>',
) => fixture({ masters, pages: [{ id: '0', contents }] });
const part = async (bytes: Uint8Array, path: string) =>
	(await JSZip.loadAsync(bytes)).file(path)!.async('string');
const drop = (bytes: Uint8Array, masterId: string, shapeId = '1') =>
	editVsdx(bytes, [{ type: 'insert-master-instance', pageId: '0', shapeId, masterId, x: 3, y: 4 }]);

describe('the document stencil', () => {
	it('lists visible masters with their names, page size and a preview', async () => {
		const model = await parseVsdx(
			await source([
				{
					id: '2',
					shapes: process,
					attributes: 'NameU="Process" Name="Prozess"',
					sheet: cell('PageWidth', 4) + cell('PageHeight', 3),
				},
				{ id: '4', shapes: connector, attributes: 'NameU="Dynamic connector"' },
				{ id: '6', shapes: process, attributes: 'NameU="Secret" Hidden="1"' },
				{ id: '7', shapes: process + process.replace('ID="5"', 'ID="9"') },
			]),
		);
		expect(model.masters!.map((master) => [master.id, master.name])).toEqual([
			['2', 'Prozess'],
			['4', 'Dynamic connector'],
			['7', 'Master 7'],
		]);
		const [first, line, pair] = model.masters!;
		expect(first).toMatchObject({
			nameU: 'Process',
			width: 4,
			height: 3,
			rootCount: 1,
			oneDimensional: false,
		});
		expect(first!.shapes[0]).toMatchObject({ width: 1, height: 0.75 });
		expect(first!.shapes[0]!.geometry.length).toBeGreaterThan(0);
		expect(first!.shapes[0]!.text.plainText).toBe('Step');
		expect(line!.oneDimensional).toBe(true);
		expect(pair!.rootCount).toBe(2);
		// Previews are not page shapes and add no diagnostics of their own.
		const plain = await parseVsdx(await fixture());
		expect(plain.masters).toBeUndefined();
		expect(model.diagnostics.map((item) => item.code)).toEqual(
			plain.diagnostics.map((item) => item.code),
		);
	});
});

describe('dropping a master on a page', () => {
	it('writes an instance with only its pin and links the page to the master', async () => {
		const bytes = await source([{ id: '2', shapes: process }]);
		const saved = await drop(bytes, '2');
		expect(saved.changedParts).toEqual([PAGE, RELS]);
		// What Visio writes for a dropped master: the reference and the pin, nothing inherited.
		expect(await part(saved.bytes, PAGE)).toContain(
			'<Shape ID="1" Type="Shape" Master="2"><Cell N="PinX" V="3"/><Cell N="PinY" V="4"/></Shape>',
		);
		expect(await part(saved.bytes, RELS)).toContain(
			'Type="http://schemas.microsoft.com/visio/2010/relationships/master" Target="../masters/master1.xml"',
		);
		const shapes = (await parseVsdx(saved.bytes)).pages[0]!.shapes;
		expect(shapes).toHaveLength(1);
		expect(shapes[0]).toMatchObject({ id: '1', masterId: '2', width: 1, height: 0.75 });
		expect(shapes[0]!.rotation).toMatchObject({ pinX: 3, pinY: 4 });
		expect(shapes[0]!.text.plainText).toBe('Step');
		// A second instance reuses the relationship.
		const again = await drop(saved.bytes, '2', '2');
		expect(again.changedParts).toEqual([PAGE]);
		expect((await parseVsdx(again.bytes)).pages[0]!.shapes).toHaveLength(2);
	});

	it('gives every sub-shape of a group master its own shape that names the master shape', async () => {
		const bytes = await source(
			[{ id: '2', shapes: group }],
			`<Shapes>${shape('2', size + rectangle)}</Shapes>`,
		);
		const saved = await drop(bytes, '2');
		expect(await part(saved.bytes, PAGE)).toContain(
			'<Shape ID="1" Type="Group" Master="2"><Cell N="PinX" V="3"/><Cell N="PinY" V="4"/>' +
				'<Shapes><Shape ID="3" Type="Shape" MasterShape="6"/>' +
				'<Shape ID="4" Type="Group" MasterShape="7"><Shapes><Shape ID="5" Type="Shape" MasterShape="8"/></Shapes></Shape>' +
				'</Shapes></Shape>',
		);
		const dropped = (await parseVsdx(saved.bytes)).pages[0]!.shapes[1]!;
		expect(dropped.kind).toBe('group');
		expect(dropped.children.map((child) => child.id)).toEqual(['3', '4']);
		expect(dropped.children[1]!.children[0]!.geometry.length).toBeGreaterThan(0);
	});

	it('refuses what it cannot instance and leaves the drawing alone', async () => {
		const bytes = await source(
			[
				{ id: '2', shapes: process },
				{ id: '4', shapes: connector },
				{ id: '7', shapes: process + process.replace('ID="5"', 'ID="9"') },
			],
			`<Shapes>${shape('2', size + cell('Width', 1, 'Sheet.9!Width'))}</Shapes>`,
		);
		await expect(drop(bytes, '4')).rejects.toMatchObject({ code: 'UNSUPPORTED_MASTER_INSTANCE' });
		// Several top-level shapes drop as a group (edit-instance-group.test.ts).
		await expect(drop(bytes, '7')).resolves.toMatchObject({ changedParts: expect.any(Array) });
		await expect(drop(bytes, '3')).rejects.toMatchObject({ code: 'EDIT_TARGET_NOT_FOUND' });
		await expect(drop(bytes, '2', '2')).rejects.toMatchObject({ code: 'INVALID_SHAPE_ID' });
		// A dangling Sheet.9! formula must not start pointing at the new shape.
		await expect(drop(bytes, '2', '9')).rejects.toMatchObject({ code: 'INVALID_SHAPE_ID' });
		// Other edits of the call run after the drop; one that is refused fails the whole call.
		await expect(
			editVsdx(bytes, [
				{ type: 'insert-master-instance', pageId: '0', shapeId: '1', masterId: '2', x: 1, y: 1 },
				{ type: 'delete-shape', pageId: '0', shapeId: '77' },
			]),
		).rejects.toThrow();
		await expect(
			editVsdx(bytes, [
				{
					type: 'insert-master-instance',
					pageId: '0',
					shapeId: '1',
					masterId: '2',
					x: Number.NaN,
					y: 1,
				},
			]),
		).rejects.toMatchObject({ code: 'INVALID_EDIT' });
	});
});
