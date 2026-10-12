import { expect, test, type Locator } from '@playwright/test';
import JSZip from 'jszip';
import type { VisioViewerElement } from 'ooxml-ui/visio';
import { createVsdxFixture } from './fixture.mjs';
import { downloadCopy } from './ribbon';
import { openDemo } from './demo-page';

async function movementFixture(scale: number, protectedSecond = false): Promise<Buffer> {
	const zip = await JSZip.loadAsync(await createVsdxFixture('Pointer anchor'));
	const xml = await zip.file('visio/pages/page1.xml')!.async('string');
	const template = xml.match(/<Shape ID="1"[\s\S]*?<\/Shape>/u)![0];
	const shape = (id: string, x: number, y: number, angle = 0) => {
		let value = template.replace('ID="1"', `ID="${id}"`).replace('Pointer anchor', `Pointer ${id}`);
		for (const [name, number] of Object.entries({
			PinX: x / scale,
			PinY: y / scale,
			Width: 1 / scale,
			Height: 0.6 / scale,
		}))
			value = value.replace(new RegExp(`(<Cell N="${name}" V=")[^"]+"`, 'u'), `$1${number}"`);
		value = value
			.replaceAll('<Cell N="X" V="3"/>', `<Cell N="X" V="${1 / scale}"/>`)
			.replaceAll('<Cell N="Y" V="1"/>', `<Cell N="Y" V="${0.6 / scale}"/>`);
		return value.replace(
			'<Text>',
			`<Cell N="Angle" V="${angle}"/><Cell N="LocPinX" V="${0.2 / scale}"/><Cell N="LocPinY" V="${0.15 / scale}"/>${protectedSecond && id === '2' ? '<Cell N="LockMoveX" V="1"/>' : ''}<Text>`,
		);
	};
	zip.file(
		'visio/pages/page1.xml',
		xml.replace(
			/<Shapes>[\s\S]*?<\/Shapes>/u,
			`<Shapes>${shape('1', 2, 7, Math.PI / 6)}${shape('2', 5, 7)}${shape('3', 7, 3)}</Shapes>`,
		),
	);
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
const inventory = (viewer: Locator) =>
	viewer.evaluate((node) => {
		const state = (node as VisioViewerElement).controller.state;
		return {
			pins: state.document!.pages[0]!.shapes.map((shape) => [
				Number(shape.rotation!.pinX.toFixed(8)),
				Number(shape.rotation!.pinY.toFixed(8)),
			]),
			selected: state.selectedShapes.map((shape) => shape.id),
			primary: state.selectedShape?.id ?? null,
			busy: state.edit.busy,
			geometry: state.document!.pages[0]!.shapes.map((shape) => [
				shape.width,
				shape.height,
				shape.rotation!.angle,
				...shape.transform.slice(0, 4),
			]),
		};
	});
const sourceBytes = (viewer: Locator) =>
	viewer.evaluate((node) => Array.from((node as VisioViewerElement).controller.exportVsdx().bytes));
const pagePoint = (viewer: Locator, x: number, y: number) =>
	viewer.locator('svg.paper').evaluate(
		(svg, point) => {
			const converted = new DOMPoint(point.x, point.y).matrixTransform(
				(svg as SVGSVGElement).getScreenCTM()!,
			);
			return { x: converted.x, y: converted.y };
		},
		{ x, y },
	);
async function selected(viewer: Locator, ids: string[]) {
	await expect
		.poll(async () => {
			const value = await inventory(viewer);
			return { ids: value.selected, primary: value.primary };
		})
		.toEqual({ ids, primary: ids[0] ?? null });
	await expect(viewer.locator('svg.paper [data-selected="true"]')).toHaveCount(ids.length);
}

for (const [index, framework] of [
	'vanilla',
	'react',
	'vue',
	'angular',
	'svelte',
	'solid',
].entries()) {
	test(`${framework}: pointer movement and marquee keep scaled source, history and selection`, async ({
		page,
	}) => {
		const scale = [0.5, 1, 2][index % 3]!;
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.setViewportSize({ width: 1600, height: 1000 });
		await openDemo(
			page,
			framework === 'vanilla' ? '/demo/?sample=1' : `/demo-${framework}/?sample=1`,
		);
		const viewer = page.locator('visio-viewer');
		const load = async (protectedSecond = false) => {
			await page.locator('#file').setInputFiles({
				name: 'pointer.vsdx',
				mimeType: 'application/vnd.ms-visio.drawing',
				buffer: await movementFixture(scale, protectedSecond),
			});
			await expect(page.locator('#file-name')).toHaveText('pointer.vsdx');
			await expect(viewer.locator('svg.paper')).toContainText('Pointer 3');
			await expect
				.poll(async () => (await inventory(viewer)).pins)
				.toEqual([
					[2, 7],
					[5, 7],
					[7, 3],
				]);
		};
		await load();
		await viewer.getByRole('tab', { name: 'Home', exact: true }).click();
		const before = await inventory(viewer);
		const beforeSource = await sourceBytes(viewer);
		await viewer.locator('svg.paper [data-shape-id="1"]').click();
		await viewer.locator('svg.paper [data-shape-id="2"]').click({ modifiers: ['Shift'] });
		await selected(viewer, ['1', '2']);
		const box = await viewer.locator('svg.paper [data-shape-id="2"]').boundingBox();
		const start = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
		const origin = await pagePoint(viewer, 0, 0),
			delta = await pagePoint(viewer, 0.43, 0.27);
		await page.mouse.move(start.x, start.y);
		await page.mouse.down();
		await page.mouse.move(start.x + delta.x - origin.x, start.y + delta.y - origin.y, { steps: 5 });
		await expect(viewer.locator('[data-movement-preview]')).toHaveCount(2);
		expect((await inventory(viewer)).pins).toEqual(before.pins);
		expect(await sourceBytes(viewer)).toEqual(beforeSource);
		await expect(viewer.locator('.qat [data-command="undo"]')).toBeDisabled();
		await page.mouse.up();
		// Browser client coordinates and CTM use finite floating point precision.
		await expect
			.poll(async () => (await inventory(viewer)).pins)
			.toEqual([
				[expect.closeTo(2.43, 5), expect.closeTo(6.73, 5)],
				[expect.closeTo(5.43, 5), expect.closeTo(6.73, 5)],
				[7, 3],
			]);
		const moved = (await inventory(viewer)).pins;
		const movedSource = await sourceBytes(viewer);
		await selected(viewer, ['1', '2']);
		expect((await inventory(viewer)).geometry).toEqual(before.geometry);
		await viewer.locator('.qat [data-command="undo"]').click();
		await expect.poll(async () => (await inventory(viewer)).pins).toEqual(before.pins);
		expect(await sourceBytes(viewer)).toEqual(beforeSource);
		await selected(viewer, ['1', '2']);
		await viewer.locator('.qat [data-command="redo"]').click();
		await expect.poll(async () => (await inventory(viewer)).pins).toEqual(moved);
		expect(await sourceBytes(viewer)).toEqual(movedSource);
		await selected(viewer, ['1', '2']);
		// Escape cancels DOM preview before release; the existing source history stays unchanged.
		const cancelBox = await viewer.locator('svg.paper [data-shape-id="2"]').boundingBox();
		await page.mouse.move(
			cancelBox!.x + cancelBox!.width / 2,
			cancelBox!.y + cancelBox!.height / 2,
		);
		await page.mouse.down();
		await page.mouse.move(
			cancelBox!.x + cancelBox!.width / 2 + 30,
			cancelBox!.y + cancelBox!.height / 2 + 20,
		);
		await expect(viewer.locator('[data-movement-preview]')).toHaveCount(2);
		await page.keyboard.press('Escape');
		await page.mouse.up();
		await expect(viewer.locator('[data-movement-preview]')).toHaveCount(0);
		expect((await inventory(viewer)).pins).toEqual(moved);
		await selected(viewer, ['1', '2']);
		// Full-enclosure marquee replaces selection; Shift marquee keeps the first selected anchor.
		await viewer.locator('.viewport').press('Escape');
		await selected(viewer, []);
		const marquee = async (x1: number, y1: number, x2: number, y2: number, additive = false) => {
			const start = await pagePoint(viewer, x1, y1),
				end = await pagePoint(viewer, x2, y2);
			if (additive) await page.keyboard.down('Shift');
			await page.mouse.move(start.x, start.y);
			await page.mouse.down();
			await page.mouse.move(end.x, end.y, { steps: 5 });
			await expect(viewer.locator('[data-marquee-preview]')).toHaveCount(1);
			await page.mouse.up();
			if (additive) await page.keyboard.up('Shift');
		};
		await marquee(1, 3, 6.5, 5.5);
		await selected(viewer, ['1', '2']);
		await marquee(6.5, 7, 8.1, 8.5, true);
		await selected(viewer, ['1', '2', '3']);
		const downloading = page.waitForEvent('download');
		await (await downloadCopy(viewer)).click();
		const stream = await (await downloading).createReadStream();
		const chunks: Buffer[] = [];
		for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
		await page.locator('#file').setInputFiles({
			name: 'reopened-pointer.vsdx',
			mimeType: 'application/vnd.ms-visio.drawing',
			buffer: Buffer.concat(chunks),
		});
		await expect(page.locator('#file-name')).toHaveText('reopened-pointer.vsdx');
		await expect.poll(async () => (await inventory(viewer)).pins).toEqual(moved);
		expect((await inventory(viewer)).geometry).toEqual(before.geometry);
		await selected(viewer, []);
		await load(true);
		await viewer.locator('svg.paper [data-shape-id="1"]').click();
		await viewer.locator('svg.paper [data-shape-id="2"]').click({ modifiers: ['Shift'] });
		const protectedBox = await viewer.locator('svg.paper [data-shape-id="1"]').boundingBox();
		await page.mouse.move(
			protectedBox!.x + protectedBox!.width / 2,
			protectedBox!.y + protectedBox!.height / 2,
		);
		await page.mouse.down();
		await page.mouse.move(
			protectedBox!.x + protectedBox!.width / 2 + 40,
			protectedBox!.y + protectedBox!.height / 2,
		);
		await page.mouse.up();
		await expect.poll(async () => (await inventory(viewer)).busy).toBe(false);
		expect((await inventory(viewer)).pins).toEqual(before.pins);
		await expect(viewer.locator('.qat [data-command="undo"]')).toBeDisabled();
		await expect
			.poll(() =>
				viewer.evaluate(
					(node) => (node as VisioViewerElement).controller.state.edit.error?.message ?? '',
				),
			)
			.toMatch(/LockMoveX|locked/i);
		expect(errors).toEqual([]);
	});
}
