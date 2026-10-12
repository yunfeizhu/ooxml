import { expect, test } from '@playwright/test';
import native from '../../src/core/chart/excel-chart-legend-layout.json' with { type: 'json' };
import { loadXlsx, chartView } from 'ooxml-core/xlsx';
import { FRAMEWORKS, editor, openLanding, pageErrors } from './helpers';
import { nativeChartFixture } from './native-chart-fixture';

for (const framework of FRAMEWORKS)
	for (const sample of native.cases)
		test(`native legend layout ${sample.referenceName} survives a type edit in ${framework}`, async ({
			page,
		}) => {
			const errors = pageErrors(page);
			await openLanding(page, framework);
			const buffer = await nativeChartFixture(sample.parts, 'Aptos Narrow', 'Aptos Display', {
				width: (sample.layoutGeometry.chart.widthPt * 4) / 3,
				height: (sample.layoutGeometry.chart.heightPt * 4) / 3,
			});
			const original = await loadXlsx(buffer);
			const source = original.sheets[0]!.drawings[0]!;
			if (source.kind !== 'chart') throw new Error('Missing source chart');
			const expected = chartView(original, 0, source, () => []);
			await page.locator('#landing-file').setInputFiles({
				name: `${sample.referenceName}.xlsx`,
				mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				buffer,
			});
			const host = editor(page);
			await expect(host.locator('.xg-chart svg')).toHaveCount(1);
			const verify = async () => {
				const group = host.locator('g[data-chart-legend-layout]');
				if (!expected.legendLayout) {
					await expect(group).toHaveCount(0);
					return;
				}
				await expect(group).toHaveCount(1);
				const bounds = await group.locator('rect[data-chart-part="legend"]').evaluate((node) => {
					const box = node as SVGRectElement;
					const matrix = box.getCTM()!;
					return {
						x: box.x.baseVal.value * matrix.a + matrix.e,
						y: box.y.baseVal.value * matrix.d + matrix.f,
						width: box.width.baseVal.value * matrix.a,
						height: box.height.baseVal.value * matrix.d,
					};
				});
				const rect = sample.layoutGeometry.legend;
				for (const [name, value] of [
					['x', rect.leftPt + 4],
					['y', rect.topPt + 4],
					['width', rect.widthPt],
					['height', rect.heightPt],
				] as const)
					expect(Math.abs(bounds[name] - (value * 4) / 3)).toBeLessThan(0.1);
				await expect(group.locator('text')).toHaveText(['Sales', 'Costs', 'Profit']);
				const positions = await group.locator('text').evaluateAll((nodes) =>
					nodes.map((node) => ({
						x: Number(node.getAttribute('x')),
						y: Number(node.getAttribute('y')),
					})),
				);
				if (sample.referenceName.includes('bottom') || sample.referenceName.includes('wide')) {
					expect(new Set(positions.map((p) => p.y)).size).toBe(1);
					expect(positions[0]!.x).toBeLessThan(positions[1]!.x);
				} else {
					expect(new Set(positions.map((p) => p.x)).size).toBe(1);
					expect(positions[0]!.y).toBeLessThan(positions[1]!.y);
				}
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
			const actual = chartView(saved, 0, chart, () => []);
			expect(actual.legendLayout).toEqual(expected.legendLayout);
			expect(actual.legendOverlay).toBe(expected.legendOverlay);
			expect(errors).toEqual([]);
		});
