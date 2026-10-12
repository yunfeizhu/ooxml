import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { VisioDocument, VisioShape } from 'ooxml-core/visio';
import { openDemo } from './demo-page';

for (const sample of [
	{ name: 'opaque', directory: process.env.VISIO_NATIVE_FILL_PATTERNS_DIR },
	{ name: 'alpha', directory: process.env.VISIO_NATIVE_FILL_PATTERNS_ALPHA_DIR },
	{ name: 'rotated', directory: process.env.VISIO_NATIVE_FILL_PATTERNS_ROTATED_DIR },
	{ name: 'scaled', directory: process.env.VISIO_NATIVE_FILL_PATTERNS_SCALED_DIR },
	{ name: 'flip-x', directory: process.env.VISIO_NATIVE_FILL_PATTERNS_FLIP_X_DIR },
	{ name: 'flip-y', directory: process.env.VISIO_NATIVE_FILL_PATTERNS_FLIP_Y_DIR },
	{ name: 'grouped', directory: process.env.VISIO_NATIVE_FILL_PATTERNS_GROUPED_DIR },
	{ name: 'group-flipped', directory: process.env.VISIO_NATIVE_FILL_PATTERNS_GROUP_FLIPPED_DIR },
	{ name: 'oblique', directory: process.env.VISIO_NATIVE_FILL_PATTERNS_OBLIQUE_DIR },
	{ name: 'radial', directory: process.env.VISIO_NATIVE_RADIAL_FILLS_DIR },
	{ name: 'radial-alpha', directory: process.env.VISIO_NATIVE_RADIAL_FILLS_ALPHA_DIR },
]) {
	const directory = sample.directory;
	// Saved gradients use the native PNG benchmark in gradient-raster.spec.ts.
	// Classic radial SVG compatibility remains measured without a native-paint claim.
	// Rectangular native-SVG seams are not an oracle for the native raster engine.
	const fullPage = sample.name.startsWith('radial');
	const firstPattern = fullPage ? 36 : 2,
		patternCount = fullPage ? 5 : 23;
	for (const framework of ['vanilla', 'react', 'vue', 'angular', 'svelte', 'solid']) {
		test(`${framework}: ${sample.name} native fills match live and exported SVG`, async ({
			page,
		}) => {
			test.skip(!directory, 'Set VISIO_NATIVE_FILL_PATTERNS_DIR to the native oracle directory.');
			await openDemo(
				page,
				framework === 'vanilla' ? '/demo/?sample=1' : `/demo-${framework}/?sample=1`,
			);
			await page.locator('#file').setInputFiles(join(directory!, 'fill-patterns.vsdx'));
			await expect(page.locator('#file-name')).toHaveText('fill-patterns.vsdx');
			const references = await Promise.all(
				Array.from({ length: patternCount }, (_, index) =>
					readFile(join(directory!, `pattern-${index + firstPattern}.svg`), 'utf8'),
				),
			);
			const { results, groupDepths } = await page.evaluate(
				async ({ references, firstPattern, fullPage }) => {
					const load = (path: string) => import(/* @vite-ignore */ path);
					const { exportPageSvg, renderPage } = await load('/test-api.js');
					const model = (
						document.querySelector('visio-viewer') as unknown as { document: VisioDocument }
					).document;
					const groupDepth = (shapes: readonly VisioShape[]): number =>
						Math.max(
							0,
							...shapes.map((shape) =>
								shape.kind === 'group' ? 1 + groupDepth(shape.children) : 0,
							),
						);
					const raster = async (source: string) => {
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
							return (
								fullPage
									? context.getImageData(0, 0, 576, 432)
									: context.getImageData(156, 156, 96, 96)
							).data;
						} finally {
							URL.revokeObjectURL(url);
						}
					};
					const differences = [];
					for (let index = 0; index < model.pages.length; index++) {
						const expected = await raster(references[index]!);
						const live = renderPage(model, model.pages[index]);
						const copy = live.svg.cloneNode(true) as SVGSVGElement;
						for (const image of copy.querySelectorAll('image')) {
							const href = image.getAttribute('href');
							if (!href?.startsWith('blob:')) continue;
							const bytes = new Uint8Array(await (await fetch(href)).arrayBuffer());
							image.setAttribute(
								'href',
								`data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`,
							);
						}
						const sources = [
							new XMLSerializer().serializeToString(copy),
							exportPageSvg(model, index).svg,
						];
						for (const source of sources) {
							const actual = await raster(source);
							let maximum = 0,
								count = 0;
							for (let byte = 0; byte < expected.length; byte++) {
								const difference = Math.abs(actual[byte]! - expected[byte]!);
								maximum = Math.max(maximum, difference);
								if (difference) count++;
							}
							differences.push({ pattern: index + firstPattern, maximum, count });
						}
						live.dispose();
					}
					return {
						results: differences,
						groupDepths: model.pages.map((page) => groupDepth(page.shapes)),
					};
				},
				{ references, firstPattern, fullPage },
			);
			if (sample.name.startsWith('group')) expect(groupDepths).toEqual(Array(23).fill(2));
			expect(results).toHaveLength(patternCount * 2);
			if (results.some((result) => result.maximum))
				await test.info().attach('native-hatch-differences', {
					body: JSON.stringify(results, null, 2),
					contentType: 'application/json',
				});
			expect(
				Math.max(...results.map((result) => result.maximum)),
				`${results.reduce((sum, result) => sum + result.count, 0)} differing channels across ${patternCount * 2} renders`,
			).toBe(0);
			for (const result of results)
				expect(
					result.maximum,
					`pattern ${result.pattern}: ${result.count} differing channels`,
				).toBe(0);
		});
	}
}
