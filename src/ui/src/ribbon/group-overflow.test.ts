import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { registerOfficeUi } from '../index';
import { attachRibbonGroupOverflow, fitRibbonGroups } from './group-overflow';

beforeAll(() => registerOfficeUi());
afterEach(() => {
	document.body.replaceChildren();
	vi.unstubAllGlobals();
});

const COLLAPSED = 60;
const GROUPS = [
	['Clipboard', 200],
	['Font', 300],
	['Paragraph', 250],
	['Editing', 150],
] as const;

/** A ribbon whose Home panel is `width` wide; a group measures its width, or 60 when collapsed. */
function make(width: number) {
	const ribbon = document.createElement('office-ui-ribbon');
	const panel = (id: string, groups: typeof GROUPS | readonly [], hidden: boolean) => {
		const el = document.createElement('div');
		el.dataset.ribbonTab = id;
		el.dataset.label = id;
		el.hidden = hidden;
		for (const [label, natural] of groups) {
			const group = document.createElement('office-ui-ribbon-group');
			group.setAttribute('label', label);
			group.append(document.createElement('office-ui-button'));
			group.getBoundingClientRect = () =>
				({
					width: group.hasAttribute('data-collapsed') ? COLLAPSED : natural,
				}) as DOMRect;
			el.append(group);
		}
		const size = { width };
		Object.defineProperty(el, 'clientWidth', { get: () => (el.hidden ? 0 : size.width) });
		Object.defineProperty(el, 'scrollWidth', {
			get: () =>
				[...el.querySelectorAll('office-ui-ribbon-group')].reduce(
					(sum, group) => sum + group.getBoundingClientRect().width,
					0,
				),
		});
		ribbon.append(el);
		return { el, size };
	};
	const home = panel('home', GROUPS, false);
	const view = panel('view', GROUPS, true);
	document.body.append(ribbon);
	return { ribbon, home, view };
}

const collapsed = (panel: HTMLElement) =>
	[...panel.querySelectorAll('office-ui-ribbon-group[data-collapsed]')].map((group) =>
		group.getAttribute('label'),
	);
const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
const group = (panel: HTMLElement, label: string) =>
	panel.querySelector<HTMLElement>(`office-ui-ribbon-group[label="${label}"]`)!;
const press = (el: HTMLElement) =>
	el.dispatchEvent(
		new CustomEvent('office-ribbon-collapse-toggle', { bubbles: true, composed: true }),
	);

describe('fitRibbonGroups', () => {
	it('collapses from the right only as far as needed and restores when there is room', () => {
		const { home } = make(900);
		expect(fitRibbonGroups(home.el)).toEqual([]);
		home.size.width = 800;
		// 900 natural: Editing (150 to 60) leaves 810, Paragraph (250 to 60) leaves 620.
		expect(fitRibbonGroups(home.el, { icon: (el) => `i-${el.getAttribute('label')}` })).toEqual([
			'Editing',
			'Paragraph',
		]);
		expect(group(home.el, 'Editing').getAttribute('icon')).toBe('i-Editing');
		expect(group(home.el, 'Font').hasAttribute('icon')).toBe(false);
		home.size.width = 300;
		expect(fitRibbonGroups(home.el)).toEqual(['Editing', 'Paragraph', 'Font', 'Clipboard']);
		home.size.width = 1000;
		expect(fitRibbonGroups(home.el)).toEqual([]);
		expect(collapsed(home.el)).toEqual([]);
	});

	it('leaves a phone-width window to the product', () => {
		const { home } = make(300);
		vi.stubGlobal('innerWidth', 500);
		expect(fitRibbonGroups(home.el, { minWidth: 761 })).toEqual([]);
		vi.stubGlobal('innerWidth', 900);
		expect(fitRibbonGroups(home.el, { minWidth: 761 })).toHaveLength(4);
	});
});

describe('attachRibbonGroupOverflow', () => {
	it('fits the visible panel, follows the tab and opens one collapsed group at a time', async () => {
		const { ribbon, home, view } = make(800);
		const overflow = attachRibbonGroupOverflow(ribbon);
		await frame();
		expect(collapsed(home.el)).toEqual(['Paragraph', 'Editing']);
		expect(collapsed(view.el)).toEqual([]);

		const editing = group(home.el, 'Editing');
		const paragraph = group(home.el, 'Paragraph');
		press(editing);
		expect(editing.hasAttribute('data-open')).toBe(true);
		expect(editing.style.getPropertyValue('--office-ribbon-collapse-y')).not.toBe('');
		press(paragraph);
		expect(editing.hasAttribute('data-open')).toBe(false);
		expect(paragraph.hasAttribute('data-open')).toBe(true);
		// A group that is not collapsed has no popup.
		press(group(home.el, 'Font'));
		expect(group(home.el, 'Font').hasAttribute('data-open')).toBe(false);

		// A command chosen in the popup ends it, even when the product stops the event.
		const button = paragraph.querySelector('office-ui-button')!;
		button.addEventListener('office-command', (event) => event.stopPropagation());
		button.dispatchEvent(
			new CustomEvent('office-command', {
				detail: { command: 'x' },
				bubbles: true,
				composed: true,
			}),
		);
		await Promise.resolve();
		expect(paragraph.hasAttribute('data-open')).toBe(false);

		press(paragraph);
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		expect(paragraph.hasAttribute('data-open')).toBe(false);
		press(paragraph);
		document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
		expect(paragraph.hasAttribute('data-open')).toBe(false);

		// The other tab: its panel is measured, the hidden one is restored.
		home.el.hidden = true;
		view.el.hidden = false;
		view.size.width = 850;
		overflow.refit();
		expect(collapsed(home.el)).toEqual([]);
		expect(collapsed(view.el)).toEqual(['Editing']);

		overflow.destroy();
		expect(collapsed(view.el)).toEqual([]);
		press(group(view.el, 'Editing'));
		expect(group(view.el, 'Editing').hasAttribute('data-open')).toBe(false);
	});

	it('refits when a panel is added', async () => {
		const { ribbon, home } = make(2000);
		const overflow = attachRibbonGroupOverflow(ribbon);
		await frame();
		expect(collapsed(home.el)).toEqual([]);
		home.size.width = 700;
		ribbon.append(Object.assign(document.createElement('div'), { hidden: true }));
		await new Promise((resolve) => setTimeout(resolve, 0));
		await frame();
		expect(collapsed(home.el)).toEqual(['Paragraph', 'Editing']);
		overflow.destroy();
	});
});
