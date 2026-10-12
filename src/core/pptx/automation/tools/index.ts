export {
	getSlide,
	addSlide,
	deleteSlides,
	reorderSlides,
	duplicateSlide,
	updateSlideProperties,
	setSlideTransition,
	setCanvasSize,
} from './slide-tools';
export type {
	GetSlideResult,
	AddSlideParams,
	AddSlideResult,
	DeleteSlidesParams,
	DeleteSlidesResult,
	ReorderSlidesParams,
	DuplicateSlideParams,
	UpdateSlidePropertiesParams,
	SetSlideTransitionParams,
	SetCanvasSizeParams,
} from './slide-tools';

export {
	generateElementId,
	generateSlideId,
	describeElement,
	extractSlideText,
	validateSlideIndex,
} from './helpers';

export {
	addElement,
	updateElement,
	renameElement,
	deleteElements,
	arrangeElements,
	cloneElement,
	setElementAnimation,
	groupElements,
	ungroupElements,
	batchUpdateElements,
} from './element-tools';
export type {
	AddElementParams,
	AddElementResult,
	UpdateElementParams,
	RenameElementParams,
	DeleteElementsParams,
	ArrangeElementsParams,
	CloneElementParams,
	CloneElementResult,
	SetElementAnimationParams,
	GroupElementsParams,
	GroupElementsResult,
	UngroupElementsParams,
	UngroupElementsResult,
	BatchUpdateElementsParams,
} from './element-tools';

export { updateTableCells, manageTableStructure } from './table-tools';
export type { UpdateTableCellsParams, ManageTableStructureParams } from './table-tools';

export {
	setTableStyleSection,
	createTableStyle,
	deleteTableStyle,
	assignTableStyle,
} from './table-style-tools';
export type {
	SetTableStyleSectionParams,
	CreateTableStyleParams,
	DeleteTableStyleParams,
	AssignTableStyleParams,
} from './table-style-tools';

export { updateElementStyle, runAccessibilityCheck } from './style-tools';
export type {
	UpdateElementStyleParams,
	AccessibilityIssue,
	AccessibilityCheckResult,
} from './style-tools';

export { findText, replaceText, manageComments } from './content-tools';
export type {
	FindTextParams,
	TextMatch,
	FindTextResult,
	ReplaceTextParams,
	ReplaceTextResult,
	ManageCommentsParams,
	CommentInfo,
	ManageCommentsResult,
} from './content-tools';

export { convertToMarkdown } from './conversion-tools';
export type { ConvertToMarkdownParams, ConvertToMarkdownResult } from './conversion-tools';

export { getThemeInfo, applyThemePreset, updateThemeColors, updateThemeFonts } from './theme-tools';
export type {
	ThemeInfo,
	ApplyThemePresetParams,
	ApplyThemePresetResult,
	UpdateThemeColorsParams,
	UpdateThemeFontsParams,
} from './theme-tools';

export {
	updateChart,
	addChartSeriesT,
	removeChartSeriesT,
	updateChartSeriesData,
	createChart,
} from './chart-tools';
export type {
	UpdateChartParams,
	AddChartSeriesParams,
	RemoveChartSeriesParams,
	UpdateChartSeriesDataParams,
	CreateChartParams,
	CreateChartResult,
} from './chart-tools';

export {
	formatChartDataPoint,
	formatChartDataLabel,
	formatChartSeries,
	setChartHelperLineT,
	setChartColorMapOverrideT,
} from './chart-formatting-tools';
export type {
	FormatChartDataPointParams,
	FormatChartDataLabelParams,
	FormatChartSeriesParams,
	SetChartHelperLineParams,
	SetChartColorMapOverrideParams,
} from './chart-formatting-tools';

export {
	listChartUserShapesT,
	addChartUserShapeT,
	updateChartUserShapeT,
	removeChartUserShapeT,
} from './chart-user-shape-tools';
export type {
	ChartUserShapeInput,
	ListChartUserShapesParams,
	AddChartUserShapeParams,
	UpdateChartUserShapeParams,
	RemoveChartUserShapeParams,
} from './chart-user-shape-tools';

export { manageSmartArt } from './smartart-tools';
export type {
	ManageSmartArtParams,
	SmartArtNodeInfo,
	ManageSmartArtResult,
} from './smartart-tools';

export { mergePresentationT, diffPresentationsT } from './merge-tools';
export type {
	MergePresentationParams,
	MergePresentationResult,
	DiffPresentationsParams,
} from './merge-tools';

export { findPlaceholdersT, applyTemplateT } from './template-tools';
export type {
	FindPlaceholdersResult,
	ApplyTemplateParams,
	ApplyTemplateResult,
} from './template-tools';

export { getMetadata, updateMetadata } from './metadata-tools';
export type { MetadataResult, UpdateMetadataParams } from './metadata-tools';

export { manageSections } from './section-tools';
export type { ManageSectionsParams, SectionInfo, ManageSectionsResult } from './section-tools';

export { exportToSvg, exportSlideSvg } from './export-tools';
export type {
	ExportToSvgParams,
	ExportToSvgResult,
	ExportSlideSvgParams,
	ExportSlideSvgResult,
} from './export-tools';

export { exportToJson, importFromJson } from './json-tools';
export type {
	ExportToJsonParams,
	ExportToJsonResult,
	ImportFromJsonParams,
	ImportFromJsonResult,
} from './json-tools';

export { manageHyperlinks } from './hyperlink-tools';
export type {
	ManageHyperlinksParams,
	HyperlinkInfo,
	ManageHyperlinksResult,
} from './hyperlink-tools';

export { replaceGeometry } from './geometry-tools';
export type { ReplaceGeometryParams } from './geometry-tools';

export { setElementLockT } from './lock-tools';
export type { SetElementLockParams } from './lock-tools';

export { validatePresentation, repairPresentation } from './validation-tools';
export type { ValidatePresentationResult, RepairPresentationResult } from './validation-tools';

export { getPresentationProperties, updatePresentationProperties } from './presentation-tools';
export type { UpdatePresentationPropertiesParams } from './presentation-tools';

export { getLayouts, applyLayout } from './layout-tools';
export type {
	GetLayoutsResult,
	ApplyLayoutParams,
	ApplyLayoutResult,
	LayoutInfo,
} from './layout-tools';

export {
	getOleContent,
	setOleSheetCell,
	setOleDocumentParagraph,
	setOleDeckSlideTitle,
	replaceOleFileT,
	setOleObjectNameT,
} from './ole-tools';
export type {
	GetOleContentParams,
	GetOleContentResult,
	SetOleContentResult,
	SetOleSheetCellParams,
	SetOleDocumentParagraphParams,
	SetOleDeckSlideTitleParams,
	ReplaceOleFileParams,
	SetOleObjectNameParams,
} from './ole-tools';
