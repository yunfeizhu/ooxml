import {
	VISIO_BACKGROUND_STYLES,
	VISIO_BORDER_STYLES,
	visioBackgroundShapes,
	visioBorderShapes,
	type VisioBackgroundStyle,
	type VisioBorderStyle,
	type VisioDecorationShape,
} from 'ooxml-core/visio';
import { VISIO_PAPER_SIZES } from 'ooxml-core/visio/ui';
import type {
	OfficeGalleryPickEvent,
	OfficeGalleryState,
	OfficeUiGallery,
} from '../ribbon/gallery';
import { emitRibbonAction } from './ribbon-action';
import { command, group, menu, type CommandSpec } from './ribbon-parts';
import type { VisioPageSetupCommand } from './page-setup-action';

const page = (setup: VisioPageSetupCommand) => ({ type: 'page-setup' as const, command: setup });
const inches = (value: number) => `${+value.toFixed(2)} in`;
/** Background colours offered by Design > Background Color. */
export const BACKGROUND_COLORS = Object.freeze([
	['#FFFFFF', 'White'],
	['#DEEBF7', 'Light Blue'],
	['#E2F0D9', 'Light Green'],
	['#FBE5D6', 'Light Orange'],
	['#FFF2CC', 'Light Gold'],
	['#EDEDED', 'Light Gray'],
	['#44546A', 'Dark Blue-Gray'],
] as const);

/** Design > Page Setup: Orientation, Size and Auto Size, with the Page Setup dialog launcher. */
export function pageSetupGroup(doc: Document): HTMLElement {
	const sizes: CommandSpec[] = VISIO_PAPER_SIZES.map((size) => ({
		id: `size-${size.id}`,
		label: `${size.label} (${inches(size.width)} x ${inches(size.height)})`,
		action: page({ op: 'size', id: size.id }),
		checked: false,
	}));
	const el = group(
		doc,
		'Page Setup',
		[
			menu(doc, {
				id: 'orientation',
				label: 'Orientation',
				icon: 'visioPagesPane',
				items: (['portrait', 'landscape'] as const).map((value) => ({
					id: `orientation-${value}`,
					label: value === 'portrait' ? 'Portrait' : 'Landscape',
					action: page({ op: 'orientation', value }),
					checked: false,
				})),
			}),
			menu(doc, {
				id: 'size',
				label: 'Size',
				icon: 'pageWidth',
				items: [
					...sizes,
					{ id: 'size-fit', label: 'Fit to Drawing', action: page({ op: 'fit' }) },
					{
						id: 'size-more',
						label: 'More Page Sizes...',
						action: page({ op: 'dialog', tab: 'size' }),
					},
				],
			}),
			command(doc, {
				id: 'auto-size',
				label: 'Auto Size',
				icon: 'fitPage',
				action: page({ op: 'auto-size' }),
				pressed: false,
			}),
		],
		{ launcher: 'Page Setup' },
	);
	el.removeAttribute('launcher-disabled');
	el.setAttribute('launcher-label', 'Page Setup');
	el.removeAttribute('title');
	return el;
}

/** Static application markup: a decoration drawn on a small portrait page. */
function preview(shapes: readonly VisioDecorationShape[], empty = false): string {
	const scale = 24 / 11;
	const rects = shapes
		.map(
			(shape) =>
				`<rect x="${shape.x * scale + 3}" y="${(11 - shape.y - shape.height) * scale}" width="${shape.width * scale}" height="${shape.height * scale}" fill="${shape.fill ?? 'none'}" stroke="${shape.line ?? 'none'}" stroke-width="0.6"/>` +
				(shape.text
					? `<rect x="${shape.x * scale + 4}" y="${(11 - shape.y - shape.height * 0.6) * scale}" width="${shape.width * scale * 0.5}" height="1.2" fill="${shape.textColor ?? '#000000'}"/>`
					: ''),
		)
		.join('');
	const slash = empty ? '<path d="M3 24L21.5 0" stroke="#C00000" stroke-width="1"/>' : '';
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="3" y="0" width="18.5" height="24" fill="#FFFFFF" stroke="#8A8A8A" stroke-width="0.6"/>${rects}${slash}</svg>`;
}

export function backgroundsState(
	reason: string | undefined,
	applied?: VisioBackgroundStyle | null,
): OfficeGalleryState {
	return {
		id: 'backgrounds',
		label: 'Backgrounds',
		disabled: reason !== undefined,
		sections: [
			{
				columns: 4,
				tileWidth: 48,
				tileHeight: 48,
				items: [
					{
						id: 'none',
						label: 'No Background',
						preview: preview([], true),
						applied: applied === null,
					},
					...VISIO_BACKGROUND_STYLES.map((style) => ({
						id: style.id,
						label: style.label,
						preview: preview(visioBackgroundShapes(style.id, 8.5, 11)),
						applied: applied === style.id,
					})),
				],
			},
		],
	};
}

export function bordersState(
	reason: string | undefined,
	applied?: VisioBorderStyle | null,
): OfficeGalleryState {
	return {
		id: 'borders-titles',
		label: 'Borders & Titles',
		disabled: reason !== undefined,
		sections: [
			{
				columns: 4,
				tileWidth: 48,
				tileHeight: 48,
				items: [
					{ id: 'none', label: 'No Border', preview: preview([], true), applied: applied === null },
					...VISIO_BORDER_STYLES.map((style) => ({
						id: style.id,
						label: style.label,
						preview: preview(visioBorderShapes(style.id, 8.5, 11)),
						applied: applied === style.id,
					})),
				],
			},
		],
	};
}

function gallery(doc: Document, id: string, label: string, icon: string): OfficeUiGallery {
	const el = doc.createElement('office-ui-gallery') as OfficeUiGallery;
	el.setAttribute('command', id);
	el.setAttribute('label', label);
	el.setAttribute('icon', icon);
	el.dataset.menu = id;
	el.addEventListener('office-gallery-pick', (event) => {
		event.stopPropagation();
		const item = (event as OfficeGalleryPickEvent).detail.itemId;
		if (el.hasAttribute('disabled')) return;
		if (id === 'backgrounds') {
			const style = VISIO_BACKGROUND_STYLES.find((entry) => entry.id === item)?.id ?? null;
			if (style || item === 'none') emitRibbonAction(el, page({ op: 'background', style }));
		} else {
			const style = VISIO_BORDER_STYLES.find((entry) => entry.id === item)?.id ?? null;
			if (style || item === 'none') emitRibbonAction(el, page({ op: 'border', style }));
		}
	});
	return el;
}

/** Enable a decoration gallery, or disable it with the reason as its tooltip. */
export function syncDecorationGallery(
	el: OfficeUiGallery,
	state: OfficeGalleryState,
	reason: string | undefined,
): void {
	el.state = state;
	el.toggleAttribute('disabled', reason !== undefined);
	const title = reason === undefined ? state.label : `${state.label}: ${reason}`;
	el.setAttribute('title', title);
	el.querySelector<HTMLButtonElement>('.trigger')?.setAttribute('title', title);
	if (el.dataset.triggerKeytip)
		el.querySelector<HTMLButtonElement>('.trigger')?.setAttribute(
			'data-keytip',
			el.dataset.triggerKeytip,
		);
}

/** Design > Backgrounds: the Backgrounds and Borders & Titles galleries and Background Color. */
export function backgroundsGroup(doc: Document): HTMLElement {
	const reason = 'Open a .vsdx file to add backgrounds.';
	const backgrounds = gallery(doc, 'backgrounds', 'Backgrounds', 'fill');
	syncDecorationGallery(backgrounds, backgroundsState(reason), reason);
	const borders = gallery(doc, 'borders-titles', 'Borders & Titles', 'rectangle');
	syncDecorationGallery(borders, bordersState(reason), reason);
	const color = menu(doc, {
		id: 'background-color',
		label: 'Background Color',
		icon: 'fill',
		size: 'small',
		items: BACKGROUND_COLORS.map(([value, label]) => ({
			id: `background-color-${value.slice(1).toLowerCase()}`,
			label,
			action: page({ op: 'background-color', color: value }),
		})),
	});
	return group(doc, 'Backgrounds', [backgrounds, color, borders]);
}
