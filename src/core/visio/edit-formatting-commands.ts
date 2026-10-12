import { isVisioThemeColorRef, type VisioThemeColorRef } from './theme-color-ref';
import { fail } from './package-common';
import {
	isVisioQuickStyleColor,
	isVisioShadowPreset,
	type VisioQuickStyle,
	type VisioShadowPreset,
} from './edit-formatting-effects';
import {
	snapshotGlow,
	snapshotReflection,
	snapshotSoftEdges,
	type VisioGlowEffect,
	type VisioReflectionEffect,
} from './edit-formatting-glow';
import {
	snapshotTextFormatExtras,
	type VisioTextFormatExtras,
} from './edit-formatting-text-commands';

interface Target {
	pageId: string;
	shapeId: string;
}
/** Whole-shape formatting updates every effective stored row, including unused rows.
 * Protected affected rows cause atomic refusal. Font size and indent use physical points.
 */
export interface VisioTextFormatEdit extends Target, VisioTextFormatExtras {
	type: 'format-text';
	fontSize?: number;
	fontFamily?: string;
	/** Opaque custom text color. */
	fontColor?: string;
	/** The Theme Colors swatch `fontColor` came from: saved as its theme formula. */
	fontColorTheme?: VisioThemeColorRef;
	bold?: boolean;
	italic?: boolean;
	underline?: boolean;
	strikethrough?: boolean;
	/** Enable paragraph bullets, retaining an existing glyph selection. */
	bullets?: boolean;
	/** Physical points, independent of the drawing scale. */
	indentLeft?: number;
	horizontalAlign?: 'left' | 'center' | 'right' | 'justify';
	verticalAlign?: 'top' | 'middle' | 'bottom';
}
export interface VisioShapeFormatEdit extends Target {
	type: 'format-shape';
	fillColor?: string;
	/** The Theme Colors swatch `fillColor` came from: saved as its theme formula. */
	fillColorTheme?: VisioThemeColorRef;
	lineColor?: string;
	/** The Theme Colors swatch `lineColor` came from. */
	lineColorTheme?: VisioThemeColorRef;
	lineWeight?: number;
	/** Built-in line pattern: 0 hides the line, 1 is solid, 2-23 are dashes. */
	linePattern?: number;
	/** Percent transparency, normalized to native half-percent steps. */
	lineTransparency?: number;
	/** Arrowhead codes at the begin and end of the line: 0 is none, 1-45 are Visio's ends. */
	beginArrow?: number;
	endArrow?: number;
	/** Arrowhead sizes, 0 (very small) to 6 (colossal); 2 is Visio's medium. */
	beginArrowSize?: number;
	endArrowSize?: number;
	/** Line cap: 0 round, 1 square, 2 extended. */
	lineCap?: number;
	/** Corner rounding radius in points; 0 keeps square corners. */
	rounding?: number;
	/** Classic non-gradient fill pattern: 0 hides fill, 1 is solid, 2-24 are hatches. */
	fillPattern?: number;
	fillBackgroundColor?: string;
	/** Percent transparency applied to both foreground and background fill. */
	fillTransparency?: number;
	/** Theme Quick Style: a colour slot and a style matrix, clearing local paint overrides. */
	quickStyle?: VisioQuickStyle;
	/** Outer shadow preset; `none` turns the shape shadow off. */
	shadow?: VisioShadowPreset;
	/** Glow; size 0 removes it. */
	glow?: VisioGlowEffect;
	/** Soft edge radius in points; 0 removes it. */
	softEdges?: number;
	/** Reflection; size 0 removes it. */
	reflection?: VisioReflectionEffect;
}
export type VisioFormatEdit = VisioTextFormatEdit | VisioShapeFormatEdit;
export const isVisioFormatEdit = (edit: { type: string }): edit is VisioFormatEdit =>
	edit.type === 'format-text' || edit.type === 'format-shape';

export function snapshotFormatting(edit: VisioFormatEdit): VisioFormatEdit {
	const result: VisioFormatEdit = { type: edit.type, pageId: edit.pageId, shapeId: edit.shapeId };
	const points = (value: unknown, minimum: number, maximum: number) => {
		if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum)
			fail('INVALID_EDIT', 'Formatting point size is outside supported limits.');
		return value;
	};
	const color = (value: unknown, allowNone = false) => {
		if (
			typeof value !== 'string' ||
			(!(allowNone && value === 'none') && !/^#[0-9a-f]{6}$/i.test(value))
		)
			fail('INVALID_EDIT', 'Formatting colors require six hexadecimal digits.');
		return value.toLowerCase();
	};
	// A theme reference names where a colour came from; the colour itself is the cached value.
	const themed = (value: unknown, colour: string | undefined): VisioThemeColorRef => {
		if (!isVisioThemeColorRef(value) || colour === undefined || colour === 'none')
			fail('INVALID_EDIT', 'A theme colour needs a theme slot and the colour it stands for.');
		return { base: value.base, ...(value.tint ? { tint: value.tint } : {}) };
	};
	if (edit.type === 'format-text' && result.type === 'format-text') {
		if (edit.fontSize !== undefined) result.fontSize = points(edit.fontSize, 1, 1000);
		if (edit.fontColor !== undefined) result.fontColor = color(edit.fontColor);
		if (edit.fontColorTheme !== undefined)
			result.fontColorTheme = themed(edit.fontColorTheme, result.fontColor);
		if (edit.indentLeft !== undefined) result.indentLeft = points(edit.indentLeft, 0, 7200);
		if (edit.fontFamily !== undefined) {
			if (
				typeof edit.fontFamily !== 'string' ||
				!edit.fontFamily.trim() ||
				edit.fontFamily.length > 256 ||
				/[\u0000-\u001f\u007f]/.test(edit.fontFamily)
			)
				fail('INVALID_EDIT', 'Invalid font family.');
			result.fontFamily = edit.fontFamily;
		}
		for (const name of ['bold', 'italic', 'underline', 'strikethrough', 'bullets'] as const) {
			if (edit[name] === undefined) continue;
			if (typeof edit[name] !== 'boolean') fail('INVALID_EDIT', 'Text styles require booleans.');
			result[name] = edit[name];
		}
		if (edit.horizontalAlign !== undefined) {
			if (!['left', 'center', 'right', 'justify'].includes(edit.horizontalAlign))
				fail('INVALID_EDIT', 'Invalid horizontal alignment.');
			result.horizontalAlign = edit.horizontalAlign;
		}
		if (edit.verticalAlign !== undefined) {
			if (!['top', 'middle', 'bottom'].includes(edit.verticalAlign))
				fail('INVALID_EDIT', 'Invalid vertical alignment.');
			result.verticalAlign = edit.verticalAlign;
		}
		Object.assign(result, snapshotTextFormatExtras(edit));
	} else if (edit.type === 'format-shape' && result.type === 'format-shape') {
		if (edit.fillColor !== undefined) result.fillColor = color(edit.fillColor, true);
		if (edit.lineColor !== undefined) result.lineColor = color(edit.lineColor);
		if (edit.fillColorTheme !== undefined)
			result.fillColorTheme = themed(edit.fillColorTheme, result.fillColor);
		if (edit.lineColorTheme !== undefined)
			result.lineColorTheme = themed(edit.lineColorTheme, result.lineColor);
		if (edit.lineWeight !== undefined) result.lineWeight = points(edit.lineWeight, 0, 100);
		for (const [name, maximum] of [
			['linePattern', 23],
			['fillPattern', 24],
		] as const) {
			if (edit[name] === undefined) continue;
			const value = points(edit[name], 0, maximum);
			if (!Number.isInteger(value)) fail('INVALID_EDIT', 'Paint patterns require integers.');
			result[name] = value;
		}
		for (const [name, maximum, label] of [
			['beginArrow', 45, 'Arrowheads are numbered 0 to 45.'],
			['endArrow', 45, 'Arrowheads are numbered 0 to 45.'],
			['beginArrowSize', 6, 'Arrowhead sizes are numbered 0 to 6.'],
			['endArrowSize', 6, 'Arrowhead sizes are numbered 0 to 6.'],
			['lineCap', 2, 'Line caps are 0 (round), 1 (square) or 2 (extended).'],
		] as const) {
			const value = edit[name];
			if (value === undefined) continue;
			if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > maximum)
				fail('INVALID_EDIT', label);
			result[name] = value;
		}
		if (edit.rounding !== undefined) result.rounding = points(edit.rounding, 0, 720);
		for (const name of ['lineTransparency', 'fillTransparency'] as const)
			if (edit[name] !== undefined) result[name] = Math.round(points(edit[name], 0, 100) * 2) / 2;
		if (edit.fillBackgroundColor !== undefined)
			result.fillBackgroundColor = color(edit.fillBackgroundColor);
		if (edit.quickStyle !== undefined) {
			const { color: slot, matrix } = edit.quickStyle ?? {};
			if (
				!isVisioQuickStyleColor(slot) ||
				typeof matrix !== 'number' ||
				!Number.isInteger(matrix) ||
				matrix < 1 ||
				matrix > 6
			)
				fail('INVALID_EDIT', 'Quick Styles require a theme colour slot and a matrix of 1 to 6.');
			result.quickStyle = { color: slot, matrix };
			if (
				Object.keys(edit).some(
					(key) =>
						![
							'type',
							'pageId',
							'shapeId',
							'quickStyle',
							'shadow',
							'glow',
							'softEdges',
							'reflection',
						].includes(key) && edit[key as keyof VisioShapeFormatEdit] !== undefined,
				)
			)
				fail('INVALID_EDIT', 'A Quick Style replaces fill, line and font paint as a whole.');
		}
		if (edit.shadow !== undefined) {
			if (!isVisioShadowPreset(edit.shadow)) fail('INVALID_EDIT', 'Unknown shadow preset.');
			result.shadow = edit.shadow;
		}
		if (edit.glow !== undefined) result.glow = snapshotGlow(edit.glow);
		if (edit.softEdges !== undefined) result.softEdges = snapshotSoftEdges(edit.softEdges);
		if (edit.reflection !== undefined) result.reflection = snapshotReflection(edit.reflection);
		if (result.fillColor === 'none' && result.fillPattern !== undefined && result.fillPattern !== 0)
			fail('INVALID_EDIT', 'No fill conflicts with a visible fill pattern.');
	}
	if (Object.keys(result).length === 3)
		fail('INVALID_EDIT', 'Formatting requires at least one property.');
	return result;
}
