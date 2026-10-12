import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { editVsdx } from './edit';
import { parseVsdx } from './parser';
import { createVsdx } from './create-document';
import { fixture, cell, shape } from './test-fixtures';
import { snapshotEdits } from './ui/edit-commands';
import {
	visioMatchingPaperSize,
	visioOrientationEdits,
	visioPageBreaks,
	visioPageSizePresetEdits,
} from './ui/page-setup';
import type { VisioEdit } from './edit-commands';

const pagesXml = async (bytes: Uint8Array) =>
	(await JSZip.loadAsync(bytes)).file('visio/pages/pages.xml')!.async('string');
const fixed = cell('PageScale', 1) + cell('DrawingScale', 1) + cell('DrawingSizeType', 3);

describe('page setup cells', () => {
	it('writes print orientation, paper and Auto Size and reads them back', async () => {
		const bytes = await createVsdx();
		const saved = await editVsdx(bytes, [
			{
				type: 'set-page-setup',
				pageId: '0',
				printOrientation: 'landscape',
				paperKind: 9,
				autoSize: true,
			},
		]);
		expect(saved.changedParts).toEqual(['visio/pages/pages.xml']);
		const page = (await parseVsdx(saved.bytes)).pages[0]!;
		expect(page.pageSetup).toMatchObject({ printPageOrientation: 2, paperKind: 9 });
		expect(page.drawingResizeType).toBe(1);
		const off = await editVsdx(saved.bytes, [
			{ type: 'set-page-setup', pageId: '0', autoSize: false },
		]);
		expect((await parseVsdx(off.bytes)).pages[0]!.drawingResizeType).toBe(2);
		const noop = await editVsdx(off.bytes, [
			{ type: 'set-page-setup', pageId: '0', autoSize: false },
		]);
		expect(noop.changedParts).toEqual([]);
	});

	it('changes the drawing scale and keeps the physical page size', async () => {
		const bytes = await createVsdx();
		const saved = await editVsdx(bytes, [
			{ type: 'set-page-setup', pageId: '0', scale: { page: 1, drawing: 12, unit: 'FT' } },
		]);
		const page = (await parseVsdx(saved.bytes)).pages[0]!;
		expect(page.width).toBeCloseTo(8.5);
		expect(page.height).toBeCloseTo(11);
		expect(page.drawingToPageScale).toBeCloseTo(1 / 12);
		expect(page.pageSetup).toMatchObject({
			pageScale: 1,
			drawingScale: 12,
			drawingScaleUnit: 'FT',
		});
		const xml = await pagesXml(saved.bytes);
		expect(xml).toContain('N="PageWidth" V="102"');
		expect(xml).toMatch(/N="DrawingScale" V="12" U="FT"/);
		expect(xml).toContain('N="DrawingScaleType" V="3"');
	});

	it('refuses a scale change that page-dependent formulas would need to follow', async () => {
		const bytes = await fixture({
			pages: [
				{
					id: '0',
					pageCells: fixed,
					contents: `<Shapes>${shape('1', cell('PinX', 1) + cell('Width', 1, 'ThePage!DrawingScale'))}</Shapes>`,
				},
			],
		});
		await expect(
			editVsdx(bytes, [{ type: 'set-page-setup', pageId: '0', scale: { page: 1, drawing: 12 } }]),
		).rejects.toMatchObject({ code: 'EDIT_UNSUPPORTED_PAGE_SIZE_DEPENDENCY' });
	});

	it('refuses page scale cells it cannot prove', async () => {
		const bytes = await fixture({
			pages: [
				{
					id: '0',
					pageCells: cell('PageScale', 1, 'PageHeight/11') + cell('DrawingScale', 1),
					contents: '',
				},
			],
		});
		await expect(
			editVsdx(bytes, [{ type: 'set-page-setup', pageId: '0', scale: { page: 1, drawing: 2 } }]),
		).rejects.toMatchObject({ code: 'EDIT_PROTECTED_CELL' });
	});

	it('validates commands before the package is read', () => {
		const bad = [
			{ type: 'set-page-setup', pageId: '0' },
			{ type: 'set-page-setup', pageId: '0', paperKind: 0 },
			{ type: 'set-page-setup', pageId: '0', scale: { page: 0, drawing: 1 } },
			{ type: 'set-page-setup', pageId: '0', scale: { page: 1, drawing: 1, unit: 'YD' } },
			{ type: 'set-page-properties', pageId: '0' },
			{ type: 'set-page-decoration', pageId: '0', kind: 'background', style: 'stars' },
			{
				type: 'set-page-decoration',
				pageId: '0',
				kind: 'background',
				style: 'solid',
				color: 'red',
			},
			{
				type: 'set-page-decoration',
				pageId: '0',
				kind: 'border',
				style: 'simple',
				title: 'a\u0001',
			},
		];
		for (const edit of bad) expect(() => snapshotEdits([edit as VisioEdit])).toThrow();
		expect(
			snapshotEdits([
				{ type: 'set-page-setup', pageId: '0', autoSize: true, extra: 1 } as VisioEdit,
			]),
		).toEqual([{ type: 'set-page-setup', pageId: '0', autoSize: true }]);
	});

	it('orientation swaps the page and sets the print orientation in one step', async () => {
		const bytes = await createVsdx();
		const page = (await parseVsdx(bytes)).pages[0]!;
		const edits = visioOrientationEdits(page, 'landscape')!;
		expect(edits.map((edit) => edit.type)).toEqual(['set-page-size', 'set-page-setup']);
		const saved = await editVsdx(bytes, edits);
		const after = (await parseVsdx(saved.bytes)).pages[0]!;
		expect([after.width, after.height]).toEqual([11, 8.5]);
		expect(after.pageSetup?.printPageOrientation).toBe(2);
		expect(visioOrientationEdits(after, 'landscape')).toEqual([]);
	});
});

describe('size presets', () => {
	it('keep the orientation and an Auto Size page stays automatic', async () => {
		const auto = await editVsdx(await createVsdx(), [
			{ type: 'set-page-setup', pageId: '0', autoSize: true },
		]);
		const page = (await parseVsdx(auto.bytes)).pages[0]!;
		expect(visioMatchingPaperSize(page)?.id).toBe('letter');
		const edits = visioPageSizePresetEdits(page, 'a3')!;
		expect(edits.map((edit) => edit.type)).toEqual(['set-page-size', 'set-page-setup']);
		const after = (await parseVsdx((await editVsdx(auto.bytes, edits)).bytes)).pages[0]!;
		expect(after.drawingResizeType).toBe(1);
		expect(visioMatchingPaperSize(after)?.id).toBe('a3');
		expect(after.height).toBeGreaterThan(after.width);
	});
});

describe('page properties', () => {
	const three = () =>
		fixture({
			pages: [
				{ id: '0', contents: '' },
				{ id: '1', contents: '' },
				{ id: '2', contents: '', attributes: 'Background="1"' },
			],
		});
	it('turns a page into a background, listed last, and assigns it', async () => {
		const saved = await editVsdx(await three(), [
			{ type: 'set-page-properties', pageId: '0', background: true },
			{ type: 'set-page-properties', pageId: '1', backPageId: '0' },
		]);
		const pages = (await parseVsdx(saved.bytes)).pages;
		expect(pages.map((page) => [page.id, page.isBackground])).toEqual([
			['1', false],
			['2', true],
			['0', true],
		]);
		expect(pages[0]!.backgroundPageId).toBe('0');
		const cleared = await editVsdx(saved.bytes, [
			{ type: 'set-page-properties', pageId: '1', backPageId: null },
			{ type: 'set-page-properties', pageId: '0', background: false },
		]);
		const after = (await parseVsdx(cleared.bytes)).pages;
		expect(after.map((page) => page.id)).toEqual(['1', '0', '2']);
		expect(after[0]!.backgroundPageId).toBeUndefined();
	});
	it('refuses invalid page types and assignments', async () => {
		const bytes = await three();
		await expect(
			editVsdx(bytes, [
				{ type: 'set-page-properties', pageId: '0', background: true },
				{ type: 'set-page-properties', pageId: '1', background: true },
			]),
		).rejects.toMatchObject({ code: 'EDIT_LAST_FOREGROUND_PAGE' });
		await expect(
			editVsdx(bytes, [{ type: 'set-page-properties', pageId: '0', backPageId: '1' }]),
		).rejects.toMatchObject({ code: 'EDIT_INVALID_BACKGROUND' });
		await expect(
			editVsdx(bytes, [{ type: 'set-page-properties', pageId: '2', backPageId: '2' }]),
		).rejects.toMatchObject({ code: 'EDIT_INVALID_BACKGROUND' });
		const assigned = await editVsdx(bytes, [
			{ type: 'set-page-properties', pageId: '0', backPageId: '2' },
		]);
		await expect(
			editVsdx(assigned.bytes, [{ type: 'set-page-properties', pageId: '2', background: false }]),
		).rejects.toMatchObject({ code: 'EDIT_BACKGROUND_IN_USE' });
	});
});

describe('page breaks', () => {
	it('tiles the page by the printable paper', async () => {
		const bytes = await createVsdx();
		const sized = await editVsdx(bytes, [
			{ type: 'set-page-size', pageId: '0', width: 20, height: 12 },
			{ type: 'set-page-setup', pageId: '0', paperKind: 1, printOrientation: 'landscape' },
		]);
		const page = (await parseVsdx(sized.bytes)).pages[0]!;
		const breaks = visioPageBreaks(page)!;
		expect(breaks).toMatchObject({ tileWidth: 11, tileHeight: 8.5, assumedPaper: false });
		expect(breaks.columns).toEqual([11]);
		expect(breaks.rows).toEqual([8.5]);
		const fresh = (await parseVsdx(bytes)).pages[0]!;
		expect(visioPageBreaks(fresh)).toMatchObject({ columns: [], rows: [], assumedPaper: true });
	});
});
