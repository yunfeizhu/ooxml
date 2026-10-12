import { expect, test, type Locator } from '@playwright/test';
import JSZip from 'jszip';
import type { VisioViewerElement } from 'ooxml-ui/visio';
import { createVsdxFixture } from './fixture.mjs';
import { openDemo } from './demo-page';

async function fixture() {
	const zip = await JSZip.loadAsync(await createVsdxFixture('Closed first'));
	const path = 'visio/pages/page1.xml';
	const xml = await zip.file(path)!.async('string');
	const original = xml.match(/<Shape ID="1"[\s\S]*?<\/Shape>/u)![0];
	const linked = (source: string, target: string, x: number) =>
		source.replace(
			'</Shape>',
			`<Section N="User"><Row N="Link"><Cell N="Value" V="${x}" U="IN" F="Sheet.${target}!PinX"/></Row></Section></Shape>`,
		);
	const second = original
		.replace('ID="1"', 'ID="2"')
		.replace('NameU="Import test"', 'NameU="Closed second"')
		.replace('Closed first', 'Closed second')
		.replace('<Cell N="PinX" V="4"/>', '<Cell N="PinX" V="2"/>')
		.replace('<Cell N="PinY" V="7"/>', '<Cell N="PinY" V="2"/>');
	const control = original
		.replace('ID="1"', 'ID="3"')
		.replace('NameU="Import test"', 'NameU="Control"')
		.replace('Closed first', 'Retained control')
		.replace('<Cell N="PinX" V="4"/>', '<Cell N="PinX" V="6"/>')
		.replace('<Cell N="PinY" V="7"/>', '<Cell N="PinY" V="4"/>');
	zip.file(
		path,
		xml
			.replace(original, linked(original, '2', 2))
			.replace('</Shapes>', `${linked(second, '1', 4)}${linked(control, '3', 6)}</Shapes>`),
	);
	return zip.generateAsync({ type: 'nodebuffer' });
}
const inventory = (viewer: Locator) =>
	viewer.evaluate((node) => {
		const state = (node as VisioViewerElement).controller.state;
		return {
			ids: state.document!.pages[0]!.shapes.map((shape) => shape.id),
			selected: state.selectedShapes.map((shape) => shape.id),
		};
	});
const bytes = (viewer: Locator) =>
	viewer.evaluate((node) => Array.from((node as VisioViewerElement).controller.exportVsdx().bytes));
async function select(viewer: Locator, ids: string[]) {
	await viewer.evaluate(
		(node, selected) =>
			(node as VisioViewerElement).selectShapes(
				selected.map((id) => ({ id, name: id, pageId: '1' })),
			),
		ids,
	);
	await expect.poll(async () => (await inventory(viewer)).selected).toEqual(ids);
}

for (const framework of ['vanilla', 'react', 'vue', 'angular', 'svelte', 'solid']) {
	test(`${framework}: linked selection Delete and Cut are atomic and undoable`, async ({
		page,
	}) => {
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.addInitScript(() => {
			let text = '';
			// Owned in-memory transport only; no OS clipboard API is called.
			Object.defineProperty(window, 'ClipboardItem', { configurable: true, value: undefined });
			Object.defineProperty(navigator, 'clipboard', {
				configurable: true,
				value: {
					async writeText(value: string) {
						text = value;
					},
					async readText() {
						return text;
					},
				},
			});
		});
		await page.setViewportSize({ width: 1600, height: 1000 });
		await openDemo(
			page,
			framework === 'vanilla' ? '/demo/?sample=1' : `/demo-${framework}/?sample=1`,
		);
		const viewer = page.locator('visio-viewer');
		await page.locator('#file').setInputFiles({
			name: 'closed-set.vsdx',
			mimeType: 'application/vnd.ms-visio.drawing',
			buffer: await fixture(),
		});
		await expect(page.locator('#file-name')).toHaveText('closed-set.vsdx');
		await expect(viewer.locator('svg.paper')).toContainText('Retained control');
		await viewer.getByRole('tab', { name: 'Home', exact: true }).click();
		const original = await bytes(viewer);
		await select(viewer, ['2', '1']);
		await viewer.locator('.viewport').press('Delete');
		await expect.poll(() => inventory(viewer)).toEqual({ ids: ['3'], selected: [] });
		await viewer.locator('.qat [data-command="undo"]').click();
		await expect
			.poll(() => inventory(viewer))
			.toEqual({ ids: ['1', '2', '3'], selected: ['2', '1'] });
		expect(await bytes(viewer)).toEqual(original);
		await expect
			.poll(() =>
				viewer.evaluate((node) => (node as VisioViewerElement).controller.state.clipboard.ready),
			)
			.toBe(true);
		await viewer.locator('.viewport').press('Control+x');
		await expect.poll(() => inventory(viewer)).toEqual({ ids: ['3'], selected: [] });
		await viewer.locator('.viewport').press('Control+v');
		await expect
			.poll(() => inventory(viewer))
			.toEqual({ ids: ['3', '4', '5'], selected: ['5', '4'] });
		const pasted = await bytes(viewer);
		const zip = await JSZip.loadAsync(new Uint8Array(pasted));
		const content = await zip.file('visio/pages/page1.xml')!.async('string');
		expect(content).toContain('F="Sheet.5!PinX"');
		expect(content).toContain('F="Sheet.4!PinX"');
		expect(content).toContain('F="Sheet.3!PinX"');
		await viewer.locator('.qat [data-command="undo"]').click();
		await expect.poll(() => inventory(viewer)).toEqual({ ids: ['3'], selected: [] });
		await viewer.locator('.qat [data-command="undo"]').click();
		await expect
			.poll(() => inventory(viewer))
			.toEqual({ ids: ['1', '2', '3'], selected: ['2', '1'] });
		expect(await bytes(viewer)).toEqual(original);
		await viewer.locator('.qat [data-command="redo"]').click();
		await viewer.locator('.qat [data-command="redo"]').click();
		await expect
			.poll(() => inventory(viewer))
			.toEqual({ ids: ['3', '4', '5'], selected: ['5', '4'] });
		expect(await bytes(viewer)).toEqual(pasted);
		expect(errors).toEqual([]);
	});
}
