import { expect, test } from '@playwright/test';
import { parseVsdx } from 'ooxml-core/visio';
import type { VisioViewerElement } from 'ooxml-ui/visio';
import { createVsdxFixture } from './fixture.mjs';
import { openDemo } from './demo-page';
import { taskPane } from './ribbon';

test('Data tab imports a CSV, links a dragged row, refreshes it and adds data graphics', async ({
	page,
}) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	// A File System Access stand-in: the handle re-reads whatever text the test puts in place.
	await page.addInitScript(() => {
		const state = globalThis as unknown as { dataText: string };
		state.dataText = 'Name,Load\nImport test,20\nOther,80\n';
		(window as unknown as { showOpenFilePicker: unknown }).showOpenFilePicker = async () => [
			{ getFile: async () => new File([state.dataText], 'servers.csv', { type: 'text/csv' }) },
		];
	});
	await page.setViewportSize({ width: 1600, height: 1000 });
	await openDemo(page);
	const viewer = page.locator('visio-viewer');
	await expect(viewer.locator('svg.paper')).toContainText('Release workflow');
	await page.locator('#file').setInputFiles({
		name: 'Data.vsdx',
		mimeType: 'application/vnd.ms-visio.drawing',
		buffer: await createVsdxFixture('Data target'),
	});
	await expect(page.locator('#file-name')).toHaveText('Data.vsdx');
	await expect(viewer.locator('svg.paper')).toContainText('Data target');
	await viewer.getByRole('tab', { name: 'Data', exact: true }).click();
	await expect(viewer.locator('[command="refresh-all"] button')).toBeDisabled();
	await viewer.locator('[command="quick-import"] button').click();
	const pane = viewer.locator('.external-data');
	await expect(pane).toBeVisible();
	await expect(pane.locator('tbody tr')).toHaveText(['Import test20', 'Other80']);
	const shape = viewer.locator('svg.paper [data-shape-id="1"]');
	await pane.locator('tbody tr').nth(1).dragTo(shape);
	await expect(viewer.locator('[data-status]')).toHaveText(/Linked shape 1 to row 2/);
	await expect(pane.locator('tbody tr').nth(1)).toHaveText('1Other80');
	await shape.click();
	await expect(viewer.locator('.shape-inspector')).toContainText('Other');
	// Refresh All re-reads the saved handle and updates the linked shape.
	await page.evaluate(() => {
		(globalThis as unknown as { dataText: string }).dataText =
			'Name,Load\nImport test,25\nOther,90\n';
	});
	await viewer.locator('[command="refresh-all"] button').click();
	await expect(viewer.locator('[data-status]')).toHaveText(/Refreshed 1 recordset/);
	await expect(viewer.locator('.shape-inspector')).toContainText('90');
	// Data Graphics: a text callout and Color by Value with a legend.
	await viewer.getByRole('button', { name: 'Data Graphics', exact: true }).click();
	await viewer.locator('office-ui-menu-item[command="graphic-text"]').click();
	const graphics = viewer.locator('.data-graphics-dialog');
	await graphics.locator('[name="field"]').selectOption('Name');
	await graphics.locator('[label="Apply"] button').click();
	await expect(viewer.locator('svg.paper')).toContainText('Other');
	await viewer.getByRole('button', { name: 'Data Graphics', exact: true }).click();
	await viewer.locator('office-ui-menu-item[command="graphic-color"]').click();
	await graphics.locator('[name="field"]').selectOption('Load');
	await graphics.locator('[label="Apply"] button').click();
	await expect(viewer.locator('[data-status]')).toHaveText(/Applied Color by Value/);
	await viewer.getByRole('button', { name: 'Insert Legend', exact: true }).click();
	await viewer.locator('office-ui-menu-item[command="legend-vertical"]').click();
	await expect(viewer.locator('[data-status]')).toHaveText(/Inserted a legend/);
	await page.screenshot({ path: test.info().outputPath('data-graphics.png') });
	const bytes = await viewer.evaluate((node) =>
		Array.from((node as VisioViewerElement).exportVsdx().bytes),
	);
	const saved = await parseVsdx(new Uint8Array(bytes));
	expect(saved.dataRecordsets?.[0]).toMatchObject({
		name: 'servers.csv',
		links: [{ rowId: '2', pageId: '1', shapeId: '1' }],
	});
	const target = saved.pages[0]!.shapes.find((item) => item.id === '1')!;
	expect(target.shapeData?.find((row) => row.name === 'Load')).toMatchObject({
		value: 90,
		dataLinked: true,
	});
	expect(saved.pages[0]!.shapes.some((item) => item.kind === 'group')).toBe(true);
	// Remove Data Graphics restores the fill and deletes the callout and legend.
	await viewer.locator('svg.paper').click({ position: { x: 5, y: 5 } });
	await page.keyboard.press('Escape');
	await viewer.getByRole('button', { name: 'Data Graphics', exact: true }).click();
	await viewer.locator('office-ui-menu-item[command="graphic-remove"]').click();
	await expect(viewer.locator('[data-status]')).toHaveText(/Removed data graphics/);
	await expect(viewer.locator('svg.paper > g [data-shape-id]').first()).toBeAttached();
	expect(errors).toEqual([]);
});

test('Define Shape Data adds a row from the Shape Data window', async ({ page }) => {
	await page.setViewportSize({ width: 1600, height: 1000 });
	await openDemo(page);
	const viewer = page.locator('visio-viewer');
	await expect(viewer.locator('svg.paper')).toContainText('Release workflow');
	await page.locator('#file').setInputFiles({
		name: 'Define.vsdx',
		mimeType: 'application/vnd.ms-visio.drawing',
		buffer: await createVsdxFixture('Define target'),
	});
	await expect(page.locator('#file-name')).toHaveText('Define.vsdx');
	await expect(viewer.locator('svg.paper')).toContainText('Define target');
	await viewer.locator('svg.paper [data-shape-id="1"]').click();
	await taskPane(viewer, 'Shape Data');
	await expect(viewer.locator('office-ui-task-pane.inspector-pane')).toHaveAttribute(
		'label',
		'Shape Data',
	);
	await viewer.locator('[data-define-shape-data]').click();
	const dialog = viewer.locator('.shape-data-dialog');
	await dialog.locator('[name="label"]').fill('Owner');
	await dialog.locator('[name="value"]').fill('Ana');
	await dialog.locator('[label="OK"] button').click();
	await expect(viewer.locator('[data-status]')).toHaveText(/Saved Shape Data Owner/);
	await expect(viewer.locator('.shape-inspector')).toContainText('Ana');
});
