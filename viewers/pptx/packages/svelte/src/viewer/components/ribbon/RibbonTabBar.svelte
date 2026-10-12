<script lang="ts">
	/**
	 * RibbonTabBar: the File/Home/Insert/View tab strip, driven by the registry,
	 * plus the right-side quick actions React keeps on the tab row
	 * (`TabRowActions`): Record, then Comments and Share drawn by the shared
	 * `pptx-ui-ribbon-actions` (the element Word and Excel put there too).
	 */
	import {
		buildTabRowActionsState,
		contextualTabLabelKey,
		filterVisibleTabs,
		isActionHidden,
	} from 'ooxml-ui/pptx';
	import type { RibbonAddInTab, RibbonContextualTabId, ToolbarActionId } from 'ooxml-ui/pptx';
	import { useTranslator } from '../../../i18n/context';
	import type { ChromeUiState } from '../../state/chrome-ui.svelte';
	import { useViewerOptions } from '../../state/viewer-options-context';
	import { RIBBON_TABS } from './ribbon-tabs';
	import type { RibbonTabId } from './ribbon-tabs';

	const {
		active,
		onselect,
		onrecord,
		onshare,
		collabActive = false,
		hiddenActions,
		contextualTabs = [],
		addInTabs = [],
		chromeUi,
		commentCount = 0,
	}: {
		active: RibbonTabId | RibbonContextualTabId | string;
		onselect: (id: RibbonTabId | RibbonContextualTabId | string) => void;
		/** The host's tabs (`ribbonAddIns`), shown after the fixed tabs. */
		addInTabs?: readonly RibbonAddInTab[];
		/** Selection-driven tabs (Shape Format, ...), appended after the fixed tabs. */
		contextualTabs?: readonly RibbonContextualTabId[];
		onrecord?: () => void;
		onshare?: () => void;
		collabActive?: boolean;
		hiddenActions?: ToolbarActionId[];
		/** Comments pane state and toggle; absent leaves Comments out. */
		chromeUi?: ChromeUiState;
		/** Comments on the current slide, shown as a badge. */
		commentCount?: number;
	} = $props();

	const t = useTranslator();
	const optionsState = useViewerOptions();
	const visibleTabs = $derived(filterVisibleTabs(RIBBON_TABS, hiddenActions));
	const actionsState = $derived(
		buildTabRowActionsState({
			translate: t,
			showComments: Boolean(chromeUi),
			commentsOpen: Boolean(chromeUi?.commentsOpen),
			commentCount,
			showShare: Boolean(onshare) && !isActionHidden('share', hiddenActions),
			isCollaborating: collabActive,
		}),
	);
</script>

<div class="pptx-svelte-ribbon-tabrow" data-pptx-chrome="ribbon-tabs">
	<div class="pptx-svelte-ribbon-tabs" role="tablist" data-pptx-chrome="ribbon-tab-scroll">
		{#each visibleTabs as tab (tab.id)}
			<button
				type="button"
				class="pptx-svelte-ribbon-tab"
				class:pptx-svelte-ribbon-tab-active={active === tab.id}
				role="tab"
				aria-selected={active === tab.id}
				title={optionsState.screenTip(t(tab.labelKey))}
				onclick={() => onselect(tab.id)}
			>
				{t(tab.labelKey)}
			</button>
		{/each}
		{#each addInTabs as tab (tab.id)}
			<button
				type="button"
				class="pptx-svelte-ribbon-tab"
				class:pptx-svelte-ribbon-tab-active={active === tab.id}
				role="tab"
				aria-selected={active === tab.id}
				data-ribbon-add-in-tab={tab.id}
				title={optionsState.screenTip(tab.label)}
				onclick={() => onselect(tab.id)}
			>
				{tab.label}
			</button>
		{/each}
		{#each contextualTabs as tab (tab)}
			<button
				type="button"
				class="pptx-svelte-ribbon-tab pptx-svelte-ribbon-tab-contextual"
				class:pptx-svelte-ribbon-tab-active={active === tab}
				role="tab"
				aria-selected={active === tab}
				data-ribbon-contextual-tab={tab}
				title={optionsState.screenTip(t(contextualTabLabelKey(tab)))}
				onclick={() => onselect(tab)}
			>
				{t(contextualTabLabelKey(tab))}
			</button>
		{/each}
	</div>
	<div class="pptx-svelte-ribbon-tabrow-actions">
		{#if onrecord && !isActionHidden('record', hiddenActions)}
			<button
				type="button"
				class="pptx-svelte-ribbon-record"
				title={t('pptx.titleBar.record')}
				aria-label={t('pptx.titleBar.record')}
				onclick={onrecord}
			>
				<span class="pptx-svelte-ribbon-record-dot" aria-hidden="true"></span>
				<span>{t('pptx.titleBar.record')}</span>
			</button>
		{/if}
		<pptx-ui-ribbon-actions
			data-pptx-chrome="tab-row-actions"
			state={actionsState}
			oncomments-toggle={() => chromeUi?.toggleComments()}
			onshare-request={() => onshare?.()}
		></pptx-ui-ribbon-actions>
	</div>
</div>

<style>
	.pptx-svelte-ribbon-tabrow {
		display: flex;
		align-items: center;
		gap: 8px;
		border-top: 1px solid var(--pptx-border, #33334d);
		border-bottom: 1px solid var(--pptx-border, #33334d);
	}

	.pptx-svelte-ribbon-tabs {
		display: flex;
		flex: 1;
		align-items: center;
		gap: 2px;
		min-width: 0;
		padding: 0 8px;
		overflow-x: auto;
		overflow-y: hidden;
		scrollbar-width: none;
	}

	.pptx-svelte-ribbon-tabs::-webkit-scrollbar {
		display: none;
	}

	.pptx-svelte-ribbon-tabrow-actions {
		display: flex;
		align-items: center;
		gap: 4px;
		padding-right: 6px;
	}

	.pptx-svelte-ribbon-record {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 3px 10px;
		border: none;
		border-radius: 4px;
		font: inherit;
		font-size: 11px;
		font-weight: 500;
		white-space: nowrap;
		cursor: pointer;
	}

	.pptx-svelte-ribbon-record {
		background: transparent;
		color: var(--pptx-card-foreground, #e2e8f0);
	}

	.pptx-svelte-ribbon-record:hover {
		background: var(--pptx-accent, #33334d);
	}

	.pptx-svelte-ribbon-record-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: #ef4444;
	}

	.pptx-svelte-ribbon-tab {
		padding: 6px 12px;
		border: none;
		background: transparent;
		color: var(--pptx-muted-foreground, #94a3b8);
		font: inherit;
		font-size: 12.5px;
		font-weight: 500;
		white-space: nowrap;
		cursor: pointer;
		position: relative;
	}

	.pptx-svelte-ribbon-tab:hover {
		color: var(--pptx-card-foreground, #e2e8f0);
		background: var(--pptx-accent, #33334d);
	}

	/* PowerPoint tints its contextual tabs with an accent colour. */
	.pptx-svelte-ribbon-tab-contextual {
		color: var(--pptx-contextual-tab, #c084fc);
	}

	.pptx-svelte-ribbon-tab-active {
		color: var(--pptx-primary, #6366f1);
	}

	.pptx-svelte-ribbon-tab-active::after {
		content: '';
		position: absolute;
		left: 8px;
		right: 8px;
		bottom: -1px;
		height: 2px;
		background: var(--pptx-primary, #6366f1);
	}
</style>
