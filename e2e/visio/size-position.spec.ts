import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { expect, test } from '@playwright/test';
import { createVsdx, editVsdx, parseVsdx } from 'ooxml-core/visio';
import type { VisioViewerElement } from 'ooxml-ui/visio';
import { downloadCopy, taskPane } from './ribbon';
import { openDemo } from './demo-page';

async function fixture(scale: number): Promise<Uint8Array> {
	const zip = await JSZip.loadAsync(await createVsdx());
	const path = 'visio/pages/pages.xml';
	zip.file(
		path,
		(await zip.file(path)!.async('string')).replace(
			'N="DrawingScale" V="1"',
			`N="DrawingScale" V="${scale}"`,
		),
	);
	return (
		await editVsdx(await zip.generateAsync({ type: 'uint8array' }), [
			{
				type: 'create-rectangle',
				pageId: '0',
				shapeId: '1',
				x: 2,
				y: 3,
				width: 2,
				height: 1,
				text: 'Numeric shape',
			},
			{ type: 'create-rectangle', pageId: '0', shapeId: '2', x: 5, y: 4, width: 1, height: 1 },
		])
	).bytes;
}
for (const [index, framework] of [
	'vanilla',
	'react',
	'vue',
	'angular',
	'svelte',
	'solid',
].entries()) {
	test(`${framework}: Size & Position edits drawing values and preserves source history`, async ({
		page,
	}) => {
		const scale = [0.5, 1, 2][index % 3]!;
		const bytes = await fixture(scale);
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.setViewportSize({ width: 1600, height: 1000 });
		await openDemo(
			page,
			framework === 'vanilla' ? '/demo/?sample=1' : `/demo-${framework}/?sample=1`,
		);
		const viewer = page.locator('visio-viewer');
		await page.locator('#file').setInputFiles({
			name: 'Numeric.vsdx',
			mimeType: 'application/vnd.ms-visio.drawing',
			buffer: Buffer.from(bytes),
		});
		await expect(page.locator('#file-name')).toHaveText('Numeric.vsdx');
		await expect(viewer.locator('svg.paper')).toContainText('Numeric shape');
		await viewer.locator('svg.paper [data-shape-id="1"]').first().click();
		await taskPane(viewer, 'Size & Position');
		const pane = viewer.getByRole('region', { name: 'Size & Position', exact: true });
		await expect(pane).toBeVisible();
		const x = pane.getByRole('spinbutton', { name: 'X (in)', exact: true });
		const width = pane.getByRole('spinbutton', { name: 'Width (in)', exact: true });
		const angle = pane.getByRole('spinbutton', { name: 'Angle (°)', exact: true });
		await expect(x).toHaveValue('2');
		await expect(width).toHaveValue('2');
		await x.fill('3');
		await x.press('Enter');
		await expect(x).toBeEnabled();
		await width.fill('4');
		await width.press('Enter');
		await expect(width).toBeEnabled();
		await angle.fill('-45');
		await angle.press('Enter');
		await expect(angle).toBeEnabled();
		await expect(pane.getByRole('status')).toHaveText('Shape updated.');
		const geometry = await viewer.evaluate((node) => {
			const controller = (node as VisioViewerElement).controller;
			const shape = controller.state.document!.pages[0]!.shapes[0]!;
			return {
				width: shape.width,
				height: shape.height,
				pinX: shape.rotation!.pinX,
				pinY: shape.rotation!.pinY,
				angle: shape.rotation!.angle,
			};
		});
		expect(geometry.width).toBeCloseTo(4 / scale, 12);
		expect(geometry.height).toBeCloseTo(1 / scale, 12);
		expect(geometry.pinX).toBeCloseTo(3 / scale, 12);
		expect(geometry.pinY).toBeCloseTo(3 / scale, 12);
		expect(geometry.angle).toBeCloseTo(-Math.PI / 4, 12);
		const unchanged = await viewer.evaluate((node) =>
			Array.from((node as VisioViewerElement).exportVsdx().bytes),
		);
		await angle.press('Enter');
		await angle.blur();
		expect(
			await viewer.evaluate((node) => Array.from((node as VisioViewerElement).exportVsdx().bytes)),
		).toEqual(unchanged);
		await width.fill('0');
		await width.press('Enter');
		await expect(pane.getByRole('alert')).toBeVisible();
		expect(
			await viewer.evaluate((node) => Array.from((node as VisioViewerElement).exportVsdx().bytes)),
		).toEqual(unchanged);
		await width.press('Escape');
		await expect(width).toHaveValue('4');
		const downloading = page.waitForEvent('download');
		const downloadButton = await downloadCopy(viewer);
		await downloadButton.click();
		const saved = await parseVsdx(await readFile((await (await downloading).path())!));
		expect(saved.pages[0]!.shapes[0]!.rotation!.angle).toBeCloseTo(-Math.PI / 4, 12);
		await viewer.evaluate(async (node) => {
			const element = node as VisioViewerElement;
			await element.undo();
			await element.undo();
			await element.undo();
		});
		expect(
			await viewer.evaluate((node) => Array.from((node as VisioViewerElement).exportVsdx().bytes)),
		).toEqual(Array.from(bytes));
		await viewer.evaluate((node) => (node as VisioViewerElement).selectAll());
		await expect(x).toBeDisabled();
		expect(errors).toEqual([]);
	});
}
