import type { VisioShape } from '../model';
import {
	VISIO_REFLECTION_PRESETS,
	type VisioGlowEffect,
	type VisioReflectionEffect,
} from '../edit-formatting-glow';

/** A shape's glow, soft edges and reflection in the units the effect edits use. */
export interface VisioShapeEffectValues {
	glow: VisioGlowEffect;
	/** Points. */
	softEdges: number;
	reflection: VisioReflectionEffect;
}
const round = (value: number, step = 100) => Math.round(value * step) / step;

export function visioShapeEffectValues(shape: VisioShape): VisioShapeEffectValues {
	const { glow, softEdges, reflection } = shape.style;
	return {
		glow: glow
			? {
					size: round(glow.size * 72),
					color: glow.color.toLowerCase(),
					transparency: round((1 - glow.opacity) * 100),
				}
			: { size: 0, color: '#000000', transparency: 0 },
		softEdges: round((softEdges ?? 0) * 72),
		reflection: reflection
			? {
					size: round(reflection.size * 100),
					transparency: round((1 - reflection.opacity) * 100),
					distance: round(reflection.distance * 72),
					blur: round(reflection.blur * 72),
				}
			: { size: 0, transparency: 0, distance: 0, blur: 0 },
	};
}

/** Stable gallery keys: `none`, `<size>-<color>` for glows, a reflection preset id or `custom`. */
export function visioGlowKey(shape: VisioShape): string {
	const { glow } = visioShapeEffectValues(shape);
	return glow.size ? `${glow.size}-${glow.color}` : 'none';
}
export function visioReflectionKey(shape: VisioShape): string {
	const { reflection } = visioShapeEffectValues(shape);
	if (!reflection.size) return 'none';
	const near = (left: number, right: number) => Math.abs(left - right) < 0.01;
	return (
		VISIO_REFLECTION_PRESETS.find(
			(preset) =>
				near(preset.size, reflection.size) &&
				near(preset.transparency, reflection.transparency) &&
				near(preset.distance, reflection.distance) &&
				near(preset.blur, reflection.blur),
		)?.id ?? 'custom'
	);
}
