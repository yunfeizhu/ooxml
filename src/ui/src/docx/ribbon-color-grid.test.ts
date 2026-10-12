// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { openColorGridPopover } from './ribbon-color-grid';

const grid = () => document.querySelector('.color-grid office-ui-color-grid')!.shadowRoot!;

describe('colour grid', () => {
	it('shows the variants Office derives: white darkens, black lightens, colours do both', () => {
		const host = document.createElement('div');
		document.body.append(host);
		const anchor = document.createElement('button');
		host.append(anchor);
		openColorGridPopover(anchor, () => {});
		const column = (index: number) =>
			[...grid().querySelectorAll<HTMLElement>('[data-source="theme"]')]
				.filter((swatch) => swatch.dataset.column === String(index))
				.map((swatch) => swatch.dataset.color);
		expect(column(0)[5]).toBe('#7f7f7f');
		expect(column(1)[1]).toBe('#7f7f7f');
		// Accent 1 as Word shows it: Lighter 80%, 60%, 40%, then Darker 25% and 50%.
		expect(column(4)).toEqual(['#4472c4', '#d9e2f3', '#b4c6e7', '#8eaadb', '#2f5496', '#1f3864']);
		anchor.click();
		host.remove();
	});

	it('lists 60 theme swatches and 10 standard ones, and reports the chosen colour', () => {
		const host = document.createElement('div');
		document.body.append(host);
		const anchor = document.createElement('button');
		host.append(anchor);
		const chosen: string[] = [];
		openColorGridPopover(anchor, (value) => chosen.push(value), { noneLabel: 'No Color' });
		expect(grid().querySelectorAll('[data-source="theme"]')).toHaveLength(60);
		expect(grid().querySelectorAll('[data-source="standard"]')).toHaveLength(10);
		grid().querySelector<HTMLButtonElement>('[aria-label="Purple"]')!.click();
		expect(chosen).toEqual(['#7030a0']);
		expect(document.querySelector('.color-grid')).toBeNull();
		openColorGridPopover(anchor, (value) => chosen.push(value), { noneLabel: 'No Color' });
		grid().querySelector<HTMLButtonElement>('[data-command="none"]')!.click();
		expect(chosen.at(-1)).toBe('none');
		// A variant is named after its column and reports its own colour.
		openColorGridPopover(anchor, (value) => chosen.push(value));
		expect(grid().querySelector('[data-command="none"]')).toBeNull();
		const tint = grid().querySelectorAll<HTMLButtonElement>('[aria-label="Blue, Accent 1"]')[1]!;
		tint.click();
		expect(chosen.at(-1)).toBe('#d9e2f3');
		host.remove();
	});
});
