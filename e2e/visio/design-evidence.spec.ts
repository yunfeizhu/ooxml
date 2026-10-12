import { test, expect } from '@playwright/test';
import { openDemo } from './demo-page';
import { officeTheme } from './ribbon';

for (const theme of ['light', 'dark'] as const) {
	for (const size of [
		{ name: 'desktop', width: 1440, height: 1000 },
		{ name: 'mobile', width: 390, height: 844 },
	]) {
		test(`${size.name} ${theme} design evidence for workspace and documentation`, async ({
			page,
		}, testInfo) => {
			await page.setViewportSize({ width: size.width, height: size.height });
			await page.addInitScript(
				(value) => localStorage.setItem('vitepress-theme-appearance', value),
				theme,
			);
			for (const route of [
				{ name: 'workspace', url: '/demo/?sample=1' },
				{ name: 'landing', url: '/' },
				{ name: 'guide', url: '/getting-started' },
			]) {
				await page.goto(route.url);
				if (route.name === 'workspace')
					await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
				else
					await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*dark)/);
				if (route.name === 'workspace')
					await expect(page.locator('visio-viewer .viewport > svg')).toBeVisible();
				await page.evaluate(() => document.fonts.ready);
				expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
					size.width,
				);
				await page.screenshot({
					path: testInfo.outputPath(`${route.name}-${size.name}-${theme}.png`),
					fullPage: true,
				});
				if (route.name === 'landing') {
					const load = page.getByRole('button', { name: 'Load the live demo' });
					if (await load.count()) await load.click();
					const embedded = page.frameLocator('.pv-livepane iframe');
					await expect(embedded.locator('visio-viewer .viewport > svg')).toBeVisible();
					await expect(embedded.locator('html')).toHaveAttribute('data-theme', theme);
					await page
						.locator('#live-demo')
						.screenshot({ path: testInfo.outputPath(`live-demo-${size.name}-${theme}.png`) });
				}
			}
		});
	}
}

test('workspace appearance persists across navigation and embed mode is compact', async ({
	page,
}) => {
	await page.addInitScript(() => {
		if (!localStorage.getItem('vitepress-theme-appearance'))
			localStorage.setItem('vitepress-theme-appearance', 'dark');
	});
	await openDemo(page);
	await expect(page.locator('visio-viewer .viewport > svg')).toBeVisible();
	// Light or dark is chosen in the editor, in File > Options > Office Theme.
	await officeTheme(page.locator('visio-viewer'), 'White');
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
	await page.reload();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
	await page.goto('/demo/?embed=1');
	await expect(page.locator('html')).toHaveAttribute('data-embedded', '');
	await expect(page.locator('#demo-state')).toBeHidden();
	await expect(page.locator('visio-viewer office-ui-ribbon .file')).toBeVisible();
});
