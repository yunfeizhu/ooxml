import { test, expect } from '@playwright/test';
import { openDemo } from './demo-page';

test('live, SVG export and print render the same cropped, upright foreign vector pixels', async ({
	page,
}) => {
	await openDemo(page);
	const result = await page.evaluate(async () => {
		const load = (path: string) => import(/* @vite-ignore */ path);
		const { demoDocument, renderPage, exportPageSvg, createPrintSnapshot } =
			await load('/test-api.js');
		const model = structuredClone(demoDocument),
			shape = model.pages[0].shapes[0];
		model.pages = [model.pages[0]];
		model.pages[0].width = model.pages[0].height = 4;
		model.pages[0].shapes = [shape];
		shape.kind = 'foreign';
		shape.geometry = [];
		shape.text.plainText = '';
		shape.text.runs = [];
		shape.width = shape.height = 2;
		shape.transform = [1, 0, 0, 1, 1, 1];
		const matrix = [1, 0, 0, 1, 0, 0];
		shape.foreignVector = {
			x: -0.5,
			y: 0.25,
			width: 3,
			height: 2,
			opacity: 1,
			vector: {
				kind: 'vector',
				width: 30,
				height: 20,
				clips: [
					{
						matrix,
						items: [
							{
								matrix,
								clipRule: 'nonzero',
								commands: [
									{ command: 'M', values: [0, 0] },
									{ command: 'L', values: [15, 0] },
									{ command: 'L', values: [15, 20] },
									{ command: 'L', values: [0, 20] },
									{ command: 'Z', values: [] },
								],
							},
						],
					},
				],
				items: [
					{
						kind: 'path',
						matrix,
						clipIndex: 0,
						commands: [
							{ command: 'M', values: [0, 0] },
							{ command: 'L', values: [30, 0] },
							{ command: 'L', values: [0, 20] },
							{ command: 'Z', values: [] },
						],
						paint: {
							fill: '#ff0000',
							stroke: 'none',
							fillRule: 'nonzero',
							strokeWidth: 1,
							strokeMiterlimit: 4,
							strokeLinecap: 'butt',
							strokeLinejoin: 'miter',
							opacity: 1,
							fillOpacity: 1,
							strokeOpacity: 1,
						},
					},
				],
			},
		};
		const live = renderPage(model, model.pages[0]);
		live.svg.setAttribute('width', '400');
		live.svg.setAttribute('height', '400');
		document.body.append(live.svg);
		const sources = [
			new XMLSerializer().serializeToString(live.svg),
			exportPageSvg(model).svg,
			createPrintSnapshot(model, { pageIndices: [0] }).pages[0].svg,
		];
		const pixels: Uint8ClampedArray[] = [];
		for (const source of sources) {
			const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }));
			try {
				const image = new Image();
				image.src = url;
				await image.decode();
				const canvas = document.createElement('canvas');
				canvas.width = canvas.height = 400;
				const ctx = canvas.getContext('2d')!;
				ctx.drawImage(image, 0, 0, 400, 400);
				pixels.push(ctx.getImageData(0, 0, 400, 400).data);
			} finally {
				URL.revokeObjectURL(url);
			}
		}
		const sample = (x: number, y: number) => [
			...pixels[0]!.slice((y * 400 + x) * 4, (y * 400 + x) * 4 + 4),
		];
		live.dispose();
		live.svg.remove();
		return {
			match: pixels
				.slice(1)
				.every((data) => data.every((value, index) => value === pixels[0]![index])),
			red: [sample(110, 110), sample(110, 230)],
			clear: [
				sample(110, 90),
				sample(80, 130),
				sample(210, 120),
				sample(190, 230),
				sample(110, 260),
			],
			warnings: live.warnings,
		};
	});
	expect(result.match).toBe(true);
	expect(result.red).toEqual([
		[255, 0, 0, 255],
		[255, 0, 0, 255],
	]);
	expect(result.clear).toEqual(Array.from({ length: 5 }, () => [0, 0, 0, 0]));
	expect(result.warnings).toEqual([]);
});
