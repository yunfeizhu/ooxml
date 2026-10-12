import { createApp, defineComponent, h, onMounted, shallowRef } from 'vue';
import { VisioViewer } from '../../../viewers/visio/packages/bindings/src/vue';
import type { ViewerHandle } from '../../../viewers/visio/packages/bindings/src/common';
import { createWorkspace } from '../demo/workspace';

// The Vue demo: the VisioViewer component with its exposed handle.
const workspace = createWorkspace();

const App = defineComponent({
	setup() {
		const viewer = shallowRef<ViewerHandle | null>(null);
		onMounted(() => {
			if (viewer.value) workspace.attach(viewer.value);
		});
		return () =>
			h(VisioViewer, {
				ref: viewer,
				document: workspace.initialDocument,
				events: workspace.events,
				'aria-label': 'Visio diagram',
			});
	},
});

createApp(App).mount(window.document.getElementById('viewer')!);
