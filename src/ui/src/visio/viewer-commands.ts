import type { VisioGridSteps } from 'ooxml-core/visio/ui';
import type { ViewerController, ViewerState } from './controller';
import {
	editErrorMessage,
	isEditCancellation,
	visioPageInsertCommand,
	visioQuarterTurnCommand,
	visioRotationShape,
	visioSelectionIsOnPage,
	visioWithCalloutLeaders,
} from 'ooxml-core/visio/ui';
import { RIBBON_ACTION_EVENT, type VisioRibbonAction, type CanvasTool } from './ribbon-action';
import type { RibbonCommand } from './ribbon-parts';
import { routeRibbonAction, type RibbonTargets } from './ribbon-router';
import { ShapeDrawTool } from './viewer-draw-tool';
import { ViewerTextTool } from './viewer-text-tool';
import { ViewerConnectorTool } from './viewer-connector-tool';
import { ViewerConnectionPoints } from './viewer-connection-points';
import { ViewerConnectorRoutes } from './viewer-connector-routes';
import type { Rulers } from './viewer-ruler';
import { ViewerPageOrder } from './viewer-page-order';
import { ViewerPageRename } from './viewer-page-rename';
import { ViewerPageDelete } from './viewer-page-delete';
import { ViewerFormatting } from './viewer-formatting';
import { ViewerFormatPainter } from './viewer-format-painter';
import { ViewerArrangement } from './viewer-arrangement';
import { ViewerChangeShape } from './viewer-change-shape';
import { ViewerDuplication } from './viewer-duplication';
import { ViewerGrouping } from './viewer-grouping';
import { ViewerClipboard, type ClipboardOperation } from './viewer-clipboard';
import { ViewerInsert } from './viewer-insert';
import { ViewerPageSetup } from './viewer-page-setup';
import { ViewerThemes } from './viewer-themes';
import { ViewerColorMenus } from './viewer-color-menus';
import { ViewerFormatPane } from './viewer-format-pane';
import { ViewerReview } from './viewer-review';
import { ViewerDiagramParts } from './viewer-diagram-parts';
import { ViewerData } from './viewer-data';
import { ViewerLayoutCommands } from './viewer-layout-commands';
import { ViewerTextFeatures } from './viewer-text-features';

export type { CanvasTool } from './ribbon-action';
interface CommandHost {
	root: ShadowRoot;
	viewport: HTMLElement;
	rulers: Rulers;
	controller: ViewerController;
	fit(mode: 'page' | 'width'): void;
	togglePane(pane: 'shapes' | 'inspector'): void;
	reveal(panel: 'edit' | 'notes' | 'selection' | 'format', focusText: boolean): void;
	focusSearch(): void;
	focusReplace?(): void;
	togglePanZoom(): void;
	/** Visio's Presentation Mode (F5). */
	present?(): void;
	/** True while Presentation Mode owns the screen. */
	presenting?(): boolean;
	toggleSizePosition(): void;
	/** Transient command feedback for the status bar; document text is never interpreted as markup. */
	announce(message: string): void;
	toolChanged?(): void;
}
const editable = (target: EventTarget | null) =>
	target instanceof Element &&
	!!target.closest(
		'input, textarea, select, office-ui-select, [contenteditable]:not([contenteditable="false"])',
	);

/**
 * Visio command state (tool, grid, pending edits) and keyboard shortcuts. Ribbon controls emit
 * typed `ribbon-action` events and shortcuts build the same actions; both go through
 * `routeRibbonAction`. Document mutation stays in the controller and core.
 */
export class ViewerCommands {
	#tool: CanvasTool = 'pointer';
	#grid = false;
	#ruler = false;
	#pending = 0;
	#draw: ShapeDrawTool;
	#text: ViewerTextTool;
	#connector: ViewerConnectorTool;
	#points: ViewerConnectionPoints;
	#routes: ViewerConnectorRoutes;
	#pageOrder: ViewerPageOrder;
	#pageRename: ViewerPageRename;
	#pageDelete: ViewerPageDelete;
	#formatting: ViewerFormatting;
	#painter: ViewerFormatPainter;
	#arrangement: ViewerArrangement;
	#changeShape: ViewerChangeShape;
	#duplication: ViewerDuplication;
	#grouping: ViewerGrouping;
	#clipboard: ViewerClipboard;
	#insert: ViewerInsert;
	#pageSetup: ViewerPageSetup;
	#themes: ViewerThemes;
	#colors: ViewerColorMenus;
	#formatPane: ViewerFormatPane;
	#review: ViewerReview;
	#parts: ViewerDiagramParts;
	#data: ViewerData;
	readonly layoutCommands: ViewerLayoutCommands;
	#textFeatures: ViewerTextFeatures;
	readonly #targets: RibbonTargets;
	constructor(private readonly host: CommandHost) {
		this.#clipboard = new ViewerClipboard(host.root, host.controller, host.announce, () =>
			this.render(host.controller.state),
		);
		this.#duplication = new ViewerDuplication(host.root, host.controller, (run, message) => {
			void this.#edit(run, message);
		});
		this.#grouping = new ViewerGrouping(host.root, host.controller, (run, message) => {
			void this.#edit(run, message);
		});
		this.#arrangement = new ViewerArrangement(host.root, host.controller, (run, message) => {
			void this.#edit(run, message);
		});
		this.#changeShape = new ViewerChangeShape(host.root, host.controller, (run, message) => {
			void this.#edit(run, message);
		});
		this.#formatting = new ViewerFormatting(host.root, host.controller, (run, success) => {
			void this.#edit(run, success);
		});
		this.#insert = new ViewerInsert(host.root, host.controller, host.announce, (run, message) => {
			void this.#edit(run, message);
		});
		this.#pageSetup = new ViewerPageSetup(
			host.root,
			host.controller,
			(run, message) => {
				void this.#edit(run, message);
			},
			host.announce,
		);
		this.#review = new ViewerReview(
			host.root,
			host.viewport,
			host.controller,
			host.announce,
			(run, message) => void this.#edit(run, message),
		);
		this.#parts = new ViewerDiagramParts(
			host.root,
			host.controller,
			(run, message) => void this.#edit(run, message),
			() => host.reveal('edit', true),
		);
		this.#data = new ViewerData(host.root, host.controller, host.announce, (run, message) => {
			void this.#edit(run, message);
		});
		this.layoutCommands = new ViewerLayoutCommands({
			root: host.root,
			viewport: host.viewport,
			rulers: host.rulers.element,
			controller: host.controller,
			announce: host.announce,
			edit: (run, message) => {
				void this.#edit(run, message);
			},
			pasteShapes: () => this.#clipboard.run('paste'),
			pointerTool: () => this.#tool === 'pointer',
		});
		this.#textFeatures = new ViewerTextFeatures(
			host.root,
			host.viewport,
			host.controller,
			host.announce,
			(run, message) => void this.#edit(run, message),
			(panel, focus) => host.reveal(panel, focus),
		);
		this.#themes = new ViewerThemes(host.root, host.controller, (run, message) => {
			void this.#edit(run, message);
		});
		this.#colors = new ViewerColorMenus(host.root, host.controller, (action) =>
			this.#formatting.run(action),
		);
		this.#formatPane = new ViewerFormatPane(
			host.root,
			host.controller,
			this.#colors,
			(action) => this.#formatting.run(action),
			() => host.reveal('format', false),
			host.announce,
		);
		this.#painter = new ViewerFormatPainter(host.root, host.controller, host.announce, (run, m) => {
			void this.#edit(run, m);
		});
		this.#pageOrder = new ViewerPageOrder(host.root, host.controller);
		this.#pageRename = new ViewerPageRename(host.root, host.controller);
		this.#pageDelete = new ViewerPageDelete(host.root, host.controller);
		this.#draw = new ShapeDrawTool(host.viewport, host.controller, {
			tool: () =>
				this.#tool === 'pointer' ||
				this.#tool === 'text' ||
				this.#tool === 'connector' ||
				this.#tool === 'connection-point'
					? undefined
					: this.#tool,
			announce: host.announce,
		});
		this.#routes = new ViewerConnectorRoutes(host.root, host.controller, {
			setTool: (tool) => this.setTool(tool),
			edit: (run, message) => void this.#edit(run, message),
			announce: host.announce,
		});
		this.#connector = new ViewerConnectorTool(host.viewport, host.controller, {
			active: () => this.#tool === 'connector',
			announce: host.announce,
			route: () => this.#routes.route,
		});
		this.#points = new ViewerConnectionPoints(host.viewport, host.controller, {
			active: () => this.#tool === 'connection-point',
			showing: () => this.#tool === 'connector',
			announce: host.announce,
		});
		this.#text = new ViewerTextTool(host.viewport, host.controller, {
			active: () => this.#tool === 'text',
			announce: host.announce,
			revealEdit: () => host.reveal('edit', true),
		});
		this.#targets = {
			controller: host.controller,
			history: (key) => this.#history(key),
			deleteSelection: () => this.#delete(),
			duplicateSelection: () => this.#duplication.run(),
			groupSelection: (operation) => this.#grouping.run(operation),
			clipboard: (action) => {
				void this.#clipboard.run(action.operation, action.event).catch((error: unknown) => {
					if (!isEditCancellation(error)) host.announce(editErrorMessage(error));
				});
			},
			rotateSelection: (direction) => this.#transform({ type: 'rotate', direction }),
			flipSelection: (axis) => this.#transform({ type: 'flip', axis }),
			changeShape: (shape) => this.#changeShape.run(shape),
			insertDiagramPart: (action) => this.#parts.run(action),
			formatSelection: (action) => this.#formatting.run(action),
			formatPainter: (mode) => this.#painter.run(mode),
			arrangeSelection: (action) => this.#arrangement.run(action.operation),
			layout: (action) => this.layoutCommands.run(action),
			setTool: (tool) => this.setTool(tool),
			cancelDrawing: () => {
				this.#draw.cancel();
				this.#connector.cancel();
				this.#text.cancel();
			},
			insertPage: () => this.#insertPage(),
			insert: (item) => this.#insert.open(item),
			data: (command) => this.#data.handle(command),
			textFeature: (feature) => this.#textFeatures.run(feature),
			showFormatPane: (section) => this.#formatPane.show(section),
			pageTheme: (action) => this.#themes.run(action),
			toggleGrid: () => {
				this.#grid = !this.#grid;
				this.render(host.controller.state);
			},
			toggleConnectionPoints: () => {
				this.#points.toggle();
				this.render(host.controller.state);
			},
			connectorRoute: (action) => this.#routes.run(action),
			toggleRuler: () => {
				this.#ruler = !this.#ruler;
				this.render(host.controller.state);
			},
			toggleFullscreen: () => this.#toggleFullscreen(),
			present: () => host.present?.(),
			togglePane: host.togglePane,
			reveal: host.reveal,
			fit: host.fit,
			togglePanZoom: host.togglePanZoom,
			toggleSizePosition: host.toggleSizePosition,
			focusSearch: host.focusSearch,
			focusReplace: () => host.focusReplace?.(),
			pageSetup: (command) => this.#pageSetup.run(command),
			review: (action) => this.#review.run(action),
		};
	}
	/** The page's grid lines while View > Grid is on (Snap to Grid), else 0. */
	get gridStep(): VisioGridSteps | 0 {
		return this.#grid ? this.#pageSetup.rulerGrid.steps() : 0;
	}
	get tool(): CanvasTool {
		return this.#tool;
	}
	/** Browser clipboard transport used by the element's public clipboard methods. */
	clipboard(operation: ClipboardOperation): Promise<void> {
		return this.#clipboard.run(operation);
	}
	/** Run one typed action, exactly as a ribbon control or shortcut would. */
	run(action: VisioRibbonAction): void {
		routeRibbonAction(this.#targets, action);
	}
	wire(): () => void {
		const { root, viewport } = this.host;
		const doc = root.ownerDocument;
		const Abort = doc.defaultView?.AbortController ?? AbortController;
		const events = new Abort();
		const options = { signal: events.signal };
		root.addEventListener(
			RIBBON_ACTION_EVENT,
			(event) => this.run((event as CustomEvent<VisioRibbonAction>).detail),
			options,
		);
		// The shared zoom slider's fit button is the status bar's Fit page to current window.
		root.addEventListener(
			'office-command',
			(event) => {
				if ((event as CustomEvent<{ command?: unknown }>).detail?.command === 'reorder-pages')
					this.#pageOrder.show();
				if ((event as CustomEvent<{ command?: unknown }>).detail?.command === 'rename-page')
					this.#pageRename.show();
				if ((event as CustomEvent<{ command?: unknown }>).detail?.command === 'delete-page')
					this.#pageDelete.show();
				if (
					(event as CustomEvent<{ command?: unknown }>).detail?.command === 'tab-add' &&
					(event.target as Element)?.matches?.('.page-tabs')
				)
					this.#insertPage();
				if ((event as CustomEvent<{ command?: unknown }>).detail?.command === 'layout-dialog')
					this.run({ type: 'layout-options' });
				if ((event as CustomEvent<{ command?: unknown }>).detail?.command === 'zoom-fit')
					this.run({ type: 'zoom', mode: 'fit' });
				const launcher = (event as CustomEvent<{ command?: unknown }>).detail?.command;
				if (launcher === 'font-dialog' || launcher === 'paragraph-dialog')
					this.run({
						type: 'text-feature',
						feature: launcher === 'font-dialog' ? 'text-dialog' : 'paragraph-dialog',
					});
			},
			options,
		);
		// First, so its handles take the pointer before shape and marquee gestures.
		const disposeTextFeatures = this.#textFeatures.wire();
		root.addEventListener('keydown', (event) => this.#shortcut(event as KeyboardEvent), options);
		viewport.addEventListener(
			'wheel',
			(event) => {
				if (!event.ctrlKey && !event.metaKey) return;
				event.preventDefault();
				const zoom = this.host.controller.state.zoom;
				this.host.controller.setZoom(event.deltaY < 0 ? zoom * 1.1 : zoom / 1.1);
			},
			{ ...options, passive: false },
		);
		// Like Visio's drawing window, a canvas click takes keyboard focus so shortcuts apply.
		viewport.addEventListener(
			'pointerdown',
			() => {
				if (!viewport.contains(root.activeElement)) viewport.focus({ preventScroll: true });
			},
			options,
		);
		viewport.addEventListener(
			'dblclick',
			(event) => {
				if (this.#tool !== 'pointer') return;
				if ((event.target as Element)?.closest?.('[data-shape-id]'))
					this.run({ type: 'reveal', panel: 'edit', focusText: true });
			},
			options,
		);
		doc.addEventListener(
			'fullscreenchange',
			() => this.render(this.host.controller.state),
			options,
		);
		const disposeConnector = this.#connector.wire();
		const disposePoints = this.#points.wire();
		const disposeDraw = this.#draw.wire();
		const disposeText = this.#text.wire();
		const disposeClipboard = this.#clipboard.wire();
		const disposePainter = this.#painter.wire();
		const disposeInsert = this.#insert.wire(viewport);
		const disposePageSetup = this.#pageSetup.wire();
		const disposeColors = this.#colors.wire();
		const disposeFormatPane = this.#formatPane.wire();
		const disposeReview = this.#review.wire();
		const disposeData = this.#data.wire(viewport);
		const disposeLayout = this.layoutCommands.wire();
		return () => {
			disposePageSetup();
			this.#pageOrder.close();
			this.#pageRename.close();
			this.#pageDelete.close();
			++this.#pending;
			events.abort();
			disposeDraw();
			disposeConnector();
			disposePoints();
			disposeText();
			disposeClipboard();
			disposePainter();
			disposeInsert();
			disposeColors();
			disposeFormatPane();
			disposeReview();
			disposeData();
			disposeLayout();
			this.layoutCommands.close();
			disposeTextFeatures();
		};
	}
	setTool(tool: CanvasTool): void {
		if (tool !== 'pointer' && !this.#canEdit(this.host.controller.state)) return;
		if (tool !== this.#tool) {
			this.#draw.cancel();
			this.#connector.cancel();
			this.#text.cancel();
		}
		this.#tool = tool;
		this.render(this.host.controller.state);
		this.host.toolChanged?.();
	}
	#canEdit(state: ViewerState): boolean {
		return state.edit.sourceAvailable && !state.loading && !state.edit.busy;
	}
	#history(key: 'undo' | 'redo'): void {
		const { controller } = this.host;
		const { edit, loading } = controller.state;
		const available = key === 'undo' ? edit.canUndo : edit.canRedo;
		if (available && !edit.busy && !loading) void this.#edit(() => controller[key]());
	}
	#delete(): void {
		const state = this.host.controller.state;
		if (this.#tool === 'connection-point' && this.#points.deleteSelected()) return;
		const shapes = state.selectedShapes;
		const page = state.document?.pages[state.pageIndex];
		const pageId = page?.id;
		if (
			!shapes.length ||
			pageId === undefined ||
			!this.#canEdit(state) ||
			shapes.some((shape) => shape.pageId && shape.pageId !== pageId)
		)
			return;
		void this.#edit(
			() =>
				this.host.controller.applyEdits(
					// A callout takes its own leader connector with it.
					visioWithCalloutLeaders(
						page!,
						shapes.map((shape) => shape.id),
					).map((shapeId) => ({ type: 'delete-shape', pageId, shapeId })),
				),
			shapes.length === 1
				? `Deleted ${shapes[0]!.name || `shape ${shapes[0]!.id}`}.`
				: `Deleted ${shapes.length} shapes.`,
		);
	}
	#insertPage(): void {
		const state = this.host.controller.state;
		const page = state.document?.pages[state.pageIndex];
		if (!page || !state.document || !this.#canEdit(state)) return;
		const sourceGeneration = this.host.controller.sourceGeneration;
		const documentGeneration = this.host.controller.documentGeneration;
		void this.#edit(async () => {
			const command = visioPageInsertCommand(state.document!, page.id);
			const current = this.host.controller.state;
			if (
				current.document !== state.document ||
				current.pageIndex !== state.pageIndex ||
				current.selectedShapes !== state.selectedShapes
			)
				return;
			await this.host.controller.applyEdits([command]);
			const after = this.host.controller.state;
			if (
				this.host.controller.sourceGeneration !== sourceGeneration ||
				this.host.controller.documentGeneration !== documentGeneration + 1 ||
				after.pageIndex !== state.pageIndex ||
				after.selectedShapes !== state.selectedShapes
			)
				return;
			const index = this.host.controller.state.document!.pages.findIndex(
				(page) => page.id === command.pageId,
			);
			if (index >= 0) this.host.controller.setPage(index);
		}, 'Inserted a blank page.');
	}
	#transform(action: Extract<VisioRibbonAction, { type: 'rotate' | 'flip' }>): void {
		const state = this.host.controller.state;
		const page = state.document?.pages[state.pageIndex];
		if (
			!page ||
			!state.selectedShape ||
			!visioSelectionIsOnPage(state.selectedShape, page.id) ||
			state.selectedShapes.length !== 1 ||
			!this.#canEdit(state)
		)
			return;
		const command =
			action.type === 'rotate'
				? visioQuarterTurnCommand(page, state.selectedShape.id, action.direction)
				: visioRotationShape(page, state.selectedShape.id, false)
					? {
							type: 'flip-shape' as const,
							pageId: page.id,
							shapeId: state.selectedShape.id,
							axis: action.axis,
						}
					: undefined;
		if (command)
			void this.#edit(
				() => this.host.controller.applyEdits([command]),
				action.type === 'rotate' ? `Rotated ${action.direction} 90°.` : `Flipped ${action.axis}.`,
			);
	}
	async #edit(action: () => Promise<void>, success?: string): Promise<void> {
		const request = ++this.#pending;
		const { root, viewport } = this.host;
		const canvasFocused = viewport.contains(root.activeElement);
		const generation = this.host.controller.documentGeneration;
		try {
			await action();
			// A re-rendered page drops the focused shape; keep shortcuts on the drawing window.
			if (canvasFocused && !viewport.contains(root.activeElement))
				viewport.focus({ preventScroll: true });
			if (success && request === this.#pending)
				this.host.announce(
					this.host.controller.documentGeneration === generation
						? 'No changes were made.'
						: success,
				);
		} catch (error) {
			// The controller records refused edits in state.edit.error for the status bar.
			if (
				request === this.#pending &&
				!isEditCancellation(error) &&
				!this.host.controller.state.edit.error
			)
				this.host.announce(editErrorMessage(error));
		}
	}
	#toggleFullscreen(): void {
		if (this.host.presenting?.()) return;
		const host = this.host.root.host as HTMLElement;
		const doc = this.host.root.ownerDocument;
		const request =
			doc.fullscreenElement === host ? doc.exitFullscreen?.() : host.requestFullscreen?.();
		request?.catch?.(() =>
			this.host.announce('Full screen is not available in this browser frame.'),
		);
	}
	/** Visio shortcuts as typed actions. Text fields keep native undo, deletion and editing keys. */
	#shortcutAction(event: KeyboardEvent): VisioRibbonAction | undefined {
		const state = this.host.controller.state;
		const control = event.ctrlKey || event.metaKey;
		const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
		if (control && key === 'f') return { type: 'search' };
		if (control && !event.shiftKey && key === 'h') return { type: 'replace' };
		if (control && event.shiftKey && key === 'w') return { type: 'zoom', mode: 'fit' };
		if (control && (key === 'PageDown' || key === 'PageUp'))
			return { type: 'page', step: key === 'PageDown' ? 1 : -1 };
		if (key === 'F5' && !control) return { type: 'presentation' };
		if (key === 'F1' && !control) return { type: 'help', topic: 'help' };
		const drawing = this.#draw.drawing || this.#connector.drawing;
		if (key === 'Escape' && (drawing || this.#text.drafting)) return { type: 'cancel-drawing' };
		if (event.composedPath().some(editable)) return undefined;
		if (key === 'Escape' && this.#painter.armed) return { type: 'format-painter', mode: 'cancel' };
		if (control && !event.shiftKey && ['c', 'x', 'v'].includes(key)) {
			const operation = key === 'c' ? 'copy' : key === 'x' ? 'cut' : 'paste';
			if (this.#clipboard.canUseAsync(operation)) return { type: 'clipboard', operation };
		}
		if (control && !event.shiftKey && key === 'a') return { type: 'selection', mode: 'all' };
		if (control && !event.shiftKey && key === 'd') return { type: 'duplicate' };
		if (control && !event.shiftKey && key === 'k') return { type: 'insert', item: 'link' };
		if (control && event.shiftKey && (key === 'g' || key === 'u'))
			return { type: 'grouping', operation: key === 'g' ? 'group' : 'ungroup' };
		if (control && !event.shiftKey && key === 'b') return { type: 'text-toggle', property: 'bold' };
		if (control && !event.shiftKey && key === 'i')
			return { type: 'text-toggle', property: 'italic' };
		if (control && !event.shiftKey && key === 'u')
			return { type: 'text-toggle', property: 'underline' };
		if (control && !event.shiftKey && key === 'z') return { type: 'history', key: 'undo' };
		if (control && (key === 'y' || (event.shiftKey && key === 'z')))
			return { type: 'history', key: 'redo' };
		if (control && event.shiftKey && (event.code === 'Digit1' || key === '1' || key === '!'))
			return { type: 'tool', tool: 'connection-point' };
		if (control && event.shiftKey && event.code === 'Digit4')
			return { type: 'text-feature', feature: 'text-block' };
		if (!control && key === 'F7') return { type: 'text-feature', feature: 'spelling' };
		if (control && key === '1') return { type: 'tool', tool: 'pointer' };
		if (control && key === '2') return { type: 'tool', tool: 'text' };
		if (control && key === '3') return { type: 'tool', tool: 'connector' };
		if (control && key === '8') return { type: 'tool', tool: 'rectangle' };
		if (control && key === '9') return { type: 'tool', tool: 'ellipse' };
		if (control && key === '6') return { type: 'tool', tool: 'line' };
		if (control && key === '5') return { type: 'tool', tool: 'freeform' };
		if (control && key === '7') return { type: 'tool', tool: 'arc' };
		if (control && key === '4') return { type: 'tool', tool: 'pencil' };
		if (!control && key === 'Delete' && (state.selectedShape || this.#points.selected))
			return { type: 'delete' };
		if (!control && key === 'F2' && state.document)
			return { type: 'reveal', panel: 'edit', focusText: true };
		if (key === 'Escape' && this.#tool !== 'pointer' && !drawing)
			return { type: 'tool', tool: 'pointer' };
		if (key === 'Escape' && state.selectedShapes.length && !drawing)
			return { type: 'selection', mode: 'clear' };
		return undefined;
	}
	#shortcut(event: KeyboardEvent): void {
		if (event.defaultPrevented || event.isComposing || event.altKey) return;
		const action = this.#shortcutAction(event);
		if (!action) return;
		event.preventDefault();
		this.run(action);
	}
	render(state: ViewerState): void {
		this.#draw.render(state);
		this.#connector.render(state);
		this.#points.render(state);
		this.#routes.render(state);
		this.#text.render(state);
		this.#duplication.render(state);
		this.#grouping.render(state);
		this.#clipboard.render(state);
		this.#formatting.render(state);
		this.#changeShape.render(state);
		this.#parts.render(state);
		this.#painter.render(state);
		this.#insert.render(state);
		this.#themes.render(state);
		this.#colors.render(state);
		this.#formatPane.render(state);
		this.#review.render(state);
		this.#data.render(state);
		this.#textFeatures.render(state, this.#tool === 'pointer');
		this.#pageOrder.render(state);
		this.#pageRename.render(state);
		this.#pageDelete.render(state);
		this.#pageSetup.render(state);
		const { root, viewport } = this.host;
		const button = (name: string) => root.querySelector<RibbonCommand>(`[command="${name}"]`)!;
		const box = (name: string) =>
			root.querySelector<RibbonCommand & { checked: boolean }>(`[data-check="${name}"]`)!;
		const editing = this.#canEdit(state);
		if (this.#tool !== 'pointer' && !state.edit.sourceAvailable) this.#tool = 'pointer';
		const page = state.document?.pages[state.pageIndex];
		const rotating =
			editing &&
			!!page &&
			!!state.selectedShape &&
			visioSelectionIsOnPage(state.selectedShape, page.id) &&
			state.selectedShapes.length === 1 &&
			!!visioRotationShape(page, state.selectedShape.id);
		for (const name of ['rotate-left', 'rotate-right']) button(name).disabled = !rotating;
		const flipping =
			rotating &&
			!!page &&
			!!state.selectedShape &&
			!!visioRotationShape(page, state.selectedShape.id, false);
		for (const name of ['flip-horizontal', 'flip-vertical']) button(name).disabled = !flipping;
		root.querySelector<RibbonCommand>('[data-menu="rotate"]')!.disabled = !rotating;
		const distributing = this.#arrangement.render(state);
		this.layoutCommands.render(state);
		root.querySelector<RibbonCommand>('[data-menu="position"]')!.disabled =
			!rotating && !distributing && !this.layoutCommands.layout.available(state);
		button('select-all').disabled = !page || state.loading;
		button('clear-selection').disabled = !state.selectedShapes.length;
		button('pointer').setAttribute('pressed', String(this.#tool === 'pointer'));
		button('connector').setAttribute('pressed', String(this.#tool === 'connector'));
		button('connector').disabled = !editing || !page;
		button('connection-point').setAttribute('pressed', String(this.#tool === 'connection-point'));
		button('connection-point').disabled = !editing || !page;
		box('connection-points').checked = this.#points.visible;
		box('connection-points').disabled = !page;
		// The drawing-tools split button shows the active tool; its active drawing item is checked.
		const rectangle = button('rectangle');
		rectangle.toggleAttribute('data-active', this.#tool === 'rectangle');
		rectangle.disabled = !editing || !page;
		button('rectangle-item').setAttribute('checked', String(this.#tool === 'rectangle'));
		button('rectangle-item').disabled = !editing || !page;
		button('line-tool').setAttribute('checked', String(this.#tool === 'line'));
		button('ellipse').setAttribute('checked', String(this.#tool === 'ellipse'));
		button('ellipse').disabled = !editing || !page;
		button('line-tool').disabled = !editing || !page;
		for (const name of ['freeform', 'arc', 'pencil'] as const) {
			button(name).setAttribute('checked', String(this.#tool === name));
			button(name).disabled = !editing || !page;
		}
		button('text-tool').setAttribute('pressed', String(this.#tool === 'text'));
		for (const name of ['text-tool', 'text-box', 'blank-page'])
			button(name).disabled = !editing || !page;
		button('replace').disabled = !editing || !page;
		button('replace').title = editing
			? 'Replace literal, case-sensitive text occurrences (Ctrl+H).'
			: 'Open a .vsdx file to replace text.';
		for (const name of ['text-tool', 'text-box'])
			button(name).title = editing
				? 'Drag a fixed-size text box, or click a shape to edit plain text.'
				: 'Open a .vsdx file to add text boxes.';
		rectangle.title = state.edit.sourceAvailable
			? 'Rectangle (Ctrl+8)'
			: 'Rectangle (Ctrl+8): open a .vsdx file to draw.';
		box('grid').checked = this.#grid;
		box('grid').disabled = !page;
		box('ruler').checked = this.#ruler;
		box('ruler').disabled = !page;
		for (const name of ['zoom-fit', 'page-width']) button(name).disabled = !page;
		root.querySelector<RibbonCommand>('[data-menu="zoom"]')!.disabled = !page;
		const fullscreen = button('fullscreen');
		const host = root.host as HTMLElement;
		fullscreen.disabled = typeof host.requestFullscreen !== 'function';
		fullscreen.setAttribute(
			'pressed',
			String(root.ownerDocument.fullscreenElement === host && !this.host.presenting?.()),
		);
		viewport.dataset.tool = this.#tool;
		viewport.dataset.grid = String(this.#grid);
		this.host.rulers.render(
			this.#ruler && !!page,
			state.zoom,
			this.#pageSetup.rulerGrid.look(state),
		);
	}
}
