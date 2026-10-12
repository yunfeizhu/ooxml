import { test, expect } from '@playwright/test';
import { exportSvgCommand, loadSampleTemplate, zoomPreset } from './ribbon';
import { openDemo } from './demo-page';

test('sample supports page navigation, zoom, selection and compatibility notes', async ({
	page,
}) => {
	await openDemo(page);
	await expect(page.locator('visio-viewer svg.paper')).toBeVisible();
	await expect(page.locator('#file-name')).toHaveText('Sample workflow');
	await page
		.locator('visio-viewer')
		.getByRole('tab', { name: 'Architecture', exact: true })
		.click();
	await expect(page.locator('visio-viewer svg.paper')).toHaveAttribute(
		'aria-label',
		'Architecture',
	);
	await zoomPreset(page.locator('visio-viewer'), 100);
	await expect(page.locator('visio-viewer output')).toHaveText('100%');
	await page.locator('visio-viewer [data-shape-id="1"]').click();
	await expect(page.locator('#selection')).toContainText('Shape ID: 1');
	await expect(page.locator('#notes')).toContainText('Text metrics');
});
test('rejected inputs show an error and retain prior diagram', async ({ page }) => {
	await openDemo(page);
	await page.locator('#file').setInputFiles({
		name: 'broken.vsdx',
		mimeType: 'application/octet-stream',
		buffer: Buffer.from('not a zip'),
	});
	await expect(page.locator('#error')).toBeVisible();
	await expect(page.locator('visio-viewer svg.paper')).toHaveAttribute(
		'aria-label',
		'Release workflow',
	);
	await loadSampleTemplate(page.locator('visio-viewer'));
	await expect(page.locator('#error')).toBeHidden();
});
test('mobile layout keeps open control, canvas and notes accessible', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await openDemo(page);
	await expect(page.locator('visio-viewer office-ui-ribbon .file')).toBeVisible();
	await expect(page.locator('visio-viewer svg.paper')).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
	await page.screenshot({ path: 'test-results/mobile-workspace.png', fullPage: true });
});
test('does not make remote requests while using sample', async ({ page, baseURL }) => {
	const external: string[] = [];
	page.on('request', (request) => {
		if (!request.url().startsWith(baseURL!) && !request.url().startsWith('data:'))
			external.push(request.url());
	});
	await openDemo(page);
	await expect(page.locator('visio-viewer svg.paper')).toBeVisible();
	expect(external).toEqual([]);
	await page.screenshot({ path: 'test-results/desktop-workspace.png', fullPage: true });
});

test('opens actual synthetic VSDX locally and safely renders literal document text', async ({
	page,
}) => {
	const { createVsdxFixture } = await import('./fixture.mjs');
	await openDemo(page);
	await page.locator('#file').setInputFiles({
		name: 'sample.vsdx',
		mimeType: 'application/vnd.ms-visio.drawing',
		buffer: await createVsdxFixture('<script>literal text</script>'),
	});
	await expect(page.locator('#file-name')).toHaveText('sample.vsdx');
	await expect(page.locator('visio-viewer svg.paper')).toHaveAttribute(
		'aria-label',
		'Imported page',
	);
	await expect(page.locator('visio-viewer svg.paper text')).toContainText(
		'<script>literal text</script>',
	);
	expect(await page.locator('visio-viewer svg script').count()).toBe(0);
	await expect(page.locator('#notes')).toContainText('cached values');
});

test('back and forward navigation leave a working viewer', async ({ page }) => {
	await openDemo(page);
	await expect(page.locator('visio-viewer svg.paper')).toBeVisible();
	await page.goto('/');
	await expect(page).toHaveURL(/\/$/);
	await page.goBack();
	await expect(page.locator('visio-viewer svg.paper')).toBeVisible();
	await page
		.locator('visio-viewer')
		.getByRole('tab', { name: 'Architecture', exact: true })
		.click();
	await expect(page.locator('visio-viewer svg.paper')).toHaveAttribute(
		'aria-label',
		'Architecture',
	);
});

test('mobile primary controls have usable touch targets', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await openDemo(page);
	for (const locator of [
		page.locator('visio-viewer office-ui-ribbon .file'),
		page.locator('visio-viewer office-ui-zoom-slider .fit'),
	]) {
		const box = await locator.boundingBox();
		expect(box?.height).toBeGreaterThanOrEqual(44);
		expect(box?.width).toBeGreaterThanOrEqual(44);
	}
});

test('explicit SVG download contains the current page and leaves selection unchanged', async ({
	page,
}) => {
	await openDemo(page);
	await page
		.locator('visio-viewer')
		.getByRole('tab', { name: 'Architecture', exact: true })
		.click();
	await page.locator('visio-viewer [data-shape-id="1"]').click();
	const selection = await page.locator('#selection').textContent();
	const exportSvg = await exportSvgCommand(page.locator('visio-viewer'));
	const downloadEvent = page.waitForEvent('download');
	await exportSvg.click();
	const download = await downloadEvent;
	expect(download.suggestedFilename()).toBe('Sample workflow-page-2.svg');
	const stream = await download.createReadStream();
	const chunks: Buffer[] = [];
	for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
	const svg = Buffer.concat(chunks).toString('utf8');
	expect(svg).toContain('Architecture');
	expect(svg).toContain('<metadata>');
	expect(svg).not.toContain('blob:');
	expect(svg).not.toContain('data-shape-id');
	expect(svg).not.toContain('tabindex');
	await expect(page.locator('#selection')).toHaveText(selection!);
	await expect(page.locator('visio-viewer svg.paper')).toHaveAttribute(
		'aria-label',
		'Architecture',
	);
	await expect(page.locator('visio-viewer [data-status]')).toContainText('approximate snapshot');
});

test('isolated import renders the bounded embedded EMF subset and safely omits other records', async ({
	page,
	baseURL,
}) => {
	const { createMetafileFixture } = await import('./metafile-fixture.mjs');
	const external: string[] = [];
	page.on('request', (request) => {
		if (!request.url().startsWith(baseURL!) && !request.url().startsWith('data:'))
			external.push(request.url());
	});
	await openDemo(page);
	await page.locator('#file').setInputFiles({
		name: 'vector.vsdx',
		mimeType: 'application/vnd.ms-visio.drawing',
		buffer: await createMetafileFixture(),
	});
	await expect(page.locator('#file-name')).toHaveText('vector.vsdx');
	await expect(page.locator('visio-viewer [data-shape-id="emf"] svg path').first()).toBeVisible();
	await expect(page.locator('#notes')).toContainText('bounded EMF primitive subset');
	expect(external).toEqual([]);
	await page.locator('#file').setInputFiles({
		name: 'unsupported.vsdx',
		mimeType: 'application/vnd.ms-visio.drawing',
		buffer: await createMetafileFixture(true),
	});
	await expect(page.locator('#file-name')).toHaveText('unsupported.vsdx');
	await expect(page.locator('visio-viewer [data-shape-id="emf"] svg')).toHaveCount(0);
	await expect(page.locator('#notes')).toContainText('conversion subset');
	await loadSampleTemplate(page.locator('visio-viewer'));
	await expect(page.locator('visio-viewer svg.paper')).toHaveAttribute(
		'aria-label',
		'Release workflow',
	);
});
