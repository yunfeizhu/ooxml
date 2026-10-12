import { expect, test, type Locator, type Page } from '@playwright/test';
import JSZip from 'jszip';
import type { VisioViewerElement } from 'ooxml-ui/visio';
import { createVsdxFixture } from './fixture.mjs';
import { downloadCopy } from './ribbon';
import { openDemo } from './demo-page';

async function fixture(scale: number) {
	const zip = await JSZip.loadAsync(await createVsdxFixture('Text tool source'));
	const page = await zip.file('visio/pages/page1.xml')!.async('string');
	zip.file('visio/pages/page1.xml', page.replace(/<Shapes>.*?<\/Shapes>/su, '<Shapes/>'));
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
const idle = (viewer: Locator) =>
	expect
		.poll(() =>
			viewer.evaluate((node) => {
				const state = (node as VisioViewerElement).controller.state;
				return state.loading || state.edit.busy;
			}),
		)
		.toBe(false);
async function inventory(viewer: Locator) {
	await idle(viewer);
	return viewer.evaluate((node) => {
		const controller = (node as VisioViewerElement).controller,
			state = controller.state;
		return {
			bytes: Array.from(controller.exportVsdx().bytes),
			pages: state.document!.pages.length,
			selected: state.selectedShapes.map((shape) => shape.id),
			zoom: state.zoom,
			shapes: state.document!.pages[0]!.shapes.map((shape) => ({
				id: shape.id,
				text: shape.text.plainText,
				width: shape.width,
				height: shape.height,
				fill: shape.style.fill,
				line: shape.style.linePattern,
				transform: [...shape.transform],
			})),
		};
	});
}
async function point(viewer: Locator, x: number, y: number) {
	return viewer.locator('svg.paper').evaluate(
		(node, value) => {
			const point = new DOMPoint(value.x, value.y).matrixTransform(
				(node as SVGSVGElement).getScreenCTM()!,
			);
			return { x: point.x, y: point.y };
		},
		{ x, y },
	);
}
async function drag(page: Page, viewer: Locator, y = 1) {
	const start = await point(viewer, 1, y),
		end = await point(viewer, 3, y + 1.5);
	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	await page.mouse.move(end.x, end.y, { steps: 4 });
	await page.mouse.up();
}
for (const [index, framework] of [
	'vanilla',
	'react',
	'vue',
	'angular',
	'svelte',
	'solid',
].entries()) {
	test(`${framework}: text tools create fixed plain boxes and guarded drawing retains source history`, async ({
		page,
	}) => {
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.setViewportSize({ width: 1600, height: 1000 });
		await openDemo(
			page,
			framework === 'vanilla' ? '/demo/?sample=1' : `/demo-${framework}/?sample=1`,
		);
		const viewer = page.locator('visio-viewer'),
			scale = [0.5, 1, 2][index % 3]!;
		await page.locator('#file').setInputFiles({
			name: 'text-tool.vsdx',
			mimeType: 'application/vnd.ms-visio.drawing',
			buffer: await fixture(scale),
		});
		await expect(page.locator('#file-name')).toHaveText('text-tool.vsdx');
		await idle(viewer);
		const original = await inventory(viewer);
		expect(original.shapes).toEqual([]);
		await viewer.getByRole('tab', { name: 'Home', exact: true }).click();
		await viewer.locator('[command="text-tool"] button').click();
		await expect(viewer.locator('.viewport')).toHaveAttribute('data-tool', 'text');
		await viewer.getByRole('tab', { name: 'Insert', exact: true }).click();
		await viewer.locator('[command="text-box"] button').click();
		await drag(page, viewer);
		const input = viewer.getByRole('textbox', { name: 'Text box text', exact: true });
		await expect(input).toBeFocused();
		expect((await inventory(viewer)).bytes).toEqual(original.bytes);
		const text = ' <&> Ω\n第二行\n\n';
		await input.fill(text);
		await input.press('0');
		expect((await inventory(viewer)).zoom).toBe(original.zoom);
		expect((await inventory(viewer)).selected).toEqual([]);
		await input.fill(text);
		await input.evaluate((node) =>
			node.dispatchEvent(
				new KeyboardEvent('keydown', {
					key: 'Enter',
					ctrlKey: true,
					isComposing: true,
					bubbles: true,
				}),
			),
		);
		expect((await inventory(viewer)).bytes).toEqual(original.bytes);
		await input.press('ControlOrMeta+Enter');
		await expect(viewer.locator('[data-text-draft]')).toHaveCount(0);
		const created = await inventory(viewer);
		expect(created.shapes).toHaveLength(1);
		expect(created.selected).toEqual(['1']);
		expect(created.shapes[0]).toMatchObject({ text, width: 2, height: 1.5, fill: 'none', line: 0 });
		await viewer.getByRole('tab', { name: 'Home', exact: true }).click();
		await viewer.locator('.qat [data-command="undo"]').click();
		expect((await inventory(viewer)).bytes).toEqual(original.bytes);
		expect((await inventory(viewer)).selected).toEqual([]);
		await viewer.locator('.qat [data-command="redo"]').click();
		expect((await inventory(viewer)).bytes).toEqual(created.bytes);
		expect((await inventory(viewer)).selected).toEqual(['1']);
		await drag(page, viewer, 4);
		await expect(input).toBeFocused();
		await input.fill('Discarded');
		await input.press('Escape');
		await expect(viewer.locator('[data-text-draft]')).toHaveCount(0);
		expect((await inventory(viewer)).bytes).toEqual(created.bytes);
		await drag(page, viewer, 4);
		await expect(input).toBeFocused();
		await viewer.evaluate((node) => (node as VisioViewerElement).controller.clearSelection());
		await expect(viewer.locator('[data-text-draft]')).toHaveCount(0);
		expect((await inventory(viewer)).bytes).toEqual(created.bytes);
		const downloading = page.waitForEvent('download');
		await (await downloadCopy(viewer)).click();
		const stream = await (await downloading).createReadStream(),
			chunks: Buffer[] = [];
		for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
		await page.locator('#file').setInputFiles({
			name: 'reopened-text.vsdx',
			mimeType: 'application/vnd.ms-visio.drawing',
			buffer: Buffer.concat(chunks),
		});
		await expect(page.locator('#file-name')).toHaveText('reopened-text.vsdx');
		await idle(viewer);
		expect((await inventory(viewer)).shapes).toEqual(created.shapes);
		await viewer.locator('.viewport').focus();
		await page.keyboard.press('ControlOrMeta+2');
		await viewer.locator('[data-shape-id="1"] [data-text-hit]').click({ position: { x: 8, y: 8 } });
		await expect(viewer.locator('#edit-text')).toBeFocused();
		await expect(viewer.locator('#edit-text')).toHaveValue(text);
		expect((await inventory(viewer)).selected).toEqual(['1']);
		await viewer.locator('.viewport').focus();
		await page.keyboard.press('ControlOrMeta+9');
		const start = await point(viewer, 1, 4),
			end = await point(viewer, 3, 5.5);
		await page.mouse.move(start.x, start.y);
		await page.mouse.down();
		await page.mouse.move(end.x, end.y);
		await viewer.evaluate((node) => (node as VisioViewerElement).controller.setZoom(1.25));
		await page.mouse.up();
		expect((await inventory(viewer)).bytes).toEqual(created.bytes);
		await viewer.evaluate((node) => (node as VisioViewerElement).controller.setZoom(1));
		await drag(page, viewer, 4);
		await idle(viewer);
		const ellipse = await inventory(viewer);
		expect(ellipse.shapes).toHaveLength(2);
		expect(ellipse.selected).toEqual(['2']);
		await viewer.locator('.qat [data-command="undo"]').click();
		expect((await inventory(viewer)).bytes).toEqual(created.bytes);
		expect((await inventory(viewer)).selected).toEqual(['1']);
		await viewer.getByRole('tab', { name: 'Insert', exact: true }).click();
		await viewer.locator('[command="blank-page"] button').click();
		expect((await inventory(viewer)).pages).toBe(2);
		await viewer.getByRole('tab', { name: 'Home', exact: true }).click();
		await viewer.locator('.qat [data-command="undo"]').click();
		expect((await inventory(viewer)).pages).toBe(1);
		expect((await inventory(viewer)).bytes).toEqual(created.bytes);
		expect(errors).toEqual([]);
	});
}
