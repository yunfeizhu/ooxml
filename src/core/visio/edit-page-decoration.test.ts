import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { editVsdx } from './edit';
import { parseVsdx } from './parser';
import { createVsdx } from './create-document';
import { fixture } from './test-fixtures';
import { visioFitToDrawingEdits, visioPageDecorationState } from './ui/page-setup';
import type { VisioEdit } from './edit-commands';

const background = (style: 'solid' | 'band' | null, color?: string): VisioEdit => ({
	type: 'set-page-decoration',
	pageId: '0',
	backgroundPageId: '1',
	kind: 'background',
	style,
	...(color ? { color } : {}),
});

describe('page decorations', () => {
	it('creates a VBackground page with a full-page background and assigns it', async () => {
		const saved = await editVsdx(await createVsdx(), [background('solid')]);
		const document = await parseVsdx(saved.bytes);
		const [page, back] = document.pages;
		expect(back).toMatchObject({ id: '1', name: 'VBackground-1', isBackground: true });
		expect(page!.backgroundPageId).toBe('1');
		expect(back!.shapes).toHaveLength(1);
		expect(back!.shapes[0]).toMatchObject({ name: 'Background Solid', width: 8.5, height: 11 });
		expect(back!.shapes[0]!.style.fill.toUpperCase()).toBe('#DEEBF7');
		expect(visioPageDecorationState(document, page!).background).toEqual({
			style: 'solid',
			color: '#DEEBF7',
		});
		const zip = await JSZip.loadAsync(saved.bytes);
		expect(await zip.file('[Content_Types].xml')!.async('string')).toContain(
			'/visio/pages/page2.xml',
		);
	});

	it('replaces the background in place and recolours it', async () => {
		const first = await editVsdx(await createVsdx(), [background('solid')]);
		const second = await editVsdx(first.bytes, [background('band', '#FF0000')]);
		const document = await parseVsdx(second.bytes);
		expect(document.pages).toHaveLength(2);
		const shapes = document.pages[1]!.shapes;
		expect(shapes.map((shape) => shape.name)).toEqual(['Background Band', 'Background Accent']);
		expect(shapes[0]!.style.fill.toUpperCase()).toBe('#FF0000');
		expect(shapes[1]!.style.fill.toUpperCase()).toBe('#BF0000');
	});

	it('adds borders and titles in front and removes the page when both are gone', async () => {
		const first = await editVsdx(await createVsdx(), [
			background('solid'),
			{ type: 'set-page-decoration', pageId: '0', kind: 'border', style: 'banner', title: 'Plan' },
		]);
		let document = await parseVsdx(first.bytes);
		expect(document.pages[1]!.shapes.map((shape) => shape.name)).toEqual([
			'Background Solid',
			'Border Banner',
			'Border Accent',
			'Title',
		]);
		expect(document.pages[1]!.shapes[3]!.text.plainText).toBe('Plan');
		expect(visioPageDecorationState(document, document.pages[0]!).border).toEqual({
			style: 'banner',
			title: 'Plan',
		});
		const noBackground = await editVsdx(first.bytes, [background(null)]);
		document = await parseVsdx(noBackground.bytes);
		expect(document.pages[1]!.shapes.map((shape) => shape.name)).toEqual([
			'Border Banner',
			'Border Accent',
			'Title',
		]);
		const none = await editVsdx(noBackground.bytes, [
			{ type: 'set-page-decoration', pageId: '0', kind: 'border', style: null },
		]);
		document = await parseVsdx(none.bytes);
		expect(document.pages.map((page) => page.id)).toEqual(['0']);
		expect(document.pages[0]!.backgroundPageId).toBeUndefined();
		const zip = await JSZip.loadAsync(none.bytes);
		expect(zip.file('visio/pages/page2.xml')).toBeNull();
	});

	it('refuses pages it does not manage', async () => {
		const bytes = await fixture({
			pages: [
				{ id: '0', contents: '', attributes: 'BackPage="1"' },
				{ id: '1', contents: '', attributes: 'Background="1"' },
			],
		});
		await expect(editVsdx(bytes, [background('solid')])).rejects.toMatchObject({
			code: 'EDIT_UNSUPPORTED_PAGE_DECORATION',
		});
		await expect(
			editVsdx(bytes, [{ ...background('solid'), pageId: '1' } as VisioEdit]),
		).rejects.toMatchObject({ code: 'EDIT_UNSUPPORTED_PAGE_DECORATION' });
		expect((await editVsdx(await createVsdx(), [background(null)])).changedParts).toEqual([]);
	});
});

describe('fit to drawing and auto size', () => {
	const drawing = async () =>
		(
			await editVsdx(await createVsdx(), [
				{ type: 'create-rectangle', pageId: '0', shapeId: '1', x: 3, y: 4, width: 2, height: 1 },
				{ type: 'create-ellipse', pageId: '0', shapeId: '2', x: 5, y: 6, width: 2, height: 2 },
			])
		).bytes;
	it('fits the page to the shapes and moves them onto it in one transaction', async () => {
		const bytes = await drawing();
		const page = (await parseVsdx(bytes)).pages[0]!;
		const edits = visioFitToDrawingEdits(page);
		expect(Array.isArray(edits)).toBe(true);
		const saved = await editVsdx(bytes, edits as VisioEdit[]);
		const after = (await parseVsdx(saved.bytes)).pages[0]!;
		expect(after.width).toBeCloseTo(4);
		expect(after.height).toBeCloseTo(3.5);
		expect(after.shapes[0]!.rotation).toMatchObject({ pinX: 1, pinY: 0.5 });
		expect(after.shapes[1]!.rotation!.pinX).toBeCloseTo(3);
		expect(after.shapes[1]!.rotation!.pinY).toBeCloseTo(2.5);
		expect(visioFitToDrawingEdits((await parseVsdx(await createVsdx())).pages[0]!)).toBe(
			'The page has no shapes to fit.',
		);
	});
	it('still refuses other mixed page and shape transactions', async () => {
		await expect(
			editVsdx(await drawing(), [
				{ type: 'rename-page', pageId: '0', name: 'X' },
				{ type: 'move-shape', pageId: '0', shapeId: '1', x: 1, y: 1 },
			]),
		).rejects.toMatchObject({ code: 'EDIT_MIXED_PAGE_TRANSACTION' });
	});
	it('grows an Auto Size page right and up in whole tiles', async () => {
		const auto = await editVsdx(await createVsdx(), [
			{ type: 'set-page-setup', pageId: '0', autoSize: true },
		]);
		const saved = await editVsdx(auto.bytes, [
			{ type: 'create-rectangle', pageId: '0', shapeId: '1', x: 10, y: 12, width: 2, height: 1 },
		]);
		expect(saved.diagnostics.map((note) => note.code)).toContain('edit-page-auto-size');
		const page = (await parseVsdx(saved.bytes)).pages[0]!;
		expect([page.width, page.height]).toEqual([17, 22]);
		expect(page.drawingResizeType).toBe(1);
		const inside = await editVsdx(saved.bytes, [
			{ type: 'move-shape', pageId: '0', shapeId: '1', x: 2, y: 2 },
		]);
		expect(inside.diagnostics.map((note) => note.code)).not.toContain('edit-page-auto-size');
		const fixedPage = await editVsdx(await createVsdx(), [
			{ type: 'create-rectangle', pageId: '0', shapeId: '1', x: 10, y: 12, width: 2, height: 1 },
		]);
		expect((await parseVsdx(fixedPage.bytes)).pages[0]!.width).toBe(8.5);
	});
});
