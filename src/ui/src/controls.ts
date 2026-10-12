import { defineDialogFooter } from './dialog/dialog-footer';
import { defineToasts } from './notices/toasts';
import { definePasteOptions } from './notices/paste-options';
import { defineReadOnlyBanner } from './notices/read-only-banner';
import { defineRadio } from './form/radio';
export {
	OFFICE_COLOR_SWATCHES,
	OFFICE_COLOR_SWATCH_HEXES,
	type OfficeColorSwatch,
} from './form/color-swatches';
import { defineRibbonToggle } from './ribbon/ribbon-toggle';
import { defineSearchField } from './form/search-field';
import { defineBackstage } from './chrome/backstage';
import { defineFindBar } from './chrome/find-bar';
import { defineCommentsPane } from './comments/comments-pane';
import { definePrintPreview } from './chrome/print-preview';
import { defineRibbon } from './ribbon/ribbon-tabs';
import { defineRibbonActions } from './ribbon/ribbon-actions';
import { defineRibbonSection } from './ribbon/ribbon-section';
import { defineGallery } from './ribbon/gallery';
import { defineRuler } from './chrome/ruler';
import { defineAccount } from './chrome/account';
import { defineButton } from './ribbon/button';
import { defineCheckbox } from './form/checkbox';
import { defineSwitch } from './form/switch';
import { defineDialog } from './dialog/dialog';
import { defineIcon } from './icon';
import { defineCommandSearch } from './menu/command-search';
import { defineContextMenu } from './menu/context-menu';
import { defineMenuSeparator } from './menu/menu-separator';
import { defineMenuButton } from './menu/menu-button';
import { defineMenuItem } from './menu/menu-item';
import { defineOptionsDialog } from './dialog/options-dialog';
import { defineRibbonGroup } from './ribbon/ribbon-group';
import { defineRibbonStack } from './ribbon/ribbon-stack';
import { defineToolbar } from './ribbon/ribbon-toolbar';
import { defineSelect } from './form/select';
import { defineStatusBar } from './chrome/status-bar';
import { defineStatusItem } from './chrome/status-item';
import { defineTabStrip } from './chrome/tab-strip';
import { defineTaskPane } from './chrome/task-pane';
import { defineTitleBar } from './chrome/title-bar';
import { defineZoomSlider } from './form/zoom-slider';
import { defineSymbolPicker } from './form/symbol-picker';
import { defineColorGrid } from './form/color-grid';
export type {
	OfficeColorChange,
	OfficeColorChangeEvent,
	OfficeUiColorCustom,
} from './form/color-custom';
import { defineColorCustom } from './form/color-custom';

export {
	defineAccount,
	defineDialogFooter,
	definePasteOptions,
	defineRadio,
	defineReadOnlyBanner,
	defineRibbonToggle,
	defineSearchField,
	defineToasts,
	defineBackstage,
	defineCommentsPane,
	defineFindBar,
	defineGallery,
	definePrintPreview,
	defineRibbon,
	defineRibbonActions,
	defineRuler,
	defineButton,
	defineCheckbox,
	defineCommandSearch,
	defineContextMenu,
	defineDialog,
	defineIcon,
	defineMenuButton,
	defineMenuItem,
	defineMenuSeparator,
	defineOptionsDialog,
	defineRibbonGroup,
	defineRibbonSection,
	defineRibbonStack,
	defineSelect,
	defineStatusBar,
	defineStatusItem,
	defineSwitch,
	defineTabStrip,
	defineTaskPane,
	defineTitleBar,
	defineToolbar,
	defineZoomSlider,
	defineSymbolPicker,
	defineColorGrid,
	defineColorCustom,
};
export { OFFICE_SYMBOLS, parseOfficeSymbolCode } from './form/symbol-picker';
export type {
	OfficeColorPick,
	OfficeColorPickEvent,
	OfficeColorSource,
	OfficeUiColorGrid,
} from './form/color-grid';
export type { OfficeCommandEvent } from './ribbon/button';
export type { OfficeDialogCloseEvent, OfficeDialogCloseReason } from './dialog/dialog';
export type { OfficeSelectOption } from './form/select';
export type {
	OfficeStatusActivateEvent,
	OfficeStatusBarState,
	OfficeStatusButton,
	OfficeStatusText,
} from './chrome/status-bar';
export type { OfficeTab, OfficeTabSelectEvent } from './chrome/tab-strip';
export type { OfficeSearchCommand } from './menu/command-search';
export {
	OFFICE_TITLE_BAR_SEARCH_LIMIT,
	type OfficeQuickAccessItem,
	type OfficeTitleBarAutosave,
	type OfficeTitleBarCommand,
	type OfficeTitleBarPlacement,
	type OfficeTitleBarSearch,
	type OfficeTitleBarSearchDetail,
	type OfficeTitleBarState,
	type OfficeTitleBarTone,
} from './chrome/title-bar';
export { attachKeyTips, type KeyTipsHandle } from './keytips';
export type {
	OfficeBackstageCloseEvent,
	OfficeBackstageItem,
	OfficeBackstageSelectEvent,
} from './chrome/backstage';
export type {
	OfficeFindInputEvent,
	OfficeFindStepEvent,
	OfficeFindOptionsEvent,
	OfficeFindReplaceEvent,
} from './chrome/find-bar';
export type { OfficePrintPreviewPageEvent } from './chrome/print-preview';
export {
	commentInitials,
	DEFAULT_COMMENTS_LABELS,
	formatCommentTime,
	type OfficeComment,
	type OfficeCommentAddDetail,
	type OfficeCommentDeleteDetail,
	type OfficeCommentEditDetail,
	type OfficeCommentReplyDetail,
	type OfficeCommentsClassNames,
	type OfficeCommentsLabels,
	type OfficeCommentThread,
	type OfficeThreadDetail,
} from './comments/types';
export { assignKeyTips, runKeyTips } from './ribbon/keytip-run';
export type { KeyTipTarget } from './ribbon/keytip-run';
export { createRibbonOverflow } from './ribbon/overflow';
export type { RibbonOverflow, RibbonOverflowOptions } from './ribbon/overflow';
export { attachRibbonGroupOverflow, fitRibbonGroups } from './ribbon/group-overflow';
export type { RibbonGroupOverflow, RibbonGroupOverflowOptions } from './ribbon/group-overflow';
export type { OfficeRibbonSelectEvent } from './ribbon/ribbon-tabs';
export type { OfficeRibbonActionsMode, OfficeRibbonModeEvent } from './ribbon/ribbon-actions';
export type { OfficeRibbonCommandView, OfficeRibbonGroupView } from './ribbon/ribbon-section';
export {
	parseSvgPreview,
	type OfficeGalleryItem,
	type OfficeGalleryPickEvent,
	type OfficeGallerySection,
	type OfficeGalleryState,
} from './ribbon/gallery';
export { rulerDivisions } from './chrome/ruler';
export {
	clampFlyoutPosition,
	EMPTY_MENU_STATE,
	nextEnabledIndex,
	typeAheadIndex,
	type FlyoutPositionInput,
	type OfficeMenuCloseReason,
	type OfficeMenuItem,
	type OfficeMenuState,
} from './menu/menu-model';
export type {
	OfficeDialogFooterAction,
	OfficeDialogFooterState,
	OfficeDialogFooterVariant,
} from './dialog/dialog-footer';
export {
	OFFICE_TOAST_VISIBLE_LIMIT,
	type OfficeToast,
	type OfficeToastsState,
} from './notices/toasts';
export type { OfficePasteOption, OfficePasteOptionsState } from './notices/paste-options';
export type {
	OfficeReadOnlyBannerIntent,
	OfficeReadOnlyBannerState,
} from './notices/read-only-banner';
export {
	clearOfficeProfile,
	DEFAULT_OFFICE_PROFILE,
	OFFICE_AVATAR_SWATCHES,
	OFFICE_PROFILE_STORAGE_KEY,
	profileInitials,
	readOfficeProfile,
	sanitizeOfficeProfile,
	writeOfficeProfile,
	type OfficeProfile,
	type OfficeProfileChangeEvent,
} from './chrome/account-profile';
export {
	clampOptionNumber,
	type OfficeOptionCategory,
	type OfficeOptionChoice,
	type OfficeOptionControl,
	type OfficeOptionSection,
	type OfficeOptionsChangeEvent,
	type OfficeOptionValue,
	type OfficeOptionValues,
} from './dialog/options-dialog';

/** Every control of this entry. */
export const CONTROL_DEFINERS = [
	defineIcon,
	defineButton,
	defineCheckbox,
	defineSwitch,
	defineSelect,
	defineRibbonGroup,
	defineRibbonStack,
	defineMenuItem,
	defineMenuSeparator,
	defineMenuButton,
	defineContextMenu,
	defineCommandSearch,
	defineToolbar,
	defineDialog,
	defineStatusBar,
	defineStatusItem,
	defineZoomSlider,
	defineTabStrip,
	defineTaskPane,
	defineOptionsDialog,
	defineAccount,
	defineRibbon,
	defineRibbonActions,
	defineFindBar,
	defineRuler,
	defineBackstage,
	definePrintPreview,
	defineRadio,
	defineSearchField,
	defineRibbonToggle,
	defineDialogFooter,
	defineToasts,
	defineReadOnlyBanner,
	definePasteOptions,
	defineTitleBar,
	defineRibbonSection,
	defineGallery,
	defineCommentsPane,
	defineSymbolPicker,
	defineColorGrid,
	defineColorCustom,
] as const;

/** Idempotent, SSR-safe (no-op without a DOM). */
export function registerControls(registry?: CustomElementRegistry): void {
	for (const define of CONTROL_DEFINERS) define(registry);
}
