import type { VisioPage } from 'ooxml-core/visio';
import {
	VISIO_GRID_DENSITY_CHOICES,
	VISIO_RULER_DENSITY_CHOICES,
	editErrorMessage,
	isEditCancellation,
	visioGridSteps,
	visioRulerDensityFactor,
	visioRulerGridEdits,
	visioRulerGridValues,
	type VisioGridSteps,
	type VisioRulerGridValues,
} from 'ooxml-core/visio/ui';
import type { ViewerController, ViewerState } from './controller';
import { ViewerDialog, fieldset } from './viewer-dialog';
import type { RulerLook } from './viewer-ruler';

const LABEL = 'Ruler & Grid';
type Field = keyof VisioRulerGridValues;
type Choice = readonly { value: number; label: string }[];
/** The dialog's rows: section, row label, then the horizontal and vertical field. */
const ROWS: readonly (readonly [string, string, Field, Field, Choice?])[] = [
	['Rulers', 'Subdivisions', 'rulerDensityX', 'rulerDensityY', VISIO_RULER_DENSITY_CHOICES],
	['Rulers', 'Ruler zero (in.)', 'rulerOriginX', 'rulerOriginY'],
	['Grid', 'Grid spacing', 'gridDensityX', 'gridDensityY', VISIO_GRID_DENSITY_CHOICES],
	['Grid', 'Minimum spacing (in.)', 'gridSpacingX', 'gridSpacingY'],
	['Grid', 'Grid origin (in.)', 'gridOriginX', 'gridOriginY'],
];

/**
 * View > Show > Ruler & Grid, as Visio's dialog: ruler subdivisions and zero point, and the grid's
 * spacing, minimum spacing and origin, each for the horizontal and the vertical axis. OK saves
 * the changed cells of the page as one `set-page-layout` edit. The canvas grid, Snap to Grid and
 * the rulers follow the page's values (`steps`, `look`).
 */
export class ViewerRulerGrid {
	readonly dialog: ViewerDialog;
	#fields = new Map<Field, HTMLInputElement | HTMLSelectElement>();
	#generation: number | undefined;
	constructor(
		private readonly root: ShadowRoot,
		private readonly controller: ViewerController,
		private readonly announce: (message: string) => void,
	) {
		const doc = root.ownerDocument;
		this.dialog = new ViewerDialog(root, 'ruler-grid-dialog', LABEL, ['OK', 'Cancel'], (button) =>
			button === 'OK' ? void this.#apply() : this.dialog.close(),
		);
		for (const section of ['Rulers', 'Grid']) {
			const table = doc.createElement('div');
			table.className = 'ruler-grid-rows';
			const head = (text: string) =>
				Object.assign(doc.createElement('span'), {
					textContent: text,
					className: 'ruler-grid-axis',
				});
			table.append(doc.createElement('span'), head('Horizontal'), head('Vertical'));
			for (const [group, label, x, y, choices] of ROWS) {
				if (group !== section) continue;
				table.append(Object.assign(doc.createElement('span'), { textContent: label }));
				for (const [field, axis] of [
					[x, 'horizontal'],
					[y, 'vertical'],
				] as const)
					table.append(this.#control(doc, field, `${label}, ${axis}`, choices));
			}
			this.dialog.body.append(fieldset(doc, section, table));
		}
	}
	#control(doc: Document, field: Field, label: string, choices?: Choice) {
		let control: HTMLInputElement | HTMLSelectElement;
		if (choices) {
			control = doc.createElement('select');
			for (const choice of choices)
				control.append(
					Object.assign(doc.createElement('option'), {
						value: String(choice.value),
						textContent: choice.label,
					}),
				);
		} else {
			control = doc.createElement('input');
			control.type = 'number';
			control.step = '0.125';
			if (field.startsWith('gridSpacing')) control.min = '0';
		}
		control.dataset.field = field;
		control.setAttribute('aria-label', label);
		this.#fields.set(field, control);
		return control;
	}
	#page(state: ViewerState): VisioPage | undefined {
		return state.document?.pages[state.pageIndex];
	}
	#refusal(state: ViewerState): string | undefined {
		if (!this.#page(state)) return 'Open a drawing first.';
		if (!state.edit.sourceAvailable) return 'Open a .vsdx file to change the ruler and grid.';
		if (state.loading || state.edit.busy) return 'Wait for the current edit to finish.';
		return undefined;
	}
	/** Grid lines of the shown page at the current zoom, for the canvas and Snap to Grid. */
	steps(state: ViewerState = this.controller.state): VisioGridSteps {
		return visioGridSteps(this.#page(state) ?? {}, state.zoom || 1);
	}
	/** Where the rulers' zero is and how many subdivisions they show. */
	look(state: ViewerState = this.controller.state): RulerLook {
		const values = this.#page(state) ? visioRulerGridValues(this.#page(state)!) : undefined;
		return {
			originX: values?.rulerOriginX ?? 0,
			originY: values?.rulerOriginY ?? 0,
			densityX: visioRulerDensityFactor(values?.rulerDensityX ?? 32),
			densityY: visioRulerDensityFactor(values?.rulerDensityY ?? 32),
		};
	}
	show(): void {
		const state = this.controller.state;
		const page = this.#page(state);
		const refusal = this.#refusal(state);
		if (!page || refusal !== undefined) return this.announce(`${LABEL}: ${refusal}`);
		const values = visioRulerGridValues(page);
		for (const [field, control] of this.#fields)
			control.value = String(Number(values[field].toFixed(6)));
		this.#generation = this.controller.documentGeneration;
		this.dialog.show();
		this.#fields.get('rulerDensityX')!.focus();
	}
	async #apply(): Promise<void> {
		const state = this.controller.state;
		const page = this.#page(state);
		if (!page || this.controller.documentGeneration !== this.#generation)
			return this.dialog.close();
		const values = {} as VisioRulerGridValues;
		for (const [field, control] of this.#fields) {
			const value = Number(control.value);
			if (control.value.trim() === '' || !Number.isFinite(value)) {
				this.dialog.error.textContent = `${control.getAttribute('aria-label')}: enter a number.`;
				control.focus();
				return;
			}
			if (field.startsWith('gridSpacing') && value < 0) {
				this.dialog.error.textContent = 'Minimum spacing cannot be negative.';
				control.focus();
				return;
			}
			values[field] = value;
		}
		const edits = visioRulerGridEdits(page, values);
		if (!edits.length) return this.dialog.close();
		this.dialog.busy(true);
		try {
			await this.controller.applyEdits(edits);
			this.dialog.close();
			this.announce('Updated the ruler and grid.');
		} catch (error) {
			if (this.dialog.open && !isEditCancellation(error))
				this.dialog.error.textContent = editErrorMessage(error);
		} finally {
			this.dialog.busy(false);
		}
	}
	wire(): () => void {
		const listener = (event: Event) => {
			if ((event as CustomEvent<{ command?: unknown }>).detail?.command === 'show-dialog')
				this.show();
		};
		this.root.addEventListener('office-command', listener);
		return () => {
			this.root.removeEventListener('office-command', listener);
			this.dialog.close();
		};
	}
	render(state: ViewerState): void {
		const refusal = this.#refusal(state);
		const group = this.root.querySelector<HTMLElement>(
			'office-ui-ribbon-group[launcher="show-dialog"]',
		);
		group?.toggleAttribute('launcher-disabled', refusal !== undefined);
		if (group) group.title = refusal === undefined ? LABEL : `${LABEL}: ${refusal}`;
		if (
			this.dialog.open &&
			(state.loading || this.controller.documentGeneration !== this.#generation)
		)
			this.dialog.close();
		// The canvas grid follows the page: step and origin per axis, in screen pixels.
		const svg = this.root.querySelector<SVGSVGElement>('.viewport svg.paper');
		if (!svg) return;
		const steps = this.steps(state);
		const pixels = 96 * (state.zoom || 1);
		svg.style.setProperty('--_vv-grid-x', `${steps.x * pixels}px`);
		svg.style.setProperty('--_vv-grid-y', `${steps.y * pixels}px`);
		svg.style.setProperty('--_vv-grid-origin-x', `${steps.originX * pixels}px`);
		svg.style.setProperty('--_vv-grid-origin-y', `${steps.originY * pixels}px`);
	}
}
