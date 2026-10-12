import { createEffect, createSignal, onCleanup, onMount, type Accessor, type JSX } from 'solid-js';
import {
	mountFrameworkViewer,
	viewerHandle,
	viewerOptions,
	viewerStateSource,
	type MountedViewer,
	type ViewerHandle,
	type ViewerProps,
	type ViewerState,
} from './common';
export interface VisioViewerProps extends ViewerProps {
	class?: string | undefined;
	style?: JSX.CSSProperties | undefined;
	'aria-label'?: string | undefined;
	viewerRef?: ((handle: ViewerHandle | undefined) => void) | undefined;
}
/** Native Solid host and ownership; all document work remains in the shared binding. */
export function VisioViewer(props: VisioViewerProps) {
	let host!: HTMLDivElement;
	const [binding, setBinding] = createSignal<MountedViewer>();
	let releasedRef: VisioViewerProps['viewerRef'];
	onMount(() => {
		setBinding(mountFrameworkViewer(host, viewerOptions(props)));
	});
	createEffect(() => {
		binding()?.update(viewerOptions(props));
	});
	createEffect(() => {
		const mounted = binding();
		const callback = props.viewerRef;
		if (!mounted || callback === releasedRef) return;
		const previous = releasedRef;
		releasedRef = callback;
		try {
			previous?.(undefined);
		} finally {
			callback?.(viewerHandle(binding));
		}
	});
	onCleanup(() => {
		const mounted = binding();
		setBinding(undefined);
		const release = releasedRef;
		releasedRef = undefined;
		try {
			release?.(undefined);
		} finally {
			mounted?.destroy();
		}
	});
	return (
		<div ref={host} class={props.class} style={props.style} aria-label={props['aria-label']} />
	);
}
/**
 * Reactive viewer state as a Solid accessor for a handle accessor (for example a signal set by
 * `viewerRef`). Follows handle changes and cleans up with the owning scope.
 */
export function createVisioViewerState(
	handle: Accessor<ViewerHandle | undefined>,
): Accessor<ViewerState | null> {
	const [state, setState] = createSignal<ViewerState | null>(null);
	createEffect(() => {
		const current = handle();
		const source = viewerStateSource(() => current);
		setState(() => source.getSnapshot());
		onCleanup(source.subscribe(() => setState(() => source.getSnapshot())));
	});
	return state;
}
export type {
	ViewerState,
	ViewerHandle,
	ViewerCallbacks,
	ViewerOptions,
	ViewerEvents,
	VisioShapeSelection,
	ViewerEditState,
	VsdxExportResult,
	RibbonAddInCommand,
	RibbonAddInGroup,
	RibbonAddInTab,
} from './common';
