import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch, type PropType } from 'vue';
import type { Workbook } from '@christophervr/xlsx-core';
import type {
	EditorThemeMode,
	RibbonAddInCommandDetail,
	RibbonAddInTab,
	XlsxCollaborationOptions,
	XlsxCollaborationState,
	XlsxEditorElement,
	XlsxThemeColors,
} from 'xlsx-web-component';
import {
	EDITOR_EVENT_NAMES,
	EDITOR_PROP_KEYS,
	deferredHandle,
	eventOptions,
	mountEditor,
	pickEditorProps,
	type EditorBinding,
	type EditorPropKey,
} from './index';
export const SpreadsheetEditor = defineComponent({
	name: 'SpreadsheetEditor',
	props: {
		workbook: Object as PropType<Workbook>,
		bytes: Object as PropType<Uint8Array | ArrayBuffer>,
		src: String,
		fileName: String,
		readOnly: Boolean,
		locale: String,
		theme: String as PropType<EditorThemeMode>,
		authorName: String,
		showToolbar: { type: Boolean, default: true },
		showFormulaBar: { type: Boolean, default: true },
		hiddenActions: Array as PropType<readonly string[]>,
		ribbonAddIns: Array as unknown as PropType<readonly RibbonAddInTab[]>,
		themeColors: Object as PropType<XlsxThemeColors>,
		collaboration: Object as PropType<XlsxCollaborationOptions | null>,
	} satisfies Record<EditorPropKey, unknown>,
	emits: [...EDITOR_EVENT_NAMES, 'ready'],
	setup(props, { emit, expose }) {
		const host = ref<HTMLElement>();
		let binding: EditorBinding | undefined;
		const options = () => ({
			...pickEditorProps(props),
			...eventOptions({
				'workbook-change': (workbook: Workbook) => emit('workbook-change', workbook),
				'workbook-error': (error: Error) => emit('workbook-error', error),
				'selection-change': (detail) => emit('selection-change', detail),
				'dirty-change': (dirty: boolean) => emit('dirty-change', dirty),
				'readonly-change': (readOnly: boolean) => emit('readonly-change', readOnly),
				'ribbon-customize': (hiddenActions: string[]) => emit('ribbon-customize', hiddenActions),
				'office-ribbon-add-in': (detail: RibbonAddInCommandDetail) =>
					emit('office-ribbon-add-in', detail),
				'collaboration-change': (state: XlsxCollaborationState) =>
					emit('collaboration-change', state),
				ready: (element: XlsxEditorElement) => emit('ready', element),
			}),
		});
		onMounted(() => {
			binding = mountEditor(host.value!, options());
		});
		watch(
			() => EDITOR_PROP_KEYS.map((key) => props[key]),
			() => binding?.update(options()),
		);
		onBeforeUnmount(() => binding?.destroy());
		const handle = deferredHandle(() => binding);
		expose({
			get element() {
				return binding?.element;
			},
			load: handle.load,
			newWorkbook: handle.newWorkbook,
			save: handle.save,
			saveBytes: handle.saveBytes,
			download: handle.download,
			markClean: handle.markClean,
			select: handle.select,
			getSelection: handle.getSelection,
			setActiveSheet: handle.setActiveSheet,
			share: handle.share,
			get dirty() {
				return handle.dirty;
			},
		});
		return () => h('div', { ref: host });
	},
});
