import { test, expect } from '@playwright/test';
import { saveCommand } from './ribbon';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createVsdxFixture } from './fixture.mjs';
import { openDemo } from './demo-page';

const legacy = readFileSync(new URL('./fixtures/owned-v11.vsd', import.meta.url));
expect(createHash('sha256').update(legacy).digest('hex')).toBe(
	'a3781bcdaadfb48f3e9669808930013197b541af164dd9e44932da6d744ef36e',
);

test('shipped worker detects legacy bytes under a modern filename and disables VSDX saving', async ({
	page,
}) => {
	await openDemo(page);
	await page
		.locator('#file')
		.setInputFiles({ name: 'legacy.vsdx', mimeType: 'application/octet-stream', buffer: legacy });
	await expect(page.locator('#edit-label')).toHaveText('LEGACY VSD PREVIEW');
	await expect(page.locator('visio-viewer [data-shape-id="7"] text')).toContainText('Hello');
	await expect(saveCommand(page.locator('visio-viewer'))).toBeDisabled();
	await expect(page.locator('#file-state')).toContainText(
		'editing and VSDX export are unavailable',
	);
	await page.locator('#file').setInputFiles({
		name: 'modern.vsd',
		mimeType: 'application/octet-stream',
		buffer: await createVsdxFixture('Modern after legacy'),
	});
	await expect(page.locator('#file-name')).toHaveText('modern.vsd');
	await expect(page.locator('visio-viewer svg.paper text')).toContainText('Modern after legacy');
	await expect(saveCommand(page.locator('visio-viewer'))).toBeEnabled();
	await page.locator('#file').setInputFiles({
		name: 'legacy-again.vsd',
		mimeType: 'application/octet-stream',
		buffer: legacy,
	});
	await expect(page.locator('#file-name')).toHaveText('legacy-again.vsd');
	await expect(page.locator('#edit-label')).toHaveText('LEGACY VSD PREVIEW');
	await expect(saveCommand(page.locator('visio-viewer'))).toBeDisabled();
});

test('malformed binary input retains the prior bounded legacy preview', async ({ page }) => {
	await openDemo(page);
	await page
		.locator('#file')
		.setInputFiles({ name: 'owned.vsd', mimeType: 'application/octet-stream', buffer: legacy });
	await expect(page.locator('#edit-label')).toHaveText('LEGACY VSD PREVIEW');
	await page.locator('#file').setInputFiles({
		name: 'truncated.vsd',
		mimeType: 'application/octet-stream',
		buffer: legacy.subarray(0, 600),
	});
	await expect(page.locator('#error')).toBeVisible();
	await expect(page.locator('visio-viewer [data-shape-id="7"] text')).toContainText('Hello');
	await expect(saveCommand(page.locator('visio-viewer'))).toBeDisabled();
});
