/**
 * Applies `hiddenActions` (command ids) to the rendered ribbon: hidden controls disappear, and so
 * do menus whose every command is hidden, groups and tabs left empty.
 */
import { setTabHidden } from 'ooxml-core/xlsx/ui';

const HIDDEN = 'data-xve-hidden';
const CONTROLS = '[data-command], .ribbon-menu-button';

export function applyRibbonVisibility(root: HTMLElement, isHidden: (id: string) => boolean): void {
	for (const control of root.querySelectorAll<HTMLElement>(`.ribbon-panel ${CONTROLS}`)) {
		const id = control.dataset.command;
		const menu = control.dataset.menuCommands?.split(' ').filter(Boolean);
		const hide = id ? isHidden(id) : Boolean(menu?.length && menu.every(isHidden));
		control.toggleAttribute(HIDDEN, hide);
		const holder = control.closest<HTMLElement>('.ribbon-split, .ribbon-combo');
		if (holder && holder.querySelector('[data-command]') === control)
			holder.toggleAttribute(HIDDEN, hide);
	}
	const empty = (node: Element) => {
		const controls = [...node.querySelectorAll<HTMLElement>(CONTROLS)].filter(
			(control) => !control.hasAttribute('data-launcher'),
		);
		return controls.length > 0 && controls.every((control) => control.closest(`[${HIDDEN}]`));
	};
	for (const stack of root.querySelectorAll('.ribbon-stack'))
		stack.toggleAttribute(HIDDEN, empty(stack));
	for (const group of root.querySelectorAll('.ribbon-group'))
		group.toggleAttribute(HIDDEN, empty(group));
	for (const panel of [...root.children].filter((node): node is HTMLElement =>
		node.classList.contains('ribbon-panel'),
	))
		setTabHidden(root, panel.dataset.tab ?? '', 'custom', empty(panel));
}
