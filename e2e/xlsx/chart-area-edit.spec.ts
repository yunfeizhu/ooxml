import { expect, test } from '@playwright/test';
import {
	createWorkbook,
	createEditSession,
	saveXlsx,
	loadXlsx,
	chartElementFill,
} from 'ooxml-core/xlsx';
import { FRAMEWORKS, editor, openLanding, pageErrors } from './helpers';

for (const framework of FRAMEWORKS)
	test(`chart elements use shared fill controls in ${framework}`, async ({ page }) => {
		const errors = pageErrors(page);
		await openLanding(page, framework);
		const book = createWorkbook();
		createEditSession(book).addChart(0, {
			chartType: 'column',
			showLegend: true,
			title: 'Sales chart',
			anchor: {
				from: { row: 0, col: 0, rowOffset: 0, colOffset: 0 },
				ext: { cx: 600 * 9525, cy: 400 * 9525 },
			},
			series: [{ name: 'Sales', categories: ['A', 'B'], values: [10, 20] }],
		});
		await page.locator('#landing-file').setInputFiles({
			name: 'background-edit.xlsx',
			mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			buffer: Buffer.from(await saveXlsx(book)),
		});
		const host = editor(page);
		await expect(host.getByText('background-edit.xlsx', { exact: true })).toBeVisible();
		await host.locator('[data-chart-series="0"][data-chart-point="0"] rect').first().click();
		await host.getByRole('tab', { name: 'Chart Design', exact: true }).click();
		await host.getByRole('button', { name: 'Format Chart Area', exact: true }).click();
		const pane = host.getByRole('complementary', {
			name: /^Format (Chart Area|Plot Area|Chart Title|Legend)$/,
		});
		const saved = async () => {
			const bytes = await host.evaluate(async (node) =>
				Array.from(await (node as unknown as { saveBytes(): Promise<Uint8Array> }).saveBytes()),
			);
			const drawing = (await loadXlsx(Uint8Array.from(bytes))).sheets[0]!.drawings[0]!;
			if (drawing.kind !== 'chart') throw new Error('Missing exported chart');
			return drawing;
		};
		for (const part of ['chartArea', 'plotArea', 'title', 'legend'] as const) {
			await pane.getByRole('combobox', { name: 'Chart element', exact: true }).selectOption(part);
			const kind = pane.getByRole('combobox', { name: 'Fill', exact: true });
			await kind.selectOption('none');
			expect(chartElementFill(await saved(), part).kind).toBe('none');
			await kind.selectOption('solid');
			await pane.getByRole('button', { name: 'Color', exact: true }).click();
			await host.getByRole('menuitemradio', { name: 'Blue', exact: true }).click();
			const solidTransparency = pane.getByRole('spinbutton', { name: 'Transparency', exact: true });
			await solidTransparency.fill('37');
			await solidTransparency.dispatchEvent('change');
			expect(chartElementFill(await saved(), part)).toMatchObject({
				kind: 'solid',
				color: { transforms: [{ name: 'alpha', value: '63000' }] },
			});
			await pane.getByRole('combobox', { name: 'Fill', exact: true }).selectOption('gradient');
			await pane.getByRole('button', { name: 'Preset gradients', exact: true }).click();
			await host
				.getByRole('dialog', { name: 'Preset gradients', exact: true })
				.getByRole('button', { name: 'Rainbow', exact: true })
				.click();
			const type = pane.getByRole('combobox', { name: 'Type', exact: true });
			for (const path of ['rect', 'circle', 'shape'] as const) {
				await type.selectOption(path);
				for (const label of [
					'From Center',
					'From Top Left Corner',
					'From Top Right Corner',
					'From Bottom Left Corner',
					'From Bottom Right Corner',
				]) {
					await pane.getByRole('button', { name: 'Direction', exact: true }).click();
					const popup = host.getByRole('dialog', { name: 'Direction', exact: true });
					await expect(popup.getByRole('button')).toHaveCount(5);
					await popup.getByRole('button', { name: label, exact: true }).click();
				}
				const paint = host.locator(
					`${path === 'circle' ? 'radialGradient' : 'pattern'}[id$="-${part}"]`,
				);
				await expect(paint).toHaveCount(1);
				if (path === 'circle') {
					await expect(paint).toHaveAttribute('cx', '1');
					await expect(paint).toHaveAttribute('cy', '1');
				}
				const fill = chartElementFill(await saved(), part);
				expect(fill).toMatchObject({
					kind: 'gradient',
					path,
					fillToRect: { l: 1, t: 1, r: 0, b: 0 },
					tileRect: { l: 0, t: 0, r: -1, b: -1 },
				});
				const transparency = pane.getByRole('spinbutton', { name: 'Transparency', exact: true });
				await transparency.fill('37');
				await transparency.dispatchEvent('change');
				const modified = chartElementFill(await saved(), part);
				if (modified.kind !== 'gradient') throw new Error('Expected gradient');
				expect(modified.stops[0]!.color.transforms).toContainEqual({
					name: 'alpha',
					value: '63000',
				});
				await host.evaluate((node) => (node as unknown as { undo(): void }).undo());
				await expect(transparency).toHaveValue('0');
			}
			await type.selectOption('linear');
			await expect(pane.getByRole('spinbutton', { name: 'Angle', exact: true })).toBeEnabled();
			const paint = host.locator(`linearGradient[id$="-${part}"]`);
			await expect(paint).toHaveCount(1);
			const markup = () =>
				paint.evaluateAll((nodes) =>
					nodes.map((node) => node.outerHTML.replace(/xlsx-chart-\d+/g, 'chart')),
				);
			const before = await markup();
			const otherPart = part === 'chartArea' ? 'plotArea' : 'chartArea';
			const other = () =>
				host
					.locator(`:is(linearGradient,radialGradient,pattern)[id$="-${otherPart}"]`)
					.evaluateAll((nodes) =>
						nodes.map((node) => node.outerHTML.replace(/xlsx-chart-\d+/g, 'chart')),
					);
			const untouched = await other();
			const stops = pane.getByRole('group', { name: 'Gradient stops', exact: true });
			await stops.scrollIntoViewIfNeeded();
			const strip = await stops.locator('.office-gradient-stop-paint').boundingBox();
			const marker = await stops
				.getByRole('button', { name: 'Gradient stop 1', exact: true })
				.boundingBox();
			if (!strip || !marker) throw new Error('Expected visible stop strip');
			await page.mouse.move(marker.x + marker.width / 2, marker.y + marker.height / 2);
			await page.mouse.down();
			await page.mouse.move(
				marker.x + marker.width / 2 + strip.width * 0.4,
				marker.y + marker.height / 2,
				{ steps: 3 },
			);
			await expect(pane.getByRole('spinbutton', { name: 'Position', exact: true })).toHaveValue(
				'40',
			);
			await expect.poll(markup).not.toEqual(before);
			const during = chartElementFill(await saved(), part);
			if (during.kind !== 'gradient') throw new Error('Expected gradient');
			expect(during.stops[0]!.position).toBe(0);
			expect(await other()).toEqual(untouched);
			await page.keyboard.press('Escape');
			await page.mouse.up();
			await expect.poll(markup).toEqual(before);
			const slider = pane.getByRole('slider', { name: 'Transparency', exact: true });
			await slider.evaluate((node) => {
				const input = node as HTMLInputElement;
				input.value = '37';
				input.dispatchEvent(new Event('input', { bubbles: true }));
			});
			await expect.poll(markup).not.toEqual(before);
			const uncommitted = chartElementFill(await saved(), part);
			if (uncommitted.kind !== 'gradient') throw new Error('Expected gradient');
			expect(uncommitted.stops[0]!.color.transforms).not.toContainEqual({
				name: 'alpha',
				value: '63000',
			});
			await slider.press('Escape');
			await expect.poll(markup).toEqual(before);
			expect(await other()).toEqual(untouched);
			await pane.getByRole('button', { name: 'Add gradient stop', exact: true }).click();
			await expect(
				pane.getByRole('group', { name: 'Gradient stops', exact: true }).getByRole('button'),
			).toHaveCount(8);
			await pane.getByRole('button', { name: 'Remove gradient stop', exact: true }).click();
			await expect(
				pane.getByRole('group', { name: 'Gradient stops', exact: true }).getByRole('button'),
			).toHaveCount(7);
			expect(await pane.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
		}
		await host.evaluate((node) => ((node as unknown as { readOnly: boolean }).readOnly = true));
		await expect(pane.getByRole('combobox', { name: 'Fill', exact: true })).toBeDisabled();
		await expect(pane.getByRole('combobox', { name: 'Chart element', exact: true })).toBeDisabled();
		await expect(pane.getByRole('button', { name: 'Direction', exact: true })).toBeDisabled();
		await host.evaluate((node) => ((node as unknown as { readOnly: boolean }).readOnly = false));
		await host
			.locator('rect[data-chart-part="chartArea"]')
			.first()
			.dblclick({ position: { x: 5, y: 5 } });
		await expect(pane).toHaveAttribute('aria-label', 'Format Chart Area');
		await host
			.locator('rect[data-chart-part="plotArea"]')
			.first()
			.dblclick({ position: { x: 8, y: 8 } });
		await expect(pane).toHaveAttribute('aria-label', 'Format Plot Area');
		for (const [part, label] of [
			['title', 'Format Chart Title'],
			['legend', 'Format Legend'],
		] as const) {
			await host
				.locator(`rect[data-chart-part="${part}"]`)
				.first()
				.dblclick({ position: { x: 2, y: 2 } });
			await expect(pane).toHaveAttribute('aria-label', label);
		}
		await host.locator('[data-chart-series="0"][data-chart-point="0"] rect').first().dblclick();
		await expect(
			host.getByRole('complementary', { name: 'Format Data Series', exact: true }),
		).toBeVisible();
		await expect(pane).toBeHidden();
		expect(errors).toEqual([]);
	});
