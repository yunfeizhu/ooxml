/** Follow the same preference as the Office launcher and VitePress docs. */
export function initVisioTheme(win) {
	const root = win.document.documentElement;
	const button = win.document.querySelector('.theme-toggle, #theme-toggle');
	const key = 'vitepress-theme-appearance';
	const legacyKey = 'visio-docs-theme';
	const media = win.matchMedia('(prefers-color-scheme: dark)');
	let preference = null;
	try {
		preference = win.localStorage.getItem(key) ?? win.localStorage.getItem(legacyKey);
	} catch {
		/* Keep theme switching available when storage is blocked. */
	}
	function apply(value) {
		preference = value === 'dark' || value === 'light' ? value : null;
		const dark = preference ? preference === 'dark' : media.matches;
		root.dataset.theme = dark ? 'dark' : 'light';
		root.style.colorScheme = dark ? 'dark' : 'light';
		button?.setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} theme`);
		button?.setAttribute('title', `Switch to ${dark ? 'light' : 'dark'} theme`);
		if (button) button.textContent = dark ? '☀' : '◐';
		win.document
			.querySelector('meta[name="theme-color"]')
			?.setAttribute('content', dark ? '#0f1113' : '#fbfaf7');
		syncFrame();
	}
	function syncFrame() {
		const frame = win.document.getElementById('live-viewer');
		try {
			if (frame?.contentDocument)
				frame.contentDocument.documentElement.dataset.theme = root.dataset.theme;
		} catch {
			/* Only the same-origin demo may receive the preference. */
		}
	}
	function choose(next) {
		apply(next);
		try {
			win.localStorage.setItem(key, next);
			win.localStorage.setItem(legacyKey, next);
		} catch {
			/* Session theme still applies. */
		}
	}
	function toggle() {
		const dark = preference ? preference === 'dark' : media.matches;
		choose(dark ? 'light' : 'dark');
	}
	/** The editor's File > Options > Office Theme asks its page for light or dark. */
	function request(event) {
		const scheme = event.detail?.scheme;
		if (scheme !== 'dark' && scheme !== 'light') return;
		event.preventDefault();
		choose(scheme);
	}
	function storage(event) {
		if (event.key === key || event.key === null) apply(event.newValue);
		else if (event.key === legacyKey) {
			try {
				if (win.localStorage.getItem(key) !== null) return;
			} catch {
				/* With blocked storage, use the explicit event preference. */
			}
			apply(event.newValue);
		}
	}
	function systemChange() {
		if (!preference) apply(null);
	}
	apply(preference);
	button?.addEventListener('click', toggle);
	win.addEventListener('office-theme-request', request);
	win.addEventListener('storage', storage);
	media.addEventListener?.('change', systemChange);
	win.document.getElementById('live-viewer')?.addEventListener('load', syncFrame);
	return () => {
		button?.removeEventListener('click', toggle);
		win.removeEventListener('office-theme-request', request);
		win.removeEventListener('storage', storage);
		media.removeEventListener?.('change', systemChange);
		win.document.getElementById('live-viewer')?.removeEventListener('load', syncFrame);
	};
}
