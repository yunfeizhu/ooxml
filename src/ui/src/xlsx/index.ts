// `<xlsx-editor>`: the Excel-style spreadsheet editor element (title bar, ribbon, formula bar,
// grid, sheet tabs, status bar, File backstage). The framework bindings, the demo and the
// published packages import from here; keep the names stable.
export { XlsxEditorElement, defineXlsxEditor, type XlsxThemeColors } from './component';
export {
	XLSX_EDITOR_EVENTS,
	type FileCommand,
	type FileCommandDetail,
	type SelectionChangeDetail,
	type XlsxEditorEventDetail,
	type XlsxEditorEventMap,
	type XlsxEditorEventName,
} from './events';
export type {
	XlsxCollaborationOptions,
	XlsxCollaborationState,
	XlsxCollaborator,
} from './collaboration-types';
export {
	XLSX_EDITOR_ATTRIBUTES,
	DEFAULT_AUTHOR_NAME,
	DEFAULT_FILE_NAME,
} from './editor-attributes';
export {
	EDITOR_LOCALES,
	normalizeEditorLocale,
	type EditorLocale,
	type EditorLocaleInput,
} from 'ooxml-core/xlsx/ui';
export {
	THEME_KEYS,
	darkTheme as xlsxDarkTheme,
	lightTheme as xlsxLightTheme,
	themeToCssVars,
	type EditorThemeMode,
	type XlsxTheme,
} from './theme';
// Extension points: commands, dialogs and ribbon tabs added by a host.
export type { Command as EditorCommand, CommandRegistry } from 'ooxml-core/xlsx/ui';
export type {
	EditorContext,
	GridController,
	Selection as EditorSelection,
	SelectionModel,
} from 'ooxml-core/xlsx/ui';
export type { DialogRegistry } from 'ooxml-core/xlsx/ui';
export {
	registerRibbonTabs,
	type RibbonControl,
	type RibbonGroup,
	type RibbonMenuItem,
	type RibbonTab,
} from 'ooxml-core/xlsx/ui';
export { registerRibbonIcon } from './ribbon/icons';
export {
	RIBBON_ADD_IN_EVENT,
	type OfficeRibbonAddInEvent,
	type RibbonAddInCommand,
	type RibbonAddInCommandDetail,
	type RibbonAddInGroup,
	type RibbonAddInTab,
} from '../ribbon/add-in-tabs';
