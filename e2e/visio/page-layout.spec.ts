import { expect, test, type Locator } from '@playwright/test';
import { openDemo } from './demo-page';
import { ribbonGroup } from './ribbon';

const applyEdits = (viewer: Locator, edits: unknown[]) =>
	viewer.evaluate(async (node, commands) => {
		await (node as unknown as { applyEdits(edits: readonly unknown[]): Promise<void> }).applyEdits(
			commands,
		);
	}, edits);
const settings = (viewer: Locator) =>
	viewer.evaluate((node) => {
		const document = (
			node as unknown as {
				controller: {
					state: {
						document: { snapGlue?: unknown; pages: { layout?: Record<string, number> }[] };
					};
				};
			}
		).controller.state.document;
		return { layout: document.pages[0]!.layout, snapGlue: document.snapGlue };
	});

test('line jumps, Ruler & Grid and Snap & Glue edit the drawing with undo', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.setViewportSize({ width: 1600, height: 1000 });
	await openDemo(page);
	const viewer = page.locator('visio-viewer');
	await viewer.locator('office-ui-ribbon .file').click();
	await viewer.locator('[data-backstage-item="new"]').click();
	await viewer.locator('[data-backstage-action="new-blank"]').click();
	await expect(viewer.locator('svg.paper')).toBeVisible();
	const status = viewer.locator('[data-status]');
	const line = (shapeId: string, beginX: number, beginY: number, endX: number, endY: number) => ({
		type: 'create-line',
		pageId: '0',
		shapeId,
		beginX,
		beginY,
		endX,
		endY,
		route: 'straight',
	});
	// The new drawing is still being adopted when its page first shows.
	await expect
		.poll(() =>
			viewer.evaluate((node) => {
				const state = (
					node as unknown as {
						controller: {
							state: { loading: boolean; edit: { busy: boolean; sourceAvailable: boolean } };
						};
					}
				).controller.state;
				return !state.loading && !state.edit.busy && state.edit.sourceAvailable;
			}),
		)
		.toBe(true);
	await applyEdits(viewer, [line('1', 1, 4, 7, 4), line('2', 4, 1, 4, 8)]);

	// Visio's default: the horizontal connector jumps over the vertical one with an arc.
	const jumped = viewer.locator('svg.paper path[data-line-jumps]');
	await expect(jumped).toHaveCount(1);
	await expect(jumped).toHaveAttribute('d', / A /);
	await viewer.getByRole('tab', { name: 'Design', exact: true }).click();
	await ribbonGroup(viewer, 'Layout');
	await viewer.locator('office-ui-menu-button[data-menu="connectors"]').click();
	const item = viewer.locator('office-ui-menu-item[command="line-jumps"]');
	await expect(item).toHaveAttribute('checked', 'true');
	await item.click();
	await expect(status).toHaveText('Line jumps are hidden.');
	await expect(jumped).toHaveCount(0);

	// View > Show launcher: a fixed half-inch grid across, origin one inch up.
	await viewer.getByRole('tab', { name: 'View', exact: true }).click();
	await ribbonGroup(viewer, 'Show');
	await viewer.locator('office-ui-ribbon-group[launcher="show-dialog"] .launcher').click();
	const grid = viewer.locator('.ruler-grid-dialog');
	await expect(grid.getByRole('combobox', { name: 'Grid spacing, horizontal' })).toHaveValue('8');
	await grid.getByRole('combobox', { name: 'Grid spacing, horizontal' }).selectOption('0');
	await grid.getByRole('spinbutton', { name: 'Minimum spacing (in.), horizontal' }).fill('0.5');
	await grid.getByRole('spinbutton', { name: 'Grid origin (in.), vertical' }).fill('1');
	await grid.getByRole('button', { name: 'OK', exact: true }).click();
	await expect(status).toHaveText('Updated the ruler and grid.');
	await expect
		.poll(() => settings(viewer))
		.toMatchObject({
			layout: { lineJumpCode: 0, gridDensityX: 0, gridSpacingX: 0.5, gridOriginY: 1 },
		});
	const zoom = await viewer.evaluate(
		(node) =>
			(node as unknown as { controller: { state: { zoom: number } } }).controller.state.zoom,
	);
	await expect
		.poll(() =>
			viewer
				.locator('svg.paper')
				.evaluate((svg) => (svg as SVGElement).style.getPropertyValue('--_vv-grid-x')),
		)
		.toBe(`${0.5 * 96 * zoom}px`);

	// View > Visual Aids launcher: Snap off, saved to the drawing.
	await ribbonGroup(viewer, 'Visual Aids');
	await viewer.locator('office-ui-ribbon-group[launcher="visual-aids-dialog"] .launcher').click();
	const snap = viewer.locator('.snap-glue-dialog');
	await expect(snap.getByRole('checkbox', { name: 'Snap', exact: true })).toBeChecked();
	await snap.getByRole('checkbox', { name: 'Snap', exact: true }).uncheck();
	await page.screenshot({ path: test.info().outputPath('snap-glue.png') });
	await snap.getByRole('button', { name: 'OK', exact: true }).click();
	await expect(status).toHaveText('Updated snap and glue.');
	await expect
		.poll(() => settings(viewer))
		.toMatchObject({ snapGlue: { snapSettings: 65847 | 32768 } });

	// Three undo steps bring back the defaults and the jump.
	const undo = viewer.locator('.qat [data-command="undo"]');
	for (let step = 0; step < 3; ++step) await undo.click();
	await expect.poll(() => settings(viewer)).toEqual({});
	await expect(jumped).toHaveCount(1);
	expect(errors).toEqual([]);
});
