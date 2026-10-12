<script lang="ts">
  import type { CreateVsdxOptions } from './common';
  import { readonly, writable } from 'svelte/store';
  import { mountFrameworkViewer, viewerHandle, viewerOptions, viewerStateSource, type ViewerState, type MountedViewer, type ViewerProps, type VsdxSource, type VisioEdit, type VisioShapeSelection, type SvgExportOptions, type CurrentPagePrintSnapshotOptions } from './common';
  type Props = ViewerProps & { class?: string; style?: string; 'aria-label'?: string };
  let { document, pageIndex, zoom, showToolbar, ribbonAddIns, events, class: className, style, 'aria-label': ariaLabel }: Props = $props();
  const options = $derived({ document, pageIndex, zoom, showToolbar, ribbonAddIns, events } satisfies Required<ViewerProps>);
  let binding: MountedViewer | undefined;
  const handle = viewerHandle(() => binding);
  // The component owns its state store, so subscribers made before mount still see updates.
  const state = writable<ViewerState | null>(null);
  function attach(host: HTMLElement, props: ViewerProps) {
    const mounted = mountFrameworkViewer(host, viewerOptions(props));
    binding = mounted;
    const source = viewerStateSource(() => mounted);
    state.set(source.getSnapshot());
    const stop = source.subscribe(() => state.set(source.getSnapshot()));
    return {
      update(next: ViewerProps) { mounted.update(viewerOptions(next)); },
      destroy() { stop(); state.set(null); binding = undefined; mounted.destroy(); },
    };
  }
  /** Reactive viewer state as a Svelte store: `const state = viewer.getState()`, then `$state`. */
  export function getState() { return readonly(state); }
  export function getHandle() { return handle; }
  export function load(source: VsdxSource) { return handle.load(source); }
  export function createBlankDrawing(blankOptions?: CreateVsdxOptions) { return handle.createBlankDrawing(blankOptions); }
  export function applyEdits(edits: readonly VisioEdit[]) { return handle.applyEdits(edits); }
  export function selectShapes(shapes: readonly VisioShapeSelection[]) { handle.selectShapes(shapes); }
  export function selectAll() { handle.selectAll(); }
  export function clearSelection() { handle.clearSelection(); }
  export function duplicateSelection() { return handle.duplicateSelection(); }
  export function copySelection() { return handle.copySelection(); }
  export function cutSelection() { return handle.cutSelection(); }
  export function pasteSelection() { return handle.pasteSelection(); }
  export function replacePlainText(pageId: string, shapeId: string, text: string) { return handle.replacePlainText(pageId, shapeId, text); }
  export function undo() { return handle.undo(); }
  export function redo() { return handle.redo(); }
  export function cancelEdit() { handle.cancelEdit(); }
  export function exportVsdx() { return handle.exportVsdx(); }
  export function fit() { handle.fit(); }
  export function setLayerVisibility(pageId: string, layerId: string, visible: boolean | null) { handle.setLayerVisibility(pageId, layerId, visible); }
  export function resetLayerVisibility(pageId?: string) { handle.resetLayerVisibility(pageId); }
  export function exportSvg(svgOptions?: SvgExportOptions) { return handle.exportSvg(svgOptions); }
  export function createPrintSnapshot(printOptions?: CurrentPagePrintSnapshotOptions) { return handle.createPrintSnapshot(printOptions); }
</script>
<div class={className} {style} aria-label={ariaLabel} use:attach={options}></div>
