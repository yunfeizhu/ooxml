/**
 * Home > Effects: Glow, Soft Edges and Reflection. Visio keeps them in shape cells:
 * GlowColor, GlowColorTrans and GlowSize; SoftEdgesSize; ReflectionTrans, ReflectionSize,
 * ReflectionDist and ReflectionBlur.
 * https://learn.microsoft.com/en-us/office/client-developer/visio/glowsize-cell-additional-effect-properties-section
 * https://learn.microsoft.com/en-us/office/client-developer/visio/softedgessize-cell-additional-effect-properties-section
 * https://learn.microsoft.com/en-us/office/client-developer/visio/reflectionsize-cell-additional-effect-properties-section
 */
import { fail } from './package-common';
import type { FormattingWrite } from './edit-formatting';

/** A glow around the shape. Size and transparency 0 to 100 points and percent. */
export interface VisioGlowEffect {
	/** Points; 0 removes the glow. */
	size: number;
	color: string;
	/** Percent. */
	transparency: number;
}
/** A faded mirror image below the shape. */
export interface VisioReflectionEffect {
	/** Percent of the shape height the reflection shows; 0 removes it. */
	size: number;
	/** Percent transparency where the reflection starts. */
	transparency: number;
	/** Points between the shape and its reflection. */
	distance: number;
	/** Points of blur. */
	blur: number;
}

/** Glow gallery sizes in points, as Visio's Glow Variations. */
export const VISIO_GLOW_SIZES = [5, 8, 11, 18] as const;
/** Transparency of the gallery glows, in percent. */
export const VISIO_GLOW_TRANSPARENCY = 60;
/** Soft Edges gallery sizes in points. */
export const VISIO_SOFT_EDGE_SIZES = [1, 2.5, 5, 10, 25, 50] as const;
/** Reflection Variations: tight, half and full, touching or offset by 4 or 8 points. */
export const VISIO_REFLECTION_PRESETS: readonly (VisioReflectionEffect & {
	id: string;
	label: string;
})[] = [0, 4, 8].flatMap((distance) =>
	(
		[
			['tight', 'Tight', 35],
			['half', 'Half', 55],
			['full', 'Full', 90],
		] as const
	).map(([id, name, size]) => ({
		id: `${id}-${distance}`,
		label: `${name} Reflection, ${distance ? `${distance} pt offset` : 'touching'}`,
		size,
		transparency: 50,
		distance,
		blur: 0.5,
	})),
);

const bounded = (value: unknown, maximum: number, message: string): number => {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > maximum)
		fail('INVALID_EDIT', message);
	return Math.round(value * 100) / 100;
};
export function snapshotGlow(value: VisioGlowEffect): VisioGlowEffect {
	if (!value || typeof value !== 'object') fail('INVALID_EDIT', 'Glow needs a size and colour.');
	if (typeof value.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(value.color))
		fail('INVALID_EDIT', 'Glow colours require six hexadecimal digits.');
	return {
		size: bounded(value.size, 150, 'Glow size must be 0 to 150 points.'),
		color: value.color.toLowerCase(),
		transparency: bounded(value.transparency, 100, 'Glow transparency must be 0 to 100%.'),
	};
}
export function snapshotSoftEdges(value: number): number {
	return bounded(value, 100, 'Soft edges must be 0 to 100 points.');
}
export function snapshotReflection(value: VisioReflectionEffect): VisioReflectionEffect {
	if (!value || typeof value !== 'object') fail('INVALID_EDIT', 'Reflection needs its values.');
	return {
		size: bounded(value.size, 100, 'Reflection size must be 0 to 100%.'),
		transparency: bounded(value.transparency, 100, 'Reflection transparency must be 0 to 100%.'),
		distance: bounded(value.distance, 100, 'Reflection distance must be 0 to 100 points.'),
		blur: bounded(value.blur, 100, 'Reflection blur must be 0 to 100 points.'),
	};
}

type Add = (
	name: string,
	value: string | number,
	category: FormattingWrite['category'],
	unit?: string,
	formula?: string,
) => void;
const rgb = (color: string) =>
	`RGB(${[1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16)).join(',')})`;

/** Cell writes for the effects an edit sets; lengths are written in points as Visio does. */
export function effectWrites(
	edit: { glow?: VisioGlowEffect; softEdges?: number; reflection?: VisioReflectionEffect },
	add: Add,
): void {
	if (edit.glow) {
		add('GlowSize', edit.glow.size / 72, 'FillStyle', 'PT');
		if (edit.glow.size > 0) {
			add('GlowColor', edit.glow.color, 'FillStyle', undefined, rgb(edit.glow.color));
			add('GlowColorTrans', edit.glow.transparency / 100, 'FillStyle');
		}
	}
	if (edit.softEdges !== undefined) add('SoftEdgesSize', edit.softEdges / 72, 'FillStyle', 'PT');
	if (edit.reflection) {
		add('ReflectionSize', edit.reflection.size / 100, 'FillStyle');
		if (edit.reflection.size > 0) {
			add('ReflectionTrans', edit.reflection.transparency / 100, 'FillStyle');
			add('ReflectionDist', edit.reflection.distance / 72, 'FillStyle', 'PT');
			add('ReflectionBlur', edit.reflection.blur / 72, 'FillStyle', 'PT');
		}
	}
}
