// Declarative ribbon spec. UI-SHELL renders it (ribbon/ribbon.ts); UI-COMMANDS supplies the tabs
// from `ribbon/tabs/` through `registerRibbonTabs`.
//
// Layout rules of the renderer:
// - a group lays its controls out left to right; `size: 'large'` draws an icon over a caption;
// - a run of small controls between large ones: `separator`s break it into rows (Font: font,
//   size, grow, shrink | bold, italic, ...); a leading `select` gets a row of its own (Number);
//   otherwise it fills columns of three (AutoSum, Fill, Clear);
// - a `stack` is a column of small controls; a `stack` inside a `stack` is a row;
// - small buttons show their label only with `showLabel: true` (Wrap Text, Merge & Center);
// - labels, tooltips and shortcuts come from the command (`label`, `shortcut`), translated by
//   `ctx.t`, and enabled/checked/value states refresh on `ctx.requestRender()`;
// - a `select` calls `run(ctx, value)`; `editable` makes it a combo box that also accepts typed
//   text; a `color` control calls `run(ctx, color)` with a `Color` (`{ rgb: 'RRGGBB' }`,
//   `{ theme, tint }`) or `undefined` for Automatic / No Fill;
// - a `menu` or `split` item calls `run(ctx, item.arg)`; a gallery calls `run(ctx, item.id)`.
import type { EditorContext } from '../context';

export interface RibbonOption {
	value: string;
	label: string;
}

export type RibbonControl =
	| { kind: 'button'; command: string; size?: 'large' | 'small'; showLabel?: boolean }
	| { kind: 'toggle'; command: string; size?: 'large' | 'small'; showLabel?: boolean }
	| { kind: 'split'; command: string; menu: RibbonMenuItem[]; size?: 'large' | 'small' }
	| {
			kind: 'menu';
			label: string;
			icon?: string;
			items: RibbonMenuItem[];
			size?: 'large' | 'small';
	  }
	| {
			kind: 'select';
			command: string;
			options: RibbonOption[] | ((ctx: EditorContext) => RibbonOption[]);
			width?: number;
			editable?: boolean;
	  }
	/** Split with a theme and standard colour grid; the command arg is a `Color` or undefined. */
	| { kind: 'color'; command: string; label: string; icon: string }
	| {
			kind: 'gallery';
			command: string;
			items: (ctx: EditorContext) => { id: string; label: string; preview?: string }[];
			/** Sectioned dropdown rendered through the shared Office gallery. */
			sections?: (ctx: EditorContext) => {
				title?: string;
				columns: number;
				tileWidth: number;
				tileHeight: number;
				items: { id: string; label: string; preview?: string; applied?: boolean }[];
			}[];
	  }
	/** Vertical stack of small controls. */
	| { kind: 'stack'; controls: RibbonControl[] }
	| { kind: 'separator' };

export type RibbonMenuItem =
	| { command: string; arg?: unknown; label?: string }
	| { separator: true };

export interface RibbonGroup {
	id: string;
	label: string;
	controls: RibbonControl[];
	/** Command id of the dialog launcher in the group corner. */
	launcher?: string;
}

export interface RibbonTab {
	id: string;
	label: string;
	groups: RibbonGroup[];
	/** Contextual tabs (Table Design, Chart Design) show only while this returns true. */
	contextual?: (ctx: EditorContext) => boolean;
}

const registered: RibbonTab[] = [];
const listeners = new Set<() => void>();

/** Adds or replaces tabs (by id). UI-COMMANDS calls this from `commands/index.ts`. */
export function registerRibbonTabs(tabs: RibbonTab[]): void {
	for (const tab of tabs) {
		const index = registered.findIndex((existing) => existing.id === tab.id);
		if (index >= 0) registered[index] = tab;
		else registered.push(tab);
	}
	for (const listener of listeners) listener();
}

/** Every registered tab, in registration order. */
export function ribbonTabs(): readonly RibbonTab[] {
	return registered;
}

/** Notifies the renderer when tabs are registered after it rendered. */
export function onRibbonTabsChange(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/** Test helper: forgets every registered tab. */
export function resetRibbonTabs(): void {
	registered.length = 0;
	for (const listener of listeners) listener();
}

export const isMenuSeparator = (item: RibbonMenuItem): item is { separator: true } =>
	'separator' in item;
