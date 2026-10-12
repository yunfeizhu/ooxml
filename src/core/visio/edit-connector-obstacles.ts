import { attribute, children } from './sheet';
import { transform } from './geometry';
import { cells } from './edit-geometry-cells';
import { visioFormulaCachedValue } from './formula';
import { routeBox } from './edit-connector-layout';
import { effectiveCells, stencilTemplate } from './edit-stencil-connector';
import type { VisioRouteBox } from './connector-route';

/** A cell's cached number, or undefined when it is missing, an error or not a finite value. */
function cached(node: Element | undefined): number | undefined {
	if (!node || node.hasAttribute('E')) return undefined;
	const value = visioFormulaCachedValue(attribute(node, 'V') ?? '', attribute(node, 'U')).value;
	return Number.isFinite(value) && Math.abs(value) <= 1e6 ? value : undefined;
}

/** Visio's ObjType for a shape its layout places and its connectors route around. */
export const VISIO_PLACEABLE = 1;

/**
 * The page boxes a right-angle connector routes around, as Visio does: the top-level placeable
 * shapes (ObjType 1) except `exclude` (the connector and the shapes it is glued to, whose boxes
 * the route already knows). Visio leaves ObjType 0 ("let Visio decide") shapes in a connector's
 * way and makes a shape placeable when a dynamic connector is glued to it, so a plain drawn
 * rectangle is not an obstacle until something connects to it. Read from the shapes' own cached
 * cells, nothing is proven or changed. One-shape stencil instances count through the cells in
 * effect over their master; grouped instances are left out.
 */
export function connectorObstacles(root: Element, exclude: ReadonlySet<string>): VisioRouteBox[] {
	const result: VisioRouteBox[] = [];
	for (const shape of children(children(root, 'Shapes')[0], 'Shape')) {
		if (exclude.has(attribute(shape, 'ID') ?? '')) continue;
		// A registered one-shape stencil instance is read through its master's cells.
		const stencil = !!stencilTemplate(shape);
		const local = stencil ? effectiveCells(shape) : cells(shape);
		const value = (name: string) => cached(local.get(name));
		if (
			['BeginX', 'BeginY', 'EndX', 'EndY'].some((name) => local.has(name)) ||
			(value('OneD') ?? 0) !== 0 ||
			attribute(shape, 'Type') === 'Guide' ||
			(!stencil && (shape.hasAttribute('Master') || shape.hasAttribute('MasterShape'))) ||
			value('ObjType') !== VISIO_PLACEABLE
		)
			continue;
		const width = value('Width'),
			height = value('Height'),
			pinX = value('PinX'),
			pinY = value('PinY');
		if (width === undefined || height === undefined || pinX === undefined || pinY === undefined)
			continue;
		if (!(Math.abs(width) > 0) || !(Math.abs(height) > 0)) continue;
		result.push(
			routeBox({
				width,
				height,
				transform: transform(
					pinX,
					pinY,
					value('LocPinX') ?? width / 2,
					value('LocPinY') ?? height / 2,
					value('Angle') ?? 0,
					(value('FlipX') ?? 0) !== 0,
					(value('FlipY') ?? 0) !== 0,
				),
			}),
		);
	}
	return result;
}
