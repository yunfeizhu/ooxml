import { expect, test, type Locator } from '@playwright/test';
import { openDemo } from './demo-page';

const pageSize = (viewer: Locator) =>
	viewer.evaluate((node) => {
		const state = (
			node as unknown as {
				controller: { state: { document: { pages: { width: number; height: number }[] } } };
			}
		).controller.state;
		const page = state.document.pages[0]!;
		return [page.width, page.height];
	});
async function design(viewer: Locator, menu: string, item: string): Promise<void> {
	await viewer.getByRole('tab', { name: 'Design', exact: true }).click();
	await viewer.locator(`office-ui-menu-button[data-menu="${menu}"]`).click();
	await viewer.locator(`office-ui-menu-item[command="${item}"]`).click();
}
async function pick(viewer: Locator, gallery: string, item: string): Promise<void> {
	await viewer.getByRole('tab', { name: 'Design', exact: true }).click();
	await viewer.locator(`office-ui-gallery[command="${gallery}"] .trigger`).click();
	await viewer.locator(`[data-gallery-popup="${gallery}"] [data-gallery-item="${item}"]`).click();
}

test('Design page setup, backgrounds, borders and page breaks edit the drawing with undo', async ({
	page,
}) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.setViewportSize({ width: 1600, height: 1000 });
	await openDemo(page);
	const viewer = page.locator('visio-viewer');
	await viewer.locator('office-ui-ribbon .file').click();
	await viewer.locator('[data-backstage-item="new"]').click();
	await viewer.locator('[data-backstage-action="new-blank"]').click();
	await expect(viewer.locator('svg.paper')).toBeVisible();
	const status = viewer.locator('[data-status]');

	await design(viewer, 'orientation', 'orientation-landscape');
	await expect(status).toHaveText('Orientation set to landscape.');
	await expect.poll(() => pageSize(viewer)).toEqual([11, 8.5]);
	await design(viewer, 'size', 'size-tabloid');
	await expect.poll(() => pageSize(viewer)).toEqual([17, 11]);
	await viewer.getByRole('tab', { name: 'Design', exact: true }).click();
	await viewer.locator('[command="auto-size"]').click();
	await expect(viewer.locator('[command="auto-size"]')).toHaveAttribute('pressed', 'true');

	await pick(viewer, 'backgrounds', 'band');
	await expect(status).toHaveText('Applied the background.');
	const tabs = viewer.locator('.page-tabs');
	await expect(tabs.getByRole('tab', { name: 'VBackground-1', exact: true })).toBeVisible();
	await expect(viewer.locator('svg.paper [data-shape-name="Background Band"]')).toBeAttached();
	await pick(viewer, 'borders-titles', 'banner');
	await expect(viewer.locator('svg.paper')).toContainText('Page-1');

	await viewer.getByRole('tab', { name: 'View', exact: true }).click();
	await viewer.locator('office-ui-checkbox[data-check="page-breaks"]').click();
	// Letter paper in landscape tiles the 17 x 11 in page at 11 in across and 8.5 in down.
	await expect(viewer.locator('svg.paper [data-page-breaks] line')).toHaveCount(2);

	await viewer.getByRole('tab', { name: 'Design', exact: true }).click();
	await viewer.locator('office-ui-ribbon-group[launcher="page-setup-dialog"] .launcher').click();
	const dialog = viewer.locator('.page-setup-dialog');
	await expect(dialog.getByRole('tab', { name: 'Print Setup' })).toHaveAttribute(
		'aria-selected',
		'true',
	);
	await dialog.getByRole('tab', { name: 'Page Properties' }).click();
	await dialog.getByRole('textbox', { name: 'Name' }).fill('Site plan');
	await dialog.getByRole('button', { name: 'OK', exact: true }).click();
	await expect(tabs.getByRole('tab').first()).toHaveText('Site plan');
	await page.screenshot({ path: test.info().outputPath('page-setup.png') });

	const undo = viewer.locator('.qat [data-command="undo"]');
	for (let step = 0; step < 6; ++step) await undo.click();
	await expect(tabs.getByRole('tab')).toHaveCount(1);
	await expect.poll(() => pageSize(viewer)).toEqual([8.5, 11]);
	expect(errors).toEqual([]);
});
