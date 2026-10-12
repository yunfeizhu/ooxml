/** Resolved chart gradients, shared by Office chart painters. */
import type { DrawingColor, DrawingFill } from '../drawingml/types';
import { sortGradientStops } from './gradient-stop-edit';
import { sigmaGradientStops } from '../color/sigma-gradient-stops';
import { spreadCoincidentStops } from './gradient-coincident-stops';
import { rectGradientFocus, type RectGradientDirection } from '../drawingml/gradient-geometry';
import {
	buildRectPathGradientSvg,
	type RectPathGradientFillToRect,
} from '../drawingml/rect-path-gradient';

/** Named direction previews must update both resolved focus and preserved rectangle geometry. */
export function withChartGradientDirection(
	fill: ChartGradientFill,
	direction: RectGradientDirection,
): ChartGradientFill {
	const focus = rectGradientFocus(direction);
	return { ...fill, type: 'radial', fillToRect: focus, focalPoint: { x: focus.l, y: focus.t } };
}
export interface ChartGradientFill {
	type: 'linear' | 'radial';
	stops: Array<{ color: string; position: number; opacity?: number }>;
	angle?: number;
	scaled?: boolean;
	interpolation?: 'sigma-gamma22';
	focalPoint?: { x: number; y: number };
	path?: string;
	fillToRect?: RectPathGradientFillToRect;
}
export interface ChartSvgGradientStop {
	offset: number;
	color: string;
	opacity?: number;
}
/** Actual paint bounds; shape paths need the outline of the painted object. */
export interface ChartGradientBounds {
	width: number;
	height: number;
	shape?: 'rect';
}
export type ChartSvgGradientDef =
	| { kind: 'rectPath'; id: string; href: string; stops: ChartSvgGradientStop[] }
	| {
			kind: 'linearGradient';
			id: string;
			/** Absent means `objectBoundingBox`; strokes use user space (a flat line has no height). */
			gradientUnits?: 'userSpaceOnUse';
			x1: number;
			y1: number;
			x2: number;
			y2: number;
			stops: ChartSvgGradientStop[];
	  }
	| {
			kind: 'radialGradient';
			id: string;
			cx: number;
			cy: number;
			r: number;
			gradientTransform?: string;
			stops: ChartSvgGradientStop[];
	  };

/** Resolve imported DrawingML gradient stops once for every Office chart painter. */
export function resolveChartGradient(
	fill: Extract<DrawingFill, { kind: 'gradient' }>,
	resolve: (color: DrawingColor) => { hex: string; alpha: number } | undefined,
): ChartGradientFill {
	const focus = fill.fillToRect;
	const stops = fill.stops.flatMap((stop) => {
		const color = resolve(stop.color);
		return color ? [{ position: stop.position, color: color.hex, opacity: color.alpha }] : [];
	});
	return {
		type: fill.path ? 'radial' : 'linear',
		stops,
		...(fill.angle === undefined ? {} : { angle: fill.angle }),
		...(fill.scaled === undefined ? {} : { scaled: fill.scaled }),
		...(fill.path === undefined ? {} : { path: fill.path }),
		...(focus === undefined ? {} : { fillToRect: { ...focus } }),
		// Native opaque endpoint-pair linear, rect, circle and rectangular-shape profiles.
		...(((!fill.path && fill.scaled === true) ||
			['rect', 'circle', 'shape'].includes(fill.path ?? '')) &&
		fill.stops.length === 2 &&
		stops.length === 2 &&
		stops.every((stop) => stop.opacity === 1) &&
		stops.some((stop) => stop.position === 0) &&
		stops.some((stop) => stop.position === 100)
			? { interpolation: 'sigma-gamma22' as const }
			: {}),
		...(focus
			? { focalPoint: { x: (1 + focus.l - focus.r) / 2, y: (1 + focus.t - focus.b) / 2 } }
			: {}),
	};
}

/** Extracted from PowerPoint's COM-verified chart gradient painter. */
export function buildChartGradientDef(
	id: string,
	fill: ChartGradientFill,
	bounds?: ChartGradientBounds,
): ChartSvgGradientDef {
	const sourceStops = sortGradientStops(fill.stops).map((stop) => ({
		offset: Math.min(Math.max(stop.position / 100, 0), 1),
		color: stop.color,
		...(stop.opacity !== undefined ? { opacity: stop.opacity } : {}),
	}));
	const stops =
		fill.interpolation === 'sigma-gamma22'
			? (sigmaGradientStops(sourceStops) ?? sourceStops)
			: sourceStops;
	if (
		fill.type === 'radial' &&
		(fill.path === 'rect' || (fill.path === 'shape' && bounds?.shape === 'rect'))
	) {
		const markup = buildRectPathGradientSvg(
			stops.map((stop) => ({
				position: stop.offset * 100,
				color: stop.color,
				...(stop.opacity === undefined ? {} : { opacity: stop.opacity }),
			})),
			undefined,
			fill.fillToRect,
			{ bands: 1024, independentOpacity: true },
		);
		return {
			kind: 'rectPath',
			id,
			href: `data:image/svg+xml,${encodeURIComponent(markup)}`,
			stops,
		};
	}
	if (fill.type === 'radial') {
		const cx = fill.focalPoint?.x ?? 0.5;
		const cy = fill.focalPoint?.y ?? 0.5;
		// DrawingML circle paths stay circular in physical bounds, including wide charts.
		const aspect =
			fill.path === 'circle' &&
			bounds &&
			Number.isFinite(bounds.width) &&
			Number.isFinite(bounds.height) &&
			bounds.width > 0 &&
			bounds.height > 0
				? bounds.height / bounds.width
				: 1;
		return {
			kind: 'radialGradient',
			id,
			cx,
			cy,
			r: Math.max(
				...[0, 1].flatMap((x) => [0, 1].map((y) => Math.hypot(x - cx, (y - cy) * aspect))),
			),
			...(aspect === 1
				? {}
				: { gradientTransform: `matrix(1 0 0 ${1 / aspect} 0 ${cy * (1 - 1 / aspect)})` }),
			stops,
		};
	}
	const rad = ((fill.angle ?? 0) * Math.PI) / 180;
	const span = fill.scaled ? Math.abs(Math.cos(rad)) + Math.abs(Math.sin(rad)) : 1;
	const dx = (Math.cos(rad) * span) / 2;
	const dy = (Math.sin(rad) * span) / 2;
	const round = (value: number) => Math.round(value * 10000) / 10000;
	return {
		kind: 'linearGradient',
		id,
		x1: round(0.5 - dx),
		y1: round(0.5 - dy),
		x2: round(0.5 + dx),
		y2: round(0.5 + dy),
		stops: spreadCoincidentStops(stops),
	};
}
