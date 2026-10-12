import { mount, unmount } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChromeUiState } from '../../state/chrome-ui.svelte';
import { RIBBON_TABS } from './ribbon-tabs';
import RibbonTabBar from './RibbonTabBar.svelte';

let cleanup: (() => void) | undefined;
afterEach(() => {
	cleanup?.();
	cleanup = undefined;
});

function tabLabels(target: HTMLElement): string[] {
	return [...target.querySelectorAll('[role="tab"]')].map((el) => el.textContent?.trim() ?? '');
}

describe('ribbonTabBar hiddenActions', () => {
	it('renders every ribbon tab when hiddenActions is omitted (backward compatible default)', () => {
		const target = document.createElement('div');
		const instance = mount(RibbonTabBar, { target, props: { active: 'home', onselect: vi.fn() } });
		cleanup = () => unmount(instance);

		expect(target.querySelectorAll('[role="tab"]')).toHaveLength(RIBBON_TABS.length);
	});

	it('omits a hidden tab from the tab strip', () => {
		const target = document.createElement('div');
		const instance = mount(RibbonTabBar, {
			target,
			props: { active: 'home', onselect: vi.fn(), hiddenActions: ['design', 'record'] },
		});
		cleanup = () => unmount(instance);

		expect(target.querySelectorAll('[role="tab"]')).toHaveLength(RIBBON_TABS.length - 2);
		expect(tabLabels(target)).not.toContain('Design');
		expect(tabLabels(target)).not.toContain('Record');
	});

	it('renders Record, then the shared Comments / Share element, on the tab row right side', () => {
		const onrecord = vi.fn();
		const onshare = vi.fn();
		const chromeUi = new ChromeUiState();
		const target = document.createElement('div');
		document.body.append(target);
		const instance = mount(RibbonTabBar, {
			target,
			props: { active: 'home', onselect: vi.fn(), onrecord, onshare, chromeUi, commentCount: 2 },
		});
		cleanup = () => {
			unmount(instance);
			target.remove();
		};

		const record = target.querySelector<HTMLButtonElement>('.pptx-svelte-ribbon-record');
		const actions = target.querySelector('pptx-ui-ribbon-actions')!;
		const part = (name: string) =>
			actions.shadowRoot!.querySelector<HTMLButtonElement>(`[part="${name}"]`)!;
		expect(record).not.toBeNull();
		expect(part('share').hidden).toBeFalsy();
		expect(part('comments').hidden).toBeFalsy();
		expect(part('comments').querySelector('.badge')?.textContent).toBe('2');
		record?.click();
		part('share').click();
		part('comments').click();
		expect(onrecord).toHaveBeenCalledOnce();
		expect(onshare).toHaveBeenCalledOnce();
		expect(chromeUi.inspectorTab).toBe('comments');
	});

	it('hides the tab-row Record / Share quick actions via hiddenActions', () => {
		const target = document.createElement('div');
		document.body.append(target);
		const instance = mount(RibbonTabBar, {
			target,
			props: {
				active: 'home',
				onselect: vi.fn(),
				onrecord: vi.fn(),
				onshare: vi.fn(),
				hiddenActions: ['record', 'share'],
			},
		});
		cleanup = () => {
			unmount(instance);
			target.remove();
		};

		expect(target.querySelector('.pptx-svelte-ribbon-record')).toBeNull();
		const actions = target.querySelector('pptx-ui-ribbon-actions')!;
		expect(actions.shadowRoot!.querySelector<HTMLElement>('[part="share"]')!.hidden).toBeTruthy();
	});
});
