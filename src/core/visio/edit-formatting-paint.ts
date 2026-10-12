import { visioThemeColorFormula } from './theme-color-ref';
import type { VisioShapeFormatEdit } from './edit-formatting-commands';
import type { FormattingWrite } from './edit-formatting';
import { assertNonGradientPaint } from './edit-formatting-paint-scope';
import type { VisioPackage } from './package';
import type { FormattingRowContext } from './edit-style-admission';
import { quickStyleWrites, shadowWrites } from './edit-formatting-effects';
import { effectWrites } from './edit-formatting-glow';

export function shapeFormattingWrites(edit: VisioShapeFormatEdit): FormattingWrite[] {
	const writes = new Map<string, FormattingWrite>();
	const add = (
		name: string,
		value: string | number,
		category: 'FillStyle' | 'LineStyle',
		unit?: string,
		formula?: string,
	) =>
		writes.set(name, {
			name,
			value: String(value),
			category,
			...(unit ? { unit } : {}),
			...(formula ? { formula } : {}),
		});
	if (edit.fillColor !== undefined) {
		add('FillPattern', edit.fillColor === 'none' ? 0 : 1, 'FillStyle');
		add('FillGradientEnabled', 0, 'FillStyle');
		if (edit.fillColor !== 'none') {
			add(
				'FillForegnd',
				edit.fillColor,
				'FillStyle',
				undefined,
				edit.fillColorTheme ? visioThemeColorFormula(edit.fillColorTheme) : rgb(edit.fillColor),
			);
			add('FillForegndTrans', 0, 'FillStyle');
		}
	}
	if (edit.fillPattern !== undefined) {
		add('FillPattern', edit.fillPattern, 'FillStyle');
		add('FillGradientEnabled', 0, 'FillStyle');
	}
	if (edit.fillBackgroundColor !== undefined) {
		add(
			'FillBkgnd',
			edit.fillBackgroundColor,
			'FillStyle',
			undefined,
			rgb(edit.fillBackgroundColor),
		);
	}
	if (edit.fillTransparency !== undefined) {
		for (const name of ['FillForegndTrans', 'FillBkgndTrans'])
			add(name, edit.fillTransparency / 100, 'FillStyle');
	}
	if (edit.lineColor !== undefined) {
		add(
			'LineColor',
			edit.lineColor,
			'LineStyle',
			undefined,
			edit.lineColorTheme ? visioThemeColorFormula(edit.lineColorTheme) : rgb(edit.lineColor),
		);
		add('LineColorTrans', 0, 'LineStyle');
		add('LineGradientEnabled', 0, 'LineStyle');
	}
	if (edit.linePattern !== undefined) add('LinePattern', edit.linePattern, 'LineStyle');
	if (edit.lineTransparency !== undefined) {
		add('LineColorTrans', edit.lineTransparency / 100, 'LineStyle');
	}
	if (edit.lineWeight !== undefined) add('LineWeight', edit.lineWeight / 72, 'LineStyle', 'PT');
	// As Visio saves them: plain codes, and the rounding radius in inches shown as points.
	for (const [name, cell] of [
		['beginArrow', 'BeginArrow'],
		['endArrow', 'EndArrow'],
		['beginArrowSize', 'BeginArrowSize'],
		['endArrowSize', 'EndArrowSize'],
		['lineCap', 'LineCap'],
	] as const)
		if (edit[name] !== undefined) add(cell, edit[name], 'LineStyle');
	if (edit.rounding !== undefined) add('Rounding', edit.rounding / 72, 'LineStyle', 'PT');
	return [...writes.values()];
}
/** Paint writes plus Shape Styles (Quick Style and shadow) writes; later writes win by name. */
export async function shapeFormattingPlan(
	pkg: VisioPackage,
	document: Element,
	shape: Element,
	edit: VisioShapeFormatEdit,
	check: () => void,
): Promise<{ writes: FormattingWrite[]; rows?: Map<string, FormattingRowContext> }> {
	const writes = new Map(shapeFormattingWrites(edit).map((write) => [write.name, write]));
	const add = (
		name: string,
		value: string | number,
		category: FormattingWrite['category'],
		unit?: string,
		formula?: string,
	) =>
		writes.set(name, {
			name,
			value: String(value),
			category,
			...(unit ? { unit } : {}),
			...(formula ? { formula } : {}),
		});
	const rows = edit.quickStyle
		? await quickStyleWrites(pkg, document, shape, edit.pageId, edit.quickStyle, add, check)
		: undefined;
	if (edit.shadow) shadowWrites(edit.shadow, add);
	effectWrites(edit, add);
	return { writes: [...writes.values()], ...(rows ? { rows } : {}) };
}
export async function assertShapeFormattingPaintScope(
	pkg: VisioPackage,
	document: Element,
	shape: Element,
	edit: VisioShapeFormatEdit,
	changed: ReadonlyMap<string, Element | undefined>,
	check: () => void,
): Promise<void> {
	// A Quick Style replaces the whole paint, including any theme gradient.
	if (edit.quickStyle) return;
	if (
		edit.fillColor === undefined &&
		edit.fillPattern === undefined &&
		['FillBkgnd', 'FillForegndTrans', 'FillBkgndTrans'].some((name) => changed.has(name))
	)
		await assertNonGradientPaint(pkg, document, shape, edit.pageId, 'Fill', check);
	if (edit.lineColor === undefined && changed.has('LineColorTrans'))
		await assertNonGradientPaint(pkg, document, shape, edit.pageId, 'Line', check);
}
function rgb(color: string): string {
	return `RGB(${[1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16)).join(',')})`;
}
