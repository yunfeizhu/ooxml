/**
 * Format-neutral "Auto Align & Space": boxes whose centres nearly line up are snapped into
 * shared rows and columns, then the rows and columns are spaced evenly.
 *
 * Boxes use `{ x, y }` as the top-left corner with y growing downward. Clustering compares
 * centres: a centre joins the current row (column) while it stays within `tolerance` of that
 * row's mean centre; the default tolerance is half the median box height (width). Rows keep the
 * top of the first row and columns the left of the first column; the gap between neighbouring
 * rows (columns) becomes their current average gap, clamped to at least `minimumGap`.
 */

export interface AutoAlignBox {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
}
export interface AutoAlignOptions {
	/** Centre distance that still counts as the same row or column. */
	tolerance?: { x?: number; y?: number };
	/** Smallest gap kept between rows and between columns. */
	minimumGap?: number;
}

const median = (values: readonly number[]) => {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

/** Cluster ids by one centre coordinate; clusters are ordered along the axis. */
function clusters(
	boxes: readonly AutoAlignBox[],
	centre: (box: AutoAlignBox) => number,
	tolerance: number,
): AutoAlignBox[][] {
	const sorted = [...boxes].sort((a, b) => centre(a) - centre(b));
	const result: AutoAlignBox[][] = [];
	let mean = 0;
	for (const box of sorted) {
		const current = result.at(-1);
		if (current && Math.abs(centre(box) - mean) <= tolerance) {
			current.push(box);
			mean += (centre(box) - mean) / current.length;
		} else {
			result.push([box]);
			mean = centre(box);
		}
	}
	return result;
}

/** New centre per box along one axis: one shared centre per cluster, clusters evenly spaced. */
function space(
	groups: readonly AutoAlignBox[][],
	start: (box: AutoAlignBox) => number,
	size: (box: AutoAlignBox) => number,
	minimumGap: number,
): Map<string, number> {
	const extents = groups.map((group) => {
		const centre = group.reduce((sum, box) => sum + start(box) + size(box) / 2, 0) / group.length;
		const half = Math.max(...group.map((box) => size(box) / 2));
		return { centre, half };
	});
	const gaps = extents
		.slice(1)
		.map(
			(extent, index) =>
				extent.centre - extent.half - extents[index]!.centre - extents[index]!.half,
		);
	const gap = Math.max(
		minimumGap,
		gaps.length ? gaps.reduce((sum, value) => sum + value, 0) / gaps.length : 0,
	);
	const result = new Map<string, number>();
	let cursor = extents[0] ? extents[0].centre - extents[0].half : 0;
	groups.forEach((group, index) => {
		const { half } = extents[index]!;
		for (const box of group) result.set(box.id, cursor + half);
		cursor += half * 2 + gap;
	});
	return result;
}

/** New top-left corners for every box. Boxes need not overlap-free input; ids must be unique. */
export function autoAlignBoxes(
	boxes: readonly AutoAlignBox[],
	options: AutoAlignOptions = {},
): Map<string, { x: number; y: number }> {
	if (new Set(boxes.map((box) => box.id)).size !== boxes.length)
		throw new Error('Auto align box IDs must be unique.');
	if (
		!boxes.every((box) =>
			[box.x, box.y, box.width, box.height].every((value) => Number.isFinite(value)),
		)
	)
		throw new Error('Auto align boxes must be finite.');
	const result = new Map<string, { x: number; y: number }>();
	if (!boxes.length) return result;
	const toleranceX = options.tolerance?.x ?? median(boxes.map((box) => box.width)) / 2;
	const toleranceY = options.tolerance?.y ?? median(boxes.map((box) => box.height)) / 2;
	const minimumGap = options.minimumGap ?? 0;
	const rows = clusters(boxes, (box) => box.y + box.height / 2, toleranceY);
	const columns = clusters(boxes, (box) => box.x + box.width / 2, toleranceX);
	const ys = space(
		rows,
		(box) => box.y,
		(box) => box.height,
		minimumGap,
	);
	const xs = space(
		columns,
		(box) => box.x,
		(box) => box.width,
		minimumGap,
	);
	for (const box of boxes)
		result.set(box.id, { x: xs.get(box.id)! - box.width / 2, y: ys.get(box.id)! - box.height / 2 });
	return result;
}
