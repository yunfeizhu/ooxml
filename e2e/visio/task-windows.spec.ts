import { test, expect } from '@playwright/test';
import { taskPane, zoomPreset } from './ribbon';
import { openDemo } from './demo-page';

test('closed Shapes window leaves a strip that reopens it', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await openDemo(page);
	const viewer = page.locator('visio-viewer');
	await expect(viewer.locator('svg.paper')).toHaveCount(1);
	const strip = viewer.getByRole('button', { name: 'Open Shapes' });
	await expect(strip).toBeHidden();
	await viewer.locator('.shapes-pane .pane-collapse').click();
	await expect(viewer.locator('.shapes-pane')).toBeHidden();
	await expect(strip).toBeVisible();
	expect((await strip.boundingBox())?.width).toBeLessThanOrEqual(30);
	await strip.click();
	await expect(viewer.locator('.shapes-pane')).toBeVisible();
	await expect(strip).toBeHidden();
});

test('Pan & Zoom outlines the visible area and pans the drawing window', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await openDemo(page);
	const viewer = page.locator('visio-viewer');
	await expect(viewer.locator('svg.paper')).toHaveCount(1);
	await zoomPreset(viewer, 200);
	await taskPane(viewer, 'Pan & Zoom');
	const window = viewer.getByRole('region', { name: 'Pan & Zoom' });
	await expect(window).toBeVisible();
	const frame = window.locator('.pan-zoom-frame');
	const thumb = (await window.locator('.pan-zoom-view svg').boundingBox())!;
	const before = (await frame.boundingBox())!;
	// At 200% only part of the page is visible.
	expect(before.width).toBeLessThan(thumb.width);
	const viewport = viewer.locator('.viewport');
	const scroll = () => viewport.evaluate((el) => ({ left: el.scrollLeft, top: el.scrollTop }));
	const start = await scroll();
	await page.mouse.click(thumb.x + thumb.width - 4, thumb.y + thumb.height - 4);
	await expect.poll(async () => (await scroll()).top).toBeGreaterThan(start.top);
	await expect.poll(async () => (await frame.boundingBox())!.y).toBeGreaterThan(before.y);
	await window.getByRole('button', { name: 'Close Pan & Zoom' }).click();
	await expect(window).toBeHidden();
});
