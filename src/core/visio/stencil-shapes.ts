import {
	isVisioBasicShape,
	visioBasicShapeOutline,
	type VisioBasicOutline,
	type VisioBasicShape,
	type VisioOutlinePoint,
} from './basic-shapes';
import {
	VISIO_ARROW_OUTLINES,
	VISIO_ARROW_SHAPES,
	VISIO_OUTLINE_SEGMENTS,
	arc,
	type VisioArrowShape,
} from './arrow-shapes';
export { VISIO_ARROW_SHAPES, type VisioArrowShape } from './arrow-shapes';

/**
 * Outlines for Visio's Basic Flowchart Shapes stencil (Arrow Shapes are in `arrow-shapes.ts`), in
 * the local unit box of `basic-shapes.ts` (0 to 1, Y up). Curves (waves, cylinder ends) are
 * polylines; interior marks (Predefined process bars, Internal storage rules) are open `lines`.
 * These approximate Visio's masters by outline only: their shapesheets, control handles,
 * connection points and data are not reproduced.
 */
export const VISIO_FLOWCHART_SHAPES = [
	'flowchart-process',
	'flowchart-decision',
	'flowchart-terminator',
	'flowchart-document',
	'flowchart-data',
	'flowchart-predefined-process',
	'flowchart-stored-data',
	'flowchart-internal-storage',
	'flowchart-sequential-data',
	'flowchart-direct-data',
	'flowchart-manual-input',
	'flowchart-manual-operation',
	'flowchart-preparation',
	'flowchart-off-page-reference',
	'flowchart-card',
	'flowchart-paper-tape',
	'flowchart-display',
	'flowchart-loop-limit',
] as const;
export type VisioFlowchartShape = (typeof VISIO_FLOWCHART_SHAPES)[number];
export type VisioStencilShape = VisioFlowchartShape | VisioArrowShape;
const ALL: readonly string[] = [...VISIO_FLOWCHART_SHAPES, ...VISIO_ARROW_SHAPES];
export const isVisioStencilShape = (value: unknown): value is VisioStencilShape =>
	typeof value === 'string' && ALL.includes(value);

type Points = VisioOutlinePoint[];
const SEGMENTS = VISIO_OUTLINE_SEGMENTS;
/** One period of a sine wave across the box at height `y`. */
function wave(y: number, amplitude: number, reverse = false): Points {
	const points: Points = Array.from({ length: SEGMENTS + 1 }, (_, index) => {
		const x = index / SEGMENTS;
		return [x, y - amplitude * Math.sin(2 * Math.PI * x)];
	});
	return reverse ? points.reverse() : points;
}
const quarter = Math.PI / 2;

const box: Points = [
	[0, 0],
	[1, 0],
	[1, 1],
	[0, 1],
];

const OUTLINES: Record<VisioStencilShape, VisioBasicOutline> = {
	'flowchart-process': { paths: [box] },
	'flowchart-decision': {
		paths: [
			[
				[0.5, 0],
				[1, 0.5],
				[0.5, 1],
				[0, 0.5],
			],
		],
	},
	// A stadium: Rounding of half the shorter side turns the box ends into semicircles.
	'flowchart-terminator': { paths: [box], rounding: 0.5 },
	'flowchart-document': { paths: [[[0, 1], ...wave(0.12, 0.08), [1, 1]]] },
	'flowchart-data': {
		paths: [
			[
				[0, 0],
				[0.8, 0],
				[1, 1],
				[0.2, 1],
			],
		],
	},
	'flowchart-predefined-process': {
		paths: [box],
		lines: [
			[
				[0.1, 0],
				[0.1, 1],
			],
			[
				[0.9, 0],
				[0.9, 1],
			],
		],
	},
	'flowchart-stored-data': {
		paths: [
			[
				...arc(1, 0.5, 0.15, 0.5, quarter, 3 * quarter),
				...arc(0.15, 0.5, 0.15, 0.5, 3 * quarter, quarter),
			],
		],
	},
	'flowchart-internal-storage': {
		paths: [box],
		lines: [
			[
				[0.15, 0],
				[0.15, 1],
			],
			[
				[0, 0.85],
				[1, 0.85],
			],
		],
	},
	'flowchart-sequential-data': {
		paths: [arc(0.5, 0.5, 0.5, 0.5, -quarter, 3 * quarter).slice(0, -1)],
		lines: [
			[
				[0.5, 0],
				[1, 0],
			],
		],
	},
	'flowchart-direct-data': {
		paths: [
			[
				...arc(0.85, 0.5, 0.15, 0.5, quarter, -quarter),
				...arc(0.15, 0.5, 0.15, 0.5, 3 * quarter, quarter),
			],
		],
		lines: [arc(0.85, 0.5, 0.15, 0.5, quarter, 3 * quarter)],
	},
	'flowchart-manual-input': {
		paths: [
			[
				[0, 0],
				[1, 0],
				[1, 1],
				[0, 0.7],
			],
		],
	},
	'flowchart-manual-operation': {
		paths: [
			[
				[0.2, 0],
				[0.8, 0],
				[1, 1],
				[0, 1],
			],
		],
	},
	'flowchart-preparation': {
		paths: [
			[
				[0.2, 0],
				[0.8, 0],
				[1, 0.5],
				[0.8, 1],
				[0.2, 1],
				[0, 0.5],
			],
		],
	},
	'flowchart-off-page-reference': {
		paths: [
			[
				[0, 1],
				[0, 0.4],
				[0.5, 0],
				[1, 0.4],
				[1, 1],
			],
		],
	},
	'flowchart-card': {
		paths: [
			[
				[0, 0],
				[1, 0],
				[1, 1],
				[0.2, 1],
				[0, 0.8],
			],
		],
	},
	'flowchart-paper-tape': { paths: [[...wave(0.1, 0.1), ...wave(0.9, 0.1, true)]] },
	'flowchart-display': {
		paths: [[[0, 0.5], [0.15, 1], ...arc(0.85, 0.5, 0.15, 0.5, quarter, -quarter), [0.15, 0]]],
	},
	'flowchart-loop-limit': {
		paths: [
			[
				[0, 0],
				[1, 0],
				[1, 0.8],
				[0.8, 1],
				[0.2, 1],
				[0, 0.8],
			],
		],
	},
	...VISIO_ARROW_OUTLINES,
};

export function visioStencilShapeOutline(shape: VisioStencilShape): VisioBasicOutline {
	return OUTLINES[shape];
}

/** Every outline the core can create as a local shape: Basic Shapes plus the stencil masters. */
export type VisioOutlineShape = VisioBasicShape | VisioStencilShape;
export const isVisioOutlineShape = (value: unknown): value is VisioOutlineShape =>
	isVisioBasicShape(value) || isVisioStencilShape(value);
export function visioOutlineShape(shape: VisioOutlineShape): VisioBasicOutline {
	return isVisioBasicShape(shape) ? visioBasicShapeOutline(shape) : OUTLINES[shape];
}
