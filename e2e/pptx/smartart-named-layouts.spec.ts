/* oxlint-disable vitest/prefer-importing-vitest-globals -- Playwright API */
import { writeFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import { savePptxViaBackstage } from './save-pptx';
import { elementWithText, fixture, loadDeck, selectElement } from './support/deck';
import { downloadBytes } from './support/exports';

test.use({ viewport: { width: 1440, height: 900 } });

/** PowerPoint's "Basic Timeline" (`hProcess11`), a built-in layout the Layouts gallery offers by name. */
const TIMELINE = 'urn:microsoft.com/office/officeart/2005/8/layout/hProcess11';

async function openLayoutsGallery(page: import('@playwright/test').Page) {
	await selectElement(page, elementWithText(page, 'Alpha'));
	await page.locator('[data-ribbon-contextual-tab="smartArtDesign"]').click();
	const gallery = page
		.locator('pptx-ui-ribbon-gallery:has([data-ribbon-gallery="smartArtLayouts"])')
		.first();
	const trigger = gallery.locator('[data-ribbon-gallery]');
	const popup = gallery.locator('[data-ribbon-gallery-popup]');
	return { trigger, popup };
}

test('the Layouts gallery offers PowerPoint built-in layouts by name and keeps the pick across save and reload', async ({
	page,
}, info) => {
	await loadDeck(page, fixture('smartart-build-reveal.pptx'));
	const { trigger, popup } = await openLayoutsGallery(page);
	// The library loads as a lazy chunk when the SmartArt is selected; reopen until it is listed.
	const timeline = popup.locator(`[data-gallery-item="${TIMELINE}"]`);
	await expect(async () => {
		await trigger.click();
		await expect(timeline).toBeVisible({ timeout: 1000 });
	}).toPass({ timeout: 20_000 });
	await expect(timeline).toHaveAttribute('aria-label', /Basic Timeline/u);
	await timeline.click();
	await expect(popup).toHaveCount(0);

	await trigger.click();
	await expect(timeline).toHaveAttribute('aria-pressed', 'true');
	await page.screenshot({ path: info.outputPath('timeline-after.png') });
	await trigger.press('Escape');

	const bytes = await downloadBytes(await savePptxViaBackstage(page));
	const savedPath = info.outputPath('named-layout.pptx');
	await writeFile(savedPath, bytes);
	await loadDeck(page, savedPath);
	const reopened = await openLayoutsGallery(page);
	await expect(async () => {
		await reopened.trigger.click();
		await expect(reopened.popup.locator(`[data-gallery-item="${TIMELINE}"]`)).toHaveAttribute(
			'aria-pressed',
			'true',
			{ timeout: 1000 },
		);
	}).toPass({ timeout: 20_000 });
});
