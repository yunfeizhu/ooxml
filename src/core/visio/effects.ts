import type { VisioGlow, VisioReflection } from './model';
import { number, type Cells, type Report } from './sheet';

/**
 * Saved Glow, Soft Edges and Reflection cells (Additional Effect Properties). Theme-selected
 * values (`Themed`) are left to the theme diagnostics; only explicit caches are drawn.
 * https://learn.microsoft.com/en-us/office/client-developer/visio/glowsize-cell-additional-effect-properties-section
 */
export function shapeEffects(
	cells: Cells,
	color: (name: string, fallback: string) => string,
	report: Report,
): { glow?: VisioGlow; softEdges?: number; reflection?: VisioReflection } {
	const explicit = (name: string) => cells.has(name) && cells.get(name)?.value !== 'Themed';
	const clamp = (value: number, maximum: number) => Math.max(0, Math.min(maximum, value));
	const result: { glow?: VisioGlow; softEdges?: number; reflection?: VisioReflection } = {};
	const glow = explicit('GlowSize') ? clamp(number(cells, 'GlowSize', 0, report), 2.5) : 0;
	if (glow > 0) {
		const opacity = 1 - clamp(number(cells, 'GlowColorTrans', 0, report), 1);
		if (opacity > 0) result.glow = { color: color('GlowColor', '#000000'), opacity, size: glow };
	}
	const soft = explicit('SoftEdgesSize') ? clamp(number(cells, 'SoftEdgesSize', 0, report), 2) : 0;
	if (soft > 0) result.softEdges = soft;
	const size = explicit('ReflectionSize')
		? clamp(number(cells, 'ReflectionSize', 0, report), 1)
		: 0;
	if (size > 0) {
		const opacity = 1 - clamp(number(cells, 'ReflectionTrans', 0, report), 1);
		if (opacity > 0)
			result.reflection = {
				opacity,
				size,
				distance: clamp(number(cells, 'ReflectionDist', 0, report), 2),
				blur: clamp(number(cells, 'ReflectionBlur', 0, report), 2),
			};
	}
	if (result.glow || result.softEdges || result.reflection)
		report(
			'unverified-effects',
			"Glow, soft edges and reflection are drawn with SVG filters and may differ from Microsoft Visio's rendering.",
		);
	return result;
}
