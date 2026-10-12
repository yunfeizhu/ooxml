/**
 * Ribbon add-in tabs: tabs a host application adds after a product's own, as an Office add-in
 * does (the ACROBAT tab in Visio and Excel). The descriptor is plain data, so one tab works in
 * every editor and every framework binding; the DOM that renders it lives in `ooxml-ui`
 * (`syncRibbonAddIns`) and in the PowerPoint ribbon descriptors.
 */

/** One command of an add-in group. With `items` it is a drop-down of those commands. */
export interface RibbonAddInCommand {
	/** Unique within the tab; reported in the event detail. */
	id: string;
	label: string;
	/** A name from the shared icon set (`registerIcon` of `ooxml-ui` adds the host's own). */
	icon?: string;
	/** `large` (the default) stacks the icon over the label; `small` commands fill columns of three. */
	size?: 'large' | 'small';
	/** Tooltip; the label when omitted. */
	title?: string;
	disabled?: boolean;
	items?: readonly RibbonAddInCommand[];
	run?: () => void;
}

export interface RibbonAddInGroup {
	label: string;
	commands: readonly RibbonAddInCommand[];
}

export interface RibbonAddInTab {
	/** Unique among the add-in tabs and different from the product's tab ids (`home`, `insert`...). */
	id: string;
	label: string;
	/** Key tip of the tab, for products that show key tips. */
	keytip?: string;
	groups: readonly RibbonAddInGroup[];
}

/** Name of the DOM event an editor dispatches when an add-in command is chosen. */
export const RIBBON_ADD_IN_EVENT = 'office-ribbon-add-in';

/** Detail of the `office-ribbon-add-in` event: the tab and the command that was chosen. */
export interface RibbonAddInCommandDetail {
	tab: string;
	command: string;
}

/**
 * The tabs a ribbon may show, in order: a tab whose id is empty, repeated or one of `reserved`
 * (the product's own tab ids) is left out, so an add-in can never replace a built-in tab.
 */
export function acceptedRibbonAddIns(
	tabs: readonly RibbonAddInTab[] | null | undefined,
	reserved: Iterable<string> = [],
): RibbonAddInTab[] {
	const taken = new Set(reserved);
	const accepted: RibbonAddInTab[] = [];
	for (const tab of tabs ?? []) {
		if (!tab || typeof tab.id !== 'string' || !tab.id || taken.has(tab.id)) continue;
		taken.add(tab.id);
		accepted.push(tab);
	}
	return accepted;
}

/** Every command of a tab, drop-down items included, in document order. */
export function ribbonAddInCommands(tab: RibbonAddInTab): RibbonAddInCommand[] {
	const flatten = (commands: readonly RibbonAddInCommand[]): RibbonAddInCommand[] =>
		commands.flatMap((command) => [command, ...flatten(command.items ?? [])]);
	return flatten(tab.groups.flatMap((group) => group.commands));
}

/**
 * The enabled command `id` of the tab, or undefined when it is unknown or disabled. Renderers
 * call this before running a command, so a disabled command never runs however it was reached.
 */
export function findRibbonAddInCommand(
	tab: RibbonAddInTab,
	id: string | undefined,
): RibbonAddInCommand | undefined {
	if (id === undefined) return undefined;
	const command = ribbonAddInCommands(tab).find((candidate) => candidate.id === id);
	return command && !command.disabled ? command : undefined;
}
