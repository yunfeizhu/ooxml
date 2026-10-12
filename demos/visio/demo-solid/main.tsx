import { render } from 'solid-js/web';
import { VisioViewer } from '../../../viewers/visio/packages/bindings/src/solid';
import { createWorkspace } from '../demo/workspace';

// The Solid demo: <VisioViewer> with a viewerRef callback.
const workspace = createWorkspace();

function App() {
	let attached = false;
	return (
		<VisioViewer
			document={workspace.initialDocument}
			events={workspace.events}
			aria-label="Visio diagram"
			viewerRef={(handle) => {
				if (handle && !attached) {
					attached = true;
					workspace.attach(handle);
				}
			}}
		/>
	);
}

render(() => <App />, window.document.getElementById('viewer')!);
