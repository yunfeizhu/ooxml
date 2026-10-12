import { afterEach, expect, it } from 'vitest';
import { visioMoveCommands, visioWithCalloutLeaders } from 'ooxml-core/visio/ui';
import type { OfficeUiGallery } from '../ribbon/gallery';
import { setupFormattingViewer } from './__fixtures__/formatting-viewer';
import { createContextMenus } from './viewer-context-menu';

afterEach(() => document.body.replaceChildren());

const setup = async (source = true) => {
	const view = await setupFormattingViewer(source);
	view.root.append(...createContextMenus(document));
	view.commands.render(view.controller.state);
	if (source)
		await view.controller.applyEdits([
			{ type: 'create-rectangle', pageId: '1', shapeId: '2', x: 2, y: 2, width: 1, height: 1 },
			{ type: 'create-ellipse', pageId: '1', shapeId: '3', x: 4, y: 3, width: 2, height: 1 },
		]);
	return view;
};
type View = Awaited<ReturnType<typeof setup>>;
const select = (view: View, ids: string[]) =>
	view.controller.selectShapes(ids.map((id) => ({ id, name: '', pageId: '1' })));
const gallery = (view: View, part: 'container' | 'callout') =>
	view.root.querySelector<OfficeUiGallery>(`office-ui-gallery[command="${part}"]`)!;
const pick = (view: View, part: 'container' | 'callout', style: string) => {
	gallery(view, part).querySelector<HTMLButtonElement>('.trigger')!.click();
	gallery(view, part).querySelector<HTMLButtonElement>(`[data-gallery-item="${style}"]`)!.click();
};
const page = (view: View) => view.controller.state.document!.pages[0]!;

it('offers container and callout galleries that follow the selection', async () => {
	const readOnly = await setup(false);
	expect(gallery(readOnly, 'container').getAttribute('title')).toMatch(/Open a \.vsdx file/);
	readOnly.dispose();
	readOnly.controller.destroy();
	const view = await setup();
	const container = gallery(view, 'container');
	expect(container.state!.sections[0]!.items.map((item) => item.label)).toEqual([
		'Classic',
		'Plain',
		'Banner',
		'Dashed',
	]);
	// Nothing selected: an empty container is allowed; a callout needs a target.
	expect(container.hasAttribute('disabled')).toBe(false);
	expect(gallery(view, 'callout').getAttribute('title')).toMatch(/Select one two-dimensional/);
	select(view, ['2', '3']);
	expect(container.hasAttribute('disabled')).toBe(false);
	expect(gallery(view, 'callout').hasAttribute('disabled')).toBe(true);
	expect(view.button('ctx-container').disabled).toBe(false);
	select(view, ['3']);
	expect(gallery(view, 'callout').hasAttribute('disabled')).toBe(false);
	view.dispose();
	view.controller.destroy();
});

it('wraps the selection in a container behind it, moves it with its members, one undo', async () => {
	const view = await setup();
	select(view, ['3', '2']);
	pick(view, 'container', 'banner');
	await view.done();
	expect(view.edits.at(-1)).toEqual([
		{
			type: 'insert-container',
			pageId: '1',
			shapeId: '4',
			memberIds: ['2', '3'],
			style: 'banner',
			heading: 'Container',
		},
	]);
	expect(page(view).shapes.map((shape) => shape.id)).toEqual(['1', '4', '2', '3']);
	expect(page(view).shapes[1]!.structure).toEqual({ type: 'container', memberIds: ['2', '3'] });
	expect(view.controller.state.selectedShapes.map((shape) => shape.id)).toEqual(['4']);
	expect(view.feedback).toContain('Inserted a Banner container.');

	// Moving the container moves its members in the same transaction.
	const moves = visioMoveCommands(page(view), ['4'], { x: 1, y: 0 })!;
	expect(moves.map((edit) => (edit as { shapeId: string }).shapeId)).toEqual(['4', '2', '3']);
	const before = page(view).shapes.map((shape) => shape.transform[4]);
	await view.controller.applySelectionEdits(moves);
	expect(page(view).shapes.map((shape) => shape.transform[4])).toEqual([
		before[0],
		before[1]! + 1,
		before[2]! + 1,
		before[3]! + 1,
	]);
	await view.controller.undo();
	await view.controller.undo();
	expect(page(view).shapes.map((shape) => shape.id)).toEqual(['1', '2', '3']);

	// The shape menu's Container uses the classic style.
	select(view, ['2']);
	view.commands.run({ type: 'diagram-part', part: 'container', style: 'classic' });
	await view.done();
	expect(page(view).shapes.map((shape) => shape.id)).toEqual(['1', '4', '2', '3']);
	// Deleting the container keeps its members.
	view.viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
	await view.done();
	expect(page(view).shapes.map((shape) => shape.id)).toEqual(['1', '2', '3']);
	view.dispose();
	view.controller.destroy();
});

it('adds a callout with a glued leader and deletes them together', async () => {
	const view = await setup();
	select(view, ['2']);
	pick(view, 'callout', 'rounded');
	await view.done();
	const [command] = view.edits.at(-1)!;
	expect(command).toMatchObject({
		type: 'insert-callout',
		shapeId: '4',
		leaderId: '5',
		targetId: '2',
		style: 'rounded',
	});
	expect(page(view).shapes.map((shape) => shape.id)).toEqual(['1', '2', '3', '4', '5']);
	expect(page(view).shapes[3]!.structure).toEqual({
		type: 'callout',
		targetId: '2',
		leaderId: '5',
	});
	expect(page(view).connectors.map((item) => [item.fromShapeId, item.toShapeId])).toEqual([
		['5', '4'],
		['5', '2'],
	]);
	expect(view.controller.state.selectedShapes.map((shape) => shape.id)).toEqual(['4']);
	expect(visioWithCalloutLeaders(page(view), ['4'])).toEqual(['4', '5']);
	view.viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
	await view.done();
	expect(page(view).shapes.map((shape) => shape.id)).toEqual(['1', '2', '3']);
	await view.controller.undo();
	expect(page(view).shapes).toHaveLength(5);
	await view.controller.undo();
	expect(page(view).shapes).toHaveLength(3);
	view.dispose();
	view.controller.destroy();
});
