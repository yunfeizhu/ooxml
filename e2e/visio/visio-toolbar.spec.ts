import { test, expect } from '@playwright/test';
import { createVsdxFixture } from './fixture.mjs';
import { openDemo } from './demo-page';
import { ribbonGroup } from './ribbon';

test('Visio ribbon draws, deletes, undoes and redoes with tools and shortcuts', async ({
	page,
}) => {
	await page.setViewportSize({ width: 1440, height: 1000 });
	await openDemo(page);
	const viewer = page.locator('visio-viewer');
	const ribbon = (name: string) =>
		viewer.locator('.toolbar').getByRole('button', { name, exact: true });
	// The sample is editable, so its drawing tools are available before any file is opened.
	await expect(ribbon('Rectangle')).toBeEnabled();
	await page.locator('#file').setInputFiles({
		name: 'toolbar.vsdx',
		mimeType: 'application/vnd.ms-visio.drawing',
		buffer: await createVsdxFixture('Existing shape'),
	});
	await expect(page.locator('#file-name')).toHaveText('toolbar.vsdx');
	await expect(viewer.locator('.qat [data-command="undo"]')).toBeDisabled();
	await expect(viewer.locator('.qat [data-command="undo"]')).toHaveAttribute(
		'title',
		'Undo (Ctrl+Z)',
	);

	await ribbon('Rectangle').click();
	await expect(viewer.locator('office-ui-menu-button[command="rectangle"]')).toHaveAttribute(
		'data-active',
		'',
	);
	const paper = await viewer.locator('svg.paper').boundingBox();
	const start = { x: paper!.x + paper!.width * 0.2, y: paper!.y + paper!.height * 0.6 };
	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	await page.mouse.move(start.x + 120, start.y + 60, { steps: 4 });
	await expect(viewer.locator('.draw-preview')).toHaveCount(1);
	await page.mouse.up();
	const created = viewer.locator('svg.paper [data-shape-id="2"]');
	await expect(created).toHaveCount(1);
	await expect(viewer.locator('.draw-preview')).toHaveCount(0);
	await expect(viewer.locator('[data-width-status]')).toHaveAttribute('value', /^Width: .* in\.$/);
	await expect(viewer.locator('[data-height-status]')).toHaveAttribute(
		'value',
		/^Height: .* in\.$/,
	);
	await expect(page.locator('#file-state')).toContainText('Edited copy');

	await page.keyboard.press('Escape');
	await expect(ribbon('Pointer Tool')).toHaveAttribute('aria-pressed', 'true');
	await created.click();
	// SVG outlines scale with drawing units; a focus ring would cover the page.
	expect(await created.evaluate((shape) => getComputedStyle(shape).outlineStyle)).toBe('none');
	await page.keyboard.press('Delete');
	await expect(created).toHaveCount(0);
	await page.keyboard.press('Control+z');
	await expect(created).toHaveCount(1);
	await page.keyboard.press('Control+y');
	await expect(created).toHaveCount(0);
	await viewer.locator('.qat [data-command="undo"]').click();
	await expect(created).toHaveCount(1);

	// Formatting becomes available when an editable shape is selected.
	await expect(created).toHaveAttribute('data-selected', 'true');
	await expect(ribbon('Bold')).toBeEnabled();
	await created.press('Escape');
	await expect(viewer.locator('svg.paper [data-selected="true"]')).toHaveCount(0);
	await expect(ribbon('Bold')).toBeDisabled();
	await expect(ribbon('Bold')).toHaveAttribute('title', /Select a shape to edit formatting/);
	// Dropdowns open as top-layer menus that stay inside the window, even at the right edge.
	await ribbonGroup(viewer, 'Editing');
	await expect(viewer.getByRole('button', { name: 'Select', exact: true })).toBeEnabled();
	await viewer.getByRole('button', { name: 'Find', exact: true }).click();
	const menu = viewer.locator('office-ui-menu-button[data-menu="find"] >> [role="menu"]');
	await expect(menu).toBeVisible();
	const box = await menu.boundingBox();
	expect(box!.x + box!.width).toBeLessThanOrEqual(1440);
	await page.keyboard.press('Escape');
	await expect(menu).toBeHidden();

	// Visio's Shapes window: drag the Rectangle master onto the page to drop a shape there.
	const shapesBefore = await viewer.locator('svg.paper > g > [data-shape-id]').count();
	await viewer
		.locator('[data-master="rectangle"]')
		.first()
		.dragTo(viewer.locator('svg.paper'), { targetPosition: { x: 120, y: 120 } });
	await expect(viewer.locator('svg.paper > g > [data-shape-id]')).toHaveCount(shapesBefore + 1);
	await expect(viewer.locator('[data-status]')).toHaveText(/added from Basic Shapes/);
	// Every Basic Shapes master drops; Circle is a native ellipse.
	const circle = viewer.locator('#shapes-stencils [data-master="circle"]');
	await expect(circle).not.toHaveAttribute('aria-disabled', 'true');
	await circle.dragTo(viewer.locator('svg.paper'), { targetPosition: { x: 260, y: 120 } });
	await expect(viewer.locator('svg.paper > g > [data-shape-id]')).toHaveCount(shapesBefore + 2);
	await expect(viewer.locator('[data-status]')).toHaveText(/Circle .+ added from Basic Shapes/);
	// Dropped masters carry Visio's default theme look, and on screen no outline is thinner than
	// one pixel, so a new shape is visible even when the page is zoomed out.
	const drawn = await viewer
		.locator('svg.paper > g > [data-shape-id]')
		.last()
		.locator('[data-geometry]')
		.first()
		.evaluate((path) => {
			const svg = (path as SVGGraphicsElement).ownerSVGElement!;
			const style = getComputedStyle(path);
			const inch = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
			// The hairline rule computes to `calc(<n>px)` in the SVG's user units.
			const width = parseFloat(style.strokeWidth.replace(/^calc\(/, ''));
			return { fill: style.fill, strokePixels: width * inch };
		});
	expect(drawn.fill).toBe('rgb(91, 155, 213)');
	expect(drawn.strokePixels).toBeGreaterThanOrEqual(0.99);

	await viewer.getByRole('tab', { name: 'View', exact: true }).click();
	await viewer.locator('[data-check="ruler"]').click();
	await expect(viewer.locator('.canvas-area')).toHaveAttribute('data-ruler', 'true');
	await expect(viewer.locator('office-ui-ruler.ruler-h')).toBeVisible();
	await viewer.locator('[data-check="grid"]').click();
	await expect(viewer.locator('.viewport')).toHaveAttribute('data-grid', 'true');
	const before = await viewer.evaluate(
		(element) => (element as HTMLElement & { zoom: number }).zoom,
	);
	await ribbon('Page Width').click();
	const after = await viewer.evaluate(
		(element) => (element as HTMLElement & { zoom: number }).zoom,
	);
	expect(after).toBeGreaterThan(before);
	const canvas = viewer.locator('.viewport');
	expect(await canvas.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});
