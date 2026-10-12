import { describe, expect, it } from 'vitest';
import { editVsdx, type VisioEdit } from '../edit';
import { parseVsdx } from '../parser';
import { fixture } from '../test-fixtures';
import type { VisioPage } from '../model';
import { visioAutoAlignCommands, visioConnectorEdges, visioReLayoutCommands } from './auto-layout';

const box = (shapeId: string, x: number, y: number): VisioEdit => ({
	type: 'create-rectangle',
	pageId: '0',
	shapeId,
	x,
	y,
	width: 1,
	height: 0.5,
});
const line = (shapeId: string, begin: string, end: string): VisioEdit => ({
	type: 'create-line',
	pageId: '0',
	shapeId,
	beginX: 0,
	beginY: 0,
	endX: 1,
	endY: 1,
	connect: { begin, end },
});
async function flow(): Promise<Uint8Array> {
	const blank = await fixture({ pages: [{ id: '0', contents: '' }] });
	const shapes = await editVsdx(blank, [
		box('1', 1, 8),
		box('2', 6, 3),
		box('3', 2, 2),
		box('6', 7, 9),
	]);
	const first = await editVsdx(shapes.bytes, [line('4', '1', '2')]);
	return (await editVsdx(first.bytes, [line('5', '2', '3')])).bytes;
}
const pin = (page: VisioPage, id: string) =>
	page.shapes.find((shape) => shape.id === id)!.rotation!;

describe('visioReLayoutCommands', () => {
	it('lays a glued flowchart out top to bottom and its connectors follow', async () => {
		const bytes = await flow();
		const page = (await parseVsdx(bytes)).pages[0]!;
		expect(visioConnectorEdges(page)).toEqual([
			{ from: '1', to: '2' },
			{ from: '2', to: '3' },
		]);
		const plan = visioReLayoutCommands(page, 'flowchart-tb')!;
		expect(plan).toMatchObject({ placed: 4, skipped: 0, edges: 2 });
		expect(plan.commands.every((command) => command.type === 'move-shape')).toBe(true);
		const edited = await editVsdx(bytes, plan.commands);
		const after = (await parseVsdx(edited.bytes)).pages[0]!;
		const [a, b, c] = ['1', '2', '3'].map((id) => pin(after, id));
		expect(a!.pinX).toBeCloseTo(b!.pinX, 9);
		expect(b!.pinX).toBeCloseTo(c!.pinX, 9);
		expect(a!.pinY).toBeGreaterThan(b!.pinY);
		expect(b!.pinY).toBeGreaterThan(c!.pinY);
		// The unconnected shape goes below the flowchart.
		expect(pin(after, '6').pinY).toBeLessThan(c!.pinY);
		// Glued connectors were rerouted with the moves.
		const connector = after.shapes.find((shape) => shape.id === '4')!;
		const [, , , , e, f] = connector.transform;
		expect(e).toBeCloseTo(a!.pinX, 9);
		expect(f).toBeCloseTo(a!.pinY - 0.25, 9);
		expect(after.connectors).toHaveLength(4);
		// Laying the result out again is stable.
		expect(visioReLayoutCommands(after, 'flowchart-tb')!.commands).toEqual([]);
	});
	it('runs left to right, hierarchy, compact tree and circular layouts', async () => {
		const page = (await parseVsdx(await flow())).pages[0]!;
		const lr = await editVsdx(await flow(), visioReLayoutCommands(page, 'flowchart-lr')!.commands);
		const right = (await parseVsdx(lr.bytes)).pages[0]!;
		expect(pin(right, '2').pinX).toBeGreaterThan(pin(right, '1').pinX);
		expect(pin(right, '2').pinY).toBeCloseTo(pin(right, '1').pinY, 9);
		for (const style of ['hierarchy', 'compact-tree', 'circular'] as const)
			expect(visioReLayoutCommands(page, style)!.commands.length).toBeGreaterThan(0);
	});
	it('limits the layout to a selection and refuses unknown styles and small scopes', async () => {
		const page = (await parseVsdx(await flow())).pages[0]!;
		const plan = visioReLayoutCommands(page, 'flowchart-tb', ['1', '2'])!;
		expect(plan.placed).toBe(2);
		expect(
			plan.commands.every((command) =>
				['1', '2'].includes((command as { shapeId: string }).shapeId),
			),
		).toBe(true);
		expect(visioReLayoutCommands(page, 'spiral' as never)).toBeUndefined();
		expect(visioReLayoutCommands(page, 'flowchart-tb', ['1', '1'])).toBeUndefined();
		expect(
			visioReLayoutCommands({ ...page, shapes: page.shapes.slice(0, 1) }, 'circular'),
		).toBeUndefined();
	});
});

describe('visioAutoAlignCommands', () => {
	it('snaps nearly aligned shapes into a row with even spacing as one transaction', async () => {
		const blank = await fixture({ pages: [{ id: '0', contents: '' }] });
		const created = await editVsdx(blank, [box('1', 1, 5), box('2', 2.6, 5.15), box('3', 5, 4.9)]);
		const page = (await parseVsdx(created.bytes)).pages[0]!;
		const plan = visioAutoAlignCommands(page, ['1', '2', '3'])!;
		const after = (await parseVsdx((await editVsdx(created.bytes, plan.commands)).bytes)).pages[0]!;
		const [a, b, c] = ['1', '2', '3'].map((id) => pin(after, id));
		expect(a!.pinY).toBeCloseTo(b!.pinY, 9);
		expect(b!.pinY).toBeCloseTo(c!.pinY, 9);
		expect(b!.pinX - a!.pinX).toBeCloseTo(c!.pinX - b!.pinX, 9);
		expect(visioAutoAlignCommands(page, ['1'])?.placed).toBe(3);
		expect(visioAutoAlignCommands(page, ['1', '2'], -1)).toBeUndefined();
	});
});
