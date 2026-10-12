import type { OfficeUiColorGrid } from '../controls';
import { PANE_FIELDS, paneFieldRow, type PaneFieldGroup } from './format-pane-fields';
import { colorGrid } from './ribbon-color-menu';

export type PaneTarget = 'fill' | 'line';
export type PaneNumber = 'fillTransparency' | 'lineTransparency' | 'lineWeight';
/** Every colour the pane sets: the two paints, the pattern's background and the glow. */
export type PaneColor = PaneTarget | 'fillBackground' | 'glow';
export type PaneSection = PaneFieldGroup;

/** A button showing a colour that opens the shared colour grid under it. */
export interface FormatPaneColor {
	row: HTMLElement;
	button: HTMLButtonElement;
	grid: OfficeUiColorGrid;
}
export interface FormatPaneSection {
	set: HTMLFieldSetElement;
	none: HTMLInputElement;
	solid: HTMLInputElement;
	/** Everything that only applies to a visible fill or line. */
	details: HTMLElement;
}
export interface FormatPaneView {
	section: HTMLElement;
	hint: HTMLElement;
	fill: FormatPaneSection;
	line: FormatPaneSection;
	effects: HTMLFieldSetElement;
	colors: Record<PaneColor, FormatPaneColor>;
	numbers: Record<PaneNumber, HTMLInputElement>;
	dash: HTMLSelectElement;
	/** The fields of `PANE_FIELDS`, by key. */
	fields: Map<string, HTMLInputElement | HTMLSelectElement>;
}

const NAMES = {
	fill: { legend: 'Fill', none: 'No fill', solid: 'Solid fill' },
	line: { legend: 'Line', none: 'No line', solid: 'Solid line' },
} as const;
const COLOR_LABELS: Record<PaneColor, [caption: string, name: string]> = {
	fill: ['Color', 'Fill color'],
	line: ['Color', 'Line color'],
	fillBackground: ['Pattern background', 'Pattern background color'],
	glow: ['Glow color', 'Glow color'],
};
export const GRADIENT_UNSUPPORTED =
	'A gradient fill is shown as saved, but its stops, angle and type cannot be changed yet.';

/** Visio's dash types 1-23; 0 (no line) is the No line choice. */
export const DASH_TYPES = Array.from({ length: 23 }, (_, index) => ({
	value: String(index + 1),
	label: index === 0 ? 'Solid' : `Dash ${index + 1}`,
}));

function number(doc: Document, field: PaneNumber, text: string, max: number, step: string) {
	const label = doc.createElement('label');
	label.className = 'format-pane-row';
	const caption = doc.createElement('span');
	caption.textContent = text;
	const input = doc.createElement('input');
	input.type = 'number';
	input.min = '0';
	input.max = String(max);
	input.step = step;
	input.dataset.paneField = field;
	label.append(caption, input);
	return { label, input };
}

function color(doc: Document, name: PaneColor): FormatPaneColor {
	const [text, label] = COLOR_LABELS[name];
	const row = doc.createElement('div');
	row.className = 'format-pane-row';
	const caption = doc.createElement('span');
	caption.textContent = text;
	const button = doc.createElement('button');
	button.type = 'button';
	button.className = 'format-pane-color';
	button.dataset.formatColor = name;
	button.setAttribute('aria-label', label);
	button.setAttribute('aria-expanded', 'false');
	button.append(doc.createElement('span'));
	row.append(caption, button);
	const grid = colorGrid(doc, name === 'line' ? 'line' : 'fill');
	grid.dataset.colorGrid = name;
	grid.setAttribute('label', `${label}s`);
	// The pane's own choices say No fill and No line.
	grid.removeAttribute('none-label');
	delete grid.dataset.menuItem;
	grid.hidden = true;
	return { row, button, grid };
}

function section(doc: Document, target: PaneTarget): FormatPaneSection {
	const names = NAMES[target];
	const set = doc.createElement('fieldset');
	set.dataset.formatSection = target;
	const legend = doc.createElement('legend');
	legend.textContent = names.legend;
	const choice = (value: 'none' | 'solid', text: string) => {
		const label = doc.createElement('label');
		label.className = 'format-pane-choice';
		const input = doc.createElement('input');
		input.type = 'radio';
		input.name = `format-${target}`;
		input.value = value;
		label.append(input, text);
		return { label, input };
	};
	const none = choice('none', names.none);
	const solid = choice('solid', names.solid);
	const details = doc.createElement('div');
	details.className = 'format-pane-details';
	set.append(legend, none.label, solid.label);
	if (target === 'fill') {
		// Visio offers it here; it is shown so its absence is explained, not silent.
		const gradient = choice('solid', 'Gradient fill');
		gradient.input.value = 'gradient';
		gradient.input.disabled = true;
		gradient.input.dataset.unavailable = '';
		gradient.label.title = GRADIENT_UNSUPPORTED;
		gradient.label.dataset.unsupported = '';
		set.append(gradient.label);
	}
	set.append(details);
	return { set, none: none.input, solid: solid.input, details };
}

/**
 * The Format Shape task pane view: Fill, Line and Effects, as plain controls the pane class
 * drives. Fill and Line start with their none/solid choice, colour and transparency; the rest of
 * each section comes from `PANE_FIELDS`.
 */
export function createFormatPaneView(doc: Document): FormatPaneView {
	const root = doc.createElement('section');
	root.className = 'format-pane';
	root.dataset.paneView = 'format';
	const hint = doc.createElement('p');
	hint.className = 'format-pane-hint';
	const fill = section(doc, 'fill');
	const line = section(doc, 'line');
	const effects = doc.createElement('fieldset');
	effects.dataset.formatSection = 'effects';
	const legend = doc.createElement('legend');
	legend.textContent = 'Effects';
	effects.append(legend);
	const colors = {
		fill: color(doc, 'fill'),
		line: color(doc, 'line'),
		fillBackground: color(doc, 'fillBackground'),
		glow: color(doc, 'glow'),
	};
	const fillTransparency = number(doc, 'fillTransparency', 'Transparency (%)', 100, '1');
	const lineTransparency = number(doc, 'lineTransparency', 'Transparency (%)', 100, '1');
	const lineWeight = number(doc, 'lineWeight', 'Width (pt)', 150, '0.25');
	const dashRow = doc.createElement('label');
	dashRow.className = 'format-pane-row';
	const dashCaption = doc.createElement('span');
	dashCaption.textContent = 'Dash type';
	const dash = doc.createElement('select');
	dash.dataset.paneField = 'linePattern';
	dashRow.append(dashCaption, dash);
	fill.details.append(colors.fill.row, colors.fill.grid, fillTransparency.label);
	line.details.append(
		colors.line.row,
		colors.line.grid,
		lineTransparency.label,
		lineWeight.label,
		dashRow,
	);
	const groups = { fill: fill.details, line: line.details, effects };
	const fields = new Map<string, HTMLInputElement | HTMLSelectElement>();
	for (const field of PANE_FIELDS) {
		const { row, input } = paneFieldRow(doc, field);
		groups[field.group].append(row);
		fields.set(field.key, input);
		// Each colour follows the field it belongs with.
		if (field.key === 'fillPattern')
			fill.details.append(colors.fillBackground.row, colors.fillBackground.grid);
		if (field.key === 'glowSize') effects.append(colors.glow.row, colors.glow.grid);
	}
	root.append(hint, fill.set, line.set, effects);
	return {
		section: root,
		hint,
		fill,
		line,
		effects,
		colors,
		numbers: {
			fillTransparency: fillTransparency.input,
			lineTransparency: lineTransparency.input,
			lineWeight: lineWeight.input,
		},
		dash,
		fields,
	};
}
