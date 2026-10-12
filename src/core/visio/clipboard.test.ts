import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import {
	captureVisioClipboard,
	serializeVisioClipboard,
	deserializeVisioClipboard,
	VISIO_CLIPBOARD_MAGIC,
	VISIO_CLIPBOARD_MAX_CHARS,
} from './clipboard';
import { editVsdx } from './edit';
import { parseVsdx } from './parser';
import { cell, fixture, shape, rectangle, section } from './test-fixtures';
import { visioPasteCommand, visioClipboardShape } from './ui/shape-clipboard';
import type { VisioClipboardSnapshot } from './clipboard-types';

const local = (id: string, text: string, extra = '', attrs = '') =>
	shape(
		id,
		cell('PinX', 2) +
			cell('PinY', 3) +
			cell('Width', 2) +
			cell('Height', 1) +
			rectangle +
			`<Text>${text}</Text>${extra}`,
		attrs,
	);
const source = (
	shapes = local('1', 'Original', '<Unknown Keep="yes"/>', 'NameU="Copy.47" UniqueID="{guid}"'),
	document = '',
	pageCells = '',
) =>
	fixture({
		document,
		pages: [{ id: '0', contents: `<Shapes>${shapes}</Shapes>`, pageCells }],
		edit: (zip) => zip.file('opaque/private.bin', new Uint8Array([0, 255, 42])),
	});
const paste = async (
	bytes: Uint8Array,
	clipboard: VisioClipboardSnapshot,
	offset?: { x: number; y: number },
) => {
	const page = (await parseVsdx(bytes)).pages[0]!;
	return editVsdx(bytes, [visioPasteCommand(page, clipboard, offset)!]);
};
const read = async (bytes: Uint8Array) => (await parseVsdx(bytes)).pages[0]!.shapes;
const xml = async (bytes: Uint8Array) =>
	(await JSZip.loadAsync(bytes)).file('visio/pages/page1.xml')!.async('string');

describe('source XML clipboard capture and paste', () => {
	it('roundtrips canonical text with source stacking and reverse primary selection order', async () => {
		const bytes = await source(local('1', 'Alpha') + local('2', 'Beta'));
		const snapshot = await captureVisioClipboard(bytes, '0', ['2', '1']);
		expect(snapshot.shapes.map((shape) => shape.shapeId)).toEqual(['1', '2']);
		expect(snapshot.selectionIds).toEqual(['2', '1']);
		const text = serializeVisioClipboard(snapshot);
		expect(text.startsWith(VISIO_CLIPBOARD_MAGIC)).toBe(true);
		expect(serializeVisioClipboard(deserializeVisioClipboard(text))).toBe(text);
		const command = visioPasteCommand((await parseVsdx(bytes)).pages[0]!, snapshot)!;
		expect(command.copies).toEqual([
			{ shapeId: '2', newShapeId: '4' },
			{ shapeId: '1', newShapeId: '3' },
		]);
		const saved = await editVsdx(bytes, [command]);
		expect((await read(saved.bytes)).map((shape) => [shape.id, shape.text.plainText])).toEqual([
			['1', 'Alpha'],
			['2', 'Beta'],
			['3', 'Alpha'],
			['4', 'Beta'],
		]);
		expect(saved.diagnostics.some((item) => item.code === 'edit-paste-experimental')).toBe(true);
	});
	it('pastes captured old content after the original is edited, preserving opaque parts and unknown shape markup', async () => {
		const bytes = await source(),
			snapshot = await captureVisioClipboard(bytes, '0', ['1']);
		expect(JSON.stringify(snapshot)).not.toContain('private.bin');
		const changed = await editVsdx(bytes, [
			{ type: 'replace-plain-text', pageId: '0', shapeId: '1', text: 'Changed' },
		]);
		const saved = await paste(changed.bytes, snapshot);
		expect((await read(saved.bytes)).map((shape) => shape.text.plainText)).toEqual([
			'Changed',
			'Original',
		]);
		const content = await xml(saved.bytes);
		expect(content).toContain('NameU="Copy.2"');
		expect(content.match(/Keep="yes"/g)).toHaveLength(2);
		expect(content.match(/UniqueID=/g)).toHaveLength(1);
		const before = await JSZip.loadAsync(changed.bytes),
			after = await JSZip.loadAsync(saved.bytes);
		for (const [path, entry] of Object.entries(before.files))
			if (!entry.dir && !saved.changedParts.includes(path))
				expect(await after.file(path)!.async('uint8array')).toEqual(
					await entry.async('uint8array'),
				);
	});
	it('pastes after cut removes originals, retaining rich runs and static field markers', async () => {
		const rows =
			section(
				'Character',
				`<Row IX="0">${cell('Style', 2)}</Row><Row IX="1">${cell('Style', 1)}</Row>`,
			) + section('Field', `<Row IX="0">${cell('Value', 2, '1+1')}</Row>`);
		const bytes = await source(local('1', '<cp IX="0"/>A<cp IX="1"/>B<fld IX="0">2</fld>', rows));
		const snapshot = await captureVisioClipboard(bytes, '0', ['1']);
		const cut = await editVsdx(bytes, [{ type: 'delete-shape', pageId: '0', shapeId: '1' }]);
		const saved = await paste(cut.bytes, snapshot, { x: 0, y: 0 });
		expect((await read(saved.bytes))[0]!.text).toEqual((await read(bytes))[0]!.text);
		expect(await xml(saved.bytes)).toContain('<fld IX="0">2</fld>');
	});
	it('owns source bytes and selected IDs before asynchronous reads', async () => {
		const bytes = await source(local('1', 'Alpha') + local('2', 'Beta')),
			ids = ['1'];
		const pending = captureVisioClipboard(bytes, '0', ids);
		bytes.fill(0);
		ids[0] = '2';
		const snapshot = await pending;
		expect(snapshot.selectionIds).toEqual(['1']);
		expect(snapshot.shapes[0]!.xml).toContain('Alpha');
	});
	it('owns paste payloads before asynchronous reads', async () => {
		const bytes = await source(),
			clipboard = await captureVisioClipboard(bytes, '0', ['1']);
		const command = visioPasteCommand((await parseVsdx(bytes)).pages[0]!, clipboard)!;
		const pending = editVsdx(bytes, [command]);
		(command.clipboard.shapes[0] as { xml: string }).xml = '<bad/>';
		(command.copies[0] as { newShapeId: string }).newShapeId = '999';
		const saved = await pending;
		expect((await read(saved.bytes)).map((shape) => shape.id)).toEqual(['1', '2']);
	});
	it('remaps selected static references in detached copies and recalculates supported numeric caches', async () => {
		const link = section(
			'User',
			'<Row N="Link"><Cell N="Value" V="2" U="DL" F="Sheet.2!PinX"/></Row>',
		);
		const bytes = await source(local('1', 'Alpha', link) + local('2', 'Beta'));
		const saved = await paste(bytes, await captureVisioClipboard(bytes, '0', ['2', '1']));
		expect(await xml(saved.bytes)).toContain('F="Sheet.4!PinX"');
		expect(await xml(saved.bytes)).toContain('V="2.33" U="DL" F="Sheet.4!PinX"');
	});
	it('refuses uncaptured shape references instead of rebinding them in the target', async () => {
		const link = section(
			'User',
			'<Row N="Link"><Cell N="Value" V="2" U="DL" F="Sheet.2!PinX"/></Row>',
		);
		await expect(
			captureVisioClipboard(await source(local('1', 'Alpha', link) + local('2', 'Beta')), '0', [
				'1',
			]),
		).rejects.toMatchObject({ code: 'UNSUPPORTED_CLIPBOARD' });
	});
	it.each(['StyleSheets', 'FaceNames'])(
		'refuses changed actual %s definitions without mutating target bytes',
		async (kind) => {
			const definitions =
				'<StyleSheets><StyleSheet ID="0"/></StyleSheets><FaceNames><FaceName ID="0" Name="Arial"/></FaceNames>';
			const bytes = await source(undefined, definitions),
				clipboard = await captureVisioClipboard(bytes, '0', ['1']);
			const target = await source(
				undefined,
				kind === 'StyleSheets'
					? definitions.replace('ID="0"/>', 'ID="1"/>')
					: definitions.replace('Arial', 'Calibri'),
			);
			const before = target.slice();
			await expect(paste(target, clipboard)).rejects.toMatchObject({
				code: 'CLIPBOARD_RESOURCE_MISMATCH',
			});
			expect(target).toEqual(before);
		},
	);
	it('rejects missing resource proofs and actual dangling style/font references despite compatible resource XML', async () => {
		const bytes = await source(),
			clipboard = await captureVisioClipboard(bytes, '0', ['1']);
		for (const marker of ['TextStyle="999"', '']) {
			const changed = {
				...clipboard,
				shapes: [
					{
						shapeId: '1',
						xml: clipboard.shapes[0]!.xml.replace('<Shape ', `<Shape ${marker} `).replace(
							'</Shape>',
							marker
								? '</Shape>'
								: '<Section N="Character"><Row IX="0"><Cell N="Font" V="Absent"/></Row></Section></Shape>',
						),
					},
				],
			};
			await expect(paste(bytes, changed)).rejects.toMatchObject({ code: 'UNSUPPORTED_CLIPBOARD' });
		}
		await expect(
			paste(bytes, { ...clipboard, resources: clipboard.resources.slice(1) }),
		).rejects.toMatchObject({ code: 'CLIPBOARD_RESOURCE_MISMATCH' });
	});
	it('refuses changed PageSheet context and scale, while zero-offset paste is explicit', async () => {
		const bytes = await source(),
			clipboard = await captureVisioClipboard(bytes, '0', ['1']);
		await expect(
			paste(await source(undefined, '', cell('PageLeftMargin', 1)), clipboard),
		).rejects.toMatchObject({ code: 'CLIPBOARD_CONTEXT_MISMATCH' });
		const scaled = (await parseVsdx(await source(undefined, '', cell('DrawingScale', 2))))
			.pages[0]!;
		expect(visioPasteCommand(scaled, clipboard)).toBeUndefined();
		const saved = await paste(bytes, clipboard, { x: 0, y: 0 });
		expect((await read(saved.bytes))[1]!.transform).toEqual((await read(bytes))[0]!.transform);
	});
	it.each([
		'<!DOCTYPE Shape [<!ENTITY x "bad">]><Shape/>',
		'<Shape><Bad></Shape>',
		'<Shape xmlns="urn:wrong" ID="1"/>',
		'<Shape xmlns="http://schemas.microsoft.com/office/visio/2012/main" ID="2"/>',
	])('rejects hostile XML %s atomically', async (xml) => {
		const bytes = await source(),
			before = bytes.slice(),
			snapshot = await captureVisioClipboard(bytes, '0', ['1']);
		await expect(
			paste(bytes, { ...snapshot, shapes: [{ shapeId: '1', xml }] }),
		).rejects.toBeInstanceOf(Error);
		expect(bytes).toEqual(before);
	});
	it('rejects relationship-bearing unknown payloads rather than binding target package links', async () => {
		const bytes = await source(local('1', 'A', '<Unknown r:id="rId4"/>'));
		await expect(captureVisioClipboard(bytes, '0', ['1'])).rejects.toMatchObject({
			code: 'UNSUPPORTED_CLIPBOARD',
		});
	});
	it.each([
		'native clipboard plain text',
		VISIO_CLIPBOARD_MAGIC + '{bad}',
		VISIO_CLIPBOARD_MAGIC + '{"format":"ooxml.visio-shapes","version":2}',
		'x'.repeat(VISIO_CLIPBOARD_MAX_CHARS + 1),
	])('rejects invalid text payload', (text) =>
		expect(() => deserializeVisioClipboard(text)).toThrow(),
	);
	it('rejects duplicate mappings and oversized XML before DOM construction', async () => {
		const snapshot = await captureVisioClipboard(await source(), '0', ['1']);
		expect(() => serializeVisioClipboard({ ...snapshot, selectionIds: ['1', '1'] })).toThrow();
		expect(() =>
			serializeVisioClipboard({
				...snapshot,
				shapes: [{ shapeId: '1', xml: 'x'.repeat(VISIO_CLIPBOARD_MAX_CHARS + 1) }],
			}),
		).toThrow();
	});
	it('coarse helper takes stencil shapes and excludes lines and shapes glued to another', async () => {
		const page = (
			await parseVsdx(
				await source(local('1', 'A', '', 'Master="1"') + local('2', 'B', cell('OneD', 1))),
			)
		).pages[0]!;
		// A stencil shape is copied as an instance; a connector glued to it stays behind.
		expect(visioClipboardShape(page, '1')).toBe(page.shapes[0]);
		page.connectors = [{ fromShapeId: '9', toShapeId: '1', fromCell: 'BeginX', toCell: 'PinX' }];
		expect(visioClipboardShape(page, '1')).toBe(page.shapes[0]);
		page.connectors = [{ fromShapeId: '1', toShapeId: '9', fromCell: 'BeginX', toCell: 'PinX' }];
		expect(visioClipboardShape(page, '1')).toBeUndefined();
		expect(visioClipboardShape(page, '2')).toBeUndefined();
	});
});
