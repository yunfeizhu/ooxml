import { test, expect, type Locator, type Page } from '@playwright/test';
import JSZip from 'jszip';
import type { VisioViewerElement } from 'ooxml-ui/visio';
import { createVsdxFixture } from './fixture.mjs';
import { openDemo } from './demo-page';

/** Two local rectangles: 1 at (2, 7) and 2 at (6, 4), each 2 x 1 inches on an 8.5 x 11 page. */
async function connectorFixture(): Promise<Buffer> {
	const zip = await JSZip.loadAsync(await createVsdxFixture('Left box'));
	const xml = await zip.file('visio/pages/page1.xml')!.async('string');
	const anchor = xml.match(/<Shape ID="1"[\s\S]*?<\/Shape>/u)![0];
	const box = (id: string, name: string, x: number, y: number) => {
		let shape = anchor.replace('ID="1"', `ID="${id}"`).replace('Left box', name);
		for (const [cell, value] of Object.entries({ PinX: x, PinY: y, Width: 2, Height: 1 }))
			shape = shape.replace(new RegExp(`(<Cell N="${cell}" V=")[^"]+"`, 'u'), `$1${value}"`);
		return shape.replaceAll('<Cell N="X" V="3"/>', '<Cell N="X" V="2"/>');
	};
	zip.file(
		'visio/pages/page1.xml',
		xml.replace(anchor, box('1', 'Left box', 2, 7) + box('2', 'Right box', 6, 4)),
	);
	return zip.generateAsync({ type: 'nodebuffer' });
}

async function client(viewer: Locator, x: number, y: number) {
	const paper = (await viewer.locator('svg.paper').boundingBox())!;
	return { x: paper.x + (x / 8.5) * paper.width, y: paper.y + ((11 - y) / 11) * paper.height };
}
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	await page.mouse.move(to.x, to.y, { steps: 6 });
	await page.mouse.up();
}
const model = (viewer: Locator) =>
	viewer.evaluate((node) => {
		const page = (node as VisioViewerElement).controller.state.document!.pages[0]!;
		return {
			connectors: page.connectors.map((row) => [row.fromCell, row.toShapeId, row.toCell]),
			points: page.shapes.map((shape) => shape.connectionPoints?.length ?? 0),
			routes: page.shapes.map((shape) => shape.connectorRoute ?? null),
			geometry: page.shapes.map((shape) => shape.geometry[0]?.path ?? ''),
		};
	});

test('connection points, point glue, right-angle routing and connector styles', async ({
	page,
}) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.setViewportSize({ width: 1500, height: 1000 });
	await openDemo(page);
	const viewer = page.locator('visio-viewer');
	await page.locator('#file').setInputFiles({
		name: 'connectors.vsdx',
		mimeType: 'application/vnd.ms-visio.drawing',
		buffer: await connectorFixture(),
	});
	await expect(page.locator('#file-name')).toHaveText('connectors.vsdx');
	await expect(viewer.locator('svg.paper')).toContainText('Right box');
	const button = (name: string) =>
		viewer.locator('.toolbar').getByRole('button', { name, exact: true });

	// Home > Tools > Connection Point (Ctrl+Shift+1): a click on the right box adds a point.
	await expect(button('Connection Point')).toBeEnabled();
	await viewer.locator('svg.paper').click({ position: { x: 5, y: 5 } });
	await page.keyboard.press('Control+Shift+1');
	await expect(button('Connection Point')).toHaveAttribute('aria-pressed', 'true');
	const left = await client(viewer, 5, 4);
	await page.mouse.click(left.x, left.y);
	await expect(viewer.locator('[data-connection-point]')).toHaveCount(1);
	await expect.poll(async () => (await model(viewer)).points).toEqual([0, 1]);

	// Connector tool: begin on the left box, release on the point: point-to-point glue.
	await page.keyboard.press('Control+3');
	await drag(page, await client(viewer, 2, 7), await client(viewer, 5.02, 4.02));
	await expect
		.poll(async () => (await model(viewer)).connectors)
		.toEqual([
			['BeginX', '1', 'PinX'],
			['EndX', '2', 'Connections.X1'],
		]);
	let state = await model(viewer);
	expect(state.routes[2]).toBe('right-angle');
	// Right-angle: every segment of the route is horizontal or vertical.
	const segments = (path: string) =>
		[...path.matchAll(/[ML] ([-\d.e]+) ([-\d.e]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
	const orthogonal = (path: string) =>
		segments(path)
			.slice(1)
			.every(([x, y], i) => {
				const [px, py] = segments(path)[i]!;
				return Math.abs(x! - px!) < 1e-6 || Math.abs(y! - py!) < 1e-6;
			});
	expect(segments(state.geometry[2]!).length).toBeGreaterThan(2);
	expect(orthogonal(state.geometry[2]!)).toBe(true);
	await viewer.screenshot({ path: test.info().outputPath('right-angle.png') });

	// Moving the right box drags the connector along, with a live preview during the drag.
	await page.keyboard.press('Control+1');
	const from = await client(viewer, 6.5, 4);
	await page.mouse.click(from.x, from.y);
	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	const to = await client(viewer, 6.5, 1.5);
	await page.mouse.move(to.x, to.y, { steps: 8 });
	await viewer.screenshot({ path: test.info().outputPath('dragging.png') });
	await expect(viewer.locator('.connector-preview')).toHaveCount(1);
	await page.mouse.up();
	await expect(viewer.locator('.connector-preview')).toHaveCount(0);
	await expect.poll(async () => (await model(viewer)).geometry[2]).not.toBe(state.geometry[2]);
	state = await model(viewer);
	expect(state.connectors).toHaveLength(2);
	expect(orthogonal(state.geometry[2]!)).toBe(true);

	// Design > Connectors > Curved restyles the selected connector; undo restores it.
	// A thin connector is hard to hit at a fixed spot; select it as the Selection pane would.
	await viewer.evaluate((node) =>
		(node as VisioViewerElement).controller.selectShape({
			id: '3',
			name: 'Connector',
			pageId: '1',
		}),
	);
	await expect
		.poll(() =>
			viewer.evaluate((node) => (node as VisioViewerElement).controller.state.selectedShape?.id),
		)
		.toBe('3');
	await viewer.getByRole('tab', { name: 'Design', exact: true }).click();
	await viewer.locator('[data-menu="connectors"]').click();
	await viewer.locator('[command="connectors-curved"]').click();
	await expect.poll(async () => (await model(viewer)).routes[2]).toBe('curved');
	await viewer.screenshot({ path: test.info().outputPath('curved.png') });
	await viewer.locator('.qat [data-command="undo"]').click();
	await expect.poll(async () => (await model(viewer)).routes[2]).toBe('right-angle');

	// View > Connection Points hides the markers.
	await viewer.getByRole('tab', { name: 'View', exact: true }).click();
	await viewer.locator('[data-check="connection-points"]').click();
	await expect(viewer.locator('[data-connection-point]')).toHaveCount(0);
	expect(errors).toEqual([]);
});
