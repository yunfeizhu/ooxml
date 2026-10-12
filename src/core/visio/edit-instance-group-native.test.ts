import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { editVsdx } from './edit';
import { parseVsdx } from './parser';

// Optional: `scripts/record-visio-group-instance.ps1 -OutputDirectory <dir>` saves real drops of
// group masters (Can 1, Cube 3, Folder - closed 6, the nested Pyramid 12) before and after Visio
// resizes, turns and formats them; each edit must write what Visio wrote.
const native = process.env.VISIO_NATIVE_GROUP_INSTANCE_DIR;
const PAGE = 'visio/pages/page1.xml';
type Cells = Map<string, [number | string, string | null, string | null]>;

/** Every cell of a top-level shape and its sub-shapes as `Shape#id.path -> [value, unit, formula]`. */
async function groupCells(bytes: Uint8Array, id: string): Promise<Cells> {
	const xml = await (await JSZip.loadAsync(bytes)).file(PAGE)!.async('string');
	const root = new DOMParser().parseFromString(xml, 'text/xml').documentElement!;
	const shape = Array.from(root.getElementsByTagName('Shape')).find(
		(node) => node.getAttribute('ID') === id,
	)!;
	const result: Cells = new Map();
	for (const cell of Array.from(shape.getElementsByTagName('Cell'))) {
		const path: string[] = [];
		for (
			let node = cell.parentNode as typeof shape | null;
			node && node !== shape.parentNode;
			node = node.parentNode as typeof shape | null
		) {
			if (node.localName === 'Shape') path.unshift(`Shape#${node.getAttribute('ID')}`);
			else if (node.localName !== 'Shapes')
				path.unshift(
					`${node.localName}[${node.getAttribute('N') ?? ''}/${node.getAttribute('T') ?? ''}/${node.getAttribute('IX') ?? ''}]`,
				);
		}
		const value = cell.getAttribute('V') ?? '';
		result.set([...path, cell.getAttribute('N')].join('.'), [
			/^-?[\d.]+(e-?\d+)?$/i.test(value) ? Number(value) : value,
			cell.getAttribute('U'),
			cell.getAttribute('F'),
		]);
	}
	return result;
}

/** Menu, data and scratch caches may need text metrics; they are left for Visio to recalculate. */
const PASSIVE = /\.Section\[(Actions|User|Property|Scratch)\//;

describe.skipIf(!native)('native Visio group-master instances', () => {
	const load = async (name: string) => new Uint8Array(await readFile(join(native!, name)));

	it('writes the size and the refreshed sub-shape caches Visio writes', async () => {
		const before = await load('before.vsdx');
		const resized = await load('resized.vsdx');
		// The folder keeps its aspect ratio; Visio's automation ignored that, the editor does not.
		await expect(
			editVsdx(before, [
				{ type: 'resize-shape', pageId: '0', shapeId: '6', width: 2.5, height: 1.75 },
			]),
		).rejects.toMatchObject({ code: 'EDIT_PROTECTED_CELL' });
		for (const shapeId of ['1', '3', '12']) {
			const saved = await editVsdx(before, [
				{ type: 'resize-shape', pageId: '0', shapeId, width: 2.5, height: 1.75 },
			]);
			const ours = await groupCells(saved.bytes, shapeId);
			const theirs = await groupCells(resized, shapeId);
			const start = await groupCells(before, shapeId);
			for (const [key, [value, unit, formula]] of ours) {
				if (start.has(key) && !theirs.has(key)) continue;
				const expected = theirs.get(key);
				if (!expected) {
					expect(PASSIVE.test(key), `${shapeId} ${key}`).toBe(true);
					continue;
				}
				if (typeof value === 'number')
					expect(value, `${shapeId} ${key}`).toBeCloseTo(expected[0] as number, 9);
				else expect(value, key).toBe(expected[0]);
				expect([unit, formula], `${shapeId} ${key}`).toEqual([expected[1], expected[2]]);
			}
			// Visio also restates caches whose value did not change; every changed one is ours too.
			const model = await parseVsdx(saved.bytes);
			const native = await parseVsdx(resized);
			const pick = (document: typeof model) =>
				document.pages[0]!.shapes.find((item) => item.id === shapeId)!;
			expect([pick(model).width, pick(model).height]).toEqual([2.5, 1.75]);
			expect(JSON.stringify(pick(model).geometry)).toBe(JSON.stringify(pick(native).geometry));
			expect(JSON.stringify(pick(model).children ?? [])).toBe(
				JSON.stringify(pick(native).children ?? []),
			);
		}
	});

	it('rotates, flips and moves a group instance', async () => {
		const resized = await load('resized.vsdx');
		const saved = await editVsdx(resized, [
			{ type: 'rotate-shape', pageId: '0', shapeId: '1', angle: Math.PI / 6 },
			{ type: 'flip-shape', pageId: '0', shapeId: '3', axis: 'horizontal' },
			{ type: 'move-shape', pageId: '0', shapeId: '6', x: 7, y: 9 },
		]);
		const turned = await load('turned.vsdx');
		for (const [id, key] of [
			['1', 'Shape#1.Angle'],
			['3', 'Shape#3.FlipX'],
			['6', 'Shape#6.PinX'],
		] as const) {
			const ours = await groupCells(saved.bytes, id);
			const theirs = await groupCells(turned, id);
			expect(ours.get(key)![0], key).toBeCloseTo(theirs.get(key)![0] as number, 9);
			// Turning or moving a group writes nothing on its sub-shapes.
			expect([...ours.keys()].filter((name) => !theirs.has(name))).toEqual([]);
		}
	});

	it('formats the group with its sub-shapes, and one sub-shape alone', async () => {
		const before = await load('before.vsdx');
		const filled = await groupCells(await load('filled.vsdx'), '1');
		const saved = await editVsdx(before, [
			{ type: 'format-shape', pageId: '0', shapeId: '1', lineColor: '#0000ff' },
		]);
		const ours = await groupCells(saved.bytes, '1');
		for (const key of ['Shape#1.LineColor', 'Shape#1.Shape#2.LineColor'])
			expect(ours.get(key)?.[0], key).toBe(filled.get(key)![0]);
		// Text formatting reaches the shapes that hold text: here the group, typed on in Visio.
		const typed = await load('subtext.vsdx');
		const italic = await groupCells(
			(await editVsdx(typed, [{ type: 'format-text', pageId: '0', shapeId: '1', italic: true }]))
				.bytes,
			'1',
		);
		expect(Number(italic.get('Shape#1.Section[Character//].Row[//0].Style')![0]) & 2).toBe(2);
		// A sub-selected sub-shape takes the formatting alone.
		const sub = await editVsdx(before, [
			{ type: 'format-shape', pageId: '0', shapeId: '4', lineColor: '#0000ff' },
		]);
		const cube = await groupCells(sub.bytes, '3');
		const theirs = await groupCells(await load('subfilled.vsdx'), '3');
		expect(cube.get('Shape#3.Shape#4.LineColor')![0]).toBe(
			theirs.get('Shape#3.Shape#4.LineColor')![0],
		);
		expect([...cube.keys()].filter((key) => /LineColor$/.test(key))).toEqual([
			'Shape#3.Shape#4.LineColor',
		]);
		// The cube's faces compute their own shade from the group's fill: the master protects it.
		await expect(
			editVsdx(before, [{ type: 'format-shape', pageId: '0', shapeId: '4', fillColor: '#ff0000' }]),
		).rejects.toMatchObject({ code: 'EDIT_PROTECTED_CELL' });
		// The text of one sub-shape, as Visio saves it: a local Text on that sub-shape.
		const text = await editVsdx(before, [
			{ type: 'replace-plain-text', pageId: '0', shapeId: '5', text: 'Sub text' },
		]);
		const model = (await parseVsdx(text.bytes)).pages[0]!.shapes.find((item) => item.id === '3')!;
		expect(JSON.stringify(model)).toContain('Sub text');
	});
});
