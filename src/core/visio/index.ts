/** VSDX parsing/editing and conservative legacy VSD preview scenes. */
export type * from './model';
export type { VisioShapeData, VisioHyperlink, VisioMetadataOptions } from './shape-metadata';
export {
	VISIO_DATA_LIMITS,
	type VisioDataRecordset,
	type VisioDataColumn,
	type VisioDataColumnType,
	type VisioDataRow,
	type VisioDataLink,
} from './data-recordsets';
export {
	VISIO_SHAPE_DATA_TYPES,
	visioShapeDataRowName,
	canonicalShapeDataValue,
} from './edit-shape-data-commands';
export { visioLinkedRowNames } from './edit-data';
export { parseVsdx, getVisioPageLayers, type ParseVsdxOptions } from './parser';
export { loadVisio } from './load';
export { parseLegacyVsd, type ParseLegacyVsdOptions } from './legacy';
export { VisioPackageError, type VisioPackageLimits } from './package';
export {
	resolveVisioPageVisibility,
	VISIO_VISIBILITY_LIMITS,
	type VisioVisibilityOptions,
	type VisioResolvedShapeVisibility,
} from './visibility';
export {
	inspectVisioRasterImage,
	VisioImageError,
	VISIO_RASTER_IMAGE_LIMITS,
	type VisioImageOptions,
	type VisioImageErrorCode,
	type VisioRasterImageInfo,
} from './media';
export {
	inspectVisioEmfAdmission,
	VISIO_EMF_ADMISSION_LIMITS,
	type VisioEmfAdmissionOptions,
	type VisioEmfAdmissionResult,
	type VisioEmfAdmissionStatus,
	type VisioEmfAdmissionDiagnostic,
	type VisioEmfAdmissionMetrics,
} from './emf-admission';
export {
	sanitizeVisioForeignVectorTree,
	validateVisioForeignVector,
	VisioForeignVectorError,
	VISIO_FOREIGN_VECTOR_LIMITS,
	type VisioForeignVector,
	type VisioForeignVectorLimits,
	type VisioForeignVectorCommand,
	type VisioForeignVectorClip,
	type VisioForeignVectorClipPath,
	type VisioForeignVectorNode,
	type VisioForeignVectorPath,
	type VisioForeignVectorPaint,
	type VisioForeignVectorMatrix,
} from './foreign-vector';
export {
	convertVisioMetafile,
	type VisioMetafileTreeConverter,
	type VisioMetafileConversionResult,
} from './convert-metafile';

export {
	editVsdx,
	type VisioEdit,
	type VisioGeometryEdit,
	type VisioTextEdit,
	type VisioTextRange,
	type VisioTextRangesEdit,
	type VisioTextFieldInsertEdit,
	type VisioPageInsert,
	type VisioPageReorder,
	type VisioPageRename,
	type VisioPageDelete,
	type VisioPageSizeEdit,
	type VisioPageSetupEdit,
	type VisioPagePropertiesEdit,
	type VisioPageDecorationEdit,
	type VisioPageSetupEdits,
	type VisioScaleUnit,
	type VisioPageEdit,
	type VisioFormatEdit,
	type VisioTextFormatEdit,
	type VisioShapeFormatEdit,
	type VisioShapeOrderEdit,
	type VisioDuplicateShapesEdit,
	type VisioPasteShapesEdit,
	type VisioMetadataEdit,
	type VisioPictureInsertEdit,
	type VisioAssignLayersEdit,
	type VisioLayerPropertiesEdit,
	type VisioMasterInstanceEdit,
	type VisioStencilMasterDropEdit,
	type VisioGuideEdit,
	type VisioShapeHyperlinkEdit,
	type VisioShapeScreenTipEdit,
	type VisioHyperlinkFields,
	type VisioGroupEdit,
	type VisioDiagramPartEdit,
	type VisioInsertContainerEdit,
	type VisioInsertCalloutEdit,
	type VisioGroupShapesEdit,
	type VisioUngroupShapeEdit,
	type VisioResizeAnchor,
	type VisioChangeShapeEdit,
	type VisioChangeShapeTarget,
	type VisioConnectorGlue,
	type VisioPageThemeEdit,
	type VisioShapeDataEdit,
	type VisioShapeDataFields,
	type VisioShapeDataType,
	type VisioDataEdit,
	type VisioDataImportEdit,
	type VisioDataRefreshEdit,
	type VisioDataDeleteEdit,
	type VisioDataLinkEdit,
	type VisioDataUnlinkEdit,
	type EditVsdxOptions,
	type EditVsdxResult,
} from './edit';
export {
	captureVisioClipboard,
	serializeVisioClipboard,
	deserializeVisioClipboard,
	VISIO_CLIPBOARD_MAGIC,
	VISIO_CLIPBOARD_MAX_CHARS,
	type VisioClipboardSnapshot,
} from './clipboard';
export { createVsdx, type CreateVsdxOptions } from './create-document';
export { VISIO_PATH_SEGMENT_LIMIT, type VisioPathCreateEdit } from './edit-path-commands';
export {
	VISIO_CONNECTOR_ROUTES,
	type VisioConnectorRoute,
	type VisioConnectorEdit,
	type VisioAddConnectionPointEdit,
	type VisioDeleteConnectionPointEdit,
	type VisioGlueConnectorEdit,
	type VisioConnectorRouteEdit,
} from './edit-connector-commands';
export {
	visioOrthogonalRoute,
	visioCurvedRoute,
	type VisioRouteBox,
	type VisioRouteEnd,
	type VisioRoutePoint,
} from './connector-route';
export {
	visioSimplifyPath,
	visioFitFreeform,
	visioFitPencil,
	visioQuarterArc,
	visioPathSamples,
	visioPathBounds,
	visioCircleThrough,
	type VisioPathPoint,
	type VisioPathSegment,
} from './path-fit';
export {
	VISIO_QUICK_STYLE_COLORS,
	VISIO_QUICK_STYLE_VARIANT_COLORS,
	VISIO_SHADOW_PRESETS,
	isVisioQuickStyleColor,
	isVisioShadowPreset,
	visioFallbackQuickStyle,
	visioShadowPresetGeometry,
	type VisioQuickStyle,
	type VisioQuickStyleColor,
	type VisioShadowPreset,
} from './edit-formatting-effects';
export {
	VISIO_GLOW_SIZES,
	VISIO_GLOW_TRANSPARENCY,
	VISIO_SOFT_EDGE_SIZES,
	VISIO_REFLECTION_PRESETS,
	type VisioGlowEffect,
	type VisioReflectionEffect,
} from './edit-formatting-glow';
export {
	VISIO_BUILT_IN_THEMES,
	VISIO_BUILT_IN_THEME_IDS,
	isVisioBuiltInThemeId,
	visioBuiltInTheme,
	visioThemeVariantColors,
	type VisioBuiltInTheme,
	type VisioBuiltInThemeId,
} from './theme-builtins';
export { visioThemeXml } from './theme-write';
export {
	VISIO_THEME_COLOR_SLOTS,
	VISIO_UNTHEMED_COLORS,
	isVisioThemeColorRef,
	parseVisioThemeColorFormula,
	resolveVisioThemeColor,
	visioPageThemeColors,
	visioThemeColorFormula,
	type VisioThemeColorRef,
	type VisioThemeColorSlot,
	type VisioThemeColorValues,
} from './theme-color-ref';
export {
	VISIO_BASIC_SHAPES,
	isVisioBasicShape,
	visioBasicShapeOutline,
	type VisioBasicShape,
	type VisioBasicOutline,
	type VisioOutlinePoint,
} from './basic-shapes';
export { isVisioChangeShapeTarget } from './edit-change-shape-commands';
export { VISIO_SCALE_UNITS } from './edit-page-setup-commands';
export type { VisioPageLayoutEdit } from './edit-page-layout';
export type { VisioSnapGlueEdit } from './edit-snap-glue';
export {
	VISIO_GLUE,
	VISIO_SNAP,
	VISIO_SNAP_GLUE_DEFAULTS,
	visioSnapGlue,
	type VisioSnapGlue,
} from './snap-glue';
export { VISIO_LINE_JUMP_LIMITS, VISIO_LINE_JUMP_WIDTH, visioLineJumpPaths } from './line-jumps';
export {
	VISIO_GRID_DENSITIES,
	VISIO_PAGE_LAYOUT_DEFAULTS,
	VISIO_RULER_DENSITIES,
	visioPageLayout,
	type VisioPageLayout,
} from './page-layout';
export {
	VISIO_BACKGROUND_STYLES,
	VISIO_BORDER_STYLES,
	VISIO_MANAGED_BACKGROUND,
	visioBackgroundShapes,
	visioBorderShapes,
	visioDecorationName,
	visioShade,
	type VisioBackgroundStyle,
	type VisioBorderStyle,
	type VisioDecorationShape,
} from './page-decoration';
export {
	VISIO_FLOWCHART_SHAPES,
	VISIO_ARROW_SHAPES,
	isVisioStencilShape,
	isVisioOutlineShape,
	visioOutlineShape,
	visioStencilShapeOutline,
	type VisioFlowchartShape,
	type VisioArrowShape,
	type VisioStencilShape,
	type VisioOutlineShape,
} from './stencil-shapes';
export {
	VISIO_STENCIL_FILES,
	visioBuiltInStencil,
	type VisioBuiltInStencilId,
} from './stencil-windows';
export {
	VISIO_BASIC_STENCIL,
	VISIO_BUILT_IN_STENCILS,
	visioBuiltInMaster,
	type VisioBuiltInMaster,
} from './stencil-masters';
export {
	VISIO_STENCILS,
	visioStencilMaster,
	type VisioStencil,
	type VisioStencilMaster,
} from './stencils';
export {
	VISIO_CONTAINER_STYLES,
	VISIO_CALLOUT_STYLES,
	VISIO_CONTAINER_MARGIN,
	VISIO_CONTAINER_HEADING,
	isVisioDiagramPartEdit,
	type VisioContainerStyle,
	type VisioCalloutStyle,
	type VisioPartBox,
} from './edit-diagram-parts-commands';
export { visioShapeStructure, type VisioShapeStructure } from './shape-structure';
export {
	VISIO_TEXT_CASES,
	VISIO_TEXT_POSITIONS,
	type VisioTextBlockTransform,
	type VisioTextCase,
	type VisioTextFormatExtras,
	type VisioTextMargins,
	type VisioTextPosition,
} from './edit-formatting-text-commands';
export {
	VISIO_FIELD_FORMATS,
	VISIO_FIELD_FUNCTIONS,
	evaluateVisioTextField,
	formatVisioFieldValue,
	type VisioFieldContext,
	type VisioFieldProperties,
	type VisioFieldValue,
} from './text-fields';
export {
	parseVisioFormula,
	analyzeVisioFormula,
	evaluateVisioFormula,
	visioFormulaCachedValue,
	VisioFormulaError,
	type VisioFormulaAst,
	type VisioFormulaLimits,
	type VisioFormulaValue,
	type VisioFormulaReference,
	type VisioFormulaUnit,
} from './formula';
export { visioOpenArrowExtent, visioOpenArrowPath } from './open-arrow';
export {
	visioFilledArrow,
	trimVisioArrowLine,
	layoutVisioFilledArrowLine,
	type VisioFilledArrow,
	type VisioArrowLineLayout,
} from './filled-arrow';
export { VISIO_PICTURE_MAX_BYTES, VISIO_METADATA_TEXT_LIMIT } from './edit-metadata-commands';
export {
	VISIO_COMMENT_LIMIT,
	VISIO_COMMENT_TEXT_LIMIT,
	VISIO_COMMENT_AUTHOR_LIMIT,
} from './comments';
export type {
	VisioCommentEdit,
	VisioCommentAddEdit,
	VisioCommentUpdateEdit,
	VisioCommentDeleteEdit,
	VisioSubprocessEdit,
	VisioSubprocessSelection,
} from './edit';
export { isVisioLayerName, VISIO_LAYER_NAME_LIMIT } from './edit-layer-commands';
export {
	designTextMeasurer,
	setVisioTextMeasurer,
	visioTextExtents,
	type VisioTextExtents,
	type VisioTextMeasureStyle,
	type VisioTextMeasurer,
} from './text-extent';
export { visioFontAssumed } from './style';
