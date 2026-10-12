import { describe, expect, it } from 'vitest';
import { editVsdx, type VisioTextRangesEdit } from './edit';
import { parseVsdx } from './parser';
import { VisioPackage } from './package';
import { cell, fixture, shape, rectangle } from './test-fixtures';
import { snapshotEdits } from './ui/edit-commands';
import { snapshotTextRanges } from './edit-text-range-commands';

const chars =
	'<Section N="Character"><Row IX="0">' +
	cell('Style', 0) +
	'</Row><Row IX="1">' +
	cell('Style', 2) +
	'</Row></Section>';
const paras =
	'<Section N="Paragraph"><Row IX="0">' +
	cell('HorzAlign', 0) +
	'</Row><Row IX="1">' +
	cell('HorzAlign', 2) +
	'</Row></Section>';
const rich = '<cp IX="0"/><pp IX="0"/><tp IX="0"/>ab<cp IX="1"/>CD\n<cp IX="0"/><pp IX="1"/>EF\n';
const source = (text = rich, extra = '', attributes = '') =>
	fixture({
		pages: [
			{
				id: '0',
				contents: `<Shapes>${shape('1', cell('Width', 3) + cell('Height', 1) + rectangle + chars + paras + extra + `<Text>${text}</Text>`, attributes)}</Shapes>`,
			},
		],
		edit: (zip) => zip.file('custom/opaque.bin', new Uint8Array([0, 255])),
	});
const edit = (
	ranges: VisioTextRangesEdit['ranges'],
	expectedText = 'abCD\nEF',
): VisioTextRangesEdit => ({
	type: 'replace-text-ranges',
	pageId: '0',
	shapeId: '1',
	expectedText,
	ranges,
});
const characterStyles = (document: Awaited<ReturnType<typeof parseVsdx>>) =>
	document.pages[0]!.shapes[0]!.text.runs.flatMap((run) =>
		Array.from({ length: run.text.length }, () => run.italic),
	);

describe('source-preserving text range edits', () => {
	it('replaces across runs with first selected style and restores suffix style without row changes', async () => {
		const bytes = await source(),
			before = await VisioPackage.open(bytes);
		const saved = await editVsdx(bytes, [edit([{ start: 1, end: 3, text: 'XYZ' }])]);
		const document = await parseVsdx(saved.bytes),
			after = await VisioPackage.open(saved.bytes);
		expect(document.pages[0]!.shapes[0]!.text.plainText).toBe('aXYZD\nEF');
		expect(characterStyles(document)).toEqual([
			false,
			false,
			false,
			false,
			true,
			true,
			false,
			false,
		]);
		const original = await before.readXml('visio/pages/page1.xml'),
			actual = await after.readXml('visio/pages/page1.xml');
		const sections = (root: Element) =>
			Array.from(root.getElementsByTagName('Section'))
				.filter((node) => ['Character', 'Paragraph'].includes(node.getAttribute('N')!))
				.map((node) => node.toString());
		expect(sections(actual)).toEqual(sections(original));
		for (const path of before.paths())
			if (!saved.changedParts.includes(path))
				expect(await after.readBytes(path)).toEqual(await before.readBytes(path));
	});
	it('applies adjacent and separated original ranges as one final token plan', async () => {
		const saved = await editVsdx(await source(), [
			edit([
				{ start: 0, end: 1, text: '$&' },
				{ start: 1, end: 2, text: '' },
				{ start: 2, end: 3, text: 'X' },
				{ start: 5, end: 6, text: 'Z' },
			]),
		]);
		const document = await parseVsdx(saved.bytes);
		expect(document.pages[0]!.shapes[0]!.text.plainText).toBe('$&XD\nZF');
		expect(characterStyles(document).slice(0, 4)).toEqual([false, false, true, true]);
		expect(document.pages[0]!.shapes[0]!.text.paragraphs?.[1]!.horizontalAlign).toBe('right');
	});
	it('preserves unmatched CDATA, marker attributes and opaque payload', async () => {
		const bytes = await source(
			'<cp IX="0" custom="keep"/><pp IX="0"/><tp IX="0"/><![CDATA[ab]]><cp IX="1"/>CD\n<cp IX="0"/><pp IX="1"/>EF\n',
			'<Unknown payload="keep"/>',
		);
		const saved = await editVsdx(bytes, [edit([{ start: 2, end: 3, text: 'X' }])]);
		const xml = new TextDecoder().decode(
			await (await VisioPackage.open(saved.bytes)).readBytes('visio/pages/page1.xml'),
		);
		expect(xml).toContain('<![CDATA[ab]]>');
		expect(xml).toContain('custom="keep"');
		expect(xml).toContain('<Unknown payload="keep"/>');
	});
	it('keeps no-op bytes exact and owns range payloads before await', async () => {
		const bytes = await source(),
			command = edit([{ start: 1, end: 2, text: 'b' }]);
		expect((await editVsdx(bytes, [command])).bytes).toEqual(bytes);
		const next = edit([{ start: 1, end: 2, text: 'X' }]);
		const pending = editVsdx(bytes, [next]);
		next.ranges[0]!.text = 'wrong';
		next.expectedText = 'wrong';
		expect((await parseVsdx((await pending).bytes)).pages[0]!.shapes[0]!.text.plainText).toBe(
			'aXCD\nEF',
		);
	});
	it('supports Unicode scalar spans and plain complete deletion', async () => {
		const bytes = await source('😀a\n');
		const saved = await editVsdx(bytes, [edit([{ start: 0, end: 2, text: 'X' }], '😀a')]);
		expect((await parseVsdx(saved.bytes)).pages[0]!.shapes[0]!.text.plainText).toBe('Xa');
		const empty = await editVsdx(bytes, [edit([{ start: 0, end: 3, text: '' }], '😀a')]);
		expect((await parseVsdx(empty.bytes)).pages[0]!.shapes[0]!.text.plainText).toBe('');
	});
	it.each([
		cell('LockTextEdit', 1),
		'<Section N="User"><Row N="Dependent">' +
			cell('Value', 1, 'SHAPETEXT(TheText)') +
			'</Row></Section>',
	])('refuses protected/dependency source %# atomically', async (extra) => {
		const bytes = await source(rich, extra),
			before = bytes.slice();
		await expect(editVsdx(bytes, [edit([{ start: 1, end: 2, text: 'X' }])])).rejects.toThrow();
		expect(bytes).toEqual(before);
	});
	it.each([
		['<cp IX="8"/>abCD\nEF\n', ''],
		['<Unknown/>abCD\nEF\n', ''],
		['ab<fld IX="0">CD</fld>\nEF\n', ''],
		[rich, 'Del="1"'],
		[rich, 'Master="0"'],
	])('refuses unsupported source markup/identity %#', async (text, attributes) => {
		await expect(
			editVsdx(await source(text, '', attributes), [edit([{ start: 1, end: 2, text: 'X' }])]),
		).rejects.toThrow();
	});
	it('rejects stale complete text and complete rich deletion without guessing future insertion style', async () => {
		await expect(
			editVsdx(await source(), [edit([{ start: 1, end: 2, text: 'X' }], 'xxCD\nEF')]),
		).rejects.toThrow(/Original text/);
		await expect(
			editVsdx(await source('<cp IX="0"/>ab<cp IX="1"/>CD\n'), [
				edit([{ start: 0, end: 4, text: '' }], 'abCD'),
			]),
		).rejects.toThrow(/Deleting all rich/);
	});
	it.each([
		[{ start: 0, end: 4, text: '' }],
		[
			{ start: 0, end: 2, text: '' },
			{ start: 2, end: 4, text: '' },
		],
		[{ start: 5, end: 7, text: '' }],
	])(
		'refuses cumulative complete rich paragraph-body deletion %# atomically',
		async (...ranges) => {
			const bytes = await source(),
				before = bytes.slice();
			await expect(editVsdx(bytes, [edit(ranges)])).rejects.toThrow(/entire rich paragraph body/);
			expect(bytes).toEqual(before);
		},
	);
	it.each([
		'<cp IX="0"/><pp IX="0"/>a<pp IX="1"/>bCD\nEF\n',
		'<cp IX="0"/><pp IX="0"/><tp IX="1"/>abCD\nEF\n',
	])('refuses misplaced paragraph or unsupported tab markers %#', async (text) => {
		await expect(
			editVsdx(await source(text), [edit([{ start: 1, end: 2, text: 'X' }])]),
		).rejects.toThrow();
	});
	it('refuses complete run consumption that native normalizes differently from preserved markers', async () => {
		const bytes = await source('<cp IX="0"/><pp IX="0"/>ab<cp IX="1"/>CD<cp IX="0"/>\nEF\n');
		await expect(editVsdx(bytes, [edit([{ start: 2, end: 4, text: '' }])])).rejects.toThrow(
			/complete character runs/,
		);
		await expect(editVsdx(bytes, [edit([{ start: 1, end: 4, text: 'XYZ' }])])).rejects.toThrow(
			/complete character runs/,
		);
	});
});

describe('text range snapshots', () => {
	it.each([
		[[{ start: 0, end: 1, text: '\n' }], 'paragraph'],
		[[{ start: 4, end: 6, text: 'X' }], 'paragraph'],
		[[{ start: 1, end: 1, text: 'X' }], 'range'],
		[
			[
				{ start: 2, end: 3, text: 'X' },
				{ start: 1, end: 2, text: 'Y' },
			],
			'range',
		],
		[
			[
				{ start: 1, end: 3, text: 'X' },
				{ start: 2, end: 4, text: 'Y' },
			],
			'range',
		],
		[[{ start: 0, end: 99, text: 'X' }], 'range'],
		[[{ start: 0, end: 1, text: '\ud800' }], 'XML'],
	])('rejects malformed, overlapping and paragraph-changing ranges %#', (ranges, message) => {
		expect(() => snapshotTextRanges(edit(ranges as VisioTextRangesEdit['ranges']))).toThrow(
			new RegExp(message, 'i'),
		);
	});
	it('rejects scalar splitting, unbounded count/output and strips host payloads', () => {
		expect(() => snapshotTextRanges(edit([{ start: 0, end: 1, text: 'X' }], '😀a'))).toThrow(
			/scalar/,
		);
		expect(() =>
			snapshotTextRanges(
				edit(Array.from({ length: 10001 }, () => ({ start: 0, end: 1, text: 'X' }))),
			),
		).toThrow();
		expect(() =>
			snapshotTextRanges(edit([{ start: 0, end: 1, text: 'X'.repeat(1_000_001) }], 'a')),
		).toThrow(/limit/);
		const command = { ...edit([{ start: 1, end: 2, text: 'X' }]), host: {} };
		expect(snapshotEdits([command])).toEqual([edit([{ start: 1, end: 2, text: 'X' }])]);
	});
});
