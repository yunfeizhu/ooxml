import { describe, expect, it } from 'vitest';
import { editVsdx, type VisioEdit } from '../edit';
import { parseVsdx } from '../parser';
import { cell, fixture } from '../test-fixtures';
import {
	visioLayerAssignCommand,
	visioLayerAssignCommands,
	visioLayerAssignState,
	visioNewLayerNames,
} from './layer-assign';
import { visioPageMasters, visioSelectByType, visioShapeSelectType } from './select-by-type';
import { visioMoveCommands } from './shape-move';
import { visioResizeShape } from './shape-resize';

const layer = (index: number, name: string, lock = 0) =>
	`<Row IX="${index}">${cell('Name', name)}${cell('Lock', lock)}</Row>`;
async function page() {
	const blank = await fixture({
		pages: [
			{
				id: '0',
				contents: '',
				pageCells: `<Section N="Layer">${layer(0, 'Flow')}${layer(1, 'Locked', 1)}</Section>`,
			},
		],
	});
	const edits: VisioEdit[] = [
		{ type: 'create-rectangle', pageId: '0', shapeId: '1', x: 1, y: 1, width: 1, height: 1 },
		{ type: 'create-rectangle', pageId: '0', shapeId: '2', x: 3, y: 1, width: 1, height: 1 },
		{
			type: 'create-text-box',
			pageId: '0',
			shapeId: '3',
			x: 5,
			y: 1,
			width: 1,
			height: 1,
			text: 'Note',
		},
		{ type: 'create-line', pageId: '0', shapeId: '4', beginX: 1, beginY: 3, endX: 4, endY: 3 },
	];
	const created = await editVsdx(blank, edits);
	const assigned = await editVsdx(created.bytes, [
		{ type: 'assign-layers', pageId: '0', shapeIds: ['1'], layerIds: ['0'] },
	]);
	return (await parseVsdx(assigned.bytes)).pages[0]!;
}

describe('Assign to Layer scene helpers', () => {
	it('reports tri-state membership and builds one command', async () => {
		const scene = await page();
		const state = visioLayerAssignState(scene, ['1', '2']);
		expect(state.ok && state.rows.map((row) => [row.layer.name, row.state])).toEqual([
			['Flow', 'some'],
			['Locked', 'none'],
		]);
		expect(visioLayerAssignCommand(scene, ['1', '2'], ['0'], ['New'])).toEqual({
			type: 'assign-layers',
			pageId: '0',
			shapeIds: ['1', '2'],
			layerIds: ['0'],
			newLayers: ['New'],
		});
		expect(visioLayerAssignCommand(scene, ['1'], ['1'])).toBeUndefined();
		expect(visioLayerAssignCommand(scene, [], ['0'])).toBeUndefined();
	});
	it('keeps mixed memberships per shape and adds new layers once', async () => {
		const scene = await page();
		expect(visioLayerAssignCommands(scene, ['1', '2'], [], ['0'], ['Added'])).toEqual([
			{
				type: 'assign-layers',
				pageId: '0',
				shapeIds: ['1'],
				layerIds: ['0'],
				newLayers: ['Added'],
			},
			{ type: 'assign-layers', pageId: '0', shapeIds: ['2'], layerIds: ['2'] },
		]);
		expect(visioLayerAssignCommands(scene, ['1', '2'], ['1'])).toBeUndefined();
	});
	it('validates new layer names against the page', async () => {
		const scene = await page();
		expect(visioNewLayerNames(scene, ' Review , Draft ,')).toEqual(['Review', 'Draft']);
		expect(visioNewLayerNames(scene, 'flow')).toMatch(/already exists/);
		expect(visioNewLayerNames(scene, 'a;b')).toMatch(/not a valid layer name/);
	});
	it('keeps layered shapes movable but not resizable', async () => {
		const scene = await page();
		expect(visioMoveCommands(scene, ['1', '2'], { x: 1, y: 0 })).toHaveLength(2);
		expect(visioResizeShape(scene, '1')).toBeUndefined();
		const locked = { ...scene, layers: scene.layers!.map((entry) => ({ ...entry, locked: true })) };
		expect(visioMoveCommands(locked, ['1'], { x: 1, y: 0 })).toBeUndefined();
	});
});

describe('Select by Type', () => {
	it('classifies and selects shapes by type, layer and master', async () => {
		const scene = await page();
		expect(scene.shapes.map((shape) => visioShapeSelectType(scene, shape))).toEqual([
			'shape',
			'shape',
			'text',
			'connector',
		]);
		const ids = (query: Parameters<typeof visioSelectByType>[1]) =>
			visioSelectByType(scene, query).map((shape) => shape.id);
		expect(ids({ by: 'type', types: ['shape'] })).toEqual(['1', '2']);
		expect(ids({ by: 'type', types: ['text', 'connector'] })).toEqual(['3', '4']);
		expect(ids({ by: 'layer', layerIds: ['0'] })).toEqual(['1']);
		expect(ids({ by: 'layer', layerIds: [''] })).toEqual(['2', '3', '4']);
		expect(ids({ by: 'master', masterIds: [''] })).toEqual(['1', '2', '3', '4']);
		expect(visioPageMasters(scene)).toEqual([]);
		expect(visioSelectByType(scene, { by: 'type', types: ['shape'] })[0]).toEqual({
			id: '1',
			name: scene.shapes[0]!.name,
			pageId: '0',
		});
	});
});
