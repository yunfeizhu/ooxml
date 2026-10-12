import { expect, test, type Locator } from '@playwright/test';
import JSZip from 'jszip';
import type { VisioViewerElement } from 'ooxml-ui/visio';
import { createVsdxFixture } from './fixture.mjs';
import { openDemo } from './demo-page';
import { formatShapePane, pickColor } from './ribbon';

const idle = (viewer: Locator) =>
	expect
		.poll(() =>
			viewer.evaluate((node) => {
				const state = (node as VisioViewerElement).controller.state;
				return state.loading || state.edit.busy;
			}),
		)
		.toBe(false);
const style = (viewer: Locator) =>
	viewer.evaluate((node) => {
		const shape = (node as VisioViewerElement).controller.state.document!.pages[0]!.shapes[0]!;
		return {
			fill: shape.style.fill,
			line: shape.style.lineColor,
			width: Math.round(shape.style.lineWidth * 72 * 100) / 100,
			pattern: shape.style.linePattern,
		};
	});

test('picks a theme colour and a custom colour, and formats in the Format Shape pane', async ({
	page,
}) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.setViewportSize({ width: 1600, height: 1000 });
	await openDemo(page);
	await page.locator('#file').setInputFiles({
		name: 'colors.vsdx',
		mimeType: 'application/vnd.ms-visio.drawing',
		buffer: await createVsdxFixture('Colour me'),
	});
	await expect(page.locator('#file-name')).toHaveText('colors.vsdx');
	const viewer = page.locator('visio-viewer');
	const shape = viewer.locator('svg.paper [data-shape-id="1"]');
	await shape.click();

	// Home > Fill shows Office's picker: Theme Colors with tints, Standard Colors, More Colors.
	await viewer.locator('[data-menu="fill"] button').first().click();
	const grid = viewer.locator('office-ui-menu-button office-ui-color-grid[data-color-grid="fill"]');
	await expect(grid.getByText('Theme Colors', { exact: true })).toBeVisible();
	await expect(grid.getByText('Standard Colors', { exact: true })).toBeVisible();
	await expect(grid.locator('[data-source="theme"]')).toHaveCount(60);
	const tint = grid.getByRole('menuitemradio', { name: 'Accent 2, Lighter 40%', exact: true });
	const tintColor = (await tint.getAttribute('data-color'))!;
	await tint.click();
	await idle(viewer);
	expect((await style(viewer)).fill).toBe(tintColor);
	await expect(shape.locator('path').first()).toHaveAttribute('fill', tintColor);
	// It is saved as Visio's theme formula over the colour, so it follows a later theme change.
	const saved = await viewer.evaluate((node) =>
		Array.from((node as VisioViewerElement).exportVsdx().bytes),
	);
	const xml = await (
		await JSZip.loadAsync(new Uint8Array(saved))
	)
		.file('visio/pages/page1.xml')!
		.async('string');
	expect(xml).toContain('F="THEMEGUARD(MSOTINT(THEMEVAL(&quot;AccentColor2&quot;),40))"');
	// Visio's own row of variant colours is offered too.
	await viewer.locator('[data-menu="fill"] button').first().click();
	await expect(grid.locator('[data-source="extra"]')).toHaveCount(7);
	await expect(grid.getByRole('menuitemradio', { name: 'Dark, Lighter 50%' })).toBeVisible();
	await page.keyboard.press('Escape');
	// The menu closed, and reopening shows the colour as current.
	await expect(grid.getByText('Theme Colors', { exact: true })).toBeHidden();
	await viewer.locator('[data-menu="fill"] button').first().click();
	await expect(tint).toHaveAttribute('aria-checked', 'true');
	await page.screenshot({ path: test.info().outputPath('fill-colors.png') });
	await page.keyboard.press('Escape');

	// A custom colour through More Colors, typed as RGB.
	await pickColor(viewer, 'fill', 'more');
	const dialog = viewer.locator('.more-colors-dialog');
	await expect(dialog).toHaveAttribute('open', '');
	await expect(dialog.locator('[data-color-field="hex"]')).toHaveValue(tintColor.toUpperCase());
	await dialog.locator('[data-color-field="red"]').fill('18');
	await dialog.locator('[data-color-field="green"]').fill('52');
	await dialog.locator('[data-color-field="blue"]').fill('86');
	await expect(dialog.locator('[data-color-field="hex"]')).toHaveValue('#123456');
	await page.screenshot({ path: test.info().outputPath('more-colors.png') });
	await dialog.locator('[command="more-colors-dialog-ok"]').click();
	await idle(viewer);
	expect((await style(viewer)).fill).toBe('#123456');
	// It is offered again under Recent Colors, also for the line.
	await pickColor(viewer, 'line', '#123456');
	await idle(viewer);
	expect((await style(viewer)).line).toBe('#123456');

	// The Format Shape task pane applies each change at once.
	const pane = await formatShapePane(viewer);
	await expect(viewer.locator('#inspector-pane')).toHaveAttribute('label', 'Format Shape');
	await expect(pane.getByRole('radio', { name: 'Solid fill', exact: true })).toBeChecked();
	await pane.locator('[data-format-color="fill"]').click();
	await page.screenshot({ path: test.info().outputPath('format-shape-pane.png') });
	await pane
		.locator('[data-format-section="fill"] office-ui-color-grid')
		.getByRole('menuitemradio', { name: 'Green', exact: true })
		.click();
	await idle(viewer);
	expect((await style(viewer)).fill).toBe('#00b050');
	await pane.locator('[data-pane-field="lineWeight"]').fill('3');
	await pane.locator('[data-pane-field="lineWeight"]').press('Tab');
	await idle(viewer);
	expect((await style(viewer)).width).toBe(3);
	await pane.getByRole('radio', { name: 'No line', exact: true }).check();
	await idle(viewer);
	expect((await style(viewer)).pattern).toBe(0);
	await expect(pane.locator('[data-format-section="line"] .format-pane-details')).toBeHidden();
	await viewer.locator('.qat [data-command="undo"]').click();
	await idle(viewer);
	expect((await style(viewer)).pattern).not.toBe(0);
	await expect(pane.getByRole('radio', { name: 'Solid line', exact: true })).toBeChecked();
	// Closing the pane returns to the drawing.
	await viewer
		.locator('#inspector-pane')
		.getByRole('button', { name: 'Close Format Shape' })
		.click();
	await expect(pane).toBeHidden();
	expect(errors).toEqual([]);
});
