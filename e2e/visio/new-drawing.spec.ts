import { expect, test } from '@playwright/test';
import { parseVsdx } from 'ooxml-core/visio';
import type { VisioViewerElement } from 'ooxml-ui/visio';
import { createVsdxFixture } from './fixture.mjs';
import { downloadCopy } from './ribbon';
import { readFile } from 'node:fs/promises';
import { openDemo } from './demo-page';

for (const framework of ['vanilla', 'react', 'vue', 'angular', 'svelte', 'solid']) {
	test(`${framework}: File New and Ctrl+N create an editable clean source`, async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.setViewportSize({ width: 1600, height: 1000 });
		await openDemo(
			page,
			framework === 'vanilla' ? '/demo/?sample=1' : `/demo-${framework}/?sample=1`,
		);
		const viewer = page.locator('visio-viewer');
		await page.locator('#file').setInputFiles({
			name: 'Previous.vsdx',
			mimeType: 'application/vnd.ms-visio.drawing',
			buffer: await createVsdxFixture('Previous drawing'),
		});
		await expect(page.locator('#file-name')).toHaveText('Previous.vsdx');
		await expect(viewer.locator('svg.paper')).toContainText('Previous drawing');
		await viewer.locator('office-ui-ribbon .file').click();
		await viewer.locator('[data-backstage-item="new"]').click();
		const tile = viewer.locator('[data-backstage-action="new-blank"]');
		await expect(tile).toBeEnabled();
		await tile.click();
		await expect
			.poll(() => viewer.evaluate((node) => (node as VisioViewerElement).fileName))
			.toBe('New drawing.vsdx');
		await expect(viewer.locator('svg.paper [data-shape-id]')).toHaveCount(0);
		const blank = await viewer.evaluate((node) => {
			const element = node as VisioViewerElement;
			const state = element.controller.state;
			return {
				page: state.document!.pages[0]!.name,
				width: state.document!.pages[0]!.width,
				height: state.document!.pages[0]!.height,
				selected: state.selectedShapes.length,
				source: state.edit.sourceAvailable,
				dirty: state.edit.dirty,
				undo: state.edit.canUndo,
			};
		});
		expect(blank).toEqual({
			page: 'Page-1',
			width: 8.5,
			height: 11,
			selected: 0,
			source: true,
			dirty: false,
			undo: false,
		});
		await viewer.evaluate(async (node) => {
			const element = node as VisioViewerElement;
			await element.applyEdits([
				{ type: 'create-rectangle', pageId: '0', shapeId: '1', x: 2, y: 2, width: 1, height: 1 },
			]);
			await element.replacePlainText('0', '1', 'New source edit');
		});
		await expect(viewer.locator('svg.paper')).toContainText('New source edit');
		const downloadButton = await downloadCopy(viewer);
		const downloading = page.waitForEvent('download');
		await downloadButton.click();
		const downloaded = await downloading;
		const exported = await parseVsdx(await readFile((await downloaded.path())!));
		expect(exported.pages[0]!.shapes[0]!.text?.plainText).toBe('New source edit');
		await viewer.locator('.viewport').focus();
		await page.keyboard.press('Control+n');
		await expect(viewer.locator('svg.paper [data-shape-id]')).toHaveCount(0);
		await expect
			.poll(() =>
				viewer.evaluate((node) => (node as VisioViewerElement).controller.state.edit.dirty),
			)
			.toBe(false);
		await viewer.evaluate(async (node) => {
			await (node as VisioViewerElement).createBlankDrawing({ width: 6, height: 4 });
		});
		const custom = await viewer.evaluate((node) => {
			const state = (node as VisioViewerElement).controller.state;
			return {
				width: state.document!.pages[0]!.width,
				height: state.document!.pages[0]!.height,
				source: state.edit.sourceAvailable,
				dirty: state.edit.dirty,
			};
		});
		expect(custom).toEqual({ width: 6, height: 4, source: true, dirty: false });
		expect(errors).toEqual([]);
	});
}
