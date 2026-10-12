import { test, expect, type Page } from '@playwright/test';
import { createVsdxFixture } from './fixture.mjs';
import { fileBackstage } from './ribbon';
import { openDemo, sampleSettled } from './demo-page';

async function startSharing(page: Page, room: string): Promise<void> {
	const viewer = page.locator('visio-viewer');
	await fileBackstage(viewer, 'share');
	const panel = viewer.locator('.share-panel');
	await panel.getByLabel('Session name').fill(room);
	await panel.getByRole('button', { name: 'Start sharing' }).click();
	await expect(panel.getByRole('status')).toContainText(`in session ${room}`);
}

test('File > Share keeps two windows of this browser on the same drawing', async ({ context }) => {
	const room = `e2e-${Date.now().toString(36)}`;
	const ada = await context.newPage();
	await ada.setViewportSize({ width: 1440, height: 900 });
	await openDemo(ada);
	await ada.evaluate(() =>
		localStorage.setItem(
			'ooxml-office-profile',
			JSON.stringify({ displayName: 'Ada Lovelace', avatarColor: '#16a34a' }),
		),
	);
	await ada.reload();
	await sampleSettled(ada);
	await ada.locator('#file').setInputFiles({
		name: 'shared.vsdx',
		mimeType: 'application/vnd.ms-visio.drawing',
		buffer: await createVsdxFixture('Shared shape'),
	});
	await expect(ada.locator('#file-name')).toHaveText('shared.vsdx');
	await startSharing(ada, room);

	const grace = await context.newPage();
	await grace.setViewportSize({ width: 1440, height: 900 });
	// The second window joins with nothing of its own open (`?share=` starts File > Share on load),
	// so it adopts the session's drawing rather than racing it with the sample.
	await grace.goto(`/demo/?embed=1&share=${room}`);
	const graceViewer = grace.locator('visio-viewer');
	await expect(graceViewer.locator('svg.paper')).toContainText('Shared shape');
	// Windows of one browser share one local profile, so both are Ada; one is "(you)".
	await expect(
		ada.locator('visio-viewer office-ui-presence').getByRole('button', { name: /Ada Lovelace/ }),
	).toHaveCount(2);

	// An edit in one window arrives in the other.
	const adaViewer = ada.locator('visio-viewer');
	await adaViewer.locator('[data-backstage="back"]').click();
	await adaViewer.locator('#shapes-stencils [data-master="rectangle"]').click();
	await expect(adaViewer.locator('svg.paper [data-shape-id="2"]')).toHaveCount(1);
	await expect(graceViewer.locator('svg.paper [data-shape-id="2"]')).toHaveCount(1);
	// ...as an undoable step there.
	await graceViewer.locator('.qat').getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(graceViewer.locator('svg.paper [data-shape-id="2"]')).toHaveCount(0);
	await expect(adaViewer.locator('svg.paper [data-shape-id="2"]')).toHaveCount(0);
});

test('File > Options and Account edit one local profile', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await openDemo(page);
	const viewer = page.locator('visio-viewer');
	await fileBackstage(viewer, 'options');
	await expect(viewer.getByRole('dialog', { name: 'Visio Options' })).toBeVisible();
	// Categories and fields are slotted into the dialog box, so scope to the options element.
	const dialog = viewer.locator('office-ui-options-dialog');
	await expect(dialog.getByRole('tab', { name: 'General' })).toHaveAttribute(
		'aria-selected',
		'true',
	);
	await expect(dialog.getByLabel('Enable Live Preview')).toBeDisabled();
	await dialog.getByLabel('User name').fill('Grace Hopper');
	await dialog.getByRole('tab', { name: 'Trust Center' }).click();
	await expect(dialog).toContainText('active content is never run');
	await dialog.getByRole('button', { name: 'OK' }).click();
	await expect(viewer.getByRole('dialog', { name: 'Visio Options' })).toBeHidden();

	await fileBackstage(viewer, 'account');
	const account = viewer.locator('office-ui-account');
	await expect(account.getByLabel('Display name')).toHaveValue('Grace Hopper');
	await expect(account.locator('.avatar')).toHaveText('GH');
	await account.getByRole('radio', { name: '#c2431f' }).click();
	await page.reload();
	await sampleSettled(page);
	await fileBackstage(page.locator('visio-viewer'), 'account');
	await expect(
		page.locator('visio-viewer office-ui-account').getByLabel('Display name'),
	).toHaveValue('Grace Hopper');
	await expect(
		page.locator('visio-viewer office-ui-account').getByRole('radio', { name: '#c2431f' }),
	).toHaveAttribute('aria-checked', 'true');
});
