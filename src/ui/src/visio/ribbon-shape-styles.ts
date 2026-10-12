import {
	VISIO_GLOW_SIZES,
	VISIO_QUICK_STYLE_COLORS,
	VISIO_REFLECTION_PRESETS,
	VISIO_SHADOW_PRESETS,
	VISIO_SOFT_EDGE_SIZES,
	visioFallbackQuickStyle,
	type VisioQuickStyleColor,
	type VisioShadowPreset,
} from 'ooxml-core/visio';
import type { OfficeGalleryItem, OfficeGalleryState, OfficeUiGallery } from '../ribbon/gallery';
import { emitRibbonAction } from './ribbon-action';
import { inlineGallery } from './ribbon-inline-galleries';
import type { CommandSpec } from './ribbon-parts';

const COLOR_NAMES: Readonly<Partial<Record<VisioQuickStyleColor, string>>> = {
	0: 'Dark',
	2: 'Accent 1',
	3: 'Accent 2',
	4: 'Accent 3',
	5: 'Accent 4',
	6: 'Accent 5',
	7: 'Accent 6',
};
const MATRIX_NAMES = ['Subtle', 'Refined', 'Balanced', 'Moderate', 'Focused', 'Intense'];
const SHADOW_NAMES: Readonly<Record<VisioShadowPreset, string>> = {
	none: 'No Shadow',
	'bottom-right': 'Offset: Bottom Right',
	bottom: 'Offset: Bottom',
	'bottom-left': 'Offset: Bottom Left',
	right: 'Offset: Right',
	center: 'Offset: Center',
	left: 'Offset: Left',
	'top-right': 'Offset: Top Right',
	top: 'Offset: Top',
	'top-left': 'Offset: Top Left',
};
export const QUICK_STYLES_HINT =
	"Theme styles from the drawing's theme. A drawing without a theme gets the fixed Office colours shown here.";

/** Stable gallery item id for a colour slot and style matrix. */
export const quickStyleItemId = (color: VisioQuickStyleColor, matrix: number) =>
	`quick-style-${color}-${matrix}`;

function preview(color: VisioQuickStyleColor, matrix: number): string {
	const { fill, line, font } = visioFallbackQuickStyle({ color, matrix });
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 28"><rect x="2" y="2" width="36" height="24" rx="2" fill="${fill}" stroke="${line}" stroke-width="2"/><text x="20" y="18.5" font-size="10" font-family="Segoe UI, sans-serif" text-anchor="middle" fill="${font}">Abc</text></svg>`;
}

/** The gallery's items: one row per style matrix, one column per theme colour, as in Visio. */
export function quickStyleItems(): OfficeGalleryItem[] {
	return MATRIX_NAMES.flatMap((name, row) =>
		VISIO_QUICK_STYLE_COLORS.map((color) => ({
			id: quickStyleItemId(color, row + 1),
			label: `${COLOR_NAMES[color] ?? 'Variant'}, ${name}`,
			preview: preview(color, row + 1),
		})),
	);
}

export function quickStyleGalleryState(disabled: boolean): OfficeGalleryState {
	const items = quickStyleItems();
	return {
		id: 'quick-styles',
		label: 'Quick Styles',
		disabled,
		// The ribbon row is the first style row, one tile per theme colour, as in Visio.
		inline: items.slice(0, VISIO_QUICK_STYLE_COLORS.length),
		sections: [
			{
				title: 'Theme Styles',
				columns: 7,
				tileWidth: 40,
				tileHeight: 28,
				items,
			},
		],
	};
}

/**
 * Home > Shape Styles > Quick Styles: the shared Office gallery, shown as Visio's row of tiles with
 * a More button, raising typed format actions.
 */
export function quickStyleGallery(doc: Document): HTMLElement {
	const gallery = doc.createElement('office-ui-gallery') as OfficeUiGallery;
	gallery.dataset.menu = 'quick-styles';
	inlineGallery(gallery, 'quick-styles');
	gallery.setAttribute('icon', 'quickStyles');
	gallery.setAttribute('label', 'Quick Styles');
	gallery.title = QUICK_STYLES_HINT;
	gallery.state = quickStyleGalleryState(true);
	gallery.toggleAttribute('disabled', true);
	gallery.addEventListener('office-gallery-pick', (event) => {
		event.stopPropagation();
		const match = /^quick-style-(\d+)-(\d+)$/.exec(
			(event as CustomEvent<{ itemId: string }>).detail.itemId,
		);
		if (!match || gallery.hasAttribute('disabled')) return;
		const color = Number(match[1]) as VisioQuickStyleColor;
		emitRibbonAction(gallery, {
			type: 'shape-format',
			patch: { quickStyle: { color, matrix: Number(match[2]) } },
		});
	});
	// KeyTips activate a control by clicking its host; open the dropdown for them.
	gallery.addEventListener('click', (event) => {
		if (event.target === gallery && !gallery.hasAttribute('disabled')) gallery.open = !gallery.open;
	});
	return gallery;
}

const EFFECT_REASONS: readonly [id: string, label: string, reason: string][] = [
	['bevel', 'Bevel', 'Bevel needs 3-D lighting the SVG renderer does not draw.'],
	['rotation-3d', '3-D Rotation', '3-D rotation needs a 3-D renderer.'],
];

/** Stable menu ids of the effect presets, shared with the selection state sync. */
export const glowItemId = (size: number, accent: number) => `glow-${size}-${accent}`;
export const softEdgesItemId = (size: number) => `soft-edges-${String(size).replace('.', '-')}`;
export const reflectionItemId = (id: string) => `reflection-${id}`;
const options = (id: string, label: string): CommandSpec => ({
	id,
	label,
	action: { type: 'format-shape-pane', section: 'effects' },
});

function glowOptions(): CommandSpec {
	return {
		id: 'glow',
		label: 'Glow',
		items: [
			{
				id: 'glow-none',
				label: 'No Glow',
				action: {
					type: 'shape-format',
					patch: { glow: { size: 0, color: '#000000', transparency: 0 } },
				},
				checked: false,
			},
			...VISIO_GLOW_SIZES.map((size) => ({
				id: `glow-size-${size}`,
				label: `${size} pt glow`,
				items: [1, 2, 3, 4, 5, 6].map((accent) => ({
					id: glowItemId(size, accent),
					label: `Glow: ${size} pt; Accent color ${accent}`,
					action: { type: 'glow-preset' as const, size, accent },
					checked: false,
				})),
			})),
			options('glow-options', 'Glow Options...'),
		],
	};
}
function softEdgeOptions(): CommandSpec {
	return {
		id: 'soft-edges',
		label: 'Soft Edges',
		items: [
			{
				id: softEdgesItemId(0),
				label: 'No Soft Edges',
				action: { type: 'shape-format', patch: { softEdges: 0 } },
				checked: false,
			},
			...VISIO_SOFT_EDGE_SIZES.map((size) => ({
				id: softEdgesItemId(size),
				label: `${size} Point`,
				action: { type: 'shape-format' as const, patch: { softEdges: size } },
				checked: false,
			})),
			options('soft-edges-options', 'Soft Edges Options...'),
		],
	};
}
function reflectionOptions(): CommandSpec {
	return {
		id: 'reflection',
		label: 'Reflection',
		items: [
			{
				id: reflectionItemId('none'),
				label: 'No Reflection',
				action: {
					type: 'shape-format',
					patch: { reflection: { size: 0, transparency: 0, distance: 0, blur: 0 } },
				},
				checked: false,
			},
			...VISIO_REFLECTION_PRESETS.map(({ id, label, ...reflection }) => ({
				id: reflectionItemId(id),
				label,
				action: { type: 'shape-format' as const, patch: { reflection } },
				checked: false,
			})),
			options('reflection-options', 'Reflection Options...'),
		],
	};
}

/** Home > Shape Styles > Effects: shadow, reflection, glow and soft edge presets. */
export function effectsOptions(): CommandSpec[] {
	return [
		{
			id: 'shadow',
			label: 'Shadow',
			items: [
				...VISIO_SHADOW_PRESETS.map((preset) => ({
					id: `shadow-${preset}`,
					label: SHADOW_NAMES[preset],
					action: { type: 'shape-format' as const, patch: { shadow: preset } },
					checked: false,
				})),
				options('shadow-options', 'Shadow Options...'),
			],
		},
		reflectionOptions(),
		glowOptions(),
		softEdgeOptions(),
		...EFFECT_REASONS.map(([id, label, unsupported]) => ({ id, label, unsupported })),
	];
}
