// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { registerOfficeUi, type OfficeTab } from '../index';

beforeAll(() => registerOfficeUi());
afterEach(() => document.body.replaceChildren());

const make = <T extends HTMLElement>(html: string): T => {
	document.body.innerHTML = html;
	return document.body.firstElementChild as T;
};
const key = (el: Element, k: string) =>
	el.dispatchEvent(
		new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true }),
	);
type ContextMenu = HTMLElement & {
	open: boolean;
	openAt(x: number, y: number): void;
	close(): void;
};

describe('office-ui-context-menu', () => {
	const markup = `<office-ui-context-menu label="Shape">
		<office-ui-menu-item command="cut" label="Cut" disabled></office-ui-menu-item>
		<office-ui-menu-item command="edit-text" label="Edit Text"></office-ui-menu-item>
		<office-ui-menu-separator></office-ui-menu-separator>
		<office-ui-menu-item command="shape-data" label="Shape Data"></office-ui-menu-item>
	</office-ui-context-menu>`;

	it('opens at a point, skips disabled items and closes after a choice that bubbles', () => {
		const opener = document.createElement('button');
		const menu = make<ContextMenu>(markup);
		document.body.append(opener);
		opener.focus();
		const seen: string[] = [];
		document.body.addEventListener('office-command', (e) =>
			seen.push((e as CustomEvent).detail.command),
		);
		menu.openAt(40, 50);
		expect(menu.open).toBe(true);
		const panel = menu.shadowRoot!.querySelector<HTMLElement>('[role="menu"]')!;
		expect(panel.getAttribute('aria-label')).toBe('Shape');
		expect(panel.style.left).toBe('40px');
		const items = [...menu.querySelectorAll('office-ui-menu-item')];
		expect(document.activeElement).toBe(items[1]);
		key(items[1]!, 'ArrowDown');
		expect(document.activeElement).toBe(items[2]);
		expect(menu.querySelector('office-ui-menu-separator')!.getAttribute('role')).toBe('separator');
		items[2]!.shadowRoot!.querySelector('button')!.click();
		expect(seen).toEqual(['shape-data']);
		expect(menu.open).toBe(false);
		expect(document.activeElement).toBe(opener);
	});

	it('closes with Escape', () => {
		const menu = make<ContextMenu>(markup);
		menu.openAt(0, 0);
		key(menu.querySelectorAll('office-ui-menu-item')[1]!, 'Escape');
		expect(menu.open).toBe(false);
	});
});

describe('office-ui-tab-strip add button', () => {
	it('is hidden by default, emits tab-add and can be disabled with a reason', () => {
		const strip = make<HTMLElement & { tabs: OfficeTab[] }>(
			'<office-ui-tab-strip label="Pages"></office-ui-tab-strip>',
		);
		strip.tabs = [{ id: '0', label: 'Page-1' }];
		const add = strip.shadowRoot!.querySelector<HTMLButtonElement>('.add')!;
		expect(add.hidden).toBe(true);
		const seen: string[] = [];
		strip.addEventListener('office-command', (e) => seen.push((e as CustomEvent).detail.command));
		strip.setAttribute('add-label', 'Insert Page');
		expect(add.hidden).toBe(false);
		expect(add.getAttribute('aria-label')).toBe('Insert Page');
		add.click();
		expect(seen).toEqual(['tab-add']);
		strip.setAttribute('add-title', 'Insert Page: not available yet');
		strip.setAttribute('add-disabled', '');
		add.click();
		expect(seen).toHaveLength(1);
		expect(add.title).toBe('Insert Page: not available yet');
	});
});
