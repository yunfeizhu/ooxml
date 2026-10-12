// The colour picker of the Format Cells tabs and the Tab Color dialog: an Automatic / No Color
// command, the theme colours with their tint rows and the standard colours, on the shared
// `office-ui-color-grid` (the ribbon's picker without its popover).
import type { Color } from 'ooxml-core/xlsx';
import type { EditorContext } from 'ooxml-core/xlsx/ui';
import type { OfficeColorPick } from '../../../controls';
import { excelColorGrid, excelGridValue, pickedExcelColor } from '../../ribbon/color-grid';

export const colorKey = (color: Color | undefined): string =>
	color
		? JSON.stringify([
				color.rgb?.slice(-6).toUpperCase(),
				color.theme,
				color.tint,
				color.indexed,
				color.auto,
			])
		: 'none';

export interface SwatchGrid {
	element: HTMLElement;
	value(): Color | undefined;
	set(color: Color | undefined): void;
	/** Focus the current choice. */
	focus(): void;
}

/** `noneLabel` names the "no colour" command (`Automatic` or `No Color`). */
export function swatchGrid(
	ctx: EditorContext,
	label: string,
	noneLabel: string,
	initial: Color | undefined,
	onChange?: (color: Color | undefined) => void,
): SwatchGrid {
	const theme = ctx.workbook()?.theme ?? { colors: [], majorFont: '', minorFont: '' };
	const grid = excelColorGrid(ctx.host.ownerDocument, theme, ctx.t, {
		noneLabel,
		label: ctx.t(label),
	});
	grid.classList.add('xve-swatch-picker');
	let current = initial;
	const paint = (): void => {
		grid.value = excelGridValue(current, theme);
	};
	grid.addEventListener('office-color-pick', (event) => {
		event.stopPropagation();
		// Standard colours are stored with their alpha, as the dialog always wrote them.
		current = pickedExcelColor((event as CustomEvent<OfficeColorPick>).detail, true);
		paint();
		onChange?.(current);
	});
	paint();
	return {
		element: grid,
		value: () => current,
		set(color) {
			current = color;
			paint();
		},
		focus: () => grid.focus(),
	};
}
