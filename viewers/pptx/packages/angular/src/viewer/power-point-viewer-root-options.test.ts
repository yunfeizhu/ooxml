/**
 * The root display inputs `showToolbar`, `showThumbnails`,
 * `showCompatibilityToasts` and `initialSlide`.
 *
 * React, Vue, Svelte and vanilla expose the three; Angular did not, so a host
 * could not hide the chrome, hide the thumbnail pane or open on a given slide
 * here. The defaults and clamping come from the shared
 * `resolveViewerRootOptions` / `resolveInitialSlideIndex` (ooxml-ui/pptx);
 * this package has no TestBed, so the wiring is pinned as source text (the
 * pattern `power-point-viewer-api.test.ts` uses) and the shared resolution is
 * checked at runtime.
 */
import { resolveInitialSlideIndex, resolveViewerRootOptions } from 'ooxml-ui/pptx';
import { describe, expect, it } from 'vitest';

import { componentSource } from './component-source.test-support';

const source = componentSource(import.meta.dirname, 'power-point-viewer.component.ts');

/** The `@if (...)` condition that opens the block containing `marker`. */
function gateBefore(marker: string): string {
	const at = source.indexOf(marker);
	expect(at).toBeGreaterThan(-1);
	const open = source.lastIndexOf('@if (', at - 1);
	return source.slice(open, source.indexOf(') {', open) + 1).replace(/\s+/gu, ' ');
}

describe('powerPointViewerComponent root display inputs', () => {
	it('declares the root inputs undefaulted so the shared defaults apply', () => {
		expect(source).toContain('readonly initialSlide = input<number | undefined>(undefined);');
		expect(source).toContain('readonly showToolbar = input<boolean | undefined>(undefined);');
		expect(source).toContain('readonly showThumbnails = input<boolean | undefined>(undefined);');
		expect(source).toContain(
			'readonly showCompatibilityToasts = input<boolean | undefined>(undefined);',
		);
		expect(source).toMatch(
			/rootOptions = computed\(\(\) =>\s*resolveViewerRootOptions\(\{\s*initialSlide: this\.initialSlide\(\),\s*showToolbar: this\.showToolbar\(\),\s*showThumbnails: this\.showThumbnails\(\),\s*showCompatibilityToasts: this\.showCompatibilityToasts\(\),/u,
		);
		expect(resolveViewerRootOptions({})).toStrictEqual({
			initialSlide: 0,
			showToolbar: true,
			showThumbnails: true,
			showCompatibilityToasts: true,
		});
	});

	it('gates the compatibility toast stack on showCompatibilityToasts alone', () => {
		const gate = gateBefore('<pptx-compat-toasts');
		expect(gate).toBe('@if (rootOptions().showCompatibilityToasts)');
		expect(
			resolveViewerRootOptions({ showCompatibilityToasts: false }).showCompatibilityToasts,
		).toBeFalsy();
	});

	it('gates the banners, title bar, ribbon, mobile toolbar and status bar on showToolbar', () => {
		expect(source).toMatch(
			/toolbarVisible = computed\(\s*\(\) => this\.chromeVisible\(\) && this\.rootOptions\(\)\.showToolbar,/u,
		);
		expect(gateBefore('pptx-ng-protected-view-banner')).toContain('toolbarVisible()');
		expect(gateBefore('<pptx-readonly-banner')).toContain('toolbarVisible()');
		expect(gateBefore("@if (customizationService.panelVisible('titleBar'))")).toContain(
			'!mobile.isMobile() && toolbarVisible()',
		);
		expect(gateBefore('<pptx-mobile-toolbar')).toContain('toolbarVisible()');
		expect(gateBefore('<pptx-status-bar')).toContain('toolbarVisible()');
		expect(gateBefore('<pptx-mobile-slides-sheet')).toContain('rootOptions().showToolbar');
	});

	it('gates both slide thumbnail panes on showThumbnails', () => {
		expect(source).toMatch(
			/thumbnailsVisible = computed\(\s*\(\) => this\.chromeVisible\(\) && this\.rootOptions\(\)\.showThumbnails,/u,
		);
		expect(gateBefore('<pptx-slides-panel')).toContain('thumbnailsVisible()');
		const readOnlyRail = source.slice(
			source.indexOf('} @else if (', source.indexOf('<pptx-slides-panel')),
			source.indexOf('<nav class="pptx-ng-thumbnails"'),
		);
		expect(readOnlyRail).toContain('thumbnailsVisible()');
	});

	it('opens each loaded deck on the clamped initialSlide', () => {
		expect(source).toContain(
			'this.activeSlideIndex.set(resolveInitialSlideIndex(this.initialSlide(), slides.length));',
		);
		expect(resolveInitialSlideIndex(2, 3)).toBe(2);
		expect(resolveInitialSlideIndex(99, 3)).toBe(2);
		expect(resolveInitialSlideIndex(undefined, 3)).toBe(0);
	});
});

describe('powerPointViewerComponent host ribbon tabs', () => {
	const ribbon = componentSource(import.meta.dirname, 'ribbon.component.ts');

	it('hands the ribbonAddIns input to the ribbon through the per-viewer service', () => {
		expect(source).toContain(
			'readonly ribbonAddIns = input<readonly RibbonAddInTab[] | undefined>(undefined);',
		);
		expect(source).toContain('inject(RibbonAddInsService).bind(this.ribbonAddIns)');
		expect(componentSource(import.meta.dirname, 'power-point-viewer.providers.ts')).toMatch(
			/^	RibbonAddInsService,$/mu,
		);
	});

	it('lists the host tabs in the tab row and draws the active one instead of the fixed content', () => {
		expect(ribbon).toContain('[addInTabs]="addInTabs()"');
		expect(ribbon).toContain('[activeAddIn]="activeAddIn()?.id ?? null"');
		expect(ribbon).toContain('(selectAddIn)="selectAddIn($event)"');
		expect(ribbon).toMatch(
			/@if \(activeAddIn\(\); as addIn\) \{\s*<pptx-ui-ribbon-add-in \[tab\]="addIn"><\/pptx-ui-ribbon-add-in>\s*\}/u,
		);
		// Both fixed content hosts step aside while a host tab shows.
		expect(ribbon.match(/\[style\.display\]="activeAddIn\(\) \? 'none' : null"/gu)).toHaveLength(2);
		// Any fixed or contextual tab pick clears the host tab; no direct activeTab.set stays in the template.
		expect(ribbon).not.toContain('(selectTab)="activeTab.set($event)"');
		expect(ribbon.match(/\(selectTab\)="selectTab\(\$event\)"/gu)).toHaveLength(2);
	});
});
