import { expect, it } from 'vitest';
import JSZip from 'jszip';
import { editVsdx, type VisioEdit } from './edit';
import { parseVsdx } from './parser';
import { VisioPackage } from './package';
import { fixture, shape as fixtureShape } from './test-fixtures';
import { attribute, children } from './sheet';
import { connectorObstacles } from './edit-connector-obstacles';
import { routeCrossings } from './connector-route-avoid';
import { visioConnectorMovePreviews } from './ui/connector-preview';

const box = (shapeId: string, x: number, y: number, height = 1): VisioEdit => ({
	type: 'create-rectangle',
	pageId: '0',
	shapeId,
	x,
	y,
	width: 1,
	height,
});
async function page(bytes: Uint8Array): Promise<Element> {
	return (await VisioPackage.open(bytes)).readXml('visio/pages/page1.xml');
}
const shape = (root: Element, id: string) =>
	Array.from(root.getElementsByTagName('Shape')).find((node) => attribute(node, 'ID') === id)!;
const value = (root: Element, id: string, name: string) =>
	Number(
		attribute(
			children(shape(root, id), 'Cell').find((node) => attribute(node, 'N') === name),
			'V',
		),
	);
/** The connector's route in page coordinates, from its begin point and local Geometry rows. */
function route(root: Element, id: string) {
	const begin = { x: value(root, id, 'BeginX'), y: value(root, id, 'BeginY') };
	return children(
		children(shape(root, id), 'Section').find((node) => attribute(node, 'N') === 'Geometry'),
		'Row',
	).map((row) => {
		const get = (name: string) =>
			Number(
				attribute(
					children(row, 'Cell').find((node) => attribute(node, 'N') === name),
					'V',
				),
			);
		return { x: begin.x + get('X'), y: begin.y + get('Y') };
	});
}
const connect = (shapeId: string, begin: string, end: string): VisioEdit => ({
	type: 'create-line',
	pageId: '0',
	shapeId,
	beginX: 0,
	beginY: 0,
	endX: 9,
	endY: 9,
	connect: { begin, end },
	route: 'right-angle',
});
/**
 * Shapes 1 and 2 with a three-inch-tall shape 4 between them and a plain rectangle 7 beside it.
 * Connector 6 glues 4 to 5 first, which makes them placeable as in Visio; connector 3 then joins
 * 1 and 2.
 */
async function blocked(masters = false): Promise<Uint8Array> {
	const blank = await fixture({
		pages: [{ id: '0', contents: '' }],
		...(masters ? { masters: [{ id: '1', shapes: fixtureShape('5') }] } : {}),
	});
	const shapes = await editVsdx(blank, [
		box('1', 2, 4),
		box('2', 8, 4),
		box('4', 5, 4, 3),
		box('5', 5, 9),
		box('7', 3.5, 4, 0.2),
	]);
	const glued = await editVsdx(shapes.bytes, [connect('6', '4', '5')]);
	return (await editVsdx(glued.bytes, [connect('3', '1', '2')])).bytes;
}
const tall = { minX: 4.5, minY: 2.5, maxX: 5.5, maxY: 5.5 };
const far = { minX: 4.5, minY: 8.5, maxX: 5.5, maxY: 9.5 };

it('marks glued shapes placeable and reads only placeable shapes as obstacles', async () => {
	const root = await page(await blocked());
	// Recorded from Visio: gluing a dynamic connector turns ObjType 0 into 1 on both shapes.
	for (const id of ['1', '2', '4', '5']) expect(value(root, id, 'ObjType')).toBe(1);
	expect(
		children(shape(root, '7'), 'Cell').some((node) => attribute(node, 'N') === 'ObjType'),
	).toBe(false);
	expect(connectorObstacles(root, new Set(['1', '2', '3']))).toEqual([tall, far]);
	// Connectors and the plain rectangle 7 are never obstacles, even when nothing is excluded.
	expect(connectorObstacles(root, new Set())).toHaveLength(4);
	const model = (await parseVsdx(await blocked())).pages[0]!;
	expect(model.shapes.filter((item) => item.placeable).map((item) => item.id)).toEqual([
		'1',
		'2',
		'4',
		'5',
	]);
});

it('draws a new right-angle connector around a shape between its ends', async () => {
	const bytes = await blocked();
	const root = await page(bytes);
	const path = route(root, '3');
	expect(path[0]).toEqual({ x: 2.5, y: 4 });
	expect(path.at(-1)).toEqual({ x: 7.5, y: 4 });
	expect(routeCrossings(path, [tall])).toBe(0);
	// As recorded from Visio for this scene: the route turns 3/16 inch before the shape and
	// passes 3/16 inch over it.
	expect(path[1]).toEqual({ x: 4.3125, y: 4 });
	expect(Math.max(...path.map((point) => point.y))).toBeCloseTo(5.6875, 9);
	// The plain rectangle 7 on the way is not placeable, so the route runs through it, as in Visio.
	expect(routeCrossings(path, [{ minX: 3, minY: 3.9, maxX: 4, maxY: 4.1 }])).toBe(1);
	for (let i = 1; i < path.length; i++)
		expect(path[i]!.x === path[i - 1]!.x || path[i]!.y === path[i - 1]!.y).toBe(true);
	// Still Visio's dynamic-connector form, and the saved file reads back without complaint.
	expect(value(root, '3', 'Width')).toBe(5);
	expect(value(root, '3', 'Height')).toBe(0);
	const model = await parseVsdx(bytes);
	expect(model.diagnostics.filter((item) => item.shapeId === '3')).toEqual([]);
	expect(model.pages[0]!.shapes.find((item) => item.id === '3')!.connectorRoute).toBe(
		'right-angle',
	);
});

it('keeps clear of the shape when a glued shape moves, as the drag preview shows', async () => {
	const bytes = await blocked();
	const before = (await parseVsdx(bytes)).pages[0]!;
	const [preview] = visioConnectorMovePreviews(before, new Set(['2']), { x: 0, y: 1 });
	const moved = await editVsdx(bytes, [
		{ type: 'move-shape', pageId: '0', shapeId: '2', x: 8, y: 5 },
	]);
	const root = await page(moved.bytes);
	const path = route(root, '3');
	expect(routeCrossings(path, [tall])).toBe(0);
	// The preview is the committed route (the preview's y axis points down).
	expect(preview!.points.map((point) => ({ x: point.x, y: before.height - point.y }))).toEqual(
		path,
	);
	// Moving the blocker away lets the next reroute take the direct route again.
	const cleared = await editVsdx(moved.bytes, [
		{ type: 'move-shape', pageId: '0', shapeId: '4', x: 5, y: 9.5 },
		{ type: 'move-shape', pageId: '0', shapeId: '2', x: 8, y: 4 },
	]);
	expect(route(await page(cleared.bytes), '3')).toEqual([
		{ x: 2.5, y: 4 },
		{ x: 7.5, y: 4 },
	]);
});

it('leaves straight and curved connectors alone', async () => {
	const bytes = await blocked();
	const straight = await editVsdx(bytes, [
		{ type: 'set-connector-route', pageId: '0', shapeId: '3', route: 'straight' },
	]);
	expect(route(await page(straight.bytes), '3')).toHaveLength(2);
});

it('refuses a stencil connector with a plain reason and leaves the file alone', async () => {
	const zip = await JSZip.loadAsync(await blocked(true));
	const part = 'visio/pages/page1.xml';
	const xml = await zip.file(part)!.async('string');
	// As Visio's Dynamic connector: the same glue, on an instance of a master.
	const instance = xml.replace(/(<Shape\b[^>]*\bID=["']3["'])/, '$1 Master="1"');
	expect(instance).not.toBe(xml);
	zip.file(part, instance);
	const bytes = await zip.generateAsync({ type: 'uint8array' });
	for (const edit of [
		{ type: 'move-shape', pageId: '0', shapeId: '2', x: 8, y: 5 },
		{ type: 'move-shape', pageId: '0', shapeId: '3', x: 5, y: 6 },
		{ type: 'set-connector-route', pageId: '0', shapeId: '3', route: 'straight' },
	] as VisioEdit[])
		await expect(editVsdx(bytes, [edit])).rejects.toThrow(/comes from a stencil/);
});
