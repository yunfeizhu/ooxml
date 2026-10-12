import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { editVsdx, type VisioEdit } from './edit';
import { parseVsdx } from './parser';
import { cell, fixture, rectangle, row, section, shape } from './test-fixtures';
import { snapshotEdits } from './ui/edit-commands';
import { visioBasicShapeOutline } from './basic-shapes';
import type { VisioChangeShapeTarget } from './edit-change-shape-commands';

const change = (
	target: VisioChangeShapeTarget,
	shapeId = '2',
): Extract<VisioEdit, { type: 'change-shape' }> => ({
	type: 'change-shape',
	pageId: '0',
	shapeId,
	shape: target,
});
const created = async (from: 'rectangle' | 'rounded-rectangle' | 'can' = 'rectangle') =>
	(
		await editVsdx(await fixture(), [
			{
				type: 'create-rectangle',
				pageId: '0',
				shapeId: '2',
				x: 3,
				y: 4,
				width: 2,
				height: 1,
				text: 'Keep me',
				shape: from,
			},
		])
	).bytes;
const pageXml = async (bytes: Uint8Array) =>
	(await JSZip.loadAsync(bytes)).file('visio/pages/page1.xml')!.async('string');
const drawn = async (bytes: Uint8Array, id = '2') =>
	(await parseVsdx(bytes)).pages[0]!.shapes.find((candidate) => candidate.id === id)!;
/** A local 2D shape with explicit transform cells, for handwritten admission cases. */
const local = (id: string, extra = '', geometry = rectangle, attributes = '') =>
	shape(
		id,
		cell('PinX', 1) +
			cell('PinY', 1) +
			cell('Width', 2) +
			cell('Height', 1) +
			cell('LocPinX', 1, 'Width*0.5') +
			cell('LocPinY', 0.5, 'Height*0.5') +
			extra +
			geometry,
		attributes,
	);
const page = (contents: string) =>
	fixture({ pages: [{ id: '0', contents: `<Shapes>${contents}</Shapes>` }] });

describe('change-shape', () => {
	it('replaces the outline and keeps position, size, rotation and text', async () => {
		const rotated = await editVsdx(await created(), [
			{ type: 'rotate-shape', pageId: '0', shapeId: '2', angle: 0.5 },
		]);
		const result = await editVsdx(rotated.bytes, [change('star')]);
		expect(result.diagnostics.map((item) => item.code)).toContain('edit-change-shape-experimental');
		const after = await drawn(result.bytes);
		const before = await drawn(rotated.bytes);
		expect(after.width).toBe(2);
		expect(after.height).toBe(1);
		expect(after.rotation).toEqual(before.rotation);
		expect(after.transform).toEqual(before.transform);
		expect(after.text.plainText).toBe('Keep me');
		expect(after.geometry).toHaveLength(1);
		// Ten star points plus the closing point.
		expect(after.geometry[0]!.path.match(/L /g)).toHaveLength(10);
	});

	it('changes to a native ellipse that later resizes', async () => {
		const result = await editVsdx(await created(), [change('ellipse')]);
		const xml = await pageXml(result.bytes);
		expect(xml).toContain('T="Ellipse"');
		expect(xml.slice(xml.indexOf('<Shape ID="2"'))).not.toContain('RelLineTo');
		const resized = await editVsdx(result.bytes, [
			{ type: 'resize-shape', pageId: '0', shapeId: '2', width: 4, height: 3 },
		]);
		const after = await drawn(resized.bytes);
		expect([after.width, after.height]).toEqual([4, 3]);
		expect(await pageXml(resized.bytes)).toContain('V="2" F="Width*0.5"');
	});

	it('changes back from an ellipse and from a two-section can', async () => {
		const ellipse = await editVsdx(await created(), [change('circle')]);
		const square = await editVsdx(ellipse.bytes, [change('hexagon')]);
		expect(await pageXml(square.bytes)).not.toContain('T="Ellipse"');
		const can = await editVsdx(await created('can'), [change('triangle')]);
		const after = await drawn(can.bytes);
		expect(after.geometry).toHaveLength(1);
		expect(after.geometry[0]!.path).toBe('M 0 0 L 2 0 L 1 1 L 0 0');
		const cube = await editVsdx(can.bytes, [change('cube')]);
		expect((await drawn(cube.bytes)).geometry).toHaveLength(
			visioBasicShapeOutline('cube').paths.length,
		);
	});

	it('sets Rounding for the rounded rectangle and clears it afterwards', async () => {
		const rounded = await editVsdx(await created(), [change('rounded-rectangle')]);
		expect(await pageXml(rounded.bytes)).toContain('<Cell N="Rounding" V="0.15"');
		expect((await drawn(rounded.bytes)).geometry[0]!.path).toContain(' A ');
		const plain = await editVsdx(rounded.bytes, [change('diamond')]);
		expect(await pageXml(plain.bytes)).toContain('<Cell N="Rounding" V="0"');
		expect((await drawn(plain.bytes)).geometry[0]!.path).not.toContain(' A ');
	});

	it('resizes and moves the new outline afterwards', async () => {
		const changed = await editVsdx(await created(), [change('pentagon')]);
		const edited = await editVsdx(changed.bytes, [
			{ type: 'resize-shape', pageId: '0', shapeId: '2', width: 5, height: 2 },
			{ type: 'move-shape', pageId: '0', shapeId: '2', x: 6, y: 7 },
		]);
		const after = await drawn(edited.bytes);
		expect([after.width, after.height]).toEqual([5, 2]);
		expect(after.rotation).toMatchObject({ pinX: 6, pinY: 7 });
	});

	it('changes an imported local shape and keeps its other cells', async () => {
		const source = await page(
			local('5', cell('LineWeight', 0.02) + cell('FillForegnd', '#ff0000')),
		);
		const result = await editVsdx(source, [change('octagon', '5')]);
		const xml = await pageXml(result.bytes);
		expect(xml).toContain('<Cell N="FillForegnd" V="#ff0000"/>');
		expect((await drawn(result.bytes, '5')).geometry[0]!.path.match(/L /g)).toHaveLength(8);
	});

	it.each([
		// A real instance changes by its master (edit-master-change.test.ts); this one names none.
		[
			'an instance of a missing master',
			local('5', '', rectangle, 'Master="1"'),
			/master does not belong to this drawing/,
		],
		[
			'a group',
			shape(
				'5',
				cell('Width', 1) + cell('Height', 1) + `<Shapes>${local('6')}</Shapes>`,
				'Type="Group"',
			),
			/Groups cannot change shape/,
		],
		[
			'a line',
			local('5', cell('BeginX', 0) + cell('BeginY', 0) + cell('EndX', 2) + cell('EndY', 0)),
			/1D shapes/,
		],
		['a locked shape', local('5', cell('LockVtxEdit', 1)), /protected/],
		['a replace-locked shape', local('5', cell('LockReplace', 1)), /protected/],
		[
			'control handles',
			local('5', section('Controls', row(1, '', cell('X', 1) + cell('Y', 1)))),
			/Control handles/,
		],
		[
			'a referenced outline',
			local('5') +
				local('6', cell('User', 0)).replace(
					'<Cell N="User" V="0"/>',
					section('User', '<Row N="Probe">' + cell('Value', 0, 'Sheet.5!Geometry1.X2') + '</Row>'),
				),
			/reads the outline/,
		],
		['a missing shape', local('6'), /unique top-level shape/],
	])('refuses %s', async (_name, contents, reason) => {
		await expect(editVsdx(await page(contents), [change('triangle', '5')])).rejects.toThrow(reason);
	});

	it('snapshots the command and rejects unknown targets', async () => {
		expect(snapshotEdits([{ ...change('can'), extra: 1 } as unknown as VisioEdit])).toEqual([
			change('can'),
		]);
		await expect(
			editVsdx(await created(), [change('blob' as VisioChangeShapeTarget)]),
		).rejects.toThrow(/Unknown basic shape/);
		expect(() => snapshotEdits([change('blob' as VisioChangeShapeTarget)])).toThrow(
			/Unknown basic shape/,
		);
	});
});
