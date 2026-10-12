/**
 * Outlines for Visio's Basic Shapes stencil, written as local geometry the core can create and
 * resize: every path is a closed run of RelMoveTo/RelLineTo rows in the shape's own box (0 to 1,
 * Y up). Curved outlines (the can) are polylines. Ellipse and Circle are not here; they use the
 * native Ellipse row through `create-ellipse`.
 */
export const VISIO_BASIC_SHAPES = [
	'rectangle',
	'square',
	'triangle',
	'right-triangle',
	'pentagon',
	'hexagon',
	'octagon',
	'star',
	'diamond',
	'rounded-rectangle',
	'cross',
	'parallelogram',
	'trapezoid',
	'can',
	'cube',
	'chevron',
] as const;
export type VisioBasicShape = (typeof VISIO_BASIC_SHAPES)[number];
export type VisioOutlinePoint = readonly [x: number, y: number];
export interface VisioBasicOutline {
	/** Closed paths, drawn in order; each becomes one Geometry section. */
	paths: readonly (readonly VisioOutlinePoint[])[];
	/** Open, unfilled polylines drawn over the paths (interior marks such as a flowchart's bars). */
	lines?: readonly (readonly VisioOutlinePoint[])[];
	/** Corner radius as a fraction of the shorter side, written to the Rounding cell. */
	rounding?: number;
}

export const isVisioBasicShape = (value: unknown): value is VisioBasicShape =>
	(VISIO_BASIC_SHAPES as readonly unknown[]).includes(value);

/** Fit points into the unit box, so a regular polygon fills the shape's width and height. */
function fit(points: VisioOutlinePoint[]): VisioOutlinePoint[] {
	const xs = points.map(([x]) => x),
		ys = points.map(([, y]) => y);
	const left = Math.min(...xs),
		bottom = Math.min(...ys);
	const width = Math.max(...xs) - left,
		height = Math.max(...ys) - bottom;
	return points.map(([x, y]) => [(x - left) / width, (y - bottom) / height]);
}
/** A regular polygon (or a star when an inner radius is given) with its first point at the top. */
function polygon(count: number, inner?: number): VisioOutlinePoint[] {
	const steps = inner === undefined ? count : count * 2;
	return fit(
		Array.from({ length: steps }, (_, index) => {
			const radius = inner !== undefined && index % 2 ? inner : 1;
			const angle = Math.PI / 2 + (index * 2 * Math.PI) / steps;
			return [radius * Math.cos(angle), radius * Math.sin(angle)];
		}),
	);
}
/** Half of an ellipse as a polyline, from angle `from` to `to` (radians, counter-clockwise). */
function arc(cy: number, ry: number, from: number, to: number): VisioOutlinePoint[] {
	const segments = 12;
	return Array.from({ length: segments + 1 }, (_, index) => {
		const angle = from + ((to - from) * index) / segments;
		return [0.5 + 0.5 * Math.cos(angle), cy + ry * Math.sin(angle)];
	});
}
const box: VisioOutlinePoint[] = [
	[0, 0],
	[1, 0],
	[1, 1],
	[0, 1],
];
/** The can's lid is this fraction of its height. */
const LID = 0.2;
/** A regular octagon's corner cut in a unit square. */
const CUT = 1 / (2 + Math.SQRT2);
const OUTLINES: Record<VisioBasicShape, VisioBasicOutline> = {
	rectangle: { paths: [box] },
	square: { paths: [box] },
	triangle: {
		paths: [
			[
				[0, 0],
				[1, 0],
				[0.5, 1],
			],
		],
	},
	'right-triangle': {
		paths: [
			[
				[0, 0],
				[1, 0],
				[0, 1],
			],
		],
	},
	pentagon: { paths: [polygon(5)] },
	hexagon: {
		paths: [
			[
				[0.25, 0],
				[0.75, 0],
				[1, 0.5],
				[0.75, 1],
				[0.25, 1],
				[0, 0.5],
			],
		],
	},
	octagon: {
		paths: [
			[
				[CUT, 0],
				[1 - CUT, 0],
				[1, CUT],
				[1, 1 - CUT],
				[1 - CUT, 1],
				[CUT, 1],
				[0, 1 - CUT],
				[0, CUT],
			],
		],
	},
	star: { paths: [polygon(5, 0.382)] },
	diamond: {
		paths: [
			[
				[0.5, 0],
				[1, 0.5],
				[0.5, 1],
				[0, 0.5],
			],
		],
	},
	'rounded-rectangle': { paths: [box], rounding: 0.15 },
	cross: {
		paths: [
			[
				[1 / 3, 0],
				[2 / 3, 0],
				[2 / 3, 1 / 3],
				[1, 1 / 3],
				[1, 2 / 3],
				[2 / 3, 2 / 3],
				[2 / 3, 1],
				[1 / 3, 1],
				[1 / 3, 2 / 3],
				[0, 2 / 3],
				[0, 1 / 3],
				[1 / 3, 1 / 3],
			],
		],
	},
	parallelogram: {
		paths: [
			[
				[0, 0],
				[0.75, 0],
				[1, 1],
				[0.25, 1],
			],
		],
	},
	trapezoid: {
		paths: [
			[
				[0, 0],
				[1, 0],
				[0.75, 1],
				[0.25, 1],
			],
		],
	},
	can: {
		paths: [
			// The body: down the left side, round the front of the base, up the right side and
			// back along the front of the lid.
			[...arc(LID / 2, LID / 2, Math.PI, 2 * Math.PI), ...arc(1 - LID / 2, LID / 2, 0, -Math.PI)],
			// The lid, drawn over the body.
			arc(1 - LID / 2, LID / 2, 0, 2 * Math.PI).slice(0, -1),
		],
	},
	cube: {
		paths: [
			[
				[0, 0],
				[0.75, 0],
				[0.75, 0.75],
				[0, 0.75],
			],
			[
				[0, 0.75],
				[0.75, 0.75],
				[1, 1],
				[0.25, 1],
			],
			[
				[0.75, 0],
				[1, 0.25],
				[1, 1],
				[0.75, 0.75],
			],
		],
	},
	chevron: {
		paths: [
			[
				[0, 0],
				[0.75, 0],
				[1, 0.5],
				[0.75, 1],
				[0, 1],
				[0.25, 0.5],
			],
		],
	},
};

export function visioBasicShapeOutline(shape: VisioBasicShape): VisioBasicOutline {
	return OUTLINES[shape];
}
