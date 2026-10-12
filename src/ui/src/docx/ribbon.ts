import { defineRibbon } from '../controls';
import { shortcutHint } from './binding-labels';
import { emit } from './events';
import { setComboValue, type ComboInput } from './ribbon-combo';
import {
	localizeElement,
	normalizeEditorLocale,
	translate,
	type LocalizationKey,
} from './localization';
import type { RibbonAction } from './ribbon-action';
import { buildHomePanel } from './ribbon-home';
import { attachRibbonBehavior } from './ribbon-behavior';
import { attachRibbonOverflow, refitRibbon } from './ribbon-overflow';
import { buildOtherPanels } from './ribbon-tabs';
import { buildHeaderFooterPanel } from './header-footer-ribbon';
import { panelsOf, setTabHidden } from './ribbon-tab-api';

export type { RibbonAction } from './ribbon-action';

export function createRibbon(locale: string = 'en'): HTMLElement {
	defineRibbon();
	const root = document.createElement('office-ui-ribbon');
	root.className = 'dve-ribbon';
	root.setAttribute('role', 'toolbar');
	root.setAttribute('aria-label', 'Document formatting');
	root.setAttribute('label', 'Ribbon tabs');
	root.setAttribute('file-label', 'File');
	root.setAttribute('file-expanded', 'false');
	root.setAttribute('collapse-label', 'Collapse the ribbon');
	const panels = new Map<string, HTMLElement>();
	for (const name of [
		'Home',
		'Insert',
		'Layout',
		'References',
		'Review',
		'View',
		'Table',
		'Header & Footer',
	]) {
		const key = name === 'Header & Footer' ? 'header-footer' : name.toLowerCase();
		const panel = document.createElement('div');
		panel.className = 'ribbon-panel';
		panel.dataset.ribbonTab = key;
		panel.dataset.label = name;
		panel.dataset.panel = name;
		panel.id = `dve-panel-${key}`;
		panel.tabIndex = 0;
		if (name === 'Table' || name === 'Header & Footer') panel.dataset.contextual = '';
		panels.set(name, panel);
	}
	buildHomePanel(panels);
	buildOtherPanels(panels);
	buildHeaderFooterPanel(panels.get('Header & Footer')!);
	for (const panel of panels.values()) root.append(panel);
	// Table tools are contextual: the tab appears only while the selection is in a table.
	for (const key of ['table', 'header-footer']) setTabHidden(root, key, 'contextual', true);
	setComboValue(root.querySelector<ComboInput>('[aria-label="Font family"]')!, 'Calibri');
	setComboValue(root.querySelector<ComboInput>('[aria-label="Font size"]')!, '11');
	root.querySelector<HTMLSelectElement>('[aria-label="Zoom"]')!.value = '100';
	root.querySelector<HTMLSelectElement>('[aria-label="Layout view"]')!.value = 'draft';
	attachRibbonBehavior(root);
	attachRibbonOverflow(root);
	root.addEventListener('click', (event) => {
		const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
		if (!target) return;
		emit(target, 'ribbon-action', JSON.parse(target.dataset.action!) as RibbonAction);
	});
	for (const type of ['pointerover', 'focusin', 'change'])
		root.addEventListener(type, (event) => {
			if (event.target instanceof HTMLSelectElement) syncSelectTitles(event.target.parentElement!);
		});
	setRibbonLocale(root, locale);
	return root;
}

/** Gives every select the tooltip of its selected label so an ellipsized value stays readable. */
export function syncSelectTitles(root: ParentNode): void {
	for (const select of root.querySelectorAll('select')) {
		const text = select.selectedOptions[0]?.textContent?.trim() ?? '';
		if (text && select.title !== text) select.title = text;
	}
}

/** Gives every text button its full label as a tooltip, for when a narrow slot truncates it. */
function syncButtonTitles(root: ParentNode): void {
	for (const button of root.querySelectorAll('button')) {
		const label = button.getAttribute('aria-label');
		if (!label) continue;
		const hint = shortcutHint(button.dataset.localearialabel ?? label);
		const title = hint ? `${label} (${hint})` : label;
		if ((button.textContent?.trim() || hint) && button.title !== title) button.title = title;
	}
}

export function setRibbonLocale(root: HTMLElement, value: string): void {
	const locale = normalizeEditorLocale(value);
	root.dataset.editorLocale = locale;
	localizeElement(root, locale);
	// The tab row is drawn by the shared ribbon from the panels' labels, so translate those.
	// A host's add-in tab keeps the label the host gave it.
	for (const panel of panelsOf(root))
		if (!('addIn' in panel.dataset))
			panel.dataset.label = translate(locale, `tab.${panel.dataset.ribbonTab}` as LocalizationKey);
	root.setAttribute('file-label', translate(locale, 'File'));
	root.setAttribute('collapse-label', translate(locale, 'Collapse the ribbon'));
	syncSelectTitles(root);
	syncButtonTitles(root);
	refitRibbon(root);
}
