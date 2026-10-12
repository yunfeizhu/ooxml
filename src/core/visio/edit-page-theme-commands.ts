import { fail } from './package-common';
import { isVisioBuiltInThemeId, type VisioBuiltInThemeId } from './theme-builtins';

/**
 * Design > Themes and Variants for one page. `theme` applies a built-in theme (writing its theme
 * part when the drawing lacks it) or `none` clears the page's theme selection; `variant` (0-3)
 * selects one of the theme's four colour and style variants. Without `theme`, only the variant of
 * the theme the page already uses changes.
 */
export interface VisioPageThemeEdit {
	type: 'set-page-theme';
	pageId: string;
	theme?: VisioBuiltInThemeId | 'none';
	variant?: number;
}

export function snapshotPageTheme(edit: VisioPageThemeEdit): VisioPageThemeEdit {
	if (typeof edit.pageId !== 'string' || !edit.pageId || edit.pageId.length > 256)
		fail('INVALID_EDIT', 'Invalid edit target.');
	const result: VisioPageThemeEdit = { type: 'set-page-theme', pageId: edit.pageId };
	if (edit.theme !== undefined) {
		if (edit.theme !== 'none' && !isVisioBuiltInThemeId(edit.theme))
			fail('INVALID_EDIT', 'Unknown built-in theme.');
		result.theme = edit.theme;
	}
	if (edit.variant !== undefined) {
		if (!Number.isInteger(edit.variant) || edit.variant < 0 || edit.variant > 3)
			fail('INVALID_EDIT', 'Theme variants are numbered 0 to 3.');
		if (edit.theme === 'none') fail('INVALID_EDIT', 'No Theme has no variants.');
		result.variant = edit.variant;
	}
	if (result.theme === undefined && result.variant === undefined)
		fail('INVALID_EDIT', 'A page theme edit needs a theme or a variant.');
	return result;
}
