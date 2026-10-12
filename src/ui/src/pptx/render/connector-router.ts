/**
 * Orthogonal connector routing (A* around obstacle boxes). The router is format-neutral and
 * lives in `ooxml-core/geometry` (`connector-router*.ts`), where Visio uses it too; this module
 * keeps the import surface the PowerPoint bindings have always used.
 */
export {
	routeConnector,
	routeOrthogonalConnector,
	waypointsToPathData,
	waypointsToPathD,
	inflateRect,
	pointInRect,
	segmentIntersectsRect,
	directPathClear,
	heuristic,
	pointKey,
	buildGraphNodes,
	aStarOrthogonal,
	simplifyPath,
	PADDING_DEFAULT,
	ROUTING_PADDING_DEFAULT,
	CANVAS_SENTINEL,
	type RouterPoint,
	type RouterRect,
	type ConnectorRouterOptions,
	type OrthogonalRouterOptions,
} from 'ooxml-core/geometry';
