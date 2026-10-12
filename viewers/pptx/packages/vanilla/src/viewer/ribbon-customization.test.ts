import { afterEach, describe, expect, it, vi } from 'vitest';

import { createPptxViewer } from './PptxViewer';
import type { PptxViewerInstance, PptxViewerOptions } from './types';

let active: PptxViewerInstance[] = [];

function mount(options: PptxViewerOptions = {}): {
	container: HTMLElement;
	viewer: PptxViewerInstance;
} {
	const container = document.createElement('div');
	document.body.appendChild(container);
	const viewer = createPptxViewer(container, options);
	active.push(viewer);
	return { container, viewer };
}

afterEach(() => {
	for (const viewer of active) {
		viewer.destroy();
	}
	active = [];
	document.body.replaceChildren();
});

function customizationStyles(container: HTMLElement): HTMLStyleElement[] {
	return Array.from(
		container.querySelectorAll<HTMLStyleElement>('style[data-pptx-ribbon-customization]'),
	);
}

describe('vanilla ribbon group / control customisation', () => {
	it('renders one scoped stylesheet hiding the host-named groups and controls', () => {
		const { container } = mount({
			editable: true,
			customization: {
				ribbon: { hiddenGroups: ['home.font'], hiddenButtons: ['home.paragraph.bullets'] },
			},
		});
		const root = container.querySelector<HTMLElement>('[data-pptx-ribbon-scope]');
		const token = root?.getAttribute('data-pptx-ribbon-scope');
		expect(token).toBeTruthy();
		const styles = customizationStyles(container);
		expect(styles).toHaveLength(1);
		const css = styles[0].textContent ?? '';
		expect(css).toContain(`[data-pptx-ribbon-scope="${token}"] [data-ribbon-group="home.font"]`);
		expect(css).toContain(
			`[data-pptx-ribbon-scope="${token}"] [data-ribbon-control="home.paragraph.bullets"]`,
		);
		for (const group of [
			'home.clipboard',
			'home.slides',
			'home.font',
			'home.paragraph',
			'home.drawing',
			'home.editing',
		]) {
			expect(root?.querySelector(`[data-ribbon-group="${group}"]`)).not.toBeNull();
		}
	});

	it('re-renders the stylesheet when the imperative API hides a group', () => {
		const { container, viewer } = mount({ editable: true });
		expect(customizationStyles(container)[0]?.textContent).toBe('');
		viewer.hideRibbonGroup('home.editing');
		viewer.hideRibbonControl('home.font.bold');
		const styles = customizationStyles(container);
		expect(styles).toHaveLength(1);
		expect(styles[0].textContent).toContain('[data-ribbon-group="home.editing"]');
		expect(styles[0].textContent).toContain('[data-ribbon-control="home.font.bold"]');
		viewer.showRibbonGroup('home.editing');
		expect(customizationStyles(container)[0].textContent).not.toContain('home.editing');
	});
});

describe('vanilla host ribbon tabs', () => {
	const reports = (run: () => void) => [
		{
			id: 'reports',
			label: 'Reports',
			groups: [{ label: 'Export', commands: [{ id: 'export', label: 'Export', run }] }],
		},
	];

	it('takes them as an option, survives a chrome rebuild and changes live', () => {
		const run = vi.fn();
		const heard = vi.fn();
		const { container, viewer } = mount({ editable: true, ribbonAddIns: reports(run) });
		container.addEventListener('office-ribbon-add-in', (event) =>
			heard((event as CustomEvent).detail),
		);
		const tab = () => container.querySelector<HTMLButtonElement>('[data-ribbon-add-in-tab]');
		expect(tab()?.textContent).toBe('Reports');
		// A customisation change rebuilds the whole chrome: the host tab is still there.
		viewer.hideRibbonTab('draw');
		expect(tab()?.textContent).toBe('Reports');
		tab()!.click();
		expect(tab()!.getAttribute('aria-selected')).toBe('true');
		container
			.querySelector('pptx-ui-ribbon-add-in pptx-ui-ribbon-command')!
			.shadowRoot!.querySelector('button')!
			.click();
		expect(run).toHaveBeenCalledOnce();
		expect(heard).toHaveBeenCalledWith({ tab: 'reports', command: 'export' });
		viewer.setRibbonAddIns([]);
		expect(tab()).toBeNull();
		expect(container.querySelector('pptx-ui-ribbon-add-in')).toBeNull();
		expect(
			container.querySelectorAll('[data-pptx-chrome="ribbon-tabs"] [aria-selected="true"]'),
		).toHaveLength(1);
	});
});
