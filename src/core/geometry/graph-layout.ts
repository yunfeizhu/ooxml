/**
 * Format-neutral automatic layout of a directed graph of boxes: layered (a small Sugiyama
 * variant for flowcharts and hierarchies), an indented compact tree and a circle per connected
 * component. Unconnected boxes are placed in a grid after the connected ones.
 *
 * Coordinates are abstract units with y growing downward; results are box centres relative to
 * the top-left corner of the whole layout. No DOM and no format semantics: callers map their
 * own shapes and connections in and apply the positions themselves.
 */

export interface GraphLayoutNode {
	id: string;
	width: number;
	height: number;
}
/** A directed connection; edges naming unknown nodes, self loops and duplicates are ignored. */
export interface GraphLayoutEdge {
	from: string;
	to: string;
}
export type GraphLayoutStyle =
	| 'flowchart-tb'
	| 'flowchart-lr'
	| 'hierarchy'
	| 'compact-tree'
	| 'circular';
export const GRAPH_LAYOUT_STYLES: readonly GraphLayoutStyle[] = [
	'flowchart-tb',
	'flowchart-lr',
	'hierarchy',
	'compact-tree',
	'circular',
];
export interface GraphLayoutOptions {
	/** Gap between neighbouring boxes in the same layer, row or circle. */
	spacing?: number;
	/** Gap between layers (or tree levels). Defaults to `spacing`. */
	layerSpacing?: number;
}
export interface GraphLayoutPoint {
	x: number;
	y: number;
}
interface Placed {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
}
interface Graph {
	nodes: readonly GraphLayoutNode[];
	out: Map<string, string[]>;
	into: Map<string, string[]>;
}

/** Stable connected components in input order; isolated nodes are returned separately. */
function components(graph: Graph): { connected: string[][]; isolated: string[] } {
	const seen = new Set<string>();
	const connected: string[][] = [];
	const isolated: string[] = [];
	for (const node of graph.nodes) {
		if (seen.has(node.id)) continue;
		const ids: string[] = [];
		const stack = [node.id];
		seen.add(node.id);
		while (stack.length) {
			const id = stack.pop()!;
			ids.push(id);
			for (const next of [...graph.out.get(id)!, ...graph.into.get(id)!])
				if (!seen.has(next)) {
					seen.add(next);
					stack.push(next);
				}
		}
		if (ids.length === 1) isolated.push(node.id);
		else {
			const order = new Map(graph.nodes.map((entry, index) => [entry.id, index]));
			connected.push(ids.sort((a, b) => order.get(a)! - order.get(b)!));
		}
	}
	return { connected, isolated };
}

/** Roots first: nodes without incoming edges, else the first node (a cycle). */
function roots(ids: readonly string[], graph: Graph): string[] {
	const found = ids.filter((id) => !graph.into.get(id)!.some((from) => ids.includes(from)));
	return found.length ? found : [ids[0]!];
}

/** Acyclic forward edges: depth-first from the roots, dropping edges that close a cycle. */
function forwardEdges(ids: readonly string[], graph: Graph): Map<string, string[]> {
	const state = new Map<string, 1 | 2>();
	const forward = new Map(ids.map((id) => [id, [] as string[]]));
	const visit = (start: string) => {
		const stack: { id: string; next: number }[] = [{ id: start, next: 0 }];
		state.set(start, 1);
		while (stack.length) {
			const top = stack.at(-1)!;
			const targets = graph.out.get(top.id)!;
			if (top.next >= targets.length) {
				state.set(top.id, 2);
				stack.pop();
				continue;
			}
			const target = targets[top.next++]!;
			const mark = state.get(target);
			if (mark === 1) continue;
			forward.get(top.id)!.push(target);
			if (mark === undefined) {
				state.set(target, 1);
				stack.push({ id: target, next: 0 });
			}
		}
	};
	for (const root of roots(ids, graph)) if (!state.has(root)) visit(root);
	for (const id of ids) if (!state.has(id)) visit(id);
	return forward;
}

/** Longest-path layers (flowcharts) or breadth-first levels (hierarchies) over forward edges. */
function layers(
	ids: readonly string[],
	forward: Map<string, string[]>,
	shortest: boolean,
): string[][] {
	const rank = new Map<string, number>();
	const incoming = new Map(ids.map((id) => [id, 0]));
	for (const targets of forward.values())
		for (const target of targets) incoming.set(target, incoming.get(target)! + 1);
	const queue = ids.filter((id) => incoming.get(id) === 0);
	for (const id of queue) rank.set(id, 0);
	for (let index = 0; index < queue.length; index++) {
		const id = queue[index]!;
		for (const target of forward.get(id)!) {
			const candidate = rank.get(id)! + 1;
			if (shortest) {
				if (!rank.has(target)) rank.set(target, candidate);
			} else rank.set(target, Math.max(rank.get(target) ?? 0, candidate));
			incoming.set(target, incoming.get(target)! - 1);
			if (incoming.get(target) === 0) queue.push(target);
		}
	}
	const result: string[][] = [];
	for (const id of ids) {
		const level = rank.get(id) ?? 0;
		(result[level] ??= []).push(id);
	}
	return result.filter((layer) => layer.length);
}

/** Barycenter sweeps reduce crossings while keeping input order on ties. */
function orderLayers(layered: string[][], graph: Graph): string[][] {
	const result = layered.map((layer) => [...layer]);
	const position = new Map<string, number>();
	const index = () => result.forEach((layer) => layer.forEach((id, at) => position.set(id, at)));
	index();
	for (let sweep = 0; sweep < 4; sweep++) {
		const down = sweep % 2 === 0;
		const range = down
			? result.map((_, at) => at).slice(1)
			: result
					.map((_, at) => at)
					.slice(0, -1)
					.reverse();
		for (const at of range) {
			const neighbour = new Set(result[down ? at - 1 : at + 1]!);
			const weight = (id: string) => {
				const linked = [...graph.out.get(id)!, ...graph.into.get(id)!].filter((other) =>
					neighbour.has(other),
				);
				return linked.length
					? linked.reduce((sum, other) => sum + position.get(other)!, 0) / linked.length
					: position.get(id)!;
			};
			const weights = new Map(result[at]!.map((id) => [id, weight(id)]));
			result[at]!.sort(
				(a, b) => weights.get(a)! - weights.get(b)! || position.get(a)! - position.get(b)!,
			);
			index();
		}
	}
	return result;
}

/** Layers along the primary axis, each centred on the cross axis. */
function placeLayers(
	ordered: string[][],
	size: Map<string, GraphLayoutNode>,
	horizontal: boolean,
	spacing: number,
	layerSpacing: number,
): Placed[] {
	const placed: Placed[] = [];
	const along = (node: GraphLayoutNode) => (horizontal ? node.width : node.height);
	const across = (node: GraphLayoutNode) => (horizontal ? node.height : node.width);
	let cursor = 0;
	for (const layer of ordered) {
		const nodes = layer.map((id) => size.get(id)!);
		const depth = Math.max(...nodes.map(along));
		const span = nodes.reduce((sum, node) => sum + across(node), 0) + spacing * (nodes.length - 1);
		let offset = -span / 2;
		for (const node of nodes) {
			const centre = offset + across(node) / 2;
			const primary = cursor + depth / 2;
			placed.push({
				id: node.id,
				x: horizontal ? primary : centre,
				y: horizontal ? centre : primary,
				width: node.width,
				height: node.height,
			});
			offset += across(node) + spacing;
		}
		cursor += depth + layerSpacing;
	}
	return placed;
}

/** An indented tree: depth sets the column indent, depth-first order sets the row. */
function placeCompactTree(
	ids: readonly string[],
	forward: Map<string, string[]>,
	graph: Graph,
	size: Map<string, GraphLayoutNode>,
	spacing: number,
	layerSpacing: number,
): Placed[] {
	const placed: Placed[] = [];
	const seen = new Set<string>();
	const indent = Math.max(...ids.map((id) => size.get(id)!.width)) / 2 + layerSpacing / 2;
	let y = 0;
	const visit = (start: string) => {
		const stack: { id: string; depth: number }[] = [{ id: start, depth: 0 }];
		while (stack.length) {
			const { id, depth } = stack.pop()!;
			if (seen.has(id)) continue;
			seen.add(id);
			const node = size.get(id)!;
			placed.push({
				id,
				x: depth * indent + node.width / 2,
				y: y + node.height / 2,
				width: node.width,
				height: node.height,
			});
			y += node.height + spacing;
			const children = forward.get(id)!.filter((child) => !seen.has(child));
			for (const child of children.reverse()) stack.push({ id: child, depth: depth + 1 });
		}
	};
	for (const root of roots(ids, graph)) visit(root);
	for (const id of ids) visit(id);
	return placed;
}

/** Nodes evenly around one circle, in depth-first order so neighbours sit together. */
function placeCircle(
	ids: readonly string[],
	forward: Map<string, string[]>,
	size: Map<string, GraphLayoutNode>,
	spacing: number,
): Placed[] {
	const order: string[] = [];
	const seen = new Set<string>();
	for (const start of ids) {
		const stack = [start];
		while (stack.length) {
			const id = stack.pop()!;
			if (seen.has(id)) continue;
			seen.add(id);
			order.push(id);
			stack.push(...[...forward.get(id)!].reverse());
		}
	}
	const extent = (id: string) => Math.hypot(size.get(id)!.width, size.get(id)!.height);
	const circumference = order.reduce((sum, id) => sum + extent(id) + spacing, 0);
	const radius = Math.max(circumference / (2 * Math.PI), Math.max(...order.map(extent)));
	return order.map((id, index) => {
		const angle = -Math.PI / 2 + (2 * Math.PI * index) / order.length;
		const node = size.get(id)!;
		return {
			id,
			x: radius * Math.cos(angle),
			y: radius * Math.sin(angle),
			width: node.width,
			height: node.height,
		};
	});
}

function bounds(placed: readonly Placed[]) {
	const left = Math.min(...placed.map((box) => box.x - box.width / 2));
	const top = Math.min(...placed.map((box) => box.y - box.height / 2));
	const right = Math.max(...placed.map((box) => box.x + box.width / 2));
	const bottom = Math.max(...placed.map((box) => box.y + box.height / 2));
	return { left, top, width: right - left, height: bottom - top };
}

/** Isolated boxes in a near-square grid of uniform cells. */
function placeGrid(ids: readonly string[], size: Map<string, GraphLayoutNode>, spacing: number) {
	const columns = Math.ceil(Math.sqrt(ids.length));
	const cellWidth = Math.max(...ids.map((id) => size.get(id)!.width));
	const cellHeight = Math.max(...ids.map((id) => size.get(id)!.height));
	return ids.map((id, index) => ({
		id,
		x: (index % columns) * (cellWidth + spacing) + cellWidth / 2,
		y: Math.floor(index / columns) * (cellHeight + spacing) + cellHeight / 2,
		width: size.get(id)!.width,
		height: size.get(id)!.height,
	}));
}

/**
 * Lay out every node. Components are packed side by side (stacked for left-to-right flowcharts),
 * then unconnected nodes follow in a grid. Returns centres relative to the layout's top left.
 */
export function layoutGraph(
	nodes: readonly GraphLayoutNode[],
	edges: readonly GraphLayoutEdge[],
	style: GraphLayoutStyle,
	options: GraphLayoutOptions = {},
): Map<string, GraphLayoutPoint> {
	if (!GRAPH_LAYOUT_STYLES.includes(style)) throw new Error('Unknown graph layout style.');
	const spacing = options.spacing ?? 0.5;
	const layerSpacing = options.layerSpacing ?? spacing;
	if (![spacing, layerSpacing].every((value) => Number.isFinite(value) && value >= 0))
		throw new Error('Layout spacing must be finite and not negative.');
	const size = new Map<string, GraphLayoutNode>();
	for (const node of nodes) {
		if (size.has(node.id)) throw new Error('Layout node IDs must be unique.');
		if (![node.width, node.height].every((value) => Number.isFinite(value) && value >= 0))
			throw new Error('Layout node sizes must be finite and not negative.');
		size.set(node.id, node);
	}
	const graph: Graph = {
		nodes,
		out: new Map(nodes.map((node) => [node.id, []])),
		into: new Map(nodes.map((node) => [node.id, []])),
	};
	for (const edge of edges) {
		if (!size.has(edge.from) || !size.has(edge.to) || edge.from === edge.to) continue;
		if (graph.out.get(edge.from)!.includes(edge.to)) continue;
		graph.out.get(edge.from)!.push(edge.to);
		graph.into.get(edge.to)!.push(edge.from);
	}
	const { connected, isolated } = components(graph);
	const horizontal = style === 'flowchart-lr';
	const blocks: Placed[][] = connected.map((ids) => {
		const forward = forwardEdges(ids, graph);
		if (style === 'circular') return placeCircle(ids, forward, size, spacing);
		if (style === 'compact-tree')
			return placeCompactTree(ids, forward, graph, size, spacing, layerSpacing);
		const ordered = orderLayers(layers(ids, forward, style === 'hierarchy'), graph);
		return placeLayers(ordered, size, horizontal, spacing, layerSpacing);
	});
	const result = new Map<string, GraphLayoutPoint>();
	let cursor = 0;
	let extent = 0;
	for (const block of blocks) {
		const box = bounds(block);
		for (const item of block)
			result.set(item.id, {
				x: item.x - box.left + (horizontal ? 0 : cursor),
				y: item.y - box.top + (horizontal ? cursor : 0),
			});
		cursor += (horizontal ? box.height : box.width) + spacing * 2;
		extent = Math.max(extent, horizontal ? box.width : box.height);
	}
	if (isolated.length) {
		const grid = placeGrid(isolated, size, spacing);
		const offset = blocks.length ? extent + layerSpacing * 2 : 0;
		for (const item of grid)
			result.set(item.id, {
				x: item.x + (horizontal ? offset : 0),
				y: item.y + (horizontal ? 0 : offset),
			});
	}
	return result;
}
