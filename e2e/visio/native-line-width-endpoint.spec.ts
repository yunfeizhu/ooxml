import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { nativeSvgLineEndpoints } from './native-line-svg';
import { openDemo } from './demo-page';

for (const variable of ['VISIO_NATIVE_LINE_WIDTH_BEGIN_DIR', 'VISIO_NATIVE_LINE_WIDTH_END_DIR']) {
	for (const framework of ['vanilla', 'react', 'vue', 'angular', 'svelte', 'solid']) {
		test(`${framework}: displays fixed-Width native endpoint assignments and retains refusal (${variable})`, async ({
			page,
		}) => {
			const directory = process.env[variable];
			test.skip(!directory, `Set ${variable} to the native fixed-Width capture.`);
			const evidence = JSON.parse(await readFile(join(directory!, 'evidence.json'), 'utf8')) as {
				cases: {
					shapeId: string;
					endpoint: 'Begin' | 'End';
					endpointAfter: Record<string, { value: number }>;
					endpointTransform: number[];
				}[];
			};
			await openDemo(
				page,
				framework === 'vanilla' ? '/demo/?sample=1' : `/demo-${framework}/?sample=1`,
			);
			await page.locator('#file').setInputFiles(join(directory!, 'endpoint.vsdx'));
			await expect(page.locator('#file-name')).toHaveText('endpoint.vsdx');
			const reference = await nativeSvgLineEndpoints(
				page,
				await readFile(join(directory!, 'endpoint-page.svg'), 'utf8'),
			);
			expect(reference.lines).toHaveLength(4);
			const actual = await page.evaluate(
				() =>
					(
						document.querySelector('visio-viewer') as unknown as {
							document: import('ooxml-core/visio').VisioDocument;
						}
					).document.pages[0]!.shapes,
			);
			for (const item of evidence.cases) {
				const shape = actual.find((shape) => shape.id === item.shapeId)!;
				const line = page.locator('visio-viewer').locator(`[data-shape-id="${item.shapeId}"]`);
				const rendered = (await line.getAttribute('transform'))!
					.slice(7, -1)
					.trim()
					.split(/[\s,]+/)
					.map(Number);
				for (let i = 0; i < 6; i++) expect(rendered[i]).toBeCloseTo(item.endpointTransform[i]!, 12);
				const native = reference.lines.find((line) => line.id === item.shapeId)!;
				const [a, b, , , x, y] = shape.transform;
				expect(x).toBeCloseTo(native.begin.x, 3);
				expect(y).toBeCloseTo(native.begin.y, 3);
				expect(x + a * shape.width).toBeCloseTo(native.end.x, 3);
				expect(y + b * shape.width).toBeCloseTo(native.end.y, 3);
			}
			const source = await readFile(join(directory!, 'resized.vsdx'));
			await page.locator('#file').setInputFiles(join(directory!, 'resized.vsdx'));
			await expect(page.locator('#file-name')).toHaveText('resized.vsdx');
			const rejected = await page.evaluate(async (cases) => {
				const viewer = document.querySelector('visio-viewer') as unknown as {
					document: import('ooxml-core/visio').VisioDocument;
					applyEdits(edits: import('ooxml-core/visio').VisioEdit[]): Promise<void>;
					exportVsdx(): { bytes: Uint8Array };
				};
				const before = JSON.stringify(viewer.document.pages);
				const errors: string[] = [];
				for (const item of cases) {
					try {
						await viewer.applyEdits([
							{
								type: 'move-line-endpoint',
								pageId: viewer.document.pages[0]!.id,
								shapeId: item.shapeId,
								endpoint: item.endpoint === 'Begin' ? 'begin' : 'end',
								x: item.endpointAfter[item.endpoint + 'X']!.value,
								y: item.endpointAfter[item.endpoint + 'Y']!.value,
							},
						]);
					} catch (error) {
						errors.push((error as Error).message);
					}
				}
				return {
					errors,
					unchanged: JSON.stringify(viewer.document.pages) === before,
					bytes: Array.from(viewer.exportVsdx().bytes),
				};
			}, evidence.cases);
			expect(rejected.errors).toHaveLength(4);
			for (const error of rejected.errors)
				expect(error).toContain('Endpoint editing requires native derived transform formulas');
			expect(rejected.unchanged).toBe(true);
			expect(Buffer.from(rejected.bytes)).toEqual(source);
		});
	}
}
