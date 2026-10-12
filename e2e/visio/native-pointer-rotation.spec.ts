import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseVsdx } from 'ooxml-core/visio';
import { openDemo } from './demo-page';
for (const variable of [
	'VISIO_NATIVE_ROTATE_DIR',
	'VISIO_NATIVE_ROTATE_DOUBLE_DIR',
	'VISIO_NATIVE_ROTATE_HALF_DIR',
	'VISIO_NATIVE_ROTATE_TRIPLE_DIR',
	'VISIO_NATIVE_ROTATE_PIN_DIR',
	'VISIO_NATIVE_ROTATE_DEPENDENT_DIR',
]) {
	const directory = process.env[variable];
	for (const kind of ['rectangle', 'ellipse'])
		for (const framework of ['vanilla', 'react', 'vue', 'angular', 'svelte', 'solid']) {
			test(`${framework}: pointer rotates native ${kind} about its saved pin (${variable})`, async ({
				page,
			}) => {
				test.skip(!directory, `Set ${variable} to a native rotation capture.`);
				const source = await readFile(
					join(
						directory!,
						variable === 'VISIO_NATIVE_ROTATE_PIN_DIR' || variable.includes('_DEPENDENT_')
							? 'rotation-source.vsdx'
							: 'ellipse-edited.vsdx',
					),
				);
				const evidence = JSON.parse(await readFile(join(directory!, 'evidence.json'), 'utf8')) as {
					rotated: Record<
						string,
						{ shapeId: string; cells: Record<string, { value: number }>; transform: number[] }
					>;
				};
				const reference = evidence.rotated[kind]!;
				const native = await parseVsdx(await readFile(join(directory!, 'rotated.vsdx')));
				const expected = native.pages[0]!.shapes.find((shape) => shape.id === reference.shapeId)!;
				await openDemo(
					page,
					framework === 'vanilla' ? '/demo/?sample=1' : `/demo-${framework}/?sample=1`,
				);
				await page.locator('#file').setInputFiles({
					name: 'native-pin.vsdx',
					mimeType: 'application/vnd.ms-visio.drawing',
					buffer: source,
				});
				await expect(page.locator('#file-name')).toHaveText('native-pin.vsdx');
				const viewer = page.locator('visio-viewer'),
					viewport = viewer.locator('.viewport'),
					shape = viewer.locator(`[data-shape-id="${reference.shapeId}"]`);
				await viewport.focus();
				await viewport.press('Control+Shift+w');
				// Smaller paper needs room for its native off-paper shapes too.
				if ((native.pages[0]!.drawingToPageScale ?? 1) === 0.5)
					await viewer.evaluate((element) => {
						(element as unknown as { zoom: number }).zoom = 0.5;
					});
				await shape.focus();
				await shape.press('Enter');
				const handle = viewer.locator(`[data-rotation-handle="${reference.shapeId}"]`);
				await expect(handle).toBeVisible();
				await page.setViewportSize({ width: 1180, height: 800 });
				await expect
					.poll(() =>
						viewport.evaluate((element) => {
							const overlay = element.querySelector<SVGSVGElement>('.rotation-overlay')!;
							return Math.abs(
								Number(overlay.getAttribute('width')) - element.getBoundingClientRect().width,
							);
						}),
					)
					.toBeLessThan(0.001);
				const before = (await shape.getAttribute('transform'))!;
				const geometry = await viewer.evaluate((element, id) => {
					const viewer = element as unknown as {
						document: import('ooxml-core/visio').VisioDocument;
						shadowRoot: ShadowRoot;
					};
					const page = viewer.document.pages[0]!,
						shape = page.shapes.find((shape) => shape.id === id)!;
					const svg = viewer.shadowRoot.querySelector<SVGSVGElement>('svg.paper')!;
					const handle = viewer.shadowRoot.querySelector<SVGCircleElement>(
						`[data-rotation-handle="${id}"]`,
					)!;
					const matrix = svg.getScreenCTM()!;
					const pin = new DOMPoint(
						shape.rotation!.pinX,
						page.height - shape.rotation!.pinY,
					).matrixTransform(matrix);
					const grip = new DOMPoint(
						handle.cx.baseVal.value,
						handle.cy.baseVal.value,
					).matrixTransform(handle.getScreenCTM()!);
					return {
						pin: { x: pin.x, y: pin.y },
						grip: { x: grip.x + 2, y: grip.y + 1 },
						angle: shape.rotation!.angle,
					};
				}, reference.shapeId);
				const delta = -(reference.cells.Angle!.value - geometry.angle);
				const dx = geometry.grip.x - geometry.pin.x,
					dy = geometry.grip.y - geometry.pin.y;
				const pointer = (fraction: number) => ({
					x: geometry.pin.x + dx * Math.cos(delta * fraction) - dy * Math.sin(delta * fraction),
					y: geometry.pin.y + dx * Math.sin(delta * fraction) + dy * Math.cos(delta * fraction),
				});
				await page.evaluate(() => {
					const samples: { x: number; y: number }[] = [];
					(window as unknown as { rotationSamples: typeof samples }).rotationSamples = samples;
					for (const type of ['pointerdown', 'pointerup'])
						window.addEventListener(
							type,
							(event) => {
								const pointer = event as PointerEvent;
								samples.push({ x: pointer.clientX, y: pointer.clientY });
							},
							{ capture: true },
						);
				});
				// Cancel the first real gesture. The source and history stay unchanged.
				await page.mouse.move(geometry.grip.x, geometry.grip.y);
				await page.mouse.down();
				const halfway = pointer(0.5);
				await page.mouse.move(halfway.x, halfway.y, { steps: 6 });
				await expect(viewer.locator('.rotation-preview')).toHaveCount(1);
				await expect(viewer.locator('.rotation-shape-preview')).toHaveCount(1);
				await expect(shape).toHaveCSS('visibility', 'hidden');
				await expect(shape).toHaveAttribute('transform', before);
				await page.keyboard.press('Escape');
				await page.mouse.up();
				await expect(viewer.locator('.rotation-preview')).toHaveCount(0);
				await expect(viewer.locator('.rotation-shape-preview')).toHaveCount(0);
				await expect(shape).toHaveCSS('visibility', 'visible');
				await expect(shape).toHaveAttribute('data-selected', 'true');
				expect(
					Buffer.from(
						await viewer.evaluate((element) =>
							Array.from(
								(element as unknown as { exportVsdx(): { bytes: Uint8Array } }).exportVsdx().bytes,
							),
						),
					),
				).toEqual(source);
				await expect(shape).toHaveAttribute('transform', before);
				await page.mouse.move(geometry.grip.x, geometry.grip.y);
				await page.mouse.down();
				// Arc samples preserve the direction and a signed angle beyond 180 degrees.
				for (let step = 1; step <= 12; step++) {
					const point = pointer(step / 12);
					await page.mouse.move(point.x, point.y);
				}
				await expect(shape).toHaveAttribute('transform', before);
				const previewPose = (await viewer
					.locator('.rotation-shape-preview > g')
					.getAttribute('transform'))!
					.slice(7, -1)
					.split(/[\s,]+/)
					.map(Number);
				const duringDrag = Buffer.from(
					await viewer.evaluate((element) =>
						Array.from(
							(element as unknown as { exportVsdx(): { bytes: Uint8Array } }).exportVsdx().bytes,
						),
					),
				);
				expect(duringDrag).toEqual(source);
				await page.mouse.up();
				await expect(viewer.locator('.rotation-shape-preview')).toHaveCount(0);
				await expect(shape).not.toHaveAttribute('transform', before);
				const after = (await shape.getAttribute('transform'))!;
				await viewport.focus();
				await viewport.press('Control+z');
				await expect(shape).toHaveAttribute('transform', before);
				await viewport.press('Control+y');
				await expect(shape).toHaveAttribute('transform', after);
				const saved = Buffer.from(
					await viewer.evaluate((element) =>
						Array.from(
							(element as unknown as { exportVsdx(): { bytes: Uint8Array } }).exportVsdx().bytes,
						),
					),
				);
				const model = await parseVsdx(saved),
					actual = model.pages[0]!.shapes.find((shape) => shape.id === reference.shapeId)!;
				const samples = await page.evaluate(
					() =>
						(window as unknown as { rotationSamples: { x: number; y: number }[] }).rotationSamples,
				);
				for (let i = 0; i < 6; i++) expect(previewPose[i]).toBeCloseTo(actual.transform[i]!, 12);
				const [press, release] = samples.slice(-2);
				const bearing = (point: { x: number; y: number }) =>
					Math.atan2(point.y - geometry.pin.y, point.x - geometry.pin.x);
				let observedDelta = bearing(release!) - bearing(press!);
				observedDelta += Math.round((delta - observedDelta) / (2 * Math.PI)) * 2 * Math.PI;
				expect(actual.rotation!.angle).toBeCloseTo(geometry.angle - observedDelta, 12);
				// Chromium delivers float32 pointer coordinates. Bound their native-target angular error.
				const angleError = Math.abs(actual.rotation!.angle - reference.cells.Angle!.value);
				expect(angleError).toBeLessThan(0.000002);
				expect(actual.geometry).toEqual(expected.geometry);
				expect(actual.style).toEqual(expected.style);
				for (let i = 0; i < 6; i++)
					expect(Math.abs(actual.transform[i]! - expected.transform[i]!)).toBeLessThan(
						angleError * (1 + Math.hypot(actual.width, actual.height)) + 1e-12,
					);
				await page.locator('#file').setInputFiles({
					name: 'pointer-rotation.vsdx',
					mimeType: 'application/vnd.ms-visio.drawing',
					buffer: saved,
				});
				await expect(page.locator('#file-name')).toHaveText('pointer-rotation.vsdx');
				await expect(shape).toHaveAttribute('transform', after);
			});
		}
}
