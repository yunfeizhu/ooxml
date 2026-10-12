/** @jsxImportSource react */
import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { VisioViewer, type ViewerHandle } from '../../../viewers/visio/packages/bindings/src/react';
import { createWorkspace } from '../demo/workspace';

// The React demo: <VisioViewer> with a ref handle.
const workspace = createWorkspace();

function App() {
	const viewer = useRef<ViewerHandle>(null);
	useEffect(() => {
		if (viewer.current) workspace.attach(viewer.current);
	}, []);
	return (
		<VisioViewer
			ref={viewer}
			document={workspace.initialDocument}
			events={workspace.events}
			aria-label="Visio diagram"
		/>
	);
}

const host = window.document.getElementById('viewer')!;
createRoot(host).render(<App />);
