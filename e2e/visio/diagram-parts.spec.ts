import { test, expect } from '@playwright/test';
import { createVsdxFixture } from './fixture.mjs';
import { openDemo } from './demo-page';

test('More Shapes, containers and callouts edit the page as single undoable steps', async ({
	page,
}) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.addInitScript(() => localStorage.clear());
	await page.setViewportSize({ width: 1440, height: 1000 });
	await openDemo(page);
	const viewer = page.locator('visio-viewer');
	await expect(viewer.locator('svg.paper')).toContainText('Release workflow');
	await page.locator('#file').setInputFiles({
		name: 'diagram-parts.vsdx',
		mimeType: 'application/vnd.ms-visio.drawing',
		buffer: await createVsdxFixture('Existing shape'),
	});
	await expect(page.locator('#file-name')).toHaveText('diagram-parts.vsdx');
	await expect(viewer.locator('svg.paper')).toContainText('Existing shape');
	const shapes = viewer.locator('svg.paper > g > [data-shape-id]');
	const status = viewer.locator('[data-status]');
	const paper = viewer.locator('svg.paper');

	// More Shapes opens Basic Flowchart Shapes as a new section of the Shapes window.
	await viewer.locator('#shapes-more').click();
	const menu = viewer.locator('[data-shapes-menu="more"]');
	await menu.locator('office-ui-menu-item[label="Basic Flowchart Shapes"]').click();
	const flowchart = viewer.locator('[data-stencil="basic-flowchart"]');
	await expect(flowchart.locator('.stencil-title')).toHaveText('Basic Flowchart Shapes');
	const before = await shapes.count();
	await flowchart
		.locator('[data-master="flowchart-decision"]')
		.dragTo(paper, { targetPosition: { x: 200, y: 160 } });
	await expect(status).toHaveText(/Decision .+ added from Basic Flowchart Shapes/);
	await viewer
		.locator('#shapes-stencils [data-master="rectangle"]')
		.dragTo(paper, { targetPosition: { x: 360, y: 160 } });
	await expect(shapes).toHaveCount(before + 2);
	await viewer.locator('#shapes-stencils').evaluate((panel) => (panel.scrollTop = 600));
	await page.screenshot({ path: test.info().outputPath('stencils.png') });
	// Collapsing the section hides its masters.
	await flowchart.locator('.stencil-title').click();
	await expect(flowchart.locator('[data-master="flowchart-decision"]')).toBeHidden();
	// Arrow Shapes opens too, and Search finds masters of every built-in stencil.
	await viewer.locator('#shapes-more').click();
	await menu.locator('office-ui-menu-item[label="Arrow Shapes"]').click();
	await expect(viewer.locator('[data-stencil="arrow-shapes"] [data-master]')).toHaveCount(13);
	await viewer.locator('.shapes-search-field').fill('loop');
	await expect(viewer.locator('#shapes-search li:not([hidden])')).toHaveText(['Loop limit']);
	await viewer.locator('.shapes-search-field').fill('');
	await expect(viewer.locator('#shapes-stencils')).toBeVisible();

	// Select both new shapes and wrap them in a container from Insert > Container.
	// Fix the shapes by ID: the container is inserted behind them, shifting their stacking index.
	const id = async (index: number) => (await shapes.nth(index).getAttribute('data-shape-id'))!;
	const decision = viewer.locator(`svg.paper > g > [data-shape-id="${await id(before)}"]`);
	const rectangle = viewer.locator(`svg.paper > g > [data-shape-id="${await id(before + 1)}"]`);
	await decision.click({ force: true });
	await rectangle.click({ force: true, modifiers: ['Shift'] });
	await expect(viewer.locator('svg.paper [data-selected="true"]')).toHaveCount(2);
	await viewer.getByRole('tab', { name: 'Insert', exact: true }).click();
	const container = viewer.locator('office-ui-gallery[command="container"]');
	await expect(container.locator('.trigger')).toBeEnabled();
	await container.locator('.trigger').click();
	await viewer.locator('[data-gallery-popup="container"] [data-gallery-item="classic"]').click();
	await expect(status).toHaveText('Inserted a Classic container.');
	await expect(shapes).toHaveCount(before + 3);
	await page.screenshot({ path: test.info().outputPath('container.png') });

	// Dragging the container by its heading moves its members with it.
	const frame = viewer.locator(`svg.paper [data-shape-id][data-selected="true"]`);
	const box = (await frame.boundingBox())!;
	const memberBefore = (await rectangle.boundingBox())!;
	await page.mouse.move(box.x + 12, box.y + 6);
	await page.mouse.down();
	await page.mouse.move(box.x + 60, box.y + 46, { steps: 6 });
	await page.mouse.up();
	await expect(status).toHaveText('Shapes moved.');
	await expect
		.poll(async () => (await rectangle.boundingBox())!.x - memberBefore.x)
		.toBeGreaterThan(30);

	// A callout attaches to one shape with a leader that is glued to it.
	await decision.click({ force: true });
	const callout = viewer.locator('office-ui-gallery[command="callout"]');
	await callout.locator('.trigger').click();
	await viewer.locator('[data-gallery-popup="callout"] [data-gallery-item="rounded"]').click();
	await expect(status).toHaveText('Inserted a Rounded callout.');
	await expect(shapes).toHaveCount(before + 5);
	await page.screenshot({ path: test.info().outputPath('callout.png') });

	// Each part is one undo step.
	const undo = viewer.locator('.qat').getByRole('button', { name: 'Undo', exact: true });
	await undo.click();
	await expect(shapes).toHaveCount(before + 3);
	await undo.click();
	await undo.click();
	await expect(shapes).toHaveCount(before + 2);
	expect(errors).toEqual([]);
});
