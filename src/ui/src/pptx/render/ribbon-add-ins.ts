/**
 * Ribbon add-in tabs for the PowerPoint ribbon: tabs a host adds after Help, as an Office add-in
 * does. The descriptor is the shared one (`ooxml-core/ribbon`), so the tab a host wrote for Word,
 * Excel or Visio works here unchanged. Every binding draws its own tab row, so this module holds
 * what they all need: which tabs show, which one is active, the view the shared
 * `pptx-ui-ribbon-add-in` element paints, and how a command runs.
 */
import {
	acceptedRibbonAddIns,
	findRibbonAddInCommand,
	RIBBON_ADD_IN_EVENT,
	type RibbonAddInCommand,
	type RibbonAddInCommandDetail,
	type RibbonAddInTab,
} from 'ooxml-core/ribbon';

import { RIBBON_CONTEXTUAL_TABS, TOOLBAR_TABS } from './toolbar-actions';

export {
	RIBBON_ADD_IN_EVENT,
	type RibbonAddInCommand,
	type RibbonAddInCommandDetail,
	type RibbonAddInGroup,
	type RibbonAddInTab,
} from 'ooxml-core/ribbon';

/** Marks an add-in tab's button in a binding's tab row; the value is the tab id. */
export const RIBBON_ADD_IN_TAB_ATTR = 'data-ribbon-add-in-tab';

/** Tab ids the PowerPoint ribbon uses itself, which an add-in tab can never take. */
export const RIBBON_RESERVED_TAB_IDS: readonly string[] = [
	...TOOLBAR_TABS.map((tab) => tab.id),
	...RIBBON_CONTEXTUAL_TABS.map((tab) => tab.id),
	// Sections some bindings show as part of Home.
	'text',
	'arrange',
];

/** The add-in tabs the ribbon shows, in order (no empty, repeated or built-in id). */
export function visibleRibbonAddIns(
	tabs: readonly RibbonAddInTab[] | null | undefined,
): RibbonAddInTab[] {
	return acceptedRibbonAddIns(tabs, RIBBON_RESERVED_TAB_IDS);
}

/** The visible add-in tab with this id, if any. */
export function findRibbonAddIn(
	id: string | null | undefined,
	tabs: readonly RibbonAddInTab[] | null | undefined,
): RibbonAddInTab | undefined {
	return id ? visibleRibbonAddIns(tabs).find((tab) => tab.id === id) : undefined;
}

/**
 * The tab to show: `active` unless it is an add-in tab the host has since removed, in which case
 * the ribbon falls back (to Home), as it does for a contextual tab whose selection went away.
 * `known` are the ids the binding already understands (its fixed and contextual tabs).
 */
export function resolveActiveRibbonAddIn<T extends string>(
	active: string,
	tabs: readonly RibbonAddInTab[] | null | undefined,
	known: (id: string) => boolean,
	fallback: T,
): string | T {
	if (known(active)) return active;
	return findRibbonAddIn(active, tabs) ? active : fallback;
}

/** One command as the keyed ribbon section draws it. */
export interface RibbonAddInCommandView {
	id: string;
	label: string;
	title: string;
	icon: string;
	disabled: boolean;
	compact?: boolean;
	column?: number;
}
export interface RibbonAddInGroupView {
	id: string;
	label: string;
	commands: RibbonAddInCommandView[];
}

const SMALL_ROWS = 3;

/** The id a command carries in the ribbon markup: namespaced, so it never meets a built-in id. */
export function ribbonAddInControlId(tab: string, command: string): string {
	return `add-in.${tab}.${command}`;
}

/**
 * The groups of an add-in tab for `pptx-ui-ribbon-section`. Large commands stand alone; small
 * ones fill columns of three. The PowerPoint ribbon section has no drop-down, so a command with
 * `items` is drawn as its items, as small commands, each titled with the parent's label.
 */
export function ribbonAddInGroupViews(tab: RibbonAddInTab): RibbonAddInGroupView[] {
	return tab.groups.map((group, index) => {
		const commands: RibbonAddInCommandView[] = [];
		let column = 0;
		let rows = SMALL_ROWS;
		const small = (command: RibbonAddInCommand, parent?: RibbonAddInCommand): void => {
			if (rows >= SMALL_ROWS) {
				column += 1;
				rows = 0;
			}
			rows += 1;
			commands.push({ ...view(tab, command, parent), compact: true, column });
		};
		for (const command of group.commands) {
			if (command.items?.length) {
				for (const item of command.items) small(item, command);
			} else if (command.size === 'small') {
				small(command);
			} else {
				rows = SMALL_ROWS;
				commands.push(view(tab, command));
			}
		}
		return { id: `add-in.${tab.id}.group-${index}`, label: group.label, commands };
	});
}

function view(
	tab: RibbonAddInTab,
	command: RibbonAddInCommand,
	parent?: RibbonAddInCommand,
): RibbonAddInCommandView {
	return {
		id: ribbonAddInControlId(tab.id, command.id),
		label: command.label,
		title: command.title ?? (parent ? `${parent.label}: ${command.label}` : command.label),
		icon: command.icon ?? parent?.icon ?? '',
		disabled: command.disabled === true || parent?.disabled === true,
	};
}

/**
 * Runs the add-in command behind a control id from the ribbon markup: calls its `run` callback
 * and dispatches the bubbling, composed `office-ribbon-add-in` event from `target`. Returns false
 * for an unknown or disabled command, which does nothing.
 */
export function runRibbonAddInCommand(
	target: EventTarget,
	tab: RibbonAddInTab,
	controlId: string,
): boolean {
	const prefix = ribbonAddInControlId(tab.id, '');
	if (!controlId.startsWith(prefix)) return false;
	const id = controlId.slice(prefix.length);
	const command = findRibbonAddInCommand(tab, id);
	// A drop-down is drawn as its items; the parent itself is not a command here.
	if (!command || command.items?.length) return false;
	if (parentOf(tab, id)?.disabled) return false;
	command.run?.();
	target.dispatchEvent(
		new CustomEvent<RibbonAddInCommandDetail>(RIBBON_ADD_IN_EVENT, {
			detail: { tab: tab.id, command: id },
			bubbles: true,
			composed: true,
		}),
	);
	return true;
}

function parentOf(tab: RibbonAddInTab, id: string): RibbonAddInCommand | undefined {
	for (const group of tab.groups)
		for (const command of group.commands)
			if (command.items?.some((item) => item.id === id)) return command;
	return undefined;
}
