// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { registerOfficeUi } from '../index';
import { OfficeUiMenuButton } from './menu-button';
import { OfficeUiMenuItem } from './menu-item';

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
const commands = () => {
	const seen: string[] = [];
	document.body.addEventListener('office-command', (e) =>
		seen.push((e as CustomEvent).detail.command),
	);
	return seen;
};
type MenuButton = HTMLElement & { open: boolean; disabled: boolean };

describe('office-ui-menu-button', () => {
	it('retains keyboard navigation in product subclasses with custom tags', () => {
		customElements.define('test-product-menu', class extends OfficeUiMenuButton {});
		customElements.define('test-product-item', class extends OfficeUiMenuItem {});
		const root = make<MenuButton>(
			'<test-product-menu label="Position"><test-product-item label="First" command="first"></test-product-item><test-product-menu submenu label="Rotate"><test-product-item label="Left" command="left"></test-product-item></test-product-menu></test-product-menu>',
		);
		const nested = root.querySelector<MenuButton>('[submenu]')!;
		root.shadowRoot!.querySelector<HTMLButtonElement>('.main')!.click();
		key(root.querySelector('test-product-item')!, 'ArrowDown');
		expect(document.activeElement).toBe(nested);
		key(nested.shadowRoot!.querySelector('.main')!, 'ArrowRight');
		expect(document.activeElement).toBe(nested.querySelector('test-product-item'));
	});
	it('keeps nested navigation local, returns to its parent and closes the whole tree on choice', () => {
		const root = make<MenuButton>(`<office-ui-menu-button label="Position">
			<office-ui-menu-item label="Align" command="align"></office-ui-menu-item>
			<office-ui-menu-button submenu label="Rotate Shapes">
				<office-ui-menu-item label="Left" command="left"></office-ui-menu-item>
				<office-ui-menu-item label="Unavailable" command="skip" disabled></office-ui-menu-item>
				<office-ui-menu-item label="Right" command="right"></office-ui-menu-item>
			</office-ui-menu-button>
		</office-ui-menu-button>`);
		const seen = commands();
		const nested = root.querySelector<MenuButton>('[submenu]')!;
		const children = [...nested.querySelectorAll('office-ui-menu-item')];
		root.shadowRoot!.querySelector<HTMLButtonElement>('.main')!.click();
		key(root.querySelector('office-ui-menu-item')!, 'ArrowDown');
		expect(document.activeElement).toBe(nested);
		expect(nested.shadowRoot!.querySelector('.main')!.getAttribute('role')).toBe('menuitem');
		key(nested.shadowRoot!.querySelector('.main')!, 'ArrowRight');
		expect(nested.open).toBe(true);
		expect(root.open).toBe(true);
		expect(document.activeElement).toBe(children[0]);
		key(children[0]!, 'ArrowDown');
		expect(document.activeElement).toBe(children[2]);
		key(children[2]!, 'ArrowLeft');
		expect(nested.open).toBe(false);
		expect(root.open).toBe(true);
		expect(document.activeElement).toBe(nested);
		nested.shadowRoot!.querySelector('.main')!.dispatchEvent(new Event('pointerenter'));
		expect(nested.open).toBe(true);
		// Hover must not steal focus from the parent, and clicking the hovered trigger keeps it open.
		expect(document.activeElement).toBe(nested);
		nested.shadowRoot!.querySelector<HTMLButtonElement>('.main')!.click();
		expect(nested.open).toBe(true);
		key(children[0]!, 'Escape');
		expect(nested.open).toBe(false);
		expect(root.open).toBe(true);
		key(nested.shadowRoot!.querySelector('.main')!, 'ArrowRight');
		children[2]!.shadowRoot!.querySelector<HTMLButtonElement>('button')!.click();
		expect(seen).toEqual(['right']);
		expect(root.open).toBe(false);
		expect(nested.open).toBe(false);
	});
	const markup = (extra = '') =>
		`<office-ui-menu-button label="Layers" icon="copy"${extra}>
			<office-ui-menu-item command="layer-properties" label="Layer Properties"></office-ui-menu-item>
			<office-ui-menu-item command="assign" label="Assign to Layer" disabled></office-ui-menu-item>
			<office-ui-menu-item command="grid" label="Grid" checked="true"></office-ui-menu-item>
		</office-ui-menu-button>`;

	it('opens a menu, moves focus with arrows and closes after a choice that bubbles', () => {
		const el = make<MenuButton>(markup());
		const seen = commands();
		const main = el.shadowRoot!.querySelector<HTMLButtonElement>('.main')!;
		expect(main.getAttribute('aria-haspopup')).toBe('menu');
		// One control, one accessible name: the caret is decorative here.
		expect(el.shadowRoot!.querySelector('.caret')!.getAttribute('aria-hidden')).toBe('true');
		main.click();
		expect(el.open).toBe(true);
		expect(main.getAttribute('aria-expanded')).toBe('true');
		const items = [...el.querySelectorAll('office-ui-menu-item')];
		expect(document.activeElement).toBe(items[0]);
		key(items[0]!, 'ArrowDown');
		// The disabled item is skipped.
		expect(document.activeElement).toBe(items[2]);
		expect(items[2]!.shadowRoot!.querySelector('button')!.getAttribute('role')).toBe(
			'menuitemcheckbox',
		);
		items[2]!.shadowRoot!.querySelector('button')!.click();
		expect(seen).toEqual(['grid']);
		expect(el.open).toBe(false);
	});

	it('acts as a split button when it has its own command', () => {
		const el = make<MenuButton>(markup(' command="layers-pane"'));
		const seen = commands();
		el.shadowRoot!.querySelector<HTMLButtonElement>('.main')!.click();
		expect(seen).toEqual(['layers-pane']);
		expect(el.open).toBe(false);
		const caret = el.shadowRoot!.querySelector<HTMLButtonElement>('.caret')!;
		expect(caret.getAttribute('aria-label')).toBe('Layers options');
		caret.click();
		expect(el.open).toBe(true);
		key(el.querySelector('office-ui-menu-item')!, 'Escape');
		expect(el.open).toBe(false);
	});

	it('keeps an accessible name when icon-only', () => {
		const el = make<MenuButton>(markup(' icon-only command="layers-pane"'));
		const main = el.shadowRoot!.querySelector<HTMLButtonElement>('.main')!;
		expect(main.getAttribute('aria-label')).toBe('Layers');
		expect(main.querySelector('span')!.hidden).toBe(true);
	});
	it('disables the split command while its menu stays keyboard accessible', () => {
		const el = make<MenuButton>(markup(' command="layers-pane" main-disabled'));
		const seen = commands();
		const main = el.shadowRoot!.querySelector<HTMLButtonElement>('.main')!;
		const caret = el.shadowRoot!.querySelector<HTMLButtonElement>('.caret')!;
		expect(main.disabled).toBe(true);
		expect(caret.disabled).toBe(false);
		main.click();
		expect(seen).toEqual([]);
		el.focus();
		expect(el.shadowRoot!.activeElement).toBe(caret);
		key(caret, 'ArrowDown');
		expect(el.open).toBe(true);
		el.querySelector('office-ui-menu-item')!
			.shadowRoot!.querySelector<HTMLButtonElement>('button')!
			.click();
		expect(seen).toEqual(['layer-properties']);
		expect(el.open).toBe(false);
		el.setAttribute('disabled', '');
		expect(caret.disabled).toBe(true);
		caret.click();
		expect(el.open).toBe(false);
	});
	it('ignores main-disabled on an ordinary dropdown', () => {
		const el = make<MenuButton>(markup(' main-disabled'));
		const main = el.shadowRoot!.querySelector<HTMLButtonElement>('.main')!;
		expect(main.disabled).toBe(false);
		main.click();
		expect(el.open).toBe(true);
	});

	it('stays closed and silent when disabled', () => {
		const el = make<MenuButton>(markup(' disabled'));
		const seen = commands();
		el.shadowRoot!.querySelector<HTMLButtonElement>('.main')!.click();
		el.shadowRoot!.querySelector<HTMLButtonElement>('.caret')!.click();
		expect(el.open).toBe(false);
		expect(seen).toEqual([]);
	});
});

describe('office-ui-ribbon-stack and group launcher', () => {
	it('lays out small commands and emits the launcher command', () => {
		const group = make(
			'<office-ui-ribbon-group label="Font" launcher="font-dialog"><office-ui-ribbon-stack orientation="horizontal"><office-ui-button label="Bold" icon="bold" icon-only command="bold"></office-ui-button></office-ui-ribbon-stack></office-ui-ribbon-group>',
		);
		const seen = commands();
		const launcher = group.shadowRoot!.querySelector<HTMLButtonElement>('.launcher')!;
		expect(launcher.hidden).toBe(false);
		expect(launcher.getAttribute('aria-label')).toBe('Font options');
		launcher.click();
		expect(seen).toEqual(['font-dialog']);
		group.setAttribute('launcher-disabled', '');
		launcher.click();
		expect(seen).toHaveLength(1);
		group.removeAttribute('launcher');
		expect(launcher.hidden).toBe(true);
		expect(
			group.querySelector('office-ui-ribbon-stack')!.shadowRoot!.querySelector('slot'),
		).not.toBeNull();
	});
});
