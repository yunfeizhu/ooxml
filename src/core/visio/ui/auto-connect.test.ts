import { describe, expect, it } from 'vitest';
import { editVsdx, parseVsdx } from '../index';
import type { VisioPage } from '../model';
import {
	VISIO_AUTO_CONNECT_GAP,
	visioAutoConnectArrows,
	visioAutoConnectNeighbor,
	visioAutoConnectPlacement,
	visioAutoConnectPlan,
	visioAutoConnectShape,
} from './auto-connect';
import { visioShapePageBox } from './marquee';
import { createSampleVsdx } from './sample-drawing';

async function sample() {
	const bytes = await createSampleVsdx();
	const page = (await parseVsdx(bytes)).pages[0]!;
	return { bytes, page };
}
const shape = (page: VisioPage, id: string) => page.shapes.find((item) => item.id === id)!;
const box = (page: VisioPage, id: string) => visioShapePageBox(page, shape(page, id))!;
const rectangle = {
	master: { kind: 'rectangle', shape: 'rectangle' },
	size: { width: 1.5, height: 1 },
} as const;

describe('AutoConnect planning', () => {
	it('starts only from top-level two-dimensional shapes', async () => {
		const { page } = await sample();
		expect(visioAutoConnectShape(page, '1')?.id).toBe('1');
		// Shape 6 is a connector.
		expect(visioAutoConnectShape(page, '6')).toBeUndefined();
		expect(visioAutoConnectShape(page, 'missing')).toBeUndefined();
	});

	it('puts one arrow outside each side', async () => {
		const { page } = await sample();
		const from = box(page, '2');
		const arrows = visioAutoConnectArrows(page, shape(page, '2'), 0.2);
		expect(arrows.map((arrow) => arrow.direction)).toEqual(['up', 'right', 'down', 'left']);
		const at = Object.fromEntries(arrows.map((arrow) => [arrow.direction, arrow]));
		expect(at.up!.y).toBeCloseTo(from.y - 0.2);
		expect(at.down!.y).toBeCloseTo(from.y + from.height + 0.2);
		expect(at.left!.x).toBeCloseTo(from.x - 0.2);
		expect(at.right!.x).toBeCloseTo(from.x + from.width + 0.2);
		expect(at.right!.y).toBeCloseTo(from.y + from.height / 2);
		expect(visioAutoConnectArrows(page, shape(page, '2'), Number.NaN)).toEqual([]);
	});

	it('finds the nearest shape an arrow points at', async () => {
		const { page } = await sample();
		// The workflow runs downward: 1, 2, 3, 4.
		expect(visioAutoConnectNeighbor(page, shape(page, '2'), 'down')?.id).toBe('3');
		expect(visioAutoConnectNeighbor(page, shape(page, '2'), 'up')?.id).toBe('1');
		expect(visioAutoConnectNeighbor(page, shape(page, '2'), 'left')).toBeUndefined();
		expect(visioAutoConnectNeighbor(page, shape(page, '2'), 'right')).toBeUndefined();
	});

	it("places a new shape at Visio's spacing, and past a shape that is in the way", async () => {
		const { page } = await sample();
		const from = box(page, '2');
		const size = { width: 1.5, height: 1 };
		// Recorded from Visio: the gap between the two sides is the avenue size, 0.375 in.
		const right = visioAutoConnectPlacement(page, shape(page, '2'), 'right', size)!;
		expect(right.x - size.width / 2 - (from.x + from.width)).toBeCloseTo(VISIO_AUTO_CONNECT_GAP);
		expect(right.y).toBeCloseTo(from.y + from.height / 2);
		const left = visioAutoConnectPlacement(page, shape(page, '2'), 'left', size)!;
		expect(from.x - (left.x + size.width / 2)).toBeCloseTo(VISIO_AUTO_CONNECT_GAP);
		// Below shape 2 sits shape 3: the place moves right by one shape and gap until it is free.
		const down = visioAutoConnectPlacement(page, shape(page, '2'), 'down', size)!;
		expect(down.y - size.height / 2 - (from.y + from.height)).toBeCloseTo(VISIO_AUTO_CONNECT_GAP);
		const steps = (down.x - (from.x + from.width / 2)) / (size.width + VISIO_AUTO_CONNECT_GAP);
		expect(steps).toBeGreaterThan(0);
		expect(steps).toBeCloseTo(Math.round(steps));
		expect(visioAutoConnectPlacement(page, shape(page, '2'), 'down', { width: 0, height: 1 })).toBe(
			undefined,
		);
	});

	it('adds a shape and a connector glued to both shapes in one edit batch', async () => {
		const { bytes, page } = await sample();
		const plan = visioAutoConnectPlan(page, '2', 'right', rectangle)!;
		expect(plan.added).toBe(true);
		expect(plan.edits.map((edit) => edit.type)).toEqual(['create-rectangle', 'create-line']);
		expect(Number(plan.connectorId)).toBe(Number(plan.targetId) + 1);
		const edited = (await parseVsdx((await editVsdx(bytes, plan.edits)).bytes)).pages[0]!;
		const added = box(edited, plan.targetId);
		const from = box(edited, '2');
		expect(added.x - (from.x + from.width)).toBeCloseTo(VISIO_AUTO_CONNECT_GAP);
		expect(added.width).toBeCloseTo(1.5);
		const glue = edited.connectors.filter((connect) => connect.fromShapeId === plan.connectorId);
		expect(glue.map((connect) => connect.toShapeId).sort()).toEqual(['2', plan.targetId].sort());
		expect(edited.connectors).toHaveLength(page.connectors.length + 2);
		// In line with its source, the right-angle connector is one segment across the gap.
		const line = box(edited, plan.connectorId);
		expect(line.width).toBeCloseTo(VISIO_AUTO_CONNECT_GAP);
		expect(line.height).toBeCloseTo(0);
	});

	it('connects to an existing neighbour without adding a shape', async () => {
		const { bytes, page } = await sample();
		const plan = visioAutoConnectPlan(page, '4', 'up', { shapeId: '3' })!;
		expect(plan).toMatchObject({ added: false, targetId: '3' });
		expect(plan.edits.map((edit) => edit.type)).toEqual(['create-line']);
		const edited = (await parseVsdx((await editVsdx(bytes, plan.edits)).bytes)).pages[0]!;
		expect(edited.shapes).toHaveLength(page.shapes.length + 1);
		expect(
			edited.connectors
				.filter((connect) => connect.fromShapeId === plan.connectorId)
				.map((connect) => connect.toShapeId)
				.sort(),
		).toEqual(['3', '4']);
		// A shape cannot be connected to itself or to a connector.
		expect(visioAutoConnectPlan(page, '4', 'up', { shapeId: '4' })).toBeUndefined();
		expect(visioAutoConnectPlan(page, '4', 'up', { shapeId: '6' })).toBeUndefined();
		expect(visioAutoConnectPlan(page, '6', 'up', rectangle)).toBeUndefined();
	});
});
