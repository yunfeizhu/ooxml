// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { attachKeyTips, rulerDivisions, type OfficeBackstageItem } from './controls';
import { registerOfficeUi } from './index';

beforeAll(() => registerOfficeUi());
afterEach(() => {
	document.body.replaceChildren();
	vi.restoreAllMocks();
});

const key = (el: Element, k: string, init: KeyboardEventInit = {}) =>
	el.dispatchEvent(
		new KeyboardEvent('keydown', {
			key: k,
			bubbles: true,
			composed: true,
			cancelable: true,
			...init,
		}),
	);

function ribbon() {
	const el = document.createElement('office-ui-ribbon') as HTMLElement & {
		selected: string;
		focusFile(): void;
		setTabHidden(tab: string, reason: string, hidden: boolean): void;
		tabButton(tab: string): HTMLButtonElement | null;
		fileButton(): HTMLButtonElement | null;
	};
	el.setAttribute('label', 'Ribbon');
	el.innerHTML =
		'<div slot="quick-access"><button>Undo</button></div>' +
		'<div id="home-panel" data-ribbon-tab="home" data-label="Home" data-tab-keytip="H"><button>Bold</button></div>' +
		'<div id="view-panel" data-ribbon-tab="view" data-label="View" data-tab-keytip="W"><button data-keytip="G">Grid</button></div>';
	document.body.append(el);
	const tabs = () => [...el.shadowRoot!.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
	const file = el.shadowRoot!.querySelector<HTMLButtonElement>('.file')!;
	return { el, tabs, file };
}

describe('office-ui-ribbon', () => {
	it('builds tabs from panels and shows only the selected panel', () => {
		const { el, tabs } = ribbon();
		expect(tabs().map((tab) => tab.textContent)).toEqual(['Home', 'View']);
		expect(el.shadowRoot!.querySelector('[role="tablist"]')!.getAttribute('aria-label')).toBe(
			'Ribbon',
		);
		expect(tabs()[0]!.getAttribute('aria-selected')).toBe('true');
		expect(el.querySelector<HTMLElement>('#home-panel')!.hidden).toBe(false);
		expect(el.querySelector<HTMLElement>('#view-panel')!.hidden).toBe(true);
		expect(el.querySelector('#view-panel')!.getAttribute('role')).toBe('tabpanel');
		expect(tabs()[1]!.dataset.keytip).toBe('W');
		expect(tabs()[1]!.dataset.keytipPanel).toBe('view-panel');
	});

	it('places slot="actions" children at the right end of the tab row, before collapse', () => {
		const { el, tabs } = ribbon();
		const share = document.createElement('button');
		share.slot = 'actions';
		share.textContent = 'Share';
		el.append(share);
		const head = el.shadowRoot!.querySelector('.head')!;
		const slot = head.querySelector<HTMLSlotElement>('slot[name="actions"]')!;
		expect(slot.assignedElements()).toEqual([share]);
		expect(slot.getAttribute('part')).toBe('actions');
		const order = [...head.children].map(
			(node) => node.getAttribute('role') ?? node.getAttribute('name') ?? node.className,
		);
		expect(order.indexOf('actions')).toBeGreaterThan(order.indexOf('tablist'));
		expect(order.indexOf('actions')).toBe(order.indexOf('collapse') - 1);
		// An action is not a panel, so it never becomes a tab.
		expect(tabs().map((tab) => tab.textContent)).toEqual(['Home', 'View']);
		const css = (el.constructor as unknown as { styles: { cssText: string }[] }).styles
			.map((sheet) => sheet.cssText)
			.join('\n');
		expect(css).toMatch(/slot\[name='actions'\]\s*\{[^}]*margin-inline:\s*auto/u);
	});

	it('selects tabs by click and arrow keys unless the event is cancelled', () => {
		const { el, tabs } = ribbon();
		const seen: string[] = [];
		el.addEventListener('office-ribbon-select', (event) =>
			seen.push((event as CustomEvent).detail.tab),
		);
		tabs()[1]!.click();
		expect(el.selected).toBe('view');
		expect(el.querySelector<HTMLElement>('#home-panel')!.hidden).toBe(true);
		key(tabs()[1]!, 'ArrowRight');
		expect(el.selected).toBe('home');
		expect(el.shadowRoot!.activeElement).toBe(tabs()[0]);
		el.addEventListener('office-ribbon-select', (event) => event.preventDefault());
		tabs()[1]!.click();
		expect(el.selected).toBe('home');
		expect(seen).toEqual(['view', 'home', 'view']);
	});

	it('steps from the focused tab, not the selected one', () => {
		const { el, tabs } = ribbon();
		const third = document.createElement('div');
		third.dataset.ribbonTab = 'help';
		third.dataset.label = 'Help';
		el.append(third);
		return Promise.resolve().then(() => {
			tabs()[2]!.focus();
			key(tabs()[2]!, 'ArrowLeft');
			expect(el.selected).toBe('view');
			expect(el.shadowRoot!.activeElement).toBe(tabs()[1]);
		});
	});

	it('leaves out the tab of a panel marked data-tab-hidden and falls back when it was selected', async () => {
		const { el, tabs } = ribbon();
		el.selected = 'view';
		await Promise.resolve();
		const view = el.querySelector<HTMLElement>('#view-panel')!;
		view.dataset.tabHidden = '';
		await new Promise((resolve) => setTimeout(resolve, 0));
		await Promise.resolve();
		expect(tabs().map((tab) => tab.textContent)).toEqual(['Home']);
		expect(el.selected).toBe('home');
		expect(el.querySelector<HTMLElement>('#home-panel')!.hidden).toBe(false);
		delete view.dataset.tabHidden;
		await new Promise((resolve) => setTimeout(resolve, 0));
		await Promise.resolve();
		expect(tabs().map((tab) => tab.textContent)).toEqual(['Home', 'View']);
	});

	it('hides a tab until every reason that hides it is lifted', async () => {
		const { el, tabs } = ribbon();
		const settle = async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
			await Promise.resolve();
		};
		el.setTabHidden('view', 'contextual', true);
		el.setTabHidden('view', 'custom', true);
		await settle();
		expect(tabs().map((tab) => tab.textContent)).toEqual(['Home']);
		el.setTabHidden('view', 'contextual', false);
		await settle();
		expect(tabs().map((tab) => tab.textContent)).toEqual(['Home']);
		el.setTabHidden('view', 'custom', false);
		await settle();
		expect(tabs().map((tab) => tab.textContent)).toEqual(['Home', 'View']);
		expect(el.tabButton('view')?.textContent).toBe('View');
		expect(el.fileButton()).not.toBeNull();
	});

	it('collapses, peeks and closes the peek like Office', async () => {
		const { el } = ribbon();
		const changes: boolean[] = [];
		el.addEventListener('office-ribbon-collapse', (event) =>
			changes.push((event as CustomEvent<{ collapsed: boolean }>).detail.collapsed),
		);
		const home = el.querySelector<HTMLElement>('#home-panel')!;
		const view = el.querySelector<HTMLElement>('#view-panel')!;
		const collapse = () => el.shadowRoot!.querySelector<HTMLButtonElement>('.collapse')!;
		await Promise.resolve();
		expect(collapse().hidden).toBe(true);
		el.toggleAttribute('collapsible', true);
		await Promise.resolve();
		expect(collapse().hidden).toBe(false);
		collapse().click();
		await Promise.resolve();
		expect([el.hasAttribute('collapsed'), home.hidden, collapse().ariaPressed]).toEqual([
			true,
			true,
			'true',
		]);
		el.tabButton('view')!.click();
		await Promise.resolve();
		expect([el.hasAttribute('peek'), view.hidden]).toEqual([true, false]);
		el.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }),
		);
		await Promise.resolve();
		expect([el.hasAttribute('peek'), view.hidden]).toEqual([false, true]);
		el.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'F1', ctrlKey: true, bubbles: true, composed: true }),
		);
		await Promise.resolve();
		expect(el.hasAttribute('collapsed')).toBe(false);
		expect(changes).toEqual([true, false]);
	});

	it('marks the tab of a contextual panel so it can be tinted', async () => {
		const { el, tabs } = ribbon();
		el.querySelector<HTMLElement>('#view-panel')!.dataset.contextual = '';
		el.append(document.createElement('div'));
		await new Promise((resolve) => setTimeout(resolve, 0));
		await Promise.resolve();
		expect(tabs().map((tab) => tab.hasAttribute('data-contextual'))).toEqual([false, true]);
	});

	it('has a File button that reports activation and expansion', () => {
		const { el, file } = ribbon();
		const opened = vi.fn();
		el.addEventListener('office-ribbon-file', opened);
		expect(file.textContent).toBe('File');
		file.click();
		expect(opened).toHaveBeenCalledOnce();
		el.setAttribute('file-expanded', 'true');
		expect(file.getAttribute('aria-expanded')).toBe('true');
		el.setAttribute('no-file', '');
		expect(file.hidden).toBe(true);
	});

	it('lets KeyTips reach tabs inside the ribbon and open their panel level', async () => {
		vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
			DOMRect.fromRect({ x: 10, y: 10, width: 40, height: 20 }),
		);
		const { el } = ribbon();
		el.querySelector('#view-panel')!.setAttribute('data-keytip-level', '');
		el.querySelector('#home-panel')!.setAttribute('data-keytip-level', '');
		const grid = vi.fn();
		el.querySelector('[data-keytip="G"]')!.addEventListener('click', grid);
		const handle = attachKeyTips(document.body);
		key(document.body, 'Alt');
		document.body.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt', bubbles: true }));
		expect(handle.active).toBe(true);
		key(document.body, 'w');
		expect(el.getAttribute('selected')).toBe('view');
		await new Promise((resolve) => requestAnimationFrame(resolve));
		key(document.body, 'g');
		expect(grid).toHaveBeenCalledOnce();
		handle.dispose();
	});
});

describe('office-ui-find-bar', () => {
	function bar() {
		const el = document.createElement('office-ui-find-bar') as HTMLElement & {
			open: boolean;
			value: string;
			status: string;
			show(): void;
		};
		el.setAttribute('input-label', 'Search diagram text');
		el.setAttribute('maxlength', '256');
		document.body.append(el);
		const root = el.shadowRoot!;
		const input = root.querySelector('input')!;
		const events: string[] = [];
		for (const type of ['office-find-input', 'office-find-step', 'office-find-close'])
			el.addEventListener(type, (event) =>
				events.push(`${type}:${JSON.stringify((event as CustomEvent).detail)}`),
			);
		return { el, root, input, events };
	}

	it('labels the field and reports queries, steps and closing', () => {
		const { el, root, input, events } = bar();
		expect(el.open).toBe(false);
		el.show();
		expect(el.open).toBe(true);
		expect(input.getAttribute('aria-label')).toBe('Search diagram text');
		expect(input.maxLength).toBe(256);
		expect(input.getAttribute('aria-describedby')).toBe('status');
		input.value = 'flow';
		input.dispatchEvent(new Event('input'));
		key(input, 'Enter');
		key(input, 'Enter', { shiftKey: true });
		el.status = '1 of 2 matching shapes';
		expect(root.querySelector('[role="status"]')!.textContent).toBe('1 of 2 matching shapes');
		key(input, 'Escape');
		expect(el.open).toBe(true);
		key(input, 'Escape');
		expect(el.open).toBe(false);
		expect(events).toEqual([
			'office-find-input:{"query":"flow"}',
			'office-find-step:{"direction":"next"}',
			'office-find-step:{"direction":"previous"}',
			'office-find-input:{"query":""}',
			'office-find-close:{}',
		]);
	});

	it('disables stepping when there is nothing to step through', () => {
		const { el, root, events } = bar();
		el.setAttribute('navigation-disabled', '');
		const next = root.querySelector<HTMLButtonElement>('[data-action="next"]')!;
		expect(next.disabled).toBe(true);
		next.click();
		expect(events).toEqual([]);
	});
});

describe('office-ui-ruler', () => {
	it('is decorative and picks finer ticks as the scale grows', () => {
		const ruler = document.createElement('office-ui-ruler');
		ruler.setAttribute('orientation', 'vertical');
		ruler.setAttribute('origin', '120');
		ruler.setAttribute('direction', 'reverse');
		document.body.append(ruler);
		expect(ruler.getAttribute('aria-hidden')).toBe('true');
		expect(ruler.shadowRoot!.querySelector('canvas')).not.toBeNull();
		expect([24, 48, 96, 192].map(rulerDivisions)).toEqual([2, 4, 8, 16]);
	});
});

describe('office-ui-backstage', () => {
	const ITEMS: OfficeBackstageItem[] = [
		{ id: 'info', label: 'Info' },
		{ id: 'save', label: 'Save', disabled: true, title: 'Nothing to save' },
		{ id: 'close', label: 'Close' },
		{ id: 'options', label: 'Options', group: 'footer' },
	];
	function backstage() {
		const el = document.createElement('office-ui-backstage') as HTMLElement & {
			items: OfficeBackstageItem[];
			open: boolean;
			selected: string;
			show(page?: string): void;
		};
		el.innerHTML =
			'<section data-backstage-page="info"><h1>Info</h1></section>' +
			'<section data-backstage-page="options"><h1>Options</h1></section>';
		document.body.append(el);
		el.items = ITEMS;
		const item = (id: string) =>
			el.shadowRoot!.querySelector<HTMLButtonElement>(`[data-backstage-item="${id}"]`)!;
		return { el, item };
	}

	it('opens on the first page, lists footer items last and shows one page', () => {
		const { el, item } = backstage();
		el.show();
		expect(el.open).toBe(true);
		expect(el.selected).toBe('info');
		expect(item('info').getAttribute('aria-current')).toBe('page');
		expect(el.shadowRoot!.activeElement).toBe(item('info'));
		expect(item('save').disabled).toBe(true);
		expect(item('save').title).toBe('Nothing to save');
		expect(item('options').parentElement!.className).toBe('footer');
		expect(item('info').parentElement!.className).toBe('items');
		expect(el.querySelector<HTMLElement>('[data-backstage-page="options"]')!.hidden).toBe(true);
		item('options').click();
		expect(el.querySelector<HTMLElement>('[data-backstage-page="info"]')!.hidden).toBe(true);
		expect(el.shadowRoot!.querySelector('[role="dialog"]')!.getAttribute('aria-label')).toBe(
			'File',
		);
	});

	it('reports commands without pages and closes from Back or Escape', () => {
		const { el, item } = backstage();
		const chosen: string[] = [];
		const closed: string[] = [];
		el.addEventListener('office-backstage-select', (event) =>
			chosen.push((event as CustomEvent).detail.id),
		);
		el.addEventListener('office-backstage-close', (event) =>
			closed.push((event as CustomEvent).detail.reason),
		);
		el.show('info');
		item('close').click();
		expect(chosen).toEqual(['close']);
		expect(el.selected).toBe('info');
		key(item('info'), 'Escape');
		expect(el.open).toBe(false);
		el.show();
		el.shadowRoot!.querySelector<HTMLButtonElement>('[data-backstage="back"]')!.click();
		expect(closed).toEqual(['escape', 'back']);
	});
});

describe('office-ui-print-preview', () => {
	it('shows an inert clone of the current page and steps through pages', () => {
		const preview = document.createElement('office-ui-print-preview') as HTMLElement & {
			pages: Node[];
			index: number;
		};
		document.body.append(preview);
		const root = preview.shadowRoot!;
		expect(root.querySelector('.empty')!.textContent).toBe('Nothing to print.');
		const page = (name: string) => {
			const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
			svg.setAttribute('style', 'width:900px');
			svg.setAttribute('data-name', name);
			const shape = document.createElementNS('http://www.w3.org/2000/svg', 'g');
			shape.setAttribute('tabindex', '0');
			svg.append(shape);
			return svg;
		};
		const first = page('one');
		preview.pages = [first, page('two')];
		const shown = root.querySelector('.sheet svg')!;
		expect(shown).not.toBe(first);
		expect(shown.getAttribute('data-name')).toBe('one');
		expect(shown.hasAttribute('style')).toBe(false);
		expect(shown.querySelector('[tabindex]')).toBeNull();
		expect(first.querySelector('[tabindex]')).not.toBeNull();
		const steps: number[] = [];
		preview.addEventListener('office-print-preview-page', (event) =>
			steps.push((event as CustomEvent).detail.index),
		);
		root.querySelector<HTMLButtonElement>('[aria-label="Next page"]')!.click();
		expect(root.querySelector('.sheet svg')!.getAttribute('data-name')).toBe('two');
		expect(root.querySelector('.nav span')!.textContent).toBe('2 of 2');
		expect(steps).toEqual([1]);
	});
});
