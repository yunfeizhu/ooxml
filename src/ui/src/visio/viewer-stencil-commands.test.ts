import { afterEach, expect, it } from 'vitest';
import JSZip from 'jszip';
import {
	cell,
	fixture,
	rectangle,
	relation,
	relations,
	shape,
} from '../../../core/visio/test-fixtures';
import type { OfficeUiGallery } from '../ribbon/gallery';
import { setupFormattingViewer as setup } from './__fixtures__/formatting-viewer';

afterEach(() => document.body.replaceChildren());

const PAGE = 'visio/pages/page1.xml';
const master = (width: number) =>
	shape(
		'6',
		cell('PinX', 2) +
			cell('PinY', 2) +
			cell('Width', width) +
			cell('Height', 1) +
			cell('LocPinX', width / 2, 'Width*0.5') +
			cell('LocPinY', 0.5, 'Height*0.5') +
			cell('Angle', 0) +
			cell('LayerMember', '0') +
			rectangle,
		'Type="Shape"',
	);
const instance = (id: string, y: number) =>
	shape(
		id,
		cell('PinX', 3) + cell('PinY', y) + cell('LayerMember', '0') + `<Text>Step ${id}</Text>`,
		'Type="Shape" Master="2" Name="Process"',
	);
/** Three instances of one master, a second master in the document stencil, one layer. */
const drawing = () =>
	fixture({
		document:
			'<FaceNames><FaceName ID="0" Name="Arial"/></FaceNames><StyleSheets><StyleSheet ID="0">' +
			['LockMoveX', 'LockMoveY', 'LockWidth', 'LockHeight', 'LockAspect', 'LockDelete']
				.map((name) => cell(name, 0))
				.join('') +
			'</StyleSheet></StyleSheets>',
		masters: [
			{ id: '2', shapes: master(2), attributes: 'NameU="Process" Name="Process"' },
			{ id: '4', shapes: master(3), attributes: 'NameU="Wide" Name="Wide"' },
		],
		pages: [
			{
				id: '0',
				contents: `<Shapes>${instance('1', 7)}${instance('2', 5)}${instance('3', 3)}</Shapes>`,
				pageCells:
					'<Section N="Layer"><Row IX="0">' +
					cell('Name', 'Flowchart') +
					cell('Lock', 0) +
					'</Row></Section>',
			},
		],
		edit: (zip) =>
			zip.file(
				'visio/pages/_rels/page1.xml.rels',
				relations(relation('rId1', 'master', '../masters/master1.xml')),
			),
	});
const order = (ui: Awaited<ReturnType<typeof setup>>) =>
	ui.controller.state.document!.pages[0]!.shapes.map(
		(item) => `${item.id}:${item.masterId ?? '-'}`,
	);

it('duplicates, reorders, groups and deletes stencil shapes as instances of their master', async () => {
	const ui = await setup();
	const bytes = await drawing();
	await ui.controller.load(bytes);
	const select = (...ids: string[]) =>
		ui.controller.selectShapes(ids.map((id) => ({ id, name: 'Process', pageId: '0' })));
	select('2');
	// No "local shape" refusals: the commands are offered for a stencil shape.
	for (const id of ['bring-to-front', 'send-to-back']) expect(ui.button(id).disabled).toBe(false);
	select('1');
	await ui.controller.duplicateSelection();
	expect(order(ui)).toEqual(['1:2', '2:2', '3:2', '4:2']);
	// The copy is selected, as after Visio's Duplicate.
	expect(ui.controller.state.selectedShapes.map((item) => item.id)).toEqual(['4']);
	select('1');
	ui.press('bring-to-front');
	await ui.done();
	expect(order(ui)).toEqual(['2:2', '3:2', '4:2', '1:2']);
	select('2', '3');
	await ui.controller.groupSelection('group');
	expect(order(ui)).toEqual(['5:-', '4:2', '1:2']);
	const group = ui.controller.state.document!.pages[0]!.shapes[0]!;
	expect(group.children.map((item) => item.masterId)).toEqual(['2', '2']);
	select('5');
	await ui.controller.groupSelection('ungroup');
	expect(order(ui)).toEqual(['2:2', '3:2', '4:2', '1:2']);
	select('4');
	ui.commands.run({ type: 'delete' });
	await ui.done();
	expect(order(ui)).toEqual(['2:2', '3:2', '1:2']);
	const saved = await JSZip.loadAsync(ui.controller.exportVsdx().bytes);
	// Still instances, and the master is where it was.
	expect((await saved.file(PAGE)!.async('string')).match(/Master="2"/g)).toHaveLength(3);
	expect(await saved.file('visio/masters/master1.xml')!.async('string')).toBe(
		await (await JSZip.loadAsync(bytes)).file('visio/masters/master1.xml')!.async('string'),
	);
	// Each command is one undo step.
	for (let step = 0; step < 5; ++step) await ui.controller.undo();
	expect(ui.controller.exportVsdx().bytes).toEqual(bytes);
	ui.dispose();
	ui.controller.destroy();
});

it('offers Change Shape the other masters of the Document Stencil and replaces the master', async () => {
	const ui = await setup();
	await ui.controller.load(await drawing());
	const gallery = ui.root.querySelector<OfficeUiGallery>(
		'office-ui-gallery[command="change-shape"]',
	)!;
	// Nothing selected: the outlines, disabled.
	expect(gallery.state!.sections[0]!.title).toBe('Basic Shapes');
	ui.controller.selectShape({ id: '1', name: 'Process', pageId: '0' });
	expect(gallery.hasAttribute('disabled')).toBe(false);
	// The drawing's other masters first, then the built-in shapes (their master is copied in).
	expect(gallery.state!.sections.map((section) => section.title)).toEqual([
		'Document Stencil',
		'Basic Shapes',
	]);
	expect(gallery.state!.sections[0]!.items.map((item) => [item.id, item.label])).toEqual([
		['document:4', 'Wide'],
	]);
	// The tile is the master, drawn.
	expect(gallery.state!.sections[0]!.items[0]!.preview).toContain('<svg');
	gallery.dispatchEvent(
		new CustomEvent('office-gallery-pick', { detail: { itemId: 'document:4' }, bubbles: true }),
	);
	await ui.done();
	const shape = ui.controller.state.document!.pages[0]!.shapes[0]!;
	expect(shape.masterId).toBe('4');
	// It keeps its place and text and takes the new master's size.
	expect([shape.width, shape.rotation!.pinX, shape.rotation!.pinY]).toEqual([3, 3, 7]);
	expect(shape.text.plainText.trim()).toBe('Step 1');
	expect(ui.feedback.at(-1)).toBe('Changed the shape to Wide.');
	// Now the first master is the one it can change to.
	expect(gallery.state!.sections[0]!.items.map((item) => item.id)).toEqual(['document:2']);
	const saved = await JSZip.loadAsync(ui.controller.exportVsdx().bytes);
	expect(await saved.file('visio/pages/_rels/page1.xml.rels')!.async('string')).toContain(
		'master2.xml',
	);
	await ui.controller.undo();
	expect(ui.controller.state.document!.pages[0]!.shapes[0]!.masterId).toBe('2');
	ui.dispose();
	ui.controller.destroy();
});
