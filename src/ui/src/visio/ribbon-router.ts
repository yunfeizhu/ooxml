import type { ViewerController } from './controller';
import type {
	VisioRibbonAction,
	CanvasTool,
	VisioFormattingAction,
	VisioInsertItem,
	VisioDataCommand,
	VisioLayoutAction,
	VisioTextFeature,
} from './ribbon-action';

/** The controllers a ribbon action can reach. The element supplies each one. */
export interface RibbonTargets {
	controller: ViewerController;
	history(key: 'undo' | 'redo'): void;
	deleteSelection(): void;
	duplicateSelection(): void;
	groupSelection(operation: 'group' | 'ungroup'): void;
	clipboard(action: Extract<VisioRibbonAction, { type: 'clipboard' }>): void;
	rotateSelection(direction: 'left' | 'right'): void;
	flipSelection(axis: 'horizontal' | 'vertical'): void;
	changeShape(shape: Extract<VisioRibbonAction, { type: 'change-shape' }>['shape']): void;
	insertDiagramPart(action: Extract<VisioRibbonAction, { type: 'diagram-part' }>): void;
	formatSelection(action: VisioFormattingAction): void;
	formatPainter(mode: 'once' | 'sticky' | 'cancel'): void;
	arrangeSelection(action: Extract<VisioRibbonAction, { type: 'arrange' }>): void;
	setTool(tool: CanvasTool): void;
	cancelDrawing(): void;
	insertPage(): void;
	insert(item: VisioInsertItem): void;
	data(command: VisioDataCommand): void;
	textFeature(feature: VisioTextFeature): void;
	/** Opens the Format Shape task pane, at a section when given. */
	showFormatPane(section?: 'fill' | 'line' | 'effects'): void;
	pageTheme(action: Extract<VisioRibbonAction, { type: 'page-theme' }>): void;
	toggleGrid(): void;
	toggleConnectionPoints?(): void;
	connectorRoute?(action: Extract<VisioRibbonAction, { type: 'connector-route' }>): void;
	toggleRuler(): void;
	togglePanZoom(): void;
	toggleSizePosition(): void;
	toggleFullscreen(): void;
	present(): void;
	togglePane(pane: 'shapes' | 'inspector'): void;
	reveal(panel: 'edit' | 'notes' | 'selection' | 'format', focusText: boolean): void;
	fit(mode: 'page' | 'width'): void;
	focusSearch(): void;
	focusReplace(): void;
	pageSetup(command: Extract<VisioRibbonAction, { type: 'page-setup' }>['command']): void;
	review(action: Extract<VisioRibbonAction, { type: 'review' }>): void;
	/** Layout, layers, selection, guides, explorer, export and help (ViewerLayoutCommands). */
	layout(action: VisioLayoutAction): void;
}

/** Routes a ribbon, status-bar or shortcut action to the controller that owns it. */
export function routeRibbonAction(targets: RibbonTargets, action: VisioRibbonAction): void {
	const { controller } = targets;
	const page = controller.state.document?.pages[controller.state.pageIndex];
	switch (action.type) {
		case 'arrange':
			return targets.arrangeSelection(action);
		case 'auto-align':
		case 're-layout':
		case 'layout-options':
		case 'assign-layers':
		case 'layer-properties':
		case 'select-by-type':
		case 'paste-special':
		case 'guides':
		case 'dynamic-grid':
		case 'auto-connect':
		case 'drawing-explorer':
		case 'help':
			return targets.layout(action);
		case 'selection':
			return action.mode === 'all' ? controller.selectAll() : controller.clearSelection();
		case 'text-toggle':
		case 'font-color':
		case 'text-bullets':
		case 'text-rotate':
		case 'text-indent':
		case 'font-family':
		case 'font-size':
		case 'font-step':
		case 'text-align':
		case 'shape-format':
		case 'glow-preset':
		case 'shape-order':
		case 'change-case':
			return targets.formatSelection(action);
		case 'format-painter':
			return targets.formatPainter(action.mode);
		case 'history':
			return targets.history(action.key);
		case 'delete':
			return targets.deleteSelection();
		case 'duplicate':
			return targets.duplicateSelection();
		case 'grouping':
			return targets.groupSelection(action.operation);
		case 'clipboard':
			return targets.clipboard(action);
		case 'rotate':
			return targets.rotateSelection(action.direction);
		case 'flip':
			return targets.flipSelection(action.axis);
		case 'change-shape':
			return targets.changeShape(action.shape);
		case 'diagram-part':
			return targets.insertDiagramPart(action);
		case 'tool':
			return targets.setTool(action.tool);
		case 'cancel-drawing':
			return targets.cancelDrawing();
		case 'page-insert':
			return targets.insertPage();
		case 'insert':
			return targets.insert(action.item);
		case 'data':
			return targets.data(action.command);
		case 'text-feature':
			return targets.textFeature(action.feature);
		case 'format-shape-pane':
			return targets.showFormatPane(action.section);
		case 'page-theme':
			return targets.pageTheme(action);
		case 'grid':
			return targets.toggleGrid();
		case 'connection-points':
			return targets.toggleConnectionPoints?.();
		case 'connector-route':
			return targets.connectorRoute?.(action);
		case 'ruler':
			return targets.toggleRuler();
		case 'panZoom':
			return targets.togglePanZoom();
		case 'sizePosition':
			return targets.toggleSizePosition();
		case 'fullscreen':
			return targets.toggleFullscreen();
		case 'presentation':
			return targets.present();
		case 'pane':
			return targets.togglePane(action.pane);
		case 'reveal':
			return targets.reveal(action.panel, action.focusText ?? false);
		case 'search':
			return targets.focusSearch();
		case 'replace':
			return targets.focusReplace();
		case 'page-setup':
			return targets.pageSetup(action.command);
		case 'review':
			return targets.review(action);
		case 'page':
			return controller.setPage(controller.state.pageIndex + action.step);
		case 'zoomTo':
			if (page) controller.setZoom(action.percent / 100);
			return;
		case 'zoom':
			if (!page) return;
			if (action.mode === 'actual') return controller.setZoom(1);
			return targets.fit(action.mode === 'fit' ? 'page' : 'width');
	}
}
