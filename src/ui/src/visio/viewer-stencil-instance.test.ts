import { afterEach, expect, it } from 'vitest';
import JSZip from 'jszip';
import {
	visioMoveCommands,
	visioResizeDrag,
	visioResizeShape,
	visioSizePositionCommand,
	visioSizePositionState,
} from 'ooxml-core/visio/ui';
import { cell, fixture, rectangle, shape } from '../../../core/visio/test-fixtures';
import { setupFormattingViewer as setup } from './__fixtures__/formatting-viewer';

afterEach(() => document.body.replaceChildren());

const PAGE = 'visio/pages/page1.xml';
const MASTER = 'visio/masters/master1.xml';
/** A stencil master whose pin and text block follow its size, and an instance on its layer. */
const stencil = () =>
	fixture({
		document:
			'<FaceNames><FaceName ID="0" Name="Arial"/></FaceNames><StyleSheets><StyleSheet ID="0">' +
			['LockMoveX', 'LockMoveY', 'LockWidth', 'LockHeight', 'LockAspect', 'LockDelete']
				.map((name) => cell(name, 0))
				.join('') +
			'</StyleSheet></StyleSheets>',
		masters: [
			{
				id: '2',
				shapes: shape(
					'6',
					cell('PinX', 2) +
						cell('PinY', 2) +
						cell('Width', 2) +
						cell('Height', 1) +
						cell('LocPinX', 1, 'Width*0.5') +
						cell('LocPinY', 0.5, 'Height*0.5') +
						cell('Angle', 0) +
						cell('TxtWidth', 2, 'Width*1') +
						cell('TxtHeight', 1, 'Height*1') +
						cell('TxtPinX', 1, 'Width*0.5') +
						cell('TxtPinY', 0.5, 'Height*0.5') +
						cell('TxtLocPinX', 1, 'TxtWidth*0.5') +
						cell('TxtLocPinY', 0.5, 'TxtHeight*0.5') +
						cell('LayerMember', '0') +
						rectangle,
					'Type="Shape"',
				),
			},
		],
		pages: [
			{
				id: '0',
				contents: `<Shapes>${shape('1', cell('PinX', 3) + cell('PinY', 5) + cell('LayerMember', '0') + '<Text>Process\n</Text>', 'Type="Shape" Master="2" Name="Process"')}</Shapes>`,
				pageCells:
					'<Section N="Layer"><Row IX="0">' +
					cell('Name', 'Flowchart') +
					cell('Lock', 0) +
					'</Row></Section>',
			},
		],
	});

it('formats, rotates, moves and resizes a stencil shape, saving local values over its master', async () => {
	const ui = await setup();
	const bytes = await stencil();
	await ui.controller.load(bytes);
	const page = () => ui.controller.state.document!.pages[0]!;
	expect(ui.shape().masterId).toBe('2');
	expect(ui.shape().layerIds).toEqual(['0']);
	ui.controller.selectShape({ id: '1', name: 'Process', pageId: '0' });
	// The ribbon offers formatting and rotation, with no "local shape" refusal.
	for (const id of ['bold', 'rotate-left']) expect(ui.button(id).disabled).toBe(false);
	expect(
		ui.root.querySelector<HTMLElement & { disabled: boolean }>('[data-menu="fill"]')!.disabled,
	).toBe(false);
	ui.press('bold');
	await ui.done();
	ui.pickColor('fill', '#ff0000');
	await ui.done();
	expect(ui.shape().text.runs[0]).toMatchObject({ bold: true });
	expect(ui.shape().style.fill).toBe('#ff0000');
	ui.press('rotate-left');
	await ui.done();
	expect(ui.shape().rotation!.angle).toBeCloseTo(Math.PI / 2);
	// Resize handles, Size & Position and dragging take the shape too.
	expect(visioResizeShape(page(), '1')).toBeDefined();
	expect(visioSizePositionState(page(), '1')).toMatchObject({ width: 2, height: 1 });
	const drag = visioResizeDrag(page(), '1', 'ne', { x: 0, y: 0 }, { x: 0, y: -1 })!;
	await ui.controller.applyEdits([drag.command]);
	expect(ui.shape().width).toBeCloseTo(3);
	await ui.controller.applyEdits(visioSizePositionCommand(page(), '1', 'height', 2)!);
	expect(ui.shape().height).toBe(2);
	await ui.controller.applyEdits(visioMoveCommands(page(), ['1'], { x: 1, y: 0 })!);
	expect(ui.shape().rotation!.pinX).toBeCloseTo(4);
	// The master is untouched and the shape is still its instance.
	const saved = await JSZip.loadAsync(ui.controller.exportVsdx().bytes);
	expect(await saved.file(MASTER)!.async('string')).toBe(
		await (await JSZip.loadAsync(bytes)).file(MASTER)!.async('string'),
	);
	const xml = await saved.file(PAGE)!.async('string');
	expect(xml).toContain('Master="2"');
	expect(xml).toContain('<Cell N="Width" V="3" U="IN"/>');
	expect(xml).toContain('<Cell N="LocPinX" V="1.5" U="IN" F="Inh"/>');
	// Every step is one undo.
	for (let step = 0; step < 6; ++step) await ui.controller.undo();
	expect(ui.controller.exportVsdx().bytes).toEqual(bytes);
	ui.dispose();
	ui.controller.destroy();
});

it('leaves a stencil shape on a locked layer alone', async () => {
	const ui = await setup();
	const zip = await JSZip.loadAsync(await stencil());
	const pages = 'visio/pages/pages.xml';
	zip.file(
		pages,
		(await zip.file(pages)!.async('string')).replace('N="Lock" V="0"', 'N="Lock" V="1"'),
	);
	await ui.controller.load(await zip.generateAsync({ type: 'uint8array' }));
	ui.controller.selectShape({ id: '1', name: 'Process', pageId: '0' });
	for (const id of ['bold', 'rotate-left']) expect(ui.button(id).disabled).toBe(true);
	expect(
		ui.root.querySelector<HTMLElement & { disabled: boolean }>('[data-menu="fill"]')!.disabled,
	).toBe(true);
	expect(ui.button('bold').title).toMatch(/locked layer/);
	expect(visioResizeShape(ui.controller.state.document!.pages[0]!, '1')).toBeUndefined();
	ui.dispose();
	ui.controller.destroy();
});
