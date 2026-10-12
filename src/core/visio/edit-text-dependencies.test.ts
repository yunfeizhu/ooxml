import { describe, expect, it } from 'vitest';
import { editVsdx } from './edit';
import { parseVsdx } from './parser';
import { VisioPackage } from './package';
import { cell, fixture, rectangle, shape } from './test-fixtures';

const edit = { type: 'replace-plain-text' as const, pageId: '0', shapeId: '1', text: 'Changed' };
const contents = (extra = '') =>
	`<Shapes>${shape('1', rectangle + '<Text>Old</Text>' + extra)}</Shapes>`;

describe('plain text dependency preservation', () => {
	it.each([
		'TheText',
		// TEXTWIDTH and TEXTHEIGHT of the shape's own text are followed: edit-text-size.test.ts.
		'TEXTWIDTH(Sheet.2!TheText)',
		'SHAPETEXT(Sheet.1!TheText)',
		'INDIRECT("TheText")',
		'UNKNOWN(1)',
	])('refuses affected or unknown source formula %s without changing input', async (formula) => {
		const bytes = await fixture({
			pages: [
				{ id: '0', contents: contents(cell('TxtWidth', 1, formula.replaceAll('"', '&quot;'))) },
			],
		});
		const original = bytes.slice();
		await expect(editVsdx(bytes, [edit])).rejects.toMatchObject({
			code:
				formula === 'TheText' ? 'EDIT_UNSUPPORTED_FORMAT_DEPENDENCY' : 'EDIT_UNKNOWN_DEPENDENCY',
		});
		expect(bytes).toEqual(original);
	});
	it('refuses a retained sibling field cache that reads the edited shape text', async () => {
		const field =
			'<Section N="Field"><Row IX="0"><Cell N="Value" V="Old" F="Sheet.1!TheText"/></Row></Section><Text><fld IX="0"/>Old</Text>';
		const bytes = await fixture({
			pages: [
				{
					id: '0',
					contents: `<Shapes>${shape('1', '<Text>Old</Text>')}${shape('2', field)}</Shapes>`,
				},
			],
		});
		await expect(editVsdx(bytes, [edit])).rejects.toMatchObject({
			code: 'EDIT_UNSUPPORTED_FORMAT_DEPENDENCY',
		});
	});
	it.each(['style', 'master', 'metadata'])(
		'refuses unproven text dependence in %s XML',
		async (scope) => {
			const formula = cell('TxtWidth', 1, 'TEXTWIDTH(TheText)');
			const bytes = await fixture({
				pages: [{ id: '0', contents: contents() }],
				...(scope === 'style'
					? { document: `<StyleSheets><StyleSheet ID="2">${formula}</StyleSheet></StyleSheets>` }
					: {}),
				...(scope === 'master' ? { masters: [{ id: '1', shapes: shape('1', formula) }] } : {}),
				...(scope === 'metadata'
					? {
							edit: (zip) =>
								zip.file(
									'visio/custom.xml',
									`<Metadata xmlns="http://schemas.microsoft.com/office/visio/2012/main">${formula}</Metadata>`,
								),
						}
					: {}),
			});
			await expect(editVsdx(bytes, [edit])).rejects.toMatchObject({
				code: 'EDIT_UNSUPPORTED_FORMAT_DEPENDENCY',
			});
		},
	);
	it('preserves unrelated static caches and page-local shape references', async () => {
		const bytes = await fixture({
			pages: [
				{ id: '0', contents: contents(cell('Width', 3, '1+2') + '<Unknown payload="keep"/>') },
				{ id: '1', contents: contents(cell('TxtWidth', 'Old', 'Sheet.1!TheText')) },
			],
			edit: (zip) => zip.file('custom/untouched.bin', new Uint8Array([0, 255])),
		});
		const saved = await editVsdx(bytes, [edit]);
		expect((await parseVsdx(saved.bytes)).pages[0]!.shapes[0]!.text.plainText).toBe('Changed');
		const before = await VisioPackage.open(bytes),
			after = await VisioPackage.open(saved.bytes);
		for (const path of before.paths())
			if (path !== 'visio/pages/page1.xml')
				expect(await after.readBytes(path)).toEqual(await before.readBytes(path));
		const xml = new TextDecoder().decode(await after.readBytes('visio/pages/page1.xml'));
		expect(xml).toContain('F="1+2"');
		expect(xml).toContain('payload="keep"');
	});
	it('does not treat a literal string as a reference', async () => {
		const bytes = await fixture({
			pages: [
				{
					id: '0',
					contents: contents(cell('User.Label', 'Sheet.1!TheText', '&quot;Sheet.1!TheText&quot;')),
				},
			],
		});
		expect((await editVsdx(bytes, [edit])).changedParts).toEqual(['visio/pages/page1.xml']);
	});
	it('preserves exact no-op bytes without evaluating irrelevant unknown formulas', async () => {
		const bytes = await fixture({
			pages: [{ id: '0', contents: contents(cell('Width', 1, 'UNKNOWN(1)')) }],
		});
		const saved = await editVsdx(bytes, [{ ...edit, text: 'Old' }]);
		expect(saved.bytes).toEqual(bytes);
		expect(saved.changedParts).toEqual([]);
	});
	it('refuses a late dependency atomically after an earlier plain text write', async () => {
		const bytes = await fixture({
			pages: [
				{
					id: '0',
					contents: `<Shapes>${shape('1', '<Text>Old</Text>')}${shape('2', '<Text>Other</Text>' + cell('TxtWidth', 1, 'TheText'))}</Shapes>`,
				},
			],
		});
		const original = bytes.slice();
		await expect(editVsdx(bytes, [edit, { ...edit, shapeId: '2' }])).rejects.toMatchObject({
			code: 'EDIT_UNSUPPORTED_FORMAT_DEPENDENCY',
		});
		expect(bytes).toEqual(original);
	});
});
