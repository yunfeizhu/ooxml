// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { flush, shellFixture, spyCommand } from '../test-support/shell';
import { createRibbon } from './ribbon';
import { tabButton, type RibbonElement } from 'ooxml-core/xlsx/ui';
import { registerRibbonTabs, resetRibbonTabs, type RibbonTab } from 'ooxml-core/xlsx/ui';
import { collectKeyTips } from './keytips';
import { closeRibbonPopover } from './popover';
import { searchCommands } from 'ooxml-core/xlsx/ui';

const HOME: RibbonTab = {
	id: 'home',
	label: 'Home',
	groups: [
		{
			id: 'clipboard',
			label: 'Clipboard',
			controls: [
				{
					kind: 'split',
					command: 'home.paste',
					size: 'large',
					menu: [
						{ command: 'home.paste' },
						{ separator: true },
						{ command: 'home.paste-values', arg: 'values' },
					],
				},
				{
					kind: 'stack',
					controls: [
						{ kind: 'button', command: 'home.cut' },
						{ kind: 'button', command: 'home.copy' },
					],
				},
			],
		},
		{
			id: 'font',
			label: 'Font',
			launcher: 'home.font-settings',
			controls: [
				{
					kind: 'select',
					command: 'home.font-size',
					options: [
						{ value: '11', label: '11' },
						{ value: '12', label: '12' },
					],
					editable: true,
					width: 52,
				},
				{ kind: 'separator' },
				{ kind: 'toggle', command: 'home.bold' },
				{ kind: 'color', command: 'home.fill-color', label: 'Fill Color', icon: 'fillColor' },
			],
		},
		{
			id: 'number',
			label: 'Number',
			controls: [
				{
					kind: 'select',
					command: 'home.number-format',
					options: [
						{ value: 'General', label: 'General' },
						{ value: '0.00', label: 'Number' },
					],
				},
				{ kind: 'button', command: 'home.percent' },
			],
		},
		{
			id: 'styles',
			label: 'Styles',
			controls: [
				{
					kind: 'gallery',
					command: 'home.cell-styles',
					items: () => [{ id: 'Good', label: 'Good', preview: 'background:#c6efce' }],
				},
			],
		},
		{
			id: 'more',
			label: 'Editing',
			controls: [
				{
					kind: 'menu',
					label: 'Clear',
					icon: 'clear',
					items: [{ command: 'home.clear-all' }, { command: 'missing.command' }],
				},
			],
		},
	],
};
const TABLE: RibbonTab = {
	id: 'table-design',
	label: 'Table Design',
	contextual: () => contextual,
	groups: [{ id: 'g', label: 'Options', controls: [{ kind: 'button', command: 'table.name' }] }],
};
let contextual = false;

function setup() {
	const fixture = shellFixture();
	const ids = [
		'home.paste',
		'home.paste-values',
		'home.cut',
		'home.copy',
		'home.font-settings',
		'home.percent',
		'home.clear-all',
		'table.name',
	];
	const commands = Object.fromEntries(
		ids.map((id) => [id, spyCommand(id, { label: id === 'home.paste' ? 'Paste' : id })]),
	);
	let bold = false;
	const extra = {
		bold: spyCommand('home.bold', { label: 'Bold', shortcut: 'Ctrl+B', checked: () => bold }),
		size: spyCommand('home.font-size', { label: 'Font Size', value: () => '11' }),
		format: spyCommand('home.number-format', { label: 'Number Format', value: () => '0.00' }),
		fill: spyCommand('home.fill-color', { label: 'Fill Color' }),
		styles: spyCommand('home.cell-styles', { label: 'Cell Styles', icon: 'cellStyles' }),
	};
	fixture.core.commands.registerAll([...Object.values(commands), ...Object.values(extra)]);
	registerRibbonTabs([HOME, TABLE]);
	const hidden = new Set<string>();
	const ribbon = createRibbon(fixture.core.ctx, {
		openBackstage: () => (opened = true),
		isHidden: (id) => hidden.has(id),
	});
	let opened = false;
	fixture.core.ctx.root.append(ribbon.element);
	ribbon.refresh();
	return {
		...fixture,
		ribbon,
		commands,
		extra,
		hidden,
		setBold: (on: boolean) => (bold = on),
		opened: () => opened,
	};
}

const $ = <T extends Element = HTMLElement>(root: ParentNode, selector: string) =>
	root.querySelector<T>(selector)!;

afterEach(() => {
	closeRibbonPopover();
	resetRibbonTabs();
	contextual = false;
	document.body.replaceChildren();
});

describe('ribbon renderer', () => {
	it('renders File, the tabs and one panel per tab with labelled groups and a launcher', async () => {
		const { ribbon } = setup();
		const element = ribbon.element as RibbonElement;
		await element.updateComplete;
		expect(element.fileButton()?.textContent).toBe('File');
		expect(tabButton(element, 'home')?.textContent).toBe('Home');
		expect(ribbon.element.getAttribute('part')).toBe('ribbon');
		const groups = [...ribbon.element.querySelectorAll('#xve-panel-home .ribbon-group')].map((g) =>
			g.getAttribute('aria-label'),
		);
		expect(groups).toEqual(['Clipboard', 'Font', 'Number', 'Styles', 'Editing']);
		expect($(ribbon.element, '[data-group="font"] [data-launcher]').dataset.command).toBe(
			'home.font-settings',
		);
	});

	it('runs buttons, split menus with arguments and reflects toggle state', async () => {
		const { ribbon, commands, extra, setBold, core } = setup();
		$(ribbon.element, '[data-command="home.cut"]').click();
		expect(commands['home.cut']!.runs).toEqual([undefined]);
		const caret = $(ribbon.element, '.ribbon-split-large .ribbon-caret') as HTMLButtonElement;
		caret.click();
		const items = [
			...core.ctx.root.querySelectorAll<HTMLButtonElement>('.ribbon-menu-list [role^="menuitem"]'),
		];
		expect(items.map((item) => item.textContent)).toEqual(['Paste', 'home.paste-values']);
		items[1]!.click();
		expect(commands['home.paste-values']!.runs).toEqual(['values']);
		setBold(true);
		ribbon.refresh();
		expect($(ribbon.element, '[data-command="home.bold"]').getAttribute('aria-pressed')).toBe(
			'true',
		);
		expect($(ribbon.element, '[data-command="home.bold"]').title).toBe('Bold (Ctrl+B)');
		expect(extra.bold.runs).toEqual([]);
	});

	it('lays out separated small controls as rows and a leading select on its own row', () => {
		const { ribbon } = setup();
		const font = $(ribbon.element, '[data-group="font"] > .ribbon-stack');
		expect(font.children).toHaveLength(2);
		const number = $(ribbon.element, '[data-group="number"] > .ribbon-stack');
		expect(number.children[0]!.querySelector('select')).not.toBeNull();
		expect(number.children[1]!.querySelector('[data-command="home.percent"]')).not.toBeNull();
	});

	it('shows select and combo values and runs them with the chosen value', () => {
		const { ribbon, extra } = setup();
		const select = $(
			ribbon.element,
			'select[data-command="home.number-format"]',
		) as HTMLSelectElement;
		expect(select.value).toBe('0.00');
		select.value = 'General';
		select.dispatchEvent(new Event('change'));
		expect(extra.format.runs).toEqual(['General']);
		const combo = $(ribbon.element, 'input[data-command="home.font-size"]') as HTMLInputElement;
		expect(combo.value).toBe('11');
		combo.value = '14';
		combo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
		expect(extra.size.runs).toEqual(['14']);
	});

	it('picks colours from the theme grid, Automatic and the standard row', () => {
		const { ribbon, extra, core } = setup();
		const main = $(ribbon.element, '[data-command="home.fill-color"]') as HTMLButtonElement;
		main.click();
		expect(extra.fill.runs).toEqual([{ rgb: 'FFFF00' }]);
		(main.nextElementSibling as HTMLButtonElement).click();
		// The shared colour grid, in Excel's popover.
		const grid = () => $(core.ctx.root, '.color-grid office-ui-color-grid').shadowRoot!;
		expect(grid().querySelectorAll('.swatch')).toHaveLength(70);
		(grid().querySelector('[aria-label="Accent 1, Lighter 80%"]') as HTMLButtonElement).click();
		expect(extra.fill.runs[1]).toEqual({ theme: 4, tint: 0.8 });
		(main.nextElementSibling as HTMLButtonElement).click();
		expect(grid().querySelector('[data-command="automatic"]')!.textContent).toContain('No Fill');
		(grid().querySelector('[data-command="automatic"]') as HTMLButtonElement).click();
		expect(extra.fill.runs[2]).toBeUndefined();
		expect(extra.fill.runs).toHaveLength(3);
		main.click();
		expect(extra.fill.runs[3]).toBeUndefined();
	});

	it('opens galleries and skips menu items whose command is missing', () => {
		const { ribbon, extra, core, commands } = setup();
		$(ribbon.element, '[data-command="home.cell-styles"]').click();
		const tile = $(core.ctx.root, '.ribbon-gallery-menu [role="menuitem"]') as HTMLButtonElement;
		expect(tile.getAttribute('aria-label')).toBe('Good');
		tile.click();
		expect(extra.styles.runs).toEqual(['Good']);
		$(ribbon.element, '.ribbon-menu-button').click();
		const items = core.ctx.root.querySelectorAll('.ribbon-menu-list [role="menuitem"]');
		expect(items).toHaveLength(1);
		(items[0] as HTMLButtonElement).click();
		expect(commands['home.clear-all']!.runs).toHaveLength(1);
	});

	it('disables editing commands in read-only and hides hidden actions, groups and tabs', () => {
		const { ribbon, core, hidden } = setup();
		core.commands.register(spyCommand('home.percent', { editing: true }));
		ribbon.rebuild();
		core.setReadOnly(true);
		ribbon.refresh();
		expect(($(ribbon.element, '[data-command="home.percent"]') as HTMLButtonElement).disabled).toBe(
			true,
		);
		hidden.add('home.cell-styles');
		ribbon.refresh();
		expect($(ribbon.element, '[data-group="styles"]').hasAttribute('data-xve-hidden')).toBe(true);
		expect($(ribbon.element, '[data-group="font"]').hasAttribute('data-xve-hidden')).toBe(false);
	});

	it('shows contextual tabs only while their test passes', async () => {
		const { ribbon } = setup();
		const element = ribbon.element as RibbonElement;
		const tab = () => tabButton(element, 'table-design');
		await element.updateComplete;
		expect(tab()).toBeNull();
		contextual = true;
		ribbon.refresh();
		await new Promise((resolve) => setTimeout(resolve, 0));
		await element.updateComplete;
		expect(tab()?.hasAttribute('data-contextual')).toBe(true);
		ribbon.selectTab('table-design');
		expect(ribbon.activeTab()).toBe('table-design');
		contextual = false;
		ribbon.refresh();
		expect(ribbon.activeTab()).toBe('home');
	});

	it('opens the backstage from File and collapses with the shared ribbon', async () => {
		const { ribbon, opened } = setup();
		const element = ribbon.element as RibbonElement;
		await element.updateComplete;
		element.fileButton()!.click();
		expect(opened()).toBe(true);
		expect(element.hasAttribute('collapsible')).toBe(true);
		element.shadowRoot!.querySelector<HTMLButtonElement>('.collapse')!.click();
		expect(element.hasAttribute('collapsed')).toBe(true);
	});

	it('relocalizes tab and group captions on rebuild', async () => {
		const { ribbon, core } = setup();
		core.setLocale('fr');
		ribbon.rebuild();
		await flush();
		const element = ribbon.element as RibbonElement;
		await element.updateComplete;
		expect(element.fileButton()?.textContent).toBe('Fichier');
		expect(element.getAttribute('collapse-label')).toBe('Réduire le ruban');
	});
});

describe('KeyTips and Tell me', () => {
	it('uses Excel keys where known and unique derived keys otherwise', () => {
		const { ribbon } = setup();
		const panel = $(ribbon.element, '#xve-panel-home');
		// jsdom has no layout: give every control a box so it counts as visible.
		for (const node of panel.querySelectorAll<HTMLElement>('*'))
			node.getClientRects = () => [{}] as unknown as DOMRectList;
		const tips = collectKeyTips(panel);
		const keys = tips.map((tip) => tip.key);
		expect(tips.find((tip) => tip.element.dataset.command === 'home.bold')?.key).toBe('1');
		expect(new Set(keys).size).toBe(keys.length);
		for (const key of keys)
			expect(keys.filter((other) => other !== key && other.startsWith(key))).toEqual([]);
	});

	it('shows a badge on File and each tab and opens the tab for its letter', async () => {
		const { ribbon, opened } = setup();
		const element = ribbon.element as RibbonElement;
		await element.updateComplete;
		ribbon.showKeyTips();
		const badges = () =>
			[...element.querySelectorAll('.xve-keytip')].map((badge) => badge.textContent);
		expect(badges().slice(0, 2)).toEqual(['F', 'H']);
		element.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
		await element.updateComplete;
		expect(ribbon.activeTab()).toBe('home');
		element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		expect(badges()).toEqual([]);
		ribbon.showKeyTips();
		element.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true }));
		expect(opened()).toBe(true);
	});

	it('searches enabled, visible commands by translated or English label', () => {
		const { core } = setup();
		core.setLocale('de');
		expect(searchCommands(core.ctx, 'bold', () => false).map((c) => c.id)).toContain('home.bold');
		expect(searchCommands(core.ctx, 'bold', (id) => id === 'home.bold')).toEqual([]);
		expect(searchCommands(core.ctx, '   ', () => false)).toEqual([]);
	});
});
