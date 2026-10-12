import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { editVsdx } from './edit';
import { parseVsdx } from './parser';
import { cell, fixture, rectangle, shape } from './test-fixtures';

const PAGE = 'visio/pages/page1.xml';
const MASTER = 'visio/masters/master1.xml';
const size = cell('Width', 2) + cell('Height', 1, 'User.ResizeTxtHeight');
/** A stencil master whose height follows its text, as Visio's flowchart masters do. */
const master = (extra = '') =>
	shape(
		'5',
		size +
			`<Section N="User"><Row N="ResizeTxtHeight">${cell('Value', 1, 'MAX(1,TEXTHEIGHT(TheText,TxtWidth))')}</Row></Section>` +
			rectangle +
			extra,
	);
const instance = (contents = '') =>
	shape('1', cell('PinX', 2) + cell('PinY', 6) + contents, 'Type="Shape" Master="2"');
const source = (page: string, definition = master()) =>
	fixture({
		masters: [{ id: '2', shapes: definition }],
		pages: [{ id: '0', contents: `<Shapes>${page}</Shapes>` }],
	});
const part = async (bytes: Uint8Array, path: string) =>
	(await JSZip.loadAsync(bytes)).file(path)!.async('string');
const type = (bytes: Uint8Array, text: string, shapeId = '1') =>
	editVsdx(bytes, [{ type: 'replace-plain-text', pageId: '0', shapeId, text }]);

describe('text of stencil (master) instances', () => {
	it('writes a local Text element and nothing else, as Visio does', async () => {
		const bytes = await source(instance());
		const saved = await type(bytes, 'Typed on an instance');
		expect(saved.changedParts).toEqual([PAGE]);
		const page = await part(saved.bytes, PAGE);
		// The instance keeps its cells and gains the text after them; no size cell is written.
		expect(page).toMatch(/<Cell N="PinY" V="6"\/><Text>Typed on an instance\n<\/Text><\/Shape>/);
		expect(page).not.toMatch(/N="Height"/);
		expect(await part(saved.bytes, MASTER)).toBe(await part(bytes, MASTER));
		const model = await parseVsdx(saved.bytes);
		expect(model.pages[0]!.shapes[0]!.text.plainText).toBe('Typed on an instance');
	});

	it('replaces an existing local text and skips unchanged or inherited text', async () => {
		const bytes = await source(instance('<Text>First\n</Text>'));
		const saved = await type(bytes, 'Second');
		const page = await part(saved.bytes, PAGE);
		expect(page.match(/<Text>/g)).toHaveLength(1);
		expect(page).toContain('<Text>Second\n</Text>');
		expect((await type(saved.bytes, 'Second')).changedParts).toEqual([]);
		// Typing the master's own text changes nothing.
		const inherited = await source(instance(), master('<Text>From the master\n</Text>'));
		expect((await type(inherited, 'From the master')).changedParts).toEqual([]);
		expect(await part((await type(inherited, 'Mine')).bytes, PAGE)).toContain(
			'<Text>Mine\n</Text>',
		);
	});

	it('edits a sub-shape of a group instance before its own sub-shapes', async () => {
		const group = shape(
			'5',
			size + `<Shapes>${shape('6', size + rectangle)}</Shapes>`,
			'Type="Group"',
		);
		const page = shape(
			'1',
			cell('PinX', 2) +
				`<Shapes>${shape('3', `<Shapes>${shape('4', '', 'MasterShape="6"')}</Shapes>`, 'MasterShape="6"')}</Shapes>`,
			'Type="Group" Master="2"',
		);
		const saved = await type(await source(page, group), 'Inside the group', '3');
		expect(await part(saved.bytes, PAGE)).toMatch(
			/<Shape ID="3" MasterShape="6"><Text>Inside the group\n<\/Text><Shapes>/,
		);
	});

	it('honours text protection from the master unless the instance overrides it', async () => {
		const locked = master(cell('LockTextEdit', 1));
		await expect(type(await source(instance(), locked), 'No')).rejects.toMatchObject({
			code: 'EDIT_PROTECTED_CELL',
		});
		const unlocked = await type(
			await source(instance(cell('LockTextEdit', 0)), locked),
			'Allowed here',
		);
		expect(await part(unlocked.bytes, PAGE)).toContain('<Text>Allowed here\n</Text>');
		await expect(type(await source(instance(cell('LockTextEdit', 1))), 'No')).rejects.toMatchObject(
			{ code: 'EDIT_PROTECTED_CELL' },
		);
	});

	it('types plain text over formatted master text, and marks inherited fields deleted', async () => {
		// Recorded from Visio 16: typing over bold master text saves a plain local Text.
		const rich = master('<Text><cp IX="0"/>Rich\n</Text>');
		const plain = await type(await source(instance(), rich), 'Plain');
		expect(await part(plain.bytes, PAGE)).toMatch(/<Cell N="PinY" V="6"\/><Text>Plain\n<\/Text>/);
		// Typing over a field deletes each inherited Field row locally, then writes the text.
		const field = master(
			`<Section N="Field"><Row IX="0">${cell('Value', 1)}</Row><Row IX="1">${cell('Value', 2)}</Row></Section><Text>Page <fld IX="0">1</fld> of <fld IX="1">2</fld>\n</Text>`,
		);
		const typed = await type(await source(instance(), field), 'No fields');
		expect(await part(typed.bytes, PAGE)).toMatch(
			/<Section N="Field"><Row IX="0" Del="1"\/><Row IX="1" Del="1"\/><\/Section><Text>No fields\n<\/Text><\/Shape>/,
		);
		expect((await parseVsdx(typed.bytes)).pages[0]!.shapes[0]!.text.plainText).toBe('No fields');
	});

	it('refuses unknown master markup, local formatted text and a missing master', async () => {
		const unknown = master('<Text><x:y xmlns:x="urn:x"/>Odd\n</Text>');
		await expect(type(await source(instance(), unknown), 'Plain')).rejects.toMatchObject({
			code: 'UNSUPPORTED_TEXT_EDIT',
		});
		const local = instance('<Text><cp IX="0"/>Mine\n</Text>');
		await expect(type(await source(local), 'Plain')).rejects.toMatchObject({
			code: 'UNSUPPORTED_TEXT_EDIT',
		});
		const orphan = await fixture({
			masters: [{ id: '9', shapes: master() }],
			pages: [{ id: '0', contents: `<Shapes>${instance()}</Shapes>` }],
		});
		await expect(type(orphan, 'Plain')).rejects.toMatchObject({ code: 'UNSUPPORTED_TEXT_EDIT' });
	});
});

describe('text ranges of stencil (master) instances', () => {
	const ranges = (
		bytes: Uint8Array,
		expectedText: string,
		start: number,
		end: number,
		text: string,
	) =>
		editVsdx(bytes, [
			{
				type: 'replace-text-ranges',
				pageId: '0',
				shapeId: '1',
				expectedText,
				ranges: [{ start, end, text }],
			},
		]);
	const field = master(
		`<Section N="Field"><Row IX="0">${cell('Value', 2)}</Row></Section><Text>Page <fld IX="0">2</fld>\n</Text>`,
	);

	it('edits around an inherited field in a local copy that keeps the marker', async () => {
		// Recorded from Visio 16: "Page" to "Sheet" saves <Text>Sheet <fld IX='0'>2</fld></Text>.
		const saved = await ranges(await source(instance(), field), 'Page 2', 0, 4, 'Sheet');
		const page = await part(saved.bytes, PAGE);
		expect(page).toMatch(/<Text>Sheet <fld IX="0">2<\/fld>\n<\/Text><\/Shape>/);
		expect(page).not.toMatch(/<Section N="Field"/);
		expect(await part(saved.bytes, MASTER)).toContain('<Text>Page <fld IX="0">2</fld>');
	});

	it('replaces part of inherited or local plain text and discards a copy that needs no change', async () => {
		const inherited = await source(instance(), master('<Text>Old label\n</Text>'));
		const saved = await ranges(inherited, 'Old label', 0, 3, 'New');
		expect(await part(saved.bytes, PAGE)).toContain('<Text>New label\n</Text>');
		const again = await ranges(saved.bytes, 'New label', 4, 9, 'title');
		expect(await part(again.bytes, PAGE)).toContain('<Text>New title\n</Text>');
		const same = await ranges(inherited, 'Old label', 0, 3, 'Old');
		expect(same.changedParts).toEqual([]);
	});

	it('honours the master text lock', async () => {
		const locked = master(cell('LockTextEdit', 1) + '<Text>Old label\n</Text>');
		await expect(
			ranges(await source(instance(), locked), 'Old label', 0, 3, 'New'),
		).rejects.toMatchObject({
			code: 'EDIT_PROTECTED_CELL',
		});
	});
});

// Optional: `scripts/record-visio-instance-text.ps1 -OutputDirectory <dir>` saves real stencil
// drops before and after Visio edits their text; each edit must write what Visio wrote.
const native = process.env.VISIO_NATIVE_INSTANCE_TEXT_DIR;
// An XML reader normalises the file's CRLF to a line feed, so compare shapes that way.
const nativeShape = (xml: string, id: string) =>
	new RegExp(`<Shape ID=["']${id}["'][^>]*>(.*?)</Shape>`, 's')
		.exec(xml)?.[1]
		?.replace(/\r\n/g, '\n')
		.replace(/>\s+</g, '><')
		.replace(/<Cell [^>]*\/>/g, '')
		.replaceAll("'", '"');
describe.skipIf(!native)('native Visio stencil-instance text', () => {
	const load = async (name: string) => new Uint8Array(await readFile(join(native!, name)));
	it('writes the Text element Visio writes for a dropped stencil shape', async () => {
		const saved = await type(await load('before.vsdx'), 'Typed on an instance', '1');
		expect(nativeShape(await part(saved.bytes, PAGE), '1')).toBe(
			nativeShape(await part(await load('after.vsdx'), PAGE), '1'),
		);
	});
	it('matches Visio over formatted master text, over a field and around a field', async () => {
		const before = await load('rich-before.vsdx');
		const after = await part(await load('rich-after.vsdx'), PAGE);
		const bold = await type(before, 'Typed over bold', '3');
		expect(nativeShape(await part(bold.bytes, PAGE), '3')).toBe(nativeShape(after, '3'));
		const over = await type(before, 'Typed over a field', '4');
		expect(nativeShape(await part(over.bytes, PAGE), '4')).toBe(nativeShape(after, '4'));
		const around = await editVsdx(before, [
			{
				type: 'replace-text-ranges',
				pageId: '0',
				shapeId: '5',
				expectedText: (await parseVsdx(before)).pages[0]!.shapes[2]!.text.plainText,
				ranges: [{ start: 0, end: 4, text: 'Sheet' }],
			},
		]);
		expect(nativeShape(await part(around.bytes, PAGE), '5')).toBe(nativeShape(after, '5'));
	});
});
