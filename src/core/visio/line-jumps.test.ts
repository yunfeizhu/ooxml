import { describe, expect, it } from 'vitest';
import type { VisioPage, VisioShape } from './model';
import { VISIO_LINE_JUMP_WIDTH, visioLineJumpPaths } from './line-jumps';
import type { VisioPageLayout } from './page-layout';

const HALF = VISIO_LINE_JUMP_WIDTH / 2;

/** A connector whose local path is offset by (x, y) on the page. */
function line(id: string, path: string, x = 0, y = 0, extra: Partial<VisioShape> = {}): VisioShape {
	return {
		id,
		name: id,
		kind: 'connector',
		width: 1,
		height: 1,
		transform: [1, 0, 0, 1, x, y],
		geometry: [{ path, fill: false, stroke: true }],
		connectorRoute: 'right-angle',
		children: [],
		hidden: false,
		...extra,
	} as unknown as VisioShape;
}
const page = (shapes: VisioShape[], layout?: Partial<VisioPageLayout>): VisioPage => ({
	id: '0',
	name: 'Page',
	width: 10,
	height: 10,
	isBackground: false,
	shapes,
	connectors: [],
	...(layout ? { layout } : {}),
});

const across = () => line('h', 'M 0 0 L 4 0', 1, 2);
const down = () => line('v', 'M 0 0 L 0 4', 3, 0);

describe('line jumps', () => {
	it('lets the horizontal line jump over the vertical one by default', () => {
		const h = across(),
			v = down();
		const jumps = visioLineJumpPaths(page([h, v]));
		expect([...jumps.keys()]).toEqual([h]);
		// Crossing at page (3, 2), local x = 2: an arc bulging up (y-up coordinates).
		const r = Number(HALF.toFixed(6));
		expect(jumps.get(h)).toEqual([
			`M 0 0 L ${Number((2 - HALF).toFixed(6))} 0 A ${r} ${r} 0 0 0 ${Number((2 + HALF).toFixed(6))} 0 L 4 0`,
		]);
	});

	it('follows LineJumpCode: none, vertical lines, last and first displayed', () => {
		const h = across(),
			v = down();
		expect(visioLineJumpPaths(page([h, v], { lineJumpCode: 0 })).size).toBe(0);
		expect([...visioLineJumpPaths(page([h, v], { lineJumpCode: 2 })).keys()]).toEqual([v]);
		expect([...visioLineJumpPaths(page([h, v], { lineJumpCode: 4 })).keys()]).toEqual([v]);
		expect([...visioLineJumpPaths(page([h, v], { lineJumpCode: 3 })).keys()]).toEqual([v]);
		expect([...visioLineJumpPaths(page([h, v], { lineJumpCode: 5 })).keys()]).toEqual([h]);
	});

	it('draws the gap, square and many-sided styles', () => {
		const style = (lineJumpStyle: number) => {
			const h = across();
			return visioLineJumpPaths(page([h, down()], { lineJumpStyle })).get(h)![0]!;
		};
		const from = Number((2 - HALF).toFixed(6)),
			to = Number((2 + HALF).toFixed(6)),
			up = Number(HALF.toFixed(6));
		expect(style(1)).toBe(`M 0 0 L ${from} 0 M ${to} 0 L 4 0`);
		expect(style(2)).toBe(`M 0 0 L ${from} 0 L ${from} ${up} L ${to} ${up} L ${to} 0 L 4 0`);
		// Two sides meet at the top of the half circle.
		expect(style(3)).toBe(`M 0 0 L ${from} 0 L 2 ${up} L ${to} 0 L 4 0`);
		expect(style(8).match(/L /g)).toHaveLength(9);
	});

	it('does not jump at a shared end, a T junction, or right beside an end', () => {
		const h = across();
		const touching = line('t', 'M 0 0 L 0 2', 3, 2);
		expect(visioLineJumpPaths(page([h, touching])).size).toBe(0);
		const nearEnd = line('n', 'M 0 0 L 0 4', 1 + HALF, 0);
		expect(visioLineJumpPaths(page([h, nearEnd])).size).toBe(0);
		const parallel = line('p', 'M 0 0 L 4 0', 1, 2);
		expect(visioLineJumpPaths(page([h, parallel])).size).toBe(0);
	});

	it('jumps each crossing once, shares a jump between crossings that are too close', () => {
		const h = across();
		const far = [line('a', 'M 0 0 L 0 4', 2, 0), line('b', 'M 0 0 L 0 4', 4, 0)];
		expect(
			visioLineJumpPaths(page([h, ...far]))
				.get(h)![0]!
				.match(/A /g),
		).toHaveLength(2);
		const close = [line('a', 'M 0 0 L 0 4', 2, 0), line('b', 'M 0 0 L 0 4', 2 + HALF, 0)];
		expect(
			visioLineJumpPaths(page([h, ...close]))
				.get(h)![0]!
				.match(/A /g),
		).toHaveLength(1);
	});

	it('keeps the arc on the page side for a flipped or rotated connector', () => {
		// Local y points down the page: the same page-space bump needs the other sweep direction.
		const flipped = line('h', 'M 0 0 L 4 0', 1, 2, { transform: [1, 0, 0, -1, 1, 2] });
		const path = visioLineJumpPaths(page([flipped, down()])).get(flipped)![0]!;
		expect(path).toMatch(/A \S+ \S+ 0 0 1 /);
		expect(path.startsWith('M 0 0 L')).toBe(true);
		// A right-angle route jumps only on its horizontal run.
		const elbow = line('e', 'M 0 0 L 4 0 L 4 3', 1, 2);
		const other = line('o', 'M 0 0 L 0 4 L 4 4', 3, 0);
		const jumps = visioLineJumpPaths(page([elbow, other]));
		expect(jumps.get(elbow)![0]!.match(/A /g)).toHaveLength(1);
		expect(jumps.get(other)![0]!.match(/A /g)).toHaveLength(1);
	});

	it('leaves curved, hidden and nested connectors and plain shapes alone', () => {
		const h = across();
		const curved = line('c', 'M 0 0 C 0 1 0 3 0 4', 3, 0);
		const hidden = { ...down(), hidden: true };
		const shape = { ...down(), kind: 'shape' } as VisioShape;
		// A line drawn with the Line tool has no route; one glued to a shape is a connector.
		const plain = { ...down(), connectorRoute: undefined } as unknown as VisioShape;
		expect(visioLineJumpPaths(page([h, plain])).size).toBe(0);
		const withGlue = { ...page([h, plain]), connectors: [{ fromShapeId: 'v', toShapeId: 'x' }] };
		expect(visioLineJumpPaths(withGlue as unknown as VisioPage).size).toBe(1);
		expect(visioLineJumpPaths(page([h, curved])).size).toBe(0);
		expect(visioLineJumpPaths(page([h, hidden])).size).toBe(0);
		expect(visioLineJumpPaths(page([h, shape])).size).toBe(0);
		expect(visioLineJumpPaths(page([h])).size).toBe(0);
	});
});
