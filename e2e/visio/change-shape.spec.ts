import { test, expect } from '@playwright/test';
import { createVsdxFixture } from './fixture.mjs';
import { openDemo } from './demo-page';
import { ribbonGroup } from './ribbon';

test('Change Shape replaces the selected outline from the Basic Shapes gallery and undoes', async ({
	page,
}) => {
	await page.setViewportSize({ width: 1440, height: 1000 });
	await openDemo(page);
	const viewer = page.locator('visio-viewer');
	await expect(page.locator('#file-name')).toHaveText('Sample workflow');
	await page.locator('#file').setInputFiles({
		name: 'change-shape.vsdx',
		mimeType: 'application/vnd.ms-visio.drawing',
		buffer: await createVsdxFixture('Existing shape'),
	});
	await expect(page.locator('#file-name')).toHaveText('change-shape.vsdx');
	const trigger = viewer.locator('office-ui-gallery[command="change-shape"] .trigger');
	await expect(trigger).toBeDisabled();
	await expect(trigger).toHaveAttribute('title', /Select exactly one shape/);

	await viewer
		.locator('#shapes-stencils [data-master="rectangle"]')
		.dragTo(viewer.locator('svg.paper'), { targetPosition: { x: 160, y: 160 } });
	await expect(viewer.locator('[data-status]')).toHaveText(/added from Basic Shapes/);
	const added = viewer.locator('svg.paper > g > [data-shape-id]').last();
	await added.click({ force: true });
	await expect(trigger).toBeEnabled();
	const before = await added.innerHTML();

	await ribbonGroup(viewer, 'Editing');
	await trigger.click();
	const popup = viewer.locator('[data-gallery-popup="change-shape"]');
	await expect(popup).toBeVisible();
	// The popup lands under its trigger and inside the window.
	const [anchor, box] = [await trigger.boundingBox(), await popup.boundingBox()];
	expect(Math.abs(box!.y - (anchor!.y + anchor!.height + 4))).toBeLessThan(2);
	expect(box!.x + box!.width).toBeLessThanOrEqual(1440);
	await popup.locator('[data-gallery-item="star"]').click();
	await expect(viewer.locator('[data-status]')).toHaveText('Changed the shape to 5-point star.');
	await expect.poll(() => added.innerHTML()).not.toBe(before);

	await viewer.locator('.qat').getByRole('button', { name: 'Undo', exact: true }).click();
	await expect.poll(() => added.innerHTML()).toBe(before);
});
