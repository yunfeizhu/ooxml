import { describe, expect, it } from 'vitest';
import { createVsdx } from './create-document';
import { parseVsdx } from './parser';
import { editVsdx } from './edit';
import { VisioPackage } from './package';
import type { VisioDataColumn } from './data-recordsets';

const columns: VisioDataColumn[] = [
	{ name: 'Name', label: 'Name', type: 'string' },
	{ name: 'Cost Center', label: 'Cost center', type: 'number' },
	{ name: 'Due', label: 'Due', type: 'date' },
];
const rows = [
	['Web', '10', '2024-01-05'],
	['Database', '25.5', ''],
];
async function drawing(): Promise<Uint8Array> {
	return (
		await editVsdx(await createVsdx(), [
			{ type: 'create-rectangle', pageId: '0', shapeId: '1', x: 2, y: 2, width: 2, height: 1 },
			{ type: 'create-rectangle', pageId: '0', shapeId: '2', x: 5, y: 2, width: 2, height: 1 },
		])
	).bytes;
}
const text = async (bytes: Uint8Array, path: string) =>
	new TextDecoder().decode(await (await VisioPackage.open(bytes)).readBytes(path));
async function imported(): Promise<Uint8Array> {
	return (
		await editVsdx(await drawing(), [
			{ type: 'import-data-recordset', pageId: '0', name: 'servers.csv', columns, rows },
		])
	).bytes;
}

describe('external data recordsets', () => {
	it('imports a table as DataRecordSets parts with relationships and content types', async () => {
		const bytes = await imported();
		const pkg = await VisioPackage.open(bytes);
		expect(pkg.has('visio/data/recordsets.xml')).toBe(true);
		expect(pkg.has('visio/data/data1.xml')).toBe(true);
		const types = await text(bytes, '[Content_Types].xml');
		expect(types).toContain(
			'<Override PartName="/visio/data/recordsets.xml" ContentType="application/vnd.ms-visio.recordsets+xml"/>',
		);
		expect(types).toContain('ContentType="application/vnd.ms-visio.recordset+xml"');
		expect(await text(bytes, 'visio/_rels/document.xml.rels')).toContain(
			'Type="http://schemas.microsoft.com/visio/2010/relationships/recordsets" Target="data/recordsets.xml"',
		);
		expect(await text(bytes, 'visio/data/_rels/recordsets.xml.rels')).toContain(
			'Target="data1.xml"',
		);
		expect(await text(bytes, 'visio/data/data1.xml')).toContain(
			'<z:row c0="Web" c1="10" c2="2024-01-05T00:00:00"/>',
		);
		const document = await parseVsdx(bytes);
		expect(document.dataRecordsets).toEqual([
			expect.objectContaining({
				id: '0',
				name: 'servers.csv',
				columns,
				rows: [
					{ id: '1', values: ['Web', '10', '2024-01-05T00:00:00'] },
					{ id: '2', values: ['Database', '25.5', ''] },
				],
				links: [],
			}),
		]);
	});

	it('links shapes to rows as linked Shape Data that survives save and reload', async () => {
		const linked = await editVsdx(await imported(), [
			{
				type: 'link-data-rows',
				pageId: '0',
				recordsetId: '0',
				links: [
					{ shapeId: '1', rowId: '1' },
					{ shapeId: '2', rowId: '2' },
				],
			},
		]);
		const document = await parseVsdx(linked.bytes);
		expect(document.dataRecordsets![0]!.links).toEqual([
			{ rowId: '1', pageId: '0', shapeId: '1' },
			{ rowId: '2', pageId: '0', shapeId: '2' },
		]);
		const [first, second] = document.pages[0]!.shapes;
		expect(
			first!.shapeData!.map((row) => [row.name, row.label, row.value, row.dataLinked]),
		).toEqual([
			['Name', 'Name', 'Web', true],
			['Cost_Center', 'Cost center', 10, true],
			['Due', 'Due', 45296, true],
		]);
		expect(second!.shapeData![1]).toMatchObject({ value: 25.5 });
		expect(await text(linked.bytes, 'visio/data/recordsets.xml')).toContain(
			'<RowMap RowID="1" PageID="0" ShapeID="1"/>',
		);
		// Relinking replaces the shape's RowMap instead of adding a second one.
		const relinked = await editVsdx(linked.bytes, [
			{
				type: 'link-data-rows',
				pageId: '0',
				recordsetId: '0',
				links: [{ shapeId: '1', rowId: '2' }],
			},
		]);
		const again = await parseVsdx(relinked.bytes);
		expect(again.dataRecordsets![0]!.links).toEqual([
			{ rowId: '2', pageId: '0', shapeId: '2' },
			{ rowId: '2', pageId: '0', shapeId: '1' },
		]);
		expect(again.pages[0]!.shapes[0]!.shapeData![0]).toMatchObject({ value: 'Database' });
	});

	it('refreshes linked values by row order, unlinks and deletes recordsets', async () => {
		const linked = await editVsdx(await imported(), [
			{
				type: 'link-data-rows',
				pageId: '0',
				recordsetId: '0',
				links: [
					{ shapeId: '1', rowId: '1' },
					{ shapeId: '2', rowId: '2' },
				],
			},
		]);
		const refreshed = await editVsdx(linked.bytes, [
			{
				type: 'refresh-data-recordset',
				pageId: '0',
				recordsetId: '0',
				columns,
				rows: [['Web 2', '11', '']],
			},
		]);
		let document = await parseVsdx(refreshed.bytes);
		expect(document.dataRecordsets![0]!.links).toEqual([{ rowId: '1', pageId: '0', shapeId: '1' }]);
		expect(document.pages[0]!.shapes[0]!.shapeData![0]).toMatchObject({
			value: 'Web 2',
			dataLinked: true,
		});
		// The shape whose row disappeared keeps its values, no longer linked.
		expect(document.pages[0]!.shapes[1]!.shapeData![0]).toMatchObject({ value: 'Database' });
		expect(document.pages[0]!.shapes[1]!.shapeData![0]!.dataLinked).toBeUndefined();
		const unlinked = await editVsdx(refreshed.bytes, [
			{ type: 'unlink-data-rows', pageId: '0', recordsetId: '0', shapeIds: ['1'] },
		]);
		document = await parseVsdx(unlinked.bytes);
		expect(document.dataRecordsets![0]!.links).toEqual([]);
		expect(document.pages[0]!.shapes[0]!.shapeData![0]).toMatchObject({ value: 'Web 2' });
		const deleted = await editVsdx(unlinked.bytes, [
			{ type: 'delete-data-recordset', pageId: '0', recordsetId: '0' },
		]);
		const pkg = await VisioPackage.open(deleted.bytes);
		expect(pkg.has('visio/data/recordsets.xml')).toBe(false);
		expect(pkg.has('visio/data/data1.xml')).toBe(false);
		expect(await text(deleted.bytes, '[Content_Types].xml')).not.toContain('recordset');
		expect(await text(deleted.bytes, 'visio/_rels/document.xml.rels')).not.toContain('recordsets');
		expect((await parseVsdx(deleted.bytes)).dataRecordsets).toBeUndefined();
	});

	it('keeps a second recordset when another is deleted and refuses invalid commands', async () => {
		const two = await editVsdx(await imported(), [
			{
				type: 'import-data-recordset',
				pageId: '0',
				name: 'more',
				columns: [columns[0]!],
				rows: [['X']],
			},
		]);
		expect((await parseVsdx(two.bytes)).dataRecordsets!.map((set) => set.id)).toEqual(['0', '1']);
		const one = await editVsdx(two.bytes, [
			{ type: 'delete-data-recordset', pageId: '0', recordsetId: '0' },
		]);
		expect((await parseVsdx(one.bytes)).dataRecordsets!.map((set) => [set.id, set.name])).toEqual([
			['1', 'more'],
		]);
		await expect(
			editVsdx(one.bytes, [
				{
					type: 'link-data-rows',
					pageId: '0',
					recordsetId: '1',
					links: [{ shapeId: '1', rowId: '5' }],
				},
			]),
		).rejects.toMatchObject({ code: 'EDIT_TARGET_NOT_FOUND' });
		await expect(
			editVsdx(one.bytes, [
				{
					type: 'import-data-recordset',
					pageId: '0',
					name: 'bad',
					columns: [columns[1]!],
					rows: [['abc']],
				},
			]),
		).rejects.toMatchObject({ code: 'INVALID_EDIT' });
		await expect(
			editVsdx(one.bytes, [
				{ type: 'delete-data-recordset', pageId: '0', recordsetId: '1' },
				{ type: 'move-shape', pageId: '0', shapeId: '1', x: 1, y: 1 },
			]),
		).rejects.toMatchObject({ code: 'EDIT_MIXED_DATA_TRANSACTION' });
	});
});
