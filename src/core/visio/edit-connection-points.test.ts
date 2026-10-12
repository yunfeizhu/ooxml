import { expect, it } from 'vitest';
import { editVsdx, type VisioEdit } from './edit';
import { parseVsdx } from './parser';
import { VisioPackage } from './package';
import { fixture } from './test-fixtures';
import { attribute, children } from './sheet';
import { snapshotEdits } from './ui/edit-commands';

const box = (shapeId: string, x: number, y: number): VisioEdit => ({
	type: 'create-rectangle',
	pageId: '0',
	shapeId,
	x,
	y,
	width: 1,
	height: 1,
});
const point = (shapeId: string, x: number, y: number): VisioEdit => ({
	type: 'add-connection-point',
	pageId: '0',
	shapeId,
	x,
	y,
});
async function page(bytes: Uint8Array): Promise<Element> {
	return (await VisioPackage.open(bytes)).readXml('visio/pages/page1.xml');
}
const shape = (root: Element, id: string) =>
	Array.from(root.getElementsByTagName('Shape')).find((node) => attribute(node, 'ID') === id)!;
const cell = (root: Element, id: string, name: string) =>
	children(shape(root, id), 'Cell').find((node) => attribute(node, 'N') === name);
const value = (root: Element, id: string, name: string) =>
	Number(attribute(cell(root, id, name), 'V'));
const connects = (root: Element) =>
	children(children(root, 'Connects')[0], 'Connect').map((node) =>
		['FromSheet', 'FromCell', 'ToSheet', 'ToCell', 'ToPart'].map((name) => attribute(node, name)),
	);
const rows = (root: Element, id: string) =>
	children(
		children(shape(root, id), 'Section').find((node) => attribute(node, 'N') === 'Connection'),
		'Row',
	).map((row) => [
		attribute(row, 'IX'),
		...children(row, 'Cell')
			.filter((node) => ['X', 'Y'].includes(attribute(node, 'N')!))
			.map((node) => attribute(node, 'F')),
	]);

async function twoBoxes(): Promise<Uint8Array> {
	const blank = await fixture({ pages: [{ id: '0', contents: '' }] });
	return (await editVsdx(blank, [box('1', 2, 2), box('2', 5, 4)])).bytes;
}

it('adds connection points with relative formulas that follow resizing', async () => {
	const bytes = (await editVsdx(await twoBoxes(), [point('1', 1, 0.25), point('1', 0.5, 1)])).bytes;
	let root = await page(bytes);
	expect(rows(root, '1')).toEqual([
		['0', 'Width*1', 'Height*0.25'],
		['1', 'Width*0.5', 'Height*1'],
	]);
	let model = await parseVsdx(bytes);
	expect(model.pages[0]!.shapes[0]!.connectionPoints).toEqual([
		{ index: 0, x: 1, y: 0.25, inherited: false },
		{ index: 1, x: 0.5, y: 1, inherited: false },
	]);
	const resized = await editVsdx(bytes, [
		{ type: 'resize-shape', pageId: '0', shapeId: '1', width: 2, height: 2 },
	]);
	model = await parseVsdx(resized.bytes);
	expect(model.pages[0]!.shapes[0]!.connectionPoints?.map((p) => [p.x, p.y])).toEqual([
		[2, 0.5],
		[1, 2],
	]);
	root = await page(resized.bytes);
	expect(rows(root, '1')).toHaveLength(2);
	await expect(editVsdx(bytes, [point('1', 1, 0.25)])).rejects.toThrow(/already/);
	await expect(editVsdx(bytes, [point('1', 1.5, 0)])).rejects.toThrow();
	expect(() => snapshotEdits([point('1', -1, 0)])).toThrow();
});

it('glues connector ends to connection points with native point glue', async () => {
	const withPoints = (
		await editVsdx(await twoBoxes(), [point('1', 1, 0.5), point('2', 0, 0.25), point('2', 0, 0.75)])
	).bytes;
	const glued = await editVsdx(withPoints, [
		{
			type: 'create-line',
			pageId: '0',
			shapeId: '3',
			beginX: 0,
			beginY: 0,
			endX: 1,
			endY: 1,
			connect: { begin: '1', beginPoint: 0, end: '2', endPoint: 1 },
		},
	]);
	let root = await page(glued.bytes);
	expect(attribute(cell(root, '3', 'BeginX'), 'F')).toBe(
		'PAR(PNT(Sheet.1!Connections.X1,Sheet.1!Connections.Y1))',
	);
	expect(attribute(cell(root, '3', 'EndY'), 'F')).toBe(
		'PAR(PNT(Sheet.2!Connections.X2,Sheet.2!Connections.Y2))',
	);
	expect(connects(root)).toEqual([
		['3', 'BeginX', '1', 'Connections.X1', '100'],
		['3', 'EndX', '2', 'Connections.X2', '101'],
	]);
	expect([value(root, '3', 'BeginX'), value(root, '3', 'BeginY')]).toEqual([2.5, 2]);
	expect([value(root, '3', 'EndX'), value(root, '3', 'EndY')]).toEqual([4.5, 4.25]);
	const moved = await editVsdx(glued.bytes, [
		{ type: 'move-shape', pageId: '0', shapeId: '2', x: 6, y: 3 },
	]);
	root = await page(moved.bytes);
	expect([value(root, '3', 'EndX'), value(root, '3', 'EndY')]).toEqual([5.5, 3.25]);
	expect(connects(root)).toHaveLength(2);
	expect((await parseVsdx(moved.bytes)).pages[0]!.connectors).toHaveLength(2);

	// Deleting point 0 of shape 2 renumbers point 1, and the glued end follows its row.
	const deleted = await editVsdx(glued.bytes, [
		{ type: 'delete-connection-point', pageId: '0', shapeId: '2', index: 0 },
	]);
	root = await page(deleted.bytes);
	expect(rows(root, '2')).toEqual([['0', 'Width*0', 'Height*0.75']]);
	expect(connects(root)).toEqual([
		['3', 'BeginX', '1', 'Connections.X1', '100'],
		['3', 'EndX', '2', 'Connections.X1', '100'],
	]);
	expect(attribute(cell(root, '3', 'EndX'), 'F')).toBe(
		'PAR(PNT(Sheet.2!Connections.X1,Sheet.2!Connections.Y1))',
	);
	// Deleting the point an end is glued to unglues that end where it is.
	const unglued = await editVsdx(deleted.bytes, [
		{ type: 'delete-connection-point', pageId: '0', shapeId: '2', index: 0 },
	]);
	root = await page(unglued.bytes);
	expect(connects(root)).toEqual([['3', 'BeginX', '1', 'Connections.X1', '100']]);
	expect(attribute(cell(root, '3', 'EndX'), 'F')).toBeUndefined();
	expect(value(root, '3', 'EndY')).toBe(4.25);
	expect(
		children(shape(root, '2'), 'Section').some((s) => attribute(s, 'N') === 'Connection'),
	).toBe(false);
	await expect(
		editVsdx(unglued.bytes, [
			{ type: 'delete-connection-point', pageId: '0', shapeId: '2', index: 0 },
		]),
	).rejects.toThrow(/does not exist/);
});

it('re-glues an existing connector end to a shape or a point and refuses other cases', async () => {
	const withPoint = (await editVsdx(await twoBoxes(), [point('2', 0.5, 0)])).bytes;
	const free = (
		await editVsdx(withPoint, [
			{
				type: 'create-line',
				pageId: '0',
				shapeId: '3',
				beginX: 0,
				beginY: 0,
				endX: 1,
				endY: 1,
				connect: { begin: '1' },
			},
		])
	).bytes;
	const toShape = await editVsdx(free, [
		{ type: 'glue-connector', pageId: '0', shapeId: '3', endpoint: 'end', target: '2' },
	]);
	let root = await page(toShape.bytes);
	expect(connects(root).map((row) => row.slice(0, 4))).toEqual([
		['3', 'BeginX', '1', 'PinX'],
		['3', 'EndX', '2', 'PinX'],
	]);
	const toPoint = await editVsdx(toShape.bytes, [
		{ type: 'glue-connector', pageId: '0', shapeId: '3', endpoint: 'end', target: '2', point: 0 },
	]);
	root = await page(toPoint.bytes);
	expect(connects(root)[1]).toEqual(['3', 'EndX', '2', 'Connections.X1', '100']);
	expect([value(root, '3', 'EndX'), value(root, '3', 'EndY')]).toEqual([5, 3.5]);
	for (const edit of [
		{ type: 'glue-connector', pageId: '0', shapeId: '3', endpoint: 'end', target: '1' },
		{ type: 'glue-connector', pageId: '0', shapeId: '3', endpoint: 'end', target: '2', point: 4 },
		{ type: 'glue-connector', pageId: '0', shapeId: '1', endpoint: 'end', target: '2' },
	] as VisioEdit[])
		await expect(editVsdx(toPoint.bytes, [edit])).rejects.toThrow();
	const line = await editVsdx(withPoint, [
		{ type: 'create-line', pageId: '0', shapeId: '3', beginX: 0, beginY: 0, endX: 1, endY: 0 },
	]);
	await expect(
		editVsdx(line.bytes, [
			{ type: 'glue-connector', pageId: '0', shapeId: '3', endpoint: 'end', target: '2' },
		]),
	).rejects.toThrow(/Connector tool/);
	await expect(editVsdx(line.bytes, [point('3', 0.5, 0)])).rejects.toThrow(/2D shapes/);
});
