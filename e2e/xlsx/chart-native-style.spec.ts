import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { createWorkbook, createEditSession, loadXlsx, saveXlsx } from 'ooxml-core/xlsx';
import native from '../../src/core/chart/excel-chart-styles.json' with { type: 'json' };
import { FRAMEWORKS, editor, openLanding, pageErrors } from './helpers';

async function openNativeStyle(page: Page, style: number, framework = 'vanilla') {
	const sample = native.cases.find((sample) => sample.style === style)!;
	const book = createWorkbook();
	book.theme.majorFont = 'Aptos Display';
	book.theme.minorFont = 'Aptos Narrow';
	book.theme.colors = [
		'lt1',
		'dk1',
		'lt2',
		'dk2',
		'accent1',
		'accent2',
		'accent3',
		'accent4',
		'accent5',
		'accent6',
		'hlink',
		'folHlink',
	].map((slot) => (native.scheme as Record<string, string>)[slot]!.slice(1));
	createEditSession(book).addChart(0, {
		chartType: 'column',
		series: [],
		showLegend: true,
		anchor: {
			from: { row: 1, col: 4, rowOffset: 0, colOffset: 0 },
			ext: { cx: 6096000, cy: 3810000 },
		},
	});
	const zip = await JSZip.loadAsync(await saveXlsx(book));
	for (const [name, xml] of Object.entries(sample.parts)) zip.file(name, xml);
	await openLanding(page, framework);
	await page.locator('#landing-file').setInputFiles({
		name: `native-${style}.xlsx`,
		mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		buffer: await zip.generateAsync({ type: 'nodebuffer' }),
	});
	const chart = editor(page).locator('.xg-chart svg').first();
	await expect(chart).toBeVisible();
	return chart;
}

for (const framework of FRAMEWORKS)
	test(`native series spacing edits in ${framework}`, async ({ page }) => {
		const errors = pageErrors(page);
		const chart = await openNativeStyle(page, 209, framework);
		await page.getByRole('img', { name: 'Native style', exact: true }).first().click();
		await editor(page).getByRole('tab', { name: 'Chart Design', exact: true }).click();
		await editor(page).getByRole('button', { name: 'Format Data Series', exact: true }).click();
		const pane = editor(page).getByRole('complementary', { name: 'Format Data Series' });
		const gap = pane.getByRole('spinbutton', { name: 'Gap Width', exact: true });
		const overlap = pane.getByRole('spinbutton', { name: 'Series Overlap', exact: true });
		await expect(gap).toHaveValue('100');
		await expect(overlap).toHaveValue('-24');
		await gap.fill('5');
		await gap.press('Tab');
		await overlap.fill('23');
		await overlap.press('Tab');
		const first = chart.locator('g[data-chart-series="0"][data-chart-point="0"] rect');
		await expect
			.poll(() =>
				chart.evaluate((svg) => {
					const a = svg.querySelector('g[data-chart-series="0"][data-chart-point="0"] rect')!;
					const b = svg.querySelector('g[data-chart-series="0"][data-chart-point="1"] rect')!;
					return (
						Number(a.getAttribute('width')) /
						(Number(b.getAttribute('x')) - Number(a.getAttribute('x')))
					);
				}),
			)
			.toBeCloseTo(1 / 1.82, 3);
		const bytes = await editor(page).evaluate(async (node) =>
			Array.from(await (node as unknown as { saveBytes(): Promise<Uint8Array> }).saveBytes()),
		);
		const saved = await loadXlsx(new Uint8Array(bytes));
		expect(saved.sheets[0]!.drawings[0]).toMatchObject({ barGapWidth: 5, barOverlap: 23 });
		await editor(page).evaluate((node) => (node as unknown as { undo(): void }).undo());
		await expect(overlap).toHaveValue('-24');
		await editor(page).evaluate((node) => (node as unknown as { redo(): void }).redo());
		await expect(overlap).toHaveValue('23');
		const gapSlider = pane.getByRole('slider', { name: 'Gap Width', exact: true });
		await expect(gapSlider).toHaveValue('5');
		await expect(pane.getByRole('slider', { name: 'Series Overlap', exact: true })).toHaveValue(
			'23',
		);
		await gapSlider.focus();
		await gapSlider.press('End');
		await expect(gap).toHaveValue('500');
		await editor(page).evaluate((node) => (node as unknown as { undo(): void }).undo());
		await expect(gap).toHaveValue('5');
		await expect(gapSlider).toHaveValue('5');
		await editor(page).evaluate((node) => {
			(node as unknown as { readOnly: boolean }).readOnly = true;
		});
		await expect(gap).toBeDisabled();
		await expect(gapSlider).toBeDisabled();
		await editor(page).evaluate((node) => {
			(node as unknown as { readOnly: boolean }).readOnly = false;
		});
		await expect(gap).toBeEnabled();
		await pane.getByRole('button', { name: 'Close', exact: true }).click();
		await expect(pane).toBeHidden();
		await first.dblclick();
		await expect(pane).toBeVisible();
		await overlap.press('Escape');
		await expect(pane).toBeHidden();
		expect(errors).toEqual([]);
	});

for (const framework of FRAMEWORKS)
	test(`native individual series fills edit in ${framework}`, async ({ page }) => {
		const errors = pageErrors(page);
		const chart = await openNativeStyle(page, 209, framework);
		await chart.locator('g[data-chart-series="1"][data-chart-point="0"] rect').dblclick();
		const pane = editor(page).getByRole('complementary', { name: 'Format Data Series' });
		const series = pane.getByRole('combobox', { name: 'Series', exact: true });
		const fill = pane.getByRole('combobox', { name: 'Fill', exact: true });
		await expect(series).toHaveValue('1');
		await expect(fill).toHaveValue('gradient');
		await fill.selectOption('solid');
		const transparency = pane.getByRole('spinbutton', { name: 'Transparency', exact: true });
		await pane.getByRole('button', { name: 'Color', exact: true }).click();
		await page.getByRole('menuitemradio', { name: 'Accent 1, Lighter 40%', exact: true }).click();
		await transparency.fill('37');
		await transparency.press('Tab');
		await expect(chart.locator('g[data-chart-series="1"] rect').first()).toHaveAttribute(
			'fill',
			/^rgba\(.*0\.63\)$/,
		);
		await pane.getByRole('button', { name: 'Color', exact: true }).click();
		await page.getByRole('menuitemradio', { name: 'Accent 1, Lighter 40%', exact: true }).click();
		await expect(transparency).toHaveValue('37');
		const bytes = await editor(page).evaluate(async (node) =>
			Array.from(await (node as unknown as { saveBytes(): Promise<Uint8Array> }).saveBytes()),
		);
		const saved = await loadXlsx(new Uint8Array(bytes));
		const drawing = saved.sheets[0]!.drawings[0]!;
		expect(drawing.kind).toBe('chart');
		if (drawing.kind !== 'chart') throw new Error('Expected a chart');
		expect(drawing.series[0]!.fill?.kind).toBe('gradient');
		expect(drawing.series[1]!.drawingColor).toEqual({
			kind: 'scheme',
			value: 'accent1',
			transforms: [
				{ name: 'lumMod', value: '60000' },
				{ name: 'lumOff', value: '40000' },
				{ name: 'alpha', value: '63000' },
			],
		});
		await fill.selectOption('none');
		await expect(chart.locator('g[data-chart-series="1"] rect').first()).toHaveAttribute(
			'fill',
			'none',
		);
		await editor(page).evaluate((node) => (node as unknown as { undo(): void }).undo());
		await expect(fill).toHaveValue('solid');
		await expect(transparency).toHaveValue('37');
		const transparencySlider = pane.getByRole('slider', { name: 'Transparency', exact: true });
		await transparencySlider.focus();
		await transparencySlider.press('Home');
		await expect(transparency).toHaveValue('0');
		await editor(page).evaluate((node) => (node as unknown as { undo(): void }).undo());
		await expect(transparencySlider).toHaveValue('37');
		await expect(series).toHaveValue('1');
		await series.selectOption('0');
		await expect(fill).toHaveValue('gradient');
		await series.selectOption('1');
		await editor(page).evaluate((node) => {
			(node as unknown as { readOnly: boolean }).readOnly = true;
		});
		await expect(fill).toBeDisabled();
		await expect(transparencySlider).toBeDisabled();
		expect(errors).toEqual([]);
	});

for (const framework of FRAMEWORKS)
	test(`native gradient authoring edits in ${framework}`, async ({ page }) => {
		const errors = pageErrors(page);
		const chart = await openNativeStyle(page, 209, framework);
		await chart.locator('g[data-chart-series="1"][data-chart-point="0"] rect').dblclick();
		const pane = editor(page).getByRole('complementary', { name: 'Format Data Series' });
		const stops = pane.getByRole('group', { name: 'Gradient stops', exact: true });
		await expect(stops.getByRole('button')).toHaveCount(3);
		const dragPosition = pane.getByRole('spinbutton', { name: 'Position', exact: true });
		await stops.scrollIntoViewIfNeeded();
		const paintBox = await stops.locator('.office-gradient-stop-paint').boundingBox();
		const markerBox = await stops
			.getByRole('button', { name: 'Gradient stop 1', exact: true })
			.boundingBox();
		if (!paintBox || !markerBox) throw new Error('Expected stop track');
		const startX = markerBox.x + markerBox.width / 2;
		const startY = markerBox.y + markerBox.height / 2;
		await page.mouse.move(startX, startY);
		await page.mouse.down();
		await page.mouse.move(startX + paintBox.width * 0.85, startY, { steps: 5 });
		await expect(dragPosition).toHaveValue('85');
		await expect(chart.locator('linearGradient[id$="-s1"] stop').first()).toHaveAttribute(
			'offset',
			'0.5',
		);
		const previewBytes = await editor(page).evaluate(async (node) =>
			Array.from(await (node as unknown as { saveBytes(): Promise<Uint8Array> }).saveBytes()),
		);
		const previewChart = (await loadXlsx(new Uint8Array(previewBytes))).sheets[0]!.drawings[0]!;
		if (previewChart.kind !== 'chart' || previewChart.series[1]!.fill?.kind !== 'gradient')
			throw new Error('Expected gradient');
		expect(previewChart.series[1]!.fill.stops[0]!.position).toBe(0);
		await page.mouse.up();
		await expect(dragPosition).toHaveValue('85');
		await editor(page).evaluate((node) => (node as unknown as { undo(): void }).undo());
		await expect(dragPosition).toHaveValue('0');
		await expect(chart.locator('linearGradient[id$="-s1"] stop').first()).toHaveAttribute(
			'offset',
			'0',
		);
		await page.mouse.move(startX, startY);
		await page.mouse.down();
		await page.mouse.move(startX + paintBox.width * 0.4, startY, { steps: 3 });
		await expect(dragPosition).toHaveValue('40');
		await page.keyboard.press('Escape');
		await page.mouse.up();
		await expect(dragPosition).toHaveValue('0');
		await expect(chart.locator('linearGradient[id$="-s1"] stop').first()).toHaveAttribute(
			'offset',
			'0',
		);
		await page.mouse.move(startX, startY);
		await page.mouse.down();
		await page.mouse.move(startX + paintBox.width * 0.4, startY, { steps: 3 });
		await expect(dragPosition).toHaveValue('40');
		await editor(page).evaluate((node) => {
			(node as unknown as { readOnly: boolean }).readOnly = true;
		});
		await expect(dragPosition).toBeDisabled();
		await expect(dragPosition).toHaveValue('0');
		await page.mouse.up();
		await editor(page).evaluate((node) => {
			(node as unknown as { readOnly: boolean }).readOnly = false;
		});
		await expect(dragPosition).toBeEnabled();
		const direction = pane.getByRole('button', { name: 'Direction', exact: true });
		const initialAngle = await pane
			.getByRole('spinbutton', { name: 'Angle', exact: true })
			.inputValue();
		await direction.press('ArrowDown');
		const directionPopup = editor(page).getByRole('dialog', { name: 'Direction', exact: true });
		await expect(directionPopup.getByRole('button')).toHaveCount(8);
		const ids = await directionPopup
			.locator('linearGradient')
			.evaluateAll((nodes) => nodes.map((node) => node.id));
		expect(new Set(ids).size).toBe(8);
		await page.keyboard.press('End');
		await expect(
			directionPopup.getByRole('button', { name: 'Linear Diagonal - Top Right', exact: true }),
		).toBeFocused();
		await page.keyboard.press('Enter');
		await expect(directionPopup).toBeHidden();
		await expect(pane.getByRole('spinbutton', { name: 'Angle', exact: true })).toHaveValue('315');
		await editor(page).evaluate((node) => (node as unknown as { undo(): void }).undo());
		await expect(pane.getByRole('spinbutton', { name: 'Angle', exact: true })).toHaveValue(
			initialAngle,
		);
		await stops.getByRole('button', { name: 'Gradient stop 2', exact: true }).click();
		const angle = pane.getByRole('spinbutton', { name: 'Angle', exact: true });
		await angle.fill('54');
		await angle.press('Tab');
		const position = pane.getByRole('spinbutton', { name: 'Position', exact: true });
		await position.fill('23');
		await position.press('Tab');
		const transparency = pane.getByRole('spinbutton', { name: 'Transparency', exact: true });
		await transparency.fill('37');
		await transparency.press('Tab');
		await pane.getByRole('button', { name: 'Color', exact: true }).click();
		await page.getByRole('menuitemradio', { name: 'Red', exact: true }).click();
		await expect(chart.locator('linearGradient[id$="-s1"] stop').nth(1)).toHaveAttribute(
			'stop-opacity',
			'0.63',
		);
		await expect(chart.locator('linearGradient[id$="-s1"] stop').nth(1)).toHaveAttribute(
			'stop-color',
			'#FF0000',
		);
		const brightness = pane.getByRole('spinbutton', { name: 'Brightness', exact: true });
		for (const [value, paint] of [
			[-42, '#940000'],
			[100, '#FFFFFF'],
			[-100, '#000000'],
			[37, '#FF5E5E'],
		] as const) {
			await brightness.fill(String(value));
			await brightness.press('Tab');
			await expect(chart.locator('linearGradient[id$="-s1"] stop').nth(1)).toHaveAttribute(
				'stop-color',
				paint,
			);
			await expect(transparency).toHaveValue('37');
		}
		await brightness.fill('101');
		await brightness.press('Tab');
		await expect(brightness).toHaveValue('37');
		await pane.getByRole('button', { name: 'Add gradient stop', exact: true }).click();
		await expect(stops.getByRole('button')).toHaveCount(4);
		await expect(
			stops.getByRole('button', { name: 'Gradient stop 4', exact: true }),
		).toHaveAttribute('aria-pressed', 'true');
		await pane.getByRole('button', { name: 'Remove gradient stop', exact: true }).click();
		await pane.getByRole('button', { name: 'Remove gradient stop', exact: true }).click();
		await expect(stops.getByRole('button')).toHaveCount(2);
		await expect(
			pane.getByRole('button', { name: 'Remove gradient stop', exact: true }),
		).toBeDisabled();
		const bytes = await editor(page).evaluate(async (node) =>
			Array.from(await (node as unknown as { saveBytes(): Promise<Uint8Array> }).saveBytes()),
		);
		const drawing = (await loadXlsx(new Uint8Array(bytes))).sheets[0]!.drawings[0]!;
		if (drawing.kind !== 'chart') throw new Error('Expected chart');
		expect(drawing.series[0]!.fill?.kind).toBe('gradient');
		expect(drawing.series[1]!.fill).toMatchObject({
			kind: 'gradient',
			angle: 54,
			stops: [
				{ position: 0 },
				{
					position: 23,
					color: {
						kind: 'srgb',
						value: 'FF0000',
						transforms: [
							{ name: 'alpha', value: '63000' },
							{ name: 'lumMod', value: '63000' },
							{ name: 'lumOff', value: '37000' },
						],
					},
				},
			],
		});
		await editor(page).evaluate((node) => (node as unknown as { undo(): void }).undo());
		await expect(stops.getByRole('button')).toHaveCount(3);
		await editor(page).evaluate((node) => {
			(node as unknown as { readOnly: boolean }).readOnly = false;
		});
		for (const [label, min, original] of [
			['Position', '0', '23'],
			['Brightness', '-100', '37'],
			['Transparency', '0', '37'],
		] as const) {
			const slider = pane.getByRole('slider', { name: label, exact: true });
			const number = pane.getByRole('spinbutton', { name: label, exact: true });
			await expect(slider).toHaveValue(original);
			await slider.press('Home');
			await expect(number).toHaveValue(min);
			await editor(page).evaluate((node) => (node as unknown as { undo(): void }).undo());
			await expect(number).toHaveValue(original);
			await slider.press('End');
			await expect(number).toHaveValue('100');
			await editor(page).evaluate((node) => (node as unknown as { undo(): void }).undo());
			await expect(number).toHaveValue(original);
		}
		await editor(page).evaluate((node) => {
			(node as unknown as { readOnly: boolean }).readOnly = true;
		});
		await expect(position).toBeDisabled();
		await expect(brightness).toBeDisabled();
		await expect(direction).toBeDisabled();
		for (const label of ['Position', 'Brightness', 'Transparency'])
			await expect(pane.getByRole('slider', { name: label, exact: true })).toBeDisabled();
		await expect(stops.getByRole('button').first()).toBeDisabled();
		expect(errors).toEqual([]);
	});

for (const framework of FRAMEWORKS)
	test(`native title and legend typography render in ${framework}`, async ({ page }) => {
		const errors = pageErrors(page);
		const chart = await openNativeStyle(page, 212, framework);
		const title = chart.locator('text').filter({ hasText: 'Native style' });
		await expect(title).toHaveAttribute('font-family', /Aptos Display.*sans-serif/);
		expect(Number(await title.getAttribute('font-size'))).toBeCloseTo((20 * 4) / 3);
		await expect(title).toHaveAttribute('fill', '#595959');
		await expect(chart.locator('text').filter({ hasText: /^Sales$/ })).toHaveAttribute(
			'font-size',
			'12',
		);
		await page.getByRole('img', { name: 'Native style', exact: true }).first().click();
		await editor(page).getByRole('tab', { name: 'Chart Design', exact: true }).click();
		await expect(
			editor(page).getByRole('tab', { name: 'Chart Design', exact: true }),
		).toHaveAttribute('aria-selected', 'true');
		expect(errors).toEqual([]);
	});

test('native hidden value axes suppress labels while retaining categories', async ({ page }) => {
	const chart = await openNativeStyle(page, 202);
	await expect(chart.locator('text').filter({ hasText: /^M2$/ })).toBeVisible();
	await expect(chart.locator('text').filter({ hasText: /^0$/ })).toHaveCount(0);
});

test('native dark chart styles retain gradient backgrounds and contrasting text', async ({
	page,
}) => {
	const chart = await openNativeStyle(page, 209);
	await expect(chart.locator('radialGradient')).toHaveCount(1);
	const background = () =>
		chart.locator('radialGradient').evaluate((node) => ({
			cx: node.getAttribute('cx'),
			cy: node.getAttribute('cy'),
			r: node.getAttribute('r'),
			transform: node.getAttribute('gradientTransform'),
			stops: [...node.querySelectorAll('stop')].map((stop) => ({
				offset: stop.getAttribute('offset'),
				color: stop.getAttribute('stop-color'),
				opacity: stop.getAttribute('stop-opacity'),
			})),
		}));
	const before = await background();
	// The two native endpoints expand to the shared COM-verified sigma paint profile.
	expect(before.stops.length).toBeGreaterThan(2);
	expect(before.stops[0]).toEqual({ offset: '0', color: '#595959', opacity: '1' });
	expect(before.stops.at(-1)).toEqual({ offset: '1', color: '#262626', opacity: '1' });
	await expect(chart.locator('text').filter({ hasText: 'Native style' })).toHaveAttribute(
		'fill',
		'#F2F2F2',
	);
	await expect(chart.locator('rect').first()).toHaveAttribute('fill', /^url\(#xlsx-chart-.*\)$/);
	await expect(chart.locator('line[stroke="rgba(242,242,242,0.1)"]')).toHaveCount(7);
	await expect(chart.locator('linearGradient')).toHaveCount(2);
	await expect(chart.locator('linearGradient stop')).toHaveCount(6);
	await expect(chart.locator('feDropShadow')).toHaveCount(3);
	await expect(chart.locator('feDropShadow[stdDeviation="3"][dy="2"]')).toHaveCount(2);
	const firstBar = chart.locator('g[data-chart-series="0"][data-chart-point="0"] rect');
	const nextBar = chart.locator('g[data-chart-series="0"][data-chart-point="1"] rect');
	const pitch = Number(await nextBar.getAttribute('x')) - Number(await firstBar.getAttribute('x'));
	expect(Number(await firstBar.getAttribute('width')) / pitch).toBeCloseTo(1 / 3.24, 3);
	await expect(chart.locator('text').filter({ hasText: 'Native style' })).toHaveAttribute(
		'filter',
		/title-text-shadow/,
	);
	await expect(chart.locator('linearGradient stop').first()).toHaveAttribute(
		'stop-color',
		'#497491',
	);
	await expect(chart.locator('rect[fill*="-s0)"]')).toHaveCount(5);
	await page.getByRole('img', { name: 'Native style', exact: true }).first().click();
	await editor(page).getByRole('tab', { name: 'Chart Design', exact: true }).click();
	await editor(page).getByRole('button', { name: 'Change Colors', exact: true }).click();
	await page.getByRole('button', { name: 'Colorful Palette 3', exact: true }).click();
	await expect(chart.locator('linearGradient stop').first()).toHaveAttribute(
		'stop-color',
		'#ED8256',
	);
	expect(await background()).toEqual(before);
});
