import { describe, expect, it } from 'vitest';
import { createVsdx } from './create-document';
import { parseVsdx } from './parser';
import { editVsdx } from './edit';
import { VisioPackage } from './package';
import type { VisioShapeDataEdit, VisioShapeDataFields } from './edit-shape-data-commands';
import { canonicalShapeDataValue, visioShapeDataRowName } from './edit-shape-data-commands';

const fields = (patch: Partial<VisioShapeDataFields> = {}): VisioShapeDataFields => ({
	label: 'Cost',
	prompt: 'Monthly cost',
	type: 'number',
	format: '',
	value: '12.5',
	...patch,
});
const edit = (patch: Partial<VisioShapeDataEdit> = {}): VisioShapeDataEdit => ({
	type: 'set-shape-data',
	pageId: '0',
	shapeId: '1',
	row: 'Cost',
	data: fields(),
	...patch,
});
async function drawing(): Promise<Uint8Array> {
	return (
		await editVsdx(await createVsdx(), [
			{ type: 'create-rectangle', pageId: '0', shapeId: '1', x: 2, y: 2, width: 2, height: 1 },
		])
	).bytes;
}
const first = async (bytes: Uint8Array) => (await parseVsdx(bytes)).pages[0]!.shapes[0]!;
const page = async (bytes: Uint8Array) =>
	new TextDecoder().decode(
		await (await VisioPackage.open(bytes)).readBytes('visio/pages/page1.xml'),
	);

describe('Shape Data editing', () => {
	it('adds typed Property rows that read back through parseVsdx', async () => {
		const result = await editVsdx(await drawing(), [
			edit(),
			edit({
				row: 'Owner',
				data: fields({ label: 'Owner', type: 'string', value: 'Ana', prompt: '' }),
			}),
			edit({ row: 'Active', data: fields({ label: 'Active', type: 'boolean', value: 'yes' }) }),
			edit({ row: 'Due', data: fields({ label: 'Due', type: 'date', value: '2024-03-01' }) }),
			edit({
				row: 'Size',
				data: fields({ label: 'Size', type: 'fixed-list', format: 'S;M;L', value: 'M' }),
			}),
		]);
		expect(result.diagnostics.map((note) => note.code)).toContain('edit-shape-data');
		const xml = await page(result.bytes);
		expect(xml).toContain('<Section N="Property"><Row N="Cost"><Cell N="Value" V="12.5"/>');
		expect(xml).toContain('<Cell N="Value" V="Ana" U="STR"/>');
		expect(xml).toContain('<Cell N="Value" V="2024-03-01T00:00:00" U="DATE"/>');
		const data = (await first(result.bytes)).shapeData!;
		expect(data.map((row) => [row.name, row.label, row.valueKind, row.value])).toEqual([
			['Cost', 'Cost', 'number', 12.5],
			['Owner', 'Owner', 'string', 'Ana'],
			['Active', 'Active', 'boolean', true],
			['Due', 'Due', 'date', 45352],
			['Size', 'Size', 'fixed-list', 'M'],
		]);
		expect(data[0]).toMatchObject({ prompt: 'Monthly cost' });
		expect(data[4]).toMatchObject({ format: 'S;M;L' });
	});

	it('edits a row in place, hides it and removes it with its emptied section', async () => {
		const added = await editVsdx(await drawing(), [edit()]);
		const changed = await editVsdx(added.bytes, [
			edit({ data: fields({ label: 'Total', value: '7', invisible: true }) }),
		]);
		expect((await first(changed.bytes)).shapeData).toEqual([
			expect.objectContaining({ name: 'Cost', label: 'Total', value: 7, invisible: true }),
		]);
		const removed = await editVsdx(changed.bytes, [edit({ data: null })]);
		expect((await first(removed.bytes)).shapeData).toEqual([]);
		expect(await page(removed.bytes)).not.toContain('Property');
	});

	it('refuses invalid values, missing rows and rows read by formulas', async () => {
		const bytes = await drawing();
		await expect(
			editVsdx(bytes, [edit({ data: fields({ value: 'twelve' }) })]),
		).rejects.toMatchObject({ code: 'INVALID_EDIT' });
		await expect(
			editVsdx(bytes, [edit({ data: fields({ type: 'date', value: '2024-02-30' }) })]),
		).rejects.toMatchObject({ code: 'INVALID_EDIT' });
		await expect(editVsdx(bytes, [edit({ row: 'bad name' })])).rejects.toMatchObject({
			code: 'INVALID_EDIT',
		});
		await expect(editVsdx(bytes, [edit({ data: null })])).rejects.toMatchObject({
			code: 'EDIT_TARGET_NOT_FOUND',
		});
		const added = await editVsdx(bytes, [edit()]);
		const pkg = await VisioPackage.open(added.bytes);
		const xml = new TextDecoder()
			.decode(await pkg.readBytes('visio/pages/page1.xml'))
			.replace(
				'<Section N="Property">',
				'<Cell N="Comment" V="" F="Prop.Cost"/><Section N="Property">',
			);
		const JSZip = (await import('jszip')).default;
		const zip = await JSZip.loadAsync(added.bytes);
		zip.file('visio/pages/page1.xml', xml);
		const referenced = await zip.generateAsync({ type: 'uint8array' });
		await expect(
			editVsdx(referenced, [edit({ data: fields({ value: '3' }) })]),
		).rejects.toMatchObject({ code: 'UNSUPPORTED_SHAPE_DATA_EDIT' });
	});

	it('derives row names and canonical values like the Define Shape Data dialog', () => {
		expect(visioShapeDataRowName('Cost Center', ['Cost_Center'])).toBe('Cost_Center_2');
		expect(visioShapeDataRowName('2024 sales')).toBe('_2024_sales');
		expect(visioShapeDataRowName('!!!')).toBe('Property');
		expect(canonicalShapeDataValue('number', ' 1e2 ')).toBe('100');
		expect(canonicalShapeDataValue('boolean', 'No')).toBe('FALSE');
		expect(canonicalShapeDataValue('date', '2024-01-02T03:04')).toBe('2024-01-02T03:04:00');
	});
});
