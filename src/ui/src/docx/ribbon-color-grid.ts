import { defineColorGrid, type OfficeColorPick, type OfficeUiColorGrid } from '../controls';
import { localeOf, translate } from './localization';
import { closeRibbonPopover, mountPopover } from './ribbon-popover';

/** Word's Office theme colours, in Word's column order, with their names. */
const THEME: Array<[string, string]> = [
	['#ffffff', 'White, Background 1'],
	['#000000', 'Black, Text 1'],
	['#e7e6e6', 'Light Gray, Background 2'],
	['#44546a', 'Blue-Gray, Text 2'],
	['#4472c4', 'Blue, Accent 1'],
	['#ed7d31', 'Orange, Accent 2'],
	['#a5a5a5', 'Gray, Accent 3'],
	['#ffc000', 'Gold, Accent 4'],
	['#5b9bd5', 'Blue, Accent 5'],
	['#70ad47', 'Green, Accent 6'],
];
const STANDARD: Array<[string, string]> = [
	['#c00000', 'Dark Red'],
	['#ff0000', 'Red'],
	['#ffc000', 'Orange'],
	['#ffff00', 'Yellow'],
	['#92d050', 'Light Green'],
	['#00b050', 'Green'],
	['#00b0f0', 'Light Blue'],
	['#0070c0', 'Blue'],
	['#002060', 'Dark Blue'],
	['#7030a0', 'Purple'],
];

export interface ColorGridOptions {
	/** Label of the first row's "clear" command, or omitted when the property cannot be cleared. */
	noneLabel?: string;
}

/**
 * Word's colour picker on the shared `office-ui-color-grid`: a no-colour row, Theme Colors (ten
 * columns, each a colour over the five variants Office derives from it), Standard Colors and More
 * Colors (the browser's colour dialog). A choice is reported as `#rrggbb`, or `'none'`.
 */
export function openColorGridPopover(
	anchor: HTMLElement,
	choose: (value: string) => void,
	options: ColorGridOptions = {},
): void {
	const locale = localeOf(anchor);
	const say = (text: string) => translate(locale, text as never);
	defineColorGrid();
	const pop = document.createElement('div');
	pop.className = 'ribbon-popover color-grid';
	const pick = (value: string) => {
		closeRibbonPopover();
		choose(value);
	};
	const grid = document.createElement('office-ui-color-grid') as OfficeUiColorGrid;
	grid.themeColors = THEME.map(([hex]) => hex);
	grid.themeNames = THEME.map(([, name]) => say(name));
	// A variant keeps its column's name, as this picker always named it.
	grid.variantLabel = (column) => column;
	grid.standardColors = STANDARD.map(([hex, name]) => ({ hex, label: say(name) }));
	grid.themeHeading = say('Theme Colors');
	grid.standardHeading = say('Standard Colors');
	grid.moreLabel = say('More Colors…');
	if (options.noneLabel) grid.noneLabel = say(options.noneLabel);
	const input = Object.assign(document.createElement('input'), { type: 'color' });
	input.className = 'color-grid-input';
	input.tabIndex = -1;
	input.addEventListener('change', () => pick(input.value));
	grid.addEventListener('office-color-pick', (event) =>
		pick((event as CustomEvent<OfficeColorPick>).detail.color),
	);
	grid.addEventListener('office-color-more', () => input.click());
	// A press on a swatch must not take the selection from the document.
	pop.addEventListener('mousedown', (event) => event.preventDefault());
	pop.append(grid, input);
	if (!mountPopover(anchor, pop, anchor)) return;
	const box = anchor.getBoundingClientRect();
	pop.style.left = `${Math.max(4, box.left - 120)}px`;
}
