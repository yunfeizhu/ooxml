// The element wiring every framework binding repeats, written once: props in (`applyTeamsProps`,
// plus the host class), events out (`listenTeamsEvents`) and the bookkeeping of what was applied.
// It lives here, on top of the published `ooxml-ui/teams` contract, so a binding works with the
// last released ooxml-ui; it can move into ooxml-ui once that is released with it.
import { applyTeamsProps, listenTeamsEvents, type TeamsApp, type TeamsProps } from 'ooxml-ui/teams';

/** The props of `<teams-app>` plus the class list of its host element. */
export type TeamsElementProps = TeamsProps & { className?: string | undefined };

const KEYS = [
	'workspaceId',
	'userName',
	'userId',
	'config',
	'uploadFile',
	'openers',
	'embeds',
] as const;

/**
 * Copies the defined, shared props out of a framework's props/instance object. `undefined` means
 * "not provided"; `config` keeps an explicit `null`. Handlers are not copied: events go through
 * the `get` callback of `bindTeams`.
 */
export function pickTeamsProps(
	source: { [K in (typeof KEYS)[number]]?: TeamsProps[K] | undefined } & {
		className?: string | undefined;
	},
): TeamsElementProps {
	const picked: Record<string, unknown> = {};
	for (const key of KEYS) if (source[key] !== undefined) picked[key] = source[key];
	if (source.className) picked.className = source.className;
	return picked as TeamsElementProps;
}

export interface TeamsBinding {
	/** Apply props; only values that changed since the last call are written. */
	update(next: TeamsElementProps): void;
	/** Stop listening for events. The element is left to the framework that owns it. */
	destroy(): void;
}

const tokens = (value: string | undefined): string[] => value?.split(/\s+/).filter(Boolean) ?? [];

/**
 * Wires `el` to a framework's props: `update` pushes changed props (and the host class), and the
 * element's events call the handlers returned by `get` at event time.
 */
export function bindTeams(el: TeamsApp, get: () => TeamsElementProps): TeamsBinding {
	let applied: TeamsElementProps = {};
	const stop = listenTeamsEvents(el, get);
	return {
		update(next) {
			applyTeamsProps(el, next, applied);
			if (next.className !== applied.className) {
				el.classList.remove(...tokens(applied.className));
				el.classList.add(...tokens(next.className));
			}
			applied = next;
		},
		destroy: stop,
	};
}
