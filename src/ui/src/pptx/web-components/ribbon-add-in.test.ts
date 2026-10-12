// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { RibbonAddInTab } from '../render/ribbon-add-ins';
import { registerPptxWebControls } from './index';
import type { PptxUiRibbonAddInElement } from './ribbon-add-in';

beforeAll(registerPptxWebControls);
afterEach(() => document.body.replaceChildren());

const tab = (run: () => void, label = 'Export'): RibbonAddInTab => ({
	id: 'reports',
	label: 'Reports',
	groups: [
		{
			label: 'Export',
			commands: [
				{ id: 'export', label, icon: 'save', run },
				{ id: 'locked', label: 'Locked', size: 'small', disabled: true, run },
			],
		},
	],
});

function mount(value: RibbonAddInTab | null): PptxUiRibbonAddInElement {
	const element = document.createElement('pptx-ui-ribbon-add-in');
	element.tab = value;
	document.body.append(element);
	return element;
}
const commands = (element: HTMLElement) => [
	...element.querySelectorAll<HTMLElement>('pptx-ui-ribbon-command'),
];
const request = (command: HTMLElement) =>
	command.dispatchEvent(
		new CustomEvent('command-request', {
			detail: { id: command.getAttribute('data-ribbon-control') },
			bubbles: true,
			composed: true,
		}),
	);

describe('pptx-ui-ribbon-add-in', () => {
	it('draws the host tab as PowerPoint ribbon groups and commands', () => {
		const element = mount(tab(vi.fn()));
		expect(element.dataset.ribbonAddIn).toBe('reports');
		const group = element.querySelector('pptx-ui-ribbon-group')!;
		expect(group.getAttribute('label')).toBe('Export');
		expect(commands(element).map((command) => command.getAttribute('label'))).toEqual([
			'Export',
			'Locked',
		]);
		expect(commands(element)[0]!.getAttribute('data-ribbon-control')).toBe('add-in.reports.export');
		expect(commands(element)[1]!.hasAttribute('disabled')).toBe(true);
		expect(commands(element)[1]!.hasAttribute('compact')).toBe(true);
	});

	it('runs the latest callback, announces the command and keeps it from the viewer router', () => {
		const first = vi.fn();
		const latest = vi.fn();
		const router = vi.fn();
		const heard = vi.fn();
		document.body.addEventListener('command-request', router);
		document.body.addEventListener('office-ribbon-add-in', (event) =>
			heard((event as CustomEvent).detail),
		);
		const element = mount(tab(first));
		const [command, locked] = commands(element);
		// A re-render passes an equal descriptor with new closures: the command element is kept.
		element.tab = tab(latest);
		expect(commands(element)[0]).toBe(command);
		request(command!);
		expect(first).not.toHaveBeenCalled();
		expect(latest).toHaveBeenCalledTimes(1);
		expect(heard).toHaveBeenCalledWith({ tab: 'reports', command: 'export' });
		request(locked!);
		expect(latest).toHaveBeenCalledTimes(1);
		expect(router).not.toHaveBeenCalled();
		document.body.removeEventListener('command-request', router);
	});

	it('patches labels in place and clears when the tab goes away', () => {
		const element = mount(tab(vi.fn()));
		element.tab = tab(vi.fn(), 'Export all');
		expect(commands(element)[0]!.getAttribute('label')).toBe('Export all');
		element.tab = null;
		expect(commands(element)).toEqual([]);
		expect(element.dataset.ribbonAddIn).toBeUndefined();
	});
});
