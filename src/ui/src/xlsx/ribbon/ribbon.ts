/**
 * The ribbon renderer: the registered tabs (contextual ones only while their test passes), one panel per
 * tab with labelled groups and dialog launchers, KeyTips, hidden actions and overflow folding. The tab
 * row, File button, collapse and peek belong to the shared `office-ui-ribbon`. Structure and look follow docx-viewer's ribbon.ts.
 */
import { syncRibbonAddIns, type RibbonAddInTab } from '../../ribbon/add-in-tabs';
import type { EditorContext } from 'ooxml-core/xlsx/ui';
import { defineRibbon } from '../../controls';
import { commandButton, el, renderControl, type RenderScope } from './controls';
import { ribbonIcon } from './icons';
import { attachRibbonOverflow, refitRibbon } from './overflow';
import {
	onRibbonTabsChange,
	ribbonTabs,
	type RibbonControl,
	type RibbonGroup,
	type RibbonTab,
} from 'ooxml-core/xlsx/ui';
import { closeRibbonPopover } from './popover';
import { showTabKeyTips } from './keytips';
import { isTabHidden, selectTab, setTabHidden, type RibbonElement } from 'ooxml-core/xlsx/ui';
import { applyRibbonVisibility } from './visibility';

export interface RibbonHandlers {
	openBackstage(): void;
	isHidden(id: string): boolean;
}

export interface Ribbon {
	readonly element: HTMLElement;
	/** Re-reads every control state (enabled, pressed, values) and the contextual tabs. */
	refresh(): void;
	/** Rebuilds all tabs (after a locale change or newly registered tabs). */
	rebuild(): void;
	selectTab(id: string): void;
	/** Tabs a host adds after Excel's own (`ribbonAddIns` of the editor). */
	setAddIns(tabs: readonly RibbonAddInTab[]): void;
	activeTab(): string | undefined;
	/** Alt / F10: focus the selected tab and show the tab KeyTips. */
	showKeyTips(): void;
	focus(): void;
	destroy(): void;
}

const isSmall = (control: RibbonControl): boolean =>
	control.kind === 'button' ||
	control.kind === 'toggle' ||
	control.kind === 'split' ||
	control.kind === 'menu'
		? control.size !== 'large'
		: control.kind === 'color' || control.kind === 'select';

/**
 * Lays out a run of small controls the way Excel's groups look: separators break rows (Font,
 * Alignment), a leading drop-down gets a row of its own (Number), anything else fills columns of
 * three (Clipboard's Cut/Copy/Format Painter, Editing's AutoSum/Fill/Clear).
 */
function layoutSmall(scope: RenderScope, run: RibbonControl[]): HTMLElement[] {
	const { doc } = scope;
	const render = (controls: RibbonControl[]) => {
		const box = el(doc, 'div', 'ribbon-stack');
		for (const control of controls) {
			const node = renderControl(scope, control, true);
			if (node) box.append(node);
		}
		return box;
	};
	let lines: RibbonControl[][] | undefined;
	if (run.some((control) => control.kind === 'separator')) {
		lines = [[]];
		for (const control of run)
			if (control.kind === 'separator') lines.push([]);
			else lines[lines.length - 1]!.push(control);
	} else if (run[0]?.kind === 'select' && run.some((control) => control.kind !== 'select')) {
		const lead = run.findIndex((control) => control.kind !== 'select');
		lines = [run.slice(0, lead), run.slice(lead)];
	}
	if (lines) {
		const column = el(doc, 'div', 'ribbon-stack');
		for (const line of lines.filter((items) => items.length)) {
			const row = render(line);
			if (row.childElementCount) column.append(row);
		}
		return column.childElementCount ? [column] : [];
	}
	const columns: HTMLElement[] = [];
	for (let at = 0; at < run.length; at += 3) {
		const box = render(run.slice(at, at + 3));
		if (box.childElementCount) columns.push(box);
	}
	return columns;
}

function renderGroup(scope: RenderScope, group: RibbonGroup): HTMLElement | null {
	const { ctx, doc } = scope;
	const node = el(doc, 'div', 'ribbon-group');
	const caption = ctx.t(group.label);
	node.dataset.group = group.id;
	node.dataset.label = group.label;
	node.dataset.caption = caption;
	node.setAttribute('role', 'group');
	node.setAttribute('aria-label', caption);
	let run: RibbonControl[] = [];
	const flush = () => {
		node.append(...layoutSmall(scope, run));
		run = [];
	};
	for (const control of group.controls) {
		if (isSmall(control) || control.kind === 'separator') {
			run.push(control);
			continue;
		}
		flush();
		const rendered = renderControl(scope, control, false);
		if (rendered) node.append(rendered);
	}
	flush();
	const launcher = group.launcher ? ctx.commands.get(group.launcher) : undefined;
	if (launcher) {
		const button = commandButton(scope, launcher, { size: 'small' });
		button.className = 'ribbon-launcher';
		button.replaceChildren(ribbonIcon(doc, 'launcher', 10));
		button.dataset.launcher = '';
		node.append(button);
	}
	return node.childElementCount ? node : null;
}

export function createRibbon(ctx: EditorContext, handlers: RibbonHandlers): Ribbon {
	defineRibbon();
	const doc = ctx.host.ownerDocument;
	const root = doc.createElement('office-ui-ribbon') as RibbonElement;
	root.className = 'xve-ribbon';
	root.setAttribute('part', 'ribbon');
	root.setAttribute('role', 'toolbar');
	root.setAttribute('file-expanded', 'false');
	root.toggleAttribute('collapsible', true);
	let scope: RenderScope = { ctx, doc, updates: [], isHidden: handlers.isHidden };
	let tabs: RibbonTab[] = [];
	let stopOverflow = () => {};
	let addIns: readonly RibbonAddInTab[] = [];
	const syncAddIns = () => syncRibbonAddIns(root, addIns, { panelClass: 'ribbon-panel' });

	const panels = () => [
		...[...root.children].filter((node): node is HTMLElement =>
			node.classList.contains('ribbon-panel'),
		),
	];
	const panelFor = (id: string) => panels().find((panel) => panel.dataset.tab === id);

	const select = (id: string) => {
		const panel = panelFor(id);
		if (panel && !isTabHidden(panel)) selectTab(root, id);
	};

	// The shared ribbon announces a tab change before it applies it: fold the new panel once it shows.
	const refit = () => void root.updateComplete.then(() => refitRibbon(root));
	root.addEventListener('office-ribbon-select', () => {
		closeRibbonPopover();
		refit();
	});
	root.addEventListener('office-ribbon-collapse', refit);
	root.addEventListener('office-ribbon-file', () => handlers.openBackstage());

	const build = () => {
		stopOverflow();
		closeRibbonPopover();
		scope = { ctx, doc, updates: [], isHidden: handlers.isHidden };
		tabs = [...ribbonTabs()];
		root.setAttribute('aria-label', ctx.t('Ribbon'));
		root.setAttribute('label', ctx.t('Ribbon tabs'));
		root.setAttribute('file-label', ctx.t('File'));
		root.setAttribute('collapse-label', ctx.t('Collapse the ribbon'));
		for (const panel of panels()) panel.remove();
		for (const tab of tabs) {
			const panel = el(doc, 'div', 'ribbon-panel');
			panel.id = `xve-panel-${tab.id}`;
			panel.dataset.tab = tab.id;
			panel.dataset.ribbonTab = tab.id;
			panel.dataset.label = ctx.t(tab.label);
			if (tab.contextual) panel.dataset.contextual = '';
			for (const group of tab.groups) {
				const node = renderGroup(scope, group);
				if (node) panel.append(node);
			}
			root.append(panel);
		}
		syncAddIns();
		refresh();
		stopOverflow = attachRibbonOverflow(root);
	};

	const refresh = () => {
		for (const update of scope.updates) update();
		for (const tab of tabs) {
			let show = true;
			try {
				show = tab.contextual ? tab.contextual(ctx) : true;
			} catch {
				show = false;
			}
			setTabHidden(root, tab.id, 'contextual', !show);
		}
		applyRibbonVisibility(root, handlers.isHidden);
	};

	const stopListening = onRibbonTabsChange(() => build());
	build();
	return {
		element: root,
		refresh,
		rebuild: build,
		selectTab: select,
		setAddIns: (next) => {
			addIns = next;
			const before = root.querySelector('[data-add-in]');
			syncAddIns();
			// Equal tabs keep their panels; only new panels need the overflow measured again.
			if (root.querySelector('[data-add-in]') === before) return;
			stopOverflow();
			stopOverflow = attachRibbonOverflow(root);
		},
		activeTab: () => root.selected || undefined,
		showKeyTips: () => {
			root.focusTab();
			showTabKeyTips(root, select);
		},
		focus: () => root.focusTab(),
		destroy: () => {
			stopListening();
			stopOverflow();
			closeRibbonPopover();
		},
	};
}
