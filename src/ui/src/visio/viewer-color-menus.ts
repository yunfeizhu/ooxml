import { pushRecentColor } from 'ooxml-core/color';
import type { VisioPage, VisioShape } from 'ooxml-core/visio';
import {
	visioFormattingShape,
	visioShapeFormattingState,
	visioFormatTargetShape,
	visioTextFormattingState,
} from 'ooxml-core/visio/ui';
import type { OfficeColorPick, OfficeUiColorGrid } from '../controls';
import type { ViewerController, ViewerState } from './controller';
import type { VisioFormattingAction } from './ribbon-action';
import {
	THEME_COLUMN_NAMES,
	colorAction,
	commonColor,
	pageThemeGrid,
	pickedThemeColor,
	type ColorTarget,
} from './ribbon-color-menu';
import { ViewerMoreColors } from './viewer-more-colors';

/** The colours the selection has now, per target; undefined when mixed or nothing is selected. */
export interface SelectionColors {
	fill: string | undefined;
	line: string | undefined;
	font: string | undefined;
}

/** The selected shapes Fill and Line can format, or none when any of them cannot be. */
export function styleSelection(
	state: ViewerState,
): { page: VisioPage; shapes: VisioShape[] } | undefined {
	const page = state.document?.pages[state.pageIndex];
	if (!page || !state.selectedShapes.length) return undefined;
	if (state.selectedShapes.some((item) => item.pageId && item.pageId !== page.id)) return undefined;
	const shapes = state.selectedShapes.map((item) => visioFormatTargetShape(page, item.id));
	return shapes.every((shape) => !!shape) ? { page, shapes: shapes as VisioShape[] } : undefined;
}

export function selectionColors(state: ViewerState): SelectionColors {
	const page = state.document?.pages[state.pageIndex];
	const style = styleSelection(state);
	const text =
		page && state.selectedShapes.length
			? state.selectedShapes.map((item) => visioFormattingShape(page, item.id))
			: [];
	const shapes = style?.shapes ?? [];
	return {
		fill: commonColor(shapes.map((shape) => shape.style.fill)),
		line:
			shapes.length && visioShapeFormattingState(shapes).linePattern === 0
				? 'none'
				: commonColor(shapes.map((shape) => shape.style.lineColor)),
		font: text.every((shape) => !!shape)
			? visioTextFormattingState(text as VisioShape[]).fontColor?.toLowerCase()
			: undefined,
	};
}

/**
 * The ribbon's Fill, Line and Font Color pickers: each menu holds the shared colour grid with the
 * page's theme colours. A pick runs the same formatting action the old fixed colours did; More
 * Colors opens the custom colour dialog, and a custom colour joins Recent Colors for every menu.
 */
export class ViewerColorMenus {
	readonly moreColors: ViewerMoreColors;
	#recent: string[] = [];
	#theme = '';
	#colors: SelectionColors = { fill: undefined, line: undefined, font: undefined };
	constructor(
		private readonly root: ShadowRoot,
		private readonly controller: ViewerController,
		private readonly run: (action: VisioFormattingAction) => void,
	) {
		this.moreColors = new ViewerMoreColors(root);
	}
	get recent(): readonly string[] {
		return this.#recent;
	}
	/** A custom colour was applied somewhere: show it under Recent Colors everywhere. */
	remember(color: string): void {
		this.#recent = pushRecentColor(this.#recent, color);
		this.render(this.controller.state);
	}
	#grids(): OfficeUiColorGrid[] {
		return [
			...this.root.querySelectorAll<OfficeUiColorGrid>('office-ui-color-grid[data-color-grid]'),
		];
	}
	wire(): () => void {
		const Abort = this.root.ownerDocument.defaultView?.AbortController ?? AbortController;
		const events = new Abort();
		const options = { signal: events.signal };
		const ribbonGrid = (event: Event) => {
			const grid = event.target as OfficeUiColorGrid;
			// Grids in a task pane are driven by their pane.
			return grid.dataset?.colorGrid && grid.closest('office-ui-menu-button') ? grid : undefined;
		};
		// The menu closes as it does for one of its own items.
		const closeMenu = (grid: HTMLElement) =>
			grid.dispatchEvent(
				new CustomEvent('office-command', { detail: { command: '' }, bubbles: true }),
			);
		this.root.addEventListener(
			'office-color-pick',
			(event) => {
				const grid = ribbonGrid(event);
				if (!grid) return;
				event.stopPropagation();
				const pick = (event as CustomEvent<OfficeColorPick>).detail;
				closeMenu(grid);
				this.run(
					colorAction(grid.dataset.colorGrid as ColorTarget, pick.color, pickedThemeColor(pick)),
				);
			},
			options,
		);
		this.root.addEventListener(
			'office-color-more',
			(event) => {
				const grid = ribbonGrid(event);
				if (!grid) return;
				event.stopPropagation();
				const target = grid.dataset.colorGrid as ColorTarget;
				closeMenu(grid);
				this.moreColors.open(this.#colors[target], (color) => {
					this.remember(color);
					this.run(colorAction(target, color));
				});
			},
			options,
		);
		return () => {
			events.abort();
			this.moreColors.close();
			this.moreColors.dialog.dialog.remove();
		};
	}
	render(state: ViewerState): void {
		const theme = pageThemeGrid(state.document?.pages[state.pageIndex]);
		const key = JSON.stringify(theme);
		this.#colors = selectionColors(state);
		for (const grid of this.#grids()) {
			// Assigning an equal array would still re-render every swatch.
			if (key !== this.#theme || !grid.themeColors) {
				grid.themeColors = theme.colors;
				grid.themeNames = THEME_COLUMN_NAMES;
				grid.extraColors = theme.variants;
			}
			if (grid.recentColors !== this.#recent) grid.recentColors = this.#recent;
			// A pane's other colours (pattern background, glow) are set by the pane.
			const target = grid.dataset.colorGrid as ColorTarget;
			if (!(target in this.#colors)) continue;
			const value = this.#colors[target] ?? null;
			if (grid.value !== value) grid.value = value;
		}
		this.#theme = key;
		if (this.moreColors.dialog.open && state.loading) this.moreColors.close();
	}
}
