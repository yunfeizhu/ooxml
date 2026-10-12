import { describe, expect, it } from 'vitest';
import { editVsdx } from '../edit';
import { parseVsdx } from '../parser';
import { fixture } from '../test-fixtures';
import {
	visioGuideCreateCommand,
	visioGuideMoveCommand,
	visioPageGuides,
	visioSnapMoveDelta,
} from './guides';

async function page() {
	const blank = await fixture({ pages: [{ id: '0', contents: '' }] });
	const created = await editVsdx(blank, [
		{ type: 'create-rectangle', pageId: '0', shapeId: '1', x: 1, y: 1, width: 1, height: 1 },
		{ type: 'create-rectangle', pageId: '0', shapeId: '2', x: 4, y: 4, width: 2, height: 1 },
		{ type: 'create-guide', pageId: '0', shapeId: '3', orientation: 'vertical', position: 6 },
		{ type: 'create-guide', pageId: '0', shapeId: '4', orientation: 'horizontal', position: 8 },
	]);
	return (await parseVsdx(created.bytes)).pages[0]!;
}

describe('guide helpers', () => {
	it('lists guides and builds commands in drawing inches', async () => {
		const scene = await page();
		expect(visioPageGuides(scene)).toEqual([
			{ id: '3', orientation: 'vertical', position: 6 },
			{ id: '4', orientation: 'horizontal', position: 8 },
		]);
		expect(visioGuideCreateCommand({ ...scene, drawingToPageScale: 2 }, 'horizontal', 3)).toEqual({
			type: 'create-guide',
			pageId: '0',
			shapeId: '5',
			orientation: 'horizontal',
			position: 1.5,
		});
		expect(visioGuideMoveCommand(scene, '3', 2)).toEqual({
			type: 'move-guide',
			pageId: '0',
			shapeId: '3',
			position: 2,
		});
	});
	it('snaps a moving selection to shape centres and to guides', async () => {
		const scene = await page();
		// Shape 1's centre x is 1; shape 2's is 4: move right by 2.95 and the centres meet.
		const dynamic = visioSnapMoveDelta(
			scene,
			['1'],
			{ x: 2.95, y: 0 },
			{
				shapes: true,
				guides: false,
				threshold: 0.1,
			},
		);
		expect(dynamic.delta.x).toBeCloseTo(3, 9);
		expect(dynamic.lines[0]).toMatchObject({ axis: 'x', pos: 4 });
		// The right edge (1.5) reaches the vertical guide at 6 after 4.5; 4.45 snaps to it.
		const guide = visioSnapMoveDelta(
			scene,
			['1'],
			{ x: 4.45, y: 6.95 },
			{
				shapes: false,
				guides: true,
				threshold: 0.1,
			},
		);
		expect(guide.delta.x).toBeCloseTo(4.5, 9);
		// Top edge 1.5 meets the horizontal guide at 8 after moving up 6.5; centre 1 after 7.
		expect(guide.delta.y).toBeCloseTo(7, 9);
		expect(
			visioSnapMoveDelta(
				scene,
				['1'],
				{ x: 1, y: 1 },
				{ shapes: false, guides: false, threshold: 1 },
			).delta,
		).toEqual({ x: 1, y: 1 });
	});
	it('snaps the nearer edge to the grid on an axis no shape or guide claims', async () => {
		const scene = await page();
		// Shape 1 spans x 0.5..1.5 and y 0.5..1.5; a 0.25 grid.
		const options = { shapes: false, guides: false, threshold: 0.1, grid: 0.25 };
		const moved = visioSnapMoveDelta(scene, ['1'], { x: 0.3, y: -0.12 }, options);
		// x: the left edge lands at 0.8, 0.05 past the 0.75 line, so the delta becomes 0.25.
		// y: both edges (0.38 and 1.38) sit 0.12 below a grid line, so the shape returns to its row.
		expect(moved.delta.x).toBeCloseTo(0.25, 9);
		expect(moved.delta.y).toBeCloseTo(0, 9);
		expect(moved.lines).toEqual([]);
		// A guide still wins its own axis; the grid only fills the other one.
		const guided = visioSnapMoveDelta(
			scene,
			['1'],
			{ x: 4.45, y: 0.11 },
			{ shapes: false, guides: true, threshold: 0.1, grid: 0.25 },
		);
		expect(guided.delta.x).toBeCloseTo(4.5, 9);
		expect(guided.delta.y).toBeCloseTo(0, 9);
		expect(
			visioSnapMoveDelta(scene, ['1'], { x: 0.3, y: 0 }, { ...options, grid: 0 }).delta,
		).toEqual({ x: 0.3, y: 0 });
	});
});
