import { describe, expect, it } from 'vitest';
import { editVsdx, type VisioEdit } from './edit';
import { parseVsdx } from './parser';
import { VisioPackage } from './package';
import { fixture } from './test-fixtures';
import { attribute, children } from './sheet';
import { snapshotEdits } from './ui/edit-commands';
import { VISIO_CONTAINER_HEADING, VISIO_CONTAINER_MARGIN } from './edit-diagram-parts-commands';

const box = (shapeId: string, x: number, y: number, width = 1, height = 1): VisioEdit => ({
	type: 'create-rectangle',
	pageId: '0',
	shapeId,
	x,
	y,
	width,
	height,
});
async function two(): Promise<Uint8Array> {
	const blank = await fixture({ pages: [{ id: '0', contents: '' }] });
	return (await editVsdx(blank, [box('1', 2, 2), box('2', 5, 3, 2, 1)])).bytes;
}
async function pageRoot(bytes: Uint8Array): Promise<Element> {
	return (await VisioPackage.open(bytes)).readXml('visio/pages/page1.xml');
}
const sheet = (root: Element, id: string) =>
	Array.from(root.getElementsByTagName('Shape')).find((node) => attribute(node, 'ID') === id)!;
const value = (root: Element, id: string, name: string) =>
	Number(
		attribute(
			children(sheet(root, id), 'Cell').find((node) => attribute(node, 'N') === name),
			'V',
		),
	);
const order = (root: Element) =>
	children(children(root, 'Shapes')[0], 'Shape').map((node) => attribute(node, 'ID'));
const container = (memberIds: string[], style = 'classic'): VisioEdit =>
	({
		type: 'insert-container',
		pageId: '0',
		shapeId: '3',
		memberIds,
		style,
		heading: 'Team',
	}) as VisioEdit;

describe('insert-container', () => {
	it('frames the members with a margin and heading, behind them, and round-trips', async () => {
		const saved = await editVsdx(await two(), [container(['1', '2'])]);
		expect(saved.diagnostics.map((item) => item.code)).toContain('edit-diagram-part-approximate');
		const root = await pageRoot(saved.bytes);
		// Behind the lowest member; members stay top-level page shapes.
		expect(order(root)).toEqual(['3', '1', '2']);
		const margin = VISIO_CONTAINER_MARGIN;
		// Members span x 1.5..6 and y 1.5..3.5.
		expect(value(root, '3', 'Width')).toBeCloseTo(4.5 + 2 * margin, 12);
		expect(value(root, '3', 'Height')).toBeCloseTo(2 + 2 * margin + VISIO_CONTAINER_HEADING, 12);
		expect(value(root, '3', 'PinX') - value(root, '3', 'Width') / 2).toBeCloseTo(1.5 - margin, 12);
		expect(value(root, '3', 'PinY') - value(root, '3', 'Height') / 2).toBeCloseTo(1.5 - margin, 12);
		const model = await parseVsdx(saved.bytes);
		const shapes = model.pages[0]!.shapes;
		expect(shapes.map((shape) => shape.id)).toEqual(['3', '1', '2']);
		expect(shapes[0]!.structure).toEqual({ type: 'container', memberIds: ['1', '2'] });
		expect(shapes[0]!.text.plainText ?? '').toContain('Team');
		// Classic: the framed body plus a divider under the heading.
		expect(shapes[0]!.geometry.length).toBe(2);
	});

	it('inserts an empty container at a box and keeps members on delete', async () => {
		const empty = await editVsdx(await two(), [
			{
				...container([], 'banner'),
				box: { x: 4, y: 6, width: 3, height: 2 },
			} as VisioEdit,
		]);
		const root = await pageRoot(empty.bytes);
		expect(order(root)).toEqual(['1', '2', '3']);
		expect([value(root, '3', 'PinX'), value(root, '3', 'Width')]).toEqual([4, 3]);
		const framed = await editVsdx(await two(), [container(['1', '2'], 'dashed')]);
		const deleted = await editVsdx(framed.bytes, [
			{ type: 'delete-shape', pageId: '0', shapeId: '3' },
		]);
		expect(order(await pageRoot(deleted.bytes))).toEqual(['1', '2']);
	});

	it('moves with its members in one transaction and stays editable', async () => {
		const framed = await editVsdx(await two(), [container(['1', '2'])]);
		const before = await pageRoot(framed.bytes);
		const shift = (id: string, dx: number): VisioEdit => ({
			type: 'move-shape',
			pageId: '0',
			shapeId: id,
			x: value(before, id, 'PinX') + dx,
			y: value(before, id, 'PinY'),
		});
		const moved = await editVsdx(framed.bytes, [shift('3', 1), shift('1', 1), shift('2', 1)]);
		const after = await pageRoot(moved.bytes);
		for (const id of ['1', '2', '3'])
			expect(value(after, id, 'PinX')).toBeCloseTo(value(before, id, 'PinX') + 1, 12);
		const resized = await editVsdx(moved.bytes, [
			{ type: 'resize-shape', pageId: '0', shapeId: '3', width: 6, height: 4 },
		]);
		const grown = await pageRoot(resized.bytes);
		expect(value(grown, '3', 'TxtWidth')).toBeCloseTo(6, 12);
	});

	it('refuses unknown members, styles and duplicate IDs', async () => {
		const bytes = await two();
		await expect(editVsdx(bytes, [container(['1', '9'])])).rejects.toThrow(/members/);
		await expect(editVsdx(bytes, [container(['1'], 'neon')])).rejects.toThrow(/style/);
		await expect(
			editVsdx(bytes, [{ ...container(['1']), shapeId: '2' } as VisioEdit]),
		).rejects.toThrow();
		await expect(editVsdx(bytes, [container([])])).rejects.toThrow(/box/);
		expect(() => snapshotEdits([container(['1', '1'])])).toThrow(/unique/);
	});
});

describe('insert-callout', () => {
	const callout = (targetId = '2', style = 'rounded'): VisioEdit =>
		({
			type: 'insert-callout',
			pageId: '0',
			shapeId: '3',
			leaderId: '4',
			targetId,
			style,
			text: 'Note',
			box: { x: 2, y: 5, width: 1.5, height: 0.75 },
		}) as VisioEdit;

	it('adds a callout glued to its target by a leader that follows the target', async () => {
		const saved = await editVsdx(await two(), [callout()]);
		const root = await pageRoot(saved.bytes);
		expect(order(root)).toEqual(['1', '2', '3', '4']);
		expect(value(root, '4', 'EndArrow')).toBe(0);
		const model = await parseVsdx(saved.bytes);
		const page = model.pages[0]!;
		expect(page.shapes[2]!.structure).toEqual({ type: 'callout', targetId: '2', leaderId: '4' });
		expect(page.connectors).toEqual([
			expect.objectContaining({ fromShapeId: '4', toShapeId: '3' }),
			expect.objectContaining({ fromShapeId: '4', toShapeId: '2' }),
		]);
		const endX = value(root, '4', 'EndX');
		const moved = await editVsdx(saved.bytes, [
			{ type: 'move-shape', pageId: '0', shapeId: '2', x: 7, y: 3 },
		]);
		expect(value(await pageRoot(moved.bytes), '4', 'EndX')).toBeCloseTo(endX + 2, 12);
	});

	it('supports every style and refuses lines as targets', async () => {
		for (const style of ['rectangle', 'oval', 'text']) {
			const saved = await editVsdx(await two(), [callout('1', style)]);
			expect((await parseVsdx(saved.bytes)).pages[0]!.shapes[2]!.structure?.type).toBe('callout');
		}
		await expect(editVsdx(await two(), [callout('9')])).rejects.toThrow();
		expect(() => snapshotEdits([{ ...callout(), leaderId: '3' } as VisioEdit])).toThrow(/distinct/);
		const blank = await fixture({ pages: [{ id: '0', contents: '' }] });
		const line = await editVsdx(blank, [
			{ type: 'create-line', pageId: '0', shapeId: '2', beginX: 1, beginY: 1, endX: 3, endY: 1 },
		]);
		await expect(editVsdx(line.bytes, [callout('2')])).rejects.toThrow(/2D/);
	});
});
