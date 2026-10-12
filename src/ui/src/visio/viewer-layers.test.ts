import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VisioDocument, VisioLayer, VisioShape } from 'ooxml-core/visio';
import { ViewerController } from './controller';
import { mountViewer } from './binding';
import { demoDocument } from 'ooxml-core/visio/ui';
import { renderPage } from './render-svg';
import {
	VIEWER_LAYER_LIMITS,
	documentVisibility,
	layerOverrideMaps,
	type LayerVisibilityOverride,
} from './viewer-layers';

const layer = (id: string, visible = true): VisioLayer => ({
	id,
	name: `Layer ${id}`,
	visible,
	printable: false,
	locked: true,
});
function shape(id: string, changes: Partial<VisioShape> = {}): VisioShape {
	const result = structuredClone(demoDocument.pages[0]!.shapes[0]!);
	return {
		...result,
		id,
		name: id,
		text: { ...result.text, plainText: `Needle ${id}` },
		layerIds: ['0'],
		visibility: {
			layerHidden: false,
			guide: false,
			noShow: false,
			layerPrintSummary: 'all-disabled',
		},
		...changes,
	};
}
function model(): VisioDocument {
	const source = structuredClone(demoDocument);
	const front = source.pages[0]!,
		background = source.pages[1]!;
	front.layers = [layer('0')];
	front.backgroundPageId = background.id;
	front.shapes = [shape('same')];
	background.layers = [layer('0', false)];
	background.isBackground = true;
	background.shapes = [
		shape('same', {
			hidden: true,
			visibility: {
				layerHidden: true,
				guide: false,
				noShow: false,
				layerPrintSummary: 'all-disabled',
			},
		}),
	];
	return source;
}
function controller(source = model()): ViewerController {
	const result = new ViewerController();
	result.setDocument(source);
	return result;
}
function drawingIds(svg: SVGSVGElement): string[] {
	return [...svg.querySelectorAll<SVGGElement>('[data-shape-id]')].map(
		(item) => `${item.dataset.pageId}:${item.dataset.shapeId}`,
	);
}
afterEach(() => document.body.replaceChildren());

describe('shared viewer display layer state', () => {
	it('scopes overrides to source pages, preserves immutable snapshots and resets explicitly', () => {
		const source = model(),
			before = structuredClone(source),
			viewer = controller(source);
		const initial = viewer.state.layerVisibilityOverrides;
		viewer.setLayerVisibility('1', '0', false);
		const first = viewer.state.layerVisibilityOverrides;
		viewer.setLayerVisibility('2', '0', true);
		expect(Object.isFrozen(initial)).toBe(true);
		expect(Object.isFrozen(first)).toBe(true);
		expect(Object.isFrozen(first[0])).toBe(true);
		expect(() => Object.assign(first[0]!, { visible: true })).toThrow();
		expect(initial).toEqual([]);
		expect(first).toEqual([{ pageId: '1', layerId: '0', visible: false }]);
		viewer.setPage(1);
		viewer.setPage(0);
		expect(viewer.state.layerVisibilityOverrides).toHaveLength(2);
		viewer.setLayerVisibility('1', '0', null);
		expect(viewer.state.layerVisibilityOverrides).toEqual([
			{ pageId: '2', layerId: '0', visible: true },
		]);
		viewer.resetLayerVisibility('1');
		expect(viewer.state.layerVisibilityOverrides).toHaveLength(1);
		viewer.resetLayerVisibility();
		expect(viewer.state.layerVisibilityOverrides).toEqual([]);
		expect(source).toEqual(before);
	});
	it('updates visible search and drops a newly hidden selection synchronously', () => {
		const viewer = controller(),
			events = vi.fn();
		viewer.onEvent(events);
		viewer.setSearchQuery('needle');
		expect(viewer.state.search.results.map((item) => item.pageId)).toEqual(['1']);
		viewer.nextSearchResult();
		viewer.setLayerVisibility('1', '0', false);
		expect(viewer.state.selectedShape).toBeNull();
		expect(viewer.state.search.results).toHaveLength(0);
		expect(viewer.state.search.activeIndex).toBe(-1);
		expect(events).toHaveBeenLastCalledWith('shape-select', null);
		viewer.selectShape({ id: 'same', name: 'hidden', pageId: '1' });
		expect(viewer.state.selectedShape).toBeNull();
		viewer.setLayerVisibility('2', '0', true);
		expect(viewer.state.search.results.map((item) => item.pageId)).toEqual(['2']);
		viewer.nextSearchResult();
		expect(viewer.state.pageIndex).toBe(1);
		expect(viewer.state.selectedShape?.pageId).toBe('2');
		viewer.resetLayerVisibility('2');
		expect(viewer.state.selectedShape).toBeNull();
		expect(viewer.state.search.results).toHaveLength(0);
	});
	it('propagates group hiding to members while DisplayMode 0 hides only own text', () => {
		const source = model();
		source.pages[0]!.shapes = [
			shape('group', {
				kind: 'group',
				groupDisplayMode: 0,
				children: [shape('child', { layerIds: [] })],
			}),
		];
		const viewer = controller(source);
		viewer.setSearchQuery('needle');
		expect(viewer.state.search.results.map((item) => item.shapeId)).toEqual(['child']);
		viewer.selectShape({ id: 'child', name: 'Child', pageId: '1' });
		viewer.setLayerVisibility('1', '0', false);
		expect(viewer.state.selectedShape).toBeNull();
		expect(viewer.state.search.results).toHaveLength(0);
		viewer.resetLayerVisibility();
		expect(viewer.state.search.results.map((item) => item.shapeId)).toEqual(['child']);
	});
	it.each(['legacy', 'unknown', 'guide', 'noShow'] as const)(
		'never reveals %s hidden sources',
		(kind) => {
			const source = model(),
				item = source.pages[1]!.shapes[0]!;
			if (kind === 'legacy') delete item.visibility;
			if (kind === 'unknown') delete item.visibility!.noShow;
			if (kind === 'guide') item.visibility!.guide = true;
			if (kind === 'noShow') item.visibility!.noShow = true;
			const viewer = controller(source);
			viewer.setSearchQuery('needle');
			viewer.setLayerVisibility('2', '0', true);
			expect(viewer.state.search.results.map((item) => item.pageId)).toEqual(['1']);
			const rendered = renderPage(source, source.pages[0]!, {
				layerVisibilityOverrides: viewer.state.layerVisibilityOverrides,
			});
			expect(drawingIds(rendered.svg)).toEqual(['1:same']);
			rendered.dispose();
		},
	);
	it('ignores no-op resets/sets and rejects bad identity/value without corrupting state', () => {
		const viewer = controller();
		const initial = viewer.state;
		viewer.setLayerVisibility('1', '0', null);
		viewer.resetLayerVisibility();
		expect(viewer.state).toBe(initial);
		viewer.setLayerVisibility('1', '0', false);
		const state = viewer.state;
		viewer.setLayerVisibility('1', '0', false);
		expect(viewer.state).toBe(state);
		for (const command of [
			() => viewer.setLayerVisibility('missing', '0', true),
			() => viewer.setLayerVisibility('1', 'missing', true),
			() => viewer.setLayerVisibility('1', '0', undefined as unknown as boolean),
			() => viewer.resetLayerVisibility('missing'),
		])
			expect(command).toThrow();
		expect(viewer.state).toBe(state);
	});
	it('resets replacement and destroy state but retains display choices on failed loading', async () => {
		const source = model(),
			parser = vi.fn().mockRejectedValueOnce(new Error('bad')).mockResolvedValue(source);
		const viewer = new ViewerController(parser);
		viewer.setDocument(source);
		viewer.setLayerVisibility('1', '0', false);
		const overrides = viewer.state.layerVisibilityOverrides;
		await expect(viewer.load(new Uint8Array())).rejects.toThrow('bad');
		expect(viewer.state.layerVisibilityOverrides).toBe(overrides);
		await viewer.load(new Uint8Array());
		expect(viewer.state.layerVisibilityOverrides).toHaveLength(0);
		viewer.setLayerVisibility('1', '0', false);
		viewer.setDocument(source);
		expect(viewer.state.layerVisibilityOverrides).toHaveLength(0);
		viewer.setLayerVisibility('1', '0', false);
		viewer.destroy();
		expect(viewer.state.layerVisibilityOverrides).toHaveLength(0);
		expect(() => viewer.setLayerVisibility('1', '0', true)).toThrow('destroyed');
		expect(() => viewer.resetLayerVisibility()).toThrow('destroyed');
	});
	it.each(['replace', 'reset', 'destroy'] as const)(
		'suppresses stale selection-cleared events after subscriber %s reentry',
		(action) => {
			const viewer = controller(),
				events = vi.fn();
			viewer.selectShape({ id: 'same', name: 'same', pageId: '1' });
			viewer.onEvent(events);
			viewer.subscribe((state) => {
				if (!state.layerVisibilityOverrides.length) return;
				if (action === 'replace') viewer.setDocument(model());
				if (action === 'reset') viewer.resetLayerVisibility();
				if (action === 'destroy') viewer.destroy();
			});
			viewer.setLayerVisibility('1', '0', false);
			expect(events).not.toHaveBeenCalled();
			expect(viewer.state.layerVisibilityOverrides).toHaveLength(0);
		},
	);
	it('aborts stale search navigation when page callbacks hide the destination', () => {
		const viewer = controller(),
			events = vi.fn();
		viewer.setLayerVisibility('2', '0', true);
		viewer.setSearchQuery('needle');
		viewer.onEvent((name) => {
			if (name === 'page-change') viewer.setLayerVisibility('2', '0', false);
		});
		viewer.onEvent(events);
		viewer.selectSearchResult(1);
		expect(viewer.state.selectedShape).toBeNull();
		expect(viewer.state.search.results.map((item) => item.pageId)).toEqual(['1']);
		expect(events).not.toHaveBeenCalled();
	});
	it('bounds and validates external renderer override records before map allocation', () => {
		const source = model();
		const entry = { pageId: '1', layerId: '0', visible: false };
		expect(() =>
			layerOverrideMaps(source, Array(VIEWER_LAYER_LIMITS.overrides + 1).fill(entry)),
		).toThrow('limit');
		for (const overrides of [
			[entry, entry],
			[{ ...entry, pageId: 'missing' }],
			[{ ...entry, layerId: 'missing' }],
			[{ ...entry, visible: 'false' }],
			[null],
		])
			expect(() =>
				layerOverrideMaps(source, overrides as readonly LayerVisibilityOverride[]),
			).toThrow();
		expect(documentVisibility(source).get(source.pages[0]!.shapes[0]!)).toBe(true);
	});
});

/** Home > Layers > Layer Properties, and the dialog's OK. */
function layerProperties(root: ShadowRoot) {
	const open = () =>
		root.querySelector('[command="layer-properties"]')!.dispatchEvent(
			new CustomEvent('office-command', {
				detail: { command: 'layer-properties' },
				bubbles: true,
				composed: true,
			}),
		);
	const dialog = () =>
		root.querySelector<HTMLElement & { open: boolean }>('.layer-properties-dialog')!;
	const ok = () =>
		dialog()
			.querySelector('[command="layer-properties-dialog-ok"]')!
			.shadowRoot!.querySelector('button')!
			.click();
	const box = (pageId: string, layerId: string, flag: string) =>
		dialog().querySelector<HTMLInputElement>(
			`tr[data-page-id="${pageId}"][data-layer-id="${layerId}"] input[data-flag="${flag}"]`,
		)!;
	return { open, dialog, ok, box };
}

describe('shared layer controls and rendering', () => {
	it('lists the page layers in Layer Properties and shows or hides one for this view', async () => {
		const host = document.createElement('div');
		document.body.append(host);
		const viewer = mountViewer(host, { document: model() }),
			root = viewer.element.shadowRoot!;
		const properties = layerProperties(root);
		properties.open();
		expect(properties.dialog().open).toBe(true);
		expect(properties.dialog().getAttribute('heading')).toBe('Layer Properties');
		const titles = [...properties.dialog().querySelectorAll('thead th')].map(
			(cell) => cell.textContent,
		);
		expect(titles).toEqual(['Name', '#', 'Visible', 'Print', 'Lock', 'Color']);
		const visible = properties.box('1', '0', 'visible');
		expect(visible.checked).toBe(true);
		expect(visible.getAttribute('aria-label')).toBe('Layer 0: Visible');
		expect(visible.closest('tr')!.querySelector('th')!.textContent).toBe('Layer 0');
		// The saved flags show; this model has no package, so only Visible can change, for this view.
		expect(properties.box('1', '0', 'lock').checked).toBe(true);
		expect(properties.box('1', '0', 'lock').disabled).toBe(true);
		expect(properties.box('1', '0', 'print').disabled).toBe(true);
		expect(properties.dialog().querySelector('.layer-note')!.textContent).toMatch(/read-only/);
		expect(root.querySelectorAll('svg [data-shape-id]')).toHaveLength(1);
		visible.checked = false;
		properties.ok();
		await vi.waitFor(() => expect(properties.dialog().open).toBe(false));
		expect(root.querySelectorAll('svg [data-shape-id]')).toHaveLength(0);
		expect(viewer.controller.state.layerVisibilityOverrides).toHaveLength(1);
		// Putting the box back to the saved value removes the override.
		properties.open();
		expect(properties.box('1', '0', 'visible').checked).toBe(false);
		properties.box('1', '0', 'visible').checked = true;
		properties.ok();
		await vi.waitFor(() => expect(properties.dialog().open).toBe(false));
		expect(root.querySelectorAll('svg [data-shape-id]')).toHaveLength(1);
		expect(viewer.controller.state.layerVisibilityOverrides).toHaveLength(0);
		viewer.destroy();
	});
	it('renders background same-ID overrides independently, without source mutation or saved snapshot changes', () => {
		const source = model(),
			before = structuredClone(source),
			viewer = mountViewer(document.createElement('div'), { document: source });
		const svgBefore = viewer.exportSvg().svg;
		const printBefore = viewer.createPrintSnapshot().pages[0]!.svg;
		viewer.setLayerVisibility('1', '0', false);
		viewer.setLayerVisibility('2', '0', true);
		expect(drawingIds(viewer.element.shadowRoot!.querySelector('svg.paper')!)).toEqual(['2:same']);
		expect(viewer.exportSvg().svg).toBe(svgBefore);
		expect(viewer.createPrintSnapshot().pages[0]!.svg).toBe(printBefore);
		expect(source).toEqual(before);
		viewer.resetLayerVisibility();
		expect(drawingIds(viewer.element.shadowRoot!.querySelector('svg.paper')!)).toEqual(['1:same']);
		viewer.destroy();
	});
	it('reconnects listeners once, preserves overrides and guards both handle surfaces after destruction', async () => {
		const host = document.createElement('div');
		document.body.append(host);
		const viewer = mountViewer(host, { document: model() }),
			set = vi.spyOn(viewer.controller, 'setLayerVisibility');
		viewer.setLayerVisibility('1', '0', false);
		viewer.element.remove();
		host.append(viewer.element);
		viewer.element.remove();
		host.append(viewer.element);
		// The override survives reconnecting, and the dialog still drives one set of listeners.
		const properties = layerProperties(viewer.element.shadowRoot!);
		properties.open();
		const input = properties.box('1', '0', 'visible');
		expect(input.checked).toBe(false);
		input.checked = true;
		const calls = set.mock.calls.length;
		properties.ok();
		await vi.waitFor(() => expect(properties.dialog().open).toBe(false));
		expect(set.mock.calls.length).toBeGreaterThan(calls);
		expect(viewer.controller.state.layerVisibilityOverrides).toHaveLength(0);
		viewer.destroy();
		for (const command of [
			() => viewer.setLayerVisibility('1', '0', false),
			() => viewer.resetLayerVisibility(),
			() => viewer.element.setLayerVisibility('1', '0', false),
			() => viewer.element.resetLayerVisibility(),
		])
			expect(command).toThrow('destroyed');
	});
	it('bounds the table, treats hostile labels as text and resets overrides away from their page', () => {
		const source = model();
		source.pages[0]!.layers = Array.from({ length: VIEWER_LAYER_LIMITS.controls + 1 }, (_, i) => ({
			...layer(String(i)),
			name: '<img src=x onerror=alert(1)>',
		}));
		const viewer = mountViewer(document.createElement('div'), { document: source }),
			root = viewer.element.shadowRoot!;
		const properties = layerProperties(root);
		properties.open();
		expect(properties.dialog().querySelectorAll('tr[data-layer-id]')).toHaveLength(
			VIEWER_LAYER_LIMITS.controls,
		);
		expect(
			[...properties.dialog().querySelectorAll('tbody th[scope="row"]')].map(
				(cell) => cell.textContent,
			),
		).toContain('<img src=x onerror=alert(1)>');
		expect(properties.dialog().querySelector('img')).toBeNull();
		viewer.setLayerVisibility('1', '200', false);
		viewer.update({ pageIndex: 1 });
		viewer.resetLayerVisibility();
		expect(viewer.controller.state.layerVisibilityOverrides).toHaveLength(0);
		viewer.destroy();
	});
	it('retains foreground and visible group containers while pruning layer-hidden descendants', () => {
		const source = model();
		source.pages[0]!.shapes = [
			shape('group', {
				kind: 'group',
				groupDisplayMode: 0,
				layerIds: [],
				children: [shape('child')],
			}),
		];
		const viewer = mountViewer(document.createElement('div'), { document: source });
		expect(drawingIds(viewer.element.shadowRoot!.querySelector('svg.paper')!)).toEqual([
			'1:group',
			'1:child',
		]);
		viewer.controller.selectShape({ id: 'group', name: 'group', pageId: '1' });
		expect(viewer.controller.state.selectedShape?.id).toBe('group');
		viewer.setLayerVisibility('1', '0', false);
		expect(drawingIds(viewer.element.shadowRoot!.querySelector('svg.paper')!)).toEqual([]);
		expect(viewer.controller.state.selectedShape).toBeNull();
		viewer.resetLayerVisibility();
		expect(drawingIds(viewer.element.shadowRoot!.querySelector('svg.paper')!)).toEqual([
			'1:group',
			'1:child',
		]);
		viewer.destroy();
	});
});
