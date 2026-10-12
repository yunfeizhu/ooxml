export type { ElementUpdate, ElementUpdateOptions } from 'ooxml-ui/pptx';
// ── React-based PowerPoint viewer/editor ──
export { PowerPointViewer, getAnimationInitialStyle } from './viewer/PowerPointViewer';
export type { PowerPointViewerProps, PowerPointViewerHandle } from './viewer/PowerPointViewer';

// ── Building blocks: compose a custom viewer shell from standalone pieces ──
// `Toolbar` and `SlideCanvas` are the same flat, self-contained components
// `PowerPointViewer` renders internally. `useViewerBuildingBlocks` wires up
// the same state/hooks `PowerPointViewer` does and maps them into the flat
// props these components expect, so a host can compose its own shell:
//
//   const { toolbarProps, canvasProps } = useViewerBuildingBlocks({ content, canEdit: true });
//   return (<><Toolbar {...toolbarProps} /><SlideCanvas {...canvasProps} /></>);
export { Toolbar } from './viewer/components/Toolbar';
export type { ToolbarProps } from './viewer/components/Toolbar';
export { SlideCanvas } from './viewer/components/SlideCanvas';
export type { SlideCanvasProps } from './viewer/components/SlideCanvas';
export { useViewerBuildingBlocks } from './viewer/hooks/useViewerBuildingBlocks';
export type {
	UseViewerBuildingBlocksInput,
	ViewerBuildingBlocksResult,
} from './viewer/hooks/useViewerBuildingBlocks';

// ── Shared API types ──
export type { CollaborationContextValue } from './viewer/hooks/collaboration/types';
export type { ViewerMode, PowerPointViewerAPI } from 'ooxml-ui/pptx';
export type {
	CollaborationConfig,
	CollaborationShellState,
	ExternalCollaborationSession,
	ExternalCollaborationSnapshot,
	ExternalCollaborationAwareness,
} from 'ooxml-ui/pptx';
export { describeCollaborationShellState } from 'ooxml-ui/pptx';
export type { ViewportFitOptions, ViewportFitPadding } from 'ooxml-ui/pptx';
export { createImageElementFromFile } from 'ooxml-ui/pptx';

// ── Slide template gallery (New Slide starter slides) ──
export { SlideTemplateGalleryDialog } from './viewer/components/SlideTemplateGalleryDialog';
export type { SlideTemplateGalleryDialogProps } from './viewer/components/SlideTemplateGalleryDialog';
export { SlideTemplatePreview } from './viewer/components/SlideTemplatePreview';
export type { SlideTemplatePreviewProps } from './viewer/components/SlideTemplatePreview';
export { SLIDE_TEMPLATES, buildSlideTemplateContent, buildSlideTemplateSlide } from 'ooxml-ui/pptx';
export type { SlideTemplateId, SlideTemplateSpec } from 'ooxml-ui/pptx';

// ── AI assistant (optional; requires the `ai` + `@ai-sdk/react` peers) ──
export type {
	PptxAiBridge,
	PptxAiConfig,
	PptxAiConnection,
	PptxAiContextStrategy,
	PptxAiToolName,
	PptxAiWritePolicy,
} from 'ooxml-ui/pptx/ai';

// ── Toolbar visibility (hiddenActions) ──
export type { ToolbarActionId, ToolbarButtonId, ToolbarTabId } from 'ooxml-ui/pptx';

// ── UI customisation (`customization` prop + handle helpers) ──
export type {
	BackstageCustomization,
	ContextMenuCustomization,
	HostMenuCommand,
	HostElementMenuContext,
	HostCanvasMenuContext,
	KeyboardCustomization,
	OptionsCustomization,
	OptionsPageId,
	OptionsSectionId,
	OptionsSettingId,
	OptionsSettingValues,
	ResolvedCustomization,
	RibbonCustomization,
	ShortcutChord,
	ViewerCustomization,
	ViewerCustomizationApi,
	ViewerDialogId,
	ViewerExportFormatId,
	ViewerFeatureId,
	ViewerPanelId,
} from 'ooxml-ui/pptx';
export {
	BACKSTAGE_CARD_IDS,
	BACKSTAGE_PAGE_IDS,
	CANVAS_CONTEXT_MENU_COMMAND_IDS,
	EDITOR_SHORTCUT_ACTION_IDS,
	ELEMENT_CONTEXT_MENU_COMMAND_IDS,
	OPTIONS_PAGE_IDS,
	OPTIONS_SECTION_IDS,
	OPTIONS_SETTING_IDS,
	RIBBON_TAB_IDS,
	TOOLBAR_BUTTON_IDS,
	VIEWER_DIALOG_IDS,
	VIEWER_EXPORT_FORMAT_IDS,
	VIEWER_FEATURE_IDS,
	VIEWER_PANEL_IDS,
} from 'ooxml-ui/pptx';

// ── Canvas export (html2canvas oklch wrapper) ──
export { renderToCanvas } from './lib/canvas-export';

// ── Theme configuration ──
export type { ViewerTheme, ViewerThemeColors, ThemeCatalogEntry } from './theme';
export {
	defaultThemeColors,
	defaultRadius,
	themeToCssVars,
	defaultCssVars,
	ViewerThemeProvider,
	useViewerTheme,
	vermilionLightColors,
	vermilionDarkColors,
	vermilionLightTheme,
	vermilionDarkTheme,
	vermilionRadius,
	THEME_CATALOG,
	resolveThemeCatalogEntry,
} from './theme';

// ── Locale catalog (File > Options > Language) ──
export { LOCALE_CATALOG } from 'ooxml-ui/pptx/i18n';
export type { LocaleCatalogEntry } from 'ooxml-ui/pptx/i18n';

// ── Viewer preferences & account (File > Options / File > Account) ──
export {
	VIEWER_PREFS_STORAGE_KEY,
	readStoredViewerPrefs,
	writeStoredViewerPrefs,
	clearStoredViewerPrefs,
	DEFAULT_VIEWER_PROFILE,
	AVATAR_COLOR_SWATCHES,
	resolveProfileInitial,
	getLocalStorageUsageSummary,
	clearAllLocalViewerData,
	saveViewerProfile,
} from 'ooxml-ui/pptx';
export type {
	StoredViewerPrefs,
	ViewerProfile,
	AccountAuthConfig,
	LocalStorageUsageSummary,
} from 'ooxml-ui/pptx';

// ── Openable-file allow list ───────────────────────────────────────────
// The one answer to "can the viewer open this file?", so a host's drop target
// and its `<input accept>` cannot disagree with the loader. Hand-rolled lists
// drift: every demo in this repo shipped `.pptx,.ppt,.json`, which refused a
// `.pptm` on drop that File > Open inside the viewer accepted without
// complaint. Re-exported here so a host never has to reach into
// `pptx-viewer-shared` (an internal, unpublished package) to get them.
export {
	PPTX_OPEN_ACCEPT,
	PRESENTATION_OPEN_EXTENSIONS,
	isSupportedPresentationFile,
	isLegacyBinaryPresentation,
	presentationBaseName,
	savedPresentationFileName,
} from 'ooxml-ui/pptx';
export type { SavedPresentationFormat } from 'ooxml-ui/pptx';
