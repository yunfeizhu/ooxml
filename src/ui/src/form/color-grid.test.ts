import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { OfficeColorPick, OfficeUiColorGrid } from '../controls';
import { registerOfficeUi } from '../index';

beforeAll(() => registerOfficeUi());
afterEach(() => document.body.replaceChildren());

function make(setup: (grid: OfficeUiColorGrid) => void = () => {}): OfficeUiColorGrid {
	const grid = document.createElement('office-ui-color-grid') as OfficeUiColorGrid;
	setup(grid);
	document.body.append(grid);
	return grid;
}
const buttons = (grid: OfficeUiColorGrid, selector = 'button') => [
	...grid.shadowRoot!.querySelectorAll<HTMLButtonElement>(selector),
];
const key = (target: Element, name: string) =>
	target.dispatchEvent(
		new KeyboardEvent('keydown', { key: name, bubbles: true, composed: true, cancelable: true }),
	);

describe('office-ui-color-grid', () => {
	it('shows the Office theme grid and the standard colours by default', () => {
		const grid = make();
		expect(grid.getAttribute('role')).toBe('group');
		expect(grid.getAttribute('aria-label')).toBe('Colors');
		expect(
			[...grid.shadowRoot!.querySelectorAll('.heading')].map((heading) => heading.textContent),
		).toEqual(['Theme Colors', 'Standard Colors']);
		// Ten base colours, five rows of variants, ten standard colours; no commands.
		expect(buttons(grid, '[data-source="theme"]')).toHaveLength(60);
		expect(buttons(grid, '[data-source="standard"]')).toHaveLength(10);
		expect(buttons(grid, '.command')).toHaveLength(0);
		const accent = buttons(grid, '[data-color="#4472c4"]')[0]!;
		expect(accent.title).toBe('Accent 1');
		expect(buttons(grid, '[data-color="#d9e2f3"]')[0]!.getAttribute('aria-label')).toBe(
			'Accent 1, Lighter 80%',
		);
		expect(buttons(grid, '[data-color="#ff0000"]')[0]!.title).toBe('Red');
	});

	it('builds the theme grid from the given colours and marks the current one', () => {
		const grid = make((el) => {
			el.themeColors = ['#ffffff', '#000000', '#eeeeee', '#222222', '#112233'];
			el.value = '#112233';
			el.label = 'Fill colours';
		});
		expect(grid.getAttribute('aria-label')).toBe('Fill colours');
		const chosen = buttons(grid, '[aria-checked="true"]');
		expect(chosen.map((button) => button.dataset.color)).toEqual(['#112233']);
		expect(chosen[0]!.dataset.column).toBe('4');
		// A column the theme does not give keeps the Office colour.
		expect(buttons(grid, '[data-color="#70ad47"]')).toHaveLength(1);
	});

	it('emits the picked colour with its source and name', () => {
		const grid = make((el) => {
			el.noneLabel = 'No Fill';
			el.automaticLabel = 'Automatic';
			el.moreLabel = 'More Colors...';
			el.recentColors = ['ABCDEF', 'not a colour', '#abcdef'];
		});
		const picked: OfficeColorPick[] = [];
		const more = vi.fn();
		document.body.addEventListener('office-color-pick', (event) =>
			picked.push((event as CustomEvent<OfficeColorPick>).detail),
		);
		document.body.addEventListener('office-color-more', more);
		expect(buttons(grid, '.command').map((button) => button.textContent!.trim())).toEqual([
			'Automatic',
			'No Fill',
			'More Colors...',
		]);
		// Recent colours are normalised; the bad entry is dropped.
		expect(buttons(grid, '[data-source="recent"]').map((button) => button.dataset.color)).toEqual([
			'#abcdef',
			'#abcdef',
		]);
		buttons(grid, '[data-command="automatic"]')[0]!.click();
		buttons(grid, '[data-command="none"]')[0]!.click();
		buttons(grid, '[data-color="#ed7d31"]')[0]!.click();
		buttons(grid, '[data-color="#7030a0"]')[0]!.click();
		buttons(grid, '[data-source="recent"]')[0]!.click();
		buttons(grid, '[data-command="more"]')[0]!.click();
		expect(picked).toEqual([
			{ color: 'automatic', source: 'automatic', label: 'Automatic' },
			{ color: 'none', source: 'none', label: 'No Fill' },
			{ color: '#ed7d31', source: 'theme', label: 'Accent 2', theme: { column: 5 } },
			{ color: '#7030a0', source: 'standard', label: 'Purple' },
			{ color: '#abcdef', source: 'recent', label: '#ABCDEF' },
		]);
		expect(more).toHaveBeenCalledTimes(1);
	});

	it('marks No Fill as the current choice', () => {
		const grid = make((el) => {
			el.noneLabel = 'No Fill';
			el.value = 'none';
		});
		expect(buttons(grid, '[data-command="none"]')[0]!.getAttribute('aria-checked')).toBe('true');
		expect(buttons(grid, '.swatch[aria-checked="true"]')).toHaveLength(0);
	});

	it('moves with the arrow keys, Home and End, and keeps the keys from a host menu', () => {
		const grid = make((el) => {
			el.noneLabel = 'No Fill';
			el.moreLabel = 'More Colors...';
		});
		const host = vi.fn();
		document.body.addEventListener('keydown', host);
		const root = grid.shadowRoot!;
		const active = () => root.activeElement as HTMLButtonElement;
		grid.focus();
		expect(active().dataset.command).toBe('none');
		key(active(), 'ArrowDown');
		expect(active().dataset.color).toBe('#ffffff');
		key(active(), 'ArrowRight');
		key(active(), 'ArrowRight');
		expect(active().title).toBe('Background 2');
		key(active(), 'ArrowDown');
		expect(active().title).toBe('Background 2, Darker 10%');
		key(active(), 'ArrowUp');
		key(active(), 'ArrowLeft');
		expect(active().title).toBe('Text 1');
		key(active(), 'End');
		expect(active().dataset.command).toBe('more');
		key(active(), 'ArrowUp');
		// A one-item row lands on the nearest column of the row above.
		expect(active().title).toBe('Dark Red');
		key(active(), 'Home');
		expect(active().dataset.command).toBe('none');
		expect(host).not.toHaveBeenCalled();
		// Past the first row, and for other keys, the key is the host's.
		key(active(), 'ArrowUp');
		expect(active().dataset.command).toBe('none');
		key(active(), 'Escape');
		expect(host).toHaveBeenCalledTimes(2);
	});

	it('takes product column names and an extra row, and reports where a swatch came from', () => {
		const grid = make((el) => {
			el.themeNames = ['White', 'Black', 'Light', 'Dark'];
			el.themeColors = ['#ffffff', '#000000', '#ffffff', '#000000'];
			el.extraColors = [
				{ hex: '#123456', label: 'Variant Accent 1' },
				{ hex: '#654321', label: 'Variant Accent 2' },
			];
		});
		const picked: OfficeColorPick[] = [];
		grid.addEventListener('office-color-pick', (event) =>
			picked.push((event as CustomEvent<OfficeColorPick>).detail),
		);
		// Missing names fall back to the Office ones.
		expect(buttons(grid, '[data-source="theme"]')[2]!.title).toBe('Light');
		expect(buttons(grid, '[data-source="theme"]')[4]!.title).toBe('Accent 1');
		// The extra row sits between the variants and Standard Colors, with no heading of its own.
		const extra = buttons(grid, '[data-source="extra"]');
		expect(extra.map((button) => button.title)).toEqual(['Variant Accent 1', 'Variant Accent 2']);
		expect(
			[...grid.shadowRoot!.querySelectorAll('.heading')].map((heading) => heading.textContent),
		).toEqual(['Theme Colors', 'Standard Colors']);
		buttons(grid, '[aria-label="Dark, Lighter 50%"]')[0]!.click();
		extra[1]!.click();
		expect(picked).toEqual([
			{
				color: '#7f7f7f',
				source: 'theme',
				label: 'Dark, Lighter 50%',
				theme: { column: 3, variant: { kind: 'lighter', percent: 50 } },
			},
			{ color: '#654321', source: 'extra', label: 'Variant Accent 2', index: 1 },
		]);
	});

	it('does nothing while disabled', () => {
		const grid = make((el) => {
			el.disabled = true;
			el.moreLabel = 'More Colors...';
		});
		const heard = vi.fn();
		grid.addEventListener('office-color-pick', heard);
		grid.addEventListener('office-color-more', heard);
		expect(buttons(grid).every((button) => button.disabled)).toBe(true);
		buttons(grid, '.swatch')[0]!.click();
		expect(heard).not.toHaveBeenCalled();
	});
});
