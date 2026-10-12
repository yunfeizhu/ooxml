import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { createVsdxFixture } from './fixture.mjs';
import { downloadCopy, pickColor } from './ribbon';
import { openDemo } from './demo-page';

async function formattingFixture(): Promise<Buffer> {
	const zip = await JSZip.loadAsync(await createVsdxFixture('Format me'));
	const document = await zip.file('visio/document.xml')!.async('string');
	zip.file(
		'visio/document.xml',
		document.replace(
			'/>',
			'><FaceNames><FaceName ID="0" Name="Arial"/><FaceName ID="1" Name="Calibri"/></FaceNames></VisioDocument>',
		),
	);
	const page = await zip.file('visio/pages/page1.xml')!.async('string');
	const shape = page.match(/<Shape ID="1"[\s\S]*?<\/Shape>/)![0];
	zip.file(
		'visio/pages/page1.xml',
		page.replace(
			'</Shapes>',
			`${shape.replace('ID="1"', 'ID="2"').replace('N="PinY" V="7"', 'N="PinY" V="5"').replace('Format me', 'Second shape')}</Shapes>`,
		),
	);
	return zip.generateAsync({ type: 'nodebuffer' });
}

for (const framework of ['vanilla', 'react', 'vue', 'angular', 'svelte', 'solid']) {
	test(`${framework} applies ribbon formatting, orders shapes and saves through the worker`, async ({
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
		await expect(viewer.locator('[command="bold"] button')).toBeDisabled();
		await page.locator('#file').setInputFiles({
			name: 'formatting.vsdx',
			mimeType: 'application/vnd.ms-visio.drawing',
			buffer: await formattingFixture(),
		});
		await expect(page.locator('#file-name')).toHaveText('formatting.vsdx');
		const first = viewer.locator('svg.paper [data-shape-id="1"]');
		await first.click();
		const bold = viewer.locator('[command="bold"] button');
		await expect(bold).toBeEnabled();
		await bold.click();
		await expect(first.locator('tspan[font-family]').first()).toHaveAttribute(
			'font-weight',
			'bold',
		);
		await expect(page.locator('#edit-label')).toHaveText('EDITED COPY');
		await viewer.locator('.qat [data-command="undo"]').click();
		await expect(first.locator('tspan[font-family]').first()).not.toHaveAttribute(
			'font-weight',
			'bold',
		);
		await viewer.locator('.qat [data-command="redo"]').click();
		await expect(first.locator('tspan[font-family]').first()).toHaveAttribute(
			'font-weight',
			'bold',
		);
		await viewer.locator('[command="italic"] button').click();
		await expect(first.locator('tspan[font-family]').first()).toHaveAttribute(
			'font-style',
			'italic',
		);
		await viewer.locator('[data-combo="font-size"] [role="combobox"]').click();
		await viewer
			.locator('[data-combo="font-size"]')
			.getByRole('option', { name: '24 pt', exact: true })
			.click();
		await expect(first.locator('tspan[font-family]').first()).toHaveAttribute(
			'font-size',
			String(24 / 72),
		);
		await pickColor(viewer, 'fill', '#ff0000');
		await expect(first.locator('path').first()).toHaveAttribute('fill', '#ff0000');
		await viewer.locator('[command="bring-to-front"] button').first().click();
		await expect
			.poll(() =>
				viewer
					.locator('svg.paper [data-shape-id]')
					.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-shape-id'))),
			)
			.toEqual(['2', '1']);
		const downloadButton = await downloadCopy(viewer);
		const downloading = page.waitForEvent('download');
		await downloadButton.click();
		const stream = await (await downloading).createReadStream();
		const chunks: Buffer[] = [];
		for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
		await page.locator('#file').setInputFiles({
			name: 'reopened.vsdx',
			mimeType: 'application/vnd.ms-visio.drawing',
			buffer: Buffer.concat(chunks),
		});
		await expect(page.locator('#file-name')).toHaveText('reopened.vsdx');
		await expect(first.locator('tspan[font-family]').first()).toHaveAttribute(
			'font-weight',
			'bold',
		);
		await expect(first.locator('tspan[font-family]').first()).toHaveAttribute(
			'font-style',
			'italic',
		);
		await expect(first.locator('path').first()).toHaveAttribute('fill', '#ff0000');
		await expect
			.poll(() =>
				viewer
					.locator('svg.paper [data-shape-id]')
					.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-shape-id'))),
			)
			.toEqual(['2', '1']);
		expect(errors).toEqual([]);
	});
}
