import { VISIO_BUILT_IN_THEMES, type VisioPageThemeEdit } from 'ooxml-core/visio';
import type { OfficeUiGallery } from '../ribbon/gallery';
import type { ViewerController, ViewerState } from './controller';
import type { VisioRibbonAction } from './ribbon-action';
import {
	NO_THEME_VARIANTS,
	THEMES_HINT,
	VARIANTS_HINT,
	themesGalleryState,
	variantsGalleryState,
} from './ribbon-themes';

type ThemeAction = Extract<VisioRibbonAction, { type: 'page-theme' }>;

/** Design > Themes and Variants: per-page theme edits and their gallery state. */
export class ViewerThemes {
	constructor(
		private readonly root: ShadowRoot,
		private readonly controller: ViewerController,
		private readonly edit: (run: () => Promise<void>, success: string) => void,
	) {}

	#reason(state: ViewerState): string {
		return state.loading
			? 'Opening diagram.'
			: state.edit.busy
				? 'Updating diagram.'
				: !state.edit.sourceAvailable
					? 'Open a .vsdx file to apply a theme.'
					: !state.document?.pages[state.pageIndex]
						? 'The drawing has no page.'
						: '';
	}

	run(action: ThemeAction): void {
		const state = this.controller.state;
		const page = state.document?.pages[state.pageIndex];
		if (!page || this.#reason(state)) return;
		if (action.variant !== undefined && !page.theme) return;
		const edit: VisioPageThemeEdit = {
			type: 'set-page-theme',
			pageId: page.id,
			...(action.theme === undefined ? {} : { theme: action.theme }),
			...(action.variant === undefined ? {} : { variant: action.variant }),
		};
		const name =
			action.theme === 'none'
				? 'No Theme'
				: VISIO_BUILT_IN_THEMES.find((theme) => theme.id === action.theme)?.name;
		this.edit(
			() => this.controller.applyEdits([edit]),
			name
				? `Applied ${name} to ${page.name}.`
				: `Applied variant ${(action.variant ?? 0) + 1} to ${page.name}.`,
		);
	}

	render(state: ViewerState): void {
		const page = state.document?.pages[state.pageIndex];
		const reason = this.#reason(state);
		const themes = this.root.querySelector<OfficeUiGallery>(
			'office-ui-gallery[data-menu="themes"]',
		);
		if (themes) {
			themes.state = themesGalleryState(!!reason, page?.theme);
			themes.toggleAttribute('disabled', !!reason);
			themes.title = reason ? `Themes: ${reason}` : THEMES_HINT;
		}
		const variants = this.root.querySelector<OfficeUiGallery>(
			'office-ui-gallery[data-menu="variants"]',
		);
		if (variants) {
			const why = reason || (page?.theme ? '' : NO_THEME_VARIANTS);
			variants.state = variantsGalleryState(!!why, page?.theme);
			variants.toggleAttribute('disabled', !!why);
			variants.title = why ? `Variants: ${why}` : VARIANTS_HINT;
		}
	}
}
