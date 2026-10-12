import { emitRibbonAction, type VisioRibbonAction } from './ribbon-action';

/** A shared `office-ui-*` command element with Visio state hooks. */
export type RibbonCommand = HTMLElement & { disabled: boolean };

/**
 * One ribbon command. `id` is a stable name for state sync and tests; the typed `action` is
 * what runs. Without an action the command is shown, disabled, with `unsupported` explaining
 * what is missing, so the ribbon matches Visio without claiming features it lacks.
 */
export interface CommandSpec {
	id: string;
	label: string;
	icon?: string;
	action?: VisioRibbonAction;
	unsupported?: string;
	/** `large` stacks icon over label; `small` is icon and label in a row; `icon` is icon-only. */
	size?: 'large' | 'small' | 'icon';
	keys?: [aria: string, hint: string];
	pressed?: boolean;
	controls?: string;
	checked?: boolean;
	items?: readonly CommandSpec[];
}
export interface MenuSpec extends CommandSpec {
	items: readonly CommandSpec[];
	/** Split button: the main part runs `action`, the caret opens the menu. */
	split?: boolean;
}

const title = (spec: CommandSpec) =>
	spec.action
		? spec.keys
			? `${spec.label} (${spec.keys[1]})`
			: spec.label
		: `${spec.label}: not available yet. ${spec.unsupported ?? 'Needs core support.'}`;

function decorate(el: HTMLElement, spec: CommandSpec, includeLabel = true): void {
	el.setAttribute('command', spec.id);
	if (includeLabel) el.setAttribute('label', spec.label);
	if (spec.icon) el.setAttribute('icon', spec.icon);
	el.setAttribute('title', title(spec));
	if (spec.keys) el.setAttribute('keyshortcuts', spec.keys[0]);
	if (spec.pressed !== undefined) el.setAttribute('pressed', String(spec.pressed));
	if (spec.controls) el.setAttribute('aria-controls', spec.controls);
	if (spec.checked !== undefined) el.setAttribute('checked', String(spec.checked));
	if (!spec.action) {
		el.setAttribute('disabled', '');
		el.dataset.unsupported = '';
	}
}

/** A shared `office-ui-button` in Visio's large, small or icon-only size. */
export function command(doc: Document, spec: CommandSpec): RibbonCommand {
	const el = doc.createElement('office-ui-button') as RibbonCommand;
	decorate(el, spec);
	if (spec.size !== 'small' && spec.size !== 'icon') el.setAttribute('variant', 'stacked');
	if (spec.size === 'icon') el.setAttribute('icon-only', '');
	el.dataset.size = spec.size ?? 'large';
	el.addEventListener('office-command', (event) => {
		event.stopPropagation();
		if (spec.action && !el.disabled) emitRibbonAction(el, spec.action);
	});
	return el;
}

/** A shared `office-ui-menu-button` (dropdown or split) with typed actions per item. */
export function menu(doc: Document, spec: MenuSpec, submenu = false): RibbonCommand {
	const el = doc.createElement('office-ui-menu-button') as RibbonCommand;
	const actions = new Map<string, VisioRibbonAction | undefined>();
	const { action: _main, ...dropdown } = spec;
	// A dropdown whose items are all unsupported explains itself with their shared reason.
	const reason = spec.unsupported ?? spec.items.find((item) => item.unsupported)?.unsupported;
	decorate(el, spec.split ? spec : { ...dropdown, ...(reason ? { unsupported: reason } : {}) });
	// The split command and its menu can have independent availability.
	const usable = (item: CommandSpec): boolean => !!item.action || !!item.items?.some(usable);
	if (spec.split && !spec.action) el.setAttribute('main-disabled', '');
	if ((spec.split && spec.action) || spec.items.some(usable)) {
		el.removeAttribute('disabled');
		delete el.dataset.unsupported;
		if (!spec.split || spec.action) el.setAttribute('title', spec.label);
	}
	if (!spec.split) el.removeAttribute('command');
	if (spec.size !== 'small' && spec.size !== 'icon') el.setAttribute('variant', 'stacked');
	if (spec.size === 'icon') el.setAttribute('icon-only', '');
	el.dataset.size = spec.size ?? 'large';
	el.dataset.menu = spec.id;
	if (submenu) {
		el.setAttribute('submenu', '');
		el.removeAttribute('variant');
	}
	if (spec.split) actions.set(spec.id, spec.action);
	const collect = (item: CommandSpec) => {
		actions.set(item.id, item.action);
		item.items?.forEach(collect);
	};
	for (const item of spec.items) {
		const entry = item.items
			? menu(doc, { ...item, items: item.items }, true)
			: doc.createElement('office-ui-menu-item');
		if (!item.items) decorate(entry, item);
		collect(item);
		el.append(entry);
	}
	if (!submenu)
		el.addEventListener('office-command', (event) => {
			event.stopPropagation();
			const action = actions.get((event as CustomEvent<{ command: string }>).detail.command);
			const id = (event as CustomEvent<{ command: string }>).detail.command;
			const target = [...el.querySelectorAll<RibbonCommand>('[command]')].find(
				(item) => item.getAttribute('command') === id,
			);
			if (action && !el.disabled && !target?.disabled) emitRibbonAction(el, action);
		});
	return el;
}

/** Office's three-row column of small commands, or a row with `horizontal`. */
export function stack(doc: Document, children: readonly HTMLElement[], horizontal = false) {
	const el = doc.createElement('office-ui-ribbon-stack');
	if (horizontal) el.setAttribute('orientation', 'horizontal');
	el.append(...children);
	return el;
}

/** A labelled ribbon group; `launcher` shows Visio's dialog launcher, disabled with a reason. */
export function group(
	doc: Document,
	label: string,
	children: readonly HTMLElement[],
	options: { className?: string; launcher?: string; dialog?: string } = {},
): HTMLElement {
	const el = doc.createElement('office-ui-ribbon-group');
	el.setAttribute('label', label);
	if (options.className) el.className = options.className;
	if (options.dialog) {
		// An available launcher emits office-command `<label>-dialog`; its owner syncs availability.
		el.setAttribute('launcher', `${label.toLowerCase().replace(/\W+/g, '-')}-dialog`);
		el.setAttribute('launcher-label', options.dialog);
		el.title = options.dialog;
	} else if (options.launcher) {
		el.setAttribute('launcher', `${label.toLowerCase().replace(/\W+/g, '-')}-dialog`);
		el.setAttribute('launcher-disabled', '');
		el.title = `${label} options: not available yet. ${options.launcher}`;
	}
	el.append(...children);
	return el;
}

/** A labelled shared checkbox (Visio's View > Show options). */
export function check(doc: Document, spec: CommandSpec): HTMLElement {
	// Not a <label>: label activation re-clicks a nested form-associated control in some DOMs.
	const label = doc.createElement('span');
	label.className = 'ribbon-check';
	label.title = title(spec);
	const box = doc.createElement('office-ui-checkbox');
	box.dataset.check = spec.id;
	box.setAttribute('aria-label', spec.label);
	if (spec.checked) box.setAttribute('checked', '');
	if (!spec.action) {
		box.setAttribute('disabled', '');
		label.dataset.unsupported = '';
	}
	box.addEventListener('change', () => {
		if (spec.action) emitRibbonAction(box, spec.action);
	});
	label.addEventListener('click', (event) => {
		if (event.target === label) box.click();
	});
	const caption = doc.createElement('span');
	caption.textContent = spec.label;
	caption.addEventListener('click', () => box.click());
	label.append(box, caption);
	return label;
}

/** A shared select shown as Visio's font or size combo. */
export function combo(
	doc: Document,
	spec: {
		id: string;
		label: string;
		placeholder: string;
		width: number;
		unsupported?: string;
		action?: (value: string) => VisioRibbonAction;
	},
): HTMLElement {
	const el = doc.createElement('office-ui-select') as HTMLElement & {
		options: { value: string; label: string }[];
		value: string;
	};
	el.dataset.combo = spec.id;
	el.setAttribute('aria-label', spec.label);
	el.setAttribute('disabled', '');
	el.title = spec.action ? spec.label : `${spec.label}: not available yet. ${spec.unsupported}`;
	el.style.width = `${spec.width}px`;
	el.options = [{ value: '', label: spec.placeholder }];
	el.value = '';
	el.addEventListener('change', () => {
		if (spec.action && !el.hasAttribute('disabled')) emitRibbonAction(el, spec.action(el.value));
	});
	return el;
}

/** A keyboard-navigable row of groups (the shared `office-ui-toolbar`). */
export function commandRow(doc: Document, label: string, children: readonly HTMLElement[]) {
	const el = doc.createElement('office-ui-toolbar');
	el.className = 'ribbon-row';
	el.setAttribute('aria-label', label);
	el.append(...children);
	return el;
}

/**
 * A shared `office-ui-context-menu` of typed commands and separators (`'-'`). Items without an
 * action are shown disabled with their reason, as in the ribbon.
 */
export function contextMenu(
	doc: Document,
	id: string,
	label: string,
	items: readonly (CommandSpec | '-')[],
): HTMLElement & { openAt(x: number, y: number): void; close(): void; open: boolean } {
	const el = doc.createElement('office-ui-context-menu') as HTMLElement & {
		openAt(x: number, y: number): void;
		close(): void;
		open: boolean;
	};
	el.dataset.contextMenu = id;
	el.setAttribute('label', label);
	const actions = new Map<string, VisioRibbonAction | undefined>();
	for (const item of items) {
		if (item === '-') {
			el.append(doc.createElement('office-ui-menu-separator'));
			continue;
		}
		const entry = doc.createElement('office-ui-menu-item');
		decorate(entry, item);
		actions.set(item.id, item.action);
		el.append(entry);
	}
	el.addEventListener('office-command', (event) => {
		event.stopPropagation();
		const action = actions.get((event as CustomEvent<{ command: string }>).detail.command);
		if (action) emitRibbonAction(el, action);
	});
	return el;
}
