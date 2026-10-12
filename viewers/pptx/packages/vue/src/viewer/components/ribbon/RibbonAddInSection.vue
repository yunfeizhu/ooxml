<script setup lang="ts">
/**
 * RibbonAddInSection: the body of a host's ribbon tab (`ribbonAddIns`). The shared
 * `pptx-ui-ribbon-add-in` element draws the groups and runs the commands; this only hands it
 * the tab.
 */
import type { RibbonAddInTab } from 'ooxml-ui/pptx';

const props = defineProps<{ tab: RibbonAddInTab }>();
</script>

<template>
	<pptx-ui-ribbon-add-in :tab.prop="props.tab"></pptx-ui-ribbon-add-in>
</template>
