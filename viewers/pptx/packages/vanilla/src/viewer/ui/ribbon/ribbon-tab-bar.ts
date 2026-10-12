import type { RibbonAddInTab, RibbonContextualTabId, ToolbarActionId } from 'ooxml-ui/pptx';
import {
	buildTabRowActionsState,
	contextualTabLabelKey,
	filterVisibleTabs,
	isActionHidden,
	RIBBON_ADD_IN_TAB_ATTR,
	RIBBON_CONTEXTUAL_TAB_ATTR,
} from 'ooxml-ui/pptx';

import type { Translator } from '../../i18n';
import { createEl } from '../../render';
import { RIBBON_TABS } from './ribbon-tabs';
import type { RibbonTabId } from './ribbon-types';

export interface RibbonTabBar {
	el: HTMLElement;
	setActive(tab: RibbonTabId | RibbonContextualTabId | string): void;
	/** Show the host's add-in tabs after the fixed tabs and before the contextual ones. */
	setAddInTabs(tabs: readonly RibbonAddInTab[]): void;
	/**
	 * Show the selection's contextual tabs (Shape Format, Picture Format, ...)
	 * after the fixed tabs, PowerPoint-style.
	 */
	setContextualTabs(tabs: readonly RibbonContextualTabId[]): void;
	/** Hide/show tab buttons per Options > Customize Ribbon (File always shown). */
	setHiddenTabs(hidden: ReadonlySet<string>): void;
	/** Set each tab's `title` from a ScreenTip resolver (Options > General). */
	applyScreenTips(resolve: (label: string) => string | undefined): void;
}

/** Right-side quick actions on the tab row (React's `TabRowActions`). */
export interface RibbonTabBarActions {
	/** The red-dot Record button (starts rehearsal/recording). */
	startRecording(): void;
	/** Comments on the shared tab-row element; absent leaves Comments out. */
	openComments?(): void;
}

/**
 * The ribbon's tab strip (File/Home/Insert/.../View), à la React's ribbon tab
 * row. Tabs in `hiddenActions` are never constructed, matching how the ribbon
 * itself skips building content for a hidden tab. The right side carries the
 * Record button, then the shared `pptx-ui-ribbon-actions` (Comments and Share,
 * the element Word and Excel put at the same place). This module owns its
 * Comments; the collaboration UI turns on and drives its Share (see
 * `collab/collab-ui.ts`), which stays hidden until then.
 */
export function createRibbonTabBar(
	doc: Document,
	t: Translator,
	onSelect: (tab: RibbonTabId | RibbonContextualTabId | string) => void,
	hiddenActions?: readonly ToolbarActionId[],
	actions?: RibbonTabBarActions,
): RibbonTabBar {
	const el = createEl(doc, 'div', 'pptxv-ribbon-tabs');
	el.dataset.pptxChrome = 'ribbon-tabs';
	el.setAttribute('role', 'tablist');
	const strip = createEl(doc, 'div');
	strip.dataset.pptxChrome = 'ribbon-tab-scroll';
	el.appendChild(strip);

	const buttons = new Map<RibbonTabId, HTMLButtonElement>();
	const labels = new Map<RibbonTabId, string>();
	for (const tab of filterVisibleTabs(RIBBON_TABS, hiddenActions)) {
		const btn = createEl(doc, 'button', 'pptxv-ribbon-tab');
		if (tab.id === 'file') {
			btn.classList.add('pptxv-ribbon-tab-file');
		}
		btn.type = 'button';
		btn.setAttribute('role', 'tab');
		const label = t(tab.labelKey);
		btn.textContent = label;
		btn.addEventListener('click', () => onSelect(tab.id));
		strip.appendChild(btn);
		buttons.set(tab.id, btn);
		labels.set(tab.id, label);
	}

	const contextualButtons = new Map<RibbonContextualTabId, HTMLButtonElement>();
	let contextualIds: readonly RibbonContextualTabId[] = [];
	const addInButtons = new Map<string, HTMLButtonElement>();
	let activeTab: RibbonTabId | RibbonContextualTabId | string | null = null;
	let trailing: HTMLElement | null = null;
	const reflectActive = (): void => {
		const all: Array<[string, HTMLButtonElement]> = [
			...buttons,
			...addInButtons,
			...contextualButtons,
		];
		for (const [id, btn] of all) {
			const active = id === activeTab;
			btn.classList.toggle('is-active', active);
			btn.setAttribute('aria-selected', String(active));
		}
	};
	const setAddInTabs = (tabs: readonly RibbonAddInTab[]): void => {
		for (const [id, btn] of addInButtons) {
			if (!tabs.some((tab) => tab.id === id)) {
				btn.remove();
				addInButtons.delete(id);
			}
		}
		// Before the contextual tabs (and the trailing spacer), in the host's order.
		const anchor = contextualButtons.values().next().value ?? trailing;
		for (const tab of tabs) {
			let btn = addInButtons.get(tab.id);
			if (!btn) {
				btn = createEl(doc, 'button', 'pptxv-ribbon-tab');
				btn.type = 'button';
				btn.setAttribute('role', 'tab');
				btn.setAttribute(RIBBON_ADD_IN_TAB_ATTR, tab.id);
				btn.addEventListener('click', () => onSelect(tab.id));
				addInButtons.set(tab.id, btn);
			}
			// The host's own label: it is not a translation key.
			btn.textContent = tab.label;
			strip.insertBefore(btn, anchor);
		}
		reflectActive();
	};
	const setContextualTabs = (tabs: readonly RibbonContextualTabId[]): void => {
		if (tabs.length === contextualIds.length && tabs.every((id, i) => contextualIds[i] === id)) {
			return;
		}
		contextualIds = [...tabs];
		for (const btn of contextualButtons.values()) {
			btn.remove();
		}
		contextualButtons.clear();
		for (const id of tabs) {
			const btn = createEl(doc, 'button', 'pptxv-ribbon-tab pptxv-ribbon-tab-contextual');
			btn.type = 'button';
			btn.setAttribute('role', 'tab');
			btn.setAttribute(RIBBON_CONTEXTUAL_TAB_ATTR, id);
			btn.textContent = t(contextualTabLabelKey(id));
			btn.addEventListener('click', () => onSelect(id));
			strip.insertBefore(btn, trailing);
			contextualButtons.set(id, btn);
		}
		reflectActive();
	};

	if (actions) {
		trailing = createEl(doc, 'span', 'pptxv-tabrow-spacer');
		strip.appendChild(trailing);
		const actionsHost = createEl(doc, 'div', 'pptxv-tabrow-actions');
		if (!isActionHidden('record', hiddenActions)) {
			const record = createEl(doc, 'button', 'pptxv-tabrow-record');
			record.type = 'button';
			record.title = t('pptx.titleBar.record');
			record.setAttribute('aria-label', t('pptx.titleBar.record'));
			const dot = createEl(doc, 'span', 'pptxv-tabrow-record-dot');
			dot.setAttribute('aria-hidden', 'true');
			const label = createEl(doc, 'span');
			label.textContent = t('pptx.titleBar.record');
			record.append(dot, label);
			record.addEventListener('click', () => actions.startRecording());
			actionsHost.appendChild(record);
		}
		const tabActions = doc.createElement('pptx-ui-ribbon-actions');
		tabActions.dataset.pptxChrome = 'tab-row-actions';
		const initial = buildTabRowActionsState({
			translate: t,
			showComments: Boolean(actions.openComments),
			commentsOpen: false,
			showShare: false,
			isCollaborating: false,
		});
		Object.assign(tabActions, initial);
		const openComments = actions.openComments;
		if (openComments) {
			tabActions.addEventListener('comments-toggle', () => openComments());
		}
		actionsHost.appendChild(tabActions);
		el.appendChild(actionsHost);
	}

	return {
		el,
		setActive(tab) {
			activeTab = tab;
			reflectActive();
		},
		setAddInTabs,
		setContextualTabs,
		setHiddenTabs(hidden) {
			for (const [id, btn] of buttons) {
				btn.hidden = id !== 'file' && hidden.has(id);
			}
		},
		applyScreenTips(resolve) {
			for (const [id, btn] of buttons) {
				const tip = resolve(labels.get(id) ?? '');
				if (tip) {
					btn.title = tip;
				} else {
					btn.removeAttribute('title');
				}
			}
		},
	};
}
