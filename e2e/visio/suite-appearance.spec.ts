import { test, expect } from '@playwright/test';
import { taskPane } from './ribbon';
import { openDemo } from './demo-page';

for (const theme of ['light', 'dark'] as const) {
	for (const width of [1440, 768, 390]) {
		test(`Office shell stays within the viewport at ${width}px in ${theme}`, async ({ page }) => {
			await page.setViewportSize({ width, height: 844 });
			await page.addInitScript(
				(value) => localStorage.setItem('vitepress-theme-appearance', value),
				theme,
			);
			await openDemo(page);
			const viewer = page.locator('visio-viewer');
			await expect(viewer.locator('.viewport > svg')).toBeVisible();
			await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
			const colors = await page.evaluate(() => {
				const root = document.querySelector('visio-viewer')!.shadowRoot!;
				return {
					font: getComputedStyle(root.host).fontFamily,
					canvas: getComputedStyle(root.querySelector('.viewport')!).backgroundColor,
					ribbon: getComputedStyle(root.querySelector('.toolbar')!).backgroundColor,
					accent: getComputedStyle(
						root
							.querySelector('office-ui-ribbon')!
							.shadowRoot!.querySelector('[role="tab"][aria-selected="true"]')!,
					).color,
					width: document.documentElement.scrollWidth,
					height: document.documentElement.scrollHeight,
				};
			});
			expect(colors.font).toContain('Segoe UI');
			expect(colors.canvas).toBe(theme === 'light' ? 'rgb(236, 234, 232)' : 'rgb(17, 19, 21)');
			expect(colors.ribbon).toBe(theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(27, 29, 32)');
			expect(colors.accent).toBe(theme === 'light' ? 'rgb(57, 85, 163)' : 'rgb(139, 159, 240)');
			expect(colors.width).toBeLessThanOrEqual(width);
			expect(colors.height).toBe(844);
			// Task panes are closed until asked for; Shape Data opens inside the window.
			await expect(viewer.locator('.inspector-pane')).toBeHidden();
			await taskPane(viewer, 'Shape Data');
			await expect(viewer.locator('.inspector-pane')).toBeInViewport();
			await viewer
				.locator('.inspector-pane')
				.getByRole('button', { name: 'Close Shape Data', exact: true })
				.click();
			await viewer.getByRole('tab', { name: 'Home', exact: true }).click();
			await viewer.getByRole('tab', { name: 'Architecture', exact: true }).click();
			await expect(viewer.locator('.viewport > svg')).toHaveAttribute('aria-label', 'Architecture');
			await viewer.getByRole('tab', { name: 'View', exact: true }).focus();
			await page.keyboard.press('ArrowLeft');
			await expect(viewer.getByRole('tab', { name: 'Review', exact: true })).toBeFocused();
			await page.keyboard.press('Home');
			await expect(viewer.getByRole('tab', { name: 'Home', exact: true })).toBeFocused();
			await page.screenshot({ path: test.info().outputPath(`suite-${width}-${theme}.png`) });
		});
	}
}
