import { fail } from './package-common';

/**
 * How a connector is drawn between its ends, as Design > Connectors offers it: right-angle (Visio's
 * default dynamic connector), straight, or curved (one cubic).
 */
export type VisioConnectorRoute = 'right-angle' | 'straight' | 'curved';
export const VISIO_CONNECTOR_ROUTES: readonly VisioConnectorRoute[] = [
	'right-angle',
	'straight',
	'curved',
];

/**
 * Glue targets of a connector's ends. A missing end stays unglued. With a point index the end is
 * glued to that Connection row of the shape (point-to-point glue); without it, to the shape itself
 * (dynamic glue that walks to the nearest side).
 */
export interface VisioConnectorGlue {
	begin?: string;
	end?: string;
	/** Zero-based Connection row (IX) of the begin shape. */
	beginPoint?: number;
	/** Zero-based Connection row (IX) of the end shape. */
	endPoint?: number;
}
interface Target {
	pageId: string;
	shapeId: string;
}
/** Add a connection point to a local 2D shape at fractions of its Width and Height. */
export type VisioAddConnectionPointEdit = Target & {
	type: 'add-connection-point';
	x: number;
	y: number;
};
/** Delete one Connection row (zero-based IX) of a local 2D shape. */
export type VisioDeleteConnectionPointEdit = Target & {
	type: 'delete-connection-point';
	index: number;
};
/** Glue one end of an existing connector to a shape, or to one of its connection points. */
export type VisioGlueConnectorEdit = Target & {
	type: 'glue-connector';
	endpoint: 'begin' | 'end';
	target: string;
	point?: number;
};
/** Change how a connector is routed (Design > Connectors). */
export type VisioConnectorRouteEdit = Target & {
	type: 'set-connector-route';
	route: VisioConnectorRoute;
};
export type VisioConnectorEdit =
	| VisioAddConnectionPointEdit
	| VisioDeleteConnectionPointEdit
	| VisioGlueConnectorEdit
	| VisioConnectorRouteEdit;

export const isVisioConnectorEdit = (edit: { type: string }): edit is VisioConnectorEdit =>
	edit.type === 'add-connection-point' ||
	edit.type === 'delete-connection-point' ||
	edit.type === 'glue-connector' ||
	edit.type === 'set-connector-route';

const sheetId = (value: unknown): string => {
	if (typeof value !== 'string' || !/^[1-9]\d{0,9}$/.test(value) || Number(value) > 0xffffffff)
		fail('INVALID_EDIT', 'Connector shape IDs require canonical positive unsigned integers.');
	return value;
};
const rowIndex = (value: unknown): number => {
	if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 9999)
		fail('INVALID_EDIT', 'Connection point indexes are zero-based integers below 10000.');
	return value as number;
};
export const snapshotConnectorRoute = (value: unknown): VisioConnectorRoute => {
	if (!VISIO_CONNECTOR_ROUTES.includes(value as VisioConnectorRoute))
		fail('INVALID_EDIT', 'Connector routes are right-angle, straight or curved.');
	return value as VisioConnectorRoute;
};

/** Copy connector glue: distinct canonical shape IDs other than the connector, optional points. */
export function snapshotConnectorGlue(
	value: unknown,
	connectorId: string,
): VisioConnectorGlue | undefined {
	if (value === undefined) return undefined;
	if (!value || typeof value !== 'object') fail('INVALID_EDIT', 'Invalid connector glue.');
	const source = value as Record<string, unknown>;
	const result: VisioConnectorGlue = {};
	for (const end of ['begin', 'end'] as const) {
		const id = source[end];
		const point = source[`${end}Point`];
		if (id === undefined) {
			if (point !== undefined) fail('INVALID_EDIT', 'A glue point needs its shape.');
			continue;
		}
		if (sheetId(id) === connectorId)
			fail('INVALID_EDIT', 'Connector glue targets must be other canonical shape IDs.');
		result[end] = id as string;
		if (point !== undefined) result[`${end}Point`] = rowIndex(point);
	}
	if (result.begin !== undefined && result.begin === result.end)
		fail('INVALID_EDIT', 'A connector cannot glue both ends to the same shape.');
	return result;
}

/** Copy and validate a connector or connection-point command; source admission stays in core. */
export function snapshotConnectorEdit(edit: VisioConnectorEdit): VisioConnectorEdit {
	if (typeof edit.pageId !== 'string' || !edit.pageId || edit.pageId.length > 256)
		fail('INVALID_EDIT', 'Invalid edit target.');
	const target = { pageId: edit.pageId, shapeId: sheetId(edit.shapeId) };
	switch (edit.type) {
		case 'add-connection-point': {
			const fraction = (value: unknown) => {
				if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1)
					fail('INVALID_EDIT', 'Connection points lie within the shape (fractions 0 to 1).');
				return value;
			};
			return { ...target, type: edit.type, x: fraction(edit.x), y: fraction(edit.y) };
		}
		case 'delete-connection-point':
			return { ...target, type: edit.type, index: rowIndex(edit.index) };
		case 'glue-connector': {
			if (edit.endpoint !== 'begin' && edit.endpoint !== 'end')
				fail('INVALID_EDIT', 'A connector end must be begin or end.');
			const end = edit.endpoint === 'begin' ? 'begin' : 'end';
			const glue = snapshotConnectorGlue(
				{
					[end]: edit.target,
					...(edit.point === undefined ? {} : { [`${end}Point`]: edit.point }),
				},
				target.shapeId,
			)!;
			const point = glue[`${end}Point`];
			return {
				...target,
				type: edit.type,
				endpoint: end,
				target: glue[end]!,
				...(point === undefined ? {} : { point }),
			};
		}
		case 'set-connector-route':
			return { ...target, type: edit.type, route: snapshotConnectorRoute(edit.route) };
		default:
			return fail('INVALID_EDIT', 'Unsupported connector command.');
	}
}
