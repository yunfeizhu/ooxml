import { afterEach, expect, it } from 'vitest';
import JSZip from 'jszip';
import {
	visioFormatTargetShape,
	visioMoveCommands,
	visioResizeDrag,
	visioResizeShape,
	visioSizePositionCommand,
	visioStencilSubShape,
	visioStyleFormattingShape,
} from 'ooxml-core/visio/ui';
import { cell, fixture, rectangle, shape } from '../../../core/visio/test-fixtures';
import { setupFormattingViewer as setup } from './__fixtures__/formatting-viewer';

afterEach(() => document.body.replaceChildren());

const PAGE = 'visio/pages/page1.xml';
const MASTER = 'visio/masters/master1.xml';
const follow = (x: number, width: number) =>
	cell('PinX', 2 * x, `Sheet.5!Width*${x}`) +
	cell('PinY', 0.5, 'Sheet.5!Height*0.5') +
	cell('Width', 2 * width, `Sheet.5!Width*${width}`) +
	cell('Height', 1, 'Sheet.5!Height*1') +
	cell('LocPinX', width, 'Width*0.5') +
	cell('LocPinY', 0.5, 'Height*0.5');
/** A stencil group: two halves that follow the group's size, the right one with text. */
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
					'5',
					cell('PinX', 2) +
						cell('PinY', 2) +
						cell('Width', 2) +
						cell('Height', 1) +
						cell('LocPinX', 1, 'Width*0.5') +
						cell('LocPinY', 0.5, 'Height*0.5') +
						cell('Angle', 0) +
						`<Shapes>${shape('6', follow(0.25, 0.5) + rectangle)}${shape('7', follow(0.75, 0.5) + rectangle + '<Text>Right\n</Text>')}</Shapes>`,
					'Type="Group"',
				),
			},
		],
		pages: [
			{
				id: '0',
				contents: `<Shapes>${shape('1', cell('PinX', 3) + cell('PinY', 5) + `<Shapes>${shape('2', '', 'MasterShape="6"')}${shape('3', '', 'MasterShape="7"')}</Shapes>`, 'Type="Group" Master="2" Name="Pair"')}</Shapes>`,
			},
		],
	});

it('resizes, moves and formats a stencil group, and formats one of its parts alone', async () => {
	const ui = await setup();
	const bytes = await stencil();
	await ui.controller.load(bytes);
	const page = () => ui.controller.state.document!.pages[0]!;
	const group = () => page().shapes[0]!;
	expect(group().masterId).toBe('2');
	expect(group().children.map((child) => child.width)).toEqual([1, 1]);
	ui.controller.selectShape({ id: '1', name: 'Pair', pageId: '0' });
	// The group takes handles, Size & Position, dragging, rotation and the ribbon's formatting.
	expect(visioResizeShape(page(), '1')).toBeDefined();
	expect(ui.button('rotate-left').disabled).toBe(false);
	const fill = () =>
		ui.root.querySelector<HTMLElement & { disabled: boolean }>('[data-menu="fill"]')!;
	expect(fill().disabled).toBe(false);
	const drag = visioResizeDrag(page(), '1', 'ne', { x: 0, y: 0 }, { x: 2, y: 0 })!;
	await ui.controller.applyEdits([drag.command]);
	expect(group().width).toBeCloseTo(4);
	// The halves followed the group through the master's formulas.
	expect(group().children.map((child) => child.width)).toEqual([2, 2]);
	await ui.controller.applyEdits(visioSizePositionCommand(page(), '1', 'height', 2)!);
	expect(group().children.map((child) => child.height)).toEqual([2, 2]);
	await ui.controller.applyEdits(visioMoveCommands(page(), ['1'], { x: 1, y: 0 })!);
	ui.pickColor('fill', '#ff0000');
	await ui.done();
	// Formatting the group reaches every part, as Visio's ribbon does.
	expect(group().children.map((child) => child.style.fill)).toEqual(['#ff0000', '#ff0000']);
	// Sub-selection: one part takes fill, line and text formatting; its place belongs to the group.
	expect(visioStencilSubShape(page(), '3')?.id).toBe('3');
	expect(visioFormatTargetShape(page(), '3')?.id).toBe('3');
	expect(visioStyleFormattingShape(page(), '3')).toBeUndefined();
	expect(visioResizeShape(page(), '3')).toBeUndefined();
	ui.controller.selectShape({ id: '3', name: '', pageId: '0' });
	expect(fill().disabled).toBe(false);
	expect(ui.button('bold').disabled).toBe(false);
	ui.pickColor('fill', '#ffff00');
	await ui.done();
	ui.press('bold');
	await ui.done();
	expect(group().children.map((child) => child.style.fill)).toEqual(['#ff0000', '#ffff00']);
	expect(group().children[1]!.text.runs[0]).toMatchObject({ bold: true });
	// The master is untouched; the page holds local values and refreshed inherited caches.
	const saved = await JSZip.loadAsync(ui.controller.exportVsdx().bytes);
	expect(await saved.file(MASTER)!.async('string')).toBe(
		await (await JSZip.loadAsync(bytes)).file(MASTER)!.async('string'),
	);
	const xml = await saved.file(PAGE)!.async('string');
	expect(xml).toContain('<Cell N="Width" V="4" U="IN"/>');
	expect(xml).toContain('<Cell N="Width" V="2" U="IN" F="Inh"/>');
	ui.dispose();
	ui.controller.destroy();
});
