import { test, expect } from '@playwright/test';
import { openDemo } from './demo-page';

// Browser raster regression of the bounded SVG contract, not native Visio sizing.
test('code-5 arrows paint both endpoint directions and preserve the inward base in export', async ({
	page,
}) => {
	await openDemo(page);
	const result = await page.evaluate(async () => {
		const load = (path: string) => import(/* @vite-ignore */ path);
		const { demoDocument, renderPage, exportPageSvg } = await load('/test-api.js');
		const model = structuredClone(demoDocument),
			shape = model.pages[0].shapes[1];
		model.pages = [model.pages[0]];
		const page = model.pages[0];
		page.width = 4;
		page.height = 2;
		page.shapes = [shape];
		delete page.backgroundPageId;
		shape.geometry = [{ path: 'M 0 0 L 2 0', fill: false, stroke: true }];
		shape.transform = [1, 0, 0, 1, 1, 1];
		shape.text.plainText = '';
		shape.text.runs = [];
		Object.assign(shape.style, {
			lineColor: '#ff0000',
			lineWidth: 0.005,
			lineOpacity: 1,
			linePattern: 1,
			startArrow: 5,
			endArrow: 5,
			startArrowSize: 6,
			endArrowSize: 6,
		});
		const live = renderPage(model, page);
		live.svg.setAttribute('width', '800');
		live.svg.setAttribute('height', '400');
		document.body.append(live.svg);
		const sources = [new XMLSerializer().serializeToString(live.svg), exportPageSvg(model, 0).svg];
		const samples = [];
		for (const source of sources) {
			const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }));
			try {
				const image = new Image();
				image.src = url;
				await image.decode();
				const canvas = document.createElement('canvas');
				canvas.width = 800;
				canvas.height = 400;
				const ctx = canvas.getContext('2d')!;
				ctx.fillStyle = 'white';
				ctx.fillRect(0, 0, 800, 400);
				ctx.drawImage(image, 0, 0, 800, 400);
				const at = (x: number, y: number) => Array.from(ctx.getImageData(x, y, 1, 1).data);
				// 200px/in; tips (200,200)/(600,200). A straight round-capped line takes the
				// native measured glyph (core visioFilledArrow): size 6 at 0.005in is 0.255in
				// per unit, so the base corners sit 102px behind each tip and the inward base
				// curve 89px at the shaft. Interior samples lie off the shaft; base-gap samples
				// (95px) distinguish a concave glyph from a filled triangle or no marker.
				// Behind-tip samples check direction.
				samples.push({
					filled: [at(230, 206), at(570, 194)],
					gap: [at(295, 206), at(505, 194)],
					outside: [at(185, 206), at(615, 194)],
				});
			} finally {
				URL.revokeObjectURL(url);
			}
		}
		const markerCount = live.svg.querySelectorAll('marker').length;
		live.dispose();
		live.svg.remove();
		return { markerCount, samples };
	});
	expect(result.markerCount).toBe(2);
	for (const sample of result.samples) {
		expect(sample.filled).toEqual([
			[255, 0, 0, 255],
			[255, 0, 0, 255],
		]);
		expect(sample.gap).toEqual([
			[255, 255, 255, 255],
			[255, 255, 255, 255],
		]);
		expect(sample.outside).toEqual([
			[255, 255, 255, 255],
			[255, 255, 255, 255],
		]);
	}
});
