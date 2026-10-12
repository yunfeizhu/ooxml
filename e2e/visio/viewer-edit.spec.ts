import { test, expect } from '@playwright/test';
import { downloadCopy, history, loadSampleTemplate, saveCommand } from './ribbon';
import { createVsdxFixture } from './fixture.mjs';
import { openDemo } from './demo-page';

test('edits literal text locally, undoes/redoes and downloads a reopenable VSDX copy', async ({
	page,
	baseURL,
}) => {
	const external: string[] = [];
	page.on('request', (request) => {
		if (!request.url().startsWith(baseURL!) && !request.url().startsWith('data:'))
			external.push(request.url());
	});
	await openDemo(page);
	// The sample is a real package, so it can be saved as it is.
	await expect(saveCommand(page.locator('visio-viewer'))).toBeEnabled();
	await page.locator('#file').setInputFiles({
		name: 'editable.vsdx',
		mimeType: 'application/vnd.ms-visio.drawing',
		buffer: await createVsdxFixture('Before edit'),
	});
	await expect(page.locator('#file-name')).toHaveText('editable.vsdx');
	const viewer = page.locator('visio-viewer');
	// Double-click edits the text where it is drawn; Esc keeps the change.
	await viewer.locator('svg.paper [data-shape-id="1"]').dblclick();
	const editor = viewer.locator('#edit-text');
	await expect(editor).toBeFocused();
	await expect(editor).toHaveValue('Before edit');
	await editor.fill('<script>Literal edited text</script>');
	await editor.press('Escape');
	await expect(editor).toHaveCount(0);
	await expect(page.locator('visio-viewer svg.paper text')).toContainText(
		'<script>Literal edited text</script>',
	);
	await expect(page.locator('#edit-label')).toHaveText('EDITED COPY');
	await expect(page.locator('visio-viewer script')).toHaveCount(0);
	await history(viewer, 'Undo').click();
	await expect(page.locator('visio-viewer svg.paper text')).toContainText('Before edit');
	await expect(page.locator('#edit-label')).toHaveText('ORIGINAL');
	await history(viewer, 'Redo').click();
	await expect(page.locator('visio-viewer svg.paper text')).toContainText('Literal edited text');
	const saveAs = await downloadCopy(page.locator('visio-viewer'));
	const downloadEvent = page.waitForEvent('download');
	await saveAs.click();
	const download = await downloadEvent;
	expect(download.suggestedFilename()).toBe('editable-edited-copy.vsdx');
	const stream = await download.createReadStream();
	const chunks: Buffer[] = [];
	for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
	await page.locator('#file').setInputFiles({
		name: 'reopened.vsdx',
		mimeType: 'application/vnd.ms-visio.drawing',
		buffer: Buffer.concat(chunks),
	});
	await expect(page.locator('#file-name')).toHaveText('reopened.vsdx');
	await expect(page.locator('visio-viewer svg.paper text')).toContainText('Literal edited text');
	expect(external).toEqual([]);
});

test('mobile in-place editor types zoom keys as text, keeps the page width and saves on Escape', async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await openDemo(page);
	await page.locator('#file').setInputFiles({
		name: 'mobile.vsdx',
		mimeType: 'application/vnd.ms-visio.drawing',
		buffer: await createVsdxFixture('Original'),
	});
	await expect(page.locator('#file-name')).toHaveText('mobile.vsdx');
	const viewer = page.locator('visio-viewer');
	const zoom = await viewer
		.locator('office-ui-zoom-slider')
		.evaluate((el) => (el as HTMLInputElement).value);
	await viewer.locator('svg.paper [data-shape-id="1"]').dblclick();
	const editor = viewer.locator('#edit-text');
	await expect(editor).toBeFocused();
	// The canvas zoom keys are ordinary characters while typing.
	await editor.pressSequentially(' + - 0');
	await expect(editor).toHaveValue('Original + - 0');
	expect(
		await viewer.locator('office-ui-zoom-slider').evaluate((el) => (el as HTMLInputElement).value),
	).toBe(zoom);
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
	await editor.press('Escape');
	await expect(editor).toHaveCount(0);
	await expect(viewer.locator('svg.paper text')).toContainText('Original + - 0');
	// The sample replaces the drawing and takes no draft with it.
	await loadSampleTemplate(viewer);
	await expect(viewer.locator('svg.paper')).toHaveAttribute('aria-label', 'Release workflow');
	await expect(editor).toHaveCount(0);
});
