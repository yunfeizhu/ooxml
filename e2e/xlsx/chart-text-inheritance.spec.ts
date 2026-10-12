import { expect, test } from '@playwright/test';
import native from '../../src/core/chart/excel-chart-text-inheritance.json' with { type: 'json' };
import { loadXlsx, chartView } from 'ooxml-core/xlsx';
import { FRAMEWORKS, editor, openLanding, pageErrors } from './helpers';
import { nativeChartFixture } from './native-chart-fixture';

for (const framework of FRAMEWORKS)
	for (const reference of ['root-102-full', 'root-102-direct', 'root-212-direct'])
		test(`native text inheritance ${reference} survives a type edit in ${framework}`, async ({
			page,
		}) => {
			const errors = pageErrors(page);
			const sample = native.cases.find((item) => item.referenceName === reference)!;
			await openLanding(page, framework);
			const name = `${reference}.xlsx`;
			await page.locator('#landing-file').setInputFiles({
				name,
				mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				buffer: await nativeChartFixture(sample.parts, 'Aptos Narrow'),
			});
			const host = editor(page);
			await expect(host.getByText(name, { exact: true })).toBeVisible();
			const title = host.locator('.xg-chart svg text').filter({ hasText: 'Native style' });
			const family = sample.titleText.name.startsWith('+mj-')
				? 'Aptos Display'
				: sample.titleText.name.startsWith('+mn-')
					? 'Aptos Narrow'
					: sample.titleText.name;
			const verify = async () => {
				await expect(title).toHaveAttribute('font-size', String((sample.titleText.size! * 4) / 3));
				await expect(title).toHaveAttribute('font-family', new RegExp(family));
				await expect(title).toHaveAttribute('fill', sample.titleText.color);
				await expect(title).toHaveAttribute(
					'font-weight',
					sample.titleText.bold ? 'bold' : 'normal',
				);
				await expect(title).toHaveAttribute(
					'font-style',
					sample.titleText.italic ? 'italic' : 'normal',
				);
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
			if (chart.kind !== 'chart') throw new Error('Missing chart');
			expect(chart.chartType).toBe('line');
			expect(chart.formatting?.textDefaults).toMatchObject({ fontSize: 20, typeface: 'Arial' });
			expect(chartView(saved, 0, chart, () => []).appearance?.title).toMatchObject({
				fontSize: sample.titleText.size,
				bold: sample.titleText.bold,
				italic: sample.titleText.italic,
				typeface: family,
				color: sample.titleText.color,
			});
			expect(errors).toEqual([]);
		});
