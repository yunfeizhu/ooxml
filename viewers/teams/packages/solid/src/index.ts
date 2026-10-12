import { createEffect, createSignal, onCleanup, type Accessor } from 'solid-js';
import {
	bindTeams,
	createTeams,
	defineTeamsApp,
	pickTeamsProps,
	type TeamsApp,
	type TeamsClient,
	type TeamsClientOptions,
	type TeamsElementProps,
	type TeamsState,
} from 'teams-viewer';

export type { TeamsClient, TeamsClientOptions, TeamsProps, TeamsState } from 'teams-viewer';

/**
 * Returns the `<teams-app>` element; use it as `{Teams(props)}` inside JSX. A plain function (no
 * JSX transform needed) keeps the package a lifecycle adapter: props are re-applied reactively
 * and handlers are read at event time.
 */
export function Teams(props: TeamsElementProps & { class?: string | undefined }): HTMLElement {
	defineTeamsApp();
	const el = document.createElement('teams-app') as TeamsApp;
	el.style.display = 'block';
	el.style.height = '100%';
	const binding = bindTeams(el, () => props);
	createEffect(() => {
		binding.update(pickTeamsProps({ ...props, className: props.class ?? props.className }));
	});
	onCleanup(binding.destroy);
	return el;
}

/**
 * The raw primitive: a client for `options()`, recreated when it changes and destroyed with the
 * owner. `state()` is a signal that holds the latest snapshot.
 *
 *   const { client, state } = createTeamsClient(() => ({ workspaceId: 'acme', user, config }));
 */
export function createTeamsClient(options: () => TeamsClientOptions | null): {
	client: Accessor<TeamsClient | null>;
	state: Accessor<TeamsState | null>;
} {
	const [client, setClient] = createSignal<TeamsClient | null>(null);
	const [state, setState] = createSignal<TeamsState | null>(null, { equals: false });
	createEffect(() => {
		const opts = options();
		if (!opts) return;
		const created = createTeams(opts);
		setClient(created);
		setState(created.getState());
		const off = created.subscribe(() => setState(created.getState()));
		onCleanup(() => {
			off();
			created.destroy();
			setClient(null);
			setState(null);
		});
	});
	return { client, state };
}
