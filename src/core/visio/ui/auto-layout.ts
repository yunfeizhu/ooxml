import { autoAlignBoxes } from '../../geometry/auto-align';
import {
	GRAPH_LAYOUT_STYLES,
	layoutGraph,
	type GraphLayoutEdge,
	type GraphLayoutStyle,
} from '../../geometry/graph-layout';
import type { VisioEdit } from '../edit-commands';
import type { VisioPage, VisioShape } from '../model';
import { visioPageEditToDrawing } from './page-edit';
import { visioMovementShape } from './shape-move';

export type VisioLayoutStyle = GraphLayoutStyle;
export const VISIO_LAYOUT_STYLES = GRAPH_LAYOUT_STYLES;
/** Gallery names of Design > Re-Layout Page. */
export const VISIO_LAYOUT_LABELS: Readonly<Record<VisioLayoutStyle, string>> = Object.freeze({
	'flowchart-tb': 'Flowchart, Top to Bottom',
	'flowchart-lr': 'Flowchart, Left to Right',
	hierarchy: 'Hierarchy',
	'compact-tree': 'Compact Tree',
	circular: 'Circular',
});
export interface VisioLayoutOptions {
	/** Page inches between neighbouring shapes; Visio's default spacing is about 0.5 in. */
	spacing?: number;
	/** Page inches between layers; defaults to 1.5 times `spacing`. */
	layerSpacing?: number;
}
export interface VisioLayoutPlan {
	commands: VisioEdit[];
	/** Shapes the layout placed (moved or already in place). */
	placed: number;
	/** Top-level shapes left where they are: connectors, hidden, protected or unsupported shapes. */
	skipped: number;
	/** Connector-graph edges between placed shapes. */
	edges: number;
}
interface Box {
	shape: VisioShape;
	/** Page inches, left and top with y growing downward (the negated y-up top). */
	x: number;
	y: number;
	width: number;
	height: number;
}

/** A movable shape's rectangular page box from its cached transform, including rotation. */
function pageBox(shape: VisioShape): Box | undefined {
	const [a, b, c, d, e, f] = shape.transform;
	const xs: number[] = [],
		ys: number[] = [];
	for (const [x, y] of [
		[0, 0],
		[shape.width, 0],
		[0, shape.height],
		[shape.width, shape.height],
	] as const) {
		xs.push(a * x + c * y + e);
		ys.push(b * x + d * y + f);
	}
	const left = Math.min(...xs),
		top = Math.max(...ys);
	const width = Math.max(...xs) - left,
		height = top - Math.min(...ys);
	return [left, top, width, height].every(Number.isFinite) && width > 0 && height > 0
		? { shape, x: left, y: -top, width, height }
		: undefined;
}

/** Movable top-level 2D shapes in scope: the given IDs, or every top-level shape when omitted. */
function scope(page: VisioPage, ids?: readonly string[]): { boxes: Box[]; skipped: number } {
	const wanted = ids && new Set(ids);
	const boxes: Box[] = [];
	let skipped = 0;
	for (const shape of page.shapes) {
		if (wanted && !wanted.has(shape.id)) continue;
		const connector = page.connectors.some((connection) => connection.fromShapeId === shape.id);
		if (shape.kind === 'connector' || connector) continue;
		const movable = visioMovementShape(page, shape.id);
		const box = movable && !movable.visibility?.guide && pageBox(movable);
		if (box) boxes.push(box);
		else ++skipped;
	}
	return { boxes, skipped };
}

/** Directed edges begin -> end of every connector whose two ends are glued to shapes. */
export function visioConnectorEdges(page: VisioPage): GraphLayoutEdge[] {
	const ends = new Map<string, { begin?: string; end?: string }>();
	for (const connection of page.connectors) {
		const end = /^Begin/i.test(connection.fromCell)
			? 'begin'
			: /^End/i.test(connection.fromCell)
				? 'end'
				: undefined;
		if (!end) continue;
		const entry = ends.get(connection.fromShapeId) ?? {};
		entry[end] ??= connection.toShapeId;
		ends.set(connection.fromShapeId, entry);
	}
	const edges: GraphLayoutEdge[] = [];
	for (const { begin, end } of ends.values())
		if (begin !== undefined && end !== undefined && begin !== end)
			edges.push({ from: begin, to: end });
	return edges;
}

/** One move per shape whose box changes; pins move by the same page-inch delta as the box. */
function moves(
	page: VisioPage,
	boxes: readonly Box[],
	targets: Map<string, { x: number; y: number }>,
) {
	const commands: VisioEdit[] = [];
	for (const box of boxes) {
		const target = targets.get(box.shape.id);
		if (!target) return undefined;
		const dx = target.x - box.x,
			dy = -(target.y - box.y);
		if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) continue;
		const rotation = box.shape.rotation!;
		const command = visioPageEditToDrawing(page, {
			type: 'move-shape',
			pageId: page.id,
			shapeId: box.shape.id,
			x: rotation.pinX + dx,
			y: rotation.pinY + dy,
		});
		if (command.type !== 'move-shape' || ![command.x, command.y].every(Number.isFinite))
			return undefined;
		commands.push(command);
	}
	return commands;
}

/**
 * Design > Re-Layout Page: lay out the selection (two or more shapes) or every movable top-level
 * shape on the page from the connector graph of the page's Connect rows. The laid-out diagram
 * keeps the top-left corner of the shapes' current bounds. Only shapes move: glued connectors
 * follow through core glue recalculation, and core admission stays authoritative.
 */
export function visioReLayoutCommands(
	page: VisioPage,
	style: VisioLayoutStyle,
	ids?: readonly string[],
	options: VisioLayoutOptions = {},
): VisioLayoutPlan | undefined {
	if (!VISIO_LAYOUT_STYLES.includes(style)) return undefined;
	if (ids && (ids.length > 1000 || new Set(ids).size !== ids.length)) return undefined;
	const { boxes, skipped } = scope(page, ids && ids.length > 1 ? ids : undefined);
	if (boxes.length < 2) return undefined;
	const spacing = options.spacing ?? 0.5;
	const inScope = new Set(boxes.map((box) => box.shape.id));
	const edges = visioConnectorEdges(page).filter(
		(edge) => inScope.has(edge.from) && inScope.has(edge.to),
	);
	let centres: Map<string, { x: number; y: number }>;
	try {
		centres = layoutGraph(
			boxes.map((box) => ({ id: box.shape.id, width: box.width, height: box.height })),
			edges,
			style,
			{ spacing, layerSpacing: options.layerSpacing ?? spacing * 1.5 },
		);
	} catch {
		return undefined;
	}
	const left = Math.min(...boxes.map((box) => box.x));
	const top = Math.min(...boxes.map((box) => box.y));
	const targets = new Map(
		boxes.map((box) => {
			const centre = centres.get(box.shape.id)!;
			return [
				box.shape.id,
				{ x: left + centre.x - box.width / 2, y: top + centre.y - box.height / 2 },
			];
		}),
	);
	try {
		const commands = moves(page, boxes, targets);
		return commands && { commands, placed: boxes.length, skipped, edges: edges.length };
	} catch {
		return undefined;
	}
}

/**
 * Home > Arrange > Position > Auto Align & Space: snap the selection (two or more shapes) or every
 * movable top-level shape on the page into rows and columns by clustering their centres, then
 * space rows and columns evenly with at least `minimumGap` page inches between them.
 */
export function visioAutoAlignCommands(
	page: VisioPage,
	ids?: readonly string[],
	minimumGap = 0.25,
): VisioLayoutPlan | undefined {
	if (ids && (ids.length > 1000 || new Set(ids).size !== ids.length)) return undefined;
	if (!Number.isFinite(minimumGap) || minimumGap < 0) return undefined;
	const { boxes, skipped } = scope(page, ids && ids.length > 1 ? ids : undefined);
	if (boxes.length < 2) return undefined;
	try {
		const targets = autoAlignBoxes(
			boxes.map((box) => ({
				id: box.shape.id,
				x: box.x,
				y: box.y,
				width: box.width,
				height: box.height,
			})),
			{ minimumGap },
		);
		const commands = moves(page, boxes, targets);
		const inScope = new Set(boxes.map((box) => box.shape.id));
		const edges = visioConnectorEdges(page).filter(
			(edge) => inScope.has(edge.from) && inScope.has(edge.to),
		);
		return commands && { commands, placed: boxes.length, skipped, edges: edges.length };
	} catch {
		return undefined;
	}
}
