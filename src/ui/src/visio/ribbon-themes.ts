import {
	VISIO_BUILT_IN_THEMES,
	isVisioBuiltInThemeId,
	visioThemeVariantColors,
	type VisioBuiltInTheme,
	type VisioPageTheme,
} from 'ooxml-core/visio';
import type { OfficeGalleryState, OfficeUiGallery } from '../ribbon/gallery';
import { emitRibbonAction } from './ribbon-action';
import { INLINE_GALLERY_STEPS, inlineGallery } from './ribbon-inline-galleries';
import { menu, type CommandSpec } from './ribbon-parts';

export const THEMES_HINT =
	'Apply a theme to the current page. Quick-styled shapes take its colours; text keeps its own font.';
export const VARIANTS_HINT = "Pick one of the current theme's four colour variants.";
export const NO_THEME_VARIANTS = 'Apply a theme to the page first.';
/** Design > Variants > More: which theme parts can be changed separately. */
export const VARIANT_OPTION_REASONS: readonly [id: string, label: string, reason: string][] = [
	[
		'theme-colors',
		'Colors',
		'Custom theme colour sets are not written yet; pick a theme or variant.',
	],
	[
		'theme-fonts',
		'Fonts',
		'Theme fonts are written to the theme part, but text does not follow theme fonts yet.',
	],
	['theme-effects', 'Effects', 'Theme effect styles are not rendered yet.'],
	['theme-connectors', 'Connectors', 'Theme connector styles cannot be chosen separately yet.'],
	['theme-embellishment', 'Embellishment', 'Embellishment needs theme-driven shape geometry.'],
];

const escape = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
const color = (value: string) =>
	/^#?[0-9a-f]{6}$/i.test(value) ? `#${value.replace('#', '')}` : '#808080';
const bars = (colors: readonly string[], y: number, height: number) =>
	colors
		.map(
			(value, index) =>
				`<rect x="${4 + index * 14}" y="${y}" width="13" height="${height}" fill="${color(value)}"/>`,
		)
		.join('');

function themePreview(theme: VisioBuiltInTheme): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 44"><rect x="0.5" y="0.5" width="63" height="43" fill="#${theme.colors[1]}" stroke="#c8c8c8"/><text x="6" y="22" font-size="15" font-family="${escape(theme.fonts.major)}, sans-serif" fill="#${theme.colors[2]}">Aa</text>${bars(theme.colors.slice(4, 8), 30, 9)}</svg>`;
}
const NONE_PREVIEW =
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 44"><rect x="0.5" y="0.5" width="63" height="43" fill="#ffffff" stroke="#c8c8c8"/><text x="6" y="22" font-size="15" font-family="Calibri, sans-serif" fill="#000000">Aa</text><rect x="4" y="30" width="55" height="9" fill="none" stroke="#000000"/></svg>';

export const themeItemId = (id: string) => `theme-${id}`;
export const variantItemId = (index: number) => `variant-${index}`;

/** Themes gallery: No Theme, then the built-in themes; the page's theme is marked applied. */
export function themesGalleryState(
	disabled: boolean,
	current: VisioPageTheme | undefined,
): OfficeGalleryState {
	const items = [
		{ id: themeItemId('none'), label: 'No Theme', applied: !current, preview: NONE_PREVIEW },
		...VISIO_BUILT_IN_THEMES.map((theme) => ({
			id: themeItemId(theme.id),
			label: theme.name,
			applied: current?.builtIn === theme.id,
			preview: themePreview(theme),
		})),
	];
	// The ribbon row starts at the applied theme when it lies beyond the first tiles, so the
	// page's theme stays in view however few tiles fit.
	const row = INLINE_GALLERY_STEPS.themes![0]![1];
	const applied = items.findIndex((item) => item.applied);
	const start = applied < row ? 0 : Math.min(applied, items.length - row);
	return {
		id: 'themes',
		label: 'Themes',
		disabled,
		inline: items.slice(start, start + row),
		sections: [{ title: 'Office', columns: 4, tileWidth: 64, tileHeight: 44, items }],
	};
}

const blankVariant = (index: number) => ({
	id: variantItemId(index),
	label: `Variant ${index + 1}`,
	preview:
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 44"><rect x="0.5" y="0.5" width="63" height="43" fill="#ffffff" stroke="#c8c8c8"/></svg>',
});

/** Variants gallery: the page theme's four variants, previewed by their first variant colours. */
export function variantsGalleryState(
	disabled: boolean,
	current: VisioPageTheme | undefined,
): OfficeGalleryState {
	const builtIn = VISIO_BUILT_IN_THEMES.find((theme) => theme.id === current?.builtIn);
	const variants = current
		? [0, 1, 2, 3].map(
				(index) =>
					current.variants[index] ?? (builtIn ? visioThemeVariantColors(builtIn, index) : []),
			)
		: [];
	return {
		id: 'variants',
		label: 'Variants',
		disabled: disabled || !current,
		// A page without a theme has no variants: the row keeps four empty, disabled tiles.
		...(current ? {} : { inline: [0, 1, 2, 3].map(blankVariant) }),
		sections: [
			{
				columns: 4,
				tileWidth: 64,
				tileHeight: 44,
				items: variants
					.map((colors, index) => ({ colors, index }))
					.filter(({ colors }) => colors.length)
					.map(({ colors, index }) => ({
						id: variantItemId(index),
						label: `${current!.name} variant ${index + 1}`,
						applied: current!.variant === index,
						preview: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 44"><rect x="0.5" y="0.5" width="63" height="43" fill="#ffffff" stroke="#c8c8c8"/><rect x="4" y="4" width="55" height="22" fill="${color(colors[0]!)}"/>${bars(colors.slice(1, 5), 30, 9)}</svg>`,
					})),
			},
		],
	};
}

function gallery(doc: Document, state: OfficeGalleryState, icon: string, hint: string) {
	const element = doc.createElement('office-ui-gallery') as OfficeUiGallery;
	element.dataset.menu = state.id;
	inlineGallery(element, state.id);
	element.setAttribute('icon', icon);
	element.setAttribute('label', state.label);
	element.title = hint;
	element.state = state;
	element.toggleAttribute('disabled', true);
	element.addEventListener('office-gallery-pick', (event) => {
		event.stopPropagation();
		if (element.hasAttribute('disabled')) return;
		const id = (event as CustomEvent<{ itemId: string }>).detail.itemId;
		const theme = /^theme-(.+)$/.exec(id)?.[1];
		const variant = /^variant-([0-3])$/.exec(id)?.[1];
		if (theme === 'none' || isVisioBuiltInThemeId(theme))
			emitRibbonAction(element, { type: 'page-theme', theme });
		else if (variant !== undefined)
			emitRibbonAction(element, { type: 'page-theme', variant: Number(variant) });
	});
	// KeyTips activate a control by clicking its host; open the dropdown for them.
	element.addEventListener('click', (event) => {
		if (event.target === element && !element.hasAttribute('disabled')) element.open = !element.open;
	});
	return element;
}

export const themesGallery = (doc: Document) =>
	gallery(doc, themesGalleryState(true, undefined), 'quickStyles', THEMES_HINT);
export const variantsGallery = (doc: Document) =>
	gallery(doc, variantsGalleryState(true, undefined), 'effects', VARIANTS_HINT);
/** Variants > More: Colors, Fonts, Effects, Connectors and Embellishment, disabled with reasons. */
export function variantOptions(doc: Document) {
	const items: CommandSpec[] = VARIANT_OPTION_REASONS.map(([id, label, unsupported]) => ({
		id,
		label,
		unsupported,
	}));
	return menu(doc, {
		id: 'variant-options',
		label: 'More Variants',
		icon: 'settings',
		size: 'small',
		items,
	});
}
