import { VISIO_SCALE_UNITS } from 'ooxml-core/visio';
import { VISIO_PAPER_SIZES } from 'ooxml-core/visio/ui';
import type { VisioPageSetupTab } from './page-setup-action';

export type SetupSelect = HTMLElement & {
	value: string;
	disabled: boolean;
	options: { value: string; label: string; disabled?: boolean }[];
};
export type SetupDialog = HTMLElement & { open: boolean; show(): void; close(): void };
export type SetupButton = HTMLElement & { disabled: boolean };
export type SetupField =
	| 'paper'
	| 'print-orientation'
	| 'size-mode'
	| 'width'
	| 'height'
	| 'scale-mode'
	| 'scale-page'
	| 'scale-drawing'
	| 'scale-unit'
	| 'type'
	| 'name'
	| 'back-page';
export type SetupControl = HTMLInputElement | SetupSelect;
export const SETUP_TABS: readonly [VisioPageSetupTab, string][] = [
	['print', 'Print Setup'],
	['size', 'Page Size'],
	['scale', 'Drawing Scale'],
	['properties', 'Page Properties'],
];
export const UNIT_INCHES: Record<string, number> = {
	IN: 1,
	FT: 12,
	MM: 1 / 25.4,
	CM: 1 / 2.54,
	M: 1000 / 25.4,
};
const UNIT_LABELS: Record<string, string> = {
	IN: 'in',
	FT: 'ft',
	MM: 'mm',
	CM: 'cm',
	M: 'm',
};

/** Static structure of Visio's Page Setup dialog; values are filled in as text and properties. */
export function createPageSetupDialog(doc: Document) {
	const dialog = doc.createElement('office-ui-dialog') as SetupDialog;
	dialog.className = 'page-setup-dialog';
	dialog.setAttribute('heading', 'Page Setup');
	const fields = new Map<SetupField, SetupControl>();
	const select = (field: SetupField, label: string, options: [string, string][]) => {
		const el = doc.createElement('office-ui-select') as SetupSelect;
		el.options = options.map(([value, text]) => ({ value, label: text }));
		el.value = options[0]![0];
		el.dataset.setupField = field;
		el.setAttribute('aria-label', label);
		fields.set(field, el);
		return wrap(label, el);
	};
	const input = (field: SetupField, label: string, type: 'number' | 'text') => {
		const el = doc.createElement('input');
		el.type = type;
		if (type === 'number') {
			el.min = '0';
			el.step = 'any';
		} else el.maxLength = 255;
		el.dataset.setupField = field;
		el.setAttribute('aria-label', label);
		fields.set(field, el);
		return wrap(label, el);
	};
	const wrap = (text: string, control: HTMLElement) => {
		const label = doc.createElement('label');
		const caption = doc.createElement('span');
		caption.textContent = text;
		label.append(caption, control);
		return label;
	};
	const hint = (text: string) => {
		const p = doc.createElement('p');
		p.className = 'page-setup-hint';
		p.textContent = text;
		return p;
	};
	const papers = VISIO_PAPER_SIZES.filter((size) => size.paperKind !== undefined);
	const panels: Record<VisioPageSetupTab, HTMLElement[]> = {
		print: [
			select('paper', 'Printer paper', [
				['', 'Not saved (printer default)'],
				...papers.map((size): [string, string] => [String(size.paperKind), size.label]),
			]),
			select('print-orientation', 'Paper orientation', [
				['', 'Same as printer'],
				['portrait', 'Portrait'],
				['landscape', 'Landscape'],
			]),
			hint(
				'Margins, print zoom and the printer itself are kept from the file and are not edited here.',
			),
		],
		size: [
			select('size-mode', 'Page size', [
				['custom', 'Custom size'],
				['printer', 'Same as printer paper size'],
				['fit', 'Size to fit drawing contents'],
				...VISIO_PAPER_SIZES.map((size): [string, string] => [`preset:${size.id}`, size.label]),
			]),
			input('width', 'Width (in)', 'number'),
			input('height', 'Height (in)', 'number'),
			hint('Sizes are physical page inches. Fitting moves the shapes onto the fitted page.'),
		],
		scale: [
			select('scale-mode', 'Drawing scale', [
				['none', 'No scale (1:1)'],
				['custom', 'Custom scale'],
			]),
			input('scale-page', 'Page inches', 'number'),
			input('scale-drawing', 'Equal to', 'number'),
			select(
				'scale-unit',
				'Drawing unit',
				VISIO_SCALE_UNITS.map((unit): [string, string] => [unit, UNIT_LABELS[unit] ?? unit]),
			),
			hint('The physical page size is kept; shapes keep their drawing units.'),
		],
		properties: [
			select('type', 'Type', [
				['foreground', 'Foreground'],
				['background', 'Background'],
			]),
			input('name', 'Name', 'text'),
			select('back-page', 'Background', [['', 'None']]),
		],
	};
	const tabs = doc.createElement('div');
	tabs.className = 'page-setup-tabs';
	tabs.setAttribute('role', 'tablist');
	const sections = new Map<VisioPageSetupTab, HTMLElement>();
	const buttons = new Map<VisioPageSetupTab, HTMLButtonElement>();
	for (const [id, label] of SETUP_TABS) {
		const tab = doc.createElement('button');
		tab.type = 'button';
		tab.setAttribute('role', 'tab');
		tab.id = `page-setup-tab-${id}`;
		tab.dataset.setupTab = id;
		tab.textContent = label;
		const panel = doc.createElement('section');
		panel.setAttribute('role', 'tabpanel');
		panel.setAttribute('aria-labelledby', tab.id);
		panel.dataset.setupPanel = id;
		panel.append(...panels[id]);
		tabs.append(tab);
		sections.set(id, panel);
		buttons.set(id, tab);
	}
	const error = doc.createElement('p');
	error.setAttribute('role', 'alert');
	error.dataset.setupError = '';
	const actions = ['OK', 'Cancel'].map((label) => {
		const button = doc.createElement('office-ui-button') as SetupButton;
		button.slot = 'footer';
		button.setAttribute('label', label);
		button.setAttribute('command', `page-setup-${label.toLowerCase()}`);
		return button;
	});
	dialog.append(tabs, ...sections.values(), error, ...actions);
	return {
		dialog,
		fields,
		error,
		tabs: buttons,
		panels: sections,
		ok: actions[0]!,
		cancel: actions[1]!,
	};
}
