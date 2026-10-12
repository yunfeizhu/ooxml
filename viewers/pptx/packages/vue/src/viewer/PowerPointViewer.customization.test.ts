import { flushPromises, mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import type { ViewerCustomization } from 'ooxml-ui/pptx';
import { afterEach, describe, expect, it, vi } from 'vitest';

import PowerPointViewer from './PowerPointViewer.vue';
import type { PowerPointViewerExpose } from './types';

/**
 * The `customization` prop and the imperative helpers on the component handle,
 * wired through the whole viewer (the failure these guard against is a
 * template that never consults the resolved customisation, which a unit test
 * of the shared decision functions cannot see).
 */
function tabLabels(wrapper: VueWrapper): string[] {
	return wrapper.findAll('[role="tab"]').map((tab) => tab.text().trim());
}

async function mountViewer(customization?: ViewerCustomization): Promise<VueWrapper> {
	const wrapper = mount(PowerPointViewer, {
		props: { content: null, canEdit: true, customization },
	});
	await flushPromises();
	return wrapper;
}

let mounted: VueWrapper | undefined;
afterEach(() => {
	mounted?.unmount();
	mounted = undefined;
	localStorage.clear();
});

describe('powerPointViewer UI customization', () => {
	it('never renders a ribbon tab hidden through the customization prop', async () => {
		mounted = await mountViewer({ ribbon: { hiddenTabs: ['draw'] } });
		const labels = tabLabels(mounted);
		expect(labels).toContain('Insert');
		expect(labels).not.toContain('Draw');
	});

	it('hides and restores a ribbon tab live through the imperative handle', async () => {
		mounted = await mountViewer();
		const viewer = mounted.vm as unknown as PowerPointViewerExpose;
		expect(tabLabels(mounted)).toContain('Insert');

		viewer.hideRibbonTab('insert');
		await flushPromises();
		expect(tabLabels(mounted)).not.toContain('Insert');
		expect(viewer.getCustomization().ribbon?.hiddenTabs).toStrictEqual(['insert']);

		viewer.showRibbonTab('insert');
		await flushPromises();
		expect(tabLabels(mounted)).toContain('Insert');
	});

	it('a new customization prop replaces imperative edits', async () => {
		mounted = await mountViewer();
		const viewer = mounted.vm as unknown as PowerPointViewerExpose;
		viewer.hideRibbonTab('insert');
		await mounted.setProps({ customization: { ribbon: { hiddenTabs: ['design'] } } });
		await flushPromises();
		const labels = tabLabels(mounted);
		expect(labels).toContain('Insert');
		expect(labels).not.toContain('Design');
	});

	it('drops the AI toggle when the host disables the ai feature', async () => {
		const ai = { connection: { kind: 'endpoint' as const, api: '/ai' } };
		mounted = mount(PowerPointViewer, { props: { content: null, canEdit: true, ai } });
		await flushPromises();
		expect(mounted.find('button[aria-label="Toggle AI assistant"]').exists()).toBeTruthy();

		(mounted.vm as unknown as PowerPointViewerExpose).setFeatureEnabled('ai', false);
		await flushPromises();
		expect(mounted.find('button[aria-label="Toggle AI assistant"]').exists()).toBeFalsy();
	});

	it('removes the title bar and the settings gear when the host hides them', async () => {
		mounted = await mountViewer();
		expect(mounted.find('[data-pptx-title-bar]').exists()).toBeTruthy();
		expect(mounted.find('button[aria-label="Settings"]').exists()).toBeTruthy();

		const viewer = mounted.vm as unknown as PowerPointViewerExpose;
		viewer.setPanelVisible('titleBar', false);
		viewer.setDialogAvailable('options', false);
		await flushPromises();
		expect(mounted.find('[data-pptx-title-bar]').exists()).toBeFalsy();
		expect(mounted.find('button[aria-label="Settings"]').exists()).toBeFalsy();
	});

	it('hides ribbon groups and controls through one scoped stylesheet', async () => {
		mounted = await mountViewer({
			ribbon: { hiddenGroups: ['home.font'], hiddenButtons: ['home.paragraph.bullets'] },
		});
		const root = mounted.get('.pptx-vue-viewer');
		const scope = root.attributes('data-pptx-ribbon-scope');
		expect(scope).toMatch(/^[\w-]+$/u);
		const styles = mounted.findAll('style[data-pptx-ribbon-customization]');
		expect(styles).toHaveLength(1);
		const css = styles[0].element.textContent ?? '';
		expect(css).toContain(`[data-pptx-ribbon-scope="${scope}"] [data-ribbon-group="home.font"]`);
		expect(css).toContain(
			`[data-pptx-ribbon-scope="${scope}"] [data-ribbon-control="home.paragraph.bullets"]`,
		);
		expect(css).toContain('display: none !important');
		for (const group of ['clipboard', 'slides', 'font', 'paragraph', 'drawing', 'editing']) {
			expect(root.find(`[data-ribbon-group="home.${group}"]`).exists()).toBeTruthy();
		}
		expect(root.find('[data-ribbon-control="home.paragraph.bullets"]').exists()).toBeTruthy();
	});

	it('updates the ribbon stylesheet live through the imperative handle', async () => {
		mounted = await mountViewer();
		const viewer = mounted.vm as unknown as PowerPointViewerExpose;
		const style = mounted.get('style[data-pptx-ribbon-customization]');
		expect(style.element.textContent).toBe('');

		viewer.hideRibbonGroup('home.editing');
		viewer.hideRibbonControl('home.font.italic');
		await flushPromises();
		expect(style.element.textContent).toContain('[data-ribbon-group="home.editing"]');
		expect(style.element.textContent).toContain('[data-ribbon-control="home.font.italic"]');

		viewer.showRibbonGroup('home.editing');
		await flushPromises();
		expect(style.element.textContent).not.toContain('home.editing');
	});
});

describe('powerPointViewer host ribbon tabs', () => {
	const reports = (run: () => void) => [
		{
			id: 'reports',
			label: 'Reports',
			groups: [{ label: 'Export', commands: [{ id: 'export', label: 'Export', run }] }],
		},
	];

	it('adds the host tab after Help, runs its command and returns to Home when it is removed', async () => {
		const run = vi.fn();
		const heard = vi.fn();
		mounted = mount(PowerPointViewer, {
			props: { content: null, canEdit: true, ribbonAddIns: reports(run) },
			attachTo: document.body,
		});
		await flushPromises();
		const root = mounted.element as HTMLElement;
		root.addEventListener('office-ribbon-add-in', (event) => heard((event as CustomEvent).detail));
		const tab = () => root.querySelector<HTMLButtonElement>('[data-ribbon-add-in-tab]');
		const selected = () =>
			// The ribbon's own tab row: the viewer has other tab lists (inspector).
			[
				...root.querySelectorAll(
					'[data-pptx-chrome="ribbon-tabs"] [role="tab"][aria-selected="true"]',
				),
			].map((item) => item.textContent?.trim());
		expect([...root.querySelectorAll('[data-pptx-chrome="ribbon-tabs"] [role="tab"]')].at(-1)).toBe(
			tab(),
		);
		expect(root.querySelector('pptx-ui-ribbon-add-in')).toBeNull();
		tab()!.click();
		await flushPromises();
		expect(selected()).toStrictEqual(['Reports']);
		const command = root.querySelector('pptx-ui-ribbon-add-in pptx-ui-ribbon-command')!;
		expect(command.getAttribute('label')).toBe('Export');
		// The host tab replaces the fixed tab's groups rather than joining them.
		expect(root.querySelector('[data-ribbon-group="home.font"]')).toBeNull();
		command.shadowRoot!.querySelector('button')!.click();
		expect(run).toHaveBeenCalledOnce();
		expect(heard).toHaveBeenCalledWith({ tab: 'reports', command: 'export' });
		await mounted.setProps({ ribbonAddIns: [] });
		await flushPromises();
		expect(tab()).toBeNull();
		expect(root.querySelector('pptx-ui-ribbon-add-in')).toBeNull();
		expect(selected()).toStrictEqual(['Home']);
	});
});
