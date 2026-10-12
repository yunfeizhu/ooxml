import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { editVsdx } from './edit';
import { parseVsdx } from './parser';
import { cell, fixture, shape } from './test-fixtures';

const PAGES = 'visio/pages/pages.xml';
const layer = (index: number, name: string, extra = '') =>
	`<Row IX="${index}">${cell('Name', name)}${cell('Visible', 1)}${cell('Print', 1)}${cell('Lock', 0)}${extra}</Row>`;
const source = (rows = layer(0, 'Flow') + layer(1, 'Notes')) =>
	fixture({
		pages: [
			{
				id: '0',
				contents: `<Shapes>${shape('1', cell('LayerMember', '0'))}</Shapes>`,
				pageCells: `<Section N="Layer">${rows}</Section>`,
			},
		],
	});
const pagesXml = async (bytes: Uint8Array) =>
	(await JSZip.loadAsync(bytes)).file(PAGES)!.async('string');
const set = (bytes: Uint8Array, layerId: string, flags: object) =>
	editVsdx(bytes, [{ type: 'set-layer-properties', pageId: '0', layerId, ...flags }]);

describe('Layer Properties', () => {
	it('saves Visible, Print and Lock on one layer row and nothing else', async () => {
		const bytes = await source();
		const saved = await set(bytes, '1', { visible: false, print: false, lock: true });
		expect(saved.changedParts).toEqual([PAGES]);
		const [flow, notes] = (await parseVsdx(saved.bytes)).pages[0]!.layers!;
		expect(flow).toMatchObject({ visible: true, printable: true, locked: false });
		expect(notes).toMatchObject({ name: 'Notes', visible: false, printable: false, locked: true });
		const before = await JSZip.loadAsync(bytes),
			after = await JSZip.loadAsync(saved.bytes);
		expect(await after.file('visio/pages/page1.xml')!.async('string')).toBe(
			await before.file('visio/pages/page1.xml')!.async('string'),
		);
	});

	it('leaves omitted flags alone, adds a missing cell and reports no change when nothing differs', async () => {
		const bytes = await source(`<Row IX="0">${cell('Name', 'Bare')}</Row>`);
		const saved = await set(bytes, '0', { lock: true });
		expect(await pagesXml(saved.bytes)).toMatch(
			/<Cell N="Name" V="Bare"\/><Cell N="Lock" V="1"\/>/,
		);
		expect((await set(saved.bytes, '0', { lock: true })).changedParts).toEqual([]);
	});

	it('refuses an unknown layer, a formula-driven flag, mixed edits and an empty edit', async () => {
		const bytes = await source();
		await expect(set(bytes, '7', { visible: false })).rejects.toMatchObject({
			code: 'EDIT_TARGET_NOT_FOUND',
		});
		const formula = await source(
			`<Row IX="0">${cell('Name', 'Driven')}${cell('Visible', 1, 'User.Show')}</Row>`,
		);
		await expect(set(formula, '0', { visible: false })).rejects.toMatchObject({
			code: 'UNSUPPORTED_LAYER_EDIT',
		});
		await expect(set(bytes, '0', {})).rejects.toMatchObject({ code: 'INVALID_EDIT' });
		await expect(
			editVsdx(bytes, [
				{ type: 'set-layer-properties', pageId: '0', layerId: '0', lock: true },
				{ type: 'move-shape', pageId: '0', shapeId: '1', x: 1, y: 1 },
			]),
		).rejects.toMatchObject({ code: 'EDIT_MIXED_LAYER_TRANSACTION' });
	});
});
