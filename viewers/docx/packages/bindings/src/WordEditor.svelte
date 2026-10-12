<script lang="ts">
  import { eventOptions, mountEditor, pickEditorProps, type EditorBinding, type EditorEventHandlers, type EditorHandle, type EditorProps } from './index';
  type Props = EditorProps & {
    ondocumentchange?: EditorEventHandlers['document-change'];
    ondocumenterror?: EditorEventHandlers['document-error'];
    onpagechange?: EditorEventHandlers['page-change'];
    ondirtychange?: EditorEventHandlers['dirty-change'];
    onribbonaddin?: EditorEventHandlers['office-ribbon-add-in'];
  };
  let { documentModel, readOnly = false, locale = 'en', theme = 'auto', showThumbnails = false, showToolbar = true, hiddenActions = [], ribbonAddIns, ondocumentchange, ondocumenterror, onpagechange, ondirtychange, onribbonaddin }: Props = $props();
  let binding: EditorBinding | undefined;
  // Live `element` and `dirty`, the same handle vocabulary as the other frameworks (`EDITOR_HANDLE_KEYS`).
  let mountedElement = $state.raw<EditorHandle['element'] | undefined>();
  let dirtyState = $state(false);
  const element = $derived(mountedElement);
  const dirty = $derived(dirtyState);
  function attach(host: HTMLElement, options: Props) {
    const normalized = (value: Props) => ({ ...pickEditorProps(value),
      ...eventOptions({ 'document-change': value.ondocumentchange, 'document-error': value.ondocumenterror, 'page-change': value.onpagechange, 'dirty-change': value.ondirtychange, 'office-ribbon-add-in': value.onribbonaddin }) });
    const handlers = (value: Props) => normalized({ ...value, ondirtychange: (next: boolean) => { dirtyState = next; value.ondirtychange?.(next); } });
    binding = mountEditor(host, handlers(options));
    mountedElement = binding.element;
    dirtyState = binding.dirty;
    return { update(next: Props) { binding?.update(handlers(next)); }, destroy() { binding?.destroy(); binding = undefined; mountedElement = undefined; dirtyState = false; } };
  }
  export async function load(input: Uint8Array | ArrayBuffer) { if (!binding) throw new Error('Editor is not mounted'); await binding.load(input); }
  export async function save() { if (!binding) throw new Error('Editor is not mounted'); return binding.save(); }
  export async function download(fileName?: string) { if (!binding) throw new Error('Editor is not mounted'); await binding.download(fileName); }
  export function markClean() { binding?.markClean(); dirtyState = binding?.dirty ?? false; }
  /** @deprecated Read the dirty property instead; kept so existing callers keep working. */
  export function isDirty() { return binding?.dirty ?? false; }
  export { element, dirty };
</script>
<div use:attach={{ documentModel, readOnly, locale, theme, showThumbnails, showToolbar, hiddenActions, ribbonAddIns, ondocumentchange, ondocumenterror, onpagechange, ondirtychange, onribbonaddin }}></div>
