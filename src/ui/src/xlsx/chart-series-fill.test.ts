// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { buildChart } from 'ooxml-core/xlsx/ui';
import { createTestContext } from './commands/test-support';
import { chartSeriesCommand, createChartSeriesPane } from './chart-series-pane';

afterEach(() => document.body.replaceChildren());

it('keeps the chosen series through fill edits and undo and guards stale color menus', async () => {
	const ctx = createTestContext();
	ctx.session()!.setRangeValues(0, { row: 0, col: 0 }, [
		['Month', 'Sales', 'Cost'],
		['Jan', 10, 5],
		['Feb', 20, 8],
	]);
	const { kind: _kind, ...chart } = buildChart(
		ctx.workbook()!,
		0,
		{ start: { row: 0, col: 0 }, end: { row: 2, col: 2 } },
		'column',
	);
	ctx.selection.set({ drawing: ctx.session()!.addChart(0, chart) });
	ctx.commands.register(chartSeriesCommand());
	const pane = createChartSeriesPane(ctx);
	ctx.root.append(pane.element);
	ctx.onModelChange(pane.refresh);
	await ctx.commands.run('chart.format-series', 1);
	const series = pane.element.querySelector<HTMLSelectElement>('[aria-label="Series"]')!;
	const fill = pane.element.querySelector<HTMLSelectElement>('[aria-label="Fill"]')!;
	const color = pane.element.querySelector<HTMLButtonElement>('[aria-label="Color"]')!;
	expect(series.value).toBe('1');
	expect(series.selectedOptions[0]!.textContent).toBe('Cost');
	// The shared colour grid in Excel's popover.
	const red = () =>
		ctx.root
			.querySelector('.color-grid office-ui-color-grid')!
			.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Red"]')!;
	color.click();
	series.value = '0';
	series.dispatchEvent(new Event('change'));
	red().click();
	const drawing = ctx.workbook()!.sheets[0]!.drawings[0]!;
	if (drawing.kind !== 'chart') throw new Error('Expected chart');
	expect(drawing.series.every((item) => !item.drawingColor)).toBe(true);
	series.value = '1';
	series.dispatchEvent(new Event('change'));
	color.click();
	red().click();
	const transparency = pane.element.querySelector<HTMLInputElement>(
		'input[type="number"][aria-label="Transparency"]',
	)!;
	transparency.value = '37';
	transparency.dispatchEvent(new Event('change'));
	expect(transparency.value).toBe('37');
	for (const value of ['101', '-1', '1.5', '']) {
		transparency.value = value;
		transparency.dispatchEvent(new Event('change'));
		expect(transparency.value).toBe('37');
	}
	expect(ctx.toasts).toHaveLength(4);
	color.click();
	red().parentElement!.querySelector<HTMLButtonElement>('[aria-label="Blue"]')!.click();
	expect(transparency.value).toBe('37');
	fill.value = 'none';
	fill.dispatchEvent(new Event('change'));
	ctx.session()!.undo();
	expect(series.value).toBe('1');
	expect(fill.value).toBe('solid');
	const edited = ctx.workbook()!.sheets[0]!.drawings[0]!;
	if (edited.kind !== 'chart') throw new Error('Expected chart');
	expect(edited.series[0]!.drawingColor).toBeUndefined();
	expect(edited.series[1]!.drawingColor).toEqual({
		kind: 'srgb',
		value: '0070C0',
		transforms: [{ name: 'alpha', value: '63000' }],
	});
	ctx.setReadOnly(true);
	pane.refresh();
	expect(color.disabled).toBe(true);
	expect(transparency.disabled).toBe(true);
	transparency.value = '23';
	transparency.dispatchEvent(new Event('change'));
	expect(transparency.value).toBe('37');
	fill.value = 'none';
	fill.dispatchEvent(new Event('change'));
	expect(edited.series[1]!.fill).toBeUndefined();
	ctx.setReadOnly(false);
	pane.refresh();
	fill.value = 'gradient';
	fill.dispatchEvent(new Event('change'));
	const stopButtons = pane.element.querySelectorAll<HTMLButtonElement>('.office-gradient-stop');
	expect(stopButtons).toHaveLength(2);
	const opacitySlider = pane.element.querySelector<HTMLInputElement>(
		'.xve-chart-series-gradient input[type="range"][aria-label="Transparency"]',
	)!;
	const opacityNumber = pane.element.querySelector<HTMLInputElement>(
		'.xve-chart-series-gradient input[type="number"][aria-label="Transparency"]',
	)!;
	opacitySlider.value = '23';
	opacitySlider.dispatchEvent(new Event('input'));
	expect(opacityNumber.value).toBe('23');
	const previewDrawing = ctx.workbook()!.sheets[0]!.drawings[0]!;
	if (previewDrawing.kind !== 'chart' || previewDrawing.series[1]!.fill?.kind !== 'gradient')
		throw new Error('Expected gradient');
	expect(previewDrawing.series[1]!.fill.stops[0]!.color.transforms).toEqual([
		{ name: 'alpha', value: '63000' },
	]);
	opacitySlider.dispatchEvent(new Event('change'));
	expect(previewDrawing.series[1]!.fill.stops[0]!.color.transforms).toEqual([
		{ name: 'alpha', value: '77000' },
	]);
	ctx.session()!.undo();
	expect(opacityNumber.value).toBe('37');
	const brightness = pane.element.querySelector<HTMLInputElement>('[aria-label="Brightness"]')!;
	brightness.value = '-42';
	brightness.dispatchEvent(new Event('change'));
	expect(brightness.value).toBe('-42');
	ctx.setReadOnly(true);
	pane.refresh();
	expect(brightness.disabled).toBe(true);
	brightness.value = '37';
	brightness.dispatchEvent(new Event('change'));
	expect(brightness.value).toBe('-42');
	ctx.setReadOnly(false);
	ctx.session()!.undo();
	expect(brightness.value).toBe('0');
	const gradientChart = ctx.workbook()!.sheets[0]!.drawings[0]!;
	if (gradientChart.kind !== 'chart') throw new Error('Expected chart');
	const gradientSeries = structuredClone(gradientChart.series);
	const gradientFill = gradientSeries[1]!.fill;
	if (gradientFill?.kind !== 'gradient') throw new Error('Expected gradient');
	gradientFill.stops[0]!.color.transforms.push({ name: 'lum', value: '50000' });
	ctx.session()!.updateChart(0, 0, { series: gradientSeries });
	expect(brightness.disabled).toBe(true);
	expect(brightness.value).toBe('');
	ctx.session()!.undo();
	expect(brightness.disabled).toBe(false);
	expect(brightness.value).toBe('0');
	gradientFill.stops[0]!.color = { kind: 'scheme', value: 'unknown-theme-slot', transforms: [] };
	ctx.session()!.updateChart(0, 0, { series: gradientSeries });
	expect(
		Array.from(pane.element.querySelectorAll<HTMLButtonElement>('.office-gradient-stop')).every(
			(button) => button.disabled,
		),
	).toBe(true);
	ctx.session()!.undo();
	const position = pane.element.querySelector<HTMLInputElement>('[aria-label="Position"]')!;
	position.value = '23';
	position.dispatchEvent(new Event('change'));
	expect(position.value).toBe('23');
	position.value = '101';
	position.dispatchEvent(new Event('change'));
	expect(position.value).toBe('23');
	const angle = pane.element.querySelector<HTMLInputElement>('[aria-label="Angle"]')!;
	angle.value = '54';
	angle.dispatchEvent(new Event('change'));
	expect(angle.value).toBe('54');
	ctx.session()!.undo();
	expect(angle.value).toBe('90');
	ctx.session()!.undo();
	expect(position.value).toBe('0');
	ctx.session()!.undo();
	expect(fill.value).toBe('solid');
});
