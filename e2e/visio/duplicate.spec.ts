import { expect, test, type Locator } from '@playwright/test';
import type { VisioViewerElement } from 'ooxml-ui/visio';
import { createVsdxFixture } from './fixture.mjs';
import { downloadCopy } from './ribbon';
import { openDemo } from './demo-page';

const inventory = (viewer: Locator) =>
	viewer.evaluate((node) => {
		const state = (node as VisioViewerElement).controller.state;
		return {
			shapes: state.document!.pages[0]!.shapes.map((shape) => ({
				id: shape.id,
				x: Number(shape.rotation!.pinX.toFixed(10)),
				y: Number(shape.rotation!.pinY.toFixed(10)),
				width: shape.width,
				height: shape.height,
				text: shape.text?.plainText,
			})),
			selected: state.selectedShapes.map((shape) => shape.id),
			primary: state.selectedShape?.id ?? null,
		};
	});
const selected = async (viewer: Locator, ids: string[]) => {
	await expect
		.poll(async () => {
			const result = await inventory(viewer);
			return { selected: result.selected, primary: result.primary };
		})
		.toEqual({ selected: ids, primary: ids[0] ?? null });
	await expect(viewer.locator('svg.paper [data-selected="true"]')).toHaveCount(ids.length);
};

for (const framework of ['vanilla', 'react', 'vue', 'angular', 'svelte', 'solid']) {
	test(`${framework}: Duplicate menu, context and shortcut preserve source and selection history`, async ({
		page,
	}) => {
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.setViewportSize({ width: 1600, height: 1000 });
		await openDemo(
			page,
			framework === 'vanilla' ? '/demo/?sample=1' : `/demo-${framework}/?sample=1`,
		);
		const viewer = page.locator('visio-viewer');
		await page.locator('#file').setInputFiles({
			name: 'duplicate.vsdx',
			mimeType: 'application/vnd.ms-visio.drawing',
			buffer: await createVsdxFixture('Duplicate source'),
		});
		await expect(page.locator('#file-name')).toHaveText('duplicate.vsdx');
		await expect(viewer.locator('svg.paper')).toContainText('Duplicate source');
		await viewer.getByRole('tab', { name: 'Home', exact: true }).click();
		await viewer.locator('svg.paper [data-shape-id="1"]').click();
		await selected(viewer, ['1']);
		await expect(viewer.locator('[command="paste"] .main')).toBeEnabled();
		await expect(viewer.locator('[command="paste"] .caret')).toBeEnabled();
		await viewer.locator('[command="paste"] .caret').click();
		await viewer.locator('[command="duplicate"]').click();
		await expect(viewer.locator('svg.paper [data-shape-id]')).toHaveCount(2);
		await selected(viewer, ['2']);
		const first = await inventory(viewer);
		expect(first.shapes).toEqual([
			{ id: '1', x: 4, y: 7, width: 3, height: 1, text: 'Duplicate source' },
			{ id: '2', x: 4.33, y: 6.67, width: 3, height: 1, text: 'Duplicate source' },
		]);
		await viewer.locator('.qat [data-command="undo"]').click();
		await expect(viewer.locator('svg.paper [data-shape-id]')).toHaveCount(1);
		await selected(viewer, ['1']);
		await viewer.locator('.qat [data-command="redo"]').click();
		await selected(viewer, ['2']);
		await viewer.locator('.viewport').press('Control+a');
		await selected(viewer, ['1', '2']);
		await viewer.locator('svg.paper [data-shape-id="2"]').click({ button: 'right' });
		await viewer.locator('[command="ctx-duplicate"]').click();
		await expect(viewer.locator('svg.paper [data-shape-id]')).toHaveCount(4);
		await selected(viewer, ['3', '4']);
		await viewer.locator('.viewport').press('Control+d');
		await expect(viewer.locator('svg.paper [data-shape-id]')).toHaveCount(6);
		await selected(viewer, ['5', '6']);
		const final = await inventory(viewer);
		expect(final.shapes.slice(2).map((shape) => [shape.id, shape.x, shape.y])).toEqual([
			['3', 4.33, 6.67],
			['4', 4.66, 6.34],
			['5', 4.66, 6.34],
			['6', 4.99, 6.01],
		]);
		await viewer.locator('.qat [data-command="undo"]').click();
		await expect(viewer.locator('svg.paper [data-shape-id]')).toHaveCount(4);
		await selected(viewer, ['3', '4']);
		await viewer.locator('.qat [data-command="redo"]').click();
		await selected(viewer, ['5', '6']);
		const downloading = page.waitForEvent('download');
		await (await downloadCopy(viewer)).click();
		const stream = await (await downloading).createReadStream();
		const chunks: Buffer[] = [];
		for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
		await page.locator('#file').setInputFiles({
			name: 'reopened-duplicate.vsdx',
			mimeType: 'application/vnd.ms-visio.drawing',
			buffer: Buffer.concat(chunks),
		});
		await expect(page.locator('#file-name')).toHaveText('reopened-duplicate.vsdx');
		await expect.poll(async () => (await inventory(viewer)).shapes).toEqual(final.shapes);
		await selected(viewer, []);
		expect(errors).toEqual([]);
	});
}
