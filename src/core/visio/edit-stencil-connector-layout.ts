import { executableCellFormula } from './cell-formula';
import type { VisioConnectorRoute } from './edit-connector-commands';
import type { VisioRouteBox, VisioRoutePoint } from './connector-route';
import { visioWalkRoute, type VisioWalkEnd } from './connector-route-walk';
import type { VisioGlueBox } from './edit-connector-glue';
import { dynamicSites } from './edit-connector-layout';
import { effectiveCells, effectiveNumber } from './edit-stencil-connector';
import { writeStencilConnector } from './edit-stencil-connector-write';
import { fail } from './package-common';
import { attribute } from './sheet';

const same = (a: number, b: number) =>
	Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

/** A dynamically glued shape as a walking-glue end: side midpoints, bounds, middle and outline. */
export function walkShape(box: VisioGlueBox): VisioWalkEnd {
	const [a, b, c, d, e, f] = box.transform;
	const at = (x: number, y: number): VisioRoutePoint => ({
		x: a * x + c * y + e,
		y: b * x + d * y + f,
	});
	const sites = dynamicSites(box);
	return {
		shape: {
			sites: sites.map((site) => ({ point: site.point, normal: site.normal! })),
			bounds: sites[0]!.box!,
			center: at(box.width / 2, box.height / 2),
			corners: [at(0, 0), at(box.width, 0), at(box.width, box.height), at(0, box.height)],
		},
	};
}

/** The path of a stencil connector between its ends, or undefined to use the general router. */
export function stencilConnectorPath(
	begin: VisioWalkEnd,
	end: VisioWalkEnd,
	route: VisioConnectorRoute,
	obstacles: readonly VisioRouteBox[],
): VisioRoutePoint[] | undefined {
	return visioWalkRoute(begin, end, route, obstacles);
}

/** Other shapes that compute cells from this connector are not recalculated here. */
function assertNoDependents(root: Element, shape: Element, check: () => void): void {
	const mention = new RegExp(`\\bSheet\\.${attribute(shape, 'ID')}!`, 'i');
	for (const node of Array.from(root.getElementsByTagName('Cell'))) {
		check();
		const source = executableCellFormula(attribute(node, 'F'));
		if (!source || !mention.test(source)) continue;
		let owner: Node | null = node;
		while (owner && owner !== shape) owner = owner.parentNode;
		// The connector's own cells (an unglued trigger names its own sheet) follow the layout.
		if (owner === shape) continue;
		fail(
			'EDIT_UNSUPPORTED_DEPENDENCY',
			'Another shape computes its cells from this connector; they cannot be recalculated.',
		);
	}
}

/**
 * Lay a stencil connector (Visio's Dynamic connector) out along `vertices`. Its own cells are
 * written in Visio's instance form; nothing else on the page may depend on them.
 */
export function layoutStencilConnector(
	root: Element,
	pageId: string,
	shape: Element,
	route: VisioConnectorRoute,
	vertices: readonly VisioRoutePoint[],
	check: () => void,
): readonly string[] {
	const effective = effectiveCells(shape);
	for (const [prefix, point] of [
		['Begin', vertices[0]!],
		['End', vertices.at(-1)!],
	] as const)
		if (
			(!same(effectiveNumber(effective, `${prefix}X`), point.x) ||
				!same(effectiveNumber(effective, `${prefix}Y`), point.y)) &&
			effectiveNumber(effective, `Lock${prefix}`, 0) !== 0
		)
			fail('EDIT_PROTECTED_CELL', 'This connector is protected against moving its ends.');
	assertNoDependents(root, shape, check);
	writeStencilConnector(shape, route, vertices);
	return [pageId];
}
