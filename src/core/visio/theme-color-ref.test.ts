import { describe, expect, it } from 'vitest';
import { createVsdx } from './create-document';
import { editVsdx } from './edit';
import { VisioPackage } from './package';
import { parseVsdx } from './parser';
import { attribute, children } from './sheet';
import { visioBuiltInTheme } from './theme-builtins';
import {
	VISIO_UNTHEMED_COLORS,
	isVisioThemeColorRef,
	parseVisioThemeColorFormula,
	resolveVisioThemeColor,
	visioPageThemeColors,
	visioThemeColorFormula,
	type VisioThemeColorRef,
} from './theme-color-ref';

const page = '0';
const channels = (hex: string) =>
	[1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
/** Formula and RGB result recorded from Visio 16's Fill gallery on a page without a theme. */
const RECORDED: [VisioThemeColorRef, string, number[]][] = [
	[{ base: 'accent1' }, 'THEMEGUARD(THEMEVAL("AccentColor"))', [192, 80, 70]],
	[{ base: 'light' }, 'THEMEGUARD(THEMEVAL("Light"))', [255, 255, 255]],
	[{ base: 'dark', tint: 50 }, 'THEMEGUARD(MSOTINT(THEMEVAL("Dark"),50))', [127, 127, 127]],
	[{ base: 'light', tint: -5 }, 'THEMEGUARD(MSOTINT(THEMEVAL("Light"),-5))', [242, 242, 242]],
	[
		{ base: 'accent1', tint: 80 },
		'THEMEGUARD(MSOTINT(THEMEVAL("AccentColor"),80))',
		[242, 220, 218],
	],
	[
		{ base: 'accent1', tint: 60 },
		'THEMEGUARD(MSOTINT(THEMEVAL("AccentColor"),60))',
		[229, 185, 181],
	],
	[
		{ base: 'accent2', tint: 40 },
		'THEMEGUARD(MSOTINT(THEMEVAL("AccentColor2"),40))',
		[196, 214, 160],
	],
	[
		{ base: 'accent1', tint: -25 },
		'THEMEGUARD(MSOTINT(THEMEVAL("AccentColor"),-25))',
		[146, 57, 49],
	],
	[
		{ base: 'accent3', tint: -50 },
		'THEMEGUARD(MSOTINT(THEMEVAL("AccentColor3"),-50))',
		[84, 66, 106],
	],
	[
		{ base: 'accent5', tint: -25 },
		'THEMEGUARD(MSOTINT(THEMEVAL("AccentColor5"),-25))',
		[234, 112, 13],
	],
	[
		{ base: 'accent6', tint: 80 },
		'THEMEGUARD(MSOTINT(THEMEVAL("AccentColor6"),80))',
		[255, 242, 204],
	],
	[{ base: 'variant7' }, 'THEMEGUARD(THEMEVAL("VariantColor7"))', [0, 0, 0]],
	[{ base: '#ffffff', tint: -15 }, 'THEMEGUARD(MSOTINT(RGB(255,255,255),-15))', [216, 216, 216]],
	[{ base: '#000000', tint: 35 }, 'THEMEGUARD(MSOTINT(RGB(0,0,0),35))', [89, 89, 89]],
];

describe('theme colour references', () => {
	it('writes and reads the formulas Visio saves, with the colours Visio shows', () => {
		for (const [ref, formula, rgb] of RECORDED) {
			expect(visioThemeColorFormula(ref)).toBe(formula);
			expect(parseVisioThemeColorFormula(formula)).toEqual(ref);
			const ours = channels(resolveVisioThemeColor(ref, VISIO_UNTHEMED_COLORS)!);
			expect(ours).toEqual(rgb);
		}
	});

	it('leaves fixed colours and other formulas alone', () => {
		for (const formula of [
			'THEMEGUARD(RGB(192,0,0))',
			'RGB(1,2,3)',
			'THEMEVAL()',
			'THEMEGUARD(MSOTINT(THEMEVAL("AccentColor"),0))',
			'THEMEGUARD(MSOTINT(THEMEVAL("AccentColor"),180))',
			'THEMEGUARD(MSOTINT(THEMEVAL("FillColor"),40))',
			'GUARD(THEMEVAL("AccentColor"))',
			undefined,
		])
			expect(parseVisioThemeColorFormula(formula)).toBeUndefined();
		expect(isVisioThemeColorRef({ base: 'accent1', tint: 40 })).toBe(true);
		expect(isVisioThemeColorRef({ base: 'accent9' })).toBe(false);
		expect(isVisioThemeColorRef({ base: 'accent1', tint: 0.5 })).toBe(false);
		expect(resolveVisioThemeColor({ base: 'accent1' }, {})).toBeUndefined();
	});

	it('gives a themed page its own light, dark, accent and variant colours', () => {
		const colors = visioPageThemeColors({
			name: 'T',
			variant: 1,
			accents: ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666'],
			light: '#fefefe',
			dark: '#010101',
			variants: [[], ['#a1a1a1', '#a2a2a2']],
		});
		expect(colors).toMatchObject({
			light: '#fefefe',
			dark: '#010101',
			accent3: '#333333',
			variant1: '#a1a1a1',
			variant2: '#a2a2a2',
			variant3: '#333333',
			variant7: '#010101',
		});
		expect(visioPageThemeColors(undefined)).toBe(VISIO_UNTHEMED_COLORS);
	});
});

describe('theme colours in a drawing', () => {
	async function drawing() {
		const blank = await createVsdx();
		const drawn = await editVsdx(blank, [
			{ type: 'create-rectangle', pageId: page, shapeId: '1', x: 1, y: 1, width: 2, height: 1 },
		]);
		const text = await editVsdx(drawn.bytes, [
			{ type: 'replace-plain-text', pageId: page, shapeId: '1', text: 'Themed' },
		]);
		return (
			await editVsdx(text.bytes, [
				{
					type: 'format-shape',
					pageId: page,
					shapeId: '1',
					fillColor: '#f2dcda',
					fillColorTheme: { base: 'accent1', tint: 80 },
					lineColor: '#9dbb61',
					lineColorTheme: { base: 'accent2' },
				},
				{
					type: 'format-text',
					pageId: page,
					shapeId: '1',
					fontColor: '#7f7f7f',
					fontColorTheme: { base: 'dark', tint: 50 },
				},
			])
		).bytes;
	}
	async function cells(bytes: Uint8Array) {
		const root = await (await VisioPackage.open(bytes)).readXml('visio/pages/page1.xml');
		const shape = Array.from(root.getElementsByTagNameNS(root.namespaceURI, 'Shape'))[0]!;
		const read = (cell: Element | undefined) => [attribute(cell, 'V'), attribute(cell, 'F')];
		const local = (name: string) =>
			read(children(shape, 'Cell').find((cell) => attribute(cell, 'N') === name));
		const character = children(shape, 'Section').find(
			(section) => attribute(section, 'N') === 'Character',
		);
		const color = children(children(character, 'Row')[0], 'Cell').find(
			(cell) => attribute(cell, 'N') === 'Color',
		);
		return { fill: local('FillForegnd'), line: local('LineColor'), font: read(color) };
	}

	it('saves a picked theme colour as its formula over the resolved colour', async () => {
		const bytes = await drawing();
		expect(await cells(bytes)).toEqual({
			fill: ['#f2dcda', 'THEMEGUARD(MSOTINT(THEMEVAL("AccentColor"),80))'],
			line: ['#9dbb61', 'THEMEGUARD(THEMEVAL("AccentColor2"))'],
			font: ['#7f7f7f', 'THEMEGUARD(MSOTINT(THEMEVAL("Dark"),50))'],
		});
		const shape = (await parseVsdx(bytes)).pages[0]!.shapes[0]!;
		expect(shape.style.fill).toBe('#f2dcda');
		expect(shape.style.lineColor).toBe('#9dbb61');
		// A themed cell stays editable: a plain colour replaces the formula.
		const plain = await editVsdx(bytes, [
			{ type: 'format-shape', pageId: page, shapeId: '1', fillColor: '#123456' },
		]);
		expect((await cells(plain.bytes)).fill).toEqual(['#123456', 'RGB(18,52,86)']);
	});

	it('refuses a theme reference without the colour it stands for', async () => {
		const bytes = await drawing();
		for (const edit of [
			{ fillColorTheme: { base: 'accent1' } },
			{ fillColor: 'none', fillColorTheme: { base: 'accent1' } },
			{ lineColor: '#000000', lineColorTheme: { base: 'accent8' } },
		])
			await expect(
				editVsdx(bytes, [{ type: 'format-shape', pageId: page, shapeId: '1', ...edit } as never]),
			).rejects.toMatchObject({ code: 'INVALID_EDIT' });
	});

	it('follows the page theme: applying, changing the variant and clearing it', async () => {
		const bytes = await drawing();
		const source = visioBuiltInTheme('harbor');
		const accent = (index: number) => `#${source.colors[index + 3]!.toLowerCase()}`;
		const themed = await editVsdx(bytes, [
			{ type: 'set-page-theme', pageId: page, theme: 'harbor' },
		]);
		const after = await cells(themed.bytes);
		expect(after.line).toEqual([accent(2), 'THEMEGUARD(THEMEVAL("AccentColor2"))']);
		expect(after.fill[0]).toBe(
			resolveVisioThemeColor({ base: 'accent1', tint: 80 }, { accent1: accent(1) }),
		);
		expect(after.fill[1]).toBe('THEMEGUARD(MSOTINT(THEMEVAL("AccentColor"),80))');
		expect(after.font[0]).toBe(
			resolveVisioThemeColor(
				{ base: 'dark', tint: 50 },
				{ dark: `#${source.colors[0]!.toLowerCase()}` },
			),
		);
		const model = (await parseVsdx(themed.bytes)).pages[0]!;
		expect(model.shapes[0]!.style.lineColor).toBe(accent(2));
		expect(model.theme).toMatchObject({
			dark: `#${source.colors[0]!.toLowerCase()}`,
			light: `#${source.colors[1]!.toLowerCase()}`,
		});
		const cleared = await editVsdx(themed.bytes, [
			{ type: 'set-page-theme', pageId: page, theme: 'none' },
		]);
		expect((await cells(cleared.bytes)).line[0]).toBe(VISIO_UNTHEMED_COLORS.accent2);
	});

	it('recolours variant colours when only the variant changes', async () => {
		const drawn = await drawing();
		const themed = await editVsdx(drawn, [
			{ type: 'set-page-theme', pageId: page, theme: 'harbor' },
		]);
		const picked = await editVsdx(themed.bytes, [
			{
				type: 'format-shape',
				pageId: page,
				shapeId: '1',
				fillColor: '#000000',
				fillColorTheme: { base: 'variant1' },
			},
		]);
		const next = await editVsdx(picked.bytes, [
			{ type: 'set-page-theme', pageId: page, variant: 2 },
		]);
		const theme = (await parseVsdx(next.bytes)).pages[0]!.theme!;
		expect(theme.variant).toBe(2);
		expect((await cells(next.bytes)).fill[0]).toBe(theme.variants[2]![0]);
	});
});
