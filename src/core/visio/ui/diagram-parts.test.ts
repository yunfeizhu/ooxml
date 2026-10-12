import { expect, it } from 'vitest';
import { parseVsdx } from '../parser';
import { editVsdx } from '../edit';
import { createVsdx } from '../create-document';
import {
	visioCalloutCommand,
	visioContainerCommand,
	visioWithCalloutLeaders,
	visioWithContainerMembers,
} from './diagram-parts';
import { visioMoveTargets } from './shape-move';

async function drawn() {
	const blank = await createVsdx();
	const pageId = (await parseVsdx(blank)).pages[0]!.id;
	const saved = await editVsdx(blank, [
		{ type: 'create-rectangle', pageId, shapeId: '1', x: 1, y: 1, width: 1, height: 1 },
		{ type: 'create-ellipse', pageId, shapeId: '2', x: 3, y: 1, width: 1, height: 1 },
		{ type: 'create-line', pageId, shapeId: '3', beginX: 0, beginY: 0, endX: 1, endY: 1 },
	]);
	return { pageId, bytes: saved.bytes, page: (await parseVsdx(saved.bytes)).pages[0]! };
}

it('plans containers around top-level shapes in page order, or empty at the centre', async () => {
	const { page, pageId, bytes } = await drawn();
	expect(visioContainerCommand(page, ['2', '1'], 'plain')).toEqual({
		type: 'insert-container',
		pageId,
		shapeId: '4',
		memberIds: ['1', '2'],
		style: 'plain',
		heading: 'Container',
	});
	expect(visioContainerCommand(page, [], 'classic')!.box).toEqual({
		x: page.width / 2,
		y: page.height / 2,
		width: 3,
		height: 2,
	});
	for (const ids of [['9'], ['1', '1']])
		expect(visioContainerCommand(page, ids, 'classic')).toBeUndefined();
	const framed = await editVsdx(bytes, [visioContainerCommand(page, ['1', '2', '3'], 'classic')!]);
	const after = (await parseVsdx(framed.bytes)).pages[0]!;
	expect(visioWithContainerMembers(after, ['4'])).toEqual(['4', '1', '2', '3']);
	// The line member is not a movable 2D shape, so it stays put (it is not glued either).
	expect(visioMoveTargets(after, ['4'])).toEqual(['4', '1', '2']);
	expect(visioWithContainerMembers(after, ['1'])).toEqual(['1']);
});

it('plans a callout beside one 2D target, kept on the page', async () => {
	const { page, pageId, bytes } = await drawn();
	const command = visioCalloutCommand(page, ['2'], 'oval', 'Hi')!;
	expect(command).toMatchObject({
		type: 'insert-callout',
		pageId,
		shapeId: '4',
		leaderId: '5',
		targetId: '2',
		style: 'oval',
		text: 'Hi',
		box: { width: 1.5, height: 0.6 },
	});
	expect(command.box.x).toBeCloseTo(3.5 + 0.5 + 0.75, 9);
	for (const ids of [[], ['1', '2'], ['3'], ['9']])
		expect(visioCalloutCommand(page, ids, 'rectangle')).toBeUndefined();
	const saved = await editVsdx(bytes, [command]);
	const after = (await parseVsdx(saved.bytes)).pages[0]!;
	expect(visioWithCalloutLeaders(after, ['4', '1'])).toEqual(['4', '1', '5']);
	expect(visioWithCalloutLeaders(after, ['2'])).toEqual(['2']);
});
