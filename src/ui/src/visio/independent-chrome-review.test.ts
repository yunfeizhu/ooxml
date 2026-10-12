import { afterEach, describe, expect, it } from 'vitest';
import { mountViewer, type MountedViewer } from './binding';
import { demoDocument } from 'ooxml-core/visio/ui';

const mounted: MountedViewer[] = [];
afterEach(() => {
	for (const viewer of mounted.splice(0)) viewer.destroy();
	document.body.replaceChildren();
});
function setup() {
	const host = document.createElement('div');
	document.body.append(host);
	const viewer = mountViewer(host, { document: structuredClone(demoDocument) });
	mounted.push(viewer);
	const root = viewer.element.shadowRoot!;
	const button = (selector: string) => root.querySelector<HTMLButtonElement>(selector)!;
	/** The shared ribbon renders File and the tabs in its own shadow root. */
	const ribbonRoot = () => root.querySelector('office-ui-ribbon')!.shadowRoot!;
	const tab = (id: string) =>
		ribbonRoot().querySelector<HTMLButtonElement>(`[role="tab"][data-tab="${id}"]`)!;
	return { viewer, root, button, ribbonRoot, tab };
}
describe('independent shared-chrome regression review', () => {
	it('inserts hostile page names as text, including updated document replacements', () => {
		const { viewer, root } = setup();
		const doc = structuredClone(demoDocument);
		doc.pages[0]!.name = '<img src=x onerror=alert(1)> & "Page"';
		viewer.update({ document: doc });
		const strip = root.querySelector('office-ui-tab-strip')!.shadowRoot!;
		expect(strip.querySelector('[role="tab"]')!.textContent).toBe(doc.pages[0]!.name);
		const item = root.querySelector('[data-menu="all-pages"] office-ui-menu-item')!;
		expect(item.getAttribute('label')).toBe(doc.pages[0]!.name);
		expect(item.shadowRoot!.textContent).toContain(doc.pages[0]!.name);
		expect(strip.querySelector('img, [onerror]')).toBeNull();
		expect(item.shadowRoot!.querySelector('img, [onerror]')).toBeNull();
	});
	it('keeps page tabs, All pages, stepper and status on the same real page', () => {
		const { viewer, root } = setup();
		const strip = root.querySelector('office-ui-tab-strip')!.shadowRoot!;
		const step = (label: string) =>
			strip.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
		step('Next page').click();
		expect(viewer.controller.state.pageIndex).toBe(1);
		expect(strip.querySelector('[aria-selected="true"]')!.textContent).toBe(
			demoDocument.pages[1]!.name,
		);
		expect(root.querySelector('[data-page-status]')!.getAttribute('value')).toBe('Page 2 of 2');
		expect(
			root.querySelector('[data-menu="all-pages"] [command="page-1"]')!.getAttribute('checked'),
		).toBe('true');
		expect(step('Next page').disabled).toBe(true);
		root
			.querySelector('[data-menu="all-pages"] [command="page-0"]')!
			.shadowRoot!.querySelector('button')!
			.click();
		expect(viewer.controller.state.pageIndex).toBe(0);
		expect(step('Previous page').disabled).toBe(true);
	});
	it('moves tab focus and panel visibility together for keyboard navigation', () => {
		const { root, ribbonRoot, tab } = setup();
		tab('home').focus();
		tab('home').dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
		// Help is Visio's last tab; ArrowLeft steps back to View.
		expect(tab('help').getAttribute('aria-selected')).toBe('true');
		tab('help').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
		expect(ribbonRoot().activeElement).toBe(tab('view'));
		expect(tab('view').getAttribute('aria-selected')).toBe('true');
		expect(root.querySelector<HTMLElement>('#home-panel')!.hidden).toBe(true);
		expect(root.querySelector<HTMLElement>('#view-panel')!.hidden).toBe(false);
		tab('view').dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
		expect(ribbonRoot().activeElement).toBe(tab('home'));
	});
	it('preserves zoom and document while toggling panes and toolbar', () => {
		const { viewer, root, button } = setup();
		viewer.update({ zoom: 1.75 });
		const original = viewer.controller.state.document;
		// The task pane starts closed; the Shapes window toggles from its own collapse button.
		expect(root.querySelector<HTMLElement>('.inspector-pane')!.hidden).toBe(true);
		button('.pane-collapse[data-chrome="shapes"]').click();
		expect(root.querySelector<HTMLElement>('.shapes-pane')!.hidden).toBe(true);
		button('.shapes-strip').click();
		expect(root.querySelector<HTMLElement>('.shapes-pane')!.hidden).toBe(false);
		viewer.update({ showToolbar: false });
		expect(root.querySelector<HTMLElement>('.toolbar')!.hidden).toBe(true);
		expect(root.querySelector<HTMLElement>('.zoom-controls')!.hidden).toBe(true);
		viewer.update({ showToolbar: true });
		expect(root.querySelector<HTMLElement>('.zoom-controls')!.hidden).toBe(false);
		expect(viewer.controller.state.document).toBe(original);
		expect(viewer.controller.state.zoom).toBe(1.75);
	});
});
