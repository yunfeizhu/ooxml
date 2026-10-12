import { expect, it } from 'vitest';
import { editVsdx, type VisioEdit } from './edit';
import { parseVsdx } from './parser';
import { VisioPackage } from './package';
import { fixture } from './test-fixtures';
import { attribute, children } from './sheet';
import type { VisioConnectorRoute } from './edit-connector-commands';

const box = (shapeId: string, x: number, y: number): VisioEdit => ({
	type: 'create-rectangle',
	pageId: '0',
	shapeId,
	x,
	y,
	width: 1,
	height: 1,
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
/** Geometry rows as [type, x, y] in local coordinates. */
const geometry = (root: Element, id: string) =>
	children(
		children(shape(root, id), 'Section').find((node) => attribute(node, 'N') === 'Geometry'),
		'Row',
	).map((row) => {
		const get = (name: string) =>
			attribute(
				children(row, 'Cell').find((node) => attribute(node, 'N') === name),
				'V',
			);
		return [attribute(row, 'T'), Number(get('X')), Number(get('Y'))];
	});
async function connected(route: VisioConnectorRoute, y = 4): Promise<Uint8Array> {
	const blank = await fixture({ pages: [{ id: '0', contents: '' }] });
	const shapes = await editVsdx(blank, [box('1', 2, 2), box('2', 5, y)]);
	return (
		await editVsdx(shapes.bytes, [
			{
				type: 'create-line',
				pageId: '0',
				shapeId: '3',
				beginX: 0,
				beginY: 0,
				endX: 9,
				endY: 9,
				connect: { begin: '1', end: '2' },
				route,
			},
		])
	).bytes;
}

it('creates a right-angle connector in Visio dynamic-connector form', async () => {
	const bytes = await connected('right-angle');
	const root = await page(bytes);
	expect([value(root, '3', 'ShapeRouteStyle'), value(root, '3', 'ConLineRouteExt')]).toEqual([
		1, 1,
	]);
	expect(attribute(cell(root, '3', 'Width'), 'F')).toBe('EndX-BeginX');
	expect(attribute(cell(root, '3', 'Height'), 'F')).toBe('EndY-BeginY');
	expect(value(root, '3', 'Angle')).toBe(0);
	// Begin on the right side of 1, end on the left side of 2: one Z between the two.
	expect([value(root, '3', 'BeginX'), value(root, '3', 'BeginY')]).toEqual([2.5, 2]);
	expect([value(root, '3', 'EndX'), value(root, '3', 'EndY')]).toEqual([4.5, 4]);
	expect([value(root, '3', 'Width'), value(root, '3', 'Height')]).toEqual([2, 2]);
	expect(geometry(root, '3')).toEqual([
		['MoveTo', 0, 0],
		['LineTo', 1, 0],
		['LineTo', 1, 2],
		['LineTo', 2, 2],
	]);
	const model = await parseVsdx(bytes);
	const connector = model.pages[0]!.shapes[2]!;
	expect(connector.kind).toBe('connector');
	expect(connector.connectorRoute).toBe('right-angle');
	expect(connector.lineEnds).toEqual({ begin: { x: 0, y: 0 }, end: { x: 2, y: 2 } });
	expect(model.diagnostics.filter((d) => d.shapeId === '3')).toEqual([]);
});

it('recomputes the orthogonal route when a glued shape moves', async () => {
	const moved = await editVsdx(await connected('right-angle'), [
		{ type: 'move-shape', pageId: '0', shapeId: '2', x: 2, y: 5 },
	]);
	const root = await page(moved.bytes);
	// Shape 2 is now above shape 1: the facing sides are top and bottom.
	expect([value(root, '3', 'BeginX'), value(root, '3', 'BeginY')]).toEqual([2, 2.5]);
	expect([value(root, '3', 'EndX'), value(root, '3', 'EndY')]).toEqual([2, 4.5]);
	expect(geometry(root, '3')).toEqual([
		['MoveTo', 0, 0],
		['LineTo', 0, 2],
	]);
	expect(value(root, '3', 'Height')).toBe(2);
	expect(value(root, '3', 'PinY')).toBe(3.5);
	const resized = await editVsdx(moved.bytes, [
		{ type: 'resize-shape', pageId: '0', shapeId: '1', width: 2, height: 1 },
	]);
	expect(geometry(await page(resized.bytes), '3').every(([, x]) => x === 0)).toBe(true);
});

it('switches between right-angle, straight and curved routes', async () => {
	let bytes = await connected('right-angle');
	const route = async (value: VisioConnectorRoute) =>
		(
			await editVsdx(bytes, [
				{ type: 'set-connector-route', pageId: '0', shapeId: '3', route: value },
			])
		).bytes;
	bytes = await route('straight');
	let root = await page(bytes);
	expect([value(root, '3', 'ShapeRouteStyle'), value(root, '3', 'ConLineRouteExt')]).toEqual([
		16, 1,
	]);
	expect(attribute(cell(root, '3', 'Width'), 'F')).toBe('SQRT((EndX-BeginX)^2+(EndY-BeginY)^2)');
	expect(value(root, '3', 'Width')).toBeCloseTo(Math.hypot(2, 2), 12);
	expect(geometry(root, '3')).toHaveLength(2);
	// A straight connector still follows its shapes through the straight path.
	const moved = await editVsdx(bytes, [
		{ type: 'move-shape', pageId: '0', shapeId: '2', x: 5, y: 2 },
	]);
	root = await page(moved.bytes);
	expect([value(root, '3', 'EndX'), value(root, '3', 'EndY')]).toEqual([4.5, 2]);
	bytes = await route('curved');
	root = await page(bytes);
	expect(value(root, '3', 'ConLineRouteExt')).toBe(2);
	const rows = geometry(root, '3');
	expect(rows.map(([type]) => type)).toEqual(['MoveTo', 'NURBSTo']);
	expect(rows[1]!.slice(1)).toEqual([2, 2]);
	const model = await parseVsdx(bytes);
	expect(model.pages[0]!.shapes[2]!.connectorRoute).toBe('curved');
	expect(model.diagnostics.filter((d) => d.shapeId === '3').map((d) => d.code)).toEqual([
		'geometry-approximation',
	]);
	expect(model.pages[0]!.shapes[2]!.geometry[0]!.path).toMatch(/^M 0 0 /);
	bytes = await route('right-angle');
	expect(geometry(await page(bytes), '3')).toHaveLength(4);
	// The same route again changes nothing.
	expect(
		(
			await editVsdx(bytes, [
				{ type: 'set-connector-route', pageId: '0', shapeId: '3', route: 'right-angle' },
			])
		).changedParts,
	).toEqual([]);
});

it('moves, unglues and refuses transforms of a routed connector', async () => {
	const bytes = await connected('right-angle');
	const dragged = await editVsdx(bytes, [
		{ type: 'move-shape', pageId: '0', shapeId: '3', x: 3.5, y: 6 },
	]);
	let root = await page(dragged.bytes);
	expect(children(root, 'Connects')).toHaveLength(0);
	expect([value(root, '3', 'BeginX'), value(root, '3', 'BeginY')]).toEqual([2.5, 5]);
	expect([value(root, '3', 'EndX'), value(root, '3', 'EndY')]).toEqual([4.5, 7]);
	const endpoint = await editVsdx(bytes, [
		{ type: 'move-line-endpoint', pageId: '0', shapeId: '3', endpoint: 'end', x: 7, y: 1 },
	]);
	root = await page(endpoint.bytes);
	expect(children(children(root, 'Connects')[0], 'Connect')).toHaveLength(1);
	expect([value(root, '3', 'EndX'), value(root, '3', 'EndY')]).toEqual([7, 1]);
	const rows = geometry(root, '3');
	for (let i = 1; i < rows.length; i++)
		expect(rows[i]![1] === rows[i - 1]![1] || rows[i]![2] === rows[i - 1]![2]).toBe(true);
	for (const edit of [
		{ type: 'resize-shape', pageId: '0', shapeId: '3', width: 4, height: 0 },
		{ type: 'rotate-shape', pageId: '0', shapeId: '3', angle: 1 },
		{ type: 'flip-shape', pageId: '0', shapeId: '3', axis: 'horizontal' },
	] as VisioEdit[])
		await expect(editVsdx(bytes, [edit])).rejects.toThrow(/route/);
	const deleted = await editVsdx(bytes, [{ type: 'delete-shape', pageId: '0', shapeId: '1' }]);
	root = await page(deleted.bytes);
	expect(children(children(root, 'Connects')[0], 'Connect')).toHaveLength(1);
	// Formatting a routed connector keeps its glue.
	const formatted = await editVsdx(bytes, [
		{ type: 'format-shape', pageId: '0', shapeId: '3', lineColor: '#FF0000' },
	]);
	expect(children(children(await page(formatted.bytes), 'Connects')[0], 'Connect')).toHaveLength(2);
});
