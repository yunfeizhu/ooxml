import { expect, test, type Locator } from '@playwright/test';
import type { VisioViewerElement } from 'ooxml-ui/visio';
import { openDemo } from './demo-page';
import { history } from './ribbon';

/** Page inches between a shape and the one AutoConnect adds (Visio's avenue size). */
const GAP = 0.375;

const inventory = (viewer: Locator) =>
	viewer.evaluate((node) => {
		const page = (node as VisioViewerElement).controller.state.document!.pages[0]!;
		return {
			shapes: page.shapes.map((shape) => ({
				id: shape.id,
				kind: shape.kind,
				x: shape.rotation?.pinX ?? 0,
				y: shape.rotation?.pinY ?? 0,
				width: shape.width,
				height: shape.height,
			})),
			glue: page.connectors.map((connect) => `${connect.fromShapeId}>${connect.toShapeId}`),
		};
	});

for (const framework of ['vanilla', 'react', 'vue', 'angular', 'svelte', 'solid']) {
	test(`${framework}: AutoConnect arrows add a connected Quick Shape and connect neighbours`, async ({
		page,
	}) => {
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.setViewportSize({ width: 1600, height: 1000 });
		await openDemo(
			page,
			framework === 'vanilla' ? '/demo/?sample=1' : `/demo-${framework}/?sample=1`,
		);
		const viewer = page.locator('visio-viewer');
		const before = await inventory(viewer);
		const source = before.shapes.find((shape) => shape.id === '1')!;
		const arrows = viewer.locator('.auto-connect [data-auto-connect]');
		await expect(arrows).toHaveCount(0);

		// Resting on a shape shows an arrow outside each side.
		await viewer.locator('svg.paper [data-shape-id="1"]').hover();
		await expect(arrows).toHaveCount(4);
		const shapeBox = (await viewer.locator('svg.paper [data-shape-id="1"]').boundingBox())!;
		const right = viewer.locator('.auto-connect [data-auto-connect="right"]');
		const arrowBox = (await right.boundingBox())!;
		expect(arrowBox.x).toBeGreaterThan(shapeBox.x + shapeBox.width);

		// An arrow offers the first four Quick Shapes of the stencil the drawing shows: the sample
		// docks Basic Flowchart Shapes.
		await right.hover();
		const bar = viewer.locator('.auto-connect-bar');
		await expect(bar).toBeVisible();
		await expect(bar.locator('button')).toHaveCount(4);
		// The sample docks Basic Flowchart Shapes, so these are its Quick Shapes.
		await expect(bar.locator('button').nth(1)).toHaveAttribute('aria-label', 'Decision');
		await bar.locator('[data-auto-connect-master="flowchart-decision"]').click();
		await expect
			.poll(async () => (await inventory(viewer)).shapes.length)
			.toBe(before.shapes.length + 2);
		const added = await inventory(viewer);
		const dropped = added.shapes.find(
			(shape) => shape.kind === 'shape' && !before.shapes.some((old) => old.id === shape.id),
		)!;
		expect(dropped.width).toBeGreaterThan(0);
		expect(dropped.y).toBeCloseTo(source.y);
		expect(dropped.x - dropped.width / 2 - (source.x + source.width / 2)).toBeCloseTo(GAP);
		const connector = String(Number(dropped.id) + 1);
		expect(added.glue.filter((item) => item.startsWith(`${connector}>`)).sort()).toEqual(
			[`${connector}>1`, `${connector}>${dropped.id}`].sort(),
		);

		// The shape and its connector are one step.
		await history(viewer, 'Undo').click();
		await expect.poll(() => inventory(viewer)).toEqual(before);

		// The arrow itself connects to the shape it points at: 2 sits below 1.
		await viewer.locator('svg.paper [data-shape-id="1"]').hover();
		await viewer.locator('.auto-connect [data-auto-connect="down"]').click();
		await expect
			.poll(async () => (await inventory(viewer)).shapes.length)
			.toBe(before.shapes.length + 1);
		const connected = await inventory(viewer);
		const line = connected.shapes.find(
			(shape) => !before.shapes.some((old) => old.id === shape.id),
		)!;
		expect(connected.glue.filter((item) => item.startsWith(`${line.id}>`)).sort()).toEqual([
			`${line.id}>1`,
			`${line.id}>2`,
		]);

		// Another tool, or View > AutoConnect off, shows no arrows.
		await viewer.locator('.viewport').press('Escape');
		await viewer.getByRole('tab', { name: 'View', exact: true }).click();
		const box = viewer.locator('[data-check="auto-connect"]');
		await expect(box).toHaveJSProperty('checked', true);
		await box.click();
		await expect(box).toHaveJSProperty('checked', false);
		await viewer.locator('svg.paper [data-shape-id="4"]').hover();
		await expect(arrows).toHaveCount(0);
		await box.click();
		await viewer.locator('svg.paper [data-shape-id="3"]').hover();
		await viewer.locator('svg.paper [data-shape-id="4"]').hover();
		await expect(arrows).toHaveCount(4);
		expect(errors).toEqual([]);
	});
}
