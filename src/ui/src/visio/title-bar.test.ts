// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoDocument } from 'ooxml-core/visio/ui';
import { mountViewer } from './binding';

afterEach(() => {
	document.body.replaceChildren();
	localStorage.clear();
	delete document.documentElement.dataset.officeTheme;
});

function setup() {
	localStorage.setItem(
		'ooxml-office-profile',
		JSON.stringify({ displayName: 'Ada Lovelace', avatarColor: '#16a34a' }),
	);
	const host = document.createElement('div');
	document.body.append(host);
	const viewer = mountViewer(host, { document: structuredClone(demoDocument) });
	const root = viewer.element.shadowRoot!;
	const bar = root.querySelector<HTMLElement>('office-ui-title-bar')!;
	const quick = () => [...bar.shadowRoot!.querySelectorAll<HTMLButtonElement>('.qat button')];
	return { viewer, root, bar, quick };
}

describe('Visio title bar', () => {
	it('sits above the ribbon with the Quick Access Toolbar, the file name and the account', () => {
		const { viewer, root, bar, quick } = setup();
		// Title bar first, then the ribbon whose tab row starts at File, as in Visio.
		expect(bar.nextElementSibling).toBe(root.querySelector('office-ui-ribbon'));
		expect(root.querySelector('office-ui-ribbon .qat')).toBeNull();
		expect(quick().map((item) => item.getAttribute('aria-label'))).toEqual([
			'Save',
			'Undo',
			'Redo',
		]);
		expect(bar.shadowRoot!.querySelector('.mark')!.textContent!.trim()).toBe('V');
		expect(bar.shadowRoot!.querySelector('.name')!.textContent).toBe('Drawing1');
		// A model without a package cannot be saved, and says so beside the name.
		expect(bar.shadowRoot!.querySelector('.status')!.textContent!.trim()).toBe('Read-only');
		expect(quick().every((item) => item.disabled)).toBe(true);
		expect(bar.querySelector('.title-account-name')!.textContent).toBe('Ada Lovelace');
		expect(bar.querySelector('.title-account-avatar')!.textContent).toBe('AL');
		viewer.destroy();
	});

	it('hides with the toolbar and shows nothing for an empty window', () => {
		const { viewer, bar } = setup();
		viewer.update({ showToolbar: false });
		expect(bar.hidden).toBe(true);
		viewer.update({ showToolbar: true, document: null });
		expect(bar.hidden).toBe(false);
		expect(bar.shadowRoot!.querySelector('.name')!.textContent).toBe('Visio');
		viewer.destroy();
	});
});

describe('Office Theme: Black', () => {
	const choose = (root: ShadowRoot, value: string) => {
		const dialog = root.querySelector<HTMLElement & { show(): void }>('office-ui-options-dialog')!;
		dialog.show();
		const select = dialog.shadowRoot!.querySelector<HTMLSelectElement>(
			'[data-key="officeTheme"] select',
		)!;
		select.value = value;
		select.dispatchEvent(new Event('change'));
		dialog.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="ok"]')!.click();
	};

	it('asks the host for the dark theme and applies the shared one when nobody answers', () => {
		const { viewer, root } = setup();
		const asked = vi.fn();
		document.addEventListener('office-theme-request', (event) =>
			asked((event as CustomEvent).detail),
		);
		choose(root, 'dark');
		expect(asked).toHaveBeenCalledWith({ scheme: 'dark' });
		expect(document.documentElement.dataset.officeTheme).toBe('dark');
		// Back to a light look: the page returns to light and the bar takes that look.
		choose(root, 'colorful');
		expect(asked).toHaveBeenLastCalledWith({ scheme: 'light' });
		expect(document.documentElement.dataset.officeTheme).toBe('light');
		expect(viewer.element.statusBar).toBe('colorful');
		viewer.destroy();
	});

	it('leaves the page alone when the host handles the request', () => {
		const { viewer, root } = setup();
		const handle = (event: Event) => event.preventDefault();
		document.addEventListener('office-theme-request', handle);
		choose(root, 'dark');
		expect(document.documentElement.dataset.officeTheme).toBeUndefined();
		document.removeEventListener('office-theme-request', handle);
		viewer.destroy();
	});
});
