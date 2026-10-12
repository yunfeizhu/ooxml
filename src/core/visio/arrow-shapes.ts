import type { VisioBasicOutline, VisioOutlinePoint } from './basic-shapes';

/**
 * Outlines for Visio's Arrow Shapes stencil, in the local unit box of `basic-shapes.ts` (0 to 1,
 * Y up). The curved arrow is a polyline; 1-D arrows are drawn as thin 2D outlines. Visio's master
 * shapesheets and control handles are not reproduced.
 */
export const VISIO_ARROW_SHAPES = [
	'arrow-right',
	'arrow-left',
	'arrow-up',
	'arrow-down',
	'arrow-left-right',
	'arrow-up-down',
	'arrow-quad',
	'arrow-notched',
	'arrow-pentagon',
	'arrow-chevron',
	'arrow-curved',
	'arrow-line-single',
	'arrow-line-double',
] as const;
export type VisioArrowShape = (typeof VISIO_ARROW_SHAPES)[number];

type Points = VisioOutlinePoint[];
/** Points per curved run of an outline polyline. */
export const VISIO_OUTLINE_SEGMENTS = 12;
const SEGMENTS = VISIO_OUTLINE_SEGMENTS;
/** Points on an ellipse arc, from `from` to `to` radians inclusive (counter-clockwise positive). */
export function arc(
	cx: number,
	cy: number,
	rx: number,
	ry: number,
	from: number,
	to: number,
): Points {
	return Array.from({ length: SEGMENTS + 1 }, (_, index) => {
		const angle = from + ((to - from) * index) / SEGMENTS;
		return [cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)];
	});
}
/** Fit points into the unit box, as `basic-shapes.ts` does for regular polygons. */
function fit(points: Points): Points {
	const xs = points.map(([x]) => x),
		ys = points.map(([, y]) => y);
	const left = Math.min(...xs),
		bottom = Math.min(...ys);
	const width = Math.max(...xs) - left,
		height = Math.max(...ys) - bottom;
	return points.map(([x, y]) => [(x - left) / width, (y - bottom) / height]);
}
const mirror = (points: Points): Points => points.map(([x, y]) => [1 - x, y]);
const transpose = (points: Points): Points => points.map(([x, y]) => [y, x]);

const right: Points = [
	[0, 0.3],
	[0.65, 0.3],
	[0.65, 0],
	[1, 0.5],
	[0.65, 1],
	[0.65, 0.7],
	[0, 0.7],
];
const leftRight: Points = [
	[0, 0.5],
	[0.25, 0],
	[0.25, 0.3],
	[0.75, 0.3],
	[0.75, 0],
	[1, 0.5],
	[0.75, 1],
	[0.75, 0.7],
	[0.25, 0.7],
	[0.25, 1],
];
/** A four-way arrow: each arm is a third of the box wide with a head reaching the edge. */
function quad(): Points {
	const arm: Points = [
		[0.42, 0.58],
		[0.42, 0.8],
		[0.3, 0.8],
		[0.5, 1],
		[0.7, 0.8],
		[0.58, 0.8],
		[0.58, 0.58],
	];
	const turn = ([x, y]: VisioOutlinePoint, times: number): VisioOutlinePoint => {
		let point: VisioOutlinePoint = [x, y];
		for (let index = 0; index < times; index++) point = [point[1], 1 - point[0]];
		return point;
	};
	return [0, 1, 2, 3].flatMap((times) => arm.map((point) => turn(point, times)));
}
/** A quarter-plus band curving up and over to the right, ending in a downward head. */
function curved(): Points {
	const outer = arc(0, 0, 1, 1, Math.PI, Math.PI / 4);
	const inner = arc(0, 0, 0.6, 0.6, Math.PI / 4, Math.PI);
	const at = (radius: number, angle: number): VisioOutlinePoint => [
		radius * Math.cos(angle),
		radius * Math.sin(angle),
	];
	const end = Math.PI / 4;
	return fit([...outer, at(1.2, end), at(0.8, end - 0.45), at(0.4, end), ...inner]);
}
const singleLine: Points = [
	[0, 0.4],
	[0.75, 0.4],
	[0.75, 0.15],
	[1, 0.5],
	[0.75, 0.85],
	[0.75, 0.6],
	[0, 0.6],
];
const doubleLine: Points = [
	[0, 0.5],
	[0.25, 0.15],
	[0.25, 0.4],
	[0.75, 0.4],
	[0.75, 0.15],
	[1, 0.5],
	[0.75, 0.85],
	[0.75, 0.6],
	[0.25, 0.6],
	[0.25, 0.85],
];

export const VISIO_ARROW_OUTLINES: Record<VisioArrowShape, VisioBasicOutline> = {
	'arrow-right': { paths: [right] },
	'arrow-left': { paths: [mirror(right)] },
	'arrow-up': { paths: [transpose(right)] },
	'arrow-down': { paths: [transpose(mirror(right))] },
	'arrow-left-right': { paths: [leftRight] },
	'arrow-up-down': { paths: [transpose(leftRight)] },
	'arrow-quad': { paths: [quad()] },
	'arrow-notched': { paths: [[...right, [0.15, 0.5]]] },
	'arrow-pentagon': {
		paths: [
			[
				[0, 0],
				[0.75, 0],
				[1, 0.5],
				[0.75, 1],
				[0, 1],
			],
		],
	},
	'arrow-chevron': {
		paths: [
			[
				[0, 0],
				[0.7, 0],
				[1, 0.5],
				[0.7, 1],
				[0, 1],
				[0.3, 0.5],
			],
		],
	},
	'arrow-curved': { paths: [curved()] },
	'arrow-line-single': { paths: [singleLine] },
	'arrow-line-double': { paths: [doubleLine] },
};
