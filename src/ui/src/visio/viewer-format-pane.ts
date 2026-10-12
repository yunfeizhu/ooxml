import type { VisioThemeColorRef } from 'ooxml-core/visio';
import type { OfficeColorPick } from '../controls';
import type { ViewerController, ViewerState } from './controller';
import {
	PANE_FIELDS,
	glowColorPatch,
	paneFieldContext,
	type PaneField,
	type PanePatch,
} from './format-pane-fields';
import {
	DASH_TYPES,
	createFormatPaneView,
	type FormatPaneColor,
	type PaneColor,
	type PaneNumber,
	type PaneSection,
	type PaneTarget,
} from './format-pane-view';
import type { VisioFormattingAction } from './ribbon-action';
import { colorAction, commonColor, pickedThemeColor } from './ribbon-color-menu';
import { styleSelection, type ViewerColorMenus } from './viewer-color-menus';

const NUMBERS: Readonly<Record<PaneNumber, { label: string; max: number }>> = {
	fillTransparency: { label: 'a fill transparency', max: 100 },
	lineTransparency: { label: 'a line transparency', max: 100 },
	lineWeight: { label: 'a line width', max: 150 },
};
const HEX = /^#[0-9a-f]{6}$/;
const round = (value: number) => String(Math.round(value * 100) / 100);

function reasonFor(state: ViewerState): string {
	if (state.loading) return 'Opening diagram.';
	if (!state.document) return 'Open a drawing to format its shapes.';
	if (!state.edit.sourceAvailable) return 'Open a .vsdx file to format shapes.';
	if (!state.selectedShapes.length) return 'Select a shape to format.';
	return styleSelection(state)
		? ''
		: 'Formatting requires a single shape that is not a group, a picture or on a locked layer.';
}

/**
 * Visio's Format Shape task pane (the Shape Styles launcher, the Fill, Line and Effects menus'
 * options commands and the shape menu's Format Shape): Fill (none or solid, colour, transparency,
 * pattern and its background), Line (colour, transparency, width, dash, cap, rounding and line
 * ends) and Effects (shadow, glow, soft edges, reflection). It follows the selection, and every
 * change is applied at once as one undoable `format-shape` edit per shape, through the same
 * action the ribbon uses.
 */
export class ViewerFormatPane {
	readonly #view;
	/** The colour to return to when a fill or line is switched back from none. */
	#last: Record<PaneTarget, string> = { fill: '#ffffff', line: '#000000' };
	constructor(
		private readonly root: ShadowRoot,
		private readonly controller: ViewerController,
		private readonly colors: ViewerColorMenus,
		private readonly run: (action: VisioFormattingAction) => void,
		private readonly reveal: () => void,
		private readonly announce: (message: string) => void,
	) {
		this.#view = createFormatPaneView(root.ownerDocument);
		for (const { value, label } of DASH_TYPES) {
			const option = root.ownerDocument.createElement('option');
			option.value = value;
			option.textContent = label;
			this.#view.dash.append(option);
		}
		// A harness without the workspace chrome still gets the view.
		(root.querySelector('.inspector-pane') ?? root).append(this.#view.section);
	}
	/** Show the pane, at `section` when given; it explains itself when nothing can be formatted. */
	show(section?: PaneSection): void {
		this.render(this.controller.state);
		this.reveal();
		if (!section) return;
		const set = section === 'effects' ? this.#view.effects : this.#view[section].set;
		set.scrollIntoView?.({ block: 'start' });
		set
			.querySelector<HTMLElement>(
				'input:not(:disabled), select:not(:disabled), button:not(:disabled)',
			)
			?.focus();
	}
	#format(patch: PanePatch): void {
		this.run({ type: 'shape-format', patch });
	}
	/** What a colour control does with a picked colour. */
	#pick(name: PaneColor, color: string, theme?: VisioThemeColorRef): void {
		if (name === 'fill' || name === 'line') return this.run(colorAction(name, color, theme));
		if (name === 'fillBackground') return this.#format({ fillBackgroundColor: color });
		const shapes = styleSelection(this.controller.state)?.shapes ?? [];
		this.#format(glowColorPatch(shapes, color));
	}
	wire(): () => void {
		const Abort = this.root.ownerDocument.defaultView?.AbortController ?? AbortController;
		const events = new Abort();
		const options = { signal: events.signal };
		const view = this.#view;
		for (const target of ['fill', 'line'] as const) {
			const part = view[target];
			part.none.addEventListener(
				'change',
				() => this.#format(target === 'fill' ? { fillColor: 'none' } : { linePattern: 0 }),
				options,
			);
			part.solid.addEventListener(
				'change',
				() => this.#format(target === 'fill' ? { fillColor: this.#last.fill } : { linePattern: 1 }),
				options,
			);
		}
		for (const [name, control] of Object.entries(view.colors) as [PaneColor, FormatPaneColor][]) {
			control.button.addEventListener(
				'click',
				() => this.#toggleGrid(control, control.grid.hasAttribute('hidden')),
				options,
			);
			control.grid.addEventListener(
				'office-color-pick',
				(event) => {
					event.stopPropagation();
					this.#toggleGrid(control, false);
					const pick = (event as CustomEvent<OfficeColorPick>).detail;
					this.#pick(name, pick.color, pickedThemeColor(pick));
				},
				options,
			);
			control.grid.addEventListener(
				'office-color-more',
				(event) => {
					event.stopPropagation();
					this.#toggleGrid(control, false);
					this.colors.moreColors.open(control.grid.value ?? undefined, (color) => {
						this.colors.remember(color);
						this.#pick(name, color);
					});
				},
				options,
			);
		}
		for (const field of Object.keys(NUMBERS) as PaneNumber[])
			view.numbers[field].addEventListener('change', () => this.#number(field), options);
		view.dash.addEventListener(
			'change',
			() => view.dash.value && this.#format({ linePattern: Number(view.dash.value) }),
			options,
		);
		for (const field of PANE_FIELDS)
			view.fields.get(field.key)!.addEventListener('change', () => this.#field(field), options);
		// Typing in the pane is not a canvas shortcut.
		view.section.addEventListener(
			'keydown',
			(event) => {
				if (event.key !== 'Escape' && event.key !== 'Tab') event.stopPropagation();
			},
			options,
		);
		// The Shape Styles group's dialog launcher.
		this.root.addEventListener(
			'office-command',
			(event) => {
				if ((event as CustomEvent<{ command?: unknown }>).detail?.command === 'shape-styles-dialog')
					this.show();
			},
			options,
		);
		return () => {
			events.abort();
			view.section.remove();
		};
	}
	#toggleGrid(control: FormatPaneColor, open: boolean): void {
		control.grid.hidden = !open;
		control.button.setAttribute('aria-expanded', String(open));
		if (open) control.grid.focus();
	}
	#valid(input: HTMLInputElement | HTMLSelectElement, label: string, max: number) {
		const value = Number(input.value);
		if (input.value.trim() !== '' && Number.isFinite(value) && value >= 0 && value <= max)
			return value;
		this.announce(`Enter ${label} from 0 to ${max}.`);
		this.render(this.controller.state);
		return undefined;
	}
	#number(field: PaneNumber): void {
		const { label, max } = NUMBERS[field];
		const value = this.#valid(this.#view.numbers[field], label, max);
		if (value !== undefined) this.#format({ [field]: value } as PanePatch);
	}
	#field(field: PaneField): void {
		const input = this.#view.fields.get(field.key)!;
		const shapes = styleSelection(this.controller.state)?.shapes;
		if (!shapes || input.value === '') return;
		const value = field.options
			? Number(input.value)
			: this.#valid(input, field.name ?? 'a value', field.max ?? 100);
		if (value !== undefined) this.#format(field.patch(value, paneFieldContext(shapes)));
	}
	render(state: ViewerState): void {
		const view = this.#view;
		const reason = reasonFor(state);
		const selection = reason ? undefined : styleSelection(state);
		const shapes = selection?.shapes ?? [];
		const context = paneFieldContext(shapes);
		const common = context.common;
		const disabled = !!reason || state.edit.busy;
		view.hint.textContent = reason;
		view.hint.hidden = !reason;
		const active = this.root.activeElement;
		const put = (input: HTMLInputElement | HTMLSelectElement, value: string) => {
			// Do not replace what is being typed.
			if (input !== active || disabled) input.value = value;
			input.disabled = disabled;
		};
		const fill = commonColor(shapes.map((shape) => shape.style.fill));
		const noLine = shapes.length > 0 && common.linePattern === 0;
		const line = commonColor(shapes.map((shape) => shape.style.lineColor));
		const current = {
			fill: { none: fill === 'none', color: fill === 'none' ? undefined : fill, known: !!fill },
			line: { none: noLine, color: line, known: common.linePattern !== undefined },
		};
		const shown: Record<PaneColor, string | undefined> = {
			fill: current.fill.color,
			line: current.line.color,
			fillBackground: common.fillBackgroundColor?.toLowerCase(),
			glow: commonColor(context.effects.map((values) => values.glow.color)),
		};
		for (const target of ['fill', 'line'] as const) {
			const part = view[target];
			const { none, color, known } = current[target];
			if (color && HEX.test(color)) this.#last[target] = color;
			// While an edit runs the model still has the old value: leave the choice just made alone.
			if (!state.edit.busy) {
				part.none.checked = known && none;
				part.solid.checked = known && !none;
				part.details.hidden = shapes.length > 0 && none;
			}
			part.none.disabled = part.solid.disabled = disabled;
		}
		for (const [name, control] of Object.entries(view.colors) as [PaneColor, FormatPaneColor][]) {
			const color = shown[name];
			const label = control.button.getAttribute('aria-label')!;
			control.button.disabled = disabled;
			control.button.title = `${label}${color ? `: ${color.toUpperCase()}` : ''}`;
			(control.button.firstElementChild as HTMLElement).style.background = color ?? 'transparent';
			control.button.toggleAttribute('data-mixed', !color);
			// The two paint grids follow the ribbon's; these two are the pane's own.
			if (name === 'fillBackground' || name === 'glow') control.grid.value = color ?? null;
			if (disabled || (name in current && current[name as PaneTarget].none))
				this.#toggleGrid(control, false);
		}
		put(
			view.numbers.fillTransparency,
			common.fillTransparency === undefined ? '' : String(common.fillTransparency),
		);
		put(
			view.numbers.lineTransparency,
			common.lineTransparency === undefined ? '' : String(common.lineTransparency),
		);
		const widths = shapes.map((shape) => round(shape.style.lineWidth * 72));
		put(view.numbers.lineWeight, commonColor(widths) ?? '');
		put(
			view.dash,
			common.linePattern === undefined || common.linePattern === 0
				? ''
				: String(common.linePattern),
		);
		for (const field of PANE_FIELDS)
			put(view.fields.get(field.key)!, shapes.length ? field.read(context) : '');
	}
}
