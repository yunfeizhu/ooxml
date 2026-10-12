import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { editVsdx, type VisioEdit } from './edit';
import { parseXml } from '../xml/index';
import { parseVsdx } from './parser';
import { fixture, rectangle, shape } from './test-fixtures';

const PAGE = 'visio/pages/page1.xml';
const c = (name: string, value: string | number, formula = '', unit = '') =>
	`<Cell N="${name}" V="${value}"${unit ? ` U="${unit}"` : ''}${formula ? ` F="${formula}"` : ''}/>`;
const len = (name: string, value: number, formula = '') => c(name, value, formula, 'IN');
const pt = (points: number) => points / 72;

/** Arial 12 pt with 4 pt margins: the style of the values recorded from Visio 16 below. */
const style = (font = 'Arial') =>
	['LeftMargin', 'RightMargin', 'TopMargin', 'BottomMargin']
		.map((name) => c(name, pt(4), '', 'PT'))
		.join('') +
	`<Section N="Character"><Row IX="0">${c('Font', font)}${c('Size', pt(12), '', 'PT')}${c('Style', 0)}</Row></Section>`;
const FOX = 'The quick brown fox jumps over the lazy dog';
/** `scripts/record-visio-text-extent.ps1`, Arial 12 pt, 4 pt margins, in points. */
const VISIO = { foxWidth: 248.793, foxBoldWidth: 268.039, foxAt1: 80, foxAt1_5: 51.2 };

const replace = (text: string, shapeId = '1'): VisioEdit => ({
	type: 'replace-plain-text',
	pageId: '0',
	shapeId,
	text,
});
async function page(bytes: Uint8Array): Promise<Document> {
	const zip = await JSZip.loadAsync(bytes);
	return parseXml(await zip.file(PAGE)!.async('string'));
}
function cellOf(doc: Document, shapeId: string, name: string, row?: string): Element | undefined {
	const node = Array.from(doc.getElementsByTagName('Shape')).find(
		(item) => item.getAttribute('ID') === shapeId,
	)!;
	return Array.from(node.getElementsByTagName('Cell')).find(
		(item) =>
			item.getAttribute('N') === name &&
			(row === undefined
				? item.parentNode === node
				: (item.parentNode as Element).getAttribute('N') === row ||
					(item.parentNode as Element).getAttribute('IX') === row),
	);
}
const sizing = (result: { diagnostics: readonly { code: string; message: string }[] }) =>
	result.diagnostics.filter((item) => item.code.startsWith('edit-text-size'));
const value = (doc: Document, shapeId: string, name: string, row?: string) =>
	Number(cellOf(doc, shapeId, name, row)?.getAttribute('V'));

describe('shapes that size themselves from their text', () => {
	const box = (cells: string, text = 'Process') =>
		shape(
			'1',
			len('PinX', 3) + len('PinY', 3) + cells + style() + rectangle + `<Text>${text}</Text>`,
		);

	it('gives a text box the height Visio computes when its text wraps', async () => {
		const bytes = await fixture({
			pages: [
				{
					id: '0',
					contents: `<Shapes>${box(
						len('Width', 1.5) +
							len('Height', pt(22.4), 'GUARD(TEXTHEIGHT(TheText,Width))') +
							len('TxtHeight', pt(22.4), 'Height*1'),
					)}</Shapes>`,
				},
			],
		});
		const saved = await editVsdx(bytes, [replace(FOX)]);
		expect(sizing(saved).map((item) => item.code)).toEqual(['edit-text-size']);
		const doc = await page(saved.bytes);
		expect(value(doc, '1', 'Height') * 72).toBeCloseTo(VISIO.foxAt1_5, 2);
		// The formula stays: only its cached value follows the text, and so does what reads it.
		expect(cellOf(doc, '1', 'Height')!.getAttribute('F')).toBe('GUARD(TEXTHEIGHT(TheText,Width))');
		expect(value(doc, '1', 'TxtHeight') * 72).toBeCloseTo(VISIO.foxAt1_5, 2);
		const model = (await parseVsdx(saved.bytes)).pages[0]!.shapes[0]!;
		expect(model.height * 72).toBeCloseTo(VISIO.foxAt1_5, 2);
		expect(model.text.plainText).toBe(FOX);
		// Back to one line: the box shrinks again.
		const back = await page((await editVsdx(saved.bytes, [replace('Process')])).bytes);
		expect(value(back, '1', 'Height') * 72).toBeCloseTo(22.4, 2);
	});

	it('measures a text box again when its width is resized', async () => {
		const bytes = await fixture({
			pages: [
				{
					id: '0',
					contents: `<Shapes>${box(
						len('Width', 1.5) +
							len('Height', pt(VISIO.foxAt1_5), 'GUARD(TEXTHEIGHT(TheText,Width))') +
							len('LocPinX', 0.75, 'Width*0.5') +
							len('LocPinY', pt(VISIO.foxAt1_5 / 2), 'Height*0.5'),
						FOX,
					)}</Shapes>`,
				},
			],
		});
		const narrow = await editVsdx(bytes, [
			{ type: 'resize-shape', pageId: '0', shapeId: '1', width: 1, height: pt(VISIO.foxAt1_5) },
		]);
		const doc = await page(narrow.bytes);
		expect(value(doc, '1', 'Width')).toBe(1);
		expect(value(doc, '1', 'Height') * 72).toBeCloseTo(VISIO.foxAt1, 2);
		expect(value(doc, '1', 'LocPinY') * 72).toBeCloseTo(VISIO.foxAt1 / 2, 2);
		expect(sizing(narrow).map((item) => item.code)).toEqual(['edit-text-size']);
	});

	it('follows the text width, and the font weight', async () => {
		const bytes = await fixture({
			pages: [
				{
					id: '0',
					contents: `<Shapes>${box(len('Width', 1, 'GUARD(TEXTWIDTH(TheText))') + len('Height', 0.5))}</Shapes>`,
				},
			],
		});
		const saved = await editVsdx(bytes, [replace(FOX)]);
		expect(value(await page(saved.bytes), '1', 'Width') * 72).toBeCloseTo(VISIO.foxWidth, 1);
		const bold = await editVsdx(saved.bytes, [
			{ type: 'format-text', pageId: '0', shapeId: '1', bold: true },
		]);
		expect(value(await page(bold.bytes), '1', 'Width') * 72).toBeCloseTo(VISIO.foxBoldWidth, 1);
	});

	it('grows a stencil shape with Resize with Text, as local caches over the master', async () => {
		// The cells of Visio's flowchart masters that matter here (read from BASFLO_U.VSSX).
		const master = shape(
			'6',
			len('PinX', 2) +
				len('PinY', 2) +
				len('Width', 1, 'User.DefaultWidth') +
				len('Height', 0.75, 'User.ResizeTxtHeight') +
				len('LocPinX', 0.5, 'Width*0.5') +
				len('LocPinY', 0.375, 'Height*0.5') +
				len('TxtWidth', 1, 'Width*1') +
				len('TxtHeight', 0.75, 'Height*1') +
				style() +
				`<Section N="User"><Row N="DefaultWidth">${len('Value', 1)}</Row><Row N="DefaultHeight">${len('Value', 0.75)}</Row><Row N="ResizeTxtHeight">${len('Value', 0.75, 'MAX(User.DefaultHeight,CEILING(TEXTHEIGHT(TheText,TxtWidth),0.25))')}</Row></Section>` +
				`<Section N="Actions"><Row N="ResizeWithText">${c('Invisible', 1, 'IF(Height=User.ResizeTxtHeight,TRUE,FALSE)')}</Row></Section>` +
				`<Section N="Geometry" IX="0"><Row T="MoveTo" IX="1">${len('X', 0)}${len('Y', 0)}</Row><Row T="LineTo" IX="2">${len('X', 1, 'Width*1')}${len('Y', 0.75, 'Height*1')}</Row></Section>` +
				'<Text>Process</Text>',
			'Type="Shape"',
		);
		const bytes = await fixture({
			masters: [{ id: '2', shapes: master }],
			pages: [
				{
					id: '0',
					contents: `<Shapes>${shape('1', c('PinX', 2) + c('PinY', 6), 'Type="Shape" Master="2"')}</Shapes>`,
				},
			],
		});
		// 80 pt of text at one inch wide is 1.11 in, which the master rounds up to quarters.
		const saved = await editVsdx(bytes, [replace(FOX)]);
		const doc = await page(saved.bytes);
		expect(value(doc, '1', 'Height')).toBe(1.25);
		expect(cellOf(doc, '1', 'Height')!.getAttribute('F')).toBe('Inh');
		expect(value(doc, '1', 'Value', 'ResizeTxtHeight')).toBe(1.25);
		expect(value(doc, '1', 'TxtHeight')).toBe(1.25);
		expect(value(doc, '1', 'LocPinY')).toBe(0.625);
		expect(value(doc, '1', 'Y', '2')).toBe(1.25);
		expect((await parseVsdx(saved.bytes)).pages[0]!.shapes[0]!.height).toBe(1.25);
		// A user's own height wins: the text no longer drives it, and the menu cell says so.
		const resized = await editVsdx(saved.bytes, [
			{ type: 'resize-shape', pageId: '0', shapeId: '1', width: 1, height: 2 },
		]);
		const after = await page(resized.bytes);
		expect(value(after, '1', 'Height')).toBe(2);
		expect(value(after, '1', 'Invisible', 'ResizeWithText')).toBe(0);
		const typed = await editVsdx(resized.bytes, [replace('Process')]);
		expect(value(await page(typed.bytes), '1', 'Height')).toBe(2);
	});

	it('keeps the saved size, and says so, when the text cannot be measured reliably', async () => {
		const source = (font: string) =>
			fixture({
				pages: [
					{
						id: '0',
						contents: `<Shapes>${shape(
							'1',
							len('Width', 1.5) +
								len('Height', 0.5, 'TEXTHEIGHT(TheText,Width)') +
								style(font) +
								rectangle +
								'<Text>Process</Text>',
						)}</Shapes>`,
					},
				],
			});
		for (const [bytes, text] of [
			[await source('Wingdings'), FOX],
			[await source('Arial'), 'Zażółć gęślą jaźń'],
		] as const) {
			const saved = await editVsdx(bytes, [replace(text)]);
			expect(sizing(saved).map((item) => item.code)).toEqual(['edit-text-size-kept']);
			expect(sizing(saved)[0]!.message).toMatch(/keeps its saved size/);
			const model = (await parseVsdx(saved.bytes)).pages[0]!.shapes[0]!;
			expect(model.text.plainText).toBe(text);
			expect(model.height).toBe(0.5);
		}
	});

	it('does not stop edits of other shapes on the page', async () => {
		const bytes = await fixture({
			pages: [
				{
					id: '0',
					contents: `<Shapes>${box(len('Width', 1.5) + len('Height', 0.5, 'TEXTHEIGHT(TheText,Width)'))}${shape(
						'2',
						len('PinX', 6) +
							len('PinY', 6) +
							len('Width', 1) +
							len('Height', 1) +
							rectangle +
							'<Text>Other</Text>',
					)}</Shapes>`,
				},
			],
		});
		const saved = await editVsdx(bytes, [
			replace('Changed', '2'),
			{ type: 'move-shape', pageId: '0', shapeId: '2', x: 5, y: 5 },
		]);
		const model = (await parseVsdx(saved.bytes)).pages[0]!;
		expect(model.shapes[1]!.text.plainText).toBe('Changed');
		expect(model.shapes[0]!.height).toBe(0.5);
		expect(sizing(saved)).toEqual([]);
	});
});
