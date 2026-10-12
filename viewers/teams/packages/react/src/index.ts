import {
	createElement,
	forwardRef,
	useEffect,
	useImperativeHandle,
	useLayoutEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from 'react';
import {
	bindTeams,
	createTeams,
	defineTeamsApp,
	pickTeamsProps,
	type TeamsApp,
	type TeamsBinding,
	type TeamsClient,
	type TeamsClientOptions,
	type TeamsProps,
	type TeamsState,
} from 'teams-viewer';

export type { TeamsClient, TeamsClientOptions, TeamsProps, TeamsState } from 'teams-viewer';

/** `<Teams workspaceId="acme" userName="Ada" config={...} onOpenFile={...} />`: the full UI. */
export const Teams = forwardRef<TeamsApp | null, TeamsProps & { className?: string }>(
	function Teams({ className, ...props }, ref) {
		const el = useRef<TeamsApp | null>(null);
		const latest = useRef<TeamsProps>(props);
		const binding = useRef<TeamsBinding | null>(null);
		latest.current = props;
		useImperativeHandle(ref, () => el.current as TeamsApp, []);
		useLayoutEffect(() => {
			defineTeamsApp();
		}, []);
		useEffect(() => {
			if (!el.current) return;
			const bound = bindTeams(el.current, () => latest.current);
			binding.current = bound;
			return () => {
				bound.destroy();
				binding.current = null;
			};
		}, []);
		// Props are applied after every render; unchanged values are skipped inside the binding. The
		// class goes through React itself (below), so it also reaches server-rendered markup.
		useEffect(() => {
			binding.current?.update(pickTeamsProps(props));
		});
		return createElement('teams-app', {
			ref: el,
			class: className,
			style: { display: 'block', height: '100%' },
		});
	},
);

/**
 * The raw hook: a core client for `options`, recreated when the workspace, user or server change
 * and destroyed on unmount. Returns `null` until mounted (and while `options` is `null`).
 *
 *   const client = useTeamsClient({ workspaceId: 'acme', user, config });
 *   const state = useTeamsState(client);
 */
export function useTeamsClient(options: TeamsClientOptions | null): TeamsClient | null {
	const [client, setClient] = useState<TeamsClient | null>(null);
	const key = options ? JSON.stringify([options.workspaceId, options.user, options.config]) : '';
	const latest = useRef(options);
	latest.current = options;
	useEffect(() => {
		const opts = latest.current;
		if (!opts) return;
		const created = createTeams(opts);
		setClient(created);
		return () => {
			created.destroy();
			setClient(null);
		};
	}, [key]);
	return client;
}

const NO_UNSUBSCRIBE = (): void => {};
/** The current immutable state of a client; re-renders on every change (`useSyncExternalStore`). */
export function useTeamsState(client: TeamsClient | null): TeamsState | null {
	return useSyncExternalStore(
		client ? client.subscribe : () => NO_UNSUBSCRIBE,
		() => (client ? client.getState() : null),
		() => null,
	);
}

/** `useTeamsClient` and `useTeamsState` in one call: `const { client, state } = useTeams(options)`. */
export function useTeams(options: TeamsClientOptions | null): {
	client: TeamsClient | null;
	state: TeamsState | null;
} {
	const client = useTeamsClient(options);
	return { client, state: useTeamsState(client) };
}
