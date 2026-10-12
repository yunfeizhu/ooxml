/**
 * SmartArt Design > Layouts: the layout families the core SmartArt model can
 * switch between (`SWITCHABLE_LAYOUT_TYPES`, the same set the Inspector's layout
 * switcher offers). A pick runs the same `switchSmartArtLayout` the Inspector
 * runs, keeping the nodes, connections and styling.
 *
 * @module render/ribbon-galleries/smartart-layouts-gallery
 */
import { SWITCHABLE_LAYOUT_TYPES } from 'ooxml-core/pptx';

import { SMARTART_LAYOUT_LABEL_KEYS } from '../schema-label-keys';
import { preloadSmartArtBuiltinLayouts, smartArtBuiltinLayouts } from '../smartart-builtin-layouts';
import type { RibbonGalleryModule } from './gallery-module';
import { galleryColorScheme } from './gallery-theme';
import type { RibbonGallerySection } from './gallery-types';
import {
	smartArtBuiltinLayoutPatch,
	smartArtElementPatch,
	smartArtLayoutSwitchPatch,
} from './smartart-gallery-patch';
import { smartArtLayoutTileSvg } from './smartart-layout-tiles';

const TILE = { width: 56, height: 36 };
/** PowerPoint's gallery order for the built-in layouts' categories, with English headings. */
const NAMED_CATEGORIES: ReadonlyArray<readonly [string, string]> = [
	['list', 'List'],
	['process', 'Process'],
	['cycle', 'Cycle'],
	['hierarchy', 'Hierarchy'],
	['relationship', 'Relationship'],
	['matrix', 'Matrix'],
	['pyramid', 'Pyramid'],
	['picture', 'Picture'],
	['timeline', 'Timeline'],
	['textcard', 'Text Card'],
	['meettheteam', 'Meet the Team'],
];

/**
 * One section per category with PowerPoint's own built-in layouts, once the library has loaded.
 * A tile previews its category's diagram (the real layout is only drawn when applied).
 */
function namedLayoutSections(
	accent1: string | undefined,
	currentId: string | undefined,
): RibbonGallerySection[] {
	const library = smartArtBuiltinLayouts();
	if (!library) {
		return [];
	}
	const entries = library.listBuiltinSmartArtLayouts();
	return NAMED_CATEGORIES.flatMap(([category, heading]) => {
		const items = entries
			.filter((entry) => entry.category === category)
			.map((entry) => ({
				id: entry.id,
				labelKey: 'pptx.gallery.smartArtLayouts.named',
				labelParams: { name: entry.title },
				label: entry.title,
				previewSvg: smartArtLayoutTileSvg(category, accent1, TILE),
				applied: currentId === entry.id,
			}));
		return items.length === 0
			? []
			: [
					{
						id: `named-${category}`,
						titleKey: SMARTART_LAYOUT_LABEL_KEYS[category],
						title: heading,
						columns: 5,
						tileWidth: TILE.width,
						tileHeight: TILE.height,
						items,
					},
				];
	});
}

const humanize = (id: string): string => id.replace(/^./u, (c) => c.toUpperCase());

export const SMARTART_LAYOUTS_GALLERY: RibbonGalleryModule = {
	build(ctx) {
		const element = ctx.element;
		const data = element?.type === 'smartArt' ? element.smartArtData : undefined;
		const current = data?.resolvedLayoutType ?? 'list';
		const accent1 = galleryColorScheme(ctx).accent1;
		// The named layouts come from a lazy chunk. When it has not landed, hand the element a
		// promise for the descriptor built after it has, since the bindings memoize this one.
		const pending = smartArtBuiltinLayouts() === undefined;
		return {
			id: 'smartArtLayouts',
			labelKey: 'pptx.gallery.smartArtLayouts.title',
			label: 'Layouts',
			disabled: !data,
			sections: [
				{
					id: 'layouts',
					columns: 5,
					tileWidth: TILE.width,
					tileHeight: TILE.height,
					items: SWITCHABLE_LAYOUT_TYPES.map((type) => ({
						id: type,
						labelKey: SMARTART_LAYOUT_LABEL_KEYS[type] ?? `pptx.smartart.category.${type}`,
						label: humanize(type),
						previewSvg: smartArtLayoutTileSvg(type, accent1, TILE),
						applied: current === type,
					})),
				},
				...namedLayoutSections(accent1, data?.layoutDefinition?.uniqueId),
			],
			...(pending && {
				ready: preloadSmartArtBuiltinLayouts().then((library) =>
					library ? SMARTART_LAYOUTS_GALLERY.build(ctx) : undefined,
				),
			}),
		};
	},
	apply(itemId, ctx) {
		const element = ctx.element;
		if (element?.type !== 'smartArt' || !element.smartArtData) {
			return null;
		}
		const type = SWITCHABLE_LAYOUT_TYPES.find((candidate) => candidate === itemId);
		if (!type) {
			// A named built-in layout: its own definition replaces the current one.
			const named = smartArtBuiltinLayoutPatch(element.smartArtData, itemId);
			const patch = named ? smartArtElementPatch(element, named) : null;
			return patch ? { kind: 'element', ...patch } : null;
		}
		if ((element.smartArtData.resolvedLayoutType ?? 'list') === type) {
			return null;
		}
		// drawingShapes is forwarded (cleared) so the reflow regenerates the new layout.
		const patch = smartArtElementPatch(
			element,
			smartArtLayoutSwitchPatch(element.smartArtData, type),
		);
		return patch ? { kind: 'element', ...patch } : null;
	},
};
