import { expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseVsdx, type VisioDocument } from 'ooxml-core/visio';
import { visioStraightLineHandles } from 'ooxml-core/visio/ui';
import { dragLineEndpoint } from './line-endpoint';
import { history } from './ribbon';

interface GradientEditSample {
	shapeId: string;
	kind: string;
	nativeShapeWidth?: number;
	endpointEdit?: { endpoint: 'begin' | 'end'; x: number; y: number } | null;
}

/** Shared native paint benchmark setup, including edit/history/save/reload evidence. */
export async function prepareNativeGradientEdit(
	page: Page,
	directory: string,
	samples: GradientEditSample[],
	resizeSourceDirectory: string | undefined,
	pointerEditing: boolean,
): Promise<void> {
	const endpointEditing = samples.some((item) => item.endpointEdit);
	if (pointerEditing)
		expect(endpointEditing, 'Pointer mode requires native endpoint targets.').toBe(true);
	const filename = endpointEditing ? 'gradient-raster-before.vsdx' : 'gradient-raster.vsdx';
	await page.locator('#file').setInputFiles(join(resizeSourceDirectory ?? directory!, filename));
	await expect(page.locator('#file-name')).toHaveText(filename);
	if (pointerEditing) {
		const viewer = page.locator('visio-viewer');
		for (const item of samples) {
			const edit = item.endpointEdit!;
			const { line, handle, before, after } = await dragLineEndpoint(
				page,
				item.shapeId,
				edit.endpoint,
				edit.x,
				edit.y,
			);
			await history(viewer, 'Undo').click();
			await expect(line).toHaveAttribute('transform', before);
			await history(viewer, 'Redo').click();
			await expect(line).toHaveAttribute('transform', after);
			await expect(handle).toBeVisible();
		}
	} else if (resizeSourceDirectory || endpointEditing)
		await page.evaluate(async (samples) => {
			const viewer = document.querySelector('visio-viewer') as unknown as {
				document: VisioDocument;
				applyEdits(edits: import('ooxml-core/visio').VisioEdit[]): Promise<void>;
				undo(): Promise<void>;
				redo(): Promise<void>;
			};
			const before = JSON.stringify(viewer.document.pages);
			await viewer.applyEdits(
				samples.map((item) => {
					if (item.endpointEdit)
						return {
							type: 'move-line-endpoint',
							pageId: viewer.document.pages[0]!.id,
							shapeId: item.shapeId,
							...item.endpointEdit,
						};
					if (item.kind !== 'line' || !item.nativeShapeWidth)
						throw new Error('Width-cell comparison requires native line sizes.');
					return {
						type: 'resize-shape',
						pageId: viewer.document.pages[0]!.id,
						shapeId: item.shapeId,
						width: item.nativeShapeWidth,
						height: 0,
					};
				}),
			);
			if (samples.some((item) => item.endpointEdit)) {
				const after = JSON.stringify(viewer.document.pages);
				if (after === before) throw new Error('Endpoint edits did not change the drawing.');
				await viewer.undo();
				if (JSON.stringify(viewer.document.pages) !== before)
					throw new Error('Undo did not restore the original gradient drawing.');
				await viewer.redo();
				if (JSON.stringify(viewer.document.pages) !== after)
					throw new Error('Redo did not restore the endpoint gradient edit.');
			}
		}, samples);
	if (endpointEditing) {
		const bytes = Buffer.from(
			await page.evaluate(() =>
				Array.from(
					(
						document.querySelector('visio-viewer') as unknown as {
							exportVsdx(): { bytes: Uint8Array };
						}
					).exportVsdx().bytes,
				),
			),
		);
		const actual = await parseVsdx(bytes);
		const native = await parseVsdx(await readFile(join(directory!, 'gradient-raster.vsdx')));
		expect(actual.pages[0]!.shapes).toHaveLength(native.pages[0]!.shapes.length);
		for (const shape of actual.pages[0]!.shapes) {
			const expected = native.pages[0]!.shapes.find((item) => item.id === shape.id)!;
			for (let i = 0; i < 6; i++)
				expect(shape.transform[i]).toBeCloseTo(expected.transform[i]!, pointerEditing ? 4 : 12);
			expect(shape.width).toBeCloseTo(expected.width, pointerEditing ? 4 : 12);
			if (pointerEditing && shape.kind === 'connector') {
				expect(visioStraightLineHandles(shape)).toBe(true);
				expect(visioStraightLineHandles(expected)).toBe(true);
				const { lineGradient: actualPaint, ...actualStyle } = shape.style;
				const { lineGradient: nativePaint, ...nativeStyle } = expected.style;
				expect(actualStyle).toEqual(nativeStyle);
				if (actualPaint?.type !== 'linear' || nativePaint?.type !== 'linear')
					throw new Error('Native endpoint capture requires linear gradient paint.');
				const { start: actualStart, end: actualEnd, ...actualStops } = actualPaint;
				const { start: nativeStart, end: nativeEnd, ...nativeStops } = nativePaint;
				expect(actualStops).toEqual(nativeStops);
				for (let i = 0; i < 2; i++) {
					expect(actualStart[i]).toBeCloseTo(nativeStart[i]!, 4);
					expect(actualEnd[i]).toBeCloseTo(nativeEnd[i]!, 4);
				}
			} else {
				expect(shape.geometry).toEqual(expected.geometry);
				expect(shape.style).toEqual(expected.style);
			}
		}
		await page.locator('#file').setInputFiles({
			name: 'endpoint-gradient.vsdx',
			mimeType: 'application/vnd.ms-visio.drawing',
			buffer: bytes,
		});
		await expect(page.locator('#file-name')).toHaveText('endpoint-gradient.vsdx');
	}
}
