import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { createVsdxFixture } from './fixture.mjs';
import { downloadCopy, pickColor } from './ribbon';
import type { VisioViewerElement } from 'ooxml-ui/visio';
import { openDemo } from './demo-page';

async function selectionFixture(): Promise<Buffer> {
	const zip = await JSZip.loadAsync(await createVsdxFixture('First target'));
	const xml = await zip.file('visio/pages/page1.xml')!.async('string');
	const first = xml.match(/<Shape ID="1"[\s\S]*?<\/Shape>/)![0];
	zip.file(
		'visio/pages/page1.xml',
		xml.replace(
			'</Shapes>',
			`${first.replace('ID="1"', 'ID="2"').replace('N="PinY" V="7"', 'N="PinY" V="5"').replace('First target', 'Second target')}</Shapes>`,
		),
	);
	return zip.generateAsync({ type: 'nodebuffer' });
}

for (const framework of ['vanilla', 'react', 'vue', 'angular', 'svelte', 'solid']) {
	test(`${framework}: additive selection publishes frozen events and survives atomic formatting`, async ({
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
			name: 'selection.vsdx',
			mimeType: 'application/vnd.ms-visio.drawing',
			buffer: await selectionFixture(),
		});
		await expect(page.locator('#file-name')).toHaveText('selection.vsdx');
		await expect(viewer.locator('svg.paper')).toContainText('Second target');
		await viewer.evaluate((node) => {
			const host = node as VisioViewerElement & {
				selectionEvents: { ids: string[]; frozen: boolean }[];
			};
			host.selectionEvents = [];
			host.addEventListener('selection-change', (event) => {
				const selected = (event as CustomEvent<readonly { id: string }[]>).detail;
				host.selectionEvents.push({
					ids: selected.map((shape) => shape.id),
					frozen: Object.isFrozen(selected) && selected.every(Object.isFrozen),
				});
			});
		});
		const first = viewer.locator('svg.paper [data-shape-id="1"]');
		const second = viewer.locator('svg.paper [data-shape-id="2"]');
		await first.click();
		await second.click({ modifiers: ['Shift'] });
		await expect(viewer.locator('svg.paper [data-selected="true"]')).toHaveCount(2);
		await expect
			.poll(() =>
				viewer.evaluate((node) => (node as VisioViewerElement).controller.state.selectedShape?.id),
			)
			.toBe('1');
		await expect(page.locator('#selection')).toContainText('1');
		await expect
			.poll(() =>
				viewer.evaluate(
					(node) =>
						(node as VisioViewerElement & { selectionEvents: { ids: string[]; frozen: boolean }[] })
							.selectionEvents,
				),
			)
			.toEqual([
				{ ids: ['1'], frozen: true },
				{ ids: ['1', '2'], frozen: true },
			]);
		await second.click({ modifiers: ['Control'] });
		await expect(viewer.locator('svg.paper [data-selected="true"]')).toHaveCount(1);
		await second.click({ modifiers: ['Shift'] });
		const bold = viewer.locator('[command="bold"] button');
		await expect(bold).toBeEnabled();
		await bold.click();
		for (const shape of [first, second])
			await expect(shape.locator('tspan[font-family]').first()).toHaveAttribute(
				'font-weight',
				'bold',
			);
		await expect(viewer.locator('svg.paper [data-selected="true"]')).toHaveCount(2);
		await viewer.locator('.qat [data-command="undo"]').click();
		for (const shape of [first, second])
			await expect(shape.locator('tspan[font-family]').first()).not.toHaveAttribute(
				'font-weight',
				'bold',
			);
		await expect(viewer.locator('svg.paper [data-selected="true"]')).toHaveCount(2);
		await viewer.locator('.qat [data-command="redo"]').click();
		await expect(viewer.locator('svg.paper [data-selected="true"]')).toHaveCount(2);
		await viewer.locator('[command="strikethrough"] button').click();
		for (const shape of [first, second])
			await expect(shape.locator('tspan[font-family]').first()).toHaveAttribute(
				'text-decoration',
				'line-through',
			);
		await pickColor(viewer, 'font', '#ff0000');
		for (const shape of [first, second])
			await expect(shape.locator('tspan[font-family]').first()).toHaveAttribute('fill', '#ff0000');
		await viewer.locator('[command="bullets"] button').click();
		await expect
			.poll(() =>
				viewer.evaluate((node) =>
					(node as VisioViewerElement).controller.state.document!.pages[0]!.shapes.every(
						(shape) => !!shape.text.paragraphs?.[0]?.bullet,
					),
				),
			)
			.toBe(true);
		await viewer.locator('[command="indent-increase"] button').click();
		await expect
			.poll(() =>
				viewer.evaluate((node) =>
					(node as VisioViewerElement).controller.state.document!.pages[0]!.shapes.map(
						(shape) => shape.text.paragraphs?.[0]?.indentLeft,
					),
				),
			)
			.toEqual([0.25, 0.25]);
		await viewer.locator('[command="justify"] button').click();
		await expect
			.poll(() =>
				viewer.evaluate((node) =>
					(node as VisioViewerElement).controller.state.document!.pages[0]!.shapes.map(
						(shape) => shape.text.horizontalAlign,
					),
				),
			)
			.toEqual(['justify', 'justify']);
		await expect(viewer.locator('svg.paper [data-selected="true"]')).toHaveCount(2);
		await first.press('Escape');
		await expect(viewer.locator('svg.paper [data-selected="true"]')).toHaveCount(0);
		await viewer.evaluate((node) => (node as VisioViewerElement).selectAll());
		await expect(viewer.locator('svg.paper [data-selected="true"]')).toHaveCount(2);
		await viewer.evaluate((node) => (node as VisioViewerElement).clearSelection());
		await expect(viewer.locator('svg.paper [data-selected="true"]')).toHaveCount(0);
		const downloadButton = await downloadCopy(viewer);
		const downloading = page.waitForEvent('download');
		await downloadButton.click();
		const stream = await (await downloading).createReadStream();
		const chunks: Buffer[] = [];
		for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
		await page.locator('#file').setInputFiles({
			name: 'reopened-selection.vsdx',
			mimeType: 'application/vnd.ms-visio.drawing',
			buffer: Buffer.concat(chunks),
		});
		await expect(page.locator('#file-name')).toHaveText('reopened-selection.vsdx');
		for (const shape of [first, second]) {
			await expect(shape.locator('tspan[font-family]').first()).toHaveAttribute(
				'text-decoration',
				'line-through',
			);
			await expect(shape.locator('tspan[font-family]').first()).toHaveAttribute('fill', '#ff0000');
		}
		await expect(viewer.locator('svg.paper [data-selected="true"]')).toHaveCount(0);
		expect(errors).toEqual([]);
	});
}
