import { afterEach, expect, it } from 'vitest';
import { parseVsdx } from 'ooxml-core/visio';
import { setupFormattingViewer as setup } from './__fixtures__/formatting-viewer';
import { colorAction, commonColor, pageThemeGrid, pickedThemeColor } from './ribbon-color-menu';

afterEach(() => document.body.replaceChildren());

type Ui = Awaited<ReturnType<typeof setup>>;
const moreColors = (ui: Ui) =>
	ui.root.querySelector<HTMLElement & { open: boolean }>('.more-colors-dialog')!;
const field = (ui: Ui, name: string) =>
	moreColors(ui)
		.querySelector('office-ui-color-custom')!
		.shadowRoot!.querySelector<HTMLInputElement>(`[data-color-field="${name}"]`)!;
const type = (input: HTMLInputElement, value: string) => {
	input.value = value;
	input.dispatchEvent(new Event('input', { bubbles: true }));
};
const ok = (ui: Ui) =>
	moreColors(ui)
		.querySelector('[command="more-colors-dialog-ok"]')!
		.shadowRoot!.querySelector('button')!
		.click();

it('maps picked colours to the formatting actions and reads the page theme', () => {
	expect(colorAction('fill', '#112233')).toEqual({
		type: 'shape-format',
		patch: { fillColor: '#112233' },
	});
	expect(colorAction('fill', 'none')).toEqual({
		type: 'shape-format',
		patch: { fillColor: 'none' },
	});
	expect(colorAction('line', 'none')).toEqual({ type: 'shape-format', patch: { linePattern: 0 } });
	expect(colorAction('line', '#112233')).toEqual({
		type: 'shape-format',
		patch: { lineColor: '#112233' },
	});
	expect(colorAction('font', '#112233')).toEqual({ type: 'font-color', value: '#112233' });
	// A theme swatch carries where it came from, so it is saved as a theme formula.
	expect(colorAction('fill', '#f2dcda', { base: 'accent1', tint: 80 })).toEqual({
		type: 'shape-format',
		patch: { fillColor: '#f2dcda', fillColorTheme: { base: 'accent1', tint: 80 } },
	});
	expect(colorAction('line', '#9dbb61', { base: 'accent2' })).toEqual({
		type: 'shape-format',
		patch: { lineColor: '#9dbb61', lineColorTheme: { base: 'accent2' } },
	});
	expect(colorAction('font', '#000000', { base: 'dark' })).toEqual({
		type: 'font-color',
		value: '#000000',
		theme: { base: 'dark' },
	});
	// A drawing without a theme shows the colours Visio itself shows there: fixed White and Black,
	// Light, Dark and its six accents, with the variant colours equal to the accents.
	const plain = pageThemeGrid(undefined);
	expect(plain.colors).toEqual([
		'#ffffff',
		'#000000',
		'#ffffff',
		'#000000',
		'#c05046',
		'#9dbb61',
		'#ab9ac0',
		'#4bacc6',
		'#f59d56',
		'#ffc000',
	]);
	expect(plain.variants.map((item) => item.hex)).toEqual([...plain.colors.slice(4), '#000000']);
	expect(plain.variants[2]!.label).toBe('Variant Accent 3');
	const themed = pageThemeGrid({
		theme: {
			name: 'T',
			variant: 1,
			light: '#fafafa',
			dark: '#0a0a0a',
			accents: ['#101010', '#202020', '#303030', '#404040', '#505050', '#606060'],
			variants: [[], ['#a1a1a1']],
		},
	} as never);
	expect(themed.colors.slice(2)).toEqual([
		'#fafafa',
		'#0a0a0a',
		'#101010',
		'#202020',
		'#303030',
		'#404040',
		'#505050',
		'#606060',
	]);
	expect(themed.variants[0]!.hex).toBe('#a1a1a1');
	const pick = (more: object) =>
		pickedThemeColor({ color: '#000000', source: 'theme', label: '', ...more });
	expect(pick({ theme: { column: 4 } })).toEqual({ base: 'accent1' });
	expect(pick({ theme: { column: 3, variant: { kind: 'lighter', percent: 35 } } })).toEqual({
		base: 'dark',
		tint: 35,
	});
	expect(pick({ theme: { column: 0, variant: { kind: 'darker', percent: 15 } } })).toEqual({
		base: '#ffffff',
		tint: -15,
	});
	// Plain white and black, a standard colour and a recent one are fixed colours.
	expect(pick({ theme: { column: 1 } })).toBeUndefined();
	expect(pick({ source: 'standard' })).toBeUndefined();
	expect(pick({ source: 'extra', index: 6 })).toEqual({ base: 'variant7' });
	expect(commonColor(['#AA0000', '#aa0000'])).toBe('#aa0000');
	expect(commonColor(['#aa0000', '#bb0000'])).toBeUndefined();
	expect(commonColor([])).toBeUndefined();
});

it('offers theme and standard colours in Fill, Line and Font Color and follows the selection', async () => {
	const ui = await setup();
	for (const target of ['fill', 'line', 'font'] as const) {
		const grid = ui.grid(target);
		expect(grid.closest('office-ui-menu-button')!.getAttribute('label')).toBe(
			{ fill: 'Fill', line: 'Line', font: 'Font Color' }[target],
		);
		expect(grid.shadowRoot!.querySelectorAll('[data-source="theme"]')).toHaveLength(60);
		expect(grid.shadowRoot!.querySelectorAll('[data-source="standard"]')).toHaveLength(10);
		// Visio's row of variant colours sits under the theme grid.
		expect(grid.shadowRoot!.querySelectorAll('[data-source="extra"]')).toHaveLength(7);
		expect(grid.shadowRoot!.querySelector('[data-command="more"]')!.textContent).toContain(
			'More Colors...',
		);
		expect(grid.value).toBeNull();
	}
	expect(ui.grid('fill').getAttribute('none-label')).toBe('No Fill');
	expect(ui.grid('line').getAttribute('none-label')).toBe('No Line');
	expect(ui.grid('font').hasAttribute('none-label')).toBe(false);
	ui.selection();
	// A theme tint, as Office names it.
	const tint = ui
		.grid('fill')
		.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Accent 2, Lighter 60%"]')!;
	tint.click();
	await ui.done();
	expect(ui.edits.at(-1)).toEqual([
		{
			type: 'format-shape',
			pageId: '1',
			shapeId: '1',
			fillColor: tint.dataset.color,
			fillColorTheme: { base: 'accent2', tint: 60 },
		},
	]);
	expect(ui.shape().style.fill).toBe(tint.dataset.color);
	expect(ui.grid('fill').value).toBe(tint.dataset.color);
	ui.pickColor('fill', 'none');
	await ui.done();
	expect(ui.grid('fill').value).toBe('none');
	ui.dispose();
	ui.controller.destroy();
});

it('applies a custom colour from More Colors and lists it under Recent Colors', async () => {
	const ui = await setup();
	ui.selection();
	ui.pickColor('fill', '#ff0000');
	await ui.done();
	ui.pickColor('fill', 'more');
	expect(moreColors(ui).open).toBe(true);
	expect(moreColors(ui).getAttribute('heading')).toBe('Colors');
	// The dialog starts on the shape's colour.
	expect(field(ui, 'hex').value).toBe('#FF0000');
	expect(['red', 'green', 'blue'].map((name) => field(ui, name).value)).toEqual(['255', '0', '0']);
	type(field(ui, 'hex'), '#12ab');
	ok(ui);
	expect(moreColors(ui).querySelector('[role="alert"]')!.textContent).toMatch(/#RRGGBB/);
	expect(moreColors(ui).open).toBe(true);
	// Hex and the channels follow each other.
	type(field(ui, 'hex'), '1a2B3c');
	expect(['red', 'green', 'blue'].map((name) => field(ui, name).value)).toEqual(['26', '43', '60']);
	type(field(ui, 'blue'), '255');
	expect(field(ui, 'hex').value).toBe('#1A2BFF');
	type(field(ui, 'green'), '300');
	ok(ui);
	expect(moreColors(ui).open).toBe(true);
	type(field(ui, 'green'), '43');
	ok(ui);
	expect(moreColors(ui).open).toBe(false);
	await ui.done();
	expect(ui.shape().style.fill).toBe('#1a2bff');
	expect((await parseVsdx(ui.controller.exportVsdx().bytes)).pages[0]!.shapes[0]!.style.fill).toBe(
		'#1a2bff',
	);
	// Every picker now offers it again.
	for (const target of ['fill', 'line', 'font'] as const)
		expect(
			[...ui.grid(target).shadowRoot!.querySelectorAll<HTMLElement>('[data-source="recent"]')].map(
				(swatch) => swatch.dataset.color,
			),
		).toEqual(['#1a2bff']);
	// Cancel changes nothing.
	const count = ui.edits.length;
	ui.pickColor('line', 'more');
	type(field(ui, 'hex'), '#00ff00');
	moreColors(ui)
		.querySelector('[command="more-colors-dialog-cancel"]')!
		.shadowRoot!.querySelector('button')!
		.click();
	expect(moreColors(ui).open).toBe(false);
	expect(ui.edits).toHaveLength(count);
	ui.dispose();
	ui.controller.destroy();
});

it('sets the font colour from the grid and repeats it with the split button', async () => {
	const ui = await setup();
	ui.selection();
	ui.pickColor('font', '#7030a0');
	await ui.done();
	expect(ui.shape().text.color).toBe('#7030a0');
	expect(ui.grid('font').value).toBe('#7030a0');
	ui.press('undo');
	await ui.done();
	expect(ui.shape().text.color).not.toBe('#7030a0');
	ui.press('font-color');
	await ui.done();
	expect(ui.shape().text.color).toBe('#7030a0');
	ui.dispose();
	ui.controller.destroy();
});
