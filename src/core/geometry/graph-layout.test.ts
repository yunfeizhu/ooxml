import { describe, expect, it } from 'vitest';
import { layoutGraph, type GraphLayoutNode } from './graph-layout';
import { autoAlignBoxes } from './auto-align';

const node = (id: string, width = 1, height = 0.5): GraphLayoutNode => ({ id, width, height });
const overlaps = (
	nodes: readonly GraphLayoutNode[],
	positions: Map<string, { x: number; y: number }>,
) =>
	nodes.some((a, i) =>
		nodes.slice(i + 1).some((b) => {
			const p = positions.get(a.id)!,
				q = positions.get(b.id)!;
			return (
				Math.abs(p.x - q.x) < (a.width + b.width) / 2 - 1e-9 &&
				Math.abs(p.y - q.y) < (a.height + b.height) / 2 - 1e-9
			);
		}),
	);

describe('layoutGraph', () => {
	const chain = [node('a'), node('b'), node('c')];
	const edges = [
		{ from: 'a', to: 'b' },
		{ from: 'b', to: 'c' },
	];
	it('stacks a top-to-bottom flowchart in layers with a shared centre line', () => {
		const result = layoutGraph(chain, edges, 'flowchart-tb', { spacing: 0.5 });
		expect(result.get('a')).toEqual({ x: 0.5, y: 0.25 });
		expect(result.get('b')).toEqual({ x: 0.5, y: 1.25 });
		expect(result.get('c')).toEqual({ x: 0.5, y: 2.25 });
	});
	it('runs a left-to-right flowchart along x', () => {
		const result = layoutGraph(chain, edges, 'flowchart-lr', { spacing: 0.5 });
		expect(result.get('a')).toEqual({ x: 0.5, y: 0.25 });
		expect(result.get('b')).toEqual({ x: 2, y: 0.25 });
		expect(result.get('c')).toEqual({ x: 3.5, y: 0.25 });
	});
	it('puts a node after its longest predecessor path and breaks cycles', () => {
		const nodes = [node('a'), node('b'), node('c'), node('d')];
		const result = layoutGraph(
			nodes,
			[
				{ from: 'a', to: 'b' },
				{ from: 'b', to: 'c' },
				{ from: 'a', to: 'c' },
				{ from: 'c', to: 'a' },
				{ from: 'c', to: 'd' },
			],
			'flowchart-tb',
		);
		expect(result.get('c')!.y).toBeGreaterThan(result.get('b')!.y);
		expect(result.get('d')!.y).toBeGreaterThan(result.get('c')!.y);
		expect(overlaps(nodes, result)).toBe(false);
	});
	it('places hierarchy siblings side by side and centres their parent', () => {
		const nodes = [node('root'), node('left'), node('right')];
		const result = layoutGraph(
			nodes,
			[
				{ from: 'root', to: 'left' },
				{ from: 'root', to: 'right' },
			],
			'hierarchy',
			{ spacing: 0.5 },
		);
		expect(result.get('left')!.y).toBe(result.get('right')!.y);
		expect(result.get('root')!.x).toBeCloseTo((result.get('left')!.x + result.get('right')!.x) / 2);
		expect(overlaps(nodes, result)).toBe(false);
	});
	it('indents a compact tree by depth and gives every node its own row', () => {
		const nodes = [node('root'), node('a'), node('a1'), node('b')];
		const result = layoutGraph(
			nodes,
			[
				{ from: 'root', to: 'a' },
				{ from: 'a', to: 'a1' },
				{ from: 'root', to: 'b' },
			],
			'compact-tree',
		);
		const ys = ['root', 'a', 'a1', 'b'].map((id) => result.get(id)!.y);
		expect(ys).toEqual([...ys].sort((p, q) => p - q));
		expect(result.get('a')!.x).toBeGreaterThan(result.get('root')!.x);
		expect(result.get('a1')!.x).toBeGreaterThan(result.get('a')!.x);
		expect(result.get('b')!.x).toBe(result.get('a')!.x);
	});
	it('spreads a cycle evenly around a circle', () => {
		const nodes = ['a', 'b', 'c', 'd'].map((id) => node(id, 1, 1));
		const result = layoutGraph(
			nodes,
			[
				{ from: 'a', to: 'b' },
				{ from: 'b', to: 'c' },
				{ from: 'c', to: 'd' },
				{ from: 'd', to: 'a' },
			],
			'circular',
		);
		const centre = {
			x: [...result.values()].reduce((sum, p) => sum + p.x, 0) / 4,
			y: [...result.values()].reduce((sum, p) => sum + p.y, 0) / 4,
		};
		const radii = [...result.values()].map((p) => Math.hypot(p.x - centre.x, p.y - centre.y));
		for (const radius of radii) expect(radius).toBeCloseTo(radii[0]!);
		expect(overlaps(nodes, result)).toBe(false);
	});
	it('places unconnected nodes in a grid after the connected ones', () => {
		const nodes = [node('a'), node('b'), node('x'), node('y')];
		const result = layoutGraph(nodes, [{ from: 'a', to: 'b' }], 'flowchart-tb');
		expect(result.get('x')!.y).toBeGreaterThan(result.get('b')!.y);
		expect(result.get('y')!.y).toBe(result.get('x')!.y);
		expect(overlaps(nodes, result)).toBe(false);
	});
	it('rejects invalid input', () => {
		expect(() => layoutGraph([node('a'), node('a')], [], 'flowchart-tb')).toThrow();
		expect(() => layoutGraph([node('a', Number.NaN)], [], 'flowchart-tb')).toThrow();
		expect(() => layoutGraph([], [], 'spiral' as never)).toThrow();
	});
});

describe('autoAlignBoxes', () => {
	it('snaps near rows and columns and spaces them evenly', () => {
		const result = autoAlignBoxes([
			{ id: 'a', x: 0, y: 0, width: 1, height: 1 },
			{ id: 'b', x: 2.1, y: 0.2, width: 1, height: 1 },
			{ id: 'c', x: 5, y: -0.1, width: 1, height: 1 },
			{ id: 'd', x: 0.2, y: 3, width: 1, height: 1 },
		]);
		const a = result.get('a')!,
			b = result.get('b')!,
			c = result.get('c')!,
			d = result.get('d')!;
		expect(a.y).toBeCloseTo(b.y);
		expect(b.y).toBeCloseTo(c.y);
		expect(a.x).toBeCloseTo(d.x);
		expect(b.x - a.x).toBeCloseTo(c.x - b.x);
	});
	it('keeps a minimum gap between overlapping clusters', () => {
		const result = autoAlignBoxes(
			[
				{ id: 'a', x: 0, y: 0, width: 2, height: 1 },
				{ id: 'b', x: 1.2, y: 0, width: 2, height: 1 },
			],
			{ tolerance: { x: 0.5 }, minimumGap: 0.25 },
		);
		expect(result.get('b')!.x - result.get('a')!.x).toBeCloseTo(2.25);
	});
});
