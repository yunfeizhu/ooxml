import {
	Component,
	ElementRef,
	EventEmitter,
	Input,
	Output,
	inject,
	signal,
	type AfterViewInit,
	type OnChanges,
	type OnDestroy,
} from '@angular/core';
import {
	mountFrameworkViewer,
	viewerHandle,
	viewerStateSource,
	withEventEmitter,
	type MountedViewer,
	type ViewerCallbacks,
	type ViewerEvents,
	type ViewerProperties,
	type ViewerState,
	type VsdxSource,
	type VisioEdit,
	type CreateVsdxOptions,
	type VisioShapeSelection,
	type SvgExportOptions,
	type CurrentPagePrintSnapshotOptions,
} from './common';
/** Angular input/output and lifecycle wiring over the one shared browser binding. */
@Component({ selector: 'visio-viewer-host', standalone: true, template: '' })
export class VisioViewerComponent implements AfterViewInit, OnChanges, OnDestroy {
	@Input() document?: ViewerProperties['document'];
	@Input() pageIndex?: number;
	@Input() zoom?: number;
	@Input() showToolbar?: boolean;
	@Input() ribbonAddIns?: ViewerProperties['ribbonAddIns'];
	@Input() events?: ViewerCallbacks;
	@Output() documentLoad = new EventEmitter<ViewerEvents['document-load']>();
	@Output() documentChange = new EventEmitter<ViewerEvents['document-change']>();
	@Output() documentError = new EventEmitter<ViewerEvents['document-error']>();
	@Output() pageChange = new EventEmitter<ViewerEvents['page-change']>();
	@Output() zoomChange = new EventEmitter<ViewerEvents['zoom-change']>();
	@Output() shapeSelect = new EventEmitter<ViewerEvents['shape-select']>();
	@Output() selectionChange = new EventEmitter<ViewerEvents['selection-change']>();
	@Output() ribbonAddIn = new EventEmitter<ViewerEvents['office-ribbon-add-in']>();
	private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
	private binding: MountedViewer | undefined;
	private readonly handle = viewerHandle(() => this.binding);
	private stopState = () => {};
	private readonly viewerState = signal<ViewerState | null>(null);
	/** Reactive viewer state as an Angular signal (`viewer.state()?.pageIndex`); `null` until mounted. */
	readonly state = this.viewerState.asReadonly();
	private readonly outputs = {
		'document-load': this.documentLoad,
		'document-change': this.documentChange,
		'document-error': this.documentError,
		'page-change': this.pageChange,
		'zoom-change': this.zoomChange,
		'shape-select': this.shapeSelect,
		'selection-change': this.selectionChange,
		'office-ribbon-add-in': this.ribbonAddIn,
	} satisfies { [K in keyof ViewerEvents]: EventEmitter<ViewerEvents[K]> };
	private options() {
		return withEventEmitter(this, (name, value) => {
			(this.outputs[name] as EventEmitter<unknown>).emit(value);
		});
	}
	ngAfterViewInit() {
		this.binding = mountFrameworkViewer(this.host.nativeElement, this.options());
		const source = viewerStateSource(() => this.handle);
		this.viewerState.set(source.getSnapshot());
		this.stopState = source.subscribe(() => this.viewerState.set(source.getSnapshot()));
	}
	ngOnChanges() {
		this.binding?.update(this.options());
	}
	ngOnDestroy() {
		this.stopState();
		this.stopState = () => {};
		this.viewerState.set(null);
		const mounted = this.binding;
		this.binding = undefined;
		mounted?.destroy();
	}
	get element() {
		return this.handle.element;
	}
	get controller() {
		return this.handle.controller;
	}
	load(source: VsdxSource) {
		return this.handle.load(source);
	}
	createBlankDrawing(options?: CreateVsdxOptions) {
		return this.handle.createBlankDrawing(options);
	}
	applyEdits(edits: readonly VisioEdit[]) {
		return this.handle.applyEdits(edits);
	}
	selectShapes(shapes: readonly VisioShapeSelection[]) {
		this.handle.selectShapes(shapes);
	}
	selectAll() {
		this.handle.selectAll();
	}
	clearSelection() {
		this.handle.clearSelection();
	}
	duplicateSelection() {
		return this.handle.duplicateSelection();
	}
	copySelection() {
		return this.handle.copySelection();
	}
	cutSelection() {
		return this.handle.cutSelection();
	}
	pasteSelection() {
		return this.handle.pasteSelection();
	}
	replacePlainText(pageId: string, shapeId: string, text: string) {
		return this.handle.replacePlainText(pageId, shapeId, text);
	}
	undo() {
		return this.handle.undo();
	}
	redo() {
		return this.handle.redo();
	}
	cancelEdit() {
		this.handle.cancelEdit();
	}
	exportVsdx() {
		return this.handle.exportVsdx();
	}
	fit() {
		this.handle.fit();
	}
	setLayerVisibility(pageId: string, layerId: string, visible: boolean | null) {
		this.handle.setLayerVisibility(pageId, layerId, visible);
	}
	resetLayerVisibility(pageId?: string) {
		this.handle.resetLayerVisibility(pageId);
	}
	exportSvg(options?: SvgExportOptions) {
		return this.handle.exportSvg(options);
	}
	createPrintSnapshot(options?: CurrentPagePrintSnapshotOptions) {
		return this.handle.createPrintSnapshot(options);
	}
}
export type {
	ViewerState,
	ViewerHandle,
	ViewerCallbacks,
	ViewerOptions,
	ViewerEvents,
	VisioShapeSelection,
	CreateVsdxOptions,
	ViewerEditState,
	VsdxExportResult,
	RibbonAddInCommand,
	RibbonAddInGroup,
	RibbonAddInTab,
} from './common';

// A new shared property must also become an actual Angular input on this class.
const completeInputs: Record<
	Exclude<keyof ViewerProperties, keyof VisioViewerComponent>,
	never
> = {};
void completeInputs;
