import type { VisioThemeColorRef } from 'ooxml-core/visio';
import type {
	VisioBuiltInThemeId,
	VisioCalloutStyle,
	VisioChangeShapeTarget,
	VisioContainerStyle,
	VisioConnectorRoute,
	VisioShapeFormatEdit,
} from 'ooxml-core/visio';
import type {
	TextCaseMode,
	VisioArrangement,
	VisioRuleSetId,
	VisioLayoutStyle,
} from 'ooxml-core/visio/ui';
import type { VisioPageSetupCommand } from './page-setup-action';

export type CanvasTool =
	| 'pointer'
	| 'connector'
	| 'connection-point'
	| 'rectangle'
	| 'ellipse'
	| 'line'
	| 'text'
	| 'freeform'
	| 'arc'
	| 'pencil';
export type VisioFormattingAction =
	| { type: 'text-toggle'; property: 'bold' | 'italic' | 'underline' | 'strikethrough' }
	| { type: 'font-color'; value?: string; theme?: VisioThemeColorRef }
	| { type: 'text-bullets' }
	/** Home > Paragraph > Rotate Text: the text block turns 90 degrees counter-clockwise. */
	| { type: 'text-rotate' }
	| { type: 'text-indent'; direction: 'increase' | 'decrease' }
	| { type: 'font-family'; value: string }
	| { type: 'font-size'; value: number }
	| { type: 'font-step'; direction: 1 | -1 }
	| { type: 'text-align'; axis: 'horizontal'; value: 'left' | 'center' | 'right' | 'justify' }
	| { type: 'text-align'; axis: 'vertical'; value: 'top' | 'middle' | 'bottom' }
	| { type: 'shape-format'; patch: Omit<VisioShapeFormatEdit, 'type' | 'pageId' | 'shapeId'> }
	/** A Glow Variations preset: its colour is the page theme's accent (1-6) when it is applied. */
	| { type: 'glow-preset'; size: number; accent: number }
	| { type: 'shape-order'; order: 'front' | 'back' | 'forward' | 'backward' }
	| { type: 'change-case'; mode: TextCaseMode };
/** Text dialogs and tools: Home launchers and Text Block, Insert Symbol/Field, Review proofing. */
export type VisioTextFeature =
	| 'text-dialog'
	| 'paragraph-dialog'
	| 'text-block'
	| 'symbol'
	| 'field'
	| 'spelling'
	| 'language';
/** Insert-tab items that act on the page or the selected shape. */
export type VisioInsertItem = 'picture' | 'link' | 'screen-tip';
/** Review and Process tab commands: comments, shape reports, diagram checks and subprocesses. */
export type VisioReviewCommand =
	| 'new-comment'
	| 'page-comment'
	| 'comments-pane'
	| 'shape-reports'
	| 'check-diagram'
	| 'issues-window'
	| 'ignore-issue'
	| 'rule-set'
	| 'subprocess-new'
	| 'subprocess-existing'
	| 'subprocess-selection';
/** Insert > Diagram Parts: a container or callout in one of its styles. */
export type VisioDiagramPartAction =
	| { type: 'diagram-part'; part: 'container'; style: VisioContainerStyle }
	| { type: 'diagram-part'; part: 'callout'; style: VisioCalloutStyle };
/** Data-tab commands: import, refresh, data graphics, legend, windows and Shape Data. */
export type VisioDataCommand =
	| 'quick-import'
	| 'custom-import'
	| 'refresh'
	| 'graphic-text'
	| 'graphic-bar'
	| 'graphic-icon'
	| 'graphic-color'
	| 'graphic-remove'
	| 'legend'
	| 'legend-horizontal'
	| 'external-data-window'
	| 'define-shape-data';
/** Arrangement, layout, layer, selection, view and output commands (viewer-layout and friends). */
export type VisioLayoutAction =
	| { type: 'auto-align' }
	| { type: 're-layout'; style: VisioLayoutStyle }
	| { type: 'layout-options' }
	| { type: 'assign-layers' }
	| { type: 'layer-properties' }
	| { type: 'select-by-type' }
	| { type: 'paste-special' }
	| { type: 'guides' }
	| { type: 'dynamic-grid' }
	| { type: 'auto-connect' }
	| { type: 'drawing-explorer' }
	| { type: 'help'; topic: 'help' | 'training' };
/** Every command the Visio ribbon, status bar or a shortcut can raise, as a `ribbon-action` event. */
export type VisioRibbonAction =
	| VisioFormattingAction
	| VisioLayoutAction
	| { type: 'arrange'; operation: VisioArrangement }
	| { type: 'selection'; mode: 'all' | 'clear' }
	| { type: 'history'; key: 'undo' | 'redo' }
	| { type: 'tool'; tool: CanvasTool }
	| { type: 'cancel-drawing' }
	| { type: 'page-insert' }
	| { type: 'insert'; item: VisioInsertItem }
	| { type: 'data'; command: VisioDataCommand }
	| { type: 'text-feature'; feature: VisioTextFeature }
	/** Opens the Format Shape task pane, at one of its sections when given. */
	| { type: 'format-shape-pane'; section?: 'fill' | 'line' | 'effects' }
	| { type: 'page-theme'; theme?: VisioBuiltInThemeId | 'none'; variant?: number }
	| { type: 'delete' }
	| { type: 'duplicate' }
	| { type: 'format-painter'; mode: 'once' | 'sticky' | 'cancel' }
	| { type: 'grouping'; operation: 'group' | 'ungroup' }
	| { type: 'clipboard'; operation: 'copy' | 'cut' | 'paste'; event?: ClipboardEvent }
	| { type: 'rotate'; direction: 'left' | 'right' }
	| { type: 'flip'; axis: 'horizontal' | 'vertical' }
	/** A Basic Shapes outline, or `document:<id>` for a master of the drawing's own stencil. */
	| { type: 'change-shape'; shape: VisioChangeShapeTarget | `document:${string}` }
	| VisioDiagramPartAction
	| { type: 'pane'; pane: 'shapes' | 'inspector' }
	| { type: 'reveal'; panel: 'edit' | 'notes' | 'selection'; focusText?: boolean }
	| { type: 'grid' }
	| { type: 'connection-points' }
	/** Design > Connectors restyles the selection; Insert > Connector arms the tool. */
	| { type: 'connector-route'; route: VisioConnectorRoute; scope: 'selection' | 'tool' }
	| { type: 'panZoom' }
	| { type: 'sizePosition' }
	| { type: 'ruler' }
	| { type: 'fullscreen' }
	| { type: 'presentation' }
	| { type: 'zoom'; mode: 'fit' | 'width' | 'actual' }
	| { type: 'zoomTo'; percent: number }
	| { type: 'search' }
	| { type: 'replace' }
	| { type: 'page'; step: 1 | -1 }
	| { type: 'page-setup'; command: VisioPageSetupCommand }
	| { type: 'review'; command: VisioReviewCommand; ruleSet?: VisioRuleSetId };

/** Event name shared by every ribbon control; detail is the typed action. */
export const RIBBON_ACTION_EVENT = 'ribbon-action';
export type RibbonActionEvent = CustomEvent<VisioRibbonAction>;

/** Internal, non-composed event: it stays inside the viewer's shadow tree. */
export function emitRibbonAction(target: EventTarget, action: VisioRibbonAction): void {
	target.dispatchEvent(new CustomEvent(RIBBON_ACTION_EVENT, { detail: action, bubbles: true }));
}
