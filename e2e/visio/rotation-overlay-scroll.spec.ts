import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import { openDemo } from './demo-page';
for (const framework of ['vanilla', 'react', 'vue', 'angular', 'svelte', 'solid']) {
	test(`${framework}: rotation overlay does not grow the scrollable canvas`, async ({ page }) => {
		const directory = process.env.VISIO_NATIVE_ROTATE_DIR;
		test.skip(!directory, 'Set VISIO_NATIVE_ROTATE_DIR to a native capture.');
		await openDemo(
			page,
			framework === 'vanilla' ? '/demo/?sample=1' : `/demo-${framework}/?sample=1`,
		);
		await page.locator('#file').setInputFiles(join(directory!, 'ellipse-edited.vsdx'));
		await expect(page.locator('#file-name')).toHaveText('ellipse-edited.vsdx');
		const viewer = page.locator('visio-viewer');
		await viewer.evaluate((element) => {
			(element as unknown as { zoom: number }).zoom = 2;
		});
		const shape = viewer.locator('[data-shape-id="5"]');
		await shape.focus();
		await shape.press('Enter');
		await expect(viewer.locator('[data-rotation-handle="5"]')).toBeVisible();
		const viewport = viewer.locator('.viewport');
		const extent = async () =>
			viewport.evaluate(async (element) => {
				element.scrollTop = element.scrollHeight;
				element.scrollLeft = element.scrollWidth;
				await new Promise<void>((resolve) =>
					requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
				);
				return {
					width: element.scrollWidth,
					height: element.scrollHeight,
					handles: element.querySelectorAll('[data-rotation-handle]').length,
				};
			});
		const first = await extent();
		expect(first.handles).toBe(1);
		expect(await extent()).toEqual(first);
		expect(await extent()).toEqual(first);
	});
}
