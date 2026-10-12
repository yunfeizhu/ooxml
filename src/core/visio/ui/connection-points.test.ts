import { expect, it } from 'vitest';
import { editVsdx } from '../edit';
import { parseVsdx } from '../parser';
import { fixture } from '../test-fixtures';
import {
	visioAddConnectionPointCommand,
	visioConnectorEndHandles,
	visioConnectorRouteOf,
	visioNearestConnectionPoint,
	visioSceneToLocal,
} from './connection-points';
import { visioConnectorCreationCommand } from './draw-plan';
import { visioConnectorMovePreviews, visioConnectorPreviewPath } from './connector-preview';

async function scene() {
	const blank = await fixture({ pages: [{ id: '0', contents: '' }] });
	const shapes = await editVsdx(blank, [
		{ type: 'create-rectangle', pageId: '0', shapeId: '1', x: 2, y: 2, width: 1, height: 1 },
		{ type: 'create-rectangle', pageId: '0', shapeId: '2', x: 5, y: 4, width: 2, height: 1 },
		{ type: 'add-connection-point', pageId: '0', shapeId: '2', x: 0, y: 0.5 },
	]);
	const connected = await editVsdx(shapes.bytes, [
		{
			type: 'create-line',
			pageId: '0',
			shapeId: '3',
			beginX: 0,
			beginY: 0,
			endX: 1,
			endY: 1,
			connect: { begin: '1', end: '2', endPoint: 0 },
			route: 'right-angle',
		},
	]);
	return (await parseVsdx(connected.bytes)).pages[0]!;
}

it('finds connection points, adds new ones and exposes routed connector ends', async () => {
	const page = await scene();
	const [one, two, connector] = page.shapes;
	expect(visioNearestConnectionPoint(page, { x: 4.05, y: 4 }, 0.1)).toMatchObject({
		shapeId: '2',
		index: 0,
		x: 4,
		y: 4,
	});
	expect(visioNearestConnectionPoint(page, { x: 4.5, y: 4 }, 0.1)).toBeUndefined();
	expect(visioSceneToLocal(two!, { x: 6, y: 4.5 })).toEqual({ x: 2, y: 1 });
	expect(visioAddConnectionPointCommand(page, one!, { x: 2.25, y: 1.5 })).toEqual({
		type: 'add-connection-point',
		pageId: '0',
		shapeId: '1',
		x: 0.75,
		y: 0,
	});
	expect(visioAddConnectionPointCommand(page, one!, { x: 3, y: 2 })).toBeUndefined();
	expect(visioAddConnectionPointCommand(page, connector!, { x: 3, y: 2 })).toBeUndefined();
	expect(visioConnectorRouteOf(connector!)).toBe('right-angle');
	expect(visioConnectorRouteOf(one!)).toBeUndefined();
	const ends = visioConnectorEndHandles(connector!)!;
	expect(ends.begin).toEqual({ x: 0, y: 0 });
	expect(ends.end).toEqual({ x: 1.5, y: 2 });
});

it('previews glued connectors re-routed around a dragged shape', async () => {
	const page = await scene();
	expect(visioConnectorMovePreviews(page, new Set(['3']), { x: 1, y: 0 })).toEqual([]);
	const [preview] = visioConnectorMovePreviews(page, new Set(['2']), { x: 0, y: 2 });
	expect(preview!.connectorId).toBe('3');
	// The end follows connection point 0 of shape 2 (now at 4, 6), drawn with y down.
	expect(preview!.points.at(-1)).toEqual({ x: 4, y: page.height - 6 });
	expect(
		preview!.points
			.slice(1)
			.every((p, i) => p.x === preview!.points[i]!.x || p.y === preview!.points[i]!.y),
	).toBe(true);
	expect(visioConnectorPreviewPath(preview!)).toMatch(/^M [\d.]+ [\d.]+ L /);
});

it('passes connection points and the route through connector creation', async () => {
	const page = await scene();
	const command = visioConnectorCreationCommand(
		page,
		{ x: 1, y: 1 },
		{ x: 2, y: 2 },
		{ begin: '1', beginPoint: 2, end: '1', endPoint: 0 },
		'curved',
	);
	expect(command.connect).toEqual({ begin: '1', beginPoint: 2 });
	expect(command.route).toBe('curved');
});
