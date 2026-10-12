import {
	visioGlowKey,
	visioReflectionKey,
	visioShapeEffectValues,
	visioShapeFormattingState,
} from 'ooxml-core/visio/ui';
import {
	VISIO_GLOW_SIZES,
	VISIO_REFLECTION_PRESETS,
	VISIO_SOFT_EDGE_SIZES,
	visioFallbackQuickStyle,
	type VisioPage,
	type VisioQuickStyleColor,
	type VisioShape,
} from 'ooxml-core/visio';
import type { OfficeUiGallery } from '../ribbon/gallery';
import type { RibbonCommand } from './ribbon-parts';
import {
	effectsOptions,
	glowItemId,
	QUICK_STYLES_HINT,
	quickStyleGalleryState,
	reflectionItemId,
	softEdgesItemId,
} from './ribbon-shape-styles';

/** Accent 1-6 of the page theme, or the Office colours a theme-less drawing uses. */
export function pageAccentColor(page: VisioPage | undefined, accent: number): string {
	return (
		page?.theme?.accents[accent - 1] ??
		visioFallbackQuickStyle({ color: (accent + 1) as VisioQuickStyleColor, matrix: 4 }).fill
	);
}

/**
 * Selection state for Home > Shape Styles: the Quick Styles gallery and the Effects presets follow
 * the same admission as Fill and Line. Bevel and 3-D Rotation keep their reasons.
 */
export function renderShapeStyleControls(
	root: ShadowRoot,
	shapes: readonly VisioShape[],
	reason: string,
	set: (element: RibbonCommand | null, reason: string) => void,
	page?: VisioPage,
): void {
	const gallery = root.querySelector<OfficeUiGallery>(
		'office-ui-gallery[data-menu="quick-styles"]',
	);
	if (gallery) {
		const disabled = !!reason;
		if (gallery.state?.disabled !== disabled) gallery.state = quickStyleGalleryState(disabled);
		gallery.toggleAttribute('disabled', disabled);
		gallery.title = disabled ? `Quick Styles: ${reason}` : QUICK_STYLES_HINT;
	}
	set(root.querySelector('[data-menu="effects"]'), reason);
	const shadow = effectsOptions().find((item) => item.id === 'shadow');
	const current = reason ? undefined : visioShapeFormattingState(shapes).shadowPreset;
	for (const item of shadow?.items ?? []) {
		const element = root.querySelector<RibbonCommand>(`[command="${item.id}"]`);
		set(element, reason);
		if (element && item.action?.type === 'shape-format')
			element.setAttribute('checked', String(current === item.action.patch.shadow));
	}
	const common = (values: readonly string[]) =>
		!reason && values.length && values.every((value) => value === values[0])
			? values[0]
			: undefined;
	const glow = common(shapes.map(visioGlowKey));
	const soft = common(shapes.map((shape) => String(visioShapeEffectValues(shape).softEdges)));
	const reflection = common(shapes.map(visioReflectionKey));
	const check = (id: string, checked: boolean) => {
		const element = root.querySelector<RibbonCommand>(`[command="${id}"]`);
		set(element, reason);
		element?.setAttribute('checked', String(checked));
	};
	for (const id of ['shadow', 'glow', 'soft-edges', 'reflection'])
		set(root.querySelector(`[data-menu="${id}"]`), reason);
	for (const size of VISIO_GLOW_SIZES)
		set(root.querySelector(`[data-menu="glow-size-${size}"]`), reason);
	for (const id of ['shadow-options', 'glow-options', 'soft-edges-options', 'reflection-options'])
		set(root.querySelector(`[command="${id}"]`), reason);
	check('glow-none', glow === 'none');
	for (const size of VISIO_GLOW_SIZES)
		for (let accent = 1; accent <= 6; accent++)
			check(glowItemId(size, accent), glow === `${size}-${pageAccentColor(page, accent)}`);
	for (const size of [0, ...VISIO_SOFT_EDGE_SIZES])
		check(softEdgesItemId(size), soft === String(size));
	check(reflectionItemId('none'), reflection === 'none');
	for (const preset of VISIO_REFLECTION_PRESETS)
		check(reflectionItemId(preset.id), reflection === preset.id);
}
