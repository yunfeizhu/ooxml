import {
	Component,
	ElementRef,
	EventEmitter,
	Input,
	Output,
	inject,
	type AfterViewInit,
	type OnChanges,
	type OnDestroy,
} from '@angular/core';
import type { Workbook } from '@christophervr/xlsx-core';
import type {
	EditorThemeMode,
	RibbonAddInCommandDetail,
	RibbonAddInTab,
	SelectionChangeDetail,
	XlsxCollaborationOptions,
	XlsxCollaborationState,
	XlsxEditorElement,
	XlsxThemeColors,
} from 'xlsx-web-component';
import {
	deferredHandle,
	eventOptions,
	mountEditor,
	pickEditorProps,
	type EditorBinding,
	type EditorHandle,
} from './index';
@Component({ selector: 'spreadsheet-editor', standalone: true, template: '' })
export class SpreadsheetEditorComponent implements AfterViewInit, OnChanges, OnDestroy {
	@Input() workbook?: Workbook;
	@Input() bytes?: Uint8Array | ArrayBuffer;
	@Input() src?: string;
	@Input() fileName?: string;
	@Input() readOnly = false;
	@Input() locale = 'en';
	@Input() theme: EditorThemeMode = 'auto';
	@Input() authorName = 'Author';
	@Input() showToolbar = true;
	@Input() showFormulaBar = true;
	@Input() hiddenActions: readonly string[] = [];
	@Input() ribbonAddIns?: readonly RibbonAddInTab[];
	@Input() themeColors?: XlsxThemeColors;
	@Input() collaboration?: XlsxCollaborationOptions | null;
	@Output() workbookChange = new EventEmitter<Workbook>();
	@Output() workbookError = new EventEmitter<Error>();
	@Output() selectionChange = new EventEmitter<SelectionChangeDetail>();
	@Output() dirtyChange = new EventEmitter<boolean>();
	/** Pairs with `readOnly` for `[(readOnly)]` two-way binding. */
	@Output() readOnlyChange = new EventEmitter<boolean>();
	@Output() ribbonCustomize = new EventEmitter<string[]>();
	@Output() ribbonAddIn = new EventEmitter<RibbonAddInCommandDetail>();
	@Output() collaborationChange = new EventEmitter<XlsxCollaborationState>();
	@Output() ready = new EventEmitter<XlsxEditorElement>();
	private host = inject<ElementRef<HTMLElement>>(ElementRef);
	private binding?: EditorBinding;
	private handle: EditorHandle = deferredHandle(() => this.binding);
	private options() {
		return {
			...pickEditorProps(this),
			...eventOptions({
				'workbook-change': (workbook) => this.workbookChange.emit(workbook),
				'workbook-error': (error) => this.workbookError.emit(error),
				'selection-change': (detail) => this.selectionChange.emit(detail),
				'dirty-change': (dirty) => this.dirtyChange.emit(dirty),
				'readonly-change': (readOnly) => this.readOnlyChange.emit(readOnly),
				'ribbon-customize': (hiddenActions) => this.ribbonCustomize.emit(hiddenActions),
				'office-ribbon-add-in': (detail) => this.ribbonAddIn.emit(detail),
				'collaboration-change': (state) => this.collaborationChange.emit(state),
				ready: (element) => this.ready.emit(element),
			}),
		};
	}
	ngAfterViewInit() {
		this.binding = mountEditor(this.host.nativeElement, this.options());
	}
	ngOnChanges() {
		this.binding?.update(this.options());
	}
	ngOnDestroy() {
		this.binding?.destroy();
	}
	get element() {
		return this.binding?.element;
	}
	load(input: Uint8Array | ArrayBuffer, fileName?: string) {
		return this.handle.load(input, fileName);
	}
	newWorkbook() {
		this.handle.newWorkbook();
	}
	save() {
		return this.handle.save();
	}
	saveBytes(format?: 'xlsx' | 'csv') {
		return this.handle.saveBytes(format);
	}
	download(fileName?: string) {
		return this.handle.download(fileName);
	}
	markClean() {
		this.handle.markClean();
	}
	select(ref: string) {
		this.handle.select(ref);
	}
	getSelection() {
		return this.handle.getSelection();
	}
	setActiveSheet(index: number) {
		this.handle.setActiveSheet(index);
	}
	share() {
		this.handle.share();
	}
	get dirty() {
		return this.handle.dirty;
	}
}
