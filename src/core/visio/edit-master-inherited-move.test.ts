import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { editVsdx, type VisioEdit } from './edit';
import { parseVsdx } from './parser';
import { parseXml } from '../xml/index';
import { VisioPackageError } from './package-common';
import { cell, fixture, rectangle, shape } from './test-fixtures';
const pins = cell('PinX', 2) + cell('PinY', 3);
const dimensions =
	cell('Width', 3) +
	cell('Height', 4) +
	cell('LocPinX', 1.5, 'Width*0.5') +
	cell('LocPinY', 2, 'Height*0.5');
const locks = ['LockMoveX', 'LockMoveY', 'LockWidth', 'LockHeight', 'LockAspect', 'LockDelete'];
const move = { type: 'move-shape' as const, pageId: '0', shapeId: '1', x: 5, y: 6 };
const source = (template = pins + dimensions, local = pins, extra = '') =>
	fixture({
		document: `<StyleSheets><StyleSheet ID="0">${locks.map((name) => cell(name, 0)).join('')}</StyleSheet></StyleSheets>`,
		masters: [{ id: '7', shapes: shape('8', template + rectangle, 'Type="Shape"') }],
		pages: [
			{
				id: '0',
				contents: `<Shapes>${shape('1', local, 'Type="Shape" Master="7"')}${extra}</Shapes>`,
			},
		],
	});
async function refusal(bytes: Uint8Array, edits: VisioEdit[] = [move]) {
	const before = bytes.slice();
	await expect(editVsdx(bytes, edits)).rejects.toBeInstanceOf(VisioPackageError);
	expect(bytes).toEqual(before);
}
describe('read-only inherited transforms during local master moves', () => {
	it('moves local pins without materializing any inherited cell or changing master payloads', async () => {
		const bytes = await source(),
			before = bytes.slice();
		const result = await editVsdx(bytes, [move]);
		const original = await JSZip.loadAsync(bytes),
			saved = await JSZip.loadAsync(result.bytes);
		for (const [name, part] of Object.entries(original.files))
			if (!part.dir && name !== 'visio/pages/page1.xml')
				expect(await saved.file(name)!.async('uint8array')).toEqual(await part.async('uint8array'));
		const root = parseXml(await saved.file('visio/pages/page1.xml')!.async('string'));
		expect(
			Array.from(root.getElementsByTagName('Cell')).map((node) => node.getAttribute('N')),
		).toEqual(['PinX', 'PinY']);
		const scene = (await parseVsdx(result.bytes)).pages[0]!.shapes[0]!;
		expect([scene.width, scene.height, ...scene.transform.slice(4)]).toEqual([3, 4, 3.5, 4]);
		expect(bytes).toEqual(before);
	});
	it('preserves partial local overrides and delegated LocPin caches', async () => {
		const local = pins + cell('Width', 5) + cell('LocPinX', 2.5, 'Inh');
		const bytes = await source(pins + dimensions, local);
		const result = await editVsdx(bytes, [move]);
		const saved = await JSZip.loadAsync(result.bytes);
		const nodes = Array.from(
			parseXml(await saved.file('visio/pages/page1.xml')!.async('string')).getElementsByTagName(
				'Cell',
			),
		);
		expect(
			nodes.map((node) => [node.getAttribute('N'), node.getAttribute('V'), node.getAttribute('F')]),
		).toEqual([
			['PinX', '5', null],
			['PinY', '6', null],
			['Width', '5', null],
			['LocPinX', '2.5', 'Inh'],
		]);
	});
	it.each(['Width', 'Height', 'LocPinX', 'LocPinY'])(
		'refuses error inherited cache %s',
		async (name) => {
			const replacements: Record<string, string> = {
				Width: cell('Width', 3),
				Height: cell('Height', 4),
				LocPinX: cell('LocPinX', 1.5, 'Width*0.5'),
				LocPinY: cell('LocPinY', 2, 'Height*0.5'),
			};
			await refusal(
				await source(
					(pins + dimensions).replace(replacements[name]!, `<Cell N="${name}" V="0" E="#VALUE!"/>`),
				),
			);
		},
	);
	it('refuses dimensional unit errors and missing inherited transform caches', async () => {
		await refusal(
			await source(
				(pins + dimensions).replace(cell('Height', 4), '<Cell N="Height" V="4" U="DA"/>'),
			),
		);
		await refusal(await source((pins + dimensions).replace(cell('LocPinY', 2, 'Height*0.5'), '')));
	});
	it('recomputes an inherited transform that reads the pin and refuses unproven local pins', async () => {
		// The pin-only proof refuses a master LocPinX that reads PinX; the instance path refreshes
		// its inherited cache instead, as Visio does.
		const dependent = await editVsdx(
			await source(
				(pins + dimensions).replace(cell('LocPinX', 1.5, 'Width*0.5'), cell('LocPinX', 2, 'PinX')),
			),
			[move],
		);
		expect(
			await (await JSZip.loadAsync(dependent.bytes)).file('visio/pages/page1.xml')!.async('string'),
		).toContain('<Cell N="LocPinX" V="5" U="IN" F="Inh"/>');
		await refusal(await source(pins + dimensions, cell('PinY', 3)));
		await refusal(await source(pins + dimensions, cell('PinX', 2, 'Inh') + cell('PinY', 3)));
	});
	it('retains the atomic mastered delete refusal after an admitted inherited move', async () => {
		await refusal(await source(), [move, { type: 'delete-shape', pageId: '0', shapeId: '1' }]);
	});
	it('resizes the instance in the same transaction as an admitted move', async () => {
		const result = await editVsdx(await source(), [
			move,
			{ type: 'resize-shape', pageId: '0', shapeId: '1', width: 5, height: 5 },
		]);
		const shape = (await parseVsdx(result.bytes)).pages[0]!.shapes[0]!;
		expect([shape.width, shape.height]).toEqual([5, 5]);
	});
	it('moves two independent instances without altering their common master', async () => {
		const bytes = await source(
			pins + dimensions,
			pins,
			shape('2', pins, 'Type="Shape" Master="7"'),
		);
		const result = await editVsdx(bytes, [move, { ...move, shapeId: '2', x: 7, y: 8 }]);
		const scene = await parseVsdx(result.bytes);
		expect(scene.pages[0]!.shapes.map((node) => node.transform.slice(4))).toEqual([
			[3.5, 4],
			[5.5, 6],
		]);
	});
	it.each(['Width', 'LocPinX'])(
		'does not let a valid local Inh cache hide inherited error or units: %s',
		async (name) => {
			const original = name === 'Width' ? cell('Width', 3) : cell('LocPinX', 1.5, 'Width*0.5');
			const local = pins + cell(name, name === 'Width' ? 3 : 1.5, 'Inh');
			for (const replacement of [
				`<Cell N="${name}" V="3" E="#VALUE!"/>`,
				`<Cell N="${name}" V="3" U="DA"/>`,
			])
				await refusal(await source((pins + dimensions).replace(original, replacement), local));
		},
	);
	it('preserves inherited markers across successive moves without materializing missing cells', async () => {
		const local = pins + cell('Width', 3, 'Inh');
		const bytes = await source(pins + dimensions, local);
		const result = await editVsdx(bytes, [move, { ...move, x: 7, y: 8 }]);
		const saved = await JSZip.loadAsync(result.bytes);
		const nodes = Array.from(
			parseXml(await saved.file('visio/pages/page1.xml')!.async('string')).getElementsByTagName(
				'Cell',
			),
		);
		expect(
			nodes.map((node) => [node.getAttribute('N'), node.getAttribute('V'), node.getAttribute('F')]),
		).toEqual([
			['PinX', '7', null],
			['PinY', '8', null],
			['Width', '3', 'Inh'],
		]);
	});
	it('recomputes a transitive inherited LocPin dependency on an edited pin', async () => {
		const template =
			(pins + dimensions).replace(
				cell('LocPinX', 1.5, 'Width*0.5'),
				cell('LocPinX', 2, 'User.Offset'),
			) +
			'<Section N="User"><Row N="Offset">' +
			cell('Value', 2, 'PinX') +
			'</Row></Section>';
		const result = await editVsdx(await source(template), [move]);
		const page = await (
			await JSZip.loadAsync(result.bytes)
		)
			.file('visio/pages/page1.xml')!
			.async('string');
		expect(page).toContain('<Cell N="LocPinX" V="5" U="IN" F="Inh"/>');
		expect(page).toContain('<Row N="Offset"><Cell N="Value" V="5" F="Inh"/></Row>');
	});
	it('refuses inherited dimensions depending on another resized or deleted page shape in the batch', async () => {
		const template =
			(pins + dimensions).replace(cell('Width', 3), cell('Width', 3, 'User.Size')) +
			'<Section N="User"><Row N="Size">' +
			cell('Value', 3) +
			'</Row></Section>';
		const local =
			pins +
			'<Section N="User"><Row N="Size">' +
			cell('Value', 3, 'Sheet.2!Width') +
			'</Row></Section>';
		const sibling = shape('2', pins + dimensions + rectangle, 'Type="Shape"');
		for (const edit of [
			{ type: 'resize-shape' as const, pageId: '0', shapeId: '2', width: 4, height: 4 },
			{ type: 'delete-shape' as const, pageId: '0', shapeId: '2' },
		])
			await refusal(await source(template, local, sibling), [move, edit]);
	});
});
