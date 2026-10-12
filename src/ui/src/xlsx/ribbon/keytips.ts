/**
 * KeyTips (Alt or F10): badges over the tabs, then over the chosen tab's commands; typing the
 * letters runs the control. Excel's own keys where this ribbon has the same command, otherwise
 * two letters from the label, never the prefix of another. Ported from docx-viewer's
 * ribbon-keytips.ts and ribbon-behavior.ts.
 */

/** Excel's tab KeyTips, by tab id (File is `F`). */
const TAB_KEYS: Record<string, string> = {
	home: 'H',
	insert: 'N',
	draw: 'JI',
	'page-layout': 'P',
	pageLayout: 'P',
	formulas: 'M',
	data: 'A',
	review: 'R',
	view: 'W',
	help: 'Y',
	'table-design': 'JT',
	tableDesign: 'JT',
	'chart-design': 'JC',
	chartDesign: 'JC',
};

/** Excel's command KeyTips, by the command's English label. */
const COMMAND_KEYS: Record<string, string> = {
	Paste: 'V',
	Cut: 'X',
	Copy: 'C',
	'Format Painter': 'FP',
	Font: 'FF',
	'Font Size': 'FS',
	'Increase Font Size': 'FG',
	'Decrease Font Size': 'FK',
	Bold: '1',
	Italic: '2',
	Underline: '3',
	Borders: 'B',
	'Fill Color': 'H',
	'Font Color': 'FC',
	'Top Align': 'AT',
	'Middle Align': 'AM',
	'Bottom Align': 'AB',
	'Align Left': 'AL',
	Center: 'AC',
	'Align Right': 'AR',
	'Wrap Text': 'W',
	'Merge & Center': 'M',
	'Number Format': 'N',
	'Accounting Number Format': 'AN',
	'Percent Style': 'P',
	'Comma Style': 'K',
	'Increase Decimal': '0',
	'Decrease Decimal': '9',
	'Conditional Formatting': 'L',
	'Format as Table': 'T',
	'Cell Styles': 'J',
	Insert: 'I',
	Delete: 'D',
	Format: 'O',
	AutoSum: 'U',
	Fill: 'FI',
	Clear: 'E',
	'Sort & Filter': 'S',
	'Find & Select': 'FD',
};

import { assignKeyTips, runKeyTips, type KeyTipTarget as Target } from '../../controls';
import { isTabHidden, tabButton, type RibbonElement } from 'ooxml-core/xlsx/ui';

const labelOf = (node: HTMLElement) =>
	node.dataset.labelKey ?? node.getAttribute('aria-label') ?? '';

/** Tips for the visible controls of `panel`. */
export function collectKeyTips(panel: HTMLElement): Target[] {
	const targets: Target[] = [];
	const seen = new Set<HTMLElement>();
	for (const control of panel.querySelectorAll<HTMLElement>(
		'button[data-command]:not([data-launcher]), select[data-command], input[data-command], .ribbon-menu-button, .ribbon-overflow-button',
	)) {
		if (
			seen.has(control) ||
			!control.getClientRects().length ||
			control.closest('[data-xve-hidden]')
		)
			continue;
		seen.add(control);
		const activate = () => {
			if (control instanceof HTMLSelectElement || control instanceof HTMLInputElement) {
				control.focus();
				try {
					if (control instanceof HTMLSelectElement) control.showPicker?.();
				} catch {
					// showPicker needs a user gesture in some browsers; focus is enough then.
				}
			} else control.click();
		};
		targets.push({ key: COMMAND_KEYS[labelOf(control)] ?? '', element: control, activate });
	}
	assignKeyTips(targets, (target) => target.element.getAttribute('aria-label') ?? '');
	return targets;
}

const runTips = (root: HTMLElement, targets: Target[], onDone: () => void) =>
	// Fixed badges sit in the light DOM, so the tabs inside the ribbon's shadow root need no styles.
	runKeyTips(root, targets, onDone, 'xve-keytip xve-keytip-command');

let active: (() => void) | undefined;

/** Level one: tab badges; picking a tab opens it and shows its command badges (level two). */
export function showTabKeyTips(root: HTMLElement, select: (id: string) => void): void {
	active?.();
	const file = (root as RibbonElement).fileButton();
	const targets: Target[] = file ? [{ key: 'F', element: file, activate: () => file.click() }] : [];
	for (const panel of [...root.children].filter((node): node is HTMLElement =>
		node.classList.contains('ribbon-panel'),
	)) {
		const id = panel.dataset.tab ?? '';
		const tab = tabButton(root, id);
		if (!tab || isTabHidden(panel)) continue;
		const used = targets.map((target) => target.key);
		let key = TAB_KEYS[id] ?? '';
		if (!key || used.includes(key))
			key =
				[...(tab.textContent ?? id).toUpperCase().replace(/[^A-Z]/g, '')].find(
					(ch) => !used.includes(ch),
				) ?? `Z${used.length}`;
		targets.push({
			key,
			element: tab,
			activate: () => {
				select(id);
				tab.focus();
				active = runTips(root, collectKeyTips(panel), () => (active = undefined));
			},
		});
	}
	active = runTips(root, targets, () => (active = undefined));
}

export function hideKeyTips(): void {
	active?.();
}
