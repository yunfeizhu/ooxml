import { test, expect } from '@playwright/test';
import { fileBackstage, openFind, taskPane, zoomPreset } from './ribbon';
import { openDemo } from './demo-page';

test('shared editor matches compact chrome geometry and keeps all navigation functional', async ({
	page,
}) => {
	await page.setViewportSize({ width: 1440, height: 1000 });
	await openDemo(page);
	const viewer = page.locator('visio-viewer');
	await expect(viewer.locator('svg.paper')).toHaveCount(1);
	await expect(viewer.getByRole('tab', { name: 'Home', exact: true })).toHaveAttribute(
		'aria-selected',
		'true',
	);
	// Visio's layout: Shapes window on the left and pages only as bottom tabs.
	const shapes = await viewer.locator('.shapes-pane').boundingBox();
	expect(shapes?.width).toBe(232);
	await expect(viewer.locator('.page-rail')).toHaveCount(0);
	// No task pane is open by default, as in Visio.
	await expect(viewer.locator('.inspector-pane')).toBeHidden();
	const tabs = await viewer.locator('office-ui-tab-strip').boundingBox();
	expect(tabs?.height).toBeGreaterThanOrEqual(26);
	expect(tabs?.height).toBeLessThanOrEqual(36);
	expect((await viewer.locator('office-ui-ribbon .head').boundingBox())?.height).toBe(36);
	expect(
		(await viewer.locator('office-ui-status-bar.status').boundingBox())?.height,
	).toBeGreaterThanOrEqual(28);
	expect(
		(await viewer.locator('office-ui-status-bar.status').boundingBox())?.height,
	).toBeLessThanOrEqual(36);
	// Visio's All pages list beside the page tabs.
	await viewer.getByRole('button', { name: 'All', exact: true }).click();
	await viewer.locator('[data-menu="all-pages"] office-ui-menu-item[label="Architecture"]').click();
	await expect(viewer.locator('svg.paper')).toHaveAttribute('aria-label', 'Architecture');
	await expect(viewer.getByRole('tab', { name: 'Architecture', exact: true })).toHaveAttribute(
		'aria-selected',
		'true',
	);
	await expect(viewer.locator('[data-page-status]')).toHaveAttribute('value', 'Page 2 of 2');
	await expect(
		viewer.locator('[data-menu="all-pages"] office-ui-menu-item[label="Architecture"]'),
	).toHaveAttribute('checked', 'true');
	await taskPane(viewer, 'Shapes');
	await expect(viewer.locator('.shapes-pane')).toBeHidden();
	await taskPane(viewer, 'Shapes');
	await expect(viewer.locator('.shapes-pane')).toBeVisible();
	await viewer.getByRole('button', { name: 'Zoom in', exact: true }).click();
	await zoomPreset(viewer, 100);
	await expect(viewer.locator('output')).toHaveText('100%');
	await viewer.getByRole('button', { name: 'Fit to Window', exact: true }).click();
	const canvas = await viewer.locator('.viewport').boundingBox();
	const drawing = await viewer.locator('.viewport > svg').boundingBox();
	expect(
		Math.abs(drawing!.y + drawing!.height / 2 - canvas!.y - canvas!.height / 2),
	).toBeLessThanOrEqual(1);
	await viewer.getByRole('tab', { name: 'View', exact: true }).focus();
	await page.keyboard.press('ArrowLeft');
	await expect(viewer.getByRole('tab', { name: 'Review', exact: true })).toBeFocused();
	await page.keyboard.press('Home');
	await expect(viewer.getByRole('tab', { name: 'Home', exact: true })).toBeFocused();
	await (await openFind(viewer)).fill('framework');
	await viewer.getByRole('button', { name: 'Next matching shape' }).click();
	await expect(viewer.locator('[data-width-status]')).toHaveAttribute('value', 'Width: 2 in.');
	// Shape Data opens as a titled task pane and closes from its own button.
	await taskPane(viewer, 'Shape Data');
	const pane = viewer.locator('office-ui-task-pane.inspector-pane');
	await expect(pane).toBeVisible();
	expect((await pane.boundingBox())?.width).toBe(288);
	await expect(pane.locator('.shape-inspector')).toContainText('ID 1');
	await pane.getByRole('button', { name: 'Close Shape Data', exact: true }).click();
	await expect(pane).toBeHidden();
	// Compatibility notes live in File > Info.
	await fileBackstage(viewer, 'info');
	await expect(viewer.locator('.backstage-notes')).toContainText('Compatibility');
	await expect(viewer.locator('.backstage-notes li').first()).toBeVisible();
	await viewer.locator('[data-backstage="back"]').click();
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
});

test('mobile keeps page navigation, editing disclosures and zoom controls reachable', async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await openDemo(page);
	const viewer = page.locator('visio-viewer');
	await expect(viewer.locator('.shapes-pane')).toBeHidden();
	await expect(viewer.locator('svg.paper')).toBeVisible();
	await viewer.getByRole('tab', { name: 'Home', exact: true }).click();
	await viewer.getByRole('tab', { name: 'Architecture', exact: true }).click();
	await expect(viewer.locator('svg.paper')).toHaveAttribute('aria-label', 'Architecture');
	const pagePicker = await viewer
		.getByRole('tab', { name: 'Architecture', exact: true })
		.boundingBox();
	expect(pagePicker?.width).toBeGreaterThanOrEqual(44);
	expect(pagePicker?.height).toBeGreaterThanOrEqual(44);
	for (const control of [
		viewer.getByRole('button', { name: 'Fit page to current window', exact: true }),
		viewer.getByRole('button', { name: 'Zoom in', exact: true }),
		viewer.getByRole('button', { name: 'Next page', exact: true }),
	]) {
		const box = await control.boundingBox();
		expect(box?.width).toBeGreaterThanOrEqual(44);
		expect(box?.height).toBeGreaterThanOrEqual(44);
	}
	await viewer.getByRole('tab', { name: 'Release workflow', exact: true }).click();
	await expect(viewer.locator('svg.paper')).toHaveAttribute('aria-label', 'Release workflow');
	await taskPane(viewer, 'Shapes');
	await expect(viewer.locator('.shapes-pane')).toBeVisible();
	await taskPane(viewer, 'Shape Data');
	await expect(viewer.locator('.inspector-pane')).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test.describe('touch-enabled tablet chrome', () => {
	test.use({ hasTouch: true, viewport: { width: 1024, height: 900 } });
	test('enlarges compact commands to touch targets for coarse pointers', async ({ page }) => {
		await openDemo(page);
		const viewer = page.locator('visio-viewer');
		await expect(viewer.locator('svg.paper')).toBeVisible();
		for (const selector of [
			'[data-tab="home"]',
			'office-ui-tab-strip [aria-label="Next page"]',
			'office-ui-zoom-slider .fit',
			'office-ui-zoom-slider [aria-label="Zoom in"]',
		]) {
			const box = await viewer.locator(selector).boundingBox();
			expect(box?.width).toBeGreaterThanOrEqual(44);
			expect(box?.height).toBeGreaterThanOrEqual(44);
		}
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
			1024,
		);
	});
});
