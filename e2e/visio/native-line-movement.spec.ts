import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseVsdx } from 'ooxml-core/visio';
import { downloadCopy, editSelection, history } from './ribbon';
import { nativeSvgLineEndpoints } from './native-line-svg';
import { dragLineEndpoint } from './line-endpoint';
import { openDemo } from './demo-page';

interface NativeEndpointEvidence {
	pageScale?: number;
	drawingScale?: number;
	cases: {
		shapeId: string;
		endpoint: 'Begin' | 'End';
		endpointAfter: Record<string, { value: number }>;
		endpointTransform: number[];
	}[];
}

const directory = process.env.VISIO_NATIVE_LINE_MOVEMENT_DIR;
async function downloadBytes(page: Page): Promise<Buffer> {
	const command = await downloadCopy(page.locator('visio-viewer'));
	const pending = page.waitForEvent('download');
	await command.click();
	const stream = await (await pending).createReadStream();
	const chunks: Buffer[] = [];
	for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
	return Buffer.concat(chunks);
}

const resizeDirectory = process.env.VISIO_NATIVE_LINE_RESIZE_DIR;
const endpointDirectories = [
	'VISIO_NATIVE_LINE_BEGIN_DIR',
	'VISIO_NATIVE_LINE_END_DIR',
	'VISIO_NATIVE_LINE_SCALED_HALF_BEGIN_DIR',
	'VISIO_NATIVE_LINE_SCALED_HALF_END_DIR',
	'VISIO_NATIVE_LINE_SCALED_DOUBLE_BEGIN_DIR',
	'VISIO_NATIVE_LINE_SCALED_DOUBLE_END_DIR',
	'VISIO_NATIVE_LINE_SCALED_TRIPLE_BEGIN_DIR',
	'VISIO_NATIVE_LINE_SCALED_TRIPLE_END_DIR',
];
test('vanilla: endpoint drag cancellation and clicks preserve source bytes and history', async ({
	page,
}) => {
	const directory = process.env.VISIO_NATIVE_LINE_END_DIR;
	test.skip(!directory, 'Set VISIO_NATIVE_LINE_END_DIR to the native capture.');
	await openDemo(page);
	await page.locator('#file').setInputFiles(join(directory!, 'moved.vsdx'));
	await expect(page.locator('#file-name')).toHaveText('moved.vsdx');
	const viewer = page.locator('visio-viewer');
	const line = viewer.locator('[data-shape-id="1"]');
	await line.focus();
	await line.press('Enter');
	const handle = viewer.locator('[data-line-shape-id="1"][data-line-endpoint="end"]');
	await handle.click();
	const origin = (await handle.boundingBox())!;
	await page.mouse.move(origin.x + origin.width / 2, origin.y + origin.height / 2);
	await page.mouse.down();
	await page.mouse.move(origin.x + 50, origin.y + 30);
	await expect(viewer.locator('.endpoint-preview')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(viewer.locator('.endpoint-preview')).toHaveCount(0);
	await page.mouse.up();
	await expect(history(viewer, 'Undo')).toBeDisabled();
	expect(await downloadBytes(page)).toEqual(await readFile(join(directory!, 'moved.vsdx')));
});
for (const variable of endpointDirectories) {
	for (const framework of ['vanilla', 'react', 'vue', 'angular', 'svelte', 'solid']) {
		test(`${framework}: native endpoint canvas drag supports history and saved copies (${variable})`, async ({
			page,
		}) => {
			const directory = process.env[variable];
			test.skip(!directory, `Set ${variable} to the native endpoint capture.`);
			const evidence = JSON.parse(
				(await readFile(join(directory!, 'evidence.json'), 'utf8')).replace(/^\uFEFF/, ''),
			) as NativeEndpointEvidence;
			await openDemo(
				page,
				framework === 'vanilla' ? '/demo/?sample=1' : `/demo-${framework}/?sample=1`,
			);
			await page.locator('#file').setInputFiles(join(directory!, 'moved.vsdx'));
			await expect(page.locator('#file-name')).toHaveText('moved.vsdx');
			const native = await parseVsdx(await readFile(join(directory!, 'endpoint.vsdx')));
			const nativeSvg = variable.includes('SCALED')
				? await nativeSvgLineEndpoints(
						page,
						await readFile(join(directory!, 'endpoint-page.svg'), 'utf8'),
					)
				: undefined;
			if (nativeSvg) {
				expect(native.pages[0]!.width).toBeCloseTo(nativeSvg.width, 12);
				expect(native.pages[0]!.height).toBeCloseTo(nativeSvg.height, 12);
				expect(nativeSvg.lines).toHaveLength(4);
			}
			const viewer = page.locator('visio-viewer');
			for (const item of evidence.cases) {
				const { line, handle, before, after } = await dragLineEndpoint(
					page,
					item.shapeId,
					item.endpoint === 'Begin' ? 'begin' : 'end',
					item.endpointAfter[`${item.endpoint}X`]!.value,
					item.endpointAfter[`${item.endpoint}Y`]!.value,
				);
				const pose = after
					.slice('matrix('.length, -1)
					.trim()
					.split(/[\s,]+/)
					.map(Number);
				const expectedPose = native.pages[0]!.shapes.find(
					(shape) => shape.id === item.shapeId,
				)!.transform;
				for (let i = 0; i < 6; i++) expect(pose[i]).toBeCloseTo(expectedPose[i]!, 4);
				await history(viewer, 'Undo').click();
				await expect(line).toHaveAttribute('transform', before);
				await history(viewer, 'Redo').click();
				await expect(line).toHaveAttribute('transform', after);
				await expect(handle).toBeVisible();
			}
			const bytes = await downloadBytes(page);
			const actual = await parseVsdx(bytes);
			for (const shape of actual.pages[0]!.shapes) {
				const expected = native.pages[0]!.shapes.find((item) => item.id === shape.id)!;
				for (let i = 0; i < 6; i++)
					expect(shape.transform[i]).toBeCloseTo(expected.transform[i]!, 4);
				expect(shape.width).toBeCloseTo(expected.width, 4);
				expect(shape.style).toEqual(expected.style);
				const svgLine = nativeSvg?.lines.find((line) => line.id === shape.id);
				if (svgLine) {
					const [a, b, , , x, y] = shape.transform;
					expect(x).toBeCloseTo(svgLine.begin.x, 3);
					expect(y).toBeCloseTo(svgLine.begin.y, 3);
					expect(x + a * shape.width).toBeCloseTo(svgLine.end.x, 3);
					expect(y + b * shape.width).toBeCloseTo(svgLine.end.y, 3);
				}
			}
			await page.locator('#file').setInputFiles({
				name: 'core-dragged.vsdx',
				mimeType: 'application/vnd.ms-visio.drawing',
				buffer: bytes,
			});
			await expect(page.locator('#file-name')).toHaveText('core-dragged.vsdx');
			await expect(viewer.locator('[data-shape-id]')).toHaveCount(4);
		});
	}
}
for (const variable of endpointDirectories) {
	for (const framework of ['vanilla', 'react', 'vue', 'angular', 'svelte', 'solid']) {
		test(`${framework}: native endpoint API supports history and saved copies (${variable})`, async ({
			page,
		}) => {
			const directory = process.env[variable];
			test.skip(!directory, `Set ${variable} to the native endpoint capture.`);
			const evidence = JSON.parse(
				(await readFile(join(directory!, 'evidence.json'), 'utf8')).replace(/^\uFEFF/, ''),
			) as NativeEndpointEvidence;
			await openDemo(
				page,
				framework === 'vanilla' ? '/demo/?sample=1' : `/demo-${framework}/?sample=1`,
			);
			await page.locator('#file').setInputFiles(join(directory!, 'moved.vsdx'));
			await expect(page.locator('#file-name')).toHaveText('moved.vsdx');
			const viewer = page.locator('visio-viewer');
			for (const item of evidence.cases) {
				const line = viewer.locator(`[data-shape-id="${item.shapeId}"]`);
				const before = (await line.getAttribute('transform'))!;
				await viewer.evaluate(async (node, item) => {
					const element = node as unknown as {
						document: import('ooxml-core/visio').VisioDocument;
						applyEdits(edits: import('ooxml-core/visio').VisioEdit[]): Promise<void>;
					};
					await element.applyEdits([
						{
							type: 'move-line-endpoint',
							pageId: element.document.pages[0]!.id,
							shapeId: item.shapeId,
							endpoint: item.endpoint === 'Begin' ? 'begin' : 'end',
							x: item.endpointAfter[`${item.endpoint}X`]!.value,
							y: item.endpointAfter[`${item.endpoint}Y`]!.value,
						},
					]);
				}, item);
				const after = (await line.getAttribute('transform'))!;
				const pose = after
					.slice('matrix('.length, -1)
					.trim()
					.split(/[\s,]+/)
					.map(Number);
				expect(pose).toHaveLength(6);
				for (let i = 0; i < 6; i++)
					expect(pose[i]).toBeCloseTo(
						item.endpointTransform[i]! *
							(i >= 4 ? (evidence.pageScale ?? 1) / (evidence.drawingScale ?? 1) : 1),
						12,
					);
				await history(viewer, 'Undo').click();
				await expect(line).toHaveAttribute('transform', before);
				await history(viewer, 'Redo').click();
				await expect(line).toHaveAttribute('transform', after);
			}
			const bytes = await downloadBytes(page);
			const actual = await parseVsdx(bytes),
				native = await parseVsdx(await readFile(join(directory!, 'endpoint.vsdx')));
			for (const shape of actual.pages[0]!.shapes) {
				const expected = native.pages[0]!.shapes.find((item) => item.id === shape.id)!;
				for (let i = 0; i < 6; i++)
					expect(shape.transform[i]).toBeCloseTo(expected.transform[i]!, 12);
				expect(shape.width).toBeCloseTo(expected.width, 12);
				expect(shape.geometry).toEqual(expected.geometry);
				expect(shape.style).toEqual(expected.style);
			}
			await page.locator('#file').setInputFiles({
				name: 'core-endpoint.vsdx',
				mimeType: 'application/vnd.ms-visio.drawing',
				buffer: bytes,
			});
			await expect(page.locator('#file-name')).toHaveText('core-endpoint.vsdx');
			await expect(viewer.locator('[data-shape-id]')).toHaveCount(4);
		});
	}
}
for (const framework of ['vanilla', 'react', 'vue', 'angular', 'svelte', 'solid']) {
	test(`${framework}: native Width-cell resize preserves endpoints and supports history and saved copies`, async ({
		page,
	}) => {
		test.skip(!resizeDirectory, 'Set VISIO_NATIVE_LINE_RESIZE_DIR to the native resize capture.');
		const evidence = JSON.parse(
			await readFile(join(resizeDirectory!, 'evidence.json'), 'utf8'),
		) as {
			cases: {
				shapeId: string;
				resized: Record<string, { value: number }>;
				resizedTransform: number[];
			}[];
		};
		const native = await parseVsdx(await readFile(join(resizeDirectory!, 'resized.vsdx')));
		await openDemo(
			page,
			framework === 'vanilla' ? '/demo/?sample=1' : `/demo-${framework}/?sample=1`,
		);
		await page.locator('#file').setInputFiles(join(resizeDirectory!, 'moved.vsdx'));
		await expect(page.locator('#file-name')).toHaveText('moved.vsdx');
		const viewer = page.locator('visio-viewer');
		for (const item of evidence.cases) {
			const line = viewer.locator(`[data-shape-id="${item.shapeId}"]`);
			await line.focus();
			await line.press('Enter');
			await expect(line).toHaveAttribute('data-selected', 'true');
			const before = (await line.getAttribute('transform'))!;
			await editSelection(viewer, {
				type: 'resize-shape',
				width: item.resized.Width!.value,
				height: 0,
			});
			const pose = await line.evaluate((node) => {
				// SVGMatrix getters round to float32. Compare the emitted double-precision pose.
				const source = /^matrix\(([^)]+)\)$/.exec(node.getAttribute('transform') ?? '');
				if (!source) throw new Error('Missing serialized shape matrix.');
				return source[1]!
					.trim()
					.split(/[\s,]+/)
					.map(Number);
			});
			expect(pose).toHaveLength(6);
			for (let i = 0; i < 6; i++) expect(pose[i]).toBeCloseTo(item.resizedTransform[i]!, 12);
			const after = (await line.getAttribute('transform'))!;
			await history(viewer, 'Undo').click();
			await expect(line).toHaveAttribute('transform', before);
			await history(viewer, 'Redo').click();
			await expect(line).toHaveAttribute('transform', after);
		}
		const bytes = await downloadBytes(page);
		const result = await parseVsdx(bytes);
		expect(result.pages[0]!.shapes).toEqual(native.pages[0]!.shapes);
		await page.locator('#file').setInputFiles({
			name: 'core-resized.vsdx',
			mimeType: 'application/vnd.ms-visio.drawing',
			buffer: bytes,
		});
		await expect(page.locator('#file-name')).toHaveText('core-resized.vsdx');
		await expect(viewer.locator('[data-shape-id]')).toHaveCount(4);
	});
}
for (const framework of ['vanilla', 'react', 'vue', 'angular', 'svelte', 'solid']) {
	test(`${framework}: native lines move, undo, redo, download and reload through the shared editor`, async ({
		page,
	}) => {
		test.skip(!directory, 'Set VISIO_NATIVE_LINE_MOVEMENT_DIR to the native line capture.');
		const evidence = JSON.parse(await readFile(join(directory!, 'evidence.json'), 'utf8')) as {
			cases: { shapeId: string; after: Record<string, { value: number }> }[];
		};
		const nativeMoved = await parseVsdx(await readFile(join(directory!, 'moved.vsdx')));
		await openDemo(
			page,
			framework === 'vanilla' ? '/demo/?sample=1' : `/demo-${framework}/?sample=1`,
		);
		await page.locator('#file').setInputFiles(join(directory!, 'original.vsdx'));
		await expect(page.locator('#file-name')).toHaveText('original.vsdx');
		const viewer = page.locator('visio-viewer');
		const transforms = new Map<string, string>();
		for (const item of evidence.cases) {
			const line = viewer.locator(`[data-shape-id="${item.shapeId}"]`);
			await line.focus();
			await line.press('Enter');
			await expect(line).toHaveAttribute('data-selected', 'true');
			const original = (await line.getAttribute('transform'))!;
			await editSelection(viewer, {
				type: 'move-shape',
				x: item.after.PinX!.value,
				y: item.after.PinY!.value,
			});
			await expect(line).not.toHaveAttribute('transform', original);
			const moved = (await line.getAttribute('transform'))!;
			await history(viewer, 'Undo').click();
			await expect(line).toHaveAttribute('transform', original);
			await history(viewer, 'Redo').click();
			await expect(line).toHaveAttribute('transform', moved);
			transforms.set(item.shapeId, moved);
		}
		const bytes = await downloadBytes(page);
		const saved = await parseVsdx(bytes);
		expect(saved.pages[0]!.shapes).toHaveLength(4);
		for (const actual of saved.pages[0]!.shapes) {
			const expected = nativeMoved.pages[0]!.shapes.find((shape) => shape.id === actual.id)!;
			for (let i = 0; i < 6; i++)
				expect(actual.transform[i]).toBeCloseTo(expected.transform[i]!, 12);
			expect(actual.width).toBeCloseTo(expected.width, 12);
			expect(actual.height).toBe(expected.height);
			expect(actual.geometry).toEqual(expected.geometry);
			expect(actual.style).toEqual(expected.style);
		}
		await page.locator('#file').setInputFiles({
			name: 'core-moved.vsdx',
			mimeType: 'application/vnd.ms-visio.drawing',
			buffer: bytes,
		});
		await expect(page.locator('#file-name')).toHaveText('core-moved.vsdx');
		for (const [id, transform] of transforms)
			await expect(viewer.locator(`[data-shape-id="${id}"]`)).toHaveAttribute(
				'transform',
				transform,
			);
	});
}

const deletionDirectory = process.env.VISIO_NATIVE_LINE_DELETION_DIR;
for (const framework of ['vanilla', 'react', 'vue', 'angular', 'svelte', 'solid']) {
	test(`${framework}: native line deletion supports undo, redo, download and reload`, async ({
		page,
	}) => {
		test.skip(
			!deletionDirectory,
			'Set VISIO_NATIVE_LINE_DELETION_DIR to the native deletion capture.',
		);
		const evidence = JSON.parse(
			await readFile(join(deletionDirectory!, 'evidence.json'), 'utf8'),
		) as {
			deletedShapeIds: string[];
			controlShapeId: string;
		};
		const native = await parseVsdx(await readFile(join(deletionDirectory!, 'deleted.vsdx')));
		await openDemo(
			page,
			framework === 'vanilla' ? '/demo/?sample=1' : `/demo-${framework}/?sample=1`,
		);
		await page.locator('#file').setInputFiles(join(deletionDirectory!, 'original.vsdx'));
		await expect(page.locator('#file-name')).toHaveText('original.vsdx');
		const viewer = page.locator('visio-viewer');
		await expect(viewer.locator('[data-shape-id]')).toHaveCount(5);
		for (const id of evidence.deletedShapeIds) {
			const line = viewer.locator(`[data-shape-id="${id}"]`);
			await line.focus();
			await line.press('Enter');
			await expect(line).toHaveAttribute('data-selected', 'true');
			const transform = (await line.getAttribute('transform'))!;
			await editSelection(viewer, { type: 'delete-shape' });
			await expect(line).toHaveCount(0);
			await history(viewer, 'Undo').click();
			await expect(line).toHaveAttribute('transform', transform);
			await history(viewer, 'Redo').click();
			await expect(line).toHaveCount(0);
		}
		await expect(viewer.locator('[data-shape-id]')).toHaveCount(1);
		const control = viewer.locator(`[data-shape-id="${evidence.controlShapeId}"]`);
		const transform = (await control.getAttribute('transform'))!;
		const bytes = await downloadBytes(page);
		const result = await parseVsdx(bytes);
		expect(result.pages[0]!.shapes).toEqual(native.pages[0]!.shapes);
		await page.locator('#file').setInputFiles({
			name: 'core-deleted.vsdx',
			mimeType: 'application/vnd.ms-visio.drawing',
			buffer: bytes,
		});
		await expect(page.locator('#file-name')).toHaveText('core-deleted.vsdx');
		await expect(viewer.locator('[data-shape-id]')).toHaveCount(1);
		await expect(control).toHaveAttribute('transform', transform);
	});
}
