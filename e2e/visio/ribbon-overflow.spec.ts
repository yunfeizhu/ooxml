import { test, expect, type Locator } from '@playwright/test';
import { openDemo } from './demo-page';

const collapsed = (viewer: Locator) =>
	viewer
		.locator('#home-panel office-ui-ribbon-group[data-collapsed]')
		.evaluateAll((groups) => groups.map((group) => group.getAttribute('label')));

/** The panel never scrolls sideways while collapsing can still make room. */
const overflow = (viewer: Locator) =>
	viewer.locator('#home-panel').evaluate((panel) => panel.scrollWidth - panel.clientWidth);

test('ribbon groups collapse into buttons from the right as the window narrows', async ({
	page,
}) => {
	await page.setViewportSize({ width: 2000, height: 1000 });
	await openDemo(page);
	const viewer = page.locator('visio-viewer');
	await expect(viewer.locator('svg.paper')).toHaveCount(1);
	await expect.poll(() => collapsed(viewer)).toEqual([]);

	const order = ['Clipboard', 'Font', 'Paragraph', 'Tools', 'Shape Styles', 'Arrange', 'Editing'];
	let previous = 0;
	for (const width of [1600, 1100, 800]) {
		await page.setViewportSize({ width, height: 1000 });
		// Collapsed groups are always the rightmost ones, Editing first and Clipboard last.
		await expect
			.poll(async () => {
				const now = await collapsed(viewer);
				return now.length > 0 && now.join() === order.slice(order.length - now.length).join();
			})
			.toBe(true);
		const count = (await collapsed(viewer)).length;
		expect(count).toBeGreaterThanOrEqual(previous);
		previous = count;
		// Collapsing is one group at a time, so the overflow settles a layout pass after the count.
		await expect.poll(() => overflow(viewer)).toBeLessThanOrEqual(1);
		// No scrollbar takes room under the commands.
		await expect
			.poll(() =>
				viewer
					.locator('#home-panel')
					.evaluate((panel) => (panel as HTMLElement).offsetHeight - panel.clientHeight),
			)
			.toBe(0);
	}
	expect(previous).toBeGreaterThan(1);

	// A collapsed group opens its commands in a popup; a command there works and closes it.
	const editing = viewer.locator('#home-panel office-ui-ribbon-group[label="Editing"]');
	await expect(editing.getByRole('button', { name: 'Select', exact: true })).toBeHidden();
	await editing.getByRole('button', { name: 'Editing', exact: true }).click();
	await expect(editing).toHaveAttribute('data-open', '');
	const popup = await editing.getByRole('button', { name: 'Select', exact: true }).boundingBox();
	expect(popup!.x).toBeGreaterThanOrEqual(0);
	expect(popup!.x + popup!.width).toBeLessThanOrEqual(800);
	await editing.getByRole('button', { name: 'Select', exact: true }).click();
	// Opening a menu inside the popup keeps it.
	await expect(editing).toHaveAttribute('data-open', '');
	await viewer.locator('office-ui-menu-item[label="Select All"]').click();
	await expect(editing).not.toHaveAttribute('data-open', '');
	await expect(viewer.locator('svg.paper [data-selected]')).not.toHaveCount(0);

	// Escape and a click elsewhere close it too.
	await editing.getByRole('button', { name: 'Editing', exact: true }).click();
	await page.keyboard.press('Escape');
	await expect(editing).not.toHaveAttribute('data-open', '');
	await editing.getByRole('button', { name: 'Editing', exact: true }).click();
	await viewer.locator('.viewport').click({ position: { x: 5, y: 5 } });
	await expect(editing).not.toHaveAttribute('data-open', '');

	// Another tab is fitted on its own, and widening restores every group.
	await viewer.getByRole('tab', { name: 'View', exact: true }).click();
	await expect
		.poll(() =>
			viewer.locator('#view-panel').evaluate((panel) => panel.scrollWidth - panel.clientWidth <= 1),
		)
		.toBe(true);
	await expect(
		viewer.locator('#view-panel office-ui-ribbon-group[data-collapsed]'),
	).not.toHaveCount(0);
	await viewer.getByRole('tab', { name: 'Home', exact: true }).click();
	await page.setViewportSize({ width: 2000, height: 1000 });
	await expect.poll(() => collapsed(viewer)).toEqual([]);
});

test('a host add-in tab collapses like the built-in ones', async ({ page }) => {
	await page.setViewportSize({ width: 800, height: 900 });
	await openDemo(page);
	const viewer = page.locator('visio-viewer');
	await expect(viewer.locator('svg.paper')).toHaveCount(1);
	await viewer.evaluate((element) => {
		const groups = ['One', 'Two', 'Three', 'Four', 'Five'].map((label) => ({
			label,
			commands: ['a', 'b', 'c'].map((id) => ({
				id: `${label}-${id}`,
				label: `${label} command ${id}`,
			})),
		}));
		(element as HTMLElement & { ribbonAddIns: unknown }).ribbonAddIns = [
			{ id: 'host', label: 'Host', groups },
		];
	});
	await viewer.getByRole('tab', { name: 'Host', exact: true }).click();
	const panel = viewer.locator('[data-add-in]');
	await expect(panel.locator('office-ui-ribbon-group[data-collapsed]')).not.toHaveCount(0);
	expect(await panel.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
});

test('the phone layout keeps its Tools disclosure and collapses nothing', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await openDemo(page);
	const viewer = page.locator('visio-viewer');
	await expect(viewer.locator('svg.paper')).toHaveCount(1);
	await expect(viewer.locator('.ribbon-tools > summary')).toBeVisible();
	await expect(viewer.locator('office-ui-ribbon-group[data-collapsed]')).toHaveCount(0);
});
