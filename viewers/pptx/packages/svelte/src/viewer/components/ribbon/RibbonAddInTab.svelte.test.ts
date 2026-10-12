import type { RibbonAddInTab as RibbonAddInTabView } from 'ooxml-ui/pptx';
import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import RibbonAddInTab from './RibbonAddInTab.svelte';
import RibbonTabBar from './RibbonTabBar.svelte';

let cleanup: (() => void) | undefined;
afterEach(() => {
	cleanup?.();
	cleanup = undefined;
});

const reports = (run: () => void, label = 'Reports'): RibbonAddInTabView => ({
	id: 'reports',
	label,
	groups: [{ label: 'Export', commands: [{ id: 'export', label: 'Export', run }] }],
});

describe('host ribbon tabs', () => {
	it('lists the host tabs after the fixed tabs and selects one by id', () => {
		const target = document.createElement('div');
		const onselect = vi.fn();
		const props = $state({
			active: 'home' as string,
			onselect,
			addInTabs: [reports(vi.fn())] as RibbonAddInTabView[],
		});
		const instance = mount(RibbonTabBar, { target, props });
		cleanup = () => unmount(instance);
		const tab = () => target.querySelector<HTMLButtonElement>('[data-ribbon-add-in-tab="reports"]');
		expect([...target.querySelectorAll('[role="tab"]')].at(-1)).toBe(tab());
		expect(tab()!.textContent!.trim()).toBe('Reports');
		expect(tab()!.getAttribute('aria-selected')).toBe('false');
		tab()!.click();
		expect(onselect).toHaveBeenCalledWith('reports');
		props.active = 'reports';
		flushSync();
		expect(tab()!.getAttribute('aria-selected')).toBe('true');
		expect(target.querySelectorAll('[role="tab"][aria-selected="true"]')).toHaveLength(1);
		props.addInTabs = [];
		flushSync();
		expect(tab()).toBeNull();
	});

	it('draws the tab through the shared element, keeps it across updates and reports the command', () => {
		const target = document.createElement('div');
		document.body.append(target);
		const first = vi.fn();
		const latest = vi.fn();
		const heard = vi.fn();
		target.addEventListener('office-ribbon-add-in', (event) =>
			heard((event as CustomEvent).detail),
		);
		const props = $state({ tab: reports(first) });
		const instance = mount(RibbonAddInTab, { target, props });
		cleanup = () => {
			unmount(instance);
			target.remove();
		};
		flushSync();
		const command = target.querySelector('pptx-ui-ribbon-command')!;
		expect(command.getAttribute('label')).toBe('Export');
		// A new descriptor with new closures keeps the command and runs the latest callback.
		props.tab = reports(latest);
		flushSync();
		expect(target.querySelector('pptx-ui-ribbon-command')).toBe(command);
		command.shadowRoot!.querySelector('button')!.click();
		expect(first).not.toHaveBeenCalled();
		expect(latest).toHaveBeenCalledOnce();
		expect(heard).toHaveBeenCalledWith({ tab: 'reports', command: 'export' });
	});
});
