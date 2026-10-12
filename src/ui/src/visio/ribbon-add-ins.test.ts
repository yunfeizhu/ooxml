import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoDocument } from 'ooxml-core/visio/ui';
import { mountViewer } from './binding';
import type { RibbonAddInTab } from './index';

afterEach(() => document.body.replaceChildren());

const tab = (run: () => void): RibbonAddInTab => ({
	id: 'pdf',
	label: 'PDF',
	groups: [{ label: 'Create PDF', commands: [{ id: 'create-pdf', label: 'Create PDF', run }] }],
});

describe('Visio ribbon add-in tabs', () => {
	it('shows a host tab after Help and reports its commands from the viewer', async () => {
		const host = document.createElement('div');
		document.body.append(host);
		const viewer = mountViewer(host, { document: structuredClone(demoDocument) });
		const root = viewer.element.shadowRoot!;
		const ribbon = root.querySelector<HTMLElement & { updateComplete: Promise<unknown> }>(
			'office-ui-ribbon',
		)!;
		const run = vi.fn();
		const heard = vi.fn();
		host.addEventListener('office-ribbon-add-in', (event) => heard((event as CustomEvent).detail));
		viewer.element.ribbonAddIns = [tab(run), { id: 'home', label: 'Not Home', groups: [] }];
		await ribbon.updateComplete;
		const names = [...ribbon.shadowRoot!.querySelectorAll('[role="tab"]')].map((item) =>
			item.textContent!.trim(),
		);
		expect(names.slice(-2)).toEqual(['Help', 'PDF']);
		expect(names).not.toContain('Not Home');
		const panel = root.querySelector<HTMLElement>('[data-add-in]')!;
		expect(panel.className).toBe('ribbon-content');
		// One toolbar row, like the viewer's own panels.
		expect(panel.firstElementChild!.localName).toBe('office-ui-toolbar');
		const button = panel.querySelector('[data-add-in-command="create-pdf"]')!;
		button.shadowRoot!.querySelector('button')!.click();
		expect(run).toHaveBeenCalledTimes(1);
		expect(heard).toHaveBeenCalledWith({ tab: 'pdf', command: 'create-pdf' });
		viewer.element.ribbonAddIns = [];
		expect(root.querySelector('[data-add-in]')).toBeNull();
		viewer.destroy();
	});
});
