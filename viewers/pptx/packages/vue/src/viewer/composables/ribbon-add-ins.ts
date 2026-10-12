import type { RibbonAddInTab } from 'ooxml-ui/pptx';
import { visibleRibbonAddIns } from 'ooxml-ui/pptx';
import { computed, inject, ref, watch } from 'vue';
import type { ComputedRef, InjectionKey } from 'vue';

/**
 * The host's ribbon tabs (the `ribbonAddIns` prop), as a getter so the ribbon follows the prop.
 * `PowerPointViewer` provides it; a ribbon mounted on its own sees none.
 */
export const RibbonAddInsKey: InjectionKey<() => readonly RibbonAddInTab[] | undefined> =
	Symbol('pptx-ribbon-add-ins');

export interface RibbonAddInTabs {
	/** The host tabs the ribbon shows, in order. */
	visible: ComputedRef<RibbonAddInTab[]>;
	/** The host tab being shown, or null when a fixed or contextual tab is. */
	active: ComputedRef<RibbonAddInTab | null>;
	select: (id: string | null) => void;
}

/**
 * Which host tab the ribbon shows. Choosing one is local ribbon state, like React's; any other
 * tab clears it. When the host removes the chosen tab, `onFallback` moves the viewer's own
 * section back to Home.
 */
export function useRibbonAddInTabs(onFallback: () => void): RibbonAddInTabs {
	const source = inject(RibbonAddInsKey, undefined);
	const visible = computed(() => visibleRibbonAddIns(source?.()));
	const chosen = ref<string | null>(null);
	const active = computed(
		() => (chosen.value && visible.value.find((tab) => tab.id === chosen.value)) || null,
	);
	watch(active, (next) => {
		if (chosen.value !== null && next === null) {
			chosen.value = null;
			onFallback();
		}
	});
	return {
		visible,
		active,
		select: (id) => {
			chosen.value = id;
		},
	};
}
