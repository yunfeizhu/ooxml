import { describe, expect, it } from 'vitest';

import { computeRotation, createRotationDrag, snapAngle } from './rotation-drag';

const center = { x: 50, y: 50 };
const point = (degrees: number) => ({
	x: center.x + 100 * Math.sin((degrees * Math.PI) / 180),
	y: center.y - 100 * Math.cos((degrees * Math.PI) / 180),
});

describe('createRotationDrag', () => {
	it.each([0, 43, 359, -1, 361])(
		'preserves an off-center grab on a shape rotated %s degrees',
		(rotation) => {
			const drag = createRotationDrag(center, point(20), rotation);
			expect(drag(point(25))).toBeCloseTo((((rotation + 5) % 360) + 360) % 360);
			expect(drag(point(15))).toBeCloseTo((((rotation - 5) % 360) + 360) % 360);
		},
	);

	it('crosses the pointer bearing boundary in either direction', () => {
		expect(createRotationDrag(center, point(359), 20)(point(1))).toBeCloseTo(22);
		expect(createRotationDrag(center, point(1), 20)(point(359))).toBeCloseTo(18);
	});

	it('does not rotate when the pointer moves along the original radius', () => {
		const drag = createRotationDrag(center, { x: 60, y: 0 }, 43);
		expect(drag({ x: 70, y: -50 })).toBeCloseTo(43);
	});

	it('defers an undefined starting bearing and preserves rotation while crossing the center', () => {
		const drag = createRotationDrag(center, center, 43);
		expect(drag(center)).toBe(43);
		expect(drag(point(20))).toBe(43);
		expect(drag(point(25))).toBeCloseTo(48);
		expect(drag(center)).toBeCloseTo(48);
		expect(drag(point(30))).toBeCloseTo(53);
	});

	it('does not change the absolute rotation utility contract', () => {
		expect(computeRotation(center, point(20))).toBeCloseTo(20);
		expect(computeRotation(center, point(90))).toBeCloseTo(90);
	});
});

it('preserves signed turns for a caller with unwrapped native angles', () => {
	const drag = createRotationDrag(center, point(350), -10, { unwrapped: true });
	expect(drag(point(10))).toBeCloseTo(10);
	expect(drag(point(100))).toBeCloseTo(100);
	expect(drag(point(190))).toBeCloseTo(190);
	expect(drag(point(280))).toBeCloseTo(280);
	expect(drag(point(10))).toBeCloseTo(370);
});

describe('snapAngle', () => {
	it('snaps to the nearest step within tolerance', () => {
		expect(snapAngle(13, 15)).toBe(15);
		expect(snapAngle(2, 15)).toBe(0);
	});

	it('leaves angles outside tolerance unchanged', () => {
		expect(snapAngle(8, 15, 3)).toBe(8);
	});

	it('normalises snapped result to [0, 360)', () => {
		expect(snapAngle(359, 15)).toBe(0);
	});
});
