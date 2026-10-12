<script setup lang="ts">
/**
 * RibbonTabBar: the ribbon's tab row (File / Home / Insert / … / Help tab
 * buttons, the Record + Share cluster, and the collapse toggle). Extracted
 * from `RibbonToolbar.vue` to keep that file under the repo's ~300 LOC
 * convention; this is purely a template split, the props are the same
 * `RibbonToolbar` already reads off `RibbonProps`.
 */
import { ChevronDown, ChevronUp } from 'lucide-vue-next';
import { contextualTabLabelKey } from 'ooxml-ui/pptx';
import type {
	RibbonAddInTab,
	RibbonContextualTabId,
	ToolbarActionId,
	ToolbarTabDefinition,
} from 'ooxml-ui/pptx';
import { inject } from 'vue';
import { useI18n } from 'vue-i18n';

import { cn } from '../../../utils';
import { ScreenTipKey } from '../../composables/useViewerOptionsStore';
import type { ToolbarSection, ViewerMode } from './ribbon-types';
import TabRowActions from './TabRowActions.vue';

interface Props {
	toolbarSection: ToolbarSection;
	visibleTabs: ToolbarTabDefinition[];
	/** Contextual tabs the selection brings up (shared `visibleContextualTabs`). */
	contextualTabs?: readonly RibbonContextualTabId[];
	/** The host's tabs (`ribbonAddIns`), shown after the fixed tabs. */
	addInTabs?: readonly RibbonAddInTab[];
	/** The host tab being shown; no fixed or contextual tab is selected while one is. */
	activeAddIn?: string | null;
	onSelectAddIn?: (id: string) => void;
	onSetToolbarSection: (section: ToolbarSection) => void;
	canEdit: boolean;
	onEnterRehearsalMode?: () => void;
	onSetMode: (mode: ViewerMode) => void;
	onOpenShareDialog?: () => void;
	isCollaborating?: boolean;
	collaboratorCount?: number;
	onToggleComments?: () => void;
	isCommentsPanelOpen?: boolean;
	slideCommentCount?: number;
	hiddenActions?: ToolbarActionId[];
	isCompactToolbarOpen: boolean;
	onToggleCompactToolbar: () => void;
}

const props = defineProps<Props>();
const { t } = useI18n();
const screenTip = inject(ScreenTipKey, (label: string) => label);
</script>

<template>
	<div
		role="tablist"
		data-pptx-chrome="ribbon-tabs"
		class="flex items-center border-b border-border/60 px-1 max-md:overflow-x-auto max-md:scrollbar-none"
	>
		<button
			v-for="sec in props.visibleTabs"
			:key="sec.id"
			type="button"
			role="tab"
			:aria-selected="!props.activeAddIn && props.toolbarSection === sec.id"
			:title="screenTip(t(sec.labelKey))"
			:class="
				cn(
					'relative px-3.5 py-2 text-[12px] font-medium whitespace-nowrap transition-colors max-md:min-h-[36px] max-md:px-3',
					!props.activeAddIn && props.toolbarSection === sec.id
						? sec.id === 'file'
							? 'text-white bg-primary/80 rounded-sm'
							: 'text-foreground after:absolute after:-bottom-px after:left-0 after:right-0 after:h-[2.5px] after:bg-primary'
						: sec.id === 'file'
							? 'text-primary hover:bg-primary/15 rounded-sm'
							: 'text-muted-foreground hover:text-foreground hover:bg-accent/30',
				)
			"
			@click="props.onSetToolbarSection(sec.id)"
		>
			{{ t(sec.labelKey) }}
		</button>
		<button
			v-for="tab in props.addInTabs ?? []"
			:key="tab.id"
			type="button"
			role="tab"
			:data-ribbon-add-in-tab="tab.id"
			:aria-selected="props.activeAddIn === tab.id"
			:title="screenTip(tab.label)"
			:class="
				cn(
					'relative px-3.5 py-2 text-[12px] font-medium whitespace-nowrap transition-colors max-md:min-h-[36px] max-md:px-3',
					props.activeAddIn === tab.id
						? 'text-foreground after:absolute after:-bottom-px after:left-0 after:right-0 after:h-[2.5px] after:bg-primary'
						: 'text-muted-foreground hover:text-foreground hover:bg-accent/30',
				)
			"
			@click="props.onSelectAddIn?.(tab.id)"
		>
			{{ tab.label }}
		</button>
		<button
			v-for="tab in props.contextualTabs ?? []"
			:key="tab"
			type="button"
			role="tab"
			:data-ribbon-contextual-tab="tab"
			:aria-selected="!props.activeAddIn && props.toolbarSection === tab"
			:title="screenTip(t(contextualTabLabelKey(tab)))"
			:class="
				cn(
					'relative px-3.5 py-2 text-[12px] font-medium whitespace-nowrap transition-colors text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 max-md:min-h-[36px] max-md:px-3',
					!props.activeAddIn &&
						props.toolbarSection === tab &&
						'after:absolute after:-bottom-px after:left-0 after:right-0 after:h-[2.5px] after:bg-amber-500',
				)
			"
			@click="props.onSetToolbarSection(tab)"
		>
			{{ t(contextualTabLabelKey(tab)) }}
		</button>
		<div class="flex-1" />
		<TabRowActions
			:on-enter-rehearsal-mode="
				props.canEdit
					? (props.onEnterRehearsalMode ?? (() => props.onSetMode('present')))
					: undefined
			"
			:on-open-share-dialog="props.onOpenShareDialog"
			:is-collaborating="props.isCollaborating"
			:collaborator-count="props.collaboratorCount"
			:on-toggle-comments="props.onToggleComments"
			:is-comments-panel-open="props.isCommentsPanelOpen"
			:slide-comment-count="props.slideCommentCount"
			:hidden-actions="props.hiddenActions"
		/>
		<button
			type="button"
			class="mr-1 inline-flex items-center justify-center rounded px-2 py-1 text-muted-foreground transition-colors hover:text-foreground"
			:aria-pressed="!props.isCompactToolbarOpen"
			:aria-label="
				props.isCompactToolbarOpen ? t('pptx.ribbon.collapseRibbon') : t('pptx.ribbon.expandRibbon')
			"
			:title="
				props.isCompactToolbarOpen ? t('pptx.ribbon.collapseRibbon') : t('pptx.ribbon.expandRibbon')
			"
			@click="props.onToggleCompactToolbar"
		>
			<component
				:is="props.isCompactToolbarOpen ? ChevronUp : ChevronDown"
				class="h-3.5 w-3.5"
				aria-hidden="true"
			/>
		</button>
	</div>
</template>
