import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { editVsdx, type VisioEdit } from './edit';
import { parseVsdx } from './parser';
import { cell, fixture, relation, relations, shape, rectangle } from './test-fixtures';

const target = { pageId: '0', shapeId: '1' };
const field = (formula: string, extra: Partial<VisioEdit> = {}): VisioEdit =>
	({ type: 'insert-text-field', ...target, formula, ...extra }) as VisioEdit;
const body = (text: string | null, extra = '') =>
	shape(
		'1',
		cell('PinX', 3) +
			cell('PinY', 3) +
			cell('Width', 4) +
			cell('Height', 2) +
			extra +
			rectangle +
			(text === null ? '' : `<Text>${text}</Text>`),
	);
const source = (text: string | null = 'Hello ', extra = '', core = '') =>
	fixture({
		pages: [
			{ id: '0', contents: `<Shapes>${body(text, extra)}</Shapes>` },
			{ id: '1', contents: '<Shapes/>' },
		],
		edit: (zip) => {
			if (!core) return;
			zip.file(
				'_rels/.rels',
				relations(
					relation('rId1', 'document', 'visio/document.xml') +
						`<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>`,
				),
			);
			zip.file(
				'docProps/core.xml',
				`<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">${core}</cp:coreProperties>`,
			);
		},
	});
const text = async (bytes: Uint8Array) => (await parseVsdx(bytes)).pages[0]!.shapes[0]!.text;
const xml = async (bytes: Uint8Array) =>
	(await JSZip.loadAsync(bytes)).file('visio/pages/page1.xml')!.async('string');

describe('insert-text-field', () => {
	it('appends an evaluated page-name field with a Field row and keeps it as one span', async () => {
		const saved = await editVsdx(await source(), [field('PAGENAME()')]);
		const out = await xml(saved.bytes);
		expect(out).toContain('<fld IX="0">Page 1</fld>');
		expect(out).toContain(
			'<Section N="Field"><Row IX="0"><Cell N="Value" V="Page 1" U="STR" F="PAGENAME()"/><Cell N="Type" V="0"/></Row></Section>',
		);
		const parsed = await text(saved.bytes);
		expect(parsed.plainText).toBe('Hello Page 1');
		expect(parsed.fields).toEqual([{ start: 6, end: 12, cached: 'Page 1', formula: 'PAGENAME()' }]);
	});

	it('evaluates page number and count, document properties and dates', async () => {
		const saved = await editVsdx(await source('', '', '<dc:title>Plan</dc:title>'), [
			field('PAGENUMBER()'),
			field('PAGECOUNT()'),
			field('TITLE()'),
			field('CREATOR()'),
			field('NOW()', { format: '{{yyyy}}' }),
		]);
		const parsed = await text(saved.bytes);
		expect(parsed.plainText).toBe(`12Plan${new Date().getFullYear()}`);
		expect(parsed.fields).toHaveLength(5);
		expect(await xml(saved.bytes)).toMatch(/N="Value" V="\d+\.\d+" U="DATE" F="NOW\(\)"/);
	});

	it('inserts a geometry field at an offset and follows later resizes', async () => {
		const saved = await editVsdx(await source('Hello'), [
			field('Width', { format: '0.00 u', offset: 0, expectedText: 'Hello' }),
		]);
		expect((await text(saved.bytes)).plainText).toBe('4.00 in.Hello');
		const resized = await editVsdx(saved.bytes, [
			{ type: 'resize-shape', ...target, width: 6, height: 2 },
		]);
		expect((await text(resized.bytes)).plainText).toBe('6.00 in.Hello');
	});

	it('creates the Text element for a shape without text and keeps other edits working', async () => {
		const saved = await editVsdx(await source(null), [field('Height', { format: '0 u' })]);
		expect((await text(saved.bytes)).plainText).toBe('2 in.');
		const moved = await editVsdx(saved.bytes, [{ type: 'move-shape', ...target, x: 1, y: 1 }]);
		expect(moved.changedParts).toEqual(['visio/pages/page1.xml']);
	});

	it('edits text around a field atomically and refuses edits that touch it', async () => {
		const saved = await editVsdx(await source('Hello world'), [
			field('PAGENAME()', { offset: 6, expectedText: 'Hello world' }),
		]);
		const parsed = await text(saved.bytes);
		expect(parsed.plainText).toBe('Hello Page 1world');
		const edited = await editVsdx(saved.bytes, [
			{
				type: 'replace-text-ranges',
				...target,
				expectedText: 'Hello Page 1world',
				ranges: [
					{ start: 0, end: 5, text: 'Hi' },
					{ start: 12, end: 17, text: ' there' },
				],
			},
		]);
		expect(await xml(edited.bytes)).toContain('<Text>Hi <fld IX="0">Page 1</fld> there</Text>');
		await expect(
			editVsdx(saved.bytes, [
				{
					type: 'replace-text-ranges',
					...target,
					expectedText: 'Hello Page 1world',
					ranges: [{ start: 5, end: 8, text: '' }],
				},
			]),
		).rejects.toThrow(/atomic/);
		await expect(
			editVsdx(saved.bytes, [{ type: 'replace-plain-text', ...target, text: 'x' }]),
		).rejects.toThrow(/fields/);
	});

	it('refuses dynamic, invalid, foreign and unevaluable formulas, stale offsets and locks', async () => {
		const bytes = await source();
		for (const formula of ['INDIRECT("x")', 'Width +', 'Sheet.5!Width', 'FOO()'])
			await expect(editVsdx(bytes, [field(formula)])).rejects.toThrow();
		await expect(editVsdx(bytes, [field('TITLE()', { format: '0.00' })])).rejects.toThrow(/format/);
		await expect(
			editVsdx(bytes, [field('PAGENAME()', { offset: 1, expectedText: 'Changed' })]),
		).rejects.toThrow(/changed/);
		const nested = await editVsdx(bytes, [field('PAGENAME()')]);
		await expect(
			editVsdx(nested.bytes, [field('PAGENAME()', { offset: 8, expectedText: 'Hello Page 1' })]),
		).rejects.toThrow(/inside another field/);
		await expect(
			editVsdx(await source('x', cell('LockTextEdit', 1)), [field('PAGENAME()')]),
		).rejects.toThrow();
	});
});
