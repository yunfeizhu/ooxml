import { afterEach, expect, it } from 'vitest';
import { parseVsdx } from 'ooxml-core/visio';
import JSZip from 'jszip';
import { renderText } from './render-text';
import { wrapText } from './text-layout';
import { setupFormattingViewer as setup } from './__fixtures__/formatting-viewer';

afterEach(() => document.body.replaceChildren());

it('formats every rich row through real controls while preserving text markers and unrelated styles', async () => {
	const ui = await setup(true, true);
	const zip = await JSZip.loadAsync(ui.bytes);
	const path = 'visio/pages/page1.xml';
	const originalXml = (await zip.file(path)!.async('string')).replace(
		'<Cell N="Style" V="1"/>',
		'<Cell N="Style" V="3"/><Cell N="Letterspace" V="0.04"/>',
	);
	zip.file(path, originalXml);
	const bytes = await zip.generateAsync({ type: 'uint8array' });
	await ui.controller.load(bytes);
	ui.selection();
	expect(ui.button('bold').disabled).toBe(false);
	expect(ui.button('bold').getAttribute('pressed')).toBe('false');
	expect(ui.button('italic').getAttribute('pressed')).toBe('false');
	ui.press('bold');
	await ui.done();
	expect(ui.shape().text.runs.map((run) => [run.bold, run.italic])).toEqual([
		[true, false],
		[true, true],
	]);
	expect(ui.button('bold').getAttribute('pressed')).toBe('true');
	ui.pickColor('font', '#ff0000');
	await ui.done();
	expect(ui.shape().text.runs.every((run) => run.color === '#ff0000')).toBe(true);
	const savedXml = await (
		await JSZip.loadAsync(ui.controller.exportVsdx().bytes)
	)
		.file(path)!
		.async('string');
	expect(savedXml.match(/<Text>[\s\S]*?<\/Text>/u)![0]).toBe(
		originalXml.match(/<Text>[\s\S]*?<\/Text>/u)![0],
	);
	expect(savedXml).toContain('<Cell N="Letterspace" V="0.04"/>');
	ui.press('bold');
	await ui.done();
	expect(ui.shape().text.runs.map((run) => [run.bold, run.italic])).toEqual([
		[false, false],
		[false, true],
	]);
	await ui.controller.undo();
	expect(ui.shape().text.runs.every((run) => run.bold)).toBe(true);
	await ui.controller.undo();
	await ui.controller.undo();
	expect(ui.controller.exportVsdx().bytes).toEqual(bytes);
	ui.dispose();
	ui.controller.destroy();
});

it('guards size steps on mixed-size runs while the absolute size picker remains available', async () => {
	const ui = await setup(true, true);
	const zip = await JSZip.loadAsync(ui.bytes);
	const path = 'visio/pages/page1.xml';
	zip.file(
		path,
		(await zip.file(path)!.async('string'))
			.replace(
				'<Cell N="Style" V="0"/>',
				'<Cell N="Style" V="0"/><Cell N="Size" V="0.16666666666666666"/>',
			)
			.replace(
				'<Cell N="Style" V="1"/>',
				'<Cell N="Style" V="1"/><Cell N="Size" V="0.3333333333333333"/>',
			),
	);
	const bytes = await zip.generateAsync({ type: 'uint8array' });
	await ui.controller.load(bytes);
	ui.selection();
	expect(ui.shape().text.runs.map((run) => run.fontSize * 72)).toEqual([12, 24]);
	expect(ui.combo('font-size').disabled).toBe(false);
	expect(ui.combo('font-size').value).toBe('');
	expect(ui.button('grow-font').disabled).toBe(true);
	expect(ui.button('shrink-font').disabled).toBe(true);
	ui.commands.run({ type: 'font-step', direction: 1 });
	ui.commands.run({ type: 'font-step', direction: -1 });
	expect(ui.edits).toEqual([]);
	expect(ui.controller.exportVsdx().bytes).toEqual(bytes);
	ui.select('font-size', '24');
	await ui.done();
	expect(ui.shape().text.runs.every((run) => run.fontSize * 72 === 24)).toBe(true);
	expect(ui.button('grow-font').disabled).toBe(false);
	ui.press('grow-font');
	await ui.done();
	expect(ui.shape().text.runs.every((run) => Math.abs(run.fontSize * 72 - 28) < 0.001)).toBe(true);
	ui.dispose();
	ui.controller.destroy();
});

it('applies font color, strike, bullets, indent and justify through the ribbon and source bytes', async () => {
	const ui = await setup();
	ui.selection();
	ui.pickColor('font', '#ff0000');
	await ui.done();
	expect(ui.shape().text.color).toBe('#ff0000');
	expect(ui.grid('font').value).toBe('#ff0000');
	ui.press('font-color');
	await ui.done();
	expect(ui.shape().text.color).toBe('#ff0000');
	ui.press('strikethrough');
	await ui.done();
	ui.press('underline');
	await ui.done();
	expect(ui.shape().text.runs[0]).toMatchObject({ strikethrough: true, underline: true });
	expect(ui.button('strikethrough').getAttribute('pressed')).toBe('true');
	const svg = renderText(ui.shape().text, new Set());
	expect(svg.querySelector('tspan tspan')!.getAttribute('text-decoration')).toBe(
		'underline line-through',
	);
	expect(ui.button('indent-decrease').disabled).toBe(true);
	ui.press('indent-increase');
	await ui.done();
	expect(ui.shape().text.paragraphs![0]!.indentLeft * 72).toBeCloseTo(18);
	expect(ui.button('indent-decrease').disabled).toBe(false);
	ui.press('bullets');
	await ui.done();
	expect(ui.shape().text.paragraphs![0]!.bullet).toBeDefined();
	expect(ui.button('bullets').getAttribute('pressed')).toBe('true');
	ui.press('justify');
	await ui.done();
	expect(ui.shape().text.horizontalAlign).toBe('justify');
	expect(ui.button('justify').getAttribute('pressed')).toBe('true');
	const saved = (await parseVsdx(ui.controller.exportVsdx().bytes)).pages[0]!.shapes[0]!;
	expect(saved.text.runs[0]).toMatchObject({
		strikethrough: true,
		underline: true,
		color: '#ff0000',
	});
	expect(saved.text.paragraphs![0]).toMatchObject({ horizontalAlign: 'justify', indentLeft: 0.25 });
	ui.press('bullets');
	await ui.done();
	expect(ui.shape().text.paragraphs![0]!.bullet).toBeUndefined();
	ui.press('indent-decrease');
	await ui.done();
	expect(ui.shape().text.paragraphs![0]!.indentLeft).toBe(0);
	ui.dispose();
	ui.controller.destroy();
});

it('sets mixed-selection toggles together and preserves all selected targets through undo', async () => {
	const ui = await setup();
	await ui.controller.applyEdits([
		{
			type: 'create-rectangle',
			pageId: '1',
			shapeId: '2',
			x: 1,
			y: 1,
			width: 2,
			height: 1,
			text: 'Second shape',
		},
		{ type: 'format-text', pageId: '1', shapeId: '1', bold: true, fontSize: 24 },
	]);
	ui.controller.selectShapes([
		{ id: '1', name: 'First', pageId: '1' },
		{ id: '2', name: 'Second', pageId: '1' },
	]);
	expect(ui.button('bold').getAttribute('pressed')).toBe('false');
	expect(ui.combo('font-size').value).toBe('');
	expect(ui.button('bring-to-front').disabled).toBe(true);
	ui.press('bold');
	await ui.done();
	expect(ui.edits.at(-1)).toEqual([
		{ type: 'format-text', pageId: '1', shapeId: '1', bold: true },
		{ type: 'format-text', pageId: '1', shapeId: '2', bold: true },
	]);
	expect(
		ui.controller.state.document!.pages[0]!.shapes.every((shape) => shape.text.runs[0]?.bold),
	).toBe(true);
	expect(ui.controller.state.selectedShapes.map((shape) => shape.id)).toEqual(['1', '2']);
	ui.press('undo');
	await ui.done();
	expect(
		ui.controller.state.document!.pages[0]!.shapes.map((shape) => shape.text.runs[0]?.bold),
	).toEqual([true, false]);
	ui.press('redo');
	await ui.done();
	ui.press('bold');
	await ui.done();
	expect(
		ui.controller.state.document!.pages[0]!.shapes.every((shape) => !shape.text.runs[0]?.bold),
	).toBe(true);
	ui.pickColor('fill', '#0070c0');
	await ui.done();
	expect(ui.edits.at(-1)).toHaveLength(2);
	expect(
		ui.controller.state.document!.pages[0]!.shapes.every((shape) => shape.style.fill === '#0070c0'),
	).toBe(true);
	expect(ui.grid('fill').value).toBe('#0070c0');
	ui.dispose();
	ui.controller.destroy();
});

it('refuses the whole incompatible selection instead of editing its primary shape', async () => {
	const ui = await setup();
	await ui.controller.applyEdits([
		{
			type: 'create-rectangle',
			pageId: '1',
			shapeId: '2',
			x: 1,
			y: 1,
			width: 2,
			height: 1,
			text: 'Second',
		},
	]);
	ui.shape().layerIds = ['unsupported-layer'];
	ui.controller.selectShapes([
		{ id: '1', name: 'First', pageId: '1' },
		{ id: '2', name: 'Second', pageId: '1' },
	]);
	expect(ui.button('strikethrough').disabled).toBe(true);
	expect(
		ui.root.querySelector<HTMLElement & { disabled: boolean }>('[data-menu="fill"]')!.disabled,
	).toBe(true);
	const count = ui.edits.length;
	ui.commands.run({ type: 'text-toggle', property: 'strikethrough' });
	expect(ui.edits).toHaveLength(count);
	ui.dispose();
	ui.controller.destroy();
});

it('retains neighboring strike styles when wrapping and merging text runs', () => {
	const run = {
		text: 'a',
		fontFamily: 'Arial',
		fontSize: 0.2,
		color: '#000000',
		bold: false,
		italic: false,
		underline: false,
	};
	const lines = wrapText(
		[run, { ...run, text: 'b', strikethrough: true }],
		5,
		(text) => text.length * 0.1,
	);
	expect(lines[0]!.runs).toHaveLength(2);
	expect(lines[0]!.runs[1]!.strikethrough).toBe(true);
});

it('preserves the complete source when a later target refuses an atomic formatting batch', async () => {
	const ui = await setup();
	await ui.controller.applyEdits([
		{
			type: 'create-rectangle',
			pageId: '1',
			shapeId: '2',
			x: 1,
			y: 1,
			width: 2,
			height: 1,
			text: 'Locked shape',
		},
	]);
	const zip = await JSZip.loadAsync(ui.controller.exportVsdx().bytes);
	const xml = await zip.file('visio/pages/page1.xml')!.async('string');
	zip.file(
		'visio/pages/page1.xml',
		xml.replace(/<Shape\b[^>]*\bID="2"[^>]*>/u, '$&<Cell N="LockFormat" V="1"/>'),
	);
	const bytes = await zip.generateAsync({ type: 'uint8array' });
	await ui.controller.load(bytes);
	ui.controller.selectShapes([
		{ id: '1', name: 'First', pageId: '1' },
		{ id: '2', name: 'Locked', pageId: '1' },
	]);
	expect(ui.button('font-color').disabled).toBe(false);
	ui.pickColor('font', '#ff0000');
	await ui.done();
	expect(ui.controller.state.edit.error).toBeDefined();
	expect(ui.controller.exportVsdx().bytes).toEqual(bytes);
	expect(ui.controller.state.edit.canUndo).toBe(false);
	expect(ui.controller.state.selectedShapes).toHaveLength(2);
	ui.dispose();
	ui.controller.destroy();
});

it('rotates the text block a quarter turn at a time, as Rotate Text in Visio', async () => {
	const ui = await setup();
	expect(ui.button('rotate-text').disabled).toBe(true);
	ui.selection();
	expect(ui.button('rotate-text').disabled).toBe(false);
	const angle = () => {
		const t = ui.shape().text.transform;
		return Math.round((Math.atan2(t[1], t[0]) * 180) / Math.PI);
	};
	const size = { width: ui.shape().text.width, height: ui.shape().text.height };
	expect(angle()).toBe(0);
	const turns: number[] = [];
	for (let turn = 0; turn < 4; ++turn) {
		ui.press('rotate-text');
		await ui.done();
		turns.push(angle());
		// Recorded from Visio: TxtAngle gains 90 deg; TxtWidth, TxtHeight and the pin stay.
		expect(ui.shape().text.width).toBeCloseTo(size.width);
		expect(ui.shape().text.height).toBeCloseTo(size.height);
	}
	expect(turns.map((value) => (value + 360) % 360)).toEqual([90, 180, 270, 0]);
	ui.dispose();
	ui.controller.destroy();
});
