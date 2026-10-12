import { test, expect, type Locator, type Page } from '@playwright/test';
import JSZip from 'jszip';
import type { VisioViewerElement } from 'ooxml-ui/visio';
import { createVsdxFixture } from './fixture.mjs';
import { downloadCopy } from './ribbon';
import { openDemo } from './demo-page';

interface TestClipboard {
	text: string;
	reads: number;
	writes: number;
	failRead: boolean;
	failWrite: boolean;
	delayRead: boolean;
	delayWrite: boolean;
	pendingRead: (() => void) | null;
	pendingWrite: (() => void) | null;
}
declare global {
	interface Window {
		visioTestClipboard: TestClipboard;
	}
}
async function installTransport(page: Page) {
	await page.addInitScript(() => {
		const state: TestClipboard = {
			text: '',
			reads: 0,
			writes: 0,
			failRead: false,
			failWrite: false,
			delayRead: false,
			delayWrite: false,
			pendingRead: null,
			pendingWrite: null,
		};
		window.visioTestClipboard = state;
		// Fully synthetic clipboard: these tests never invoke an OS clipboard API.
		class Item {
			constructor(readonly data: Record<string, Promise<Blob>>) {}
			getType(type: string) {
				return this.data[type]!;
			}
		}
		Object.defineProperty(window, 'ClipboardItem', { configurable: true, value: Item });
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: {
				async readText() {
					++state.reads;
					if (state.failRead)
						throw new DOMException('Test clipboard read denied', 'NotAllowedError');
					const value = state.text;
					if (state.delayRead)
						await new Promise<void>((resolve) => {
							state.pendingRead = resolve;
						});
					return value;
				},
				async write(items: Item[]) {
					++state.writes;
					if (state.failWrite)
						throw new DOMException('Test clipboard write denied', 'NotAllowedError');
					const value = await (await items[0]!.getType('text/plain')).text();
					if (state.delayWrite)
						await new Promise<void>((resolve) => {
							state.pendingWrite = resolve;
						});
					state.text = value;
				},
			},
		});
	});
}
async function fixture() {
	const zip = await JSZip.loadAsync(await createVsdxFixture('Clipboard source'));
	const path = 'visio/pages/page1.xml';
	const xml = await zip.file(path)!.async('string');
	const second = xml
		.match(/<Shape ID="1"[\s\S]*?<\/Shape>/u)![0]
		.replace('ID="1"', 'ID="2"')
		.replace('Clipboard source', 'Clipboard second')
		.replace('<Cell N="PinX" V="4"/>', '<Cell N="PinX" V="2"/>')
		.replace('<Cell N="PinY" V="7"/>', '<Cell N="PinY" V="2"/>');
	zip.file(path, xml.replace('</Shapes>', `${second}</Shapes>`));
	return zip.generateAsync({ type: 'nodebuffer' });
}
const inventory = (viewer: Locator) =>
	viewer.evaluate((node) => {
		const state = (node as VisioViewerElement).controller.state;
		return {
			shapes: state.document!.pages[0]!.shapes.map((shape) => ({
				id: shape.id,
				x: Number(shape.rotation!.pinX.toFixed(10)),
				y: Number(shape.rotation!.pinY.toFixed(10)),
				text: shape.text!.plainText,
			})),
			selected: state.selectedShapes.map((shape) => shape.id),
			undo: state.edit.canUndo,
		};
	});
const selection = (viewer: Locator, ids: string[]) =>
	expect.poll(async () => (await inventory(viewer)).selected).toEqual(ids);
const bytes = (viewer: Locator) =>
	viewer.evaluate((node) => Array.from((node as VisioViewerElement).controller.exportVsdx().bytes));

for (const framework of ['vanilla', 'react', 'vue', 'angular', 'svelte', 'solid']) {
	test(`${framework}: Copy Cut Paste use current clipboard and preserve source/history across refusals`, async ({
		page,
	}) => {
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await installTransport(page);
		await page.setViewportSize({ width: 1600, height: 1000 });
		await openDemo(
			page,
			framework === 'vanilla' ? '/demo/?sample=1' : `/demo-${framework}/?sample=1`,
		);
		const viewer = page.locator('visio-viewer');
		await page.locator('#file').setInputFiles({
			name: 'clipboard.vsdx',
			mimeType: 'application/vnd.ms-visio.drawing',
			buffer: await fixture(),
		});
		await expect(page.locator('#file-name')).toHaveText('clipboard.vsdx');
		await expect(viewer.locator('svg.paper')).toContainText('Clipboard second');
		await viewer.getByRole('tab', { name: 'Home', exact: true }).click();
		await viewer.evaluate((node) =>
			(node as VisioViewerElement).selectShapes([
				{ id: '2', name: 'second', pageId: '1' },
				{ id: '1', name: 'first', pageId: '1' },
			]),
		);
		await selection(viewer, ['2', '1']);
		await expect
			.poll(() =>
				viewer.evaluate((node) => (node as VisioViewerElement).controller.state.clipboard.ready),
			)
			.toBe(true);
		const original = await bytes(viewer);
		await viewer.locator('.viewport').press('Control+c');
		await expect(viewer.locator('[data-status]')).toHaveText('Copied selected shapes.');
		expect(
			await page.evaluate(() =>
				window.visioTestClipboard.text.startsWith('OOXML-VISIO-SHAPES/1\n'),
			),
		).toBe(true);
		expect(await bytes(viewer)).toEqual(original);
		expect((await inventory(viewer)).undo).toBe(false);
		await viewer.locator('.viewport').press('Escape');
		await selection(viewer, []);
		await viewer.locator('[command="paste"] .main').click();
		await expect(viewer.locator('svg.paper [data-shape-id]')).toHaveCount(4);
		await selection(viewer, ['4', '3']);
		const pasted = await inventory(viewer);
		expect(pasted.shapes).toEqual([
			{ id: '1', x: 4, y: 7, text: 'Clipboard source' },
			{ id: '2', x: 2, y: 2, text: 'Clipboard second' },
			{ id: '3', x: 4.33, y: 6.67, text: 'Clipboard source' },
			{ id: '4', x: 2.33, y: 1.67, text: 'Clipboard second' },
		]);
		await viewer.locator('.qat [data-command="undo"]').click();
		await expect(viewer.locator('svg.paper [data-shape-id]')).toHaveCount(2);
		await selection(viewer, []);
		await viewer.locator('.qat [data-command="redo"]').click();
		await selection(viewer, ['4', '3']);
		const saved = await bytes(viewer);
		// Unrelated clipboard contents and denied reads cannot resurrect the last copied shapes.
		await page.evaluate(() => {
			window.visioTestClipboard.text = 'Unrelated clipboard content';
		});
		await viewer.locator('.viewport').press('Control+v');
		await expect.poll(() => page.evaluate(() => window.visioTestClipboard.reads)).toBe(2);
		await expect(viewer.locator('[command="copy"] button')).toBeEnabled();
		expect(await bytes(viewer)).toEqual(saved);
		await page.evaluate(() => {
			window.visioTestClipboard.failRead = true;
		});
		await viewer.locator('.viewport').press('Control+v');
		await expect(viewer.locator('[data-status]')).toContainText('Test clipboard read denied');
		expect(await bytes(viewer)).toEqual(saved);
		await page.evaluate(() => {
			window.visioTestClipboard.failRead = false;
			window.visioTestClipboard.failWrite = true;
		});
		await viewer.locator('[command="cut"] button').click();
		await expect(viewer.locator('[data-status]')).toContainText('Test clipboard write denied');
		expect(await bytes(viewer)).toEqual(saved);
		await selection(viewer, ['4', '3']);
		// A successful write that resolves after new selection intent cannot cut the old selection.
		await page.evaluate(() => {
			window.visioTestClipboard.failWrite = false;
			window.visioTestClipboard.delayWrite = true;
		});
		await viewer.locator('.viewport').press('Control+x');
		await expect
			.poll(() => page.evaluate(() => !!window.visioTestClipboard.pendingWrite))
			.toBe(true);
		await viewer.locator('.viewport').press('Escape');
		await page.evaluate(() => {
			window.visioTestClipboard.delayWrite = false;
			window.visioTestClipboard.pendingWrite!();
			window.visioTestClipboard.pendingWrite = null;
		});
		await expect(viewer.locator('[command="paste"] .main')).toBeEnabled();
		expect(await bytes(viewer)).toEqual(saved);
		await selection(viewer, []);
		// Paste also captures the user's current intent before awaiting the real read.
		await page.evaluate(() => {
			window.visioTestClipboard.delayRead = true;
		});
		await viewer.locator('.viewport').press('Control+v');
		await expect
			.poll(() => page.evaluate(() => !!window.visioTestClipboard.pendingRead))
			.toBe(true);
		await viewer.locator('svg.paper [data-shape-id="4"]').click();
		await page.evaluate(() => {
			window.visioTestClipboard.delayRead = false;
			window.visioTestClipboard.pendingRead!();
			window.visioTestClipboard.pendingRead = null;
		});
		await expect(viewer.locator('[command="paste"] .main')).toBeEnabled();
		expect(await bytes(viewer)).toEqual(saved);
		await selection(viewer, ['4']);
		await viewer.evaluate((node) =>
			(node as VisioViewerElement).selectShapes([
				{ id: '4', name: 'copysecond', pageId: '1' },
				{ id: '3', name: 'copyfirst', pageId: '1' },
			]),
		);
		await expect
			.poll(() =>
				viewer.evaluate((node) => (node as VisioViewerElement).controller.state.clipboard.ready),
			)
			.toBe(true);
		await viewer.locator('svg.paper [data-shape-id="4"]').click({ button: 'right' });
		await viewer.locator('[command="ctx-cut"]').click();
		await expect(viewer.locator('svg.paper [data-shape-id]')).toHaveCount(2);
		await selection(viewer, []);
		await viewer.locator('.qat [data-command="undo"]').click();
		await expect(viewer.locator('svg.paper [data-shape-id]')).toHaveCount(4);
		await selection(viewer, ['4', '3']);
		expect(await bytes(viewer)).toEqual(saved);
		const download = page.waitForEvent('download');
		await (await downloadCopy(viewer)).click();
		const stream = await (await download).createReadStream();
		const chunks: Buffer[] = [];
		for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
		await page.locator('#file').setInputFiles({
			name: 'reopened-clipboard.vsdx',
			mimeType: 'application/vnd.ms-visio.drawing',
			buffer: Buffer.concat(chunks),
		});
		await expect(page.locator('#file-name')).toHaveText('reopened-clipboard.vsdx');
		await expect.poll(async () => (await inventory(viewer)).shapes).toEqual(pasted.shapes);
		await selection(viewer, []);
		expect(errors).toEqual([]);
	});
}
