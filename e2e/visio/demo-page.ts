import { expect, type Page } from '@playwright/test';

/**
 * Open a demo page and wait until its start-up sample load has settled (loaded, or superseded by
 * another file), so a spec never races the editable sample package replacing the placeholder.
 */
export async function openDemo(page: Page, path = '/demo/?sample=1'): Promise<void> {
	await page.goto(path);
	await sampleSettled(page);
}

/** Wait for the start-up sample load, for example after `page.reload()`. */
export async function sampleSettled(page: Page): Promise<void> {
	await expect(page.locator('body[data-sample]')).toBeAttached({ timeout: 30_000 });
}
