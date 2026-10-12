import { afterEach, describe, expect, it } from 'vitest';
import { mountViewer } from './binding';
import { demoDocument } from 'ooxml-core/visio/ui';

afterEach(() => {
	document.body.replaceChildren();
	localStorage.clear();
});

type Profile = { displayName: string; avatarColor: string; initial?: string };

function setup() {
	localStorage.setItem(
		'ooxml-office-profile',
		JSON.stringify({ displayName: 'Ada Lovelace', avatarColor: '#16a34a' }),
	);
	const host = document.createElement('div');
	document.body.append(host);
	const viewer = mountViewer(host, { document: structuredClone(demoDocument) });
	const root = viewer.element.shadowRoot!;
	const backstage = root.querySelector<HTMLElement & { open: boolean }>('office-ui-backstage')!;
	const item = (id: string) =>
		backstage.shadowRoot!.querySelector<HTMLButtonElement>(`[data-backstage-item="${id}"]`)!;
	const file = () =>
		root.querySelector('office-ui-ribbon')!.shadowRoot!.querySelector<HTMLButtonElement>('.file')!;
	const dialog = root.querySelector<HTMLElement & { open: boolean }>('office-ui-options-dialog')!;
	const account = root.querySelector<HTMLElement & { profile: Profile }>('office-ui-account')!;
	const field = (key: string) =>
		dialog.shadowRoot!.querySelector<HTMLInputElement>(
			`[data-key="${key}"] input, [data-key="${key}"] select`,
		)!;
	return { viewer, root, item, file, backstage, dialog, account, field };
}

describe('Visio File > Account and Options', () => {
	it('shows the shared profile on the Account page', () => {
		const { viewer, root, item, file, account } = setup();
		file().click();
		item('account').click();
		const page = root.querySelector<HTMLElement>('[data-backstage-page="account"]')!;
		expect(page.hidden).toBe(false);
		expect(page.contains(account)).toBe(true);
		expect(account.profile).toEqual({ displayName: 'Ada Lovelace', avatarColor: '#16a34a' });
		expect(page.querySelector('.backstage-product h2')!.textContent).toBe('Product Information');
		viewer.destroy();
	});

	it('opens Visio Options over the drawing and honours only the profile settings', () => {
		const { viewer, item, file, backstage, dialog, field } = setup();
		file().click();
		item('options').click();
		expect(backstage.open).toBe(false);
		expect(dialog.open).toBe(true);
		expect(dialog.getAttribute('heading')).toBe('Visio Options');
		const tabs = [...dialog.shadowRoot!.querySelectorAll('[role="tab"]')].map(
			(tab) => tab.textContent,
		);
		expect(tabs).toEqual([
			'General',
			'Proofing',
			'Save',
			'Language',
			'Advanced',
			'Customize Ribbon',
			'Quick Access Toolbar',
			'Add-ins',
			'Trust Center',
		]);
		expect(field('livePreview').disabled).toBe(true);
		expect(field('livePreview').closest('label')!.title).toMatch(/^Not available yet\./);
		expect(field('userName').value).toBe('Ada Lovelace');
		viewer.destroy();
	});

	it('writes Options edits to the profile and mirrors Account edits back', () => {
		const { viewer, item, file, dialog, account, field } = setup();
		file().click();
		item('options').click();
		const name = field('userName');
		name.value = 'Grace Hopper';
		name.dispatchEvent(new Event('input'));
		const initials = field('userInitials');
		initials.value = 'GH';
		initials.dispatchEvent(new Event('input'));
		dialog.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="ok"]')!.click();
		expect(dialog.open).toBe(false);
		expect(account.profile).toEqual({
			displayName: 'Grace Hopper',
			avatarColor: '#16a34a',
			initial: 'GH',
		});
		expect(JSON.parse(localStorage.getItem('ooxml-office-profile')!).displayName).toBe(
			'Grace Hopper',
		);
		account.shadowRoot!.querySelector<HTMLButtonElement>('[data-color="#c2431f"]')!.click();
		expect(JSON.parse(localStorage.getItem('ooxml-office-profile')!).avatarColor).toBe('#c2431f');
		viewer.destroy();
	});

	it('switches the status bar between the neutral and Colorful Office themes and remembers it', () => {
		const { viewer, item, file, dialog, field } = setup();
		// Neutral by default; a host may set the attribute or property itself.
		expect(viewer.element.statusBar).toBe('neutral');
		file().click();
		item('options').click();
		const theme = field('officeTheme') as unknown as HTMLSelectElement;
		expect(theme.value).toBe('neutral');
		theme.value = 'colorful';
		theme.dispatchEvent(new Event('change'));
		dialog.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="ok"]')!.click();
		expect(viewer.element.getAttribute('status-bar')).toBe('colorful');
		expect(viewer.element.statusBar).toBe('colorful');
		expect(localStorage.getItem('ooxml-visio-office-theme')).toBe('colorful');
		viewer.destroy();
		// A new viewer starts with the saved choice, unless its host chose one.
		const next = mountViewer(document.body.appendChild(document.createElement('div')));
		expect(next.element.statusBar).toBe('colorful');
		next.destroy();
		const chosen = document.createElement('visio-viewer');
		chosen.setAttribute('status-bar', 'neutral');
		document.body.append(chosen);
		expect(chosen.statusBar).toBe('neutral');
		chosen.remove();
	});
});
