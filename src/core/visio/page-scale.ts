import type { VisioMatrix, VisioShape } from './model';
import { number, type Cells, type Report } from './sheet';
import { VisioPackageError } from './package';

/** Cached drawing distances to physical page inches. Line weights, character
 * sizes, text margins and paragraph lengths remain physical page measurements.
 */
export function visioPageGeometryScale(cells: Cells, report: Report): number {
	const drawing = number(cells, 'DrawingScale', 1, report);
	const page = number(cells, 'PageScale', 1, report);
	const ratio = page / drawing;
	if (drawing <= 0 || page <= 0 || !Number.isFinite(ratio) || ratio <= 0) {
		report(
			'invalid-page-drawing-scale',
			'Invalid cached page/drawing scale; unscaled geometry is shown.',
		);
		return 1;
	}
	return ratio;
}

const tokens = /[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?|[a-zA-Z]/g;
/** Scale internally compiled absolute SVG geometry, preserving arc angles/flags. */
export function scaleVisioGeometryPath(path: string, ratio: number): string {
	let command = '',
		index = 0;
	return path.replace(tokens, (token) => {
		if (/^[a-zA-Z]$/.test(token)) {
			command = token;
			index = 0;
			return token;
		}
		const position = index++ % 7;
		if (command === 'A' && position >= 2 && position <= 4) return token;
		return String(distance(Number(token), ratio));
	});
}
function distance(value: number, ratio: number): number {
	const result = value * ratio;
	if (!Number.isFinite(result))
		throw new VisioPackageError(
			'INVALID_PAGE_SCALE',
			'Scaled geometry exceeds finite coordinates.',
		);
	return result;
}
function matrix(value: VisioMatrix, ratio: number): VisioMatrix {
	return [
		value[0],
		value[1],
		value[2],
		value[3],
		distance(value[4], ratio),
		distance(value[5], ratio),
	];
}

/** Normalize parser-owned drawing geometry once, after master/style resolution.
 * Physical text/line metrics and embedded image/vector payloads are preserved.
 */
export function normalizeVisioPageGeometry(
	shapes: VisioShape[],
	ratio: number,
	check: () => void,
): void {
	if (ratio === 1) return;
	const pending = [...shapes];
	while (pending.length) {
		check();
		const shape = pending.pop()!;
		shape.width = distance(shape.width, ratio);
		shape.height = distance(shape.height, ratio);
		shape.transform = matrix(shape.transform, ratio);
		if (shape.rotation)
			shape.rotation = {
				...shape.rotation,
				pinX: distance(shape.rotation.pinX, ratio),
				pinY: distance(shape.rotation.pinY, ratio),
			};
		for (const geometry of shape.geometry) {
			check();
			geometry.path = scaleVisioGeometryPath(geometry.path, ratio);
		}
		for (const gradient of [shape.style.fillGradient, shape.style.lineGradient]) {
			if (gradient?.type === 'linear' && gradient.boundingBoxAngle === undefined) {
				gradient.start = [distance(gradient.start[0], ratio), distance(gradient.start[1], ratio)];
				gradient.end = [distance(gradient.end[0], ratio), distance(gradient.end[1], ratio)];
			}
			if (gradient?.type === 'radial' && gradient.coordinateSpace === 'local') {
				gradient.center = [
					distance(gradient.center[0], ratio),
					distance(gradient.center[1], ratio),
				];
				gradient.radius = distance(gradient.radius, ratio);
			}
		}
		for (const point of [
			...(shape.connectionPoints ?? []),
			...(shape.lineEnds ? [shape.lineEnds.begin, shape.lineEnds.end] : []),
		]) {
			point.x = distance(point.x, ratio);
			point.y = distance(point.y, ratio);
		}
		shape.text.width = distance(shape.text.width, ratio);
		shape.text.height = distance(shape.text.height, ratio);
		shape.text.transform = matrix(shape.text.transform, ratio);
		if (shape.foreignVector) {
			const placed = shape.foreignVector;
			for (const key of ['x', 'y', 'width', 'height'] as const)
				placed[key] = distance(placed[key], ratio);
		}
		if (shape.image) {
			// The raster payload is shared, but placements must not alter another instance.
			shape.image = { ...shape.image };
			for (const key of ['x', 'y', 'width', 'height'] as const) {
				const value = shape.image[key];
				if (value !== undefined) shape.image[key] = distance(value, ratio);
			}
		}
		pending.push(...shape.children);
	}
	check();
}
