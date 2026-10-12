import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { editVsdx } from './edit';
import { parseVsdx } from './parser';
import { createVsdx } from './create-document';
import { VISIO_PAGE_LAYOUT_DEFAULTS, visioPageLayout } from './page-layout';
import { snapshotEdits } from './ui/edit-commands';
import type { VisioEdit } from './edit-commands';

const pagesXml = async (bytes: Uint8Array) =>
	(await JSZip.loadAsync(bytes)).file('visio/pages/pages.xml')!.async('string');
const layout = (edit: Partial<VisioEdit>): VisioEdit =>
	({ type: 'set-page-layout', pageId: '0', ...edit }) as VisioEdit;

describe('page layout cells', () => {
	it('reads Visio defaults for a page that stores none of the cells', async () => {
		const page = (await parseVsdx(await createVsdx())).pages[0]!;
		expect(page.layout).toBeUndefined();
		expect(visioPageLayout(page)).toEqual(VISIO_PAGE_LAYOUT_DEFAULTS);
		expect(visioPageLayout(page)).toMatchObject({
			lineJumpCode: 1,
			gridDensityX: 8,
			rulerDensityX: 32,
		});
	});

	it('writes line jump, grid and ruler cells as Visio does and reads them back', async () => {
		const bytes = await createVsdx();
		const saved = await editVsdx(bytes, [
			layout({
				lineJumpCode: 0,
				lineJumpStyle: 2,
				gridDensityX: 0,
				gridSpacingX: 0.5,
				gridOriginX: 1,
				rulerDensityY: 8,
				rulerOriginX: 2,
			}),
		]);
		expect(saved.changedParts).toEqual(['visio/pages/pages.xml']);
		const xml = await pagesXml(saved.bytes);
		// The form recorded from Visio 16: plain values, a unit on lengths.
		expect(xml).toContain('N="LineJumpCode" V="0"');
		expect(xml).toContain('N="LineJumpStyle" V="2"');
		expect(xml).toContain('N="XGridDensity" V="0"');
		expect(xml).toMatch(/N="XGridSpacing" V="0\.5" U="IN"/);
		expect(xml).toMatch(/N="XGridOrigin" V="1" U="IN"/);
		expect(xml).toContain('N="YRulerDensity" V="8"');
		expect(xml).toMatch(/N="XRulerOrigin" V="2" U="IN"/);
		// Untouched cells are not written.
		expect(xml).not.toContain('YGridDensity');
		const page = (await parseVsdx(saved.bytes)).pages[0]!;
		expect(page.layout).toEqual({
			lineJumpCode: 0,
			lineJumpStyle: 2,
			gridDensityX: 0,
			gridSpacingX: 0.5,
			gridOriginX: 1,
			rulerDensityY: 8,
			rulerOriginX: 2,
		});
		expect(visioPageLayout(page).gridDensityY).toBe(8);
	});

	it('changes nothing when the values are already the page values or the defaults', async () => {
		const bytes = await createVsdx();
		const same = await editVsdx(bytes, [layout({ lineJumpCode: 1, gridDensityX: 8 })]);
		expect(same.changedParts).toEqual([]);
		const off = await editVsdx(bytes, [layout({ lineJumpCode: 0 })]);
		const again = await editVsdx(off.bytes, [layout({ lineJumpCode: 0 })]);
		expect(again.changedParts).toEqual([]);
		// Back to the default: the cell stays, with the default value.
		const on = await editVsdx(off.bytes, [layout({ lineJumpCode: 1 })]);
		expect(await pagesXml(on.bytes)).toContain('N="LineJumpCode" V="1"');
	});

	it('rejects values Visio does not have', () => {
		for (const edit of [
			layout({}),
			layout({ lineJumpCode: 6 }),
			layout({ lineJumpStyle: 9 }),
			layout({ gridDensityX: 3 }),
			layout({ rulerDensityX: 4 }),
			layout({ gridSpacingY: -1 }),
			layout({ rulerOriginY: Number.NaN }),
		])
			expect(() => snapshotEdits([edit])).toThrow();
		expect(snapshotEdits([layout({ lineJumpCode: 0 })])).toEqual([
			{ type: 'set-page-layout', pageId: '0', lineJumpCode: 0 },
		]);
	});

	it('refuses a missing page', async () => {
		await expect(
			editVsdx(await createVsdx(), [{ ...layout({ lineJumpCode: 0 }), pageId: '9' } as VisioEdit]),
		).rejects.toMatchObject({ code: 'EDIT_TARGET_NOT_FOUND' });
	});
});
