import type { VisioEdit, CreateVsdxOptions } from 'ooxml-core/visio';
import type {
	ViewerOptions,
	ViewerCallbacks,
	VsdxSource,
	VisioShapeSelection,
} from 'ooxml-core/visio/ui';
import { eventKeys, propertyKeys } from 'ooxml-core/visio/ui';
import { registerVisioViewer, type VisioViewerElement } from './viewer-element';
import type { ViewerController } from './controller';
import type { SvgExportOptions, SvgExportResult } from './export-svg';
import type { CurrentPagePrintSnapshotOptions, PrintSnapshot } from './print-snapshot';
import type { VsdxExportResult } from 'ooxml-core/visio/ui';

export interface MountedViewer {
	readonly element: VisioViewerElement;
	readonly controller: ViewerController;
	update(options: ViewerOptions): void;
	load(source: VsdxSource): Promise<void>;
	createBlankDrawing(options?: CreateVsdxOptions): Promise<void>;
	applyEdits(edits: readonly VisioEdit[]): Promise<void>;
	selectShapes(shapes: readonly VisioShapeSelection[]): void;
	selectAll(): void;
	clearSelection(): void;
	duplicateSelection(): Promise<void>;
	copySelection(): Promise<void>;
	cutSelection(): Promise<void>;
	pasteSelection(): Promise<void>;
	replacePlainText(pageId: string, shapeId: string, text: string): Promise<void>;
	undo(): Promise<void>;
	redo(): Promise<void>;
	cancelEdit(): void;
	exportVsdx(): VsdxExportResult;
	fit(): void;
	setLayerVisibility(pageId: string, layerId: string, visible: boolean | null): void;
	resetLayerVisibility(pageId?: string): void;
	exportSvg(options?: SvgExportOptions): SvgExportResult;
	createPrintSnapshot(options?: CurrentPagePrintSnapshotOptions): PrintSnapshot;
	destroy(): void;
}
/** One client-only lifecycle adapter; framework wrappers forward to this implementation. */
export function mountViewer(container: HTMLElement, initial: ViewerOptions = {}): MountedViewer {
	registerVisioViewer();
	const element = document.createElement('visio-viewer');
	let destroyed = false;
	let updateRevision = 0;
	let callbacks: ViewerCallbacks = {};
	const listeners = eventKeys.map((name) => {
		const listener = (event: Event): void => {
			const callback = callbacks[name] as ((detail: unknown) => void) | undefined;
			callback?.((event as CustomEvent).detail);
		};
		element.addEventListener(name, listener);
		return { name, listener };
	});
	function assertAlive(): void {
		if (destroyed) throw new Error('The viewer has been destroyed.');
	}
	function update(options: ViewerOptions): void {
		assertAlive();
		const revision = ++updateRevision;
		if ('events' in options) callbacks = options.events ?? {};
		// Partial updates leave omitted properties alone. Set all initial props before connecting.
		for (const key of propertyKeys) {
			// A callback may synchronously replace this patch with a newer update.
			if (destroyed || revision !== updateRevision) break;
			if (!(key in options)) continue;
			if (key === 'document' && options.document !== undefined) {
				if (element.document !== options.document) element.document = options.document;
			} else if (key === 'pageIndex' && options.pageIndex !== undefined)
				element.pageIndex = options.pageIndex;
			else if (key === 'zoom' && options.zoom !== undefined) element.zoom = options.zoom;
			else if (key === 'showToolbar' && options.showToolbar !== undefined)
				element.showToolbar = options.showToolbar;
			else if (key === 'ribbonAddIns' && options.ribbonAddIns !== undefined)
				element.ribbonAddIns = options.ribbonAddIns;
		}
	}
	update(initial);
	container.append(element);
	return {
		element,
		controller: element.controller,
		update,
		async load(source) {
			assertAlive();
			await element.load(source);
		},
		async createBlankDrawing(options) {
			assertAlive();
			await element.createBlankDrawing(options);
		},
		async applyEdits(edits) {
			assertAlive();
			await element.applyEdits(edits);
		},
		selectShapes(shapes) {
			assertAlive();
			element.selectShapes(shapes);
		},
		selectAll() {
			assertAlive();
			element.selectAll();
		},
		clearSelection() {
			assertAlive();
			element.clearSelection();
		},
		async replacePlainText(pageId, shapeId, text) {
			assertAlive();
			await element.replacePlainText(pageId, shapeId, text);
		},
		async duplicateSelection() {
			assertAlive();
			await element.duplicateSelection();
		},
		async copySelection() {
			assertAlive();
			await element.copySelection();
		},
		async cutSelection() {
			assertAlive();
			await element.cutSelection();
		},
		async pasteSelection() {
			assertAlive();
			await element.pasteSelection();
		},
		async undo() {
			assertAlive();
			await element.undo();
		},
		async redo() {
			assertAlive();
			await element.redo();
		},
		cancelEdit() {
			assertAlive();
			element.cancelEdit();
		},
		exportVsdx() {
			assertAlive();
			return element.exportVsdx();
		},
		fit() {
			assertAlive();
			element.fit();
		},
		setLayerVisibility(pageId, layerId, visible) {
			assertAlive();
			element.setLayerVisibility(pageId, layerId, visible);
		},
		resetLayerVisibility(pageId) {
			assertAlive();
			element.resetLayerVisibility(pageId);
		},
		exportSvg(options) {
			assertAlive();
			return element.exportSvg(options);
		},
		createPrintSnapshot(options) {
			assertAlive();
			return element.createPrintSnapshot(options);
		},
		destroy() {
			if (destroyed) return;
			destroyed = true;
			callbacks = {};
			for (const { name, listener } of listeners) element.removeEventListener(name, listener);
			element.destroy();
			element.remove();
		},
	};
}
