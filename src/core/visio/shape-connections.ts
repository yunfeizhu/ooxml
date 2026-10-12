import type { VisioConnectionPoint, VisioMatrix, VisioShape } from './model';
import { number, sectionRows, type Report, type Sheet } from './sheet';

const MAX_POINTS = 1024;

/** Connection points, local line ends, connector route and placement of a normalized shape sheet. */
export function shapeConnections(
	sheet: Sheet,
	local: Sheet,
	inheritedSheet: boolean,
	transform: VisioMatrix,
	oneD: boolean,
	report: Report,
): Pick<VisioShape, 'connectionPoints' | 'lineEnds' | 'connectorRoute' | 'placeable'> {
	const own = new Set(sectionRows(local, 'Connection').map((row) => row.index));
	const points: VisioConnectionPoint[] = [];
	for (const row of sectionRows(sheet, 'Connection')) {
		const index = Number(row.index);
		const x = number(row.cells, 'X', NaN),
			y = number(row.cells, 'Y', NaN);
		if (!Number.isSafeInteger(index) || index < 0 || !Number.isFinite(x) || !Number.isFinite(y))
			continue;
		if (points.length >= MAX_POINTS) {
			report('connection-point-limit', 'Connection points beyond the display limit were omitted.');
			break;
		}
		points.push({ index, x, y, inherited: inheritedSheet && !own.has(row.index) });
	}
	const result: Pick<VisioShape, 'connectionPoints' | 'lineEnds' | 'connectorRoute' | 'placeable'> =
		{};
	if (points.length) result.connectionPoints = points.sort((a, b) => a.index - b.index);
	if (oneD && sheet.cells.has('BeginX') && sheet.cells.has('EndX')) {
		const [a, b, c, d, e, f] = transform;
		const determinant = a * d - b * c;
		if (Math.abs(determinant) > 1e-12) {
			const local = (x: number, y: number) => ({
				x: (d * (x - e) - c * (y - f)) / determinant,
				y: (a * (y - f) - b * (x - e)) / determinant,
			});
			result.lineEnds = {
				begin: local(number(sheet.cells, 'BeginX', 0), number(sheet.cells, 'BeginY', 0)),
				end: local(number(sheet.cells, 'EndX', 0), number(sheet.cells, 'EndY', 0)),
			};
		}
	}
	if (!oneD && number(sheet.cells, 'ObjType', 0) === 1) result.placeable = true;
	if (sheet.cells.has('ShapeRouteStyle') || sheet.cells.has('ConLineRouteExt'))
		result.connectorRoute =
			number(sheet.cells, 'ConLineRouteExt', 0) === 2
				? 'curved'
				: number(sheet.cells, 'ShapeRouteStyle', 0) === 16
					? 'straight'
					: 'right-angle';
	return result;
}
