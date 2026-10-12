import { Component, CUSTOM_ELEMENTS_SCHEMA, inject, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import type { RibbonAddInTab } from 'ooxml-ui/pptx';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { translationsEn } from '../../../../../../src/ui/src/pptx/i18n/translations-en';
import { registerPptxWebControls } from '../../../../../../src/ui/src/pptx/web-components';
import { RibbonAddInsService } from './ribbon-add-ins.service';
import { RibbonTabListComponent } from './ribbon-tab-list.component';

beforeAll(() => {
	TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
	registerPptxWebControls();
});
afterEach(() => TestBed.resetTestingModule());

const reports = (run: () => void, label = 'Reports'): RibbonAddInTab => ({
	id: 'reports',
	label,
	groups: [{ label: 'Export', commands: [{ id: 'export', label: 'Export', run }] }],
});

/** The content binding `RibbonComponent` makes for the host tab that is showing. */
@Component({
	standalone: true,
	schemas: [CUSTOM_ELEMENTS_SCHEMA],
	template: `
		@if (addIns.active(); as addIn) {
			<pptx-ui-ribbon-add-in [tab]="addIn"></pptx-ui-ribbon-add-in>
		}
	`,
})
class ContentHarnessComponent {
	readonly addIns = inject(RibbonAddInsService);
}

function configure(): RibbonAddInsService {
	TestBed.configureTestingModule({
		imports: [RibbonTabListComponent, ContentHarnessComponent],
		providers: [provideTranslateService({ fallbackLang: 'en' }), RibbonAddInsService],
	});
	// This JIT runner has no signal-input transform: declare the inputs and pass signals.
	TestBed.overrideComponent(RibbonTabListComponent, {
		add: { inputs: ['activeTab', 'addInTabs', 'activeAddIn'] },
	});
	TestBed.inject(TranslateService).setTranslation('en', translationsEn);
	TestBed.inject(TranslateService).use('en');
	return TestBed.inject(RibbonAddInsService);
}

describe('host ribbon tabs', () => {
	it('lists the host tabs after the fixed tabs and never one that takes a built-in id', () => {
		const service = configure();
		service.bind(signal([reports(vi.fn()), { ...reports(vi.fn()), id: 'home', label: 'Fake' }]));
		const fixture = TestBed.createComponent(RibbonTabListComponent);
		const root = fixture.nativeElement as HTMLElement;
		const chosen = vi.fn();
		fixture.componentInstance.selectAddIn.subscribe(chosen);
		const sync = (): void => {
			fixture.componentRef.setInput('activeTab', signal('insert'));
			fixture.componentRef.setInput('addInTabs', signal(service.visible()));
			fixture.componentRef.setInput('activeAddIn', signal(service.active()?.id ?? null));
			fixture.detectChanges();
		};
		sync();
		const tab = () => root.querySelector<HTMLButtonElement>('[data-ribbon-add-in-tab]');
		const selected = () =>
			[...root.querySelectorAll('[role="tab"][aria-selected="true"]')].map((item) =>
				item.textContent!.trim(),
			);
		const all = [...root.querySelectorAll('[role="tab"]')];
		expect(all.at(-1)).toBe(tab());
		expect(all.map((item) => item.textContent!.trim())).not.toContain('Fake');
		expect(tab()!.textContent!.trim()).toBe('Reports');
		expect(selected()).toStrictEqual(['Insert']);
		tab()!.click();
		expect(chosen).toHaveBeenCalledWith('reports');
		// While the host tab shows, no fixed tab reads as selected.
		service.select('reports');
		sync();
		expect(selected()).toStrictEqual(['Reports']);
		fixture.destroy();
	});

	it('draws the tab that is showing, runs the latest callback and drops it when the host removes it', () => {
		const service = configure();
		const first = vi.fn();
		const latest = vi.fn();
		const heard = vi.fn();
		const input = signal<readonly RibbonAddInTab[] | undefined>([reports(first)]);
		service.bind(input);
		const fixture = TestBed.createComponent(ContentHarnessComponent);
		const root = fixture.nativeElement as HTMLElement;
		document.body.append(root);
		root.addEventListener('office-ribbon-add-in', (event) => heard((event as CustomEvent).detail));
		fixture.detectChanges();
		expect(root.querySelector('pptx-ui-ribbon-add-in')).toBeNull();
		service.select('reports');
		fixture.detectChanges();
		const command = root.querySelector('pptx-ui-ribbon-command')!;
		expect(command.getAttribute('label')).toBe('Export');
		// A new descriptor with new closures keeps the command and runs the latest callback.
		input.set([reports(latest, 'Reporting')]);
		fixture.detectChanges();
		expect(root.querySelector('pptx-ui-ribbon-command')).toBe(command);
		command.shadowRoot!.querySelector('button')!.click();
		expect(first).not.toHaveBeenCalled();
		expect(latest).toHaveBeenCalledOnce();
		expect(heard).toHaveBeenCalledWith({ tab: 'reports', command: 'export' });
		// The host removes the tab that is showing: nothing of it stays.
		input.set([]);
		fixture.detectChanges();
		expect(service.active()).toBeNull();
		expect(root.querySelector('pptx-ui-ribbon-add-in')).toBeNull();
		fixture.destroy();
		root.remove();
	});
});
