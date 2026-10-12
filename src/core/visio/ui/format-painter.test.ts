import { describe, expect, it } from 'vitest';
import { editVsdx } from '../edit';
import { parseVsdx } from '../parser';
import { cell, fixture, rectangle, section, shape } from '../test-fixtures';
import {
	VISIO_FORMAT_PAINTER_LIMITS,
	visioFormatPainterEdits,
	visioFormatPainterSnapshot,
} from './format-painter';

const fonts =
	'<FaceNames><FaceName ID="0" Name="Arial"/><FaceName ID="1" Name="Calibri"/></FaceNames>';
const size = cell('Width', 2) + cell('Height', 1) + rectangle;
const painted =
	size +
	cell('FillForegnd', '#ff0000', 'RGB(255,0,0)') +
	cell('FillPattern', 1) +
	cell('LineColor', '#0000ff', 'RGB(0,0,255)') +
	cell('LineWeight', 3 / 72) +
	cell('LinePattern', 2) +
	section(
		'Character',
		`<Row IX="0">${cell('Font', 1) + cell('Size', 18 / 72) + cell('Color', '#00ff00', 'RGB(0,255,0)') + cell('Style', 1)}</Row>`,
	) +
	section('Paragraph', `<Row IX="0">${cell('HorzAlign', 2)}</Row>`) +
	cell('VerticalAlign', 0) +
	'<Text>Source</Text>';
const plain = size + '<Text>Target</Text>';
const source = (target = plain) =>
	fixture({
		document: fonts,
		pages: [{ id: '0', contents: `<Shapes>${shape('1', painted) + shape('2', target)}</Shapes>` }],
	});

describe('Format Painter commands', () => {
	it('copies fill, line and text formatting as one atomic edit list', async () => {
		const bytes = await source();
		const document = await parseVsdx(bytes);
		const page = document.pages[0]!;
		const snapshot = visioFormatPainterSnapshot(document, page, '1')!;
		expect(snapshot.shape).toMatchObject({
			fillColor: '#ff0000',
			lineColor: '#0000ff',
			lineWeight: 3,
			linePattern: 2,
		});
		expect(snapshot.text).toMatchObject({
			fontFamily: 'Calibri',
			fontSize: 18,
			fontColor: '#00ff00',
			bold: true,
			italic: false,
			horizontalAlign: 'right',
			verticalAlign: 'top',
		});
		expect(snapshot.skipped).toEqual([]);
		const edits = visioFormatPainterEdits(page, snapshot, ['2'])!;
		expect(edits.map((edit) => edit.type)).toEqual(['format-shape', 'format-text']);
		const saved = await editVsdx(bytes, edits);
		const target = (await parseVsdx(saved.bytes)).pages[0]!.shapes[1]!;
		expect(target.style).toMatchObject({ fill: '#ff0000', lineColor: '#0000ff', linePattern: 2 });
		expect(target.style.lineWidth * 72).toBeCloseTo(3);
		expect(target.text.plainText).toBe('Target');
		expect(target.text.runs[0]).toMatchObject({
			fontFamily: 'Calibri',
			color: '#00ff00',
			bold: true,
		});
		expect(target.text.runs[0]!.fontSize * 72).toBeCloseTo(18);
		expect(target.text.paragraphs?.[0]?.horizontalAlign ?? target.text.horizontalAlign).toBe(
			'right',
		);
		expect(target.text.verticalAlign).toBe('top');
	});

	it('paints only fill and line onto a shape without text', async () => {
		const bytes = await source(size);
		const document = await parseVsdx(bytes);
		const page = document.pages[0]!;
		const edits = visioFormatPainterEdits(page, visioFormatPainterSnapshot(document, page, '1')!, [
			'2',
		])!;
		expect(edits.map((edit) => edit.type)).toEqual(['format-shape']);
		const saved = await editVsdx(bytes, edits);
		expect((await parseVsdx(saved.bytes)).pages[0]!.shapes[1]!.style.fill).toBe('#ff0000');
	});

	it('reports what cannot be copied and refuses ineligible targets', async () => {
		const bytes = await fixture({
			document: fonts,
			pages: [
				{
					id: '0',
					contents: `<Shapes>${shape('1', size + cell('EndArrow', 4) + '<Text>a</Text>') + shape('2', size + `<Shapes>${shape('3', size)}</Shapes>`, 'Type="Group"') + shape('4', size, 'Master="9"')}</Shapes>`,
				},
			],
		});
		const document = await parseVsdx(bytes);
		const page = document.pages[0]!;
		const snapshot = visioFormatPainterSnapshot(document, page, '1')!;
		expect(snapshot.skipped).toContain('arrowheads');
		expect(visioFormatPainterEdits(page, snapshot, ['2'])).toBeUndefined();
		// A stencil shape takes pasted formatting as local values over its master.
		expect(visioFormatPainterEdits(page, snapshot, ['4'])).toBeDefined();
		expect(visioFormatPainterEdits(page, snapshot, [])).toBeUndefined();
		expect(visioFormatPainterSnapshot(document, page, 'missing')).toBeUndefined();
		expect(VISIO_FORMAT_PAINTER_LIMITS).not.toContain('—');
	});
});
