import { expect, test } from '@playwright/test';
import { parseVsdx } from 'ooxml-core/visio';
import type { VisioViewerElement } from 'ooxml-ui/visio';
import { createVsdxFixture } from './fixture.mjs';
import { openDemo } from './demo-page';

test('Insert pictures, links and ScreenTips survive export and follow with Ctrl+click', async ({
	page,
}) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.addInitScript(() => {
		(globalThis as { opened?: unknown[] }).opened = [];
		window.open = (...args: unknown[]) => {
			(globalThis as unknown as { opened: unknown[] }).opened.push(args);
			return null;
		};
	});
	await page.setViewportSize({ width: 1600, height: 1000 });
	await openDemo(page);
	const viewer = page.locator('visio-viewer');
	// The sample loads first; a file chosen before it finishes would be replaced.
	await expect(viewer.locator('svg.paper')).toContainText('Release workflow');
	await page.locator('#file').setInputFiles({
		name: 'Insert.vsdx',
		mimeType: 'application/vnd.ms-visio.drawing',
		buffer: await createVsdxFixture('Insert target'),
	});
	await expect(page.locator('#file-name')).toHaveText('Insert.vsdx');
	await expect(viewer.locator('svg.paper')).toContainText('Insert target');
	await viewer.getByRole('tab', { name: 'Insert', exact: true }).click();
	await expect(viewer.locator('[command="pictures"] button')).toBeEnabled();
	await expect(viewer.locator('[command="link"] button')).toBeDisabled();
	await expect(viewer.locator('[command="field"] button')).toBeDisabled();
	const png = Buffer.from(
		(
			await page.evaluate(() => {
				const canvas = document.createElement('canvas');
				canvas.width = 192;
				canvas.height = 96;
				canvas.getContext('2d')!.fillRect(0, 0, 192, 96);
				return canvas.toDataURL('image/png');
			})
		).split(',')[1]!,
		'base64',
	);
	await viewer
		.locator('[data-insert-picture]')
		.setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png });
	await expect(viewer.locator('svg.paper image')).toHaveCount(1);
	await expect(viewer.locator('[data-status]')).toHaveText(/Inserted picture logo\.png/);
	await page.keyboard.press('Control+k');
	const dialog = viewer.locator('.link-dialog');
	await dialog.locator('[name="address"]').fill('https://example.com/docs');
	await dialog.locator('[name="description"]').fill('Docs');
	await dialog.locator('[label="OK"] button').click();
	await expect(viewer.locator('[data-status]')).toHaveText(/Saved the link/);
	await viewer.locator('[command="screen-tip"] button').click();
	await viewer.locator('.screen-tip-dialog [name="text"]').fill('Company logo');
	await viewer.locator('.screen-tip-dialog [label="OK"] button').click();
	const picture = viewer
		.locator('svg.paper [data-shape-id]')
		.filter({ has: page.locator('image') });
	await expect(picture.locator('title')).toHaveText('Company logo');
	await picture.click({ modifiers: ['Control'] });
	expect(await page.evaluate(() => (globalThis as { opened?: unknown[] }).opened)).toEqual([
		['https://example.com/docs', '_blank', 'noopener,noreferrer'],
	]);
	const bytes = await viewer.evaluate((node) =>
		Array.from((node as VisioViewerElement).exportVsdx().bytes),
	);
	const saved = (await parseVsdx(new Uint8Array(bytes))).pages[0]!.shapes.at(-1)!;
	expect(saved).toMatchObject({ kind: 'foreign', screenTip: 'Company logo' });
	expect(saved.image?.mimeType).toBe('image/png');
	expect(saved.hyperlinks?.[0]?.target).toEqual({
		kind: 'external',
		href: 'https://example.com/docs',
	});
	expect(errors).toEqual([]);
});
