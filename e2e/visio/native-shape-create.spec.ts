import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { editVsdx, parseVsdx } from 'ooxml-core/visio';
import { nativeSvgLineEndpoints } from './native-line-svg';
import { openDemo } from './demo-page';
import { editSelection } from './ribbon';

for (const variable of [
	'VISIO_NATIVE_DRAW_DEFAULTS_DIR',
	'VISIO_NATIVE_DRAW_CUSTOM_DEFAULTS_DIR',
	'VISIO_NATIVE_DRAW_HALF_DIR',
	'VISIO_NATIVE_DRAW_DOUBLE_DIR',
	'VISIO_NATIVE_DRAW_TRIPLE_DIR',
]) {
	const directory = process.env[variable];
	for (const kind of ['rectangle', 'ellipse'] as const) {
		for (const framework of ['vanilla', 'react', 'vue', 'angular', 'svelte', 'solid']) {
			test(`${framework}: draws native ${kind} with native defaults and saved history (${variable})`, async ({
				page,
			}) => {
				test.skip(
					!directory,
					`Set ${variable} to a native IncludeRectangle/IncludeEllipse capture.`,
				);
				const bytes = await readFile(join(directory!, 'original.vsdx'));
				const native = await parseVsdx(bytes);
				const evidence = JSON.parse(await readFile(join(directory!, 'evidence.json'), 'utf8')) as {
					[kind: string]: {
						shapeId: string;
						transform: number[];
						editedCells: Record<string, { value: number }>;
						editedTransform: number[];
						cells: Record<string, { value: number }>;
					};
				};
				const target = evidence[kind]!;
				const ratio = native.pages[0]!.drawingToPageScale ?? 1;
				const expected = native.pages[0]!.shapes.find((shape) => shape.id === target.shapeId)!;
				const cleared = await editVsdx(
					bytes,
					native.pages[0]!.shapes.filter((shape) => Number(shape.id) >= Number(target.shapeId)).map(
						(shape) => ({
							type: 'delete-shape' as const,
							pageId: native.pages[0]!.id,
							shapeId: shape.id,
						}),
					),
				);
				await openDemo(
					page,
					framework === 'vanilla' ? '/demo/?sample=1' : `/demo-${framework}/?sample=1`,
				);
				await page.locator('#file').setInputFiles({
					name: 'native-defaults.vsdx',
					mimeType: 'application/vnd.ms-visio.drawing',
					buffer: Buffer.from(cleared.bytes),
				});
				await expect(page.locator('#file-name')).toHaveText('native-defaults.vsdx');
				const viewer = page.locator('visio-viewer'),
					viewport = viewer.locator('.viewport');
				const reference = await nativeSvgLineEndpoints(
					page,
					await readFile(join(directory!, 'original-page.svg'), 'utf8'),
				);
				expect(native.pages[0]!.width).toBeCloseTo(reference.width, 12);
				expect(native.pages[0]!.height).toBeCloseTo(reference.height, 12);
				const paint = reference.lines.find((shape) => shape.id === target.shapeId)!.paint;
				await viewport.focus();
				await viewport.press('Control+Shift+w');
				await viewport.press(kind === 'ellipse' ? 'Control+9' : 'Control+8');
				await expect(viewport).toHaveAttribute('data-tool', kind);
				const points = await viewer.evaluate(
					(element, { cells, ratio }) => {
						const model = (
							element as unknown as { document: import('ooxml-core/visio').VisioDocument }
						).document.pages[0]!;
						const matrix = (element as HTMLElement)
							.shadowRoot!.querySelector<SVGSVGElement>('svg.paper')!
							.getScreenCTM()!;
						return [-1, 1].map((sign) => {
							const point = new DOMPoint(
								(cells.PinX!.value + (sign * cells.Width!.value) / 2) * ratio,
								model.height - (cells.PinY!.value + (sign * cells.Height!.value) / 2) * ratio,
							).matrixTransform(matrix);
							return { x: point.x, y: point.y };
						});
					},
					{ cells: target.cells, ratio },
				);
				await page.mouse.move(points[0]!.x, points[0]!.y);
				await page.mouse.down();
				await page.mouse.move(points[1]!.x, points[1]!.y, { steps: 4 });
				await expect(
					viewer.locator(`${kind === 'ellipse' ? 'ellipse' : 'rect'}.draw-preview`),
				).toHaveCount(1);
				await page.mouse.up();
				const created = viewer.locator(`[data-shape-id="${target.shapeId}"]`);
				await expect(created).toBeVisible();
				const bounds = await created
					.locator('path')
					.first()
					.evaluate((path) => {
						const box = (path as SVGGraphicsElement).getBBox();
						return { width: box.width, height: box.height };
					});
				const nativeBounds = reference.lines.find((shape) => shape.id === target.shapeId)!.bounds;
				expect(bounds.width).toBeCloseTo(nativeBounds.width, 3);
				expect(bounds.height).toBeCloseTo(nativeBounds.height, 3);
				await viewport.press('Escape');
				await viewer.locator('svg.paper').click({ position: { x: 5, y: 5 } });
				await viewport.focus();
				expect(
					await created
						.locator('path')
						.first()
						.evaluate((path) => {
							const style = getComputedStyle(path);
							return {
								fill: style.fill,
								stroke: style.stroke,
								fillOpacity: style.fillOpacity,
								strokeOpacity: style.strokeOpacity,
							};
						}),
				).toEqual(paint);
				await viewport.focus();
				await viewport.press('Control+z');
				await expect(created).toHaveCount(0);
				await viewport.press('Control+y');
				await expect(created).toBeVisible();
				const saved = Buffer.from(
					await viewer.evaluate((element) =>
						Array.from(
							(element as unknown as { exportVsdx(): { bytes: Uint8Array } }).exportVsdx().bytes,
						),
					),
				);
				const model = await parseVsdx(saved);
				const actual = model.pages[0]!.shapes.find((shape) => shape.id === target.shapeId)!;
				expect(model.pages[0]!.drawingToPageScale ?? 1).toBe(ratio);
				expect(actual.style).toEqual(expected.style);
				expect(actual.geometry).toEqual(expected.geometry);
				for (let i = 0; i < 6; i++)
					expect(actual.transform[i]).toBeCloseTo(target.transform[i]! * (i >= 4 ? ratio : 1), 12);
				await page.locator('#file').setInputFiles({
					name: 'drawn-defaults.vsdx',
					mimeType: 'application/vnd.ms-visio.drawing',
					buffer: saved,
				});
				await expect(page.locator('#file-name')).toHaveText('drawn-defaults.vsdx');
				await expect(created).toBeVisible();
				expect(
					await created
						.locator('path')
						.first()
						.evaluate((path) => {
							const style = getComputedStyle(path);
							return {
								fill: style.fill,
								stroke: style.stroke,
								fillOpacity: style.fillOpacity,
								strokeOpacity: style.strokeOpacity,
							};
						}),
				).toEqual(paint);
				if (kind === 'ellipse') {
					const beforeResize = (await created.getAttribute('transform'))!;
					await created.focus();
					await created.press('Enter');
					await editSelection(viewer, {
						type: 'resize-shape',
						width: target.editedCells.Width!.value,
						height: target.editedCells.Height!.value,
					});
					await expect(created).not.toHaveAttribute('transform', beforeResize);
					const beforeMove = (await created.getAttribute('transform'))!;
					await editSelection(viewer, {
						type: 'move-shape',
						x: target.editedCells.PinX!.value,
						y: target.editedCells.PinY!.value,
					});
					await expect(created).not.toHaveAttribute('transform', beforeMove);
					const afterMove = (await created.getAttribute('transform'))!;
					await viewport.focus();
					await viewport.press('Control+z');
					await expect(created).toHaveAttribute('transform', beforeMove);
					await viewport.press('Control+z');
					await expect(created).toHaveAttribute('transform', beforeResize);
					await viewport.press('Control+y');
					await expect(created).toHaveAttribute('transform', beforeMove);
					await viewport.press('Control+y');
					await expect(created).toHaveAttribute('transform', afterMove);
					const edited = Buffer.from(
						await viewer.evaluate((element) =>
							Array.from(
								(element as unknown as { exportVsdx(): { bytes: Uint8Array } }).exportVsdx().bytes,
							),
						),
					);
					const finalModel = await parseVsdx(edited),
						nativeEdited = await parseVsdx(await readFile(join(directory!, 'ellipse-edited.vsdx')));
					const actual = finalModel.pages[0]!.shapes.find((shape) => shape.id === target.shapeId)!;
					const expected = nativeEdited.pages[0]!.shapes.find(
						(shape) => shape.id === target.shapeId,
					)!;
					expect(actual.geometry).toEqual(expected.geometry);
					expect(actual.style).toEqual(expected.style);
					for (let i = 0; i < 6; i++)
						expect(actual.transform[i]).toBeCloseTo(
							target.editedTransform[i]! * (i >= 4 ? ratio : 1),
							12,
						);
					await page.locator('#file').setInputFiles({
						name: 'edited-ellipse.vsdx',
						mimeType: 'application/vnd.ms-visio.drawing',
						buffer: edited,
					});
					await expect(page.locator('#file-name')).toHaveText('edited-ellipse.vsdx');
					await expect(created).toHaveAttribute('transform', afterMove);
				}
			});
		}
	}
}
