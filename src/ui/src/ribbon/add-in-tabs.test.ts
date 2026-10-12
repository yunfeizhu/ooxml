import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { registerOfficeUi } from '../index';
import {
	defineRibbonAddInElements,
	RIBBON_ADD_IN_EVENT,
	syncRibbonAddIns,
	type RibbonAddInTab,
} from './add-in-tabs';

beforeAll(() => registerOfficeUi());
afterEach(() => document.body.replaceChildren());

type Ribbon = HTMLElement & { selected: string; updateComplete: Promise<unknown> };

function make(): Ribbon {
	const ribbon = document.createElement('office-ui-ribbon') as Ribbon;
	for (const [id, label] of [
		['home', 'Home'],
		['help', 'Help'],
	] as const) {
		const panel = document.createElement('div');
		panel.dataset.ribbonTab = id;
		panel.dataset.label = label;
		ribbon.append(panel);
	}
	document.body.append(ribbon);
	return ribbon;
}

const pdf = (run = vi.fn()): RibbonAddInTab => ({
	id: 'pdf',
	label: 'PDF',
	keytip: 'B',
	groups: [
		{
			label: 'Create PDF',
			commands: [
				{ id: 'create', label: 'Create PDF', icon: 'save', run },
				{ id: 'preferences', label: 'Preferences', size: 'small' },
				{ id: 'locked', label: 'Locked', size: 'small', disabled: true, run },
				{ id: 'a', label: 'A', size: 'small' },
				{ id: 'b', label: 'B', size: 'small' },
				{
					id: 'share',
					label: 'Share',
					items: [{ id: 'share-mail', label: 'By mail', run }],
				},
			],
		},
	],
});

const tabs = (ribbon: Ribbon) =>
	[...ribbon.shadowRoot!.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent!.trim());
const click = (el: Element, command: string) =>
	el.dispatchEvent(
		new CustomEvent('office-command', { detail: { command }, bubbles: true, composed: true }),
	);

describe('ribbon add-in tabs', () => {
	it('adds a tab after the product tabs, with groups, columns of three and a drop-down', async () => {
		const ribbon = make();
		expect(syncRibbonAddIns(ribbon, [pdf()], { panelClass: 'panel' })).toEqual(['pdf']);
		await ribbon.updateComplete;
		expect(tabs(ribbon)).toEqual(['Home', 'Help', 'PDF']);
		// The product's selection stays.
		expect(ribbon.selected).toBe('home');
		const panel = ribbon.querySelector<HTMLElement>('[data-add-in]')!;
		expect(panel.className).toBe('panel');
		expect(panel.dataset.tabKeytip).toBe('B');
		const group = panel.querySelector('office-ui-ribbon-group')!;
		expect(group.getAttribute('label')).toBe('Create PDF');
		expect([...group.children].map((child) => child.localName)).toEqual([
			'office-ui-button',
			'office-ui-ribbon-stack',
			'office-ui-ribbon-stack',
			'office-ui-menu-button',
		]);
		expect(
			[...group.querySelectorAll('office-ui-ribbon-stack')].map((stack) => stack.children.length),
		).toEqual([3, 1]);
		expect(group.querySelector('[data-add-in-command="create"]')!.getAttribute('size')).toBe(
			'large',
		);
		expect(group.querySelector('[data-add-in-command="preferences"]')!.getAttribute('size')).toBe(
			'small',
		);
		expect(group.querySelector('[data-add-in-command="share"]')!.getAttribute('variant')).toBe(
			'stacked',
		);
		expect(group.querySelector('[data-add-in-command="locked"]')!.hasAttribute('disabled')).toBe(
			true,
		);
		expect(group.querySelector('office-ui-menu-item')!.getAttribute('label')).toBe('By mail');
	});

	it('runs the command, announces it past the ribbon and hides it from the product router', () => {
		const ribbon = make();
		const run = vi.fn();
		const product = vi.fn();
		const heard = vi.fn();
		ribbon.addEventListener('office-command', product);
		document.body.addEventListener(RIBBON_ADD_IN_EVENT, (event) =>
			heard((event as CustomEvent).detail),
		);
		syncRibbonAddIns(ribbon, [pdf(run)]);
		const panel = ribbon.querySelector<HTMLElement>('[data-add-in]')!;
		click(panel.querySelector('[data-add-in-command="create"]')!, 'create');
		expect(run).toHaveBeenCalledTimes(1);
		expect(heard).toHaveBeenLastCalledWith({ tab: 'pdf', command: 'create' });
		click(panel.querySelector('office-ui-menu-item')!, 'share-mail');
		expect(heard).toHaveBeenLastCalledWith({ tab: 'pdf', command: 'share-mail' });
		// Disabled and unknown commands do nothing.
		click(panel, 'locked');
		click(panel, 'missing');
		expect(run).toHaveBeenCalledTimes(2);
		expect(heard).toHaveBeenCalledTimes(2);
		expect(product).not.toHaveBeenCalled();
	});

	it('replaces the add-in tabs and never a product tab', async () => {
		const ribbon = make();
		const home = ribbon.querySelector('[data-ribbon-tab="home"]');
		syncRibbonAddIns(ribbon, [pdf()]);
		const other: RibbonAddInTab = { id: 'sign', label: 'Sign', groups: [] };
		expect(
			syncRibbonAddIns(ribbon, [
				other,
				{ ...other, label: 'Again' },
				{ id: 'home', label: 'Fake Home', groups: [] },
				{ id: '', label: 'Nameless', groups: [] },
			]),
		).toEqual(['sign']);
		await ribbon.updateComplete;
		expect(tabs(ribbon)).toEqual(['Home', 'Help', 'Sign']);
		expect(ribbon.querySelector('[data-ribbon-tab="home"]')).toBe(home);
		expect(syncRibbonAddIns(ribbon, [])).toEqual([]);
		expect(ribbon.querySelector('[data-add-in]')).toBeNull();
	});

	it('keeps the panels when only callbacks change and runs the latest one', () => {
		const ribbon = make();
		const first = vi.fn();
		const second = vi.fn();
		syncRibbonAddIns(ribbon, [pdf(first)], { panelClass: 'panel' });
		const panel = ribbon.querySelector<HTMLElement>('[data-add-in]')!;
		// A framework re-render: an equal descriptor with fresh closures.
		expect(syncRibbonAddIns(ribbon, [pdf(second)], { panelClass: 'panel' })).toEqual(['pdf']);
		expect(ribbon.querySelector('[data-add-in]')).toBe(panel);
		click(panel.querySelector('[data-add-in-command="create"]')!, 'create');
		expect(first).not.toHaveBeenCalled();
		expect(second).toHaveBeenCalledTimes(1);
		// A visible change rebuilds, and so does a product that cleared its panels.
		syncRibbonAddIns(ribbon, [{ ...pdf(second), label: 'Documents' }], { panelClass: 'panel' });
		const renamed = ribbon.querySelector<HTMLElement>('[data-add-in]')!;
		expect(renamed).not.toBe(panel);
		expect(renamed.dataset.label).toBe('Documents');
		renamed.remove();
		syncRibbonAddIns(ribbon, [{ ...pdf(second), label: 'Documents' }], { panelClass: 'panel' });
		expect(ribbon.querySelector('[data-add-in]')).not.toBeNull();
	});

	it('defines the elements a panel is built from, for a product that never registered them', () => {
		// Word's ribbon is hand-built: without this its add-in panel was a row of empty, inert tags.
		const defined: string[] = [];
		const registry = {
			get: () => undefined,
			define: (tag: string) => void defined.push(tag),
		} as unknown as CustomElementRegistry;
		defineRibbonAddInElements(registry);
		expect(defined).toEqual(
			expect.arrayContaining([
				'office-ui-ribbon-group',
				'office-ui-ribbon-stack',
				'office-ui-button',
				'office-ui-menu-item',
				'office-ui-menu-button',
			]),
		);
		expect(() => defineRibbonAddInElements(undefined)).not.toThrow();
	});
});
