import { buildChartViewModel, resolveChartPalette } from 'ooxml-ui/pptx';
import type { ChartViewModel } from 'ooxml-ui/pptx';
/**
 * Vue adapter for the framework-agnostic chart view-model engine.
 *
 * `pptx-viewer-shared`'s `buildChartViewModel` projects a chart `PptxElement`
 * into a `ChartViewModel` of pure `SvgPrimitive` descriptors. `ChartViewModelSvg.vue`
 * maps that descriptor list to Vue template SVG, mirroring React's
 * `chart-view-model-render.tsx`, so React, Vue and Angular share one
 * geometry / layout / data engine and only the markup emission stays
 * per-framework.
 *
 * Colour preservation: the shared engine resolves series colours from
 * `chartData.colorPalette` (falling back to its own Office-accent default).
 * Vue historically resolves colours via the style-id-aware palette
 * (`getChartStylePalette` / `seriesColor(series, i, styleId, palette)` in
 * `chart-helpers.ts`). To keep Vue's colours unchanged while aligning only the
 * geometry, `buildVueChartViewModel` resolves Vue's palette and injects it as
 * `colorPalette` before invoking the shared builder.
 *
 * @module chart-view-model
 */
import type { PptxChartData, PptxElement } from 'pptx-viewer-core';

/**
 * The colour palette Vue paints a chart with: the shared `resolveChartPalette`
 * (the parsed colour-style palette, else the chart style over the deck theme's
 * accents), so Vue cannot drift from the other bindings.
 */
export function resolveVuePalette(chartData: PptxChartData): string[] {
	return resolveChartPalette(chartData);
}

/**
 * Build the shared `ChartViewModel` for a chart element using Vue's resolved
 * palette. The element's `chartData.colorPalette` is overlaid (non-destructively)
 * with Vue's palette so the shared engine's `seriesColor` / `paletteColor`
 * produce Vue's historical colours; only geometry aligns across frameworks.
 */
export function buildVueChartViewModel(element: PptxElement): ChartViewModel {
	if (element.type !== 'chart' || !element.chartData) {
		return buildChartViewModel(element);
	}
	const palette = resolveVuePalette(element.chartData);
	const themedElement: PptxElement = {
		...element,
		chartData: { ...element.chartData, colorPalette: palette },
	};
	return buildChartViewModel(themedElement);
}
