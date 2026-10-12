import { computeSnap, type SnapBox, type SnapGuide } from '../../geometry/snap-guides';
import type { VisioGuideEdit } from '../edit-guide-commands';
import type { VisioPage, VisioShape } from '../model';
import { visioNextShapeId } from './shape-id';
import { visioMovementShape, type VisioPagePoint } from './shape-move';

/** A ruler guide in physical page inches: x for vertical guides, y-up y for horizontal ones. */
export interface VisioPageGuide {
	id: string;
	orientation: 'horizontal' | 'vertical';
	position: number;
}

/** Top-level horizontal and vertical guides of the page. Angled guides are left out. */
export function visioPageGuides(page: VisioPage): VisioPageGuide[] {
	const guides: VisioPageGuide[] = [];
	for (const shape of page.shapes) {
		if (!shape.visibility?.guide || !shape.rotation) continue;
		const { pinX, pinY, angle } = shape.rotation;
		const turn = ((angle % Math.PI) + Math.PI) % Math.PI;
		if (Math.abs(turn) < 1e-6 || Math.abs(turn - Math.PI) < 1e-6)
			guides.push({ id: shape.id, orientation: 'horizontal', position: pinY });
		else if (Math.abs(turn - Math.PI / 2) < 1e-6)
			guides.push({ id: shape.id, orientation: 'vertical', position: pinX });
	}
	return guides.filter((guide) => Number.isFinite(guide.position));
}

const drawing = (page: VisioPage, value: number) => {
	const ratio = page.drawingToPageScale ?? 1;
	if (!Number.isFinite(ratio) || ratio <= 0) throw new Error('Invalid page scale.');
	const result = value / ratio;
	if (!Number.isFinite(result)) throw new Error('Guide position exceeds finite limits.');
	return result;
};

/** A guide dragged out of a ruler: horizontal from the top ruler, vertical from the side one. */
export function visioGuideCreateCommand(
	page: VisioPage,
	orientation: 'horizontal' | 'vertical',
	position: number,
): VisioGuideEdit {
	return {
		type: 'create-guide',
		pageId: page.id,
		shapeId: visioNextShapeId(page),
		orientation,
		position: drawing(page, position),
	};
}
export function visioGuideMoveCommand(
	page: VisioPage,
	id: string,
	position: number,
): VisioGuideEdit {
	return { type: 'move-guide', pageId: page.id, shapeId: id, position: drawing(page, position) };
}

/** A shape's axis-aligned page box with y growing downward (y is the negated y-up top). */
export function visioShapeSnapBox(shape: VisioShape): SnapBox | undefined {
	const [a, b, c, d, e, f] = shape.transform;
	const corners = [
		[0, 0],
		[shape.width, 0],
		[0, shape.height],
		[shape.width, shape.height],
	] as const;
	const xs = corners.map(([x, y]) => a * x + c * y + e);
	const ys = corners.map(([x, y]) => b * x + d * y + f);
	const box = {
		x: Math.min(...xs),
		y: -Math.max(...ys),
		width: Math.max(...xs) - Math.min(...xs),
		height: Math.max(...ys) - Math.min(...ys),
	};
	return Object.values(box).every(Number.isFinite) ? box : undefined;
}

export interface VisioSnapOptions {
	/** Dynamic Grid: snap to other shapes' edges and centres. */
	shapes: boolean;
	/** Snap to the page's ruler guides. */
	guides: boolean;
	/** Page inches; a snap happens within this distance. */
	threshold: number;
	/**
	 * Snap to Grid: the grid step in page inches. On an axis that did not snap to a shape or guide,
	 * the selection's nearer edge lands on a grid line. Omitted or zero leaves the grid out. A
	 * page whose axes differ, or whose grid does not start at the page corner, gives each axis its
	 * step and the position of one line (`VisioGridSteps`).
	 */
	grid?: number | VisioSnapGrid;
}
/** A grid's step and one line's position per axis, in page inches (y up). */
export interface VisioSnapGrid {
	x: number;
	y: number;
	originX?: number;
	originY?: number;
}
export interface VisioSnapResult {
	/** Adjusted drag delta (x right, y up), as `visioPageDragDelta` returns it. */
	delta: VisioPagePoint;
	/** Alignment hints in page inches with y growing downward, for an overlay. */
	lines: SnapGuide[];
}

/** Snap the union box of a moving selection to shapes and guides (closest per axis). */
export function visioSnapMoveDelta(
	page: VisioPage,
	ids: readonly string[],
	delta: VisioPagePoint,
	options: VisioSnapOptions,
): VisioSnapResult {
	const unchanged = { delta, lines: [] };
	const usable = (value: number | undefined) =>
		value !== undefined && value > 0 && Number.isFinite(value) ? value : 0;
	const source = options.grid;
	const grid =
		typeof source === 'object'
			? {
					x: usable(source.x),
					y: usable(source.y),
					originX: Number.isFinite(source.originX) ? source.originX! : 0,
					originY: Number.isFinite(source.originY) ? source.originY! : 0,
				}
			: { x: usable(source), y: usable(source), originX: 0, originY: 0 };
	if ((!options.shapes && !options.guides && !grid.x && !grid.y) || !(options.threshold > 0))
		return unchanged;
	const moving = new Set(ids);
	const boxes = ids
		.map((id) => visioMovementShape(page, id))
		.map((shape) => shape && visioShapeSnapBox(shape));
	if (!boxes.length || boxes.some((box) => !box)) return unchanged;
	const left = Math.min(...boxes.map((box) => box!.x));
	const top = Math.min(...boxes.map((box) => box!.y));
	const right = Math.max(...boxes.map((box) => box!.x + box!.width));
	const bottom = Math.max(...boxes.map((box) => box!.y + box!.height));
	const box = { x: left + delta.x, y: top - delta.y, width: right - left, height: bottom - top };
	const others: SnapBox[] = [];
	if (options.shapes)
		for (const shape of page.shapes) {
			if (moving.has(shape.id) || shape.hidden || shape.visibility?.guide) continue;
			const other = visioShapeSnapBox(shape);
			if (other && (other.width > 0 || other.height > 0)) others.push(other);
		}
	if (options.guides)
		for (const guide of visioPageGuides(page))
			others.push(
				guide.orientation === 'vertical'
					? { x: guide.position, y: -1e6, width: 0, height: 4e6 }
					: { x: -1e6, y: -guide.position, width: 4e6, height: 0 },
			);
	const snapped = computeSnap(box, others, options.threshold);
	const axes = new Set(snapped.guides.map((line) => line.axis));
	if (grid.x && !axes.has('x')) snapped.x = gridEdge(snapped.x, box.width, grid.x, grid.originX);
	// Snap boxes use y = -(page y), so a line at page y = origin sits at -origin.
	if (grid.y && !axes.has('y')) snapped.y = gridEdge(snapped.y, box.height, grid.y, -grid.originY);
	return {
		delta: { x: delta.x + snapped.x - box.x, y: delta.y - (snapped.y - box.y) },
		lines: snapped.guides,
	};
}

/** The start of a span whose nearer edge (start or end) is moved onto the nearest grid line. */
function gridEdge(start: number, size: number, grid: number, origin = 0): number {
	const line = (value: number) => Math.round((value - origin) / grid) * grid + origin;
	const lead = line(start) - start;
	const trail = line(start + size) - (start + size);
	return start + (Math.abs(trail) < Math.abs(lead) ? trail : lead);
}
