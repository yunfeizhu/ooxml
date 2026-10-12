import { expect, it } from 'vitest';
import type { VisioMaster, VisioPage, VisioShape } from '../model';
import { demoDocument } from './demo-document';
import {
	visioChangeMasterCommand,
	visioChangeMasterTargets,
	visioChangeShapeCommand,
	visioChangeShapeRefusal,
} from './shape-change';

function page(change: Partial<VisioShape> = {}): VisioPage {
	const template = demoDocument.pages[0]!.shapes[0]!;
	const shape = { ...structuredClone(template), id: '7', kind: 'shape' as const, ...change };
	delete shape.masterId;
	Object.assign(shape, change);
	return { ...structuredClone(demoDocument.pages[0]!), shapes: [shape], connectors: [] };
}
const one = [{ id: '7' }];

it('admits one local 2D shape and builds the command', () => {
	expect(visioChangeShapeRefusal(page(), one)).toBeUndefined();
	expect(visioChangeShapeCommand(page(), one, 'star')).toEqual({
		type: 'change-shape',
		pageId: demoDocument.pages[0]!.id,
		shapeId: '7',
		shape: 'star',
	});
});

it.each([
	['nothing selected', page(), [], /exactly one/],
	['two shapes', page(), [{ id: '7' }, { id: '8' }], /exactly one/],
	['a nested shape', page(), [{ id: '99' }], /inside groups/],
	['a group', page({ kind: 'group' }), one, /Groups/],
	['a line', page({ kind: 'connector' }), one, /1D shapes/],
	['a picture', page({ kind: 'foreign' }), one, /Pictures/],
])('refuses %s', (_name, scene, selection, reason) => {
	expect(visioChangeShapeRefusal(scene, selection)).toMatch(reason);
	expect(visioChangeShapeCommand(scene, selection, 'circle')).toBeUndefined();
});

it('admits a stencil shape, which changes by its master, unless a connection point is glued', () => {
	const scene = page({ masterId: '3' });
	expect(visioChangeShapeRefusal(scene, one)).toBeUndefined();
	// Whole-shape glue stays: the shape keeps its size.
	scene.connectors = [{ fromShapeId: '9', toShapeId: '7', fromCell: 'BeginX', toCell: 'PinX' }];
	expect(visioChangeShapeCommand(scene, one, 'star')).toMatchObject({ shape: 'star' });
	scene.connectors[0]!.toCell = 'Connections.X1';
	expect(visioChangeShapeRefusal(scene, one)).toMatch(/connection points/);
});

it('refuses glued shapes', () => {
	const scene = page();
	scene.connectors = [{ fromShapeId: '9', toShapeId: '7', fromCell: 'BeginX', toCell: 'PinX' }];
	expect(visioChangeShapeRefusal(scene, one)).toMatch(/Glued/);
});

it('offers a stencil shape the other plain 2D masters of the drawing', () => {
	const leaf = structuredClone(demoDocument.pages[0]!.shapes[0]!);
	const master = (id: string, change: Partial<VisioMaster> = {}): VisioMaster => ({
		id,
		name: `Master ${id}`,
		width: 1,
		height: 1,
		rootCount: 1,
		oneDimensional: false,
		shapes: [{ ...structuredClone(leaf), children: [] }],
		...change,
	});
	const masters = [
		master('3'),
		master('4'),
		master('5', { oneDimensional: true }),
		master('6', { rootCount: 2 }),
		master('7', { shapes: [{ ...structuredClone(leaf), children: [structuredClone(leaf)] }] }),
	];
	const scene = page({ masterId: '3' });
	// Its own master, connectors, multi-shape masters and group masters are left out.
	expect(visioChangeMasterTargets({ masters }, scene, one).masters.map((item) => item.id)).toEqual([
		'4',
	]);
	expect(visioChangeMasterCommand({ masters }, scene, one, '4')).toEqual({
		type: 'change-shape',
		pageId: scene.id,
		shapeId: '7',
		masterId: '4',
	});
	for (const id of ['3', '5', '9'])
		expect(visioChangeMasterCommand({ masters }, scene, one, id)).toBeUndefined();
	// A connector glued to the shape stays glued; a shape glued to another cannot change.
	scene.connectors = [{ fromShapeId: '9', toShapeId: '7', fromCell: 'BeginX', toCell: 'PinX' }];
	expect(visioChangeMasterTargets({ masters }, scene, one).masters).toHaveLength(1);
	scene.connectors = [{ fromShapeId: '7', toShapeId: '9', fromCell: 'BeginX', toCell: 'PinX' }];
	expect(visioChangeMasterTargets({ masters }, scene, one).reason).toMatch(/glued to another/);
	// Nothing to change to, a shape drawn here, and a stencil group.
	expect(
		visioChangeMasterTargets({ masters: [master('3')] }, page({ masterId: '3' }), one).reason,
	).toMatch(/no other shape/);
	expect(visioChangeMasterTargets({ masters }, page(), one)).toEqual({ masters: [] });
	expect(
		visioChangeMasterTargets({ masters }, page({ masterId: '3', kind: 'group' }), one).reason,
	).toMatch(/one plain shape/);
});
