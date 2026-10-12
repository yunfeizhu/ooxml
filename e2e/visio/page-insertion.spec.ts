import { test, expect } from '@playwright/test';
import { createVsdxFixture } from './fixture.mjs';
import { downloadCopy } from './ribbon';
import { openDemo } from './demo-page';

for (const framework of ['vanilla', 'react', 'vue', 'angular', 'svelte', 'solid']) {
	test(`${framework}: inserts a page through the worker, restores history and reopens the saved package`, async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await openDemo(
			page,
			framework === 'vanilla' ? '/demo/?sample=1' : `/demo-${framework}/?sample=1`,
		);
		const viewer = page.locator('visio-viewer');
		const tabs = viewer.locator('.page-tabs');
		// The sample is a real package, so its pages can be inserted too.
		await expect(tabs.getByRole('button', { name: 'Insert Page', exact: true })).toBeEnabled();
		await page.locator('#file').setInputFiles({
			name: 'pages.vsdx',
			mimeType: 'application/vnd.ms-visio.drawing',
			buffer: await createVsdxFixture('Original page shape'),
		});
		await expect(page.locator('#file-name')).toHaveText('pages.vsdx');
		await expect(viewer.locator('svg.paper text')).toContainText('Original page shape');
		await tabs.getByRole('button', { name: 'Insert Page', exact: true }).click();
		await expect(tabs.getByRole('tab')).toHaveCount(2);
		await expect(tabs.getByRole('tab', { name: 'Page-2', exact: true })).toHaveAttribute(
			'aria-selected',
			'true',
		);
		await expect(viewer.locator('[data-shape-id]')).toHaveCount(0);
		await viewer.locator('.qat [data-command="undo"]').click();
		await expect(tabs.getByRole('tab')).toHaveCount(1);
		await expect(viewer.locator('svg.paper text')).toContainText('Original page shape');
		await viewer.locator('.qat [data-command="redo"]').click();
		await expect(tabs.getByRole('tab')).toHaveCount(2);
		await tabs.getByRole('tab', { name: 'Page-2', exact: true }).click();
		await viewer
			.locator('[data-menu="all-pages"]')
			.getByRole('button', { name: 'All', exact: true })
			.click();
		await viewer.locator('office-ui-menu-item[command="reorder-pages"]').click();
		const dialog = viewer.locator('.page-order-dialog');
		await expect(dialog.getByRole('listbox', { name: 'Page order' })).toHaveValue('2');
		await dialog.getByRole('button', { name: 'Move Up', exact: true }).click();
		await dialog.getByRole('button', { name: 'OK', exact: true }).click();
		await expect(tabs.getByRole('tab').first()).toHaveText('Page-2');
		await expect(tabs.getByRole('tab').first()).toHaveAttribute('aria-selected', 'true');
		await viewer.locator('.qat [data-command="undo"]').click();
		await expect(tabs.getByRole('tab').first()).toHaveText('Imported page');
		await expect(tabs.getByRole('tab').last()).toHaveAttribute('aria-selected', 'true');
		await viewer.locator('.qat [data-command="redo"]').click();
		await expect(tabs.getByRole('tab').first()).toHaveText('Page-2');
		await viewer
			.locator('[data-menu="all-pages"]')
			.getByRole('button', { name: 'All', exact: true })
			.click();
		await viewer.locator('office-ui-menu-item[command="rename-page"]').click();
		const renameDialog = viewer.locator('.page-rename-dialog');
		await renameDialog.getByRole('textbox', { name: 'Page name' }).fill('Renamed & Page');
		await renameDialog.getByRole('button', { name: 'OK', exact: true }).click();
		await expect(tabs.getByRole('tab').first()).toHaveText('Renamed & Page');
		await viewer.locator('.qat [data-command="undo"]').click();
		await expect(tabs.getByRole('tab').first()).toHaveText('Page-2');
		await viewer.locator('.qat [data-command="redo"]').click();
		await expect(tabs.getByRole('tab').first()).toHaveText('Renamed & Page');
		await tabs.getByRole('tab', { name: 'Imported page', exact: true }).click();
		await viewer
			.locator('[data-menu="all-pages"]')
			.getByRole('button', { name: 'All', exact: true })
			.click();
		await viewer.locator('office-ui-menu-item[command="delete-page"]').click();
		const deleteDialog = viewer.locator('.page-delete-dialog');
		await deleteDialog.getByRole('button', { name: 'Delete', exact: true }).click();
		await expect(tabs.getByRole('tab')).toHaveCount(1);
		await expect(tabs.getByRole('tab').first()).toHaveText('Renamed & Page');
		await viewer.locator('.qat [data-command="undo"]').click();
		await expect(tabs.getByRole('tab')).toHaveCount(2);
		await viewer.locator('.qat [data-command="redo"]').click();
		await expect(tabs.getByRole('tab')).toHaveCount(1);
		const downloadButton = await downloadCopy(viewer);
		const pending = page.waitForEvent('download');
		await downloadButton.click();
		const stream = await (await pending).createReadStream();
		const chunks: Buffer[] = [];
		for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
		await page.locator('#file').setInputFiles({
			name: 'reopened-pages.vsdx',
			mimeType: 'application/vnd.ms-visio.drawing',
			buffer: Buffer.concat(chunks),
		});
		await expect(page.locator('#file-name')).toHaveText('reopened-pages.vsdx');
		await expect(tabs.getByRole('tab', { name: 'Renamed & Page', exact: true })).toHaveCount(1);
		await expect(tabs.getByRole('tab')).toHaveCount(1);
	});
}
