import type { VisioMatrix } from './model';
import { attribute, children } from './sheet';

/** The formula Visio writes on a dynamically glued connector endpoint (shape-to-shape glue). */
export const VISIO_WALK_GLUE = '_WALKGLUE(BegTrigger,EndTrigger,WalkPreference)';
const walkGlue =
	/^\s*_WALKGLUE\((?:BegTrigger,EndTrigger|EndTrigger,BegTrigger),WalkPreference\)\s*$/i;
const trigger = /^\s*_XFTRIGGER\(Sheet\.([1-9]\d{0,9})!EventXFMod\)\s*$/i;
const pointGlue =
	/^\s*PAR\(PNT\(Sheet\.([1-9]\d{0,9})!Connections\.X([1-9]\d{0,4}),\s*Sheet\.\1!Connections\.Y\2\)\)\s*$/i;

export const visioGlueTrigger = (shapeId: string) => `_XFTRIGGER(Sheet.${shapeId}!EventXFMod)`;
/**
 * The formula Visio writes on both coordinates of an end glued to a connection point (point-to-point
 * glue). `index` is the zero-based Connection row; ShapeSheet names count rows from 1.
 */
export const visioPointGlue = (shapeId: string, index: number) =>
	`PAR(PNT(Sheet.${shapeId}!Connections.X${index + 1},Sheet.${shapeId}!Connections.Y${index + 1}))`;
/** The shape and zero-based Connection row a point-glue formula names, if it is one. */
export function visioPointGlueTarget(
	formula: string | undefined,
): { shapeId: string; index: number } | undefined {
	const match = formula ? pointGlue.exec(formula) : undefined;
	return match ? { shapeId: match[1]!, index: Number(match[2]) - 1 } : undefined;
}

/** The glued shape a native trigger formula names, if it is one. */
export function visioGlueTriggerTarget(formula: string | undefined): string | undefined {
	return formula ? trigger.exec(formula)?.[1] : undefined;
}

/** Native dynamic-glue cells of a connector: Visio re-evaluates them; the editor keeps their caches. */
export function isNativeGlueCell(name: string, formula: string): boolean {
	return (
		(/^(BeginX|BeginY|EndX|EndY)$/.test(name) &&
			(walkGlue.test(formula) || pointGlue.test(formula))) ||
		(/^(BegTrigger|EndTrigger)$/.test(name) && trigger.test(formula))
	);
}

/** A native glue cell of a top-level connector that its page's Connect rows name as FromSheet. */
export function isConnectedGlueCell(node: Element, formula: string): boolean {
	if (node.localName !== 'Cell' || !isNativeGlueCell(attribute(node, 'N') ?? '', formula))
		return false;
	const shape = node.parentNode as Element | null;
	const root = shape?.parentNode?.parentNode as Element | null | undefined;
	if (shape?.localName !== 'Shape' || root?.localName !== 'PageContents') return false;
	const id = attribute(shape, 'ID');
	return children(root, 'Connects').some((container) =>
		children(container, 'Connect').some((row) => attribute(row, 'FromSheet') === id),
	);
}

export interface VisioGluePoint {
	x: number;
	y: number;
}
/** A glue target's local size and its local-to-page transform (y-up drawing inches). */
export interface VisioGlueBox {
	width: number;
	height: number;
	transform: VisioMatrix;
}

/** The four side midpoints of a shape's alignment box, in page coordinates. */
export function visioGlueSites(box: VisioGlueBox): VisioGluePoint[] {
	const [a, b, c, d, e, f] = box.transform;
	return [
		[box.width / 2, 0],
		[box.width, box.height / 2],
		[box.width / 2, box.height],
		[0, box.height / 2],
	].map(([x, y]) => ({ x: a * x! + c * y! + e, y: b * x! + d * y! + f }));
}

const distance = (p: VisioGluePoint, q: VisioGluePoint) => Math.hypot(p.x - q.x, p.y - q.y);

/**
 * Walking shape-to-shape glue: each glued end sits on the side midpoint of its shape nearest the
 * other end (the closest pair of midpoints when both ends are glued). Pairs that would coincide,
 * such as the shared side of touching shapes, are skipped. Unglued ends keep their point. This is
 * the straight-connector subset of Visio's dynamic glue, not its router.
 */
export function visioConnectorGluePoints(
	begin: VisioGlueBox | VisioGluePoint,
	end: VisioGlueBox | VisioGluePoint,
): { begin: VisioGluePoint; end: VisioGluePoint } {
	const sites = (value: VisioGlueBox | VisioGluePoint): VisioGluePoint[] =>
		'transform' in value ? visioGlueSites(value) : [value];
	let best: { begin: VisioGluePoint; end: VisioGluePoint } | undefined;
	for (const from of sites(begin))
		for (const to of sites(end)) {
			const length = distance(from, to);
			if (length > 1e-9 && (!best || length < distance(best.begin, best.end)))
				best = { begin: from, end: to };
		}
	return best ?? { begin: sites(begin)[0]!, end: sites(end)[0]! };
}
