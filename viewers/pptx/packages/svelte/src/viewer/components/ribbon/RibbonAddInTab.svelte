<script lang="ts">
	/**
	 * RibbonAddInTab: the body of a host's ribbon tab (`ribbonAddIns`). The shared
	 * `pptx-ui-ribbon-add-in` element draws the groups and runs the commands; this only hands it
	 * the tab.
	 */
	import type { PptxUiRibbonAddInElement, RibbonAddInTab } from 'ooxml-ui/pptx';

	const { tab }: { tab: RibbonAddInTab } = $props();
	let host = $state<PptxUiRibbonAddInElement>();
	$effect(() => {
		if (host) {
			host.tab = tab;
		}
	});
</script>

<pptx-ui-ribbon-add-in bind:this={host}></pptx-ui-ribbon-add-in>
