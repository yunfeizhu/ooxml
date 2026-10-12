import {
	getVisioPageLayers,
	resolveVisioPageVisibility,
	type VisioDocument,
	type VisioPage,
	type VisioShape,
	type VisioMatrix,
} from 'ooxml-core/visio';
import {
	layerOverrideMaps,
	hasVisibleShapeContent,
	EMPTY_LAYER_OVERRIDES,
	type LayerVisibilityOverride,
} from './viewer-layers';
import { visioLineJumpPaths } from 'ooxml-core/visio';
import { fillPaint, linePaint } from './render-fill';
import { renderImage } from './render-image';
import { renderForeignVectorShape } from './render-foreign-vector-shape';
import { ForeignVectorBudget } from 'ooxml-core/visio/ui';
import { RenderResources } from './render-resources';
import { applyArrowheads } from './arrowheads';
import {
	assertViewableDocument,
	composeVisioTransform,
	VISIO_IDENTITY_TRANSFORM,
	visioLineDashLengths,
	visioSvgStrokeStyle,
} from 'ooxml-core/visio/ui';
import { createTextLayoutBudget, type TextLayoutBudget } from './text-layout';
import { renderText } from './render-text';
import { renderShadow } from './render-shadow';
import { renderShapeEffects } from './render-effects';

const NS = 'http://www.w3.org/2000/svg';
export function svgElement<K extends keyof SVGElementTagNameMap>(name: K): SVGElementTagNameMap[K] {
	return document.createElementNS(NS, name);
}
export function safeColor(value: string, fallback = '#273c46'): string {
	return /^(#[\da-f]{3,8}|[a-z]+|(?:rgb|hsl)a?\([\d.,%\s+-]+\))$/i.test(value) ? value : fallback;
}
export function matrix(value: VisioMatrix): string {
	return `matrix(${value.map((number) => (Number.isFinite(number) ? number : 0)).join(' ')})`;
}
export interface RenderResult {
	svg: SVGSVGElement;
	warnings: string[];
	dispose(): void;
}
export interface RenderOptions {
	/** Temporary render layers share live resources without selection semantics. */
	interactive?: boolean;
	/** Static output embeds rasters and omits viewer selection semantics. Prefer exportPageSvg for bounded serialization. */
	static?: boolean;
	/** Optional viewer display state. Export/print snapshot APIs deliberately use saved display. */
	layerVisibilityOverrides?: readonly LayerVisibilityOverride[];
}
interface RenderContext {
	pageHeight: number;
	defs: SVGDefsElement;
	warnings: Set<string>;
	resources: RenderResources;
	nodes: number;
	textBudget: TextLayoutBudget;
	vectorBudget: ForeignVectorBudget;
	renderable: WeakMap<VisioShape, boolean>;
	visible: WeakMap<VisioShape, boolean> | undefined;
	interactive: boolean;
	static: boolean;
	/** Geometry paths with line jumps, for the connectors that cross another one. */
	jumps: Map<VisioShape, string[]>;
}
export function renderPage(
	model: VisioDocument,
	page: VisioPage,
	options: RenderOptions = {},
): RenderResult {
	assertViewableDocument(model);
	if (!model.pages.includes(page))
		throw new Error('The selected page does not belong to this document.');
	const overrides = layerOverrideMaps(
		model,
		options.layerVisibilityOverrides ?? EMPTY_LAYER_OVERRIDES,
	);
	const visible = overrides.size ? new WeakMap<VisioShape, boolean>() : undefined;
	const pages = getVisioPageLayers(model, page.id);
	for (const source of visible ? pages : []) {
		const layerVisibilityOverrides = overrides.get(source.id);
		for (const entry of resolveVisioPageVisibility(
			source,
			layerVisibilityOverrides ? { layerVisibilityOverrides } : {},
		))
			visible!.set(entry.shape, !entry.hidden);
	}
	const svg = svgElement('svg');
	if (!options.static) svg.classList.add('paper');
	svg.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns', NS);
	if (options.static)
		svg.setAttributeNS(
			'http://www.w3.org/2000/xmlns/',
			'xmlns:xlink',
			'http://www.w3.org/1999/xlink',
		);
	svg.setAttribute('viewBox', `0 0 ${page.width} ${page.height}`);
	svg.setAttribute('role', options.static ? 'img' : 'group');
	svg.setAttribute('aria-label', page.name);
	const title = svgElement('title');
	title.textContent = page.name;
	svg.append(title);
	const defs = svgElement('defs');
	svg.append(defs);
	const root = svgElement('g');
	root.setAttribute('transform', `translate(0 ${page.height}) scale(1 -1)`);
	svg.append(root);
	const context: RenderContext = {
		pageHeight: page.height,
		defs,
		warnings: new Set(),
		resources: new RenderResources(options.static ? defs : undefined),
		nodes: 0,
		textBudget: createTextLayoutBudget(),
		vectorBudget: new ForeignVectorBudget(),
		renderable: new WeakMap(),
		visible,
		interactive: !options.static && options.interactive !== false,
		static: options.static === true,
		jumps: new Map(),
	};
	try {
		for (const layer of pages) {
			// Each page (and background page) jumps by its own LineJumpCode and style.
			context.jumps = visioLineJumpPaths(layer);
			for (const shape of layer.shapes) drawShape(shape, root, context, layer.id);
		}
	} catch (error) {
		context.resources.dispose();
		throw error;
	}
	if (context.interactive) {
		const first = svg.querySelector<SVGGElement>('[data-shape-id]');
		first?.setAttribute('tabindex', '0');
	}
	return { svg, warnings: [...context.warnings], dispose: () => context.resources.dispose() };
}
function drawShape(
	shape: VisioShape,
	parent: SVGElement,
	context: RenderContext,
	pageId: string,
	parentTransform: VisioMatrix = VISIO_IDENTITY_TRANSFORM,
): void {
	if (!hasVisibleShapeContent(shape, context.visible, context.renderable)) return;
	if (++context.nodes > 50_000) {
		context.warnings.add(
			'Some drawing content was omitted because it exceeds the safe rendering node limit.',
		);
		return;
	}
	const group = svgElement('g');
	group.setAttribute('transform', matrix(shape.transform));
	if (context.interactive) {
		group.dataset.shapeId = shape.id;
		group.dataset.shapeName = shape.name;
		group.dataset.pageId = pageId;
		group.setAttribute('role', shape.kind === 'group' ? 'group' : 'button');
		group.setAttribute('tabindex', '-1');
		group.setAttribute('aria-label', shape.text.plainText || shape.name || `Shape ${shape.id}`);
	}
	const title = svgElement('title');
	// Visio shows the Comment cell as the shape's ScreenTip.
	title.textContent = shape.screenTip || shape.text.plainText || shape.name;
	group.append(title);
	parent.append(group);
	const world = composeVisioTransform(parentTransform, shape.transform);
	const own = () => drawOwn(shape, group, context, world);
	const children = () => {
		for (const child of shape.children) drawShape(child, group, context, pageId, world);
	};
	if (shape.kind === 'group' && shape.groupDisplayMode === 0) {
		children();
		return;
	}
	if (shape.kind === 'group' && shape.groupDisplayMode === 2) {
		children();
		own();
		return;
	}
	own();
	children();
}
function drawOwn(
	shape: VisioShape,
	group: SVGElement,
	context: RenderContext,
	world: VisioMatrix,
): void {
	const { warnings, defs, resources } = context;
	const lineStyle = context.static ? visioSvgStrokeStyle(shape.style) : shape.style;
	// A paint-free text box needs its text bounds as a pointer target, including gaps between glyphs.
	if (
		context.interactive &&
		shape.text.plainText &&
		!shape.geometry.some(
			(geometry) =>
				(geometry.fill && shape.style.fill !== 'none') ||
				(geometry.stroke && shape.style.linePattern !== 0),
		)
	) {
		const hit = svgElement('rect');
		hit.dataset.textHit = '';
		hit.setAttribute('transform', matrix(shape.text.transform));
		hit.setAttribute('width', String(shape.text.width));
		hit.setAttribute('height', String(shape.text.height));
		hit.setAttribute('fill', 'transparent');
		hit.setAttribute('pointer-events', 'all');
		hit.setAttribute('vector-effect', 'non-scaling-stroke');
		group.append(hit);
	}
	const fill = shape.geometry.some((geometry) => geometry.fill)
		? fillPaint(shape.style, defs, resources, world, context.pageHeight)
		: 'none';
	const stroke =
		shape.geometry.some((geometry) => geometry.stroke) && shape.style.linePattern !== 0
			? linePaint(lineStyle, defs, resources, world, context.pageHeight, [
					shape.width,
					shape.height,
				])
			: 'none';
	const paths: SVGPathElement[] = [];
	const jumps = context.jumps.get(shape);
	for (const [index, geometry] of shape.geometry.entries()) {
		if (++context.nodes > 50_000) {
			warnings.add(
				'Some drawing content was omitted because it exceeds the safe rendering node limit.',
			);
			return;
		}
		const path = svgElement('path');
		if (shape.style.fillPattern) path.setAttribute('shape-rendering', 'crispEdges');
		if (context.interactive) path.dataset.geometry = '';
		path.setAttribute('d', jumps?.[index] ?? geometry.path);
		if (jumps && context.interactive) path.dataset.lineJumps = '';
		path.setAttribute('fill', geometry.fill ? fill : 'none');
		path.setAttribute('fill-opacity', String(shape.style.fillOpacity));
		const stroked = geometry.stroke && shape.style.linePattern !== 0;
		path.setAttribute('stroke', stroked ? stroke : 'none');
		path.setAttribute('stroke-width', String(lineStyle.lineWidth));
		// On screen a stroke is at least one pixel (the canvas sets --vv-hairline); exports and
		// prints keep the saved width.
		if (context.interactive)
			path.style.strokeWidth = `max(${lineStyle.lineWidth}, var(--vv-hairline, 0))`;
		path.setAttribute('stroke-opacity', String(shape.style.lineOpacity));
		path.setAttribute('stroke-linejoin', 'round');
		path.setAttribute('stroke-linecap', shape.style.lineCap ?? 'round');
		if (stroked && shape.style.linePattern > 1) {
			const dash = visioLineDashLengths(lineStyle);
			if (dash) {
				path.setAttribute('stroke-dasharray', dash.join(' '));
			} else warnings.add('An unresolved line pattern is shown as a solid stroke.');
		}
		if (stroked) applyArrowheads(path, lineStyle, defs, warnings);
		group.append(path);
		paths.push(path);
	}
	const effects = renderShapeEffects(shape, paths, defs, world);
	for (const layer of effects.below) group.insertBefore(layer, paths[0]!);
	if (effects.geometryFilter)
		for (const path of paths) path.setAttribute('filter', effects.geometryFilter);
	const shadow = renderShadow(shape, paths, defs, world);
	if (shadow) group.insertBefore(shadow, effects.below[0] ?? paths[0]!);
	const raster = renderImage(shape, resources);
	if (raster) group.append(raster);
	const vector = renderForeignVectorShape(shape, context.vectorBudget);
	if (vector) group.append(vector);
	if (shape.text.plainText) group.append(renderText(shape.text, warnings, context.textBudget));
	if (shape.kind === 'foreign' && !shape.image && !shape.foreignVector)
		warnings.add('Embedded or foreign objects are not rendered in this build.');
}
