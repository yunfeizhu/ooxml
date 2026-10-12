import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { editVsdx } from './edit';
import { parseVsdx } from './parser';

// Optional: `scripts/record-visio-instance-geometry.ps1 -OutputDirectory <dir>` saves real stencil
// drops before and after Visio resizes and formats them; each edit must write what Visio wrote.
const native = process.env.VISIO_NATIVE_INSTANCE_GEOMETRY_DIR;
const PAGE = 'visio/pages/page1.xml';

/** Every cell of a shape as `path -> [value, unit, formula]`, whatever the element order. */
async function shapeCells(bytes: Uint8Array, id: string) {
	const xml = await (await JSZip.loadAsync(bytes)).file(PAGE)!.async('string');
	const root = new DOMParser().parseFromString(xml, 'text/xml').documentElement!;
	const shape = Array.from(root.getElementsByTagName('Shape')).find(
		(node) => node.getAttribute('ID') === id,
	)!;
	const result = new Map<string, [number | string, string | null, string | null]>();
	for (const cell of Array.from(shape.getElementsByTagName('Cell'))) {
		const path: string[] = [];
		for (
			let node = cell.parentNode as typeof shape | null;
			node && node !== shape;
			node = node.parentNode as typeof shape | null
		)
			path.unshift(
				`${node.localName}[${node.getAttribute('N') ?? ''}/${node.getAttribute('T') ?? ''}/${node.getAttribute('IX') ?? ''}]`,
			);
		const value = cell.getAttribute('V') ?? '';
		result.set([...path, cell.getAttribute('N')].join('.'), [
			/^-?[\d.]+(e-?\d+)?$/i.test(value) ? Number(value) : value,
			cell.getAttribute('U'),
			cell.getAttribute('F'),
		]);
	}
	return result;
}

describe.skipIf(!native)('native Visio stencil-instance geometry and formatting', () => {
	const load = async (name: string) => new Uint8Array(await readFile(join(native!, name)));
	const PASSIVE = /^Section\[(Actions|User|Property|Scratch)\//;

	it('writes the size and the refreshed inherited caches Visio writes', async () => {
		const before = await load('before.vsdx');
		const resized = await load('resized.vsdx');
		for (const shapeId of ['1', '2', '3', '4']) {
			const saved = await editVsdx(before, [
				{ type: 'resize-shape', pageId: '0', shapeId, width: 2.5, height: 1.25 },
			]);
			const ours = await shapeCells(saved.bytes, shapeId);
			const theirs = await shapeCells(resized, shapeId);
			// Menu and scratch caches that need text metrics are left for Visio to recalculate.
			const drawn = (cells: typeof ours) => [...cells.keys()].filter((key) => !PASSIVE.test(key));
			expect(drawn(ours).sort()).toEqual(drawn(theirs).sort());
			for (const [key, [value, unit, formula]] of ours) {
				const expected = theirs.get(key);
				if (!expected) {
					expect(PASSIVE.test(key), key).toBe(true);
					continue;
				}
				if (typeof value === 'number') expect(value, key).toBeCloseTo(expected[0] as number, 9);
				else expect(value, key).toBe(expected[0]);
				expect([unit, formula], key).toEqual([expected[1], expected[2]]);
			}
			const model = await parseVsdx(saved.bytes);
			const shape = model.pages[0]!.shapes.find((item) => item.id === shapeId)!;
			expect([shape.width, shape.height]).toEqual([2.5, 1.25]);
		}
	});

	it('moves a dropped stencil shape', async () => {
		const saved = await editVsdx(await load('before.vsdx'), [
			{ type: 'move-shape', pageId: '0', shapeId: '2', x: 5, y: 7.5 },
		]);
		const ours = await shapeCells(saved.bytes, '2');
		expect([ours.get('PinX')![0], ours.get('PinY')![0]]).toEqual([5, 7.5]);
	});

	it('writes the values Visio writes for fill, line and text formatting', async () => {
		const typed = await editVsdx(await load('before.vsdx'), [
			{ type: 'replace-plain-text', pageId: '0', shapeId: '1', text: 'Formatted' },
		]);
		const saved = await editVsdx(typed.bytes, [
			{
				type: 'format-shape',
				pageId: '0',
				shapeId: '1',
				fillColor: '#ff0000',
				lineColor: '#0000ff',
				lineWeight: 2,
			},
			{
				type: 'format-text',
				pageId: '0',
				shapeId: '1',
				bold: true,
				fontColor: '#ff0000',
				fontSize: 14,
				horizontalAlign: 'left',
				verticalAlign: 'top',
			},
		]);
		const ours = await shapeCells(saved.bytes, '1');
		const theirs = await shapeCells(await load('formatted.vsdx'), '1');
		// Visio restates the size it was given back; this edit never touched it.
		for (const key of ['Width', 'Height']) theirs.delete(key);
		for (const [key, [value]] of theirs) {
			const own = ours.get(key);
			expect(own, key).toBeDefined();
			if (typeof value === 'number') expect(own![0], key).toBeCloseTo(value, 9);
			else expect(own![0], key).toBe(value);
		}
		const model = (await parseVsdx(saved.bytes)).pages[0]!.shapes.find((item) => item.id === '1')!;
		expect(model.style.fill).toBe('#ff0000');
		expect(model.text.runs[0]).toMatchObject({ bold: true, color: '#ff0000' });
	});
});
