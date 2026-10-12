// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountViewer } from './binding';
import { demoDocument } from 'ooxml-core/visio/ui';

type Slider = HTMLElement & { value: number; disabled: boolean };
function setup() {
	const host = document.createElement('div');
	document.body.append(host);
	const viewer = mountViewer(host, { document: demoDocument });
	const root = viewer.element.shadowRoot!;
	const button = (selector: string) => root.querySelector<HTMLButtonElement>(selector)!;
	/** The shared ribbon renders File and the tabs in its own shadow root. */
	const ribbonRoot = () => root.querySelector('office-ui-ribbon')!.shadowRoot!;
	const tab = (id: string) =>
		ribbonRoot().querySelector<HTMLButtonElement>(`[role="tab"][data-tab="${id}"]`)!;
	/** Shared ribbon command host element and the real button inside it. */
	const command = (name: string) =>
		root.querySelector<HTMLElement & { disabled: boolean }>(`[command="${name}"]`)!;
	const press = (name: string) =>
		command(name).shadowRoot!.querySelector<HTMLButtonElement>('.main, button')!.click();
	const strip = () => root.querySelector('office-ui-tab-strip')!.shadowRoot!;
	const slider = () => root.querySelector<Slider>('office-ui-zoom-slider')!;
	const zoomButton = (label: string) =>
		slider().shadowRoot!.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
	return {
		host,
		viewer,
		root,
		button,
		command,
		press,
		strip,
		slider,
		zoomButton,
		ribbonRoot,
		tab,
	};
}
afterEach(() => {
	document.body.replaceChildren();
	vi.restoreAllMocks();
});

describe('shared Office-style viewer chrome', () => {
	it('uses one canvas and Visio page tabs, All pages and status instead of a page pane', () => {
		const { viewer, root, strip } = setup();
		expect(root.querySelectorAll('svg.paper')).toHaveLength(1);
		expect(root.querySelector('.page-rail, .page-link')).toBeNull();
		const all = root.querySelector('[data-menu="all-pages"]')!;
		const items = [...all.querySelectorAll('office-ui-menu-item')];
		expect(items.map((item) => item.getAttribute('label'))).toEqual([
			'Release workflow',
			'Architecture',
			'Reorder Pages...',
			'Rename Page...',
			'Delete Page...',
		]);
		expect(items[0]!.getAttribute('checked')).toBe('true');
		items[1]!.shadowRoot!.querySelector('button')!.click();
		expect(viewer.element.pageIndex).toBe(1);
		expect(items[1]!.getAttribute('checked')).toBe('true');
		expect(strip().querySelector('[aria-selected="true"]')!.textContent).toBe('Architecture');
		expect(root.querySelector('[data-page-status]')!.getAttribute('value')).toBe('Page 2 of 2');
		strip().querySelectorAll<HTMLButtonElement>('[role="tab"]')[0]!.click();
		expect(viewer.element.pageIndex).toBe(0);
		strip().querySelector<HTMLButtonElement>('[aria-label="Next page"]')!.click();
		expect(viewer.element.pageIndex).toBe(1);
		// Model-only scenes cannot save inserted pages.
		const add = strip().querySelector<HTMLButtonElement>('.add')!;
		expect(add.hidden).toBe(false);
		expect(add.disabled).toBe(true);
		expect(add.title).toMatch(/open a \.vsdx file/);
		const model = structuredClone(demoDocument);
		model.pages[0]!.name = '<img src=x onerror=alert(1)>';
		viewer.update({ document: model });
		expect(strip().querySelector('[role="tab"]')!.textContent).toBe(model.pages[0]!.name);
		expect(root.querySelector('img')).toBeNull();
		expect(strip().querySelector('img')).toBeNull();
		viewer.destroy();
	});
	it('opens the File backstage with real Info, Save and Close and disabled Visio pages', () => {
		const { viewer, root, ribbonRoot } = setup();
		const file = ribbonRoot().querySelector<HTMLButtonElement>('.file')!;
		const backstage = root.querySelector<HTMLElement & { open: boolean }>('office-ui-backstage')!;
		const item = (id: string) =>
			backstage.shadowRoot!.querySelector<HTMLButtonElement>(`[data-backstage-item="${id}"]`)!;
		expect(backstage.open).toBe(false);
		file.click();
		expect(backstage.open).toBe(true);
		expect(file.getAttribute('aria-expanded')).toBe('true');
		const info = root.querySelector<HTMLElement>('[data-backstage-page="info"]')!;
		expect(info.hidden).toBe(false);
		expect(info.querySelector('[data-info="pages"]')!.textContent).toBe('2');
		expect(info.querySelector('[data-info="state"]')!.textContent).toBe('Preview (read-only)');
		// The sample is model-only, so Save has nothing to save.
		expect(item('save').disabled).toBe(true);
		item('new').click();
		const blank = root.querySelector<HTMLButtonElement>('[data-backstage-action="new-blank"]')!;
		expect(blank.disabled).toBe(false);
		expect(blank.title).toBe('');
		item('export').click();
		expect(
			root.querySelector<HTMLButtonElement>(
				'[data-backstage-page="export"] [data-backstage-action="export-svg"]',
			)!.disabled,
		).toBe(false);
		item('export').dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }),
		);
		expect(backstage.open).toBe(false);
		expect(file.getAttribute('aria-expanded')).toBe('false');
		expect(ribbonRoot().activeElement).toBe(file);
		file.click();
		item('close').click();
		expect(viewer.element.document).toBeNull();
		expect(backstage.open).toBe(false);
		viewer.destroy();
	});
	it('provides real keyboard tabs and working pane toggles without changing zoom', () => {
		const { viewer, root, command, press, ribbonRoot, tab } = setup();
		viewer.element.zoom = 1.7;
		tab('home').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
		expect(tab('insert').getAttribute('aria-selected')).toBe('true');
		expect(ribbonRoot().activeElement).toBe(tab('insert'));
		tab('insert').dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
		// Help is Visio's last tab; ArrowLeft steps back to View.
		expect(tab('help').getAttribute('aria-selected')).toBe('true');
		tab('help').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
		expect(tab('view').getAttribute('aria-selected')).toBe('true');
		expect(ribbonRoot().activeElement).toBe(tab('view'));
		expect(root.querySelector<HTMLElement>('#home-panel')!.hidden).toBe(true);
		expect(root.querySelector<HTMLElement>('#view-panel')!.hidden).toBe(false);
		// Visio's default: the Shapes window is open.
		const shapes = root.querySelector<HTMLElement>('.shapes-pane')!;
		expect(shapes.hidden).toBe(false);
		press('shapes');
		expect(shapes.hidden).toBe(true);
		expect(command('shapes').getAttribute('checked')).toBe('false');
		press('shapes');
		expect(shapes.hidden).toBe(false);
		// Task panes open on request, as in Visio: Shape Data is one titled pane with a close button.
		const pane = root.querySelector<HTMLElement>('.inspector-pane')!;
		expect(pane.hidden).toBe(true);
		press('shape-data');
		expect(pane.hidden).toBe(false);
		expect(pane.getAttribute('label')).toBe('Shape Data');
		expect(command('shape-data').getAttribute('checked')).toBe('true');
		expect(pane.querySelector('.selection-hint')!.textContent).toBe('No Shape Data');
		expect(viewer.element.zoom).toBe(1.7);
		pane.shadowRoot!.querySelector<HTMLButtonElement>('.close')!.click();
		expect(pane.hidden).toBe(true);
		expect(command('shape-data').getAttribute('checked')).toBe('false');
		expect(root.activeElement).toBe(root.querySelector('.viewport'));
		viewer.destroy();
	});
	it('drives zoom from the status slider and View commands and hides it with the toolbar', () => {
		const { viewer, root, press, slider, zoomButton } = setup();
		expect(slider().value).toBe(100);
		zoomButton('Zoom in').click();
		expect(viewer.element.zoom).toBeCloseTo(1.1);
		zoomButton('Zoom out').click();
		expect(viewer.element.zoom).toBe(1);
		const range = slider().shadowRoot!.querySelector('input')!;
		range.value = '250';
		range.dispatchEvent(new Event('input'));
		expect(viewer.element.zoom).toBe(2.5);
		press('zoom-100');
		expect(viewer.element.zoom).toBe(1);
		viewer.element.zoom = 2;
		expect(slider().value).toBe(200);
		viewer.update({ showToolbar: false });
		expect(root.querySelector<HTMLElement>('.toolbar')!.hidden).toBe(true);
		expect(slider().hidden).toBe(true);
		viewer.update({ showToolbar: true });
		expect(slider().hidden).toBe(false);
		viewer.destroy();
	});
	it('uses disabled states honestly and keeps a model-only drawing out of text editing', () => {
		const { viewer, root, command, slider, tab } = setup();
		expect(command('layer-properties').hasAttribute('disabled')).toBe(true);
		// The sample is a model-only document: no source bytes means no drawing or deletion.
		expect(command('rectangle').disabled).toBe(true);
		// The Quick Access Toolbar is in the title bar: Save, Undo and Redo, all unavailable here.
		const quick = [
			...root
				.querySelector('office-ui-title-bar')!
				.shadowRoot!.querySelectorAll<HTMLButtonElement>('.qat button'),
		];
		expect(quick.map((item) => item.getAttribute('aria-label'))).toEqual(['Save', 'Undo', 'Redo']);
		expect(quick.every((item) => item.disabled)).toBe(true);
		// Formatting requires source bytes and explains how to enable it.
		expect(command('bold').disabled).toBe(true);
		expect(command('bold').getAttribute('title')).toMatch(/Open a .vsdx file/);
		root
			.querySelector<HTMLElement>('.viewport')!
			.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true, composed: true }));
		// F2 edits text in place; without a selection or source bytes no editor opens.
		expect(root.querySelector('#edit-text')).toBeNull();
		viewer.controller.selectShape({ id: 's1', name: 'Start', pageId: '1' });
		root
			.querySelector<HTMLElement>('.viewport')!
			.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true, composed: true }));
		expect(root.querySelector('#edit-text')).toBeNull();
		expect(root.querySelector('[data-status]')!.textContent).toBe('This drawing cannot be edited.');
		// Visio's status bar: the selection's Width, Height and Angle, then the language.
		const status = (name: string) =>
			root.querySelector(`[data-${name}-status]`)!.getAttribute('value');
		expect(status('width')).toBe('Width: 2.8 in.');
		expect(status('height')).toBe('Height: 0.7 in.');
		expect(status('angle')).toBe('Angle: 0°');
		expect(status('language')).toMatch(/^[A-Z]/);
		viewer.update({ document: null });
		expect(root.querySelectorAll('.page-link')).toHaveLength(0);
		expect(command('zoom-fit').disabled).toBe(true);
		expect(slider().disabled).toBe(true);
		expect(tab('view').disabled).toBe(false);
		viewer.destroy();
	});
	it('aborts chrome, command and zoom listeners, then reconnects exactly one set', () => {
		const { host, viewer, root, press, strip, zoomButton } = setup();
		const grid = () => root.querySelector<HTMLElement>('[data-check="grid"]')!.click();
		const next = () =>
			strip().querySelector<HTMLButtonElement>('[aria-label="Next page"]')!.click();
		viewer.element.remove();
		zoomButton('Zoom in').click();
		grid();
		expect(viewer.element.zoom).toBe(1);
		expect(root.querySelector<HTMLElement>('.viewport')!.dataset.grid).not.toBe('true');
		host.append(viewer.element);
		press('zoom-100');
		viewer.element.zoom = 1.25;
		grid();
		expect(root.querySelector<HTMLElement>('.viewport')!.dataset.grid).toBe('true');
		viewer.element.remove();
		host.append(viewer.element);
		grid();
		expect(root.querySelector<HTMLElement>('.viewport')!.dataset.grid).toBe('false');
		next();
		expect(viewer.element.pageIndex).toBe(1);
		const zoomIn = zoomButton('Zoom in');
		const inspector = root
			.querySelector('[command="shapes"]')!
			.shadowRoot!.querySelector('button')!;
		viewer.destroy();
		zoomIn.click();
		inspector.click();
		expect(root.children).toHaveLength(0);
	});
	it('fits to computed canvas padding and never enlarges the normal fit view', () => {
		const { viewer, root } = setup();
		const viewport = root.querySelector<HTMLElement>('.viewport')!;
		viewport.style.padding = '16px 4px';
		Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 1000 });
		Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 1000 });
		viewer.fit();
		expect(viewer.element.zoom).toBe(1);
		Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 416 });
		viewer.fit();
		expect(viewer.element.zoom).toBe(0.5);
		viewer.destroy();
	});
});
