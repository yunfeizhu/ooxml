import { afterEach, expect, it } from 'vitest';
import { parseVsdx } from 'ooxml-core/visio';
import type { OfficeUiColorGrid } from '../controls';
import { setupFormattingViewer as setup } from './__fixtures__/formatting-viewer';

afterEach(() => document.body.replaceChildren());

type Ui = Awaited<ReturnType<typeof setup>>;
const pane = (ui: Ui) => ui.root.querySelector<HTMLElement>('.format-pane')!;
const part = (ui: Ui, target: 'fill' | 'line') => {
	const set = pane(ui).querySelector<HTMLElement>(`[data-format-section="${target}"]`)!;
	return {
		none: set.querySelector<HTMLInputElement>('input[value="none"]')!,
		solid: set.querySelector<HTMLInputElement>('input[value="solid"]')!,
		color: set.querySelector<HTMLButtonElement>('.format-pane-color')!,
		grid: set.querySelector<OfficeUiColorGrid>('office-ui-color-grid')!,
		details: set.querySelector<HTMLElement>('.format-pane-details')!,
	};
};
const field = (ui: Ui, name: string) =>
	pane(ui).querySelector<HTMLInputElement | HTMLSelectElement>(`[data-pane-field="${name}"]`)!;
const change = (input: HTMLInputElement | HTMLSelectElement, value: string) => {
	input.value = value;
	input.dispatchEvent(new Event('change', { bubbles: true }));
};
const launch = (ui: Ui) =>
	ui.root.querySelector('office-ui-ribbon-group[launcher="shape-styles-dialog"]')!.dispatchEvent(
		new CustomEvent('office-command', {
			detail: { command: 'shape-styles-dialog' },
			bubbles: true,
			composed: true,
		}),
	);

it('opens from the Shape Styles launcher and explains an empty selection', async () => {
	const ui = await setup();
	const group = ui.root.querySelector('office-ui-ribbon-group[launcher="shape-styles-dialog"]')!;
	expect(group.hasAttribute('launcher-disabled')).toBe(false);
	launch(ui);
	// The task pane; the old Format Shape and Fill & Line dialogs are gone.
	expect(ui.root.querySelector('.format-shape-dialog, .paint-properties-dialog')).toBeNull();
	expect(pane(ui).dataset.paneView).toBe('format');
	expect(pane(ui).querySelector('.format-pane-hint')!.textContent).toBe(
		'Select a shape to format.',
	);
	expect(part(ui, 'fill').solid.disabled).toBe(true);
	expect(field(ui, 'lineWeight').disabled).toBe(true);
	ui.selection();
	expect(pane(ui).querySelector<HTMLElement>('.format-pane-hint')!.hidden).toBe(true);
	expect(part(ui, 'fill').solid.disabled).toBe(false);
	expect([...pane(ui).querySelectorAll('legend')].map((legend) => legend.textContent)).toEqual([
		'Fill',
		'Line',
		'Effects',
	]);
	// Visio's Gradient fill is listed, disabled, with what is missing.
	const gradient = pane(ui).querySelector<HTMLInputElement>('input[value="gradient"]')!;
	expect(gradient.disabled).toBe(true);
	expect(gradient.closest('label')!.title).toMatch(/gradient fill is shown as saved/);
	ui.dispose();
	ui.controller.destroy();
});

it('applies fill changes at once and follows the selection', async () => {
	const ui = await setup();
	ui.selection();
	const fill = part(ui, 'fill');
	expect(fill.solid.checked).toBe(true);
	// The colour button opens the shared grid with theme colours.
	expect(fill.grid.hidden).toBe(true);
	fill.color.click();
	expect(fill.grid.hidden).toBe(false);
	expect(fill.color.getAttribute('aria-expanded')).toBe('true');
	expect(fill.grid.hasAttribute('none-label')).toBe(false);
	fill.grid
		.shadowRoot!.querySelector<HTMLButtonElement>('[data-source="standard"][data-color="#ffc000"]')!
		.click();
	await ui.done();
	expect(ui.edits.at(-1)).toEqual([
		{ type: 'format-shape', pageId: '1', shapeId: '1', fillColor: '#ffc000' },
	]);
	expect(fill.grid.hidden).toBe(true);
	expect(fill.color.title).toBe('Fill color: #FFC000');
	change(field(ui, 'fillTransparency'), '40');
	await ui.done();
	expect(ui.edits.at(-1)).toEqual([
		{ type: 'format-shape', pageId: '1', shapeId: '1', fillTransparency: 40 },
	]);
	expect(field(ui, 'fillTransparency').value).toBe('40');
	// No fill hides the colour and transparency; Solid fill brings the colour back.
	fill.none.checked = true;
	fill.none.dispatchEvent(new Event('change', { bubbles: true }));
	await ui.done();
	expect(ui.shape().style.fill).toBe('none');
	expect(fill.none.checked).toBe(true);
	expect(fill.details.hidden).toBe(true);
	fill.solid.checked = true;
	fill.solid.dispatchEvent(new Event('change', { bubbles: true }));
	await ui.done();
	expect(ui.shape().style.fill).toBe('#ffc000');
	expect(fill.details.hidden).toBe(false);
	// The ribbon's Fill picker shows the same colour.
	expect(ui.grid('fill').value).toBe('#ffc000');
	// One step per change.
	ui.press('undo');
	await ui.done();
	expect(ui.shape().style.fill).toBe('none');
	expect(fill.none.checked).toBe(true);
	ui.dispose();
	ui.controller.destroy();
});

it('sets line colour, width, dash type and transparency, and refuses bad numbers', async () => {
	const ui = await setup();
	ui.selection();
	const line = part(ui, 'line');
	line.color.click();
	line.grid.shadowRoot!.querySelector<HTMLButtonElement>('[data-color="#0070c0"]')!.click();
	await ui.done();
	change(field(ui, 'lineWeight'), '2.25');
	await ui.done();
	change(field(ui, 'linePattern'), '4');
	await ui.done();
	change(field(ui, 'lineTransparency'), '15');
	await ui.done();
	expect(ui.edits.slice(-4).map((edits) => edits[0])).toEqual([
		{ type: 'format-shape', pageId: '1', shapeId: '1', lineColor: '#0070c0' },
		{ type: 'format-shape', pageId: '1', shapeId: '1', lineWeight: 2.25 },
		{ type: 'format-shape', pageId: '1', shapeId: '1', linePattern: 4 },
		{ type: 'format-shape', pageId: '1', shapeId: '1', lineTransparency: 15 },
	]);
	expect(field(ui, 'lineWeight').value).toBe('2.25');
	expect(field(ui, 'linePattern').value).toBe('4');
	const saved = (await parseVsdx(ui.controller.exportVsdx().bytes)).pages[0]!.shapes[0]!;
	expect(saved.style.lineColor).toBe('#0070c0');
	expect(saved.style.lineWidth * 72).toBeCloseTo(2.25);
	const count = ui.edits.length;
	change(field(ui, 'lineWeight'), '999');
	expect(ui.edits).toHaveLength(count);
	expect(ui.feedback.at(-1)).toBe('Enter a line width from 0 to 150.');
	expect(field(ui, 'lineWeight').value).toBe('2.25');
	// No line and back.
	line.none.checked = true;
	line.none.dispatchEvent(new Event('change', { bubbles: true }));
	await ui.done();
	expect(ui.shape().style.linePattern).toBe(0);
	expect(line.details.hidden).toBe(true);
	line.solid.checked = true;
	line.solid.dispatchEvent(new Event('change', { bubbles: true }));
	await ui.done();
	expect(ui.shape().style.linePattern).toBe(1);
	expect(line.solid.checked).toBe(true);
	ui.dispose();
	ui.controller.destroy();
});

it('takes a custom colour from More Colors', async () => {
	const ui = await setup();
	ui.selection();
	const fill = part(ui, 'fill');
	fill.color.click();
	fill.grid.shadowRoot!.querySelector<HTMLButtonElement>('[data-command="more"]')!.click();
	const colors = ui.root.querySelector<HTMLElement & { open: boolean }>('.more-colors-dialog')!;
	expect(colors.open).toBe(true);
	const hex = colors
		.querySelector('office-ui-color-custom')!
		.shadowRoot!.querySelector<HTMLInputElement>('[data-color-field="hex"]')!;
	hex.value = '#abcdef';
	hex.dispatchEvent(new Event('input', { bubbles: true }));
	colors
		.querySelector('[command="more-colors-dialog-ok"]')!
		.shadowRoot!.querySelector('button')!
		.click();
	await ui.done();
	expect(ui.shape().style.fill).toBe('#abcdef');
	expect(fill.grid.shadowRoot!.querySelector('[data-source="recent"]')).not.toBeNull();
	ui.dispose();
	ui.controller.destroy();
});

it('sets the fill pattern and its background, line ends, cap and rounding', async () => {
	const ui = await setup();
	ui.selection();
	expect(field(ui, 'fillPattern').value).toBe('1');
	change(field(ui, 'fillPattern'), '6');
	await ui.done();
	const background = pane(ui).querySelector<HTMLButtonElement>(
		'[data-format-color="fillBackground"]',
	)!;
	background.click();
	const grid = pane(ui).querySelector<OfficeUiColorGrid>(
		'office-ui-color-grid[data-color-grid="fillBackground"]',
	)!;
	expect(grid.hidden).toBe(false);
	grid.shadowRoot!.querySelector<HTMLButtonElement>('[data-color="#00b050"]')!.click();
	await ui.done();
	expect(ui.edits.slice(-2).map((edits) => edits[0])).toEqual([
		{ type: 'format-shape', pageId: '1', shapeId: '1', fillPattern: 6 },
		{ type: 'format-shape', pageId: '1', shapeId: '1', fillBackgroundColor: '#00b050' },
	]);
	expect(background.title).toBe('Pattern background color: #00B050');
	expect(field(ui, 'fillPattern').value).toBe('6');
	for (const [name, value] of [
		['lineCap', '1'],
		['rounding', '9'],
		['beginArrow', '4'],
		['beginArrowSize', '5'],
		['endArrow', '13'],
		['endArrowSize', '0'],
	] as const) {
		change(field(ui, name), value);
		await ui.done();
		// The field shows what the drawing now has.
		expect(field(ui, name).value).toBe(value);
	}
	expect(ui.edits.slice(-6).map((edits) => edits[0])).toEqual([
		{ type: 'format-shape', pageId: '1', shapeId: '1', lineCap: 1 },
		{ type: 'format-shape', pageId: '1', shapeId: '1', rounding: 9 },
		{ type: 'format-shape', pageId: '1', shapeId: '1', beginArrow: 4 },
		{ type: 'format-shape', pageId: '1', shapeId: '1', beginArrowSize: 5 },
		{ type: 'format-shape', pageId: '1', shapeId: '1', endArrow: 13 },
		{ type: 'format-shape', pageId: '1', shapeId: '1', endArrowSize: 0 },
	]);
	const saved = (await parseVsdx(ui.controller.exportVsdx().bytes)).pages[0]!.shapes[0]!.style;
	expect(saved).toMatchObject({
		startArrow: 4,
		endArrow: 13,
		startArrowSize: 5,
		endArrowSize: 0,
		lineCap: 'butt',
		fillPatternIndex: 6,
	});
	expect(saved.rounding! * 72).toBeCloseTo(9);
	const count = ui.edits.length;
	change(field(ui, 'rounding'), '9999');
	expect(ui.edits).toHaveLength(count);
	expect(ui.feedback.at(-1)).toBe('Enter a rounding size from 0 to 720.');
	ui.dispose();
	ui.controller.destroy();
});

it('sets shadow, glow, soft edges and reflection in the Effects section', async () => {
	const ui = await setup();
	ui.selection();
	expect(field(ui, 'glowSize').value).toBe('0');
	expect(field(ui, 'shadow').value).toBe('0');
	change(field(ui, 'glowSize'), '11');
	await ui.done();
	const glow = pane(ui).querySelector<HTMLButtonElement>('[data-format-color="glow"]')!;
	glow.click();
	pane(ui)
		.querySelector<OfficeUiColorGrid>('office-ui-color-grid[data-color-grid="glow"]')!
		.shadowRoot!.querySelector<HTMLButtonElement>('[data-color="#0070c0"]')!
		.click();
	await ui.done();
	change(field(ui, 'glowTransparency'), '25');
	await ui.done();
	change(field(ui, 'softEdges'), '2.5');
	await ui.done();
	change(field(ui, 'reflectionSize'), '40');
	await ui.done();
	change(field(ui, 'shadow'), '1');
	await ui.done();
	// Each change is one edit; a glow or reflection edit carries the effect's other values.
	expect(ui.edits.slice(-6).map((edits) => edits[0])).toEqual([
		{
			type: 'format-shape',
			pageId: '1',
			shapeId: '1',
			glow: { size: 11, color: '#000000', transparency: 0 },
		},
		{
			type: 'format-shape',
			pageId: '1',
			shapeId: '1',
			glow: { size: 11, color: '#0070c0', transparency: 0 },
		},
		{
			type: 'format-shape',
			pageId: '1',
			shapeId: '1',
			glow: { size: 11, color: '#0070c0', transparency: 25 },
		},
		{ type: 'format-shape', pageId: '1', shapeId: '1', softEdges: 2.5 },
		{
			type: 'format-shape',
			pageId: '1',
			shapeId: '1',
			reflection: { size: 40, transparency: 0, distance: 0, blur: 0 },
		},
		{ type: 'format-shape', pageId: '1', shapeId: '1', shadow: 'bottom-right' },
	]);
	expect(ui.shape().style.softEdges).toBeCloseTo(2.5 / 72);
	expect(field(ui, 'shadow').value).toBe('1');
	expect(glow.title).toBe('Glow color: #0070C0');
	const count = ui.edits.length;
	change(field(ui, 'reflectionSize'), '200');
	expect(ui.edits).toHaveLength(count);
	expect(ui.feedback.at(-1)).toBe('Enter a reflection size from 0 to 100.');
	ui.dispose();
	ui.controller.destroy();
});

it('opens at the right section from the menus and the shape menu', async () => {
	const ui = await setup();
	ui.selection();
	const focused = () => (ui.root.activeElement as HTMLElement | null)?.closest('fieldset')?.dataset;
	ui.press('glow-options');
	expect(focused()?.formatSection).toBe('effects');
	ui.press('line-options');
	expect(focused()?.formatSection).toBe('line');
	ui.press('fill-options');
	expect(focused()?.formatSection).toBe('fill');
	ui.commands.run({ type: 'format-shape-pane' });
	expect(pane(ui).isConnected).toBe(true);
	ui.dispose();
	ui.controller.destroy();
});
