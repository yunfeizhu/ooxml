import { registerControls } from './controls';
import { definePresence } from './presence';
import { defineSmartArt } from './smartart';
import { TEAMS_TAGS, registerTeams } from './teams/index';
import { installOfficeUiTheme } from './theme';

export * from './base';
export * from './controls';
export * from './glyph';
export * from './icons';
export * from './ribbon/add-in-tabs';
export * from './presence';
export * from './smartart';
export * from './teams/index';
export * from './theme';
export { CONTRACT_REVISION, type Definer } from './registry';

/** Every ooxml-ui tag this package defines, in registration order. */
export const OFFICE_UI_TAGS = [
	'office-ui-icon',
	'office-ui-button',
	'office-ui-checkbox',
	'office-ui-switch',
	'office-ui-select',
	'office-ui-ribbon-group',
	'office-ui-ribbon-stack',
	'office-ui-menu-item',
	'office-ui-menu-button',
	'office-ui-menu-separator',
	'office-ui-context-menu',
	'office-ui-command-search',
	'office-ui-toolbar',
	'office-ui-dialog',
	'office-ui-status-bar',
	'office-ui-status-item',
	'office-ui-zoom-slider',
	'office-ui-tab-strip',
	'office-ui-task-pane',
	'office-ui-options-dialog',
	'office-ui-account',
	'office-ui-ribbon',
	'office-ui-ribbon-actions',
	'office-ui-find-bar',
	'office-ui-ruler',
	'office-ui-backstage',
	'office-ui-print-preview',
	'office-ui-radio',
	'office-ui-search',
	'office-ui-ribbon-toggle',
	'office-ui-dialog-footer',
	'office-ui-toasts',
	'office-ui-read-only-banner',
	'office-ui-paste-options',
	'office-ui-title-bar',
	'office-ui-ribbon-section',
	'office-ui-gallery',
	'office-ui-comments-pane',
	'office-ui-symbol-picker',
	'office-ui-color-grid',
	'office-ui-color-custom',
	'office-ui-presence',
	'office-ui-smartart',
	...TEAMS_TAGS,
] as const;

/**
 * Install the theme tokens and define every element. Idempotent and safe to call from every
 * viewer binding; a no-op where there is no DOM (SSR).
 */
export function registerOfficeUi(options: { theme?: boolean } = {}): void {
	if (typeof window === 'undefined' || !window.customElements) return;
	if (options.theme !== false) installOfficeUiTheme();
	registerControls();
	definePresence();
	defineSmartArt();
	registerTeams();
}
