// @vitest-environment jsdom
import { createWorkbook, getCell, styleAt } from 'ooxml-core/xlsx';
import { afterEach, describe, expect, it } from 'vitest';
import {
	clickButton,
	createTestContext,
	dialogEl,
	inputByLabel,
	pressKey,
	setValue,
} from '../../commands/test-support';
import { registerFormatCellsDialogs } from './index';

afterEach(() => (document.body.innerHTML = ''));

function setup() {
	const ctx = createTestContext(createWorkbook());
	registerFormatCellsDialogs(ctx);
	ctx.session()!.setCellValue(0, 0, 0, 'x');
	return ctx;
}

const styleOf = (ctx: ReturnType<typeof setup>, row = 0, col = 0) => {
	const wb = ctx.workbook()!;
	return styleAt(wb, getCell(wb.sheets[0]!, row, col)?.styleId);
};

/** A swatch or command of the colour picker named `group` (the shared colour grid). */
const within = (root: HTMLElement, group: string, label: string) =>
	root
		.querySelector<HTMLElement>(`office-ui-color-grid[aria-label="${group}"]`)!
		.shadowRoot!.querySelector<HTMLElement>(
			label === 'none' ? '[data-command="automatic"]' : `[aria-label="${label}"]`,
		)!;
const swatch = (root: HTMLElement, label: string) =>
	root
		.querySelector('office-ui-color-grid')!
		.shadowRoot!.querySelector<HTMLElement>(
			label === 'none' ? '[data-command="automatic"]' : `[aria-label="${label}"]`,
		)!;

describe('Format Cells: Font tab', () => {
	it('applies name, style and colour', async () => {
		const ctx = setup();
		const result = ctx.dialogs.open('format-cells', { tab: 'font' });
		const dialog = dialogEl(ctx, 'format-cells');
		setValue(inputByLabel(dialog, 'Font:'), 'Arial');
		setValue(inputByLabel<HTMLSelectElement>(dialog, 'Font style:'), 'bold');
		within(dialog, 'Color:', 'Red').click();
		expect(dialog.querySelector<HTMLElement>('[data-font-preview]')?.style.fontWeight).toBe('bold');
		clickButton(dialog, 'OK');
		await result;
		const font = styleOf(ctx).font;
		expect(font).toMatchObject({ name: 'Arial', bold: true, color: { rgb: 'FFFF0000' } });
		expect(font.italic).toBeUndefined();
		expect(font.scheme).toBeUndefined();
	});

	it('Escape closes without changes', async () => {
		const ctx = setup();
		const result = ctx.dialogs.open('format-cells', { tab: 'font' });
		const dialog = dialogEl(ctx, 'format-cells');
		inputByLabel(dialog, 'Strikethrough').click();
		pressKey(inputByLabel(dialog, 'Font:'), 'Escape');
		expect(await result).toBeUndefined();
		expect(styleOf(ctx).font.strike).toBeUndefined();
	});
});

describe('Format Cells: Border tab', () => {
	it('applies an outline and clears it again', async () => {
		const ctx = setup();
		ctx.select('A1:B2');
		const first = ctx.dialogs.open('format-cells', { tab: 'border' });
		let dialog = dialogEl(ctx, 'format-cells');
		clickButton(dialog, 'Outline');
		expect(dialog.querySelector('[data-preview]')?.getAttribute('style')).toContain('border-top');
		clickButton(dialog, 'OK');
		await first;
		expect(styleOf(ctx, 0, 0).border).toEqual({ top: { style: 'thin' }, left: { style: 'thin' } });
		expect(styleOf(ctx, 1, 1).border).toEqual({
			bottom: { style: 'thin' },
			right: { style: 'thin' },
		});
		expect(ctx.session()!.undoLabel()).toBe('Format Cells');
		const second = ctx.dialogs.open('format-cells', { tab: 'border' });
		dialog = dialogEl(ctx, 'format-cells');
		dialog.querySelector<HTMLElement>('[data-preset="none"]')!.click();
		clickButton(dialog, 'OK');
		await second;
		expect(styleOf(ctx, 0, 0).border).toEqual({});
	});

	it('toggles single edges with the chosen line style and diagonals', async () => {
		const ctx = setup();
		const result = ctx.dialogs.open('format-cells', { tab: 'border' });
		const dialog = dialogEl(ctx, 'format-cells');
		dialog.querySelector<HTMLElement>('[data-style="thick"]')!.click();
		clickButton(dialog, 'Bottom Border');
		clickButton(dialog, 'Diagonal Up Border');
		clickButton(dialog, 'OK');
		await result;
		expect(styleOf(ctx).border).toEqual({
			bottom: { style: 'thick' },
			diagonal: { style: 'thick' },
			diagonalUp: true,
		});
	});
});

describe('Format Cells: Fill tab', () => {
	it('applies a solid background colour', async () => {
		const ctx = setup();
		const result = ctx.dialogs.open('format-cells', { tab: 'fill' });
		const dialog = dialogEl(ctx, 'format-cells');
		within(dialog, 'Background Color:', 'Yellow').click();
		clickButton(dialog, 'OK');
		await result;
		expect(styleOf(ctx).fill).toEqual({
			type: 'pattern',
			pattern: 'solid',
			fgColor: { rgb: 'FFFFFF00' },
		});
	});

	it('applies a pattern', async () => {
		const ctx = setup();
		const result = ctx.dialogs.open('format-cells', { tab: 'fill' });
		const dialog = dialogEl(ctx, 'format-cells');
		setValue(inputByLabel<HTMLSelectElement>(dialog, 'Pattern Style:'), 'lightGrid');
		clickButton(dialog, 'OK');
		await result;
		expect(styleOf(ctx).fill).toEqual({
			type: 'pattern',
			pattern: 'lightGrid',
			fgColor: { indexed: 64 },
		});
	});
});

describe('Format Cells: dxf mode', () => {
	it('returns a differential style and leaves the workbook untouched', async () => {
		const ctx = setup();
		const styles = ctx.workbook()!.styles.length;
		const result = ctx.dialogs.open('format-cells', { dxf: { font: { italic: true } } });
		const dialog = dialogEl(ctx, 'format-cells');
		expect(dialog.querySelector('[data-tab="alignment"]')).toBeNull();
		expect(dialog.querySelector('[aria-label="Font:"]')).toBeNull();
		dialog.querySelector<HTMLElement>('[data-tab="font"]')!.click();
		setValue(inputByLabel<HTMLSelectElement>(dialog, 'Font style:'), 'bold');
		within(dialog, 'Background Color:', 'Yellow').click();
		clickButton(dialog, 'Outline');
		clickButton(dialog, 'OK');
		expect(await result).toEqual({
			font: { bold: true },
			fill: { type: 'pattern', pattern: 'solid', bgColor: { rgb: 'FFFFFF00' } },
			border: {
				top: { style: 'thin' },
				bottom: { style: 'thin' },
				left: { style: 'thin' },
				right: { style: 'thin' },
			},
		});
		expect(ctx.workbook()!.styles.length).toBe(styles);
		expect(ctx.session()!.undoLabel()).not.toBe('Format Cells');
	});
});

describe('Tab Color dialog', () => {
	it('sets and clears the tab colour', async () => {
		const ctx = setup();
		let result = ctx.dialogs.open('tab-color');
		let dialog = dialogEl(ctx, 'tab-color');
		swatch(dialog, 'Red').click();
		clickButton(dialog, 'OK');
		expect(await result).toEqual({ color: { rgb: 'FFFF0000' } });
		expect(ctx.workbook()!.sheets[0]!.tabColor).toEqual({ rgb: 'FFFF0000' });
		result = ctx.dialogs.open('tab-color');
		dialog = dialogEl(ctx, 'tab-color');
		swatch(dialog, 'none').click();
		clickButton(dialog, 'OK');
		expect(await result).toEqual({ color: undefined });
		expect(ctx.workbook()!.sheets[0]!.tabColor).toBeUndefined();
	});

	it('Cancel keeps the colour', async () => {
		const ctx = setup();
		const result = ctx.dialogs.open('tab-color');
		const dialog = dialogEl(ctx, 'tab-color');
		swatch(dialog, 'Red').click();
		clickButton(dialog, 'Cancel');
		expect(await result).toBeUndefined();
		expect(ctx.workbook()!.sheets[0]!.tabColor).toBeUndefined();
	});
});
