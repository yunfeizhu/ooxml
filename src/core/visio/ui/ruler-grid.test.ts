import { describe, expect, it } from 'vitest';
import { createVsdx } from '../create-document';
import { editVsdx } from '../edit';
import { parseVsdx } from '../parser';
import { visioSnapMoveDelta } from './guides';
import {
	visioGridSteps,
	visioRulerDensityFactor,
	visioRulerGridEdits,
	visioRulerGridValues,
} from './ruler-grid';

describe('grid steps', () => {
	it('gives a variable grid about the same distance on screen at every zoom', () => {
		// Fine (Visio's default): a quarter inch at 100%, halving each time the zoom doubles.
		expect(visioGridSteps({}, 1)).toEqual({ x: 0.25, y: 0.25, originX: 0, originY: 0 });
		expect(visioGridSteps({}, 1.9).x).toBe(0.25);
		expect(visioGridSteps({}, 2).x).toBe(0.125);
		expect(visioGridSteps({}, 0.5).x).toBe(0.5);
		expect(visioGridSteps({}, 0.25).x).toBe(1);
		expect(visioGridSteps({ layout: { gridDensityX: 4, gridDensityY: 2 } }, 1)).toMatchObject({
			x: 0.5,
			y: 1,
		});
	});

	it('honours the minimum spacing, a fixed grid and the origin', () => {
		expect(visioGridSteps({ layout: { gridSpacingX: 0.4 } }, 4).x).toBe(0.5);
		const fixed = {
			layout: { gridDensityX: 0, gridSpacingX: 0.3, gridOriginX: 1, gridOriginY: 2 },
		};
		expect(visioGridSteps(fixed, 1)).toEqual({ x: 0.3, y: 0.25, originX: 1, originY: 2 });
		expect(visioGridSteps(fixed, 8).x).toBe(0.3);
		// Fixed without a spacing has nothing to be fixed to: it stays variable.
		expect(visioGridSteps({ layout: { gridDensityX: 0 } }, 1).x).toBe(0.25);
	});

	it('thins the ruler subdivisions by density', () => {
		expect([32, 16, 8].map(visioRulerDensityFactor)).toEqual([1, 0.5, 0.25]);
	});
});

describe('Ruler & Grid values', () => {
	it('builds one edit with only the changed fields, and none when nothing changed', async () => {
		const page = (await parseVsdx(await createVsdx())).pages[0]!;
		const values = visioRulerGridValues(page);
		expect(values).toMatchObject({ rulerDensityX: 32, gridDensityX: 8, gridOriginY: 0 });
		expect(visioRulerGridEdits(page, values)).toEqual([]);
		const edits = visioRulerGridEdits(page, { ...values, gridDensityY: 0, gridSpacingY: 0.5 });
		expect(edits).toEqual([
			{ type: 'set-page-layout', pageId: '0', gridDensityY: 0, gridSpacingY: 0.5 },
		]);
		const saved = (await parseVsdx((await editVsdx(await createVsdx(), edits)).bytes)).pages[0]!;
		expect(visioRulerGridValues(saved)).toMatchObject({ gridDensityY: 0, gridSpacingY: 0.5 });
		expect(visioGridSteps(saved, 1)).toMatchObject({ x: 0.25, y: 0.5 });
	});
});

describe('Snap to Grid with the page grid', () => {
	it('snaps each axis to its own step and origin', async () => {
		const bytes = (
			await editVsdx(await createVsdx(), [
				{
					type: 'create-rectangle',
					pageId: '0',
					shapeId: '1',
					x: 0.5,
					y: 0.5,
					width: 1,
					height: 1,
				},
			])
		).bytes;
		const page = (await parseVsdx(bytes)).pages[0]!;
		const options = { shapes: false, guides: false, threshold: 0.1 };
		// The shape spans 0..1 on both axes. x lines at 0.1, 0.6, 1.1: the left edge 0.03 goes to 0.1.
		const moved = visioSnapMoveDelta(
			page,
			['1'],
			{ x: 0.03, y: 0.3 },
			{
				...options,
				grid: { x: 0.5, y: 1, originX: 0.1, originY: 0.25 },
			},
		);
		expect(moved.delta.x).toBeCloseTo(0.1, 9);
		// y lines at 0.25, 1.25: the bottom edge 0.3 goes to 0.25.
		expect(moved.delta.y).toBeCloseTo(0.25, 9);
		// An axis without a step is left alone.
		const free = visioSnapMoveDelta(
			page,
			['1'],
			{ x: 0.03, y: 0.3 },
			{
				...options,
				grid: { x: 0, y: 1 },
			},
		);
		expect(free.delta.x).toBe(0.03);
		expect(free.delta.y).toBeCloseTo(0, 9);
	});
});
