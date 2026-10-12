import { test, expect } from '@playwright/test';

const demoFrame = '.pv-livepane iframe';
// The iframe loads the whole viewer bundle cold; on a busy two-worker runner that can outlast
// the default five-second expect timeout.
const viewerLoad = { timeout: 30_000 };

async function loadLiveDemo(page: import('@playwright/test').Page) {
	// Entering the viewport starts the lazy demo and removes its fallback button.
	// A count-then-click can race that observer while Playwright scrolls the button.
	await page.locator('#live-demo').scrollIntoViewIfNeeded();
	await expect(page.locator(demoFrame)).toHaveCount(1);
	// The embedded demo then swaps its placeholder for the editable sample package.
	await expect(page.frameLocator(demoFrame).locator('body[data-sample]')).toBeAttached(viewerLoad);
}

test('shared Office theme changes update the embedded viewer without replacing its diagram', async ({
	page,
}) => {
	// VitePress 2 keeps its appearance switch in the navigation bar only at desktop widths.
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto('/');
	await page.evaluate(() => {
		localStorage.setItem('vitepress-theme-appearance', 'light');
		localStorage.setItem('visio-docs-theme', 'dark');
	});
	await page.reload();
	await loadLiveDemo(page);
	const frame = page.frameLocator(demoFrame);
	await expect(frame.locator('html')).toHaveAttribute('data-theme', 'light');
	await frame
		.locator('visio-viewer')
		.getByRole('tab', { name: 'Architecture', exact: true })
		.click();
	await frame.locator('visio-viewer [data-shape-id="1"]').click();
	const svg = frame.locator('visio-viewer svg.paper');
	await expect(svg).toHaveAttribute('aria-label', 'Architecture');
	// The docs site's own appearance switch writes the shared preference; the embedded viewer follows
	// it live through the storage event, without reloading.
	const appearance = page.getByRole('switch', { name: 'Appearance', exact: true });
	await appearance.click();
	await expect(page.locator('html')).toHaveClass(/dark/);
	await expect(frame.locator('html')).toHaveAttribute('data-theme', 'dark');
	const darkSurface = await frame
		.locator('visio-viewer office-ui-status-bar.status')
		.evaluate((el) => getComputedStyle(el).backgroundColor);
	expect(darkSurface).toBe('rgb(27, 29, 32)');
	await expect(svg).toHaveAttribute('aria-label', 'Architecture');
	await expect(frame.locator('visio-viewer [data-shape-id="1"]')).toHaveAttribute(
		'data-selected',
		'true',
	);
	await appearance.click();
	await expect(page.locator('html')).not.toHaveClass(/dark/);
	await expect(frame.locator('html')).toHaveAttribute('data-theme', 'light');
	await expect(svg).toHaveAttribute('aria-label', 'Architecture');
	const lightSurface = await frame
		.locator('visio-viewer office-ui-status-bar.status')
		.evaluate((el) => getComputedStyle(el).backgroundColor);
	expect(lightSurface).not.toBe(darkSurface);
});

for (const viewport of [
	{ width: 1440, height: 1000 },
	{ width: 390, height: 844 },
]) {
	test(`landing loads the actual beta viewer at ${viewport.width}px`, async ({ page }) => {
		await page.setViewportSize(viewport);
		await page.goto('/');
		await expect(page.getByRole('heading', { level: 1 })).toContainText('.vsdx viewing,');
		await page.screenshot({ path: `test-results/landing-${viewport.width}.png`, fullPage: true });
		await loadLiveDemo(page);
		await expect(page.frameLocator(demoFrame).locator('visio-viewer')).toBeVisible(viewerLoad);
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
			true,
		);
	});
}

test('sharing mode shows two windows of the same viewer', async ({ page }) => {
	await page.goto('/');
	await loadLiveDemo(page);
	await page.getByRole('button', { name: 'Sharing' }).click();
	await expect(page.locator(demoFrame)).toHaveCount(2);
	for (const index of [0, 1])
		await expect(page.frameLocator(demoFrame).nth(index).locator('visio-viewer')).toBeVisible(
			viewerLoad,
		);
});
