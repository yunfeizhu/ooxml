<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import VisioViewer from '../../../viewers/visio/packages/bindings/src/VisioViewer.svelte';
  import type { Workspace } from '../demo/workspace';

  // The Svelte demo: the VisioViewer component and its handle.
  let { workspace }: { workspace: Workspace } = $props();
  // The workspace is fixed for the page's lifetime, and so is the placeholder it mounts with.
  const document = untrack(() => workspace.initialDocument);
  let viewer: ReturnType<typeof VisioViewer> | undefined = $state();
  onMount(() => {
    if (viewer) workspace.attach(viewer.getHandle());
  });
</script>

<VisioViewer bind:this={viewer} {document} events={workspace.events} aria-label="Visio diagram" />
