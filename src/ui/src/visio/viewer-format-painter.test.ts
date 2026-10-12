// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { setupFormattingViewer as setup } from './__fixtures__/formatting-viewer';

afterEach(() => document.body.replaceChildren());

/** The fixture's shape plus a plain copy with ID 2, painted red with bold text on shape 1. */
async function twoShapes(ui: Awaited<ReturnType<typeof setup>>) {
	const zip = await JSZip.loadAsync(ui.bytes);
	const path = 'visio/pages/page1.xml';
	const xml = await zip.file(path)!.async('string');
	const original = xml.match(/<Shape ID="1"[\s\S]*?<\/Shape>/u)![0];
	const copy = original
		.replace('ID="1"', 'ID="2"')
		.replace(/<Cell N="PinX" V="[^"]*"\/>/u, '<Cell N="PinX" V="6"/>')
		.replace('Formatted shape', 'Second shape');
	const painted = original
		.replace('V="#DAEFE6"', 'V="#ff0000" F="RGB(255,0,0)"')
		.replace(
			'<Text>',
			'<Cell N="LineWeight" V="0.05"/><Section N="Character"><Row IX="0"><Cell N="Style" V="1"/><Cell N="Font" V="1"/></Row></Section><Text>',
		);
	zip.file(path, xml.replace(original, painted + copy));
	await ui.controller.load(await zip.generateAsync({ type: 'uint8array' }));
}
const pick = (ui: Awaited<ReturnType<typeof setup>>, id: string) =>
	ui.controller.selectShape({ id, name: `Shape ${id}`, pageId: '1' });
const target = (ui: Awaited<ReturnType<typeof setup>>) =>
	ui.controller.state.document!.pages[0]!.shapes.find((shape) => shape.id === '2')!;

it('copies formatting once to the next selected shape as one undoable edit', async () => {
	const ui = await setup(true);
	await twoShapes(ui);
	const button = ui.button('format-painter');
	expect(button.disabled).toBe(true);
	expect(button.hasAttribute('data-unsupported')).toBe(false);
	expect(button.title).toContain('Select one shape');
	pick(ui, '1');
	expect(button.disabled).toBe(false);
	ui.press('format-painter');
	expect(button.getAttribute('pressed')).toBe('true');
	expect(ui.feedback.at(-1)).toContain('select the shapes to format');
	pick(ui, '2');
	await vi.waitFor(() => expect(ui.edits.length).toBe(1));
	await ui.done();
	expect(ui.edits[0]!.map((edit) => edit.type)).toEqual(['format-shape', 'format-text']);
	expect(target(ui).style.fill).toBe('#ff0000');
	expect(target(ui).text.runs[0]).toMatchObject({ bold: true, fontFamily: 'Calibri' });
	expect(target(ui).text.plainText).toBe('Second shape');
	expect(button.getAttribute('pressed')).toBe('false');
	expect(ui.feedback.at(-1)).toContain('Applied formatting');
	pick(ui, '1');
	await Promise.resolve();
	expect(ui.edits.length).toBe(1);
	await ui.controller.undo();
	expect(target(ui).style.fill).not.toBe('#ff0000');
	ui.dispose();
	ui.controller.destroy();
});

it('stays on after a double click until Escape', async () => {
	const ui = await setup(true);
	await twoShapes(ui);
	pick(ui, '1');
	const button = ui.button('format-painter');
	ui.press('format-painter');
	ui.press('format-painter');
	expect(button.getAttribute('pressed')).toBe('false');
	button.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
	expect(button.getAttribute('pressed')).toBe('true');
	pick(ui, '2');
	await vi.waitFor(() => expect(ui.edits.length).toBe(1));
	await ui.done();
	expect(button.getAttribute('pressed')).toBe('true');
	ui.viewport.dispatchEvent(
		new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }),
	);
	expect(button.getAttribute('pressed')).toBe('false');
	expect(ui.feedback.at(-1)).toBe('Format Painter is off.');
	expect(ui.controller.state.selectedShapes.length).toBe(1);
	ui.dispose();
	ui.controller.destroy();
});

it('changes case through range edits without flattening rich runs', async () => {
	const ui = await setup(true, true);
	const menu = ui.root.querySelector<HTMLElement & { disabled: boolean }>(
		'[data-menu="change-case"]',
	)!;
	expect(menu.disabled).toBe(true);
	ui.selection();
	expect(menu.disabled).toBe(false);
	expect(ui.button('case-upper').disabled).toBe(false);
	ui.press('case-upper');
	await ui.done();
	expect(ui.edits.at(-1)![0]!.type).toBe('replace-text-ranges');
	expect(ui.shape().text.runs.map((run) => [run.text, run.bold])).toEqual([
		['PLAIN ', false],
		['BOLD', true],
	]);
	ui.press('case-upper');
	await ui.done();
	expect(ui.feedback.at(-1)).toBe('No changes were made.');
	ui.press('case-capitalize');
	await ui.done();
	expect(ui.shape().text.plainText).toBe('Plain Bold');
	await ui.controller.undo();
	expect(ui.shape().text.plainText).toBe('PLAIN BOLD');
	ui.dispose();
	ui.controller.destroy();
});
