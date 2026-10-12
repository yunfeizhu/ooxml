import type { VisioPage, VisioShape } from '../model';
import type { VisioConnectorRoute } from '../edit-connector-commands';
import {
	chooseSites,
	dynamicSites,
	pointSite,
	routeBox,
	routeVertices,
	type ConnectorSite,
} from '../edit-connector-layout';
import type { VisioGlueBox } from '../edit-connector-glue';
import { visioWalkRoute } from '../connector-route-walk';
import { walkShape } from '../edit-stencil-connector-layout';

/** A connector redrawn for a move preview, in page coordinates with y down (SVG page inches). */
export interface VisioConnectorPreview {
	connectorId: string;
	route: VisioConnectorRoute;
	/** Route vertices; a curved route has the four controls of one cubic. */
	points: { x: number; y: number }[];
}

/**
 * While shapes are dragged, the connectors glued to them re-routed for the translated shapes,
 * with the same site choice and router the core uses when the move is committed, including the
 * detour a right-angle connector takes around the other shapes of the page. Connectors that move
 * themselves or cannot be resolved are left out.
 */
export function visioConnectorMovePreviews(
	page: VisioPage,
	moved: ReadonlySet<string>,
	delta: { x: number; y: number },
): VisioConnectorPreview[] {
	const byId = new Map(page.shapes.map((shape) => [shape.id, shape]));
	const box = (shape: VisioShape): VisioGlueBox => {
		const [a, b, c, d, e, f] = shape.transform;
		const offset = moved.has(shape.id) ? delta : { x: 0, y: 0 };
		return {
			width: shape.width,
			height: shape.height,
			transform: [a, b, c, d, e + offset.x, f + offset.y],
		};
	};
	const result: VisioConnectorPreview[] = [];
	for (const connector of page.shapes) {
		if (connector.kind !== 'connector' || moved.has(connector.id)) continue;
		const rows = page.connectors.filter((row) => row.fromShapeId === connector.id);
		if (!rows.some((row) => moved.has(row.toShapeId)) || !connector.lineEnds) continue;
		const sites = (cell: 'BeginX' | 'EndX'): ConnectorSite[] | undefined => {
			const row = rows.find((candidate) => candidate.fromCell === cell);
			const target = row ? byId.get(row.toShapeId) : undefined;
			if (row && !target) return undefined;
			if (!row || !target) {
				const [a, b, c, d, e, f] = connector.transform;
				const local = cell === 'BeginX' ? connector.lineEnds!.begin : connector.lineEnds!.end;
				return [{ point: { x: a * local.x + c * local.y + e, y: b * local.x + d * local.y + f } }];
			}
			const index = /^Connections\.X([1-9]\d*)$/.exec(row.toCell)?.[1];
			if (index === undefined) return dynamicSites(box(target));
			const point = target.connectionPoints?.find((p) => p.index === Number(index) - 1);
			return point ? [pointSite(box(target), point.x, point.y)] : undefined;
		};
		const begin = sites('BeginX'),
			end = sites('EndX');
		if (!begin || !end) continue;
		const walk = (cell: 'BeginX' | 'EndX', found: ConnectorSite[]) => {
			const row = rows.find((candidate) => candidate.fromCell === cell);
			const target = row && row.toCell === 'PinX' ? byId.get(row.toShapeId) : undefined;
			return target ? walkShape(box(target)) : { point: found[0]!.point };
		};
		// A stencil connector (Visio's Dynamic connector) is right-angle unless its cells say otherwise.
		const stencil = connector.masterId !== undefined;
		const route = connector.connectorRoute ?? (stencil ? 'right-angle' : 'straight');
		const glued = new Set(rows.map((row) => row.toShapeId));
		// As the core's `connectorObstacles`: the other local placeable shapes of the page.
		const obstacles =
			route === 'right-angle'
				? page.shapes
						.filter(
							(shape) =>
								shape.kind !== 'connector' &&
								shape.placeable === true &&
								!shape.children.length &&
								!shape.lineEnds &&
								!glued.has(shape.id) &&
								shape.width > 0 &&
								shape.height > 0,
						)
						.map((shape) => routeBox(box(shape)))
				: [];
		try {
			const chosen = chooseSites(begin, end);
			// As the core lays a stencil connector out: Visio's side choice, else the router.
			const points =
				(stencil
					? visioWalkRoute(walk('BeginX', begin), walk('EndX', end), route, obstacles)
					: undefined) ?? routeVertices(route, chosen, obstacles);
			result.push({
				connectorId: connector.id,
				route,
				points: points.map((point) => ({ x: point.x, y: page.height - point.y })),
			});
		} catch {
			// Coinciding ends are refused by the core on release as well.
		}
	}
	return result;
}

/** SVG path data for a connector preview. */
export function visioConnectorPreviewPath(preview: VisioConnectorPreview): string {
	const [first, ...rest] = preview.points;
	if (!first) return '';
	const point = (p: { x: number; y: number }) => `${p.x} ${p.y}`;
	return preview.route === 'curved' && rest.length === 3
		? `M ${point(first)} C ${rest.map(point).join(' ')}`
		: `M ${point(first)} ${rest.map((p) => `L ${point(p)}`).join(' ')}`;
}
