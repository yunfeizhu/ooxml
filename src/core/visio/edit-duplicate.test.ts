import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { parseXml, buildXml } from '../xml/index';
import { editVsdx } from './edit';
import type { VisioDuplicateShapesEdit } from './edit-duplicate-commands';
import { snapshotDuplicateShapes } from './edit-duplicate-commands';
import { parseVsdx } from './parser';
import { attribute, children } from './sheet';
import { cell, fixture, shape, rectangle, section } from './test-fixtures';
import { visioDuplicateCommand } from './ui/shape-duplicate';

const local = (id: string, extra = '', attrs = '', pin = cell('PinX', 2)) =>
	shape(
		id,
		pin + cell('PinY', 3) + cell('Width', 2) + cell('Height', 1) + rectangle + extra,
		attrs,
	);
const source = (shapes: string, extra = '', document = '') =>
	fixture({
		document,
		pages: [{ id: '0', contents: `<Shapes>${shapes}</Shapes>${extra}` }],
		edit: (zip) => zip.file('unknown/preserved.bin', new Uint8Array([0, 7, 255])),
	});
const command = (copies = [{ shapeId: '1', newShapeId: '3' }]): VisioDuplicateShapesEdit => ({
	type: 'duplicate-shapes',
	pageId: '0',
	copies,
	offsetX: 0.33,
	offsetY: -0.33,
});
const nodes = async (bytes: Uint8Array, path = 'visio/pages/page1.xml') =>
	children(
		children(
			parseXml(await (await JSZip.loadAsync(bytes)).file(path)!.async('string')).documentElement,
			'Shapes',
		)[0],
		'Shape',
	);
const user = (name: string, value: number, formula: string) =>
	section(
		'User',
		`<Row N="${name}">${cell('Value', value, formula).replace('<Cell ', '<Cell U="DL" ')}</Row>`,
	);
const readUser = (node: Element, name: string) => {
	const row = children(
		children(node, 'Section').find((s) => attribute(s, 'N') === 'User'),
		'Row',
	).find((r) => attribute(r, 'N') === name)!;
	return children(row, 'Cell')[0]!;
};

describe('source-preserving shape duplication', () => {
	it.each(['Custom.3', 'CUSTOM.3'])(
		'uses the native default name when %s is occupied',
		async (name) => {
			const bytes = await source(
				local('1', '', 'NameU="Custom"') + local('2', '', `NameU="${name}"`),
			);
			expect(attribute((await nodes((await editVsdx(bytes, [command()])).bytes))[2], 'NameU')).toBe(
				'Sheet.3',
			);
		},
	);
	it('refuses an occupied fallback name atomically rather than inventing another identity', async () => {
		const bytes = await source(
			local('1', '', 'NameU="Custom"') +
				local('2', '', 'NameU="Custom.3"') +
				local('4', '', 'NameU="Sheet.3"'),
		);
		const before = bytes.slice();
		await expect(editVsdx(bytes, [command()])).rejects.toMatchObject({
			code: 'UNSUPPORTED_DUPLICATE',
		});
		expect(bytes).toEqual(before);
	});
	it('allocates IDs in source order while preserving reverse selection mapping and every unrelated payload', async () => {
		const bytes = await source(
			local(
				'1',
				'<Text><cp IX="0"/>Alpha</Text><Unknown foo="bar"/>',
				'NameU="Custom.47" UniqueID="{guid}"',
			) + local('2', '<Text>Beta</Text>', 'NameU="Sheet.2"'),
		);
		const before = bytes.slice();
		const page = (await parseVsdx(bytes)).pages[0]!;
		const edit = visioDuplicateCommand(page, ['2', '1'])!;
		expect(edit.copies).toEqual([
			{ shapeId: '2', newShapeId: '4' },
			{ shapeId: '1', newShapeId: '3' },
		]);
		const saved = await editVsdx(bytes, [edit]);
		const original = await nodes(bytes),
			result = await nodes(saved.bytes);
		expect(result.map((n) => attribute(n, 'ID'))).toEqual(['1', '2', '3', '4']);
		expect(result.slice(0, 2).map(buildXml)).toEqual(original.map(buildXml));
		expect(attribute(result[2], 'NameU')).toBe('Custom.3');
		expect(attribute(result[3], 'NameU')).toBe('Sheet.4');
		expect(attribute(result[2], 'UniqueID')).toBeUndefined();
		expect(children(result[2], 'Unknown')[0]!.getAttribute('foo')).toBe('bar');
		const reopened = (await parseVsdx(saved.bytes)).pages[0]!;
		expect(reopened.shapes.slice(2).map((s) => s.text.plainText)).toEqual(['Alpha', 'Beta']);
		expect(
			Number(
				attribute(
					children(result[2], 'Cell').find((n) => attribute(n, 'N') === 'PinX'),
					'V',
				),
			),
		).toBeCloseTo(2.33);
		const zipBefore = await JSZip.loadAsync(bytes),
			zipAfter = await JSZip.loadAsync(saved.bytes);
		for (const [path, entry] of Object.entries(zipBefore.files))
			if (!entry.dir && !saved.changedParts.includes(path))
				expect(await zipAfter.file(path)!.async('uint8array')).toEqual(
					await entry.async('uint8array'),
				);
		expect(bytes).toEqual(before);
	});
	it('remaps selected static references and recalculates copied pin-dependent caches', async () => {
		const combined = (user('Self', 2, 'Sheet.1!PinX') + user('Peer', 2, 'Sheet.2!PinX')).replace(
			'</Section><Section N="User" IX="0">',
			'',
		);
		const bytes = await source(local('1', combined) + local('2'));
		const saved = await editVsdx(bytes, [
			command([
				{ shapeId: '2', newShapeId: '4' },
				{ shapeId: '1', newShapeId: '3' },
			]),
		]);
		const result = (await nodes(saved.bytes))[2]!;
		expect(attribute(readUser(result, 'Self'), 'F')).toBe('Sheet.3!PinX');
		expect(attribute(readUser(result, 'Peer'), 'F')).toBe('Sheet.4!PinX');
		expect(Number(attribute(readUser(result, 'Self'), 'V'))).toBeCloseTo(2.33);
		expect(Number(attribute(readUser(result, 'Peer'), 'V'))).toBeCloseTo(2.33);
	});
	it('retains references to unselected shapes and does not mutate their caches', async () => {
		const bytes = await source(local('1', user('Peer', 2, 'Sheet.2!PinX')) + local('2'));
		const saved = await editVsdx(bytes, [command()]);
		expect(attribute(readUser((await nodes(saved.bytes))[2]!, 'Peer'), 'F')).toBe('Sheet.2!PinX');
		expect(attribute(readUser((await nodes(saved.bytes))[2]!, 'Peer'), 'V')).toBe('2');
	});
	it('preserves static text fields and quoted formula strings, but refuses dependent field display caches', async () => {
		const text = '<Text><cp IX="0"/>Value:<fld IX="0">2</fld></Text>';
		const field = (formula: string) =>
			section('Field', `<Row IX="0">${cell('Value', 2, formula)}</Row>`);
		const literal = section(
			'User',
			'<Row N="Quoted"><Cell N="Value" V="Sheet.1!PinX" F="&quot;Sheet.1!PinX&quot;"/></Row>',
		);
		const bytes = await source(local('1', text + field('1+1') + literal));
		const saved = await editVsdx(bytes, [command()]);
		const clone = (await nodes(saved.bytes))[1]!;
		expect(buildXml(children(clone, 'Text')[0]!)).toBe(
			buildXml(children((await nodes(bytes))[0], 'Text')[0]!),
		);
		expect(attribute(readUser(clone, 'Quoted'), 'F')).toBe('"Sheet.1!PinX"');
		const affected = await source(local('1', text + field('PinX/1 in'))),
			before = affected.slice();
		await expect(editVsdx(affected, [command()])).rejects.toMatchObject({
			code: 'UNSUPPORTED_DUPLICATE',
		});
		expect(affected).toEqual(before);
	});
	it('refuses inherited style formulas affected in a new copied sheet context', async () => {
		const document = `<StyleSheets><StyleSheet ID="0">${cell('LineWeight', 2, 'PinX')}</StyleSheet></StyleSheets>`;
		await expect(
			editVsdx(await source(local('1'), '', document), [command()]),
		).rejects.toMatchObject({ code: 'EDIT_UNSUPPORTED_PACKAGE_DEPENDENCY' });
	});
	it('ignores movement locks like native Duplicate, while preserving the copied locks', async () => {
		const bytes = await source(
			local('1', cell('LockMoveX', 1) + cell('LockMoveY', 1) + cell('LayerMember', '')),
		);
		const saved = await editVsdx(bytes, [command()]);
		expect(
			children((await nodes(saved.bytes))[1], 'Cell')
				.find((n) => attribute(n, 'N') === 'LockMoveX')!
				.getAttribute('V'),
		).toBe('1');
	});
	it('keeps zero-offset guarded pin formulas without overwriting their proven caches', async () => {
		const bytes = await source(local('1', '', '', cell('PinX', 2, 'GUARD(2)')));
		const saved = await editVsdx(bytes, [{ ...command(), offsetX: 0, offsetY: 0 }]);
		expect(
			children((await nodes(saved.bytes))[1], 'Cell')
				.find((n) => attribute(n, 'N') === 'PinX')!
				.getAttribute('F'),
		).toBe('GUARD(2)');
	});
	it('admits independent page-local IDs and references in a multi-page transaction', async () => {
		const bytes = await fixture({
			pages: ['0', '1'].map((id) => ({
				id,
				contents: `<Shapes>${local('1', user('Self', 2, 'Sheet.1!PinX'))}</Shapes>`,
			})),
		});
		const saved = await editVsdx(bytes, [command(), { ...command(), pageId: '1' }]);
		expect((await parseVsdx(saved.bytes)).pages.map((p) => p.shapes.map((s) => s.id))).toEqual([
			['1', '3'],
			['1', '3'],
		]);
	});
	it.each([
		['guarded pins', local('1', '', '', cell('PinX', 2, 'GUARD(2)')), 'EDIT_PROTECTED_CELL'],
		['stale pins', local('1', '', '', cell('PinX', 2, '3')), 'EDIT_PROTECTED_CELL'],
		['reference pins', local('1', '', '', cell('PinX', 2, 'Width')), 'EDIT_PROTECTED_CELL'],
		// A stencil shape is copied as an instance (edit-instance-shape.test.ts); this one names a
		// master the drawing does not have.
		['shape of a missing master', local('1', '', 'Master="1"'), 'UNSUPPORTED_DUPLICATE'],
		['group', local('1', '<Shapes/>', 'Type="Group"'), 'UNSUPPORTED_GEOMETRY_EDIT'],
		['foreign shape', local('1', '<ForeignData/>'), 'UNSUPPORTED_GEOMETRY_EDIT'],
		['one-dimensional', local('1', cell('OneD', 1)), 'UNSUPPORTED_GEOMETRY_EDIT'],
		['select lock', local('1', cell('LockSelect', 1)), 'EDIT_PROTECTED_CELL'],
		['layer', local('1', cell('LayerMember', '0')), 'UNSUPPORTED_FORMAT_EDIT'],
		[
			'dynamic lookup',
			local('1', user('Dynamic', 0, 'CONTAINERSHEETREF(1)')),
			'EDIT_UNKNOWN_DEPENDENCY',
		],
		[
			'container with lookups in the drawing',
			local(
				'1',
				section(
					'User',
					`<Row N="msvStructureType">${cell('Value', 0)}</Row><Row N="Dynamic">${cell('Value', 0, 'CONTAINERCOUNT()')}</Row>`,
				),
			),
			'UNSUPPORTED_SHAPE_ORDER',
		],
		[
			'reference built from text',
			local('1', user('Dynamic', 0, 'INDIRECT(&quot;Sheet.9!Width&quot;)')),
			'UNSUPPORTED_SHAPE_ORDER',
		],
		[
			'unknown function',
			local('1', user('Dynamic', 0, 'NOSUCHFUNCTION(1)')),
			'UNSUPPORTED_SHAPE_ORDER',
		],
		[
			'new ID reference',
			local('1', user('Missing', 0, 'Sheet.3!PinX')),
			'EDIT_DUPLICATE_DEPENDENCY',
		],
	] as const)('refuses %s without changing input bytes', async (_name, shapes, code) => {
		const bytes = await source(shapes),
			before = bytes.slice();
		await expect(editVsdx(bytes, [command()])).rejects.toMatchObject({ code });
		expect(bytes).toEqual(before);
	});
	it('refuses a later guarded target atomically after an otherwise valid target', async () => {
		const bytes = await source(local('1') + local('2', '', '', cell('PinX', 2, 'GUARD(2)'))),
			before = bytes.slice();
		await expect(
			editVsdx(bytes, [
				command([
					{ shapeId: '1', newShapeId: '3' },
					{ shapeId: '2', newShapeId: '4' },
				]),
			]),
		).rejects.toMatchObject({ code: 'EDIT_PROTECTED_CELL' });
		expect(bytes).toEqual(before);
	});
	it('rejects glued targets and existing IDs in nested shapes', async () => {
		const glued = await source(
			local('1') + local('2'),
			'<Connects><Connect FromSheet="1" ToSheet="2"/></Connects>',
		);
		await expect(editVsdx(glued, [command()])).rejects.toMatchObject({
			code: 'UNSUPPORTED_DUPLICATE',
		});
		const nested = await source(
			local('1') + shape('2', `<Shapes>${local('3')}</Shapes>`, 'Type="Group"'),
		);
		await expect(editVsdx(nested, [command()])).rejects.toMatchObject({ code: 'INVALID_SHAPE_ID' });
		const page = (await parseVsdx(nested)).pages[0]!;
		expect(visioDuplicateCommand(page, ['1'])!.copies[0]!.newShapeId).toBe('4');
	});
	it.each(
		[
			[],
			[{ shapeId: '01', newShapeId: '3' }],
			[{ shapeId: '1', newShapeId: '4294967296' }],
			[
				{ shapeId: '1', newShapeId: '3' },
				{ shapeId: '1', newShapeId: '4' },
			],
			[
				{ shapeId: '1', newShapeId: '3' },
				{ shapeId: '2', newShapeId: '3' },
			],
		].map((copies) => ({ copies })),
	)('rejects malformed mappings %j', ({ copies }) => {
		expect(() => snapshotDuplicateShapes(command(copies))).toThrow();
	});
	it.each([NaN, Infinity, 1000001])('rejects invalid offsets %s', (offsetX) => {
		expect(() => snapshotDuplicateShapes({ ...command(), offsetX })).toThrow();
	});
});
