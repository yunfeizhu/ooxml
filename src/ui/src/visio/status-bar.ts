/**
 * Visio's status bar on the shared `office-ui-status-bar`: Page n of m, the selection's Width,
 * Height and Angle, and the drawing language on the left; Presentation Mode and the shared zoom
 * slider on the right. Announcements go to a visually hidden live region; only errors show.
 */
export function createStatusBar(doc: Document): HTMLElement {
	const bar = doc.createElement('office-ui-status-bar');
	bar.className = 'status';
	bar.setAttribute('label', 'Status bar');
	const item = (name: string) => {
		const el = doc.createElement('office-ui-status-item');
		el.setAttribute(name, '');
		el.setAttribute('label', '');
		el.setAttribute('value', '');
		return el;
	};
	const message = doc.createElement('div');
	message.className = 'status-message';
	message.setAttribute('role', 'status');
	const text = doc.createElement('span');
	text.dataset.status = '';
	message.append(text);
	const footer = doc.createElement('slot');
	footer.name = 'workspace-footer';
	const zoom = doc.createElement('office-ui-zoom-slider');
	zoom.slot = 'end';
	zoom.className = 'zoom-controls';
	zoom.setAttribute('label', 'Canvas zoom');
	zoom.setAttribute('fit', 'Fit page to current window');
	zoom.setAttribute('value', '100');
	// Visio's view switch beside the zoom slider; ViewerPresentation enables and handles it.
	const presentation = doc.createElement('office-ui-button');
	presentation.slot = 'end';
	presentation.className = 'presentation-mode';
	presentation.setAttribute('icon', 'visioPresentation');
	presentation.setAttribute('icon-only', '');
	presentation.setAttribute('label', 'Presentation Mode');
	presentation.setAttribute('disabled', '');
	presentation.setAttribute('title', 'Presentation Mode: open a drawing with a foreground page.');
	bar.append(
		item('data-page-status'),
		item('data-width-status'),
		item('data-height-status'),
		item('data-angle-status'),
		item('data-language-status'),
		message,
		footer,
		presentation,
		zoom,
	);
	return bar;
}

/** The status bar's language: the viewer's `lang`, else the browser's, as Visio names it. */
export function statusLanguage(tag: string): string {
	try {
		const locale = new Intl.Locale(tag || 'en-US').maximize();
		const names = new Intl.DisplayNames(['en'], { type: 'language' });
		const language = names.of(locale.language) ?? '';
		const region = locale.region
			? new Intl.DisplayNames(['en'], { type: 'region' }).of(locale.region)
			: '';
		return region ? `${language} (${region})` : language;
	} catch {
		return '';
	}
}

/**
 * Visio's page bar under the drawing: the shared document tab strip with the All pages list and
 * Insert Page after the tabs, enabled for an editable source-backed drawing.
 */
export function createPageTabs(doc: Document): HTMLElement {
	const bar = doc.createElement('div');
	bar.className = 'page-bar';
	const all = doc.createElement('office-ui-menu-button');
	all.dataset.menu = 'all-pages';
	all.setAttribute('label', 'All');
	all.setAttribute('title', 'All pages');
	all.setAttribute('disabled', '');
	const strip = doc.createElement('office-ui-tab-strip');
	strip.className = 'page-tabs';
	strip.setAttribute('label', 'Pages');
	strip.setAttribute('previous-label', 'Previous page');
	strip.setAttribute('next-label', 'Next page');
	strip.setAttribute('add-label', 'Insert Page');
	strip.setAttribute('add-disabled', '');
	strip.setAttribute('add-title', 'Insert Page: open a .vsdx file to edit pages.');
	// Visio's order: the page tabs, then All, then Insert Page.
	strip.toggleAttribute('plain', true);
	all.slot = 'after-tabs';
	strip.append(all);
	bar.append(strip);
	return bar;
}
