import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { parseXml } from '../xml/index';
import { editVsdx, type VisioEdit } from './edit';

// Optional: `scripts/record-visio-instance-shape.ps1 -OutputDirectory <dir>` saves a flowchart of
// real stencil drops before and after Visio deletes, duplicates, reorders, layers and replaces
// one of them; each edit here must leave the page as Visio left it.
const native = process.env.VISIO_NATIVE_INSTANCE_SHAPE_DIR;
const PAGE = 'visio/pages/page1.xml';

/** The page as comparable lines: one per shape, cell and Connect row, whatever the order. */
async function page(bytes: Uint8Array, skip: (line: string) => boolean = () => false) {
	const xml = await (await JSZip.loadAsync(bytes)).file(PAGE)!.async('string');
	const root = parseXml(xml).documentElement;
	const attributes = (node: Element, names: readonly string[]) =>
		names.map((name) => `${name}=${node.getAttribute(name) ?? ''}`).join(' ');
	const lines: string[] = [];
	const order: string[] = [];
	for (const shape of Array.from(root.getElementsByTagName('Shape'))) {
		const id = shape.getAttribute('ID')!;
		order.push(id);
		lines.push(`shape ${id} ${attributes(shape, ['Master', 'Type', 'NameU'])}`);
		for (const cell of Array.from(shape.getElementsByTagName('Cell'))) {
			const path: string[] = [];
			for (
				let node = cell.parentNode as Element | null;
				node && node !== shape;
				node = node.parentNode as Element | null
			)
				path.unshift(`${node.getAttribute('N') ?? ''}/${node.getAttribute('IX') ?? ''}`);
			lines.push(
				`cell ${id} ${[...path, cell.getAttribute('N')].join('.')} ${attributes(cell, ['V', 'F'])}`,
			);
		}
		lines.push(
			`text ${id} ${Array.from(shape.getElementsByTagName('Text'))[0]?.textContent ?? ''}`,
		);
	}
	for (const row of Array.from(root.getElementsByTagName('Connect')))
		lines.push(`connect ${attributes(row, ['FromSheet', 'FromCell', 'ToSheet', 'ToCell'])}`);
	return { order, lines: lines.filter((line) => !skip(line)).sort() };
}

describe.skipIf(!native)('native Visio whole-shape commands on stencil instances', () => {
	const load = async (name: string) => new Uint8Array(await readFile(join(native!, name)));
	const same = async (name: string, edits: VisioEdit[], skip?: (line: string) => boolean) => {
		const saved = await editVsdx(await load('before.vsdx'), edits);
		const ours = await page(saved.bytes, skip);
		const theirs = await page(await load(name), skip);
		expect(ours.lines).toEqual(theirs.lines);
		expect(ours.order).toEqual(theirs.order);
	};

	it('deletes a shape and releases the connector glued to it as Visio does', async () => {
		// Visio also drops the released EndX (it equals the master's) and steps ConFixedCode.
		await same('deleted.vsdx', [{ type: 'delete-shape', pageId: '0', shapeId: '3' }], (line) =>
			/^cell 5 (EndX|ConFixedCode) /.test(line),
		);
	});

	it('duplicates a shape as Visio does', async () => {
		await same('duplicated.vsdx', [
			{
				type: 'duplicate-shapes',
				pageId: '0',
				copies: [{ shapeId: '1', newShapeId: '6' }],
				offsetX: 0.33,
				offsetY: -0.33,
			},
		]);
	});

	it('brings a shape to the front as Visio does', async () => {
		await same('front.vsdx', [
			{ type: 'reorder-shape', pageId: '0', shapeId: '1', order: 'front' },
		]);
	});

	it('assigns a shape to a new layer as Visio does', async () => {
		await same('layered.vsdx', [
			{
				type: 'assign-layers',
				pageId: '0',
				shapeIds: ['1'],
				layerIds: ['0'],
				newLayers: ['Review'],
			},
		]);
	});

	it('changes a master to the cells Visio saves for that master', async () => {
		// Visio's replaced shape (a Data, resized and filled) goes back to Process: the result must
		// carry the caches Visio itself saved for the resized, filled Process.
		const replaced = await load('replaced-sized.vsdx');
		const saved = await editVsdx(replaced, [
			{ type: 'change-shape', pageId: '0', shapeId: '6', masterId: '2' },
		]);
		const drawn = (line: string) =>
			// Menu rows are passive caches; the ID, name and glue differ because Visio renumbers.
			!/^cell (1|6) /.test(line) || /^cell \d+ Actions\//.test(line);
		const strip = (lines: string[]) => lines.map((line) => line.replace(/^cell (1|6) /, 'cell * '));
		const ours = await page(saved.bytes, drawn);
		const theirs = await page(await load('sized.vsdx'), drawn);
		expect(strip(ours.lines)).toEqual(strip(theirs.lines));
	});
});
