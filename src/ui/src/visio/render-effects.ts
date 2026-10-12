import type { VisioMatrix, VisioShape } from 'ooxml-core/visio';
import { safeColor, svgElement } from './render-svg';

let effectId = 0;
const COPIED = ['stroke-width', 'stroke-linejoin', 'stroke-linecap', 'stroke-dasharray'];

/** Filter bounds in the shape's local inches, padded by `pad`. */
function bounds(filter: SVGFilterElement, shape: VisioShape, pad: number): void {
	filter.setAttribute('filterUnits', 'userSpaceOnUse');
	filter.setAttribute('x', String(Math.min(0, shape.width) - pad));
	filter.setAttribute('y', String(Math.min(0, shape.height) - pad));
	filter.setAttribute('width', String(Math.abs(shape.width) + pad * 2));
	filter.setAttribute('height', String(Math.abs(shape.height) + pad * 2));
}
function primitive<K extends keyof SVGElementTagNameMap>(
	filter: SVGFilterElement,
	name: K,
	attributes: Record<string, string | number>,
): SVGElementTagNameMap[K] {
	const node = svgElement(name);
	for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
	filter.append(node);
	return node;
}
/** The local scale of the shape's world transform, to keep effect sizes in page inches. */
const scale = (world: VisioMatrix) =>
	Math.sqrt(Math.abs(world[0] * world[3] - world[1] * world[2])) || 1;
function copies(
	paths: readonly SVGPathElement[],
	paint: (source: SVGPathElement) => [string, string],
) {
	return paths.map((source) => {
		const path = svgElement('path');
		path.setAttribute('d', source.getAttribute('d') ?? '');
		const [fill, stroke] = paint(source);
		path.setAttribute('fill', fill);
		path.setAttribute('stroke', stroke);
		for (const name of COPIED) {
			const value = source.getAttribute(name);
			if (value !== null) path.setAttribute(name, value);
		}
		return path;
	});
}

/**
 * Glow: the shape's outline in the glow colour, dilated by the glow size and blurred, drawn
 * beneath the shape. Soft edges: the shape's geometry masked by its own eroded, blurred alpha.
 * Reflection: a copy mirrored about the shape's bottom edge, faded by a gradient mask.
 */
export function renderShapeEffects(
	shape: VisioShape,
	paths: readonly SVGPathElement[],
	defs: SVGDefsElement,
	world: VisioMatrix,
): { below: SVGGElement[]; geometryFilter?: string } {
	const { glow, softEdges, reflection } = shape.style;
	const below: SVGGElement[] = [];
	if (!paths.length) return { below };
	const unit = scale(world);
	if (reflection) {
		const group = svgElement('g');
		group.dataset.reflection = '';
		group.setAttribute('pointer-events', 'none');
		group.setAttribute('aria-hidden', 'true');
		const distance = reflection.distance / unit;
		const height = Math.max(Math.abs(shape.height), 1e-6);
		// Local y is up and the bottom edge is y = 0: mirror below it, `distance` further down.
		group.setAttribute('transform', `matrix(1 0 0 -1 0 ${-distance})`);
		const mask = svgElement('mask');
		mask.id = `visio-reflection-${++effectId}`;
		mask.setAttribute('maskUnits', 'userSpaceOnUse');
		mask.setAttribute('maskContentUnits', 'userSpaceOnUse');
		const gradient = svgElement('linearGradient');
		gradient.id = `${mask.id}-fade`;
		gradient.setAttribute('gradientUnits', 'userSpaceOnUse');
		for (const [name, value] of [
			['x1', 0],
			['y1', 0],
			['x2', 0],
			['y2', height * reflection.size],
		] as const)
			gradient.setAttribute(name, String(value));
		for (const [offset, opacity] of [
			[0, reflection.opacity],
			[1, 0],
		] as const) {
			const stop = svgElement('stop');
			stop.setAttribute('offset', String(offset));
			stop.setAttribute('stop-color', '#ffffff');
			stop.setAttribute('stop-opacity', String(opacity));
			gradient.append(stop);
		}
		const pad = Math.max(Math.abs(shape.width), height);
		const rect = svgElement('rect');
		for (const [name, value] of [
			['x', Math.min(0, shape.width) - pad],
			['y', -pad],
			['width', Math.abs(shape.width) + pad * 2],
			['height', height + pad * 2],
		] as const)
			rect.setAttribute(name, String(value));
		rect.setAttribute('fill', `url(#${gradient.id})`);
		mask.append(rect);
		defs.append(gradient, mask);
		group.setAttribute('mask', `url(#${mask.id})`);
		const blur = reflection.blur / unit;
		const content = svgElement('g');
		if (blur > 0) {
			const filter = svgElement('filter');
			filter.id = `visio-reflection-blur-${++effectId}`;
			bounds(filter, shape, blur * 3);
			primitive(filter, 'feGaussianBlur', { stdDeviation: blur / 2 });
			defs.append(filter);
			content.setAttribute('filter', `url(#${filter.id})`);
		}
		content.append(
			...copies(paths, (source) => [
				source.getAttribute('fill') ?? 'none',
				source.getAttribute('stroke') ?? 'none',
			]),
		);
		group.append(content);
		below.push(group);
	}
	if (glow) {
		const size = glow.size / unit;
		const group = svgElement('g');
		group.dataset.glow = '';
		group.setAttribute('pointer-events', 'none');
		group.setAttribute('aria-hidden', 'true');
		group.setAttribute('opacity', String(glow.opacity));
		const filter = svgElement('filter');
		filter.id = `visio-glow-${++effectId}`;
		bounds(filter, shape, size * 3);
		primitive(filter, 'feMorphology', {
			in: 'SourceGraphic',
			operator: 'dilate',
			radius: size / 2,
		});
		primitive(filter, 'feGaussianBlur', { stdDeviation: size / 2 });
		defs.append(filter);
		group.setAttribute('filter', `url(#${filter.id})`);
		const color = safeColor(glow.color, '#000000');
		group.append(
			...copies(paths, (source) => [
				source.getAttribute('fill') === 'none' ? 'none' : color,
				!source.getAttribute('stroke') || source.getAttribute('stroke') === 'none' ? 'none' : color,
			]),
		);
		below.push(group);
	}
	if (!softEdges) return { below };
	const radius = softEdges / unit;
	const filter = svgElement('filter');
	filter.id = `visio-soft-edges-${++effectId}`;
	bounds(filter, shape, radius);
	primitive(filter, 'feMorphology', {
		in: 'SourceAlpha',
		operator: 'erode',
		radius: radius / 2,
		result: 'inner',
	});
	primitive(filter, 'feGaussianBlur', { in: 'inner', stdDeviation: radius / 2, result: 'edge' });
	primitive(filter, 'feComposite', { in: 'SourceGraphic', in2: 'edge', operator: 'in' });
	defs.append(filter);
	return { below, geometryFilter: `url(#${filter.id})` };
}
