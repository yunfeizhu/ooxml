import { expect, test } from '@playwright/test';
import native from '../../src/core/chart/excel-chart-title-spacing.json' with { type: 'json' };
import { loadXlsx, chartView } from 'ooxml-core/xlsx';
import { FRAMEWORKS, editor, openLanding, pageErrors } from './helpers';
import { nativeChartFixture } from './native-chart-fixture';

for (const framework of FRAMEWORKS)
	for (const sample of native.cases)
		test(`native title paragraph spacing ${sample.referenceName} survives a type edit in ${framework}`, async ({
			page,
		}) => {
			const errors = pageErrors(page);
			await openLanding(page, framework);
			const name = `${sample.referenceName}.xlsx`;
			const buffer = await nativeChartFixture(sample.parts, 'Aptos Narrow');
			const original = await loadXlsx(buffer);
			const source = original.sheets[0]!.drawings[0]!;
			if (source.kind !== 'chart') throw new Error('Missing source chart');
			const expected = chartView(original, 0, source, () => []).titleText!;
			await page.locator('#landing-file').setInputFiles({
				name,
				mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				buffer,
			});
			const host = editor(page);
			await expect(host.getByText(name, { exact: true })).toBeVisible();
			const spans = host.locator('.xg-chart svg tspan[data-chart-title-run]');
			const verify = async () => {
				await expect(spans.first()).toHaveAttribute('font-size', '24');
				await expect(spans.first()).toHaveAttribute('fill', '#FF0000');
				if (!sample.referenceName.includes('single'))
					await expect(spans.last()).toHaveAttribute('fill', '#008000');
				await expect
					.poll(() =>
						spans.evaluateAll((nodes, paragraph) => {
							const style = getComputedStyle(nodes[0]!);
							const context = document.createElement('canvas').getContext('2d')!;
							context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
							const metrics = context.measureText('Mg');
							const natural = metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent;
							const resolve = (value: typeof paragraph.lineSpacing, fallback: number) =>
								value
									? value.unit === 'points'
										? (value.value * 4) / 3
										: value.value * natural
									: fallback;
							const pitch = resolve(paragraph.lineSpacing, natural);
							const before = resolve(paragraph.spaceBefore, 0);
							const after = resolve(paragraph.spaceAfter, 0);
							const firstY = Number(nodes[0]!.getAttribute('y'));
							const error = Math.abs(
								firstY - (8 + parseFloat(style.fontSize) + before + (pitch - natural) / 2),
							);
							return nodes.length < 2
								? error
								: Math.max(
										error,
										Math.abs(
											Number(nodes.at(-1)!.getAttribute('y')) - firstY - pitch - before - after,
										),
									);
						}, expected.paragraphs[0]!),
					)
					.toBeLessThan(0.05);
			};
			await verify();
			await host
				.locator('rect[data-chart-part="chartArea"]')
				.first()
				.click({ position: { x: 20, y: 20 } });
			await host.getByRole('tab', { name: 'Chart Design', exact: true }).click();
			await host.getByRole('button', { name: 'Change Chart Type', exact: true }).click();
			await page.getByRole('button', { name: 'Line', exact: true }).click();
			await page.getByRole('button', { name: 'OK', exact: true }).click();
			await verify();
			const bytes = await host.evaluate(async (node) =>
				Array.from(await (node as unknown as { saveBytes(): Promise<Uint8Array> }).saveBytes()),
			);
			const saved = await loadXlsx(Uint8Array.from(bytes));
			const chart = saved.sheets[0]!.drawings[0]!;
			if (chart.kind !== 'chart') throw new Error('Missing saved chart');
			expect(chart.chartType).toBe('line');
			expect(chartView(saved, 0, chart, () => []).titleText).toEqual(expected);
			expect(errors).toEqual([]);
		});
