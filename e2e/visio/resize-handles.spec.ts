import { expect, test, type Locator } from '@playwright/test';
import JSZip from 'jszip';
import type { VisioViewerElement } from 'ooxml-ui/visio';
import { createVsdxFixture } from './fixture.mjs';
import { downloadCopy } from './ribbon';
import { openDemo } from './demo-page';

async function fixture(
	scale: number,
	angle: number,
	flipX: boolean,
	flipY: boolean,
	locked = false,
) {
	const zip = await JSZip.loadAsync(await createVsdxFixture('Resize source'));
	let xml = await zip.file('visio/pages/page1.xml')!.async('string');
	for (const [name, value] of Object.entries({
		Width: 2 / scale,
		Height: 1 / scale,
		PinX: 4 / scale,
		PinY: 7 / scale,
	}))
		xml = xml.replace(new RegExp(`(<Cell N="${name}" V=")[^"]+"`, 'u'), `$1${value}"`);
	xml = xml
		.replaceAll('<Cell N="X" V="3"/>', `<Cell N="X" V="${2 / scale}" F="Width"/>`)
		.replaceAll('<Cell N="Y" V="1"/>', `<Cell N="Y" V="${1 / scale}" F="Height"/>`)
		.replace(
			'<Text>',
			`<Cell N="Angle" V="${angle}"/><Cell N="FlipX" V="${Number(flipX)}"/><Cell N="FlipY" V="${Number(flipY)}"/><Cell N="LocPinX" V="${0.4 / scale}"/><Cell N="LocPinY" V="${0.2 / scale}"/>${locked ? '<Cell N="LockWidth" V="1"/>' : ''}<Text>`,
		);
	zip.file('visio/pages/page1.xml', xml);
	const pages = await zip.file('visio/pages/pages.xml')!.async('string');
	zip.file(
		'visio/pages/pages.xml',
		pages
			.replace('N="PageWidth" V="8.5"', `N="PageWidth" V="${8.5 / scale}"`)
			.replace('N="PageHeight" V="11"', `N="PageHeight" V="${11 / scale}"`)
			.replace(
				'</PageSheet>',
				`<Cell N="DrawingScale" V="1"/><Cell N="PageScale" V="${scale}"/></PageSheet>`,
			),
	);
	return zip.generateAsync({ type: 'nodebuffer' });
}
const waitForIdle = (viewer: Locator) =>
	expect
		.poll(() =>
			viewer.evaluate((node) => {
				const state = (node as VisioViewerElement).controller.state;
				return state.loading || state.edit.busy;
			}),
		)
		.toBe(false);
const inventory = async (viewer: Locator) => {
	await waitForIdle(viewer);
	return viewer.evaluate((node) => {
		const state = (node as VisioViewerElement).controller.state,
			shape = state.document!.pages[0]!.shapes[0]!;
		return {
			width: shape.width,
			height: shape.height,
			pin: shape.rotation,
			transform: [...shape.transform],
			selection: state.selectedShapes.map((shape) => shape.id),
			bytes: Array.from((node as VisioViewerElement).controller.exportVsdx().bytes),
		};
	});
};
const handlePosition = (viewer: Locator, id = 'ne') =>
	viewer.locator(`[data-resize-handle="${id}"]`).evaluate((node) => {
		const circle = node as SVGCircleElement,
			point = new DOMPoint(circle.cx.baseVal.value, circle.cy.baseVal.value).matrixTransform(
				circle.getScreenCTM()!,
			);
		return { x: point.x, y: point.y };
	});
const clientDelta = (viewer: Locator, x: number, y: number) =>
	viewer.locator('svg.paper').evaluate(
		(node, delta) => {
			const ctm = (node as SVGSVGElement).getScreenCTM()!;
			return { x: ctm.a * delta.x + ctm.c * delta.y, y: ctm.b * delta.x + ctm.d * delta.y };
		},
		{ x, y },
	);
const preview = (viewer: Locator) =>
	viewer.locator('[data-resize-frame-preview]').evaluate((node) => {
		const rect = node as SVGRectElement,
			matrix = rect.getCTM()!;
		return {
			width: Number(rect.getAttribute('width')),
			height: Number(rect.getAttribute('height')),
			matrix: [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f],
		};
	});

for (const [index, framework] of [
	'vanilla',
	'react',
	'vue',
	'angular',
	'svelte',
	'solid',
].entries()) {
	test(`${framework}: anchored resize frame matches saved rotated and reflected source`, async ({
		page,
	}) => {
		const scale = [0.5, 1, 2][index % 3]!,
			angle = [0, Math.PI / 6, Math.PI / 6, -0.4, 0.8, Math.PI / 2][index]!;
		const flipX = index === 2 || index === 4,
			flipY = index === 3 || index === 4;
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.setViewportSize({ width: 1600, height: 1000 });
		await openDemo(
			page,
			framework === 'vanilla' ? '/demo/?sample=1' : `/demo-${framework}/?sample=1`,
		);
		const viewer = page.locator('visio-viewer');
		const load = async (locked = false) => {
			await page.locator('#file').setInputFiles({
				name: 'resize.vsdx',
				mimeType: 'application/vnd.ms-visio.drawing',
				buffer: await fixture(scale, angle, flipX, flipY, locked),
			});
			await expect(page.locator('#file-name')).toHaveText('resize.vsdx');
			await waitForIdle(viewer);
			await expect(viewer.locator('svg.paper')).toContainText('Resize source');
			await viewer.locator('svg.paper [data-shape-id="1"]').click();
			await expect(viewer.locator('[data-resize-handle]')).toHaveCount(8);
		};
		await load();
		await viewer.getByRole('tab', { name: 'Home', exact: true }).click();
		const before = await inventory(viewer),
			start = await handlePosition(viewer);
		await page.mouse.move(start.x, start.y);
		await page.mouse.down();
		await page.mouse.up();
		expect((await inventory(viewer)).bytes).toEqual(before.bytes);
		const [a, b, c, d] = before.transform;
		const delta = await clientDelta(viewer, a! * 0.43 + c! * 0.27, -(b! * 0.43 + d! * 0.27));
		await page.mouse.move(start.x, start.y);
		await page.mouse.down();
		await page.mouse.move(start.x + delta.x, start.y + delta.y, { steps: 5 });
		await expect(viewer.locator('[data-resize-frame-preview]')).toHaveCount(1);
		const projected = await preview(viewer);
		expect(projected.width).toBeCloseTo(2.43, 5);
		expect(projected.height).toBeCloseTo(1.27, 5);
		expect((await inventory(viewer)).bytes).toEqual(before.bytes);
		expect((await inventory(viewer)).transform).toEqual(before.transform);
		await expect(viewer.locator('.qat [data-command="undo"]')).toBeDisabled();
		await page.mouse.up();
		await expect.poll(async () => (await inventory(viewer)).width).toBeCloseTo(projected.width, 9);
		const resized = await inventory(viewer);
		expect(resized.height).toBeCloseTo(projected.height, 9);
		expect(resized.selection).toEqual(['1']);
		expect(resized.transform.slice(0, 4)).toEqual(before.transform.slice(0, 4));
		expect(resized.pin!.angle).toBe(angle);
		// SW anchor stays fixed and the eight new handles follow the accepted normalized pose.
		expect(resized.transform[4]).toBeCloseTo(before.transform[4]!, 10);
		expect(resized.transform[5]).toBeCloseTo(before.transform[5]!, 10);
		const accepted = await viewer.locator('svg.paper [data-shape-id="1"]').evaluate((node) => {
			const matrix = (node as SVGGraphicsElement).getCTM()!;
			return [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f];
		});
		accepted.forEach((value, index) => expect(value).toBeCloseTo(projected.matrix[index]!, 8));
		await viewer.locator('.qat [data-command="undo"]').click();
		await expect.poll(async () => (await inventory(viewer)).bytes).toEqual(before.bytes);
		await viewer.locator('.qat [data-command="redo"]').click();
		await expect.poll(async () => (await inventory(viewer)).bytes).toEqual(resized.bytes);
		const cancelStart = await handlePosition(viewer);
		await page.mouse.move(cancelStart.x, cancelStart.y);
		await page.mouse.down();
		await page.mouse.move(cancelStart.x + 20, cancelStart.y + 20);
		await page.keyboard.press('Escape');
		await page.mouse.up();
		await expect(viewer.locator('[data-resize-frame-preview]')).toHaveCount(0);
		expect((await inventory(viewer)).bytes).toEqual(resized.bytes);
		const downloading = page.waitForEvent('download');
		await (await downloadCopy(viewer)).click();
		const stream = await (await downloading).createReadStream(),
			chunks: Buffer[] = [];
		for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
		await page.locator('#file').setInputFiles({
			name: 'reopened-resize.vsdx',
			mimeType: 'application/vnd.ms-visio.drawing',
			buffer: Buffer.concat(chunks),
		});
		await expect(page.locator('#file-name')).toHaveText('reopened-resize.vsdx');
		const reopened = await inventory(viewer);
		expect(reopened.width).toBe(resized.width);
		expect(reopened.height).toBe(resized.height);
		expect(reopened.transform).toEqual(resized.transform);
		await load(true);
		const locked = await inventory(viewer),
			lockedStart = await handlePosition(viewer);
		await page.mouse.move(lockedStart.x, lockedStart.y);
		await page.mouse.down();
		await page.mouse.move(lockedStart.x + delta.x, lockedStart.y + delta.y);
		await page.mouse.up();
		await expect
			.poll(() =>
				viewer.evaluate(
					(node) => (node as VisioViewerElement).controller.state.edit.error?.message ?? '',
				),
			)
			.toMatch(/LockWidth|locked/i);
		expect((await inventory(viewer)).bytes).toEqual(locked.bytes);
		await expect(viewer.locator('.qat [data-command="undo"]')).toBeDisabled();
		expect(errors).toEqual([]);
	});
}
