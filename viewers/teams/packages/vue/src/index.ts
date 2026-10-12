import {
	defineComponent,
	h,
	onBeforeUnmount,
	onMounted,
	onScopeDispose,
	ref,
	shallowRef,
	toValue,
	watch,
	type MaybeRefOrGetter,
	type PropType,
	type ShallowRef,
} from 'vue';
import type { TeamsServerConfig } from 'ooxml-core/teams';
import {
	bindTeams,
	createTeams,
	defineTeamsApp,
	pickTeamsProps,
	type FileOpeners,
	type FileEmbeds,
	type FileUploader,
	type TeamsApp,
	type TeamsClient,
	type TeamsBinding,
	type TeamsClientOptions,
	type TeamsElementProps,
	type TeamsState,
} from 'teams-viewer';

export type { TeamsClient, TeamsClientOptions, TeamsProps, TeamsState } from 'teams-viewer';

/** `<Teams workspace-id="acme" user-name="Ada" :config="cfg" @open-file="..." />`: the full UI. */
export const Teams = defineComponent({
	name: 'Teams',
	props: {
		workspaceId: String,
		userName: String,
		userId: String,
		config: Object as PropType<TeamsServerConfig | null>,
		uploadFile: Function as PropType<FileUploader>,
		openers: Object as PropType<FileOpeners>,
		embeds: Object as PropType<FileEmbeds>,
	},
	emits: ['ready', 'open-file', 'config-change'],
	setup(props, { emit, expose }) {
		const el = ref<TeamsApp | null>(null);
		let binding: TeamsBinding | undefined;
		// `class` and `style` fall through to the <teams-app> root, so no class prop is declared.
		const current = (): TeamsElementProps => ({
			...pickTeamsProps(props),
			onReady: (d) => emit('ready', d),
			onOpenFile: (d, e) => emit('open-file', d, e),
			onConfigChange: (d) => emit('config-change', d),
		});
		const sync = (): void => binding?.update(current());
		onMounted(() => {
			defineTeamsApp();
			if (el.value) binding = bindTeams(el.value, current);
			sync();
		});
		watch(
			() => [
				props.workspaceId,
				props.userName,
				props.userId,
				props.config,
				props.uploadFile,
				props.openers,
				props.embeds,
			],
			sync,
		);
		onBeforeUnmount(() => binding?.destroy());
		expose({ element: el });
		return () => h('teams-app', { ref: el, style: 'display:block;height:100%' });
	},
});

/**
 * The raw composable: a client for `options` (a value, ref or getter), recreated when it changes
 * and destroyed with the scope. `state` is a shallow ref that always holds the latest snapshot.
 *
 *   const { client, state } = useTeams(() => ({ workspaceId: 'acme', user, config }));
 */
export function useTeams(options: MaybeRefOrGetter<TeamsClientOptions | null>): {
	client: ShallowRef<TeamsClient | null>;
	state: ShallowRef<TeamsState | null>;
} {
	const client = shallowRef<TeamsClient | null>(null);
	const state = shallowRef<TeamsState | null>(null);
	let off = (): void => {};
	const stop = (): void => {
		off();
		client.value?.destroy();
		client.value = null;
		state.value = null;
	};
	watch(
		() => toValue(options),
		(opts) => {
			stop();
			if (!opts) return;
			const created = createTeams(opts);
			client.value = created;
			state.value = created.getState();
			off = created.subscribe(() => (state.value = created.getState()));
		},
		{ immediate: true },
	);
	onScopeDispose(stop);
	return { client, state };
}
