import {
	VISIO_BULLET_STYLES,
	VISIO_TEXT_LANGUAGES,
	type VisioTextDialogValues,
} from 'ooxml-core/visio/ui';

type Dialog = HTMLElement & { open: boolean; show(): void; close(): void };
type Button = HTMLElement & { disabled: boolean };
export type TextDialogTab = 'font' | 'character' | 'paragraph' | 'text-block' | 'tabs' | 'bullets';
type Kind = 'number' | 'select' | 'check' | 'color' | 'text';
type Key = keyof VisioTextDialogValues | 'fontStyle' | 'backgroundOn' | 'backgroundColor';
interface Field {
	key: Key;
	label: string;
	kind: Kind;
	options?: readonly [string, string][];
	min?: number;
	max?: number;
	step?: number;
}
const pt = (key: Key, label: string, min = 0, max = 7200, step = 0.5): Field => ({
	key,
	label: `${label} (pt)`,
	kind: 'number',
	min,
	max,
	step,
});
const TABS: readonly [TextDialogTab, string, readonly Field[]][] = [
	[
		'font',
		'Font',
		[
			{ key: 'fontFamily', label: 'Font', kind: 'select' },
			{
				key: 'fontStyle',
				label: 'Style',
				kind: 'select',
				options: [
					['regular', 'Regular'],
					['bold', 'Bold'],
					['italic', 'Italic'],
					['bold-italic', 'Bold Italic'],
				],
			},
			pt('fontSize', 'Size', 1, 1000),
			{ key: 'fontColor', label: 'Color', kind: 'color' },
			{
				key: 'fontTransparency',
				label: 'Transparency (%)',
				kind: 'number',
				min: 0,
				max: 100,
				step: 1,
			},
			{
				key: 'textCase',
				label: 'Case',
				kind: 'select',
				options: [
					['normal', 'Normal'],
					['all-caps', 'All Caps'],
					['initial-caps', 'Initial Caps'],
					['small-caps', 'Small Caps'],
				],
			},
			{
				key: 'textPosition',
				label: 'Position',
				kind: 'select',
				options: [
					['normal', 'Normal'],
					['superscript', 'Superscript'],
					['subscript', 'Subscript'],
				],
			},
			{ key: 'underline', label: 'Underline', kind: 'check' },
			{ key: 'strikethrough', label: 'Strikethrough', kind: 'check' },
			{
				key: 'language',
				label: 'Language',
				kind: 'select',
				options: [
					['0', '(not set)'],
					...VISIO_TEXT_LANGUAGES.map(({ id, label }) => [String(id), label] as [string, string]),
				],
			},
		],
	],
	['character', 'Character', [pt('letterSpacing', 'Spacing', -1584, 1584)]],
	[
		'paragraph',
		'Paragraph',
		[
			{
				key: 'horizontalAlign',
				label: 'Alignment',
				kind: 'select',
				options: [
					['left', 'Left'],
					['center', 'Centered'],
					['right', 'Right'],
					['justify', 'Justified'],
				],
			},
			pt('indentLeft', 'Left indent'),
			pt('indentRight', 'Right indent'),
			pt('indentFirst', 'First line', -7200),
			pt('spaceBefore', 'Spacing before'),
			pt('spaceAfter', 'Spacing after'),
			{
				key: 'lineSpacingKind',
				label: 'Line spacing',
				kind: 'select',
				options: [
					['multiple', 'Multiple'],
					['exact', 'Exactly (pt)'],
				],
			},
			{
				key: 'lineSpacing',
				label: 'Line spacing value',
				kind: 'number',
				min: 0.25,
				max: 1584,
				step: 0.05,
			},
		],
	],
	[
		'text-block',
		'Text Block',
		[
			{
				key: 'verticalAlign',
				label: 'Vertical alignment',
				kind: 'select',
				options: [
					['top', 'Top'],
					['middle', 'Middle'],
					['bottom', 'Bottom'],
				],
			},
			pt('marginTop', 'Top margin'),
			pt('marginBottom', 'Bottom margin'),
			pt('marginLeft', 'Left margin'),
			pt('marginRight', 'Right margin'),
			{ key: 'backgroundOn', label: 'Text background', kind: 'check' },
			{ key: 'backgroundColor', label: 'Background color', kind: 'color' },
			{
				key: 'textBackgroundTransparency',
				label: 'Background transparency (%)',
				kind: 'number',
				min: 0,
				max: 100,
				step: 1,
			},
		],
	],
	['tabs', 'Tabs', []],
	[
		'bullets',
		'Bullets',
		[
			{
				key: 'bulletStyle',
				label: 'Style',
				kind: 'select',
				options: VISIO_BULLET_STYLES.map(({ value, glyph, label }) => [
					String(value),
					glyph ? `${glyph} ${label}` : label,
				]),
			},
			{ key: 'bulletText', label: 'Custom bullet character', kind: 'text' },
		],
	],
];
const NOTES: Partial<Record<TextDialogTab, string>> = {
	character:
		'Character scale and position offsets are not supported. Positive spacing expands and negative spacing condenses.',
	tabs: 'Tab stops are not written by this editor: the Tabs section layout is not verified against Visio and the renderer does not lay out tab stops. Existing tab stops are kept.',
	bullets: 'A custom character replaces the style glyph. Bullet fonts and sizes are kept.',
};
type Input = HTMLInputElement | HTMLSelectElement;

/** Visio's Text dialog on the shared office-ui-dialog: tabs, typed fields and footer buttons. */
export function createTextDialog(root: ShadowRoot, press: (button: string) => void) {
	const doc = root.ownerDocument;
	const dialog = doc.createElement('office-ui-dialog') as Dialog;
	dialog.className = 'text-dialog';
	dialog.setAttribute('heading', 'Text');
	const list = doc.createElement('div');
	list.className = 'text-dialog-tabs';
	list.setAttribute('role', 'tablist');
	const inputs = new Map<Key, Input>();
	const tabs = new Map<TextDialogTab, { tab: HTMLButtonElement; panel: HTMLElement }>();
	const select = (id: TextDialogTab, focus = false) => {
		for (const [key, { tab, panel }] of tabs) {
			tab.setAttribute('aria-selected', String(key === id));
			tab.tabIndex = key === id ? 0 : -1;
			panel.hidden = key !== id;
		}
		if (focus) tabs.get(id)!.tab.focus();
	};
	dialog.append(list);
	for (const [id, label, fields] of TABS) {
		const tab = doc.createElement('button');
		tab.type = 'button';
		tab.textContent = label;
		tab.id = `text-dialog-tab-${id}`;
		tab.dataset.textTab = id;
		tab.setAttribute('role', 'tab');
		tab.setAttribute('aria-controls', `text-dialog-panel-${id}`);
		tab.addEventListener('click', () => select(id));
		tab.addEventListener('keydown', (event) => {
			const order = TABS.map(([key]) => key);
			const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
			if (!step) return;
			event.preventDefault();
			select(order[(order.indexOf(id) + step + order.length) % order.length]!, true);
		});
		const panel = doc.createElement('div');
		panel.className = 'text-dialog-panel';
		panel.id = `text-dialog-panel-${id}`;
		panel.setAttribute('role', 'tabpanel');
		panel.setAttribute('aria-labelledby', tab.id);
		for (const field of fields) {
			const wrapper = doc.createElement('label');
			const caption = doc.createElement('span');
			caption.textContent = field.label;
			const input = doc.createElement(field.kind === 'select' ? 'select' : 'input') as Input;
			input.name = `text-${field.key}`;
			input.setAttribute('aria-label', field.label);
			if (input instanceof HTMLInputElement) {
				input.type =
					field.kind === 'check' ? 'checkbox' : field.kind === 'color' ? 'color' : field.kind;
				if (field.kind === 'number') {
					input.min = String(field.min);
					input.max = String(field.max);
					input.step = String(field.step);
				}
				if (field.kind === 'text') input.maxLength = 2;
				input.addEventListener('keydown', (event) => {
					if (event.key !== 'Enter') return;
					event.preventDefault();
					press('OK');
				});
			} else
				input.replaceChildren(
					...(field.options ?? []).map(([value, text]) => {
						const option = doc.createElement('option');
						option.value = value;
						option.textContent = text;
						return option;
					}),
				);
			wrapper.className = field.kind === 'check' ? 'text-dialog-check' : '';
			wrapper.append(...(field.kind === 'check' ? [input, caption] : [caption, input]));
			panel.append(wrapper);
			inputs.set(field.key, input);
		}
		const note = NOTES[id];
		if (note) {
			const paragraph = doc.createElement('p');
			paragraph.className = 'text-dialog-note';
			paragraph.textContent = note;
			panel.append(paragraph);
		}
		list.append(tab);
		dialog.append(panel);
		tabs.set(id, { tab, panel });
	}
	const error = doc.createElement('p');
	error.setAttribute('role', 'alert');
	const hint = doc.createElement('p');
	hint.className = 'text-dialog-note';
	hint.textContent =
		'Changes apply to the whole text of every selected shape. Source formulas and protection can refuse an edit.';
	dialog.append(hint, error);
	const buttons = new Map<string, Button>();
	for (const name of ['OK', 'Apply', 'Cancel']) {
		const button = doc.createElement('office-ui-button') as Button;
		button.slot = 'footer';
		button.setAttribute('label', name);
		button.setAttribute('command', `text-dialog-${name.toLowerCase()}`);
		button.addEventListener('office-command', () => {
			if (!button.disabled) press(name);
		});
		buttons.set(name, button);
		dialog.append(button);
	}
	root.append(dialog);
	const input = (key: Key) => inputs.get(key)!;
	return {
		dialog,
		error,
		buttons,
		select,
		/** Show values; fonts fill the Font list and an unknown current font is kept. */
		write(values: VisioTextDialogValues, fonts: readonly string[]): void {
			const family = input('fontFamily') as HTMLSelectElement;
			family.replaceChildren(
				...[...new Set([values.fontFamily, ...fonts])].map((font) => {
					const option = doc.createElement('option');
					option.value = font;
					option.textContent = font;
					return option;
				}),
			);
			for (const [key, value] of Object.entries(values) as [Key, unknown][]) {
				const field = inputs.get(key);
				if (!field) continue;
				if (field instanceof HTMLInputElement && field.type === 'checkbox') field.checked = !!value;
				else field.value = String(value);
			}
			input('fontStyle').value =
				values.bold && values.italic
					? 'bold-italic'
					: values.bold
						? 'bold'
						: values.italic
							? 'italic'
							: 'regular';
			(input('backgroundOn') as HTMLInputElement).checked = values.textBackground !== 'none';
			input('backgroundColor').value =
				values.textBackground === 'none' ? '#ffffff' : values.textBackground;
		},
		/** Read the fields over `base`; invalid numbers keep the base value. */
		read(base: VisioTextDialogValues): VisioTextDialogValues {
			const next = { ...base } as Record<string, unknown>;
			for (const [key, field] of inputs) {
				if (!(key in base) || key === 'textBackground') continue;
				const current = base[key as keyof VisioTextDialogValues];
				if (field instanceof HTMLInputElement && field.type === 'checkbox')
					next[key] = field.checked;
				else if (typeof current === 'number') {
					const number = Number(field.value);
					next[key] = field.value.trim() !== '' && Number.isFinite(number) ? number : current;
				} else next[key] = field.value;
			}
			const style = input('fontStyle').value;
			next.bold = style === 'bold' || style === 'bold-italic';
			next.italic = style === 'italic' || style === 'bold-italic';
			next.textBackground = (input('backgroundOn') as HTMLInputElement).checked
				? input('backgroundColor').value.toLowerCase()
				: 'none';
			return next as unknown as VisioTextDialogValues;
		},
		busy(value: boolean): void {
			for (const field of inputs.values()) field.disabled = value;
			for (const button of buttons.values()) button.disabled = value;
		},
	};
}
export type TextDialogView = ReturnType<typeof createTextDialog>;
