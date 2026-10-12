import {
	defineComponent,
	h,
	onBeforeUnmount,
	onMounted,
	ref,
	shallowRef,
	watch,
	watchEffect,
	type PropType,
	type Ref,
	type ShallowRef,
} from 'vue';
import {
	eventKeys,
	propertyKeys,
	mountFrameworkViewer,
	viewerHandle,
	viewerStateSource,
	withEventEmitter,
	type MountedViewer,
	type ViewerCallbacks,
	type ViewerHandle,
	type ViewerProperties,
	type ViewerState,
} from './common';
/** Vue props and emitted event names are checked against the shared contract. */
export const VisioViewer = defineComponent({
	name: 'VisioViewer',
	props: {
		document: { type: Object as PropType<ViewerProperties['document']>, default: undefined },
		pageIndex: { type: Number, default: undefined },
		zoom: { type: Number, default: undefined },
		showToolbar: { type: Boolean, default: undefined },
		ribbonAddIns: {
			type: Array as unknown as PropType<ViewerProperties['ribbonAddIns']>,
			default: undefined,
		},
		events: Object as PropType<ViewerCallbacks>,
	} satisfies Record<keyof ViewerProperties | 'events', unknown>,
	emits: [...eventKeys],
	setup(props, { emit, expose }) {
		const host = ref<HTMLElement>();
		const binding = shallowRef<MountedViewer>();
		const options = () => withEventEmitter(props, (name, value) => emit(name, value));
		onMounted(() => {
			binding.value = mountFrameworkViewer(host.value!, options());
		});
		watch(
			() => [...propertyKeys.map((key) => props[key]), props.events],
			() => binding.value?.update(options()),
		);
		onBeforeUnmount(() => {
			const mounted = binding.value;
			binding.value = undefined;
			mounted?.destroy();
		});
		expose(viewerHandle(() => binding.value));
		return () => h('div', { ref: host });
	},
});
/**
 * Composable: reactive viewer state for a template ref to `<VisioViewer>`. The returned
 * shallow ref is `null` until the viewer mounts and follows remounts of the ref.
 */
export function useVisioViewerState(
	viewer: Ref<ViewerHandle | null | undefined>,
): Readonly<ShallowRef<ViewerState | null>> {
	const state = shallowRef<ViewerState | null>(null);
	watchEffect(
		(onCleanup) => {
			// A template ref can be exposed before onMounted creates its controller. Reading the
			// reactive binding through the handle follows that transition as well as ref changes.
			const source = viewerStateSource(() => viewer.value);
			state.value = source.getSnapshot();
			onCleanup(
				source.subscribe(() => {
					state.value = source.getSnapshot();
				}),
			);
		},
		{ flush: 'post' },
	);
	return state;
}
export type {
	ViewerState,
	ViewerHandle,
	ViewerCallbacks,
	ViewerOptions,
	ViewerEvents,
	VisioShapeSelection,
	CreateVsdxOptions,
	ViewerEditState,
	VsdxExportResult,
	RibbonAddInCommand,
	RibbonAddInGroup,
	RibbonAddInTab,
} from './common';
