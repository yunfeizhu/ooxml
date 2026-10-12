import { describe, expect, it } from 'vitest';
import { createVsdx } from './create-document';
import { editVsdx } from './edit';
import { VisioPackage } from './package';
import { parseVsdx } from './parser';
import { attribute, children } from './sheet';

const page = '0';
async function drawing(): Promise<Uint8Array> {
	return (
		await editVsdx(await createVsdx(), [
			{ type: 'create-rectangle', pageId: page, shapeId: '1', x: 1, y: 1, width: 2, height: 1 },
		])
	).bytes;
}
async function cell(bytes: Uint8Array, name: string) {
	const root = await (await VisioPackage.open(bytes)).readXml('visio/pages/page1.xml');
	const shape = Array.from(root.getElementsByTagNameNS(root.namespaceURI, 'Shape'))[0]!;
	const found = children(shape, 'Cell').find((item) => attribute(item, 'N') === name);
	return found ? [attribute(found, 'V'), attribute(found, 'U')] : undefined;
}

describe('line ends, cap and rounding', () => {
	it('saves them as Visio does and shows them in the model', async () => {
		const edited = await editVsdx(await drawing(), [
			{
				type: 'format-shape',
				pageId: page,
				shapeId: '1',
				beginArrow: 4,
				endArrow: 13,
				beginArrowSize: 1,
				endArrowSize: 5,
				lineCap: 1,
				rounding: 9,
			},
		]);
		// Recorded from Visio 16: plain codes, and the radius in inches with a points unit.
		expect(await cell(edited.bytes, 'BeginArrow')).toEqual(['4', undefined]);
		expect(await cell(edited.bytes, 'EndArrow')).toEqual(['13', undefined]);
		expect(await cell(edited.bytes, 'BeginArrowSize')).toEqual(['1', undefined]);
		expect(await cell(edited.bytes, 'EndArrowSize')).toEqual(['5', undefined]);
		expect(await cell(edited.bytes, 'LineCap')).toEqual(['1', undefined]);
		expect(await cell(edited.bytes, 'Rounding')).toEqual(['0.125', 'PT']);
		const style = (await parseVsdx(edited.bytes)).pages[0]!.shapes[0]!.style;
		expect(style).toMatchObject({
			startArrow: 4,
			endArrow: 13,
			startArrowSize: 1,
			endArrowSize: 5,
			lineCap: 'butt',
			rounding: 0.125,
		});
		// Rounding 0 puts the square corners back.
		const square = await editVsdx(edited.bytes, [
			{ type: 'format-shape', pageId: page, shapeId: '1', rounding: 0, lineCap: 0 },
		]);
		const after = (await parseVsdx(square.bytes)).pages[0]!.shapes[0]!.style;
		expect(after.rounding).toBeUndefined();
		expect(after.lineCap).toBe('round');
	});

	it('refuses codes outside the supported ranges', async () => {
		const bytes = await drawing();
		for (const edit of [
			{ beginArrow: 46 },
			{ endArrow: -1 },
			{ endArrowSize: 7 },
			{ beginArrowSize: 1.5 },
			{ lineCap: 3 },
			{ rounding: -1 },
			{ rounding: 721 },
		])
			await expect(
				editVsdx(bytes, [{ type: 'format-shape', pageId: page, shapeId: '1', ...edit }]),
			).rejects.toMatchObject({ code: 'INVALID_EDIT' });
	});
});
