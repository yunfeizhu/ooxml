import { createEffect, createSignal, onCleanup, onMount } from 'solid-js';
import type { EditorBinding, EditorHandle, EditorOptions } from './index';
import { deferredHandle, eventOptions, mountEditor, pickEditorProps } from './index';

export interface SpreadsheetEditorProps extends EditorOptions {
	class?: string;
	editorRef?: (handle: EditorHandle) => void;
}

/** Solid lifecycle adapter over the shared editor binding. */
export function SpreadsheetEditor(props: SpreadsheetEditorProps) {
	const host = document.createElement('div');
	const [binding, setBinding] = createSignal<EditorBinding>();
	const options = (): EditorOptions => ({
		...pickEditorProps(props),
		...eventOptions({
			'workbook-change': props.onWorkbookChange,
			'workbook-error': props.onWorkbookError,
			'selection-change': props.onSelectionChange,
			'dirty-change': props.onDirtyChange,
			'readonly-change': props.onReadOnlyChange,
			'ribbon-customize': props.onRibbonCustomize,
			'office-ribbon-add-in': props.onRibbonAddIn,
			'collaboration-change': props.onCollaborationChange,
			ready: props.onReady,
		}),
	});
	onMount(() => {
		const mounted = mountEditor(host, options());
		setBinding(mounted);
		props.editorRef?.(deferredHandle(() => mounted));
	});
	createEffect(() => {
		const current = binding();
		if (!current) return;
		host.className = props.class ?? '';
		current.update(options());
	});
	onCleanup(() => binding()?.destroy());
	return host;
}
