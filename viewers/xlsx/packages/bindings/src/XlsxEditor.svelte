<script lang="ts">
  import { deferredHandle, eventOptions, mountEditor, pickEditorProps, type EditorBinding, type EditorEventHandlers, type EditorProps, type EditorHandle } from './index';
  type Props = EditorProps & {
    onworkbookchange?: EditorEventHandlers['workbook-change'];
    onworkbookerror?: EditorEventHandlers['workbook-error'];
    onselectionchange?: EditorEventHandlers['selection-change'];
    ondirtychange?: EditorEventHandlers['dirty-change'];
    onreadonlychange?: EditorEventHandlers['readonly-change'];
    onribboncustomize?: EditorEventHandlers['ribbon-customize'];
    onribbonaddin?: EditorEventHandlers['office-ribbon-add-in'];
    oncollaborationchange?: EditorEventHandlers['collaboration-change'];
    onready?: EditorEventHandlers['ready'];
  };
  let { workbook, bytes, src, fileName, readOnly = false, locale = 'en', theme = 'auto', authorName = 'Author', showToolbar = true, showFormulaBar = true, hiddenActions = [], ribbonAddIns, themeColors, collaboration, onworkbookchange, onworkbookerror, onselectionchange, ondirtychange, onreadonlychange, onribboncustomize, onribbonaddin, oncollaborationchange, onready }: Props = $props();
  let binding: EditorBinding | undefined;
  const handle = deferredHandle(() => binding);
  // Live `element` and `dirty`, the same handle vocabulary as the other frameworks (`EDITOR_HANDLE_KEYS`).
  let mountedElement = $state.raw<EditorHandle['element'] | undefined>();
  let dirtyState = $state(false);
  const element = $derived(mountedElement);
  const dirty = $derived(dirtyState);
  function attach(host: HTMLElement, options: Props) {
    const normalized = (value: Props) => ({ ...pickEditorProps(value),
      ...eventOptions({ 'workbook-change': value.onworkbookchange, 'workbook-error': value.onworkbookerror, 'selection-change': value.onselectionchange, 'dirty-change': value.ondirtychange, 'readonly-change': value.onreadonlychange, 'ribbon-customize': value.onribboncustomize, 'office-ribbon-add-in': value.onribbonaddin, 'collaboration-change': value.oncollaborationchange, ready: value.onready }) });
    const tracked = (value: Props) => normalized({ ...value, ondirtychange: (next: boolean) => { dirtyState = next; value.ondirtychange?.(next); } });
    binding = mountEditor(host, tracked(options));
    mountedElement = binding.element;
    dirtyState = binding.dirty;
    return { update(next: Props) { binding?.update(tracked(next)); }, destroy() { binding?.destroy(); binding = undefined; mountedElement = undefined; dirtyState = false; } };
  }
  export function load(input: Uint8Array | ArrayBuffer, name?: string) { return handle.load(input, name); }
  export function newWorkbook() { handle.newWorkbook(); }
  export function save() { return handle.save(); }
  export function saveBytes(format?: 'xlsx' | 'csv') { return handle.saveBytes(format); }
  export function download(name?: string) { return handle.download(name); }
  export function markClean() { handle.markClean(); dirtyState = handle.dirty; }
  export function select(ref: string) { handle.select(ref); }
  export function getSelection() { return handle.getSelection(); }
  export function setActiveSheet(index: number) { handle.setActiveSheet(index); }
  export function share() { handle.share(); }
  /** @deprecated Read the dirty property instead. */
  export function isDirty() { return handle.dirty; }
  /** @deprecated Read the element property instead. */
  export function getElement() { return binding?.element; }
  export { element, dirty };
</script>
<div use:attach={{ workbook, bytes, src, fileName, readOnly, locale, theme, authorName, showToolbar, showFormulaBar, hiddenActions, ribbonAddIns, themeColors, collaboration, onworkbookchange, onworkbookerror, onselectionchange, ondirtychange, onreadonlychange, onribboncustomize, onribbonaddin, oncollaborationchange, onready }}></div>
