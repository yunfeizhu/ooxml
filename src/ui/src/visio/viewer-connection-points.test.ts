import { afterEach, expect, it, vi } from 'vitest';
import { pointerViewer } from './__fixtures__/pointer-viewer';
import { ViewerConnectionPoints } from './viewer-connection-points';
import { ViewerConnectorTool } from './viewer-connector-tool';

afterEach(() => {
	document.body.replaceChildren();
	vi.unstubAllGlobals();
});

async function pointsViewer() {
	const ui = await pointerViewer();
	ui.inactive();
	let tool: 'points' | 'connector' | 'none' = 'points';
	const announce = vi.fn();
	const points = new ViewerConnectionPoints(ui.viewport, ui.controller, {
		active: () => tool === 'points',
		showing: () => tool === 'connector',
		announce,
	});
	const connector = new ViewerConnectorTool(ui.viewport, ui.controller, {
		active: () => tool === 'connector',
		announce,
		route: () => 'right-angle',
	});
	const disposePoints = points.wire();
	const disposeConnector = connector.wire();
	return {
		...ui,
		points,
		connector,
		announce,
		use(next: typeof tool) {
			tool = next;
			points.render(ui.controller.state);
		},
		markers: () => [...ui.viewport.querySelectorAll<SVGPathElement>('[data-connection-point]')],
		close() {
			disposePoints();
			disposeConnector();
			ui.dispose();
		},
	};
}

it('adds, selects and deletes connection points with the Connection Point tool', async () => {
	const ui = await pointsViewer();
	try {
		ui.pointer('pointerdown', ui.group('1'), 40, 40);
		await ui.done();
		expect(ui.edits[0]).toEqual([
			{ type: 'add-connection-point', pageId: '1', shapeId: '1', x: 0.5, y: 0.5 },
		]);
		ui.points.render(ui.controller.state);
		expect(ui.markers().map((marker) => marker.dataset.pointShape)).toEqual(['1']);
		expect(ui.announce).toHaveBeenCalledWith('Connection point added to Import test.');
		// A click on a marker selects that point instead of adding another.
		ui.pointer('pointerdown', ui.svg, 41, 39);
		expect(ui.points.selected).toEqual({ pageId: '1', shapeId: '1', index: 0 });
		expect(ui.markers()[0]!.dataset.selected).toBe('true');
		expect(ui.points.deleteSelected()).toBe(true);
		await ui.done();
		expect(ui.edits[1]).toEqual([
			{ type: 'delete-connection-point', pageId: '1', shapeId: '1', index: 0 },
		]);
		ui.points.render(ui.controller.state);
		expect(ui.markers()).toHaveLength(0);
		await ui.controller.undo();
		ui.points.render(ui.controller.state);
		expect(ui.markers()).toHaveLength(1);
		// View > Connection Points hides markers unless a connection tool is running.
		ui.use('none');
		ui.points.toggle();
		expect(ui.points.visible).toBe(false);
		expect(ui.markers()).toHaveLength(0);
		ui.use('connector');
		expect(ui.markers()).toHaveLength(1);
		expect(ui.points.deleteSelected()).toBe(false);
	} finally {
		ui.close();
	}
});

it('glues a connector end to the connection point under it', async () => {
	const ui = await pointsViewer();
	try {
		await ui.controller.applyEdits([
			{ type: 'add-connection-point', pageId: '1', shapeId: '1', x: 0.5, y: 0.5 },
		]);
		ui.use('connector');
		ui.pointer('pointerdown', ui.group('2'), 70, 40);
		ui.pointer('pointermove', ui.svg, 41, 41);
		expect(ui.connector.target).toBe('1');
		expect(ui.connector.targetPoint).toBe(0);
		expect(ui.viewport.querySelector('.connect-point-target')).not.toBeNull();
		ui.pointer('pointerup', ui.svg, 41, 41);
		await ui.done();
		expect(ui.edits.at(-1)![0]).toMatchObject({
			type: 'create-line',
			connect: { begin: '2', end: '1', endPoint: 0 },
			route: 'right-angle',
		});
		const page = ui.controller.state.document!.pages[0]!;
		expect(page.connectors.map((row) => [row.toShapeId, row.toCell])).toEqual([
			['2', 'PinX'],
			['1', 'Connections.X1'],
		]);
		expect(page.shapes.at(-1)!.connectorRoute).toBe('right-angle');
		expect(ui.viewport.querySelector('.connect-point-target')).toBeNull();
	} finally {
		ui.close();
	}
});

it('refuses connection points on shapes the core cannot edit', async () => {
	const ui = await pointsViewer();
	try {
		const page = ui.controller.state.document!.pages[0]!;
		page.shapes[1] = { ...page.shapes[1]!, masterId: '4' };
		ui.pointer('pointerdown', ui.group('2'), 70, 40);
		expect(ui.edits).toHaveLength(0);
		expect(ui.announce).toHaveBeenCalledWith(expect.stringMatching(/master instances/));
	} finally {
		ui.close();
	}
});
