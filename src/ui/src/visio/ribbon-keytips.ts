/**
 * Visio KeyTips for the shared `attachKeyTips` helper. Tabs and the Quick Access Toolbar form the
 * first level; each tab panel is the second. Home and View follow Office's conventions where
 * they exist; other tabs get unique two-letter codes from their labels.
 */
const TABS: Readonly<Record<string, string>> = {
	home: 'H',
	insert: 'N',
	design: 'G',
	data: 'A',
	process: 'S',
	review: 'R',
	view: 'W',
	help: 'Y',
};
const PANELS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
	'home-panel': {
		paste: 'V',
		cut: 'X',
		copy: 'C',
		'format-painter': 'FP',
		'combo:font': 'FF',
		'combo:font-size': 'FS',
		'grow-font': 'FG',
		'shrink-font': 'FK',
		bold: '1',
		italic: '2',
		underline: '3',
		strikethrough: '4',
		'change-case': '7',
		'font-color': 'FC',
		'align-top': 'AT',
		'align-middle': 'AM',
		'align-bottom': 'AB',
		bullets: 'U',
		'rotate-text': 'AX',
		'align-left': 'AL',
		'align-center': 'AC',
		'align-right': 'AR',
		justify: 'AJ',
		'indent-decrease': 'AO',
		'indent-increase': 'AI',
		pointer: 'P',
		connector: 'N',
		'text-tool': 'T',
		rectangle: 'DR',
		'connection-point': 'DK',
		'text-block': 'DB',
		'quick-styles': 'QS',
		fill: 'FI',
		line: 'LN',
		effects: 'EF',
		align: 'GA',
		position: 'GP',
		'bring-to-front': 'GF',
		'send-to-back': 'GB',
		group: 'GG',
		'change-shape': 'HS',
		find: 'FD',
		layers: 'LY',
		select: 'SL',
	},
	'view-panel': {
		presentation: 'PM',
		fullscreen: 'FS',
		'check:ruler': 'R',
		'check:page-breaks': 'PB',
		'check:grid': 'G',
		'check:guides': 'U',
		'task-panes': 'TP',
		zoom: 'Q',
		'zoom-fit': 'FW',
		'page-width': 'PW',
		'check:auto-connect': 'AC',
		'check:dynamic-grid': 'DG',
		'check:connection-points': 'CP',
		'new-window': 'N',
		'arrange-all': 'AA',
		cascade: 'CA',
		'switch-windows': 'SW',
		macros: 'M',
		'add-ons': 'AD',
	},
};

/** The stable id a ribbon control is known by (command, dropdown menu or checkbox). */
function controlId(el: HTMLElement): string | undefined {
	if (el.dataset.combo) return `combo:${el.dataset.combo}`;
	if (el.dataset.check) return `check:${el.dataset.check}`;
	return el.getAttribute('command') ?? el.dataset.menu;
}

/** Two-letter code from a label, unique within its panel and never starting with a single. */
function generated(label: string, used: Set<string>, singles: Set<string>): string {
	const letters = label.toUpperCase().replace(/[^A-Z0-9 ]/g, '');
	const words = letters.split(' ').filter(Boolean);
	const pool = [...(words[0] ?? 'X')];
	const candidates = [
		(words[0]?.[0] ?? 'X') + (words[1]?.[0] ?? words[0]?.[1] ?? 'X'),
		...pool.slice(1).map((letter) => (words[0]?.[0] ?? 'X') + letter),
		...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => (words[0]?.[0] ?? 'X') + letter),
		...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => `Z${letter}`),
	];
	return candidates.find((code) => !used.has(code) && !singles.has(code[0]!)) ?? `Z${used.size}`;
}

/** Annotate the ribbon for KeyTips. Labels and ids are static application strings. */
export function applyKeyTips(toolbar: HTMLElement): void {
	// File and the tabs live in the shared ribbon, which copies these onto its own buttons.
	toolbar.setAttribute('file-keytip', 'F');
	toolbar.querySelector<HTMLElement>('.tell-me')!.dataset.keytip = 'Q';
	for (const panel of toolbar.querySelectorAll<HTMLElement>('[data-ribbon-tab]')) {
		const tab = panel.dataset.ribbonTab!;
		panel.dataset.tabKeytip = TABS[tab] ?? tab.slice(0, 1).toUpperCase();
	}
	for (const panel of toolbar.querySelectorAll<HTMLElement>('.ribbon-content')) {
		panel.dataset.keytipLevel = '';
		const fixed = PANELS[panel.id] ?? {};
		const singles = new Set(Object.values(fixed).filter((code) => code.length === 1));
		const used = new Set(Object.values(fixed));
		const controls = panel.querySelectorAll<HTMLElement>(
			'office-ui-button, office-ui-menu-button, office-ui-gallery, office-ui-select[data-combo], office-ui-checkbox',
		);
		// A gallery's KeyTip belongs on its dropdown trigger, which renders once connected; the
		// viewer copies it there (`syncChangeShape`).
		for (const gallery of panel.querySelectorAll<HTMLElement>('office-ui-gallery[command]')) {
			const code = fixed[gallery.getAttribute('command')!];
			if (code) gallery.dataset.triggerKeytip = code;
		}
		for (const control of controls) {
			const id = controlId(control);
			if (!id) continue;
			const known = fixed[id];
			if (known) {
				control.dataset.keytip = known;
				continue;
			}
			const label =
				control.getAttribute('label') ??
				control.getAttribute('aria-label') ??
				id.replace(/-/g, ' ');
			const code = generated(label, used, singles);
			used.add(code);
			control.dataset.keytip = code;
		}
	}
}
