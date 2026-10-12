import { test, expect, type Locator } from '@playwright/test';
import JSZip from 'jszip';
import type { VisioViewerElement } from 'ooxml-ui/visio';
import { createVsdxFixture } from './fixture.mjs';
import { downloadCopy, ribbonGroup } from './ribbon';
import { openDemo } from './demo-page';

async function arrangementFixture(): Promise<Buffer> {
	const zip = await JSZip.loadAsync(await createVsdxFixture('Arrangement anchor'));
	const xml = await zip.file('visio/pages/page1.xml')!.async('string');
	const anchor = xml.match(/<Shape ID="1"[\s\S]*?<\/Shape>/u)![0];
	const rectangle = (id: string, x: number, y: number, width: number, height: number) => {
		let shape = anchor
			.replace('ID="1"', `ID="${id}"`)
			.replace('Arrangement anchor', `Arrangement ${id}`);
		for (const [name, value] of Object.entries({ PinX: x, PinY: y, Width: width, Height: height }))
			shape = shape.replace(new RegExp(`(<Cell N="${name}" V=")[^"]+"`, 'u'), `$1${value}"`);
		return shape
			.replaceAll('<Cell N="X" V="3"/>', `<Cell N="X" V="${width}"/>`)
			.replaceAll('<Cell N="Y" V="1"/>', `<Cell N="Y" V="${height}"/>`);
	};
	zip.file(
		'visio/pages/page1.xml',
		xml.replace('</Shapes>', `${rectangle('2', 2, 2, 1, 3)}${rectangle('3', 7, 9, 2, 1)}</Shapes>`),
	);
	return zip.generateAsync({ type: 'nodebuffer' });
}

async function pins(viewer: Locator): Promise<number[][]> {
	return viewer.evaluate((node) =>
		(node as VisioViewerElement).controller.state.document!.pages[0]!.shapes.map((shape) => [
			shape.rotation!.pinX,
			shape.rotation!.pinY,
		]),
	);
}

async function expectSelection(viewer: Locator): Promise<void> {
	await expect(viewer.locator('svg.paper [data-selected="true"]')).toHaveCount(3);
	await expect
		.poll(() =>
			viewer.evaluate((node) => {
				const state = (node as VisioViewerElement).controller.state;
				return {
					ids: state.selectedShapes.map((shape) => shape.id),
					primary: state.selectedShape?.id,
				};
			}),
		)
		.toEqual({ ids: ['1', '2', '3'], primary: '1' });
}

async function selectAll(viewer: Locator): Promise<void> {
	await viewer.getByRole('tab', { name: 'Home', exact: true }).click();
	const tools = viewer.locator('.ribbon-tools');
	if ((await tools.getAttribute('open')) === null) await tools.locator('summary').click();
	await ribbonGroup(viewer, 'Editing');
	await viewer.locator('[data-menu="select"] button').first().click();
	await viewer.locator('[command="select-all"]').click();
	await expectSelection(viewer);
}

for (const framework of ['vanilla', 'react', 'vue', 'angular', 'svelte', 'solid']) {
	test(`${framework}: arrangement persists through history, source reopen and atomic multi-delete`, async ({
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
		await page.locator('#file').setInputFiles({
			name: 'arrangement.vsdx',
			mimeType: 'application/vnd.ms-visio.drawing',
			buffer: await arrangementFixture(),
		});
		await expect(page.locator('#file-name')).toHaveText('arrangement.vsdx');
		await expect(viewer.locator('svg.paper')).toContainText('Arrangement 3');
		const original = [
			[4, 7],
			[2, 2],
			[7, 9],
		];
		await expect.poll(() => pins(viewer)).toEqual(original);
		await selectAll(viewer);
		await expect(viewer.locator('[command="rotate-left"] button')).toBeDisabled();
		await viewer.locator('[data-menu="align"] button').first().click();
		await viewer.locator('[command="align-shapes-left"]').click();
		const aligned = [
			[4, 7],
			[3, 2],
			[3.5, 9],
		];
		await expect.poll(() => pins(viewer)).toEqual(aligned);
		await expectSelection(viewer);
		await viewer.locator('.qat [data-command="undo"]').click();
		await expect.poll(() => pins(viewer)).toEqual(original);
		await expectSelection(viewer);
		await viewer.locator('.qat [data-command="redo"]').click();
		await expect.poll(() => pins(viewer)).toEqual(aligned);
		await expectSelection(viewer);
		await viewer.locator('.qat [data-command="undo"]').click();
		await expect.poll(() => pins(viewer)).toEqual(original);
		await viewer.locator('[data-menu="position"] button').first().click();
		await viewer.locator('[command="distribute-horizontal"]').click();
		const horizontal = [
			[4.25, 7],
			[2, 2],
			[7, 9],
		];
		await expect.poll(() => pins(viewer)).toEqual(horizontal);
		await expectSelection(viewer);
		await viewer.locator('[data-menu="position"] button').first().click();
		await viewer.locator('[command="distribute-vertical"]').click();
		const distributed = [
			[4.25, 6],
			[2, 2],
			[7, 9],
		];
		await expect.poll(() => pins(viewer)).toEqual(distributed);
		await expectSelection(viewer);
		await viewer.locator('.qat [data-command="undo"]').click();
		await expect.poll(() => pins(viewer)).toEqual(horizontal);
		await expectSelection(viewer);
		await viewer.locator('.qat [data-command="redo"]').click();
		await expect.poll(() => pins(viewer)).toEqual(distributed);
		await expectSelection(viewer);
		const downloading = page.waitForEvent('download');
		await (await downloadCopy(viewer)).click();
		const stream = await (await downloading).createReadStream();
		const chunks: Buffer[] = [];
		for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
		await page.locator('#file').setInputFiles({
			name: 'reopened-arrangement.vsdx',
			mimeType: 'application/vnd.ms-visio.drawing',
			buffer: Buffer.concat(chunks),
		});
		await expect(page.locator('#file-name')).toHaveText('reopened-arrangement.vsdx');
		await expect.poll(() => pins(viewer)).toEqual(distributed);
		await expect(viewer.locator('svg.paper [data-selected="true"]')).toHaveCount(0);
		await selectAll(viewer);
		await viewer.locator('.viewport').press('Delete');
		await expect(viewer.locator('svg.paper [data-shape-id]')).toHaveCount(0);
		await expect.poll(() => pins(viewer)).toEqual([]);
		await expect(viewer.locator('.qat [data-command="undo"]')).toBeEnabled();
		await viewer.locator('.qat [data-command="undo"]').click();
		await expect.poll(() => pins(viewer)).toEqual(distributed);
		await expectSelection(viewer);
		await expect
			.poll(() =>
				viewer.evaluate((node) =>
					(node as VisioViewerElement).controller.state.document!.pages[0]!.shapes.map((shape) => [
						shape.width,
						shape.height,
						shape.rotation!.angle,
					]),
				),
			)
			.toEqual([
				[3, 1, 0],
				[1, 3, 0],
				[2, 1, 0],
			]);
		expect(errors).toEqual([]);
	});
}
