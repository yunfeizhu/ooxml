import { expect, test, type Locator } from '@playwright/test';
import JSZip from 'jszip';
import type { VisioViewerElement } from 'ooxml-ui/visio';
import { createVsdxFixture } from './fixture.mjs';
import { downloadCopy, pickColor, ribbonGroup } from './ribbon';
import { openDemo } from './demo-page';

async function fixture(scale: number, protectedSecond = false) {
	const zip = await JSZip.loadAsync(await createVsdxFixture('Paint source'));
	const cell = (name: string, value: number | string) => `<Cell N="${name}" V="${value}"/>`;
	const shape = (id: number) =>
		`<Shape ID="${id}" NameU="Paint ${id}">${cell('Width', 2 / scale)}${cell('Height', 1 / scale)}${cell('PinX', (id * 2 + 1) / scale)}${cell('PinY', 7 / scale)}${cell('LocPinX', 1 / scale)}${cell('LocPinY', 0.5 / scale)}${cell('FillPattern', 1)}${cell('FillForegnd', '#DAEFE6')}${cell('FillBkgnd', '#FFFFFF')}${cell('FillForegndTrans', 0)}${cell('FillBkgndTrans', 0)}${cell('LinePattern', id)}${cell('LineColor', '#000000')}${cell('LineColorTrans', 0)}${cell('LineWeight', 1 / 72 / scale)}${id === 2 && protectedSecond ? cell('LockFormat', 1) : ''}<Section N="Geometry" IX="0"><Row T="MoveTo" IX="1">${cell('X', 0)}${cell('Y', 0)}</Row><Row T="LineTo" IX="2">${cell('X', 2 / scale)}${cell('Y', 0)}</Row><Row T="LineTo" IX="3">${cell('X', 2 / scale)}${cell('Y', 1 / scale)}</Row><Row T="LineTo" IX="4">${cell('X', 0)}${cell('Y', 1 / scale)}</Row><Row T="LineTo" IX="5">${cell('X', 0)}${cell('Y', 0)}</Row></Section><Text>Paint ${id}</Text></Shape>`;
	const page = await zip.file('visio/pages/page1.xml')!.async('string');
	zip.file(
		'visio/pages/page1.xml',
		page.replace(/<Shapes>.*?<\/Shapes>/su, `<Shapes>${shape(1)}${shape(2)}</Shapes>`),
	);
	const pages = await zip.file('visio/pages/pages.xml')!.async('string');
	zip.file(
		'visio/pages/pages.xml',
		pages
			.replace('N="PageWidth" V="8.5"', `N="PageWidth" V="${8.5 / scale}"`)
			.replace('N="PageHeight" V="11"', `N="PageHeight" V="${11 / scale}"`)
			.replace('</PageSheet>', `${cell('DrawingScale', 1)}${cell('PageScale', scale)}</PageSheet>`),
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
		const controller = (node as VisioViewerElement).controller;
		return {
			bytes: Array.from(controller.exportVsdx().bytes),
			selected: controller.state.selectedShapes.map((shape) => shape.id),
			shapes: controller.state.document!.pages[0]!.shapes.map((shape) => ({
				id: shape.id,
				pattern: shape.style.fillPatternIndex,
				background: shape.style.fillBackgroundColor,
				foregroundOpacity: shape.style.fillForegroundOpacity,
				backgroundOpacity: shape.style.fillBackgroundOpacity,
				line: shape.style.linePattern,
				lineOpacity: shape.style.lineColorOpacity,
				color: shape.style.lineColor,
			})),
		};
	});
}
async function selectAll(viewer: Locator) {
	await viewer.getByRole('tab', { name: 'Home', exact: true }).click();
	await ribbonGroup(viewer, 'Editing');
	await viewer.getByRole('button', { name: 'Select', exact: true }).click();
	await viewer.locator('[command="select-all"]').click();
}
/** Fill > More Options... opens the Format Shape task pane at its Fill section. */
async function properties(viewer: Locator): Promise<Locator> {
	await viewer.getByRole('button', { name: 'Fill', exact: true }).click();
	await viewer.locator('[command="fill-options"]').click();
	const pane = viewer.locator('.format-pane');
	await expect(pane).toBeVisible();
	await expect(viewer.locator('#inspector-pane')).toHaveAttribute('label', 'Format Shape');
	return pane;
}
/** Type into a pane number field and leave it, which applies the value. */
async function enter(viewer: Locator, pane: Locator, field: string, value: string) {
	const input = pane.locator(`[data-pane-field="${field}"]`);
	await input.fill(value);
	await input.press('Tab');
	await idle(viewer);
}

for (const [index, framework] of [
	'vanilla',
	'react',
	'vue',
	'angular',
	'svelte',
	'solid',
].entries()) {
	test(`${framework}: paint menus and properties save atomic selection edits with exact history`, async ({
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
		const load = async (buffer: Buffer) => {
			await page.locator('#file').setInputFiles({
				name: 'paint.vsdx',
				mimeType: 'application/vnd.ms-visio.drawing',
				buffer,
			});
			await expect(page.locator('#file-name')).toHaveText('paint.vsdx');
			await idle(viewer);
		};
		await load(await fixture(scale));
		await selectAll(viewer);
		expect((await inventory(viewer)).selected).toEqual(['1', '2']);
		await pickColor(viewer, 'line', 'none');
		await idle(viewer);
		await expect(viewer.locator('svg.paper [data-shape-id="1"] > path')).toHaveAttribute(
			'stroke',
			'none',
		);
		await pickColor(viewer, 'line', '#0070c0');
		await idle(viewer);
		expect((await inventory(viewer)).shapes.map((shape) => shape.line)).toEqual([0, 0]);
		const before = await inventory(viewer);
		const pane = await properties(viewer);
		// The old Fill & Line dialog is gone: every pane change applies at once, as one undo step.
		await expect(viewer.locator('.paint-properties-dialog')).toHaveCount(0);
		await pane.locator('[data-pane-field="fillPattern"]').selectOption('24');
		await idle(viewer);
		await pane.locator('[data-format-color="fillBackground"]').click();
		await pane
			.locator('office-ui-color-grid[data-color-grid="fillBackground"] [data-color="#00b050"]')
			.click();
		await idle(viewer);
		await enter(viewer, pane, 'fillTransparency', '17.5');
		await pane.getByRole('radio', { name: 'Solid line', exact: true }).check();
		await idle(viewer);
		await pane.locator('[data-pane-field="linePattern"]').selectOption('23');
		await idle(viewer);
		await enter(viewer, pane, 'lineTransparency', '62.5');
		const accepted = await inventory(viewer);
		expect(accepted.selected).toEqual(['1', '2']);
		for (const shape of accepted.shapes) {
			expect(shape.pattern).toBe(24);
			expect(shape.background).toBe('#00b050');
			expect(shape.line).toBe(23);
			expect(shape.foregroundOpacity).toBeCloseTo(0.825, 12);
			expect(shape.backgroundOpacity).toBeCloseTo(0.825, 12);
			expect(shape.lineOpacity).toBeCloseTo(0.375, 12);
		}
		const path = viewer.locator('svg.paper [data-shape-id="1"] > path');
		await expect(path).toHaveAttribute('stroke-opacity', '0.375');
		await expect(path).toHaveAttribute('stroke-dasharray', /\S+/);
		await expect(path).toHaveAttribute('fill', /^url\(#/u);
		for (let step = 0; step < 6; step++) {
			await viewer.locator('.qat [data-command="undo"]').click();
			await idle(viewer);
		}
		expect((await inventory(viewer)).bytes).toEqual(before.bytes);
		for (let step = 0; step < 6; step++) {
			await viewer.locator('.qat [data-command="redo"]').click();
			await idle(viewer);
		}
		expect((await inventory(viewer)).bytes).toEqual(accepted.bytes);
		const downloadCommand = await downloadCopy(viewer),
			pending = page.waitForEvent('download');
		await downloadCommand.click();
		const download = await pending;
		await page.locator('#file').setInputFiles((await download.path())!);
		await idle(viewer);
		expect((await inventory(viewer)).shapes).toEqual(accepted.shapes);
		// The shape menu's Format Shape opens the same pane.
		await viewer.locator('#inspector-pane .close').click();
		await expect(pane).toBeHidden();
		await viewer.locator('[data-shape-id="1"]').click({ button: 'right' });
		await viewer.locator('[command="ctx-format"]').click();
		await expect(pane).toBeVisible();
		await load(await fixture(scale, true));
		await selectAll(viewer);
		const protectedSource = await inventory(viewer);
		await enter(viewer, pane, 'lineTransparency', '25');
		await expect(viewer.locator('[data-status]')).toContainText('protection is active');
		expect((await inventory(viewer)).bytes).toEqual(protectedSource.bytes);
		expect((await inventory(viewer)).selected).toEqual(['1', '2']);
		expect(errors).toEqual([]);
	});
}
