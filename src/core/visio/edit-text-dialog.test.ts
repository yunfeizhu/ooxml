import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { editVsdx, type VisioTextFormatEdit } from './edit';
import { parseVsdx } from './parser';
import { cell, fixture, shape, rectangle, section } from './test-fixtures';
import { snapshotEdits } from './ui/edit-commands';
import { copySnapshotScene } from './ui/snapshot-scene';
import { assertViewableDocument } from './ui/scene-validation';

const command = { type: 'format-text' as const, pageId: '0', shapeId: '1' };
const row = (name: string, cells = '') => section(name, `<Row IX="0">${cells}</Row>`);
const source = (extra = '', text = 'First\nSecond') =>
	fixture({
		pages: [
			{
				id: '0',
				contents: `<Shapes>${shape('1', cell('PinX', 3) + cell('PinY', 3) + cell('Width', 4) + cell('Height', 2) + rectangle + extra + `<Text>${text}</Text>`)}</Shapes>`,
			},
		],
	});
const parsed = async (bytes: Uint8Array) => (await parseVsdx(bytes)).pages[0]!.shapes[0]!;
const xml = async (bytes: Uint8Array) =>
	(await JSZip.loadAsync(bytes)).file('visio/pages/page1.xml')!.async('string');

describe('Text dialog formatting (Font, Character, Paragraph, Text Block, Bullets)', () => {
	it('round-trips character extras and keeps them through the scene snapshot', async () => {
		const patch: VisioTextFormatEdit = {
			...command,
			fontTransparency: 25,
			textCase: 'small-caps',
			textPosition: 'superscript',
			language: 1036,
			letterSpacing: 2,
		};
		const saved = await editVsdx(await source(row('Character', cell('Style', 1))), [patch]);
		const text = (await parsed(saved.bytes)).text;
		expect(text.runs[0]).toMatchObject({
			bold: true,
			textCase: 'small-caps',
			position: 'superscript',
			language: 1036,
		});
		expect(text.runs[0]!.letterSpacing).toBeCloseTo(2 / 72);
		expect(text.runs[0]!.opacity).toBeCloseTo(0.75, 2);
		const out = await xml(saved.bytes);
		expect(out).toContain('N="Letterspace" V="0.0277777778" U="PT"');
		expect(out).toContain('N="LangID" V="1036"');
		const document = await parseVsdx(saved.bytes);
		const scene = copySnapshotScene(document);
		assertViewableDocument(scene);
		expect(scene.pages[0]!.shapes[0]!.text.runs[0]!.position).toBe('superscript');
		const again = await editVsdx(saved.bytes, [patch]);
		expect(again.changedParts).toEqual([]);
	});

	it('writes paragraph spacing, line spacing kinds, indents and bullets', async () => {
		const exact = await editVsdx(await source(), [
			{
				...command,
				indentRight: 9,
				indentFirst: -18,
				spaceBefore: 6,
				spaceAfter: 12,
				lineSpacing: { kind: 'exact', value: 18 },
				bulletStyle: 3,
				bulletText: '★',
			},
		]);
		const paragraph = (await parsed(exact.bytes)).text.paragraphs![0]!;
		expect(paragraph).toMatchObject({
			indentRight: 0.125,
			indentFirst: -0.25,
			lineSpacing: { kind: 'exact', value: 0.25 },
			bullet: { text: '★' },
		});
		expect(paragraph.spaceAfter).toBeCloseTo(12 / 72);
		expect(paragraph.spaceBefore).toBeCloseTo(6 / 72);
		expect(await xml(exact.bytes)).toContain('N="BulletStr" V="★" F="&quot;★&quot;"');
		const multiple = await editVsdx(exact.bytes, [
			{ ...command, lineSpacing: { kind: 'multiple', value: 1.5 } },
		]);
		expect((await parsed(multiple.bytes)).text.paragraphs![0]!.lineSpacing).toEqual({
			kind: 'multiple',
			value: 1.5,
		});
		expect(await xml(multiple.bytes)).toMatch(/N="SpLine" V="-1.5"\/>/);
	});

	it('writes margins and a text background, and clears the background', async () => {
		const saved = await editVsdx(await source(), [
			{
				...command,
				margins: { left: 9, top: 3 },
				textBackground: '#FFEE00',
				textBackgroundTransparency: 40,
				verticalAlign: 'top',
			},
		]);
		const text = (await parsed(saved.bytes)).text;
		expect(text.margins.left).toBe(0.125);
		expect(text.margins.top).toBeCloseTo(3 / 72);
		expect(text.margins.right).toBe(0.04);
		expect(text).toMatchObject({ backgroundColor: '#ffee00', verticalAlign: 'top' });
		expect(text.backgroundOpacity).toBeCloseTo(0.6);
		expect(await xml(saved.bytes)).toContain('N="TextBkgnd" V="#ffee00" F="RGB(255,238,0)+1"');
		const cleared = await editVsdx(saved.bytes, [{ ...command, textBackground: 'none' }]);
		expect((await parsed(cleared.bytes)).text.backgroundColor).toBeUndefined();
	});

	it('moves, resizes and rotates the text block with proportional formulas that follow resizes', async () => {
		const saved = await editVsdx(await source(), [
			{ ...command, textBlock: { x: 0.25, y: 1.5, width: 0.5, height: 0.5, angle: Math.PI / 2 } },
		]);
		const text = (await parsed(saved.bytes)).text;
		expect(text.width).toBe(2);
		expect(text.height).toBe(1);
		const out = await xml(saved.bytes);
		expect(out).toContain('N="TxtPinX" V="1" U="IN" F="Width*0.25"');
		expect(out).toContain('N="TxtLocPinY" V="0.5" U="IN" F="TxtHeight*0.5"');
		expect(out).toContain('N="TxtAngle" V="1.5707963268" U="DEG"');
		const moved = await editVsdx(saved.bytes, [
			{ ...command, textBlock: { x: -0.25, y: 0.5, width: 1, height: 1, angle: 0 } },
		]);
		expect(await xml(moved.bytes)).toContain('F="Width*-0.25"');
		const resized = await editVsdx(saved.bytes, [
			{ type: 'resize-shape', pageId: '0', shapeId: '1', width: 8, height: 2 },
		]);
		const after = (await parsed(resized.bytes)).text;
		expect(after.width).toBe(4);
		expect(await xml(resized.bytes)).toContain('N="TxtPinX" V="2"');
	});

	it('refuses invalid dialog values and locked or master-linked text', async () => {
		for (const bad of [
			{ textCase: 'title' },
			{ textPosition: 'raised' },
			{ language: 1.5 },
			{ letterSpacing: 5000 },
			{ lineSpacing: { kind: 'multiple', value: 0 } },
			{ bulletText: 'ab' },
			{ margins: {} },
			{ textBackground: 'red' },
			{ textBlock: { x: 0, y: 0, width: 0, height: 1, angle: 0 } },
		])
			expect(() => snapshotEdits([{ ...command, ...bad } as VisioTextFormatEdit])).toThrow();
		const locked = await source(cell('LockTextEdit', 1));
		await expect(editVsdx(locked, [{ ...command, textCase: 'all-caps' }])).rejects.toThrow();
		// A stencil shape whose master cannot be found stays refused.
		const orphan = fixture({
			pages: [
				{ id: '0', contents: `<Shapes>${shape('1', '<Text>x</Text>', 'Master="2"')}</Shapes>` },
			],
		});
		await expect(
			editVsdx(await orphan, [
				{ ...command, textBlock: { x: 0.5, y: 0.5, width: 1, height: 1, angle: 0 } },
			]),
		).rejects.toThrow();
	});
});
