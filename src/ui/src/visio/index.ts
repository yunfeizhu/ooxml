export { ViewerController, type ViewerState } from './controller';
export type { CreateVsdxOptions } from 'ooxml-core/visio';
export type { ViewerClipboardState, ViewerClipboardToken } from './clipboard-capture';
export { mountViewer, type MountedViewer } from './binding';
export { VisioViewerElement, registerVisioViewer } from './viewer-element';
export { renderPage, type RenderResult, type RenderOptions } from './render-svg';
export {
	exportPageSvg,
	MAX_SVG_EXPORT_BYTES,
	type SvgExportOptions,
	type SvgExportResult,
} from './export-svg';
export {
	createPrintSnapshot,
	PRINT_SNAPSHOT_LIMITS,
	type PrintSnapshot,
	type PrintSnapshotPage,
	type PrintSnapshotOptions,
	type PrintSnapshotLimits,
	type PrintSnapshotUsage,
	type CurrentPagePrintSnapshotOptions,
} from './print-snapshot';
export {
	eventKeys,
	propertyKeys,
	type ViewerProperties,
	type ViewerEvents,
	type ViewerCallbacks,
	type ViewerOptions,
	type VsdxSource,
	type VisioShapeSelection,
} from 'ooxml-core/visio/ui';
export type { VisioDocument, VisioPage, VisioShape, VisioDiagnostic } from 'ooxml-core/visio';

export { createWorkerParser, type CancellableParser } from './worker-parser';

export { compatibilityNotes, compatibilityText, type CompatibilityNote } from 'ooxml-core/visio/ui';

export {
	TEXT_SEARCH_LIMITS,
	type TextSearchResult,
	type TextSearchState,
} from 'ooxml-core/visio/ui';

export { VIEWER_LAYER_LIMITS, type LayerVisibilityOverride } from './viewer-layers';

export type { ViewerEditState, VsdxExportResult } from 'ooxml-core/visio/ui';

export type { VisioEdit, VisioGeometryEdit } from 'ooxml-core/visio';

/** The built-in demo document, for the demo and tests. */
export { demoDocument } from 'ooxml-core/visio/ui';
export {
	RIBBON_ADD_IN_EVENT,
	type OfficeRibbonAddInEvent,
	type RibbonAddInCommand,
	type RibbonAddInCommandDetail,
	type RibbonAddInGroup,
	type RibbonAddInTab,
} from '../ribbon/add-in-tabs';
