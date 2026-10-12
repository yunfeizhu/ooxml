import { mount } from '@vue/test-utils';
import type { RibbonAddInTab } from 'ooxml-ui/pptx';
import { TOOLBAR_TABS } from 'ooxml-ui/pptx';
import { describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref, shallowRef } from 'vue';

import { RibbonAddInsKey, useRibbonAddInTabs } from '../../composables/ribbon-add-ins';
import type { ToolbarSection } from './ribbon-types';
import RibbonAddInSection from './RibbonAddInSection.vue';
import RibbonTabBar from './RibbonTabBar.vue';

const reports = (run: () => void, label = 'Reports'): RibbonAddInTab => ({
	id: 'reports',
	label,
	groups: [{ label: 'Export', commands: [{ id: 'export', label: 'Export', run }] }],
});

/** The tab row and content wiring `RibbonToolbar` does, without the rest of the ribbon. */
function harness(onFallback: () => void) {
	return defineComponent({
		setup() {
			const section = ref<ToolbarSection>('insert');
			// oxlint-disable-next-line react-hooks/rules-of-hooks -- a Vue composable, called in setup
			const addIns = useRibbonAddInTabs(() => {
				section.value = 'home';
				onFallback();
			});
			return () =>
				h('div', [
					h(RibbonTabBar, {
						toolbarSection: section.value,
						visibleTabs: TOOLBAR_TABS,
						addInTabs: addIns.visible.value,
						activeAddIn: addIns.active.value?.id ?? null,
						onSelectAddIn: addIns.select,
						onSetToolbarSection: (next: ToolbarSection) => {
							addIns.select(null);
							section.value = next;
						},
						canEdit: true,
						onSetMode: () => {},
						isCompactToolbarOpen: true,
						onToggleCompactToolbar: () => {},
					}),
					addIns.active.value ? h(RibbonAddInSection, { tab: addIns.active.value }) : null,
				]);
		},
	});
}

describe('host ribbon tabs', () => {
	it('shows a host tab after the fixed tabs, runs its command and falls back when it is removed', async () => {
		const first = vi.fn();
		const latest = vi.fn();
		const fallback = vi.fn();
		const heard = vi.fn();
		const tabs = shallowRef<RibbonAddInTab[]>([
			reports(first),
			{ ...reports(first), id: 'home', label: 'Fake' },
		]);
		const wrapper = mount(harness(fallback), {
			attachTo: document.body,
			global: {
				provide: { [RibbonAddInsKey as symbol]: () => tabs.value },
				mocks: { $t: (key: string) => key },
				stubs: { TabRowActions: true },
			},
		});
		wrapper.element.addEventListener('office-ribbon-add-in', (event) =>
			heard((event as CustomEvent).detail),
		);
		const tab = () => wrapper.element.querySelector<HTMLButtonElement>('[data-ribbon-add-in-tab]');
		const selected = () =>
			[...wrapper.element.querySelectorAll('[role="tab"][aria-selected="true"]')].map((item) =>
				item.textContent!.trim(),
			);
		const all = [...wrapper.element.querySelectorAll('[role="tab"]')];
		expect(all.at(-1)).toBe(tab());
		expect(all.map((item) => item.textContent!.trim())).not.toContain('Fake');
		expect(wrapper.element.querySelector('pptx-ui-ribbon-add-in')).toBeNull();
		tab()!.click();
		await nextTick();
		expect(selected()).toStrictEqual(['Reports']);
		const command = wrapper.element.querySelector('pptx-ui-ribbon-command')!;
		// A new descriptor with new closures keeps the command and runs the latest callback.
		tabs.value = [reports(latest, 'Reporting')];
		await nextTick();
		expect(tab()!.textContent!.trim()).toBe('Reporting');
		expect(wrapper.element.querySelector('pptx-ui-ribbon-command')).toBe(command);
		command.shadowRoot!.querySelector('button')!.click();
		expect(first).not.toHaveBeenCalled();
		expect(latest).toHaveBeenCalledOnce();
		expect(heard).toHaveBeenCalledWith({ tab: 'reports', command: 'export' });
		// The host removes the tab that is showing: the ribbon goes back to Home.
		tabs.value = [];
		await nextTick();
		await nextTick();
		expect(tab()).toBeNull();
		expect(wrapper.element.querySelector('pptx-ui-ribbon-add-in')).toBeNull();
		expect(fallback).toHaveBeenCalledOnce();
		expect(selected()).toHaveLength(1);
		wrapper.unmount();
	});
});
