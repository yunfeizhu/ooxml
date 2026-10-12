import { escapeXmlAttr as esc } from '../opc/signature/xml-utils';
import type { ChartSvgGradientDef } from './gradient-definition';

/** Shared serialization for standalone chart SVGs and Office gallery previews. */
export function chartGradientMarkup(def: ChartSvgGradientDef): string {
	if (def.kind === 'rectPath')
		return `<pattern id="${esc(def.id)}" patternUnits="objectBoundingBox" patternContentUnits="objectBoundingBox" width="1" height="1"><image href="${esc(def.href)}" width="1" height="1" preserveAspectRatio="none"/></pattern>`;
	const geometry =
		def.kind === 'linearGradient'
			? `${def.gradientUnits ? `gradientUnits="${def.gradientUnits}" ` : ''}x1="${def.x1}" y1="${def.y1}" x2="${def.x2}" y2="${def.y2}"`
			: `cx="${def.cx}" cy="${def.cy}" r="${def.r}"`;
	const stops = def.stops
		.map(
			(stop) =>
				`<stop offset="${stop.offset}" stop-color="${esc(stop.color)}" stop-opacity="${stop.opacity ?? 1}"/>`,
		)
		.join('');
	const transform =
		def.kind === 'radialGradient' && def.gradientTransform
			? ` gradientTransform="${esc(def.gradientTransform)}"`
			: '';
	return `<${def.kind} id="${esc(def.id)}" ${geometry}${transform}>${stops}</${def.kind}>`;
}
