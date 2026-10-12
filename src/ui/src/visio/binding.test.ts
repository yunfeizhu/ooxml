import { describe, it, expect, vi, afterEach } from 'vitest';
import { mountViewer } from './binding';
import { demoDocument } from 'ooxml-core/visio/ui';

afterEach(() => document.body.replaceChildren());
describe('shared lifecycle binding', () => {
	it('applies initial properties and forwards latest callbacks only', () => {
		const host = document.createElement('div');
		document.body.append(host);
		const old = vi.fn(),
			current = vi.fn();
		const viewer = mountViewer(host, {
			document: demoDocument,
			zoom: 2,
			events: { 'page-change': old },
		});
		expect(viewer.element.document).toBe(demoDocument);
		expect(viewer.element.zoom).toBe(2);
		viewer.update({ events: { 'page-change': current } });
		viewer.update({ pageIndex: 1 });
		expect(old).not.toHaveBeenCalled();
		expect(current).toHaveBeenCalledWith(1);
		viewer.update({ events: {} });
		viewer.update({ pageIndex: 0 });
		expect(current).toHaveBeenCalledTimes(1);
		viewer.destroy();
	});
	it('accepts A -> B -> C -> B replacements without stale echo suppression', () => {
		const host = document.createElement('div');
		const a = demoDocument,
			b = { ...demoDocument },
			c = { ...demoDocument };
		const viewer = mountViewer(host, { document: a });
		viewer.update({ document: b });
		viewer.update({ document: c });
		viewer.update({ document: b });
		expect(viewer.element.document).toBe(b);
		viewer.destroy();
	});
	it('clears on explicit null but leaves omitted props unchanged', () => {
		const viewer = mountViewer(document.createElement('div'), { document: demoDocument, zoom: 3 });
		viewer.update({ showToolbar: false });
		expect(viewer.element.document).toBe(demoDocument);
		expect(viewer.element.zoom).toBe(3);
		viewer.update({ document: null });
		expect(viewer.element.document).toBeNull();
		viewer.destroy();
	});
	it('destroy removes content and guards load, fit and update', async () => {
		const host = document.createElement('div'),
			viewer = mountViewer(host, { document: demoDocument });
		viewer.destroy();
		viewer.destroy();
		expect(host.children.length).toBe(0);
		expect(() => viewer.update({ zoom: 2 })).toThrow('destroyed');
		expect(() => viewer.fit()).toThrow('destroyed');
		await expect(viewer.load(new ArrayBuffer(0))).rejects.toThrow('destroyed');
	});
});

describe('custom element safety', () => {
	it('rejects oversized Blobs before reading or allocating their bytes', async () => {
		const viewer = mountViewer(document.createElement('div'));
		const blob = new Blob(['small']);
		Object.defineProperty(blob, 'size', { value: 33 * 1024 * 1024 });
		const read = vi.fn();
		Object.defineProperty(blob, 'arrayBuffer', { value: read });
		await expect(viewer.load(blob)).rejects.toThrow('32 MiB');
		expect(read).not.toHaveBeenCalled();
		viewer.destroy();
	});
	it('allows remove/reappend without losing document state', () => {
		const host = document.createElement('div');
		document.body.append(host);
		const viewer = mountViewer(host, { document: demoDocument });
		viewer.element.remove();
		host.append(viewer.element);
		expect(viewer.element.document).toBe(demoDocument);
		expect(viewer.element.shadowRoot?.querySelector('svg.paper')).not.toBeNull();
		viewer.destroy();
	});
	it('guards direct element fit and toolbar after destruction', () => {
		const viewer = mountViewer(document.createElement('div'));
		const element = viewer.element;
		viewer.destroy();
		expect(() => element.fit()).toThrow('destroyed');
		expect(() => {
			element.showToolbar = true;
		}).toThrow('destroyed');
	});
	it('lists full compatibility notes in File > Info', () => {
		const viewer = mountViewer(document.createElement('div'), { document: demoDocument });
		const notes = viewer.element.shadowRoot!.querySelector<HTMLElement>('.backstage-notes')!;
		expect(notes.hidden).toBe(false);
		expect(notes.querySelector('h2')?.textContent).toBe('Compatibility');
		expect(notes.querySelector('ul')?.textContent).toContain('Text metrics');
		viewer.destroy();
	});
});

describe('Blob read errors', () => {
	it('reports errors through the same event and loading state as parser errors', async () => {
		const error = new Error('File could not be read');
		const callback = vi.fn();
		const viewer = mountViewer(document.createElement('div'), {
			events: { 'document-error': callback },
		});
		const blob = new Blob(['x']);
		Object.defineProperty(blob, 'arrayBuffer', {
			value: async () => {
				throw error;
			},
		});
		await expect(viewer.load(blob)).rejects.toThrow('File could not be read');
		expect(callback).toHaveBeenCalledWith(error);
		expect(viewer.controller.state.loading).toBe(false);
		viewer.destroy();
	});
});

describe('reentrant binding updates', () => {
	it('stops an older patch when a callback applies a newer update', () => {
		const viewer = mountViewer(document.createElement('div'), { document: demoDocument });
		viewer.update({
			events: {
				'page-change': (page) => {
					if (page === 1) viewer.update({ pageIndex: 0, zoom: 3, showToolbar: false });
				},
			},
		});
		viewer.update({ pageIndex: 1, zoom: 2, showToolbar: true });
		expect(viewer.element.pageIndex).toBe(0);
		expect(viewer.element.zoom).toBe(3);
		expect(viewer.element.showToolbar).toBe(false);
		viewer.destroy();
	});
	it('stops applying properties when a callback destroys the binding', () => {
		const viewer = mountViewer(document.createElement('div'), { document: demoDocument });
		expect(() =>
			viewer.update({
				zoom: 2,
				showToolbar: false,
				events: { 'zoom-change': () => viewer.destroy() },
			}),
		).not.toThrow();
		expect(() => viewer.fit()).toThrow('destroyed');
	});
});

describe('accessible selection and connected font resources', () => {
	it('disambiguates foreground/background IDs and supports keyboard selection', () => {
		const model = structuredClone(demoDocument);
		model.pages[0]!.backgroundPageId = '2';
		model.pages[1]!.shapes[0]!.id = 's1';
		const viewer = mountViewer(document.createElement('div'), { document: model });
		const root = viewer.element.shadowRoot!;
		const foreground = root.querySelector<SVGGElement>('[data-page-id="1"][data-shape-id="s1"]')!;
		foreground.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		expect(viewer.controller.state.selectedShape?.pageId).toBe('1');
		expect(root.querySelectorAll('[data-selected="true"]')).toHaveLength(1);
		viewer.destroy();
	});
	it('reflows when fonts finish loading and tears down the listener on disconnect', () => {
		const previous = Object.getOwnPropertyDescriptor(document, 'fonts');
		const fonts = new EventTarget();
		const add = vi.spyOn(fonts, 'addEventListener'),
			remove = vi.spyOn(fonts, 'removeEventListener');
		Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });
		try {
			const host = document.createElement('div');
			document.body.append(host);
			const viewer = mountViewer(host, { document: demoDocument });
			const before = viewer.element.shadowRoot?.querySelector('svg.paper');
			fonts.dispatchEvent(new Event('loadingdone'));
			expect(viewer.element.shadowRoot?.querySelector('svg.paper')).not.toBe(before);
			expect(add).toHaveBeenCalledOnce();
			viewer.element.remove();
			expect(remove).toHaveBeenCalledOnce();
			host.append(viewer.element);
			expect(add).toHaveBeenCalledTimes(2);
			viewer.destroy();
			expect(remove).toHaveBeenCalledTimes(2);
		} finally {
			if (previous) Object.defineProperty(document, 'fonts', previous);
			else Reflect.deleteProperty(document, 'fonts');
		}
	});
});

describe('disposed DOM resources', () => {
	it('removes retained-control event handlers on destroy', () => {
		const viewer = mountViewer(document.createElement('div'), { document: demoDocument });
		const button = viewer.element
			.shadowRoot!.querySelector('office-ui-zoom-slider')!
			.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')!;
		const errors: ErrorEvent[] = [];
		const listen = (event: ErrorEvent) => errors.push(event);
		window.addEventListener('error', listen);
		viewer.destroy();
		button.click();
		window.removeEventListener('error', listen);
		expect(errors).toEqual([]);
	});
});

describe('shared shape details across bindings', () => {
	it('opens an inert data preview for the selected shape', () => {
		const model = structuredClone(demoDocument);
		model.pages[0]!.shapes[0]!.shapeData = [
			{ id: '0', name: 'Owner', type: 0, valueKind: 'string', value: 'Alex' },
		];
		const viewer = mountViewer(document.createElement('div'), { document: model });
		viewer.controller.selectShape({ id: 's1', name: 'Start', pageId: '1' });
		const root = viewer.element.shadowRoot!;
		const inspector = root.querySelector<HTMLElement>('.shape-inspector')!;
		const hint = inspector.querySelector<HTMLElement>('.selection-hint')!;
		expect(inspector.textContent).toContain('Alex');
		expect(hint.hidden).toBe(true);
		// The Shape Data window opens on request, as in Visio, not with every selection.
		expect(root.querySelector<HTMLElement>('#inspector-pane')!.hidden).toBe(true);
		viewer.controller.selectShape(null);
		expect(inspector.textContent).not.toContain('Alex');
		expect(hint.hidden).toBe(false);
		expect(hint.textContent).toBe('No Shape Data');
		viewer.destroy();
	});
});

describe('shared editing binding lifecycle', () => {
	it('forwards edit methods, export results and document-change callbacks', async () => {
		const changed = vi.fn();
		const viewer = mountViewer(document.createElement('div'), {
			events: { 'document-change': changed },
		});
		const replace = vi.spyOn(viewer.element, 'replacePlainText').mockResolvedValue();
		const undo = vi.spyOn(viewer.element, 'undo').mockResolvedValue();
		const redo = vi.spyOn(viewer.element, 'redo').mockResolvedValue();
		const cancel = vi.spyOn(viewer.element, 'cancelEdit').mockImplementation(() => {});
		const result = { bytes: new Uint8Array([1]), dirty: true, diagnostics: [] };
		vi.spyOn(viewer.element, 'exportVsdx').mockReturnValue(result);
		await viewer.replacePlainText('p', 's', 'Text');
		await viewer.undo();
		await viewer.redo();
		viewer.cancelEdit();
		expect(replace).toHaveBeenCalledWith('p', 's', 'Text');
		expect(undo).toHaveBeenCalledOnce();
		expect(redo).toHaveBeenCalledOnce();
		expect(cancel).toHaveBeenCalledOnce();
		expect(viewer.exportVsdx()).toBe(result);
		const detail = { document: demoDocument, dirty: true, kind: 'edit' };
		viewer.element.dispatchEvent(new CustomEvent('document-change', { detail }));
		expect(changed).toHaveBeenCalledWith(detail);
		viewer.destroy();
		viewer.element.dispatchEvent(new CustomEvent('document-change', { detail }));
		expect(changed).toHaveBeenCalledOnce();
		await expect(viewer.replacePlainText('p', 's', 'Text')).rejects.toThrow('destroyed');
		await expect(viewer.undo()).rejects.toThrow('destroyed');
		await expect(viewer.redo()).rejects.toThrow('destroyed');
		expect(() => viewer.cancelEdit()).toThrow('destroyed');
		expect(() => viewer.exportVsdx()).toThrow('destroyed');
	});
});
