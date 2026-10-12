// Builds the tab buttons for the visible sheets (hidden and very hidden sheets are left out).
import { resolveColor, type Workbook } from 'ooxml-core/xlsx';
import { h } from '../grid/dom';

/** Indices of the sheets that get a tab. */
export const visibleSheetIndices = (workbook: Workbook): number[] =>
	workbook.sheets.flatMap((sheet, index) => (sheet.state === 'visible' ? [index] : []));

export interface TabRenderOptions {
	workbook: Workbook;
	active: number;
	/** Sheet index of the tab that takes part in the tab order (roving tabindex). */
	focusable: number;
}

/** Replaces the strip's tabs; the insertion marker and rename input are re-added by callers. */
export function renderTabs(doc: Document, strip: HTMLElement, options: TabRenderOptions): void {
	const { workbook, active, focusable } = options;
	// Existing tab nodes are reused (a double-click must land on the node its first click hit).
	const previous = new Map<string, HTMLElement>();
	for (const node of [...strip.children].filter((node): node is HTMLElement =>
		node.classList.contains('xst-tab'),
	))
		if (node.dataset.sheet !== undefined) previous.set(node.dataset.sheet, node);
	const tabs = visibleSheetIndices(workbook).map((index) => {
		const sheet = workbook.sheets[index]!;
		const isActive = index === active;
		const tab =
			previous.get(String(index)) ?? h(doc, 'button', 'xst-tab', { type: 'button', role: 'tab' });
		tab.className = 'xst-tab';
		tab.removeAttribute('style');
		tab.setAttribute('aria-selected', String(isActive));
		tab.setAttribute('tabindex', index === focusable ? '0' : '-1');
		tab.dataset.sheet = String(index);
		tab.classList.toggle('xst-active', isActive);
		const color = resolveColor(sheet.tabColor, workbook.theme);
		if (color) {
			tab.classList.add('xst-colored');
			tab.style.setProperty('--xst-color', color);
		}
		const label =
			([...tab.children].find((node) => node.classList.contains('xst-label')) as
				| HTMLElement
				| undefined) ?? h(doc, 'span', 'xst-label');
		if (label.textContent !== sheet.name) label.textContent = sheet.name;
		tab.title = sheet.name;
		if (label.parentNode !== tab) tab.prepend(label);
		return tab;
	});
	if (tabs.some((tab, i) => strip.children[i] !== tab) || strip.children.length !== tabs.length)
		strip.replaceChildren(...tabs);
}

/** The tab element of a sheet. */
export const tabFor = (strip: HTMLElement, sheet: number): HTMLElement | null =>
	strip.querySelector<HTMLElement>(`.xst-tab[data-sheet="${sheet}"]`);

/** Sheet index of a tab element (or of the tab containing a node). */
export function sheetOf(node: EventTarget | null): number | undefined {
	const tab = (node as Element | null)?.closest?.('.xst-tab') as HTMLElement | null | undefined;
	const value = tab?.dataset.sheet;
	return value === undefined ? undefined : Number(value);
}
