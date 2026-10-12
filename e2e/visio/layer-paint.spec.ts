import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import type { VisioViewerElement } from 'ooxml-ui/visio';
import reference from '../../src/core/visio/__fixtures__/layer-colors-native.json' with { type: 'json' };
import { openDemo } from './demo-page';

const nativeDirectory = process.env.VISIO_NATIVE_LAYER_COLORS_DIR;
for (const framework of ['vanilla', 'react', 'vue', 'angular', 'svelte', 'solid']) {
	test(`${framework}: layer stroke pixels match native PNG in live and exported SVG`, async ({
		page,
	}) => {
		test.skip(
			!nativeDirectory,
			'Set VISIO_NATIVE_LAYER_COLORS_DIR to the native oracle directory.',
		);
		await openDemo(
			page,
			framework === 'vanilla' ? '/demo/?sample=1' : `/demo-${framework}/?sample=1`,
		);
		await page.locator('#file').setInputFiles(join(nativeDirectory!, 'layer-colors.vsdx'));
		await expect(page.locator('#file-name')).toHaveText('layer-colors.vsdx');
		await expect(page.locator('visio-viewer svg.paper text')).toContainText('Layer color');
		const pixels = await page.evaluate(async () => {
			const load = (path: string) => import(/* @vite-ignore */ path);
			const { renderPage, exportPageSvg } = await load('/test-api.js');
			const element = document.querySelector<VisioViewerElement>('visio-viewer')!;
			const model = element.document!;
			const pixels = [];
			for (let index = 0; index < model.pages.length; index++) {
				const live = renderPage(model, model.pages[index]);
				const sources = [
					new XMLSerializer().serializeToString(live.svg),
					exportPageSvg(model, index).svg,
				];
				const samples = [];
				for (const source of sources) {
					const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }));
					try {
						const image = new Image();
						image.src = url;
						await image.decode();
						const canvas = document.createElement('canvas');
						canvas.width = 576;
						canvas.height = 432;
						const context = canvas.getContext('2d')!;
						context.fillStyle = 'white';
						context.fillRect(0, 0, 576, 432);
						context.drawImage(image, 0, 0, 576, 432);
						// Sample the outer half of the top stroke, as in the cropped native PNG.
						// Its inner half composites the gradient fill beneath translucent strokes.
						samples.push(Array.from(context.getImageData(288, 143, 1, 1).data));
					} finally {
						URL.revokeObjectURL(url);
					}
				}
				live.dispose();
				pixels.push(samples);
			}
			return pixels;
		});
		expect(pixels).toHaveLength(reference.cases.length);
		for (let index = 0; index < pixels.length; index++)
			for (const pixel of pixels[index]!)
				expect(pixel, reference.cases[index]!.name).toEqual(
					reference.cases[index]!.paint.strokePixel,
				);
	});
}
