import { test, expect } from '@playwright/test';
import { loadSampleTemplate, openFind, taskPane } from './ribbon';
import { createVsdxFixture } from './fixture.mjs';
import { openDemo } from './demo-page';

test('mobile Tools exposes Visio groups, opens Find and edits text with F2', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await openDemo(page);
	const viewer = page.locator('visio-viewer');
	await viewer.locator('[data-shape-id="1"]').click();
	const tools = viewer.locator('.ribbon-tools>summary');
	await tools.click();
	for (const name of ['Pointer Tool', 'Find', 'Layers'])
		await expect(viewer.getByRole('button', { name, exact: true })).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(tools).toBeFocused();
	const search = await openFind(viewer);
	await expect(viewer.locator('.ribbon-tools')).not.toHaveAttribute('open');
	await expect(search).toBeFocused();
	await search.fill('idea');
	await page.keyboard.press('Escape');
	await expect(search).toHaveValue('');
	await page.keyboard.press('Escape');
	await expect(viewer.locator('.find-bar')).toBeHidden();
	// F2 edits the selected shape's text in place; Esc keeps it.
	await viewer.locator('.viewport').focus();
	await page.keyboard.press('F2');
	const editor = viewer.locator('#edit-text');
	await expect(editor).toBeFocused();
	await expect(editor).toHaveValue('Start with an idea');
	await editor.press('Escape');
	await expect(editor).toHaveCount(0);
});

test('mobile documentation menu keeps the heading near the top and navigates sections', async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/getting-started.html');
	const title = await page.locator('.vp-doc h1').boundingBox();
	expect(title!.y).toBeLessThan(260);
	// VitePress 2 has a navigation hamburger too; this is the page's sidebar menu.
	await page.locator('button.menu[aria-controls="VPSidebarNav"]').click();
	await page
		.getByRole('navigation', { name: 'Sidebar Navigation' })
		.getByRole('link', { name: 'Architecture', exact: true })
		.click();
	await expect(page.locator('.vp-doc h1')).toContainText('Architecture');
});

test('opening screen supports browse cancellation, rejected input and repeated sample entry', async ({
	page,
}) => {
	await page.goto('/demo/');
	await expect(page.locator('#start-screen')).toBeVisible();
	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('button', { name: 'Browse files', exact: true }).click();
	await chooser;
	await expect(page.locator('#start-screen')).toBeVisible();
	await page.locator('#file').setInputFiles({
		name: 'broken.vsdx',
		mimeType: 'application/octet-stream',
		buffer: Buffer.from('not a zip'),
	});
	await expect(page.locator('#error')).toBeVisible();
	await expect(page.locator('#start-screen')).toBeVisible();
	await page.getByRole('button', { name: 'Open the sample drawing', exact: true }).click();
	await expect(page.locator('#start-screen')).toBeHidden();
	await expect(page.locator('#error')).toBeHidden();
	await expect(page.locator('visio-viewer .viewport>svg')).toBeVisible();
	// Visio's File backstage: Escape returns to the drawing with focus on File.
	const viewer = page.locator('visio-viewer');
	await viewer.locator('office-ui-ribbon .file').click();
	await expect(viewer.locator('.backstage')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(viewer.locator('.backstage')).toBeHidden();
	await expect(viewer.locator('office-ui-ribbon .file')).toBeFocused();
	await loadSampleTemplate(viewer);
	await expect(viewer.locator('.backstage')).toBeHidden();
});

test('mobile local file opens into bounded canvas and a task pane can close and survive resize', async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/demo/');
	await page.locator('#file').setInputFiles({
		name: 'local.vsdx',
		mimeType: 'application/vnd.ms-visio.drawing',
		buffer: await createVsdxFixture(),
	});
	await expect(page.locator('#start-screen')).toBeHidden();
	await expect(page.locator('#file-name')).toHaveText('local.vsdx');
	const viewer = page.locator('visio-viewer');
	await expect(viewer.locator('.inspector-pane')).toBeHidden();
	await taskPane(viewer, 'Shape Data');
	await expect(viewer.locator('.inspector-pane')).toBeVisible();
	await viewer.getByRole('button', { name: 'Close Shape Data', exact: true }).click();
	await page.setViewportSize({ width: 1440, height: 900 });
	await expect(viewer.locator('.inspector-pane')).toBeHidden();
	await taskPane(viewer, 'Shape Data');
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(viewer.locator('.inspector-pane')).toBeVisible();
	await viewer.getByRole('button', { name: 'Close Shape Data', exact: true }).click();
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
