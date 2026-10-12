import {
	VISIO_LAYOUT_LABELS,
	VISIO_LAYOUT_STYLES,
	visioAutoAlignCommands,
	visioReLayoutCommands,
	visioSelectionIsOnPage,
	type VisioLayoutPlan,
	type VisioLayoutStyle,
} from 'ooxml-core/visio/ui';
import type { OfficeUiGallery } from '../ribbon/gallery';
import type { ViewerController, ViewerState } from './controller';
import type { RibbonCommand } from './ribbon-parts';
import { syncReLayout } from './ribbon-layout';
import { choice, fieldset, ViewerDialog } from './viewer-dialog';

type Run = (action: () => Promise<void>, message: string) => void;
const AUTO_ALIGN = 'Auto Align & Space';

/**
 * Home > Arrange > Auto Align & Space and Design > Re-Layout Page with its Layout dialog. Both
 * act on the selection (two or more shapes) or the whole page and commit one move batch, so a
 * layout is a single undo step. Glued connectors follow through core glue recalculation.
 */
export class ViewerLayout {
	readonly options: ViewerDialog;
	#style: HTMLSelectElement;
	#memo: { page: unknown; selection: unknown; layout: boolean; align: boolean } | undefined;
	#spacing: HTMLInputElement;
	constructor(
		private readonly root: ShadowRoot,
		private readonly controller: ViewerController,
		private readonly run: Run,
	) {
		const doc = root.ownerDocument;
		this.options = new ViewerDialog(root, 'layout-dialog', 'Layout', ['Apply', 'Cancel'], (b) =>
			b === 'Apply' ? this.#apply() : this.options.close(),
		);
		this.#style = doc.createElement('select');
		this.#style.name = 'style';
		this.#style.setAttribute('aria-label', 'Style');
		for (const style of VISIO_LAYOUT_STYLES) {
			const option = doc.createElement('option');
			option.value = style;
			option.textContent = VISIO_LAYOUT_LABELS[style];
			this.#style.append(option);
		}
		this.#spacing = doc.createElement('input');
		this.#spacing.type = 'number';
		this.#spacing.name = 'spacing';
		this.#spacing.min = '0';
		this.#spacing.max = '10';
		this.#spacing.step = '0.25';
		this.#spacing.value = '0.5';
		this.#spacing.setAttribute('aria-label', 'Spacing (in)');
		const label = (text: string, control: HTMLElement) => {
			const element = doc.createElement('label');
			element.append(text, control);
			return element;
		};
		const page = choice(doc, 'radio', 'scope', 'page', 'Current page');
		const selection = choice(doc, 'radio', 'scope', 'selection', 'Selected shapes');
		page.input.checked = true;
		this.options.body.append(
			label('Style', this.#style),
			label('Spacing (in)', this.#spacing),
			fieldset(doc, 'Apply to', page.row, selection.row),
		);
	}
	#editable(state: ViewerState): boolean {
		return state.edit.sourceAvailable && !state.loading && !state.edit.busy;
	}
	/** The selection when two or more shapes on the page are selected, else the whole page. */
	#scope(state: ViewerState, page = true): string[] | undefined {
		const current = state.document?.pages[state.pageIndex];
		const ids = state.selectedShapes
			.filter((shape) => current && visioSelectionIsOnPage(shape, current.id))
			.map((shape) => shape.id);
		return ids.length > 1 ? ids : page ? undefined : [];
	}
	#plan(state: ViewerState, style: VisioLayoutStyle | 'auto-align', spacing?: number) {
		const page = state.document?.pages[state.pageIndex];
		if (!page || !this.#editable(state)) return undefined;
		const scope = this.#scope(state);
		return style === 'auto-align'
			? visioAutoAlignCommands(page, scope)
			: visioReLayoutCommands(page, style, scope, spacing === undefined ? {} : { spacing });
	}
	#commit(plan: VisioLayoutPlan, done: string): void {
		const skipped = plan.skipped
			? ` ${plan.skipped} shape${plan.skipped === 1 ? ' was' : 's were'} left in place.`
			: '';
		if (!plan.commands.length) {
			this.run(async () => {}, `The shapes are already laid out.${skipped}`);
			return;
		}
		this.run(() => this.controller.applyEdits(plan.commands), `${done}${skipped}`);
	}
	autoAlign(): void {
		const plan = this.#plan(this.controller.state, 'auto-align');
		if (plan) this.#commit(plan, `Aligned and spaced ${plan.placed} shapes.`);
	}
	reLayout(style: VisioLayoutStyle, spacing?: number): void {
		const plan = this.#plan(this.controller.state, style, spacing);
		if (plan)
			this.#commit(
				plan,
				`Laid out ${plan.placed} shapes as ${VISIO_LAYOUT_LABELS[style]} (${plan.edges} connections).`,
			);
	}
	showOptions(): void {
		const state = this.controller.state;
		if (!this.#plan(state, 'flowchart-tb')) return;
		const selection = this.options.body.querySelector<HTMLInputElement>('[value="selection"]')!;
		const multiple = (this.#scope(state, false) ?? []).length > 1;
		selection.disabled = !multiple;
		selection.checked = multiple;
		this.options.body.querySelector<HTMLInputElement>('[value="page"]')!.checked = !multiple;
		this.options.show();
		this.#style.focus();
	}
	#apply(): void {
		const spacing = Number(this.#spacing.value);
		if (!Number.isFinite(spacing) || spacing < 0 || spacing > 10) {
			this.options.error.textContent = 'Type a spacing between 0 and 10 inches.';
			return;
		}
		const state = this.controller.state;
		const page = state.document?.pages[state.pageIndex];
		const style = this.#style.value as VisioLayoutStyle;
		const whole = this.options.body.querySelector<HTMLInputElement>('[value="page"]')!.checked;
		const plan =
			page && this.#editable(state)
				? visioReLayoutCommands(page, style, whole ? undefined : this.#scope(state), { spacing })
				: undefined;
		if (!plan) {
			this.options.error.textContent = 'Nothing on this page can be laid out.';
			return;
		}
		this.options.close();
		this.#commit(plan, `Laid out ${plan.placed} shapes as ${VISIO_LAYOUT_LABELS[style]}.`);
	}
	/** Layout availability per page and selection, planned once rather than on every render. */
	#availability(state: ViewerState): { layout: boolean; align: boolean } {
		const page = state.document?.pages[state.pageIndex];
		const memo = this.#memo;
		if (memo && memo.page === page && memo.selection === state.selectedShapes) return memo;
		const editable = { ...state, edit: { ...state.edit, busy: false }, loading: false };
		this.#memo = {
			page,
			selection: state.selectedShapes,
			layout: !!this.#plan(editable, 'flowchart-tb'),
			align: !!this.#plan(editable, 'auto-align'),
		};
		return this.#memo;
	}
	render(state: ViewerState): void {
		const availability = this.#availability(state);
		const reason = !state.edit.sourceAvailable
			? 'Open a .vsdx file to lay out its shapes.'
			: state.loading || state.edit.busy
				? 'Wait for the current edit to finish.'
				: !availability.layout
					? 'The page needs two or more movable, unprotected shapes.'
					: undefined;
		const gallery = this.root.querySelector<OfficeUiGallery>(
			'office-ui-gallery[command="re-layout"]',
		);
		if (gallery) syncReLayout(gallery, reason);
		const launcher = this.root.querySelector<HTMLElement>(
			'office-ui-ribbon-group[launcher="layout-dialog"]',
		);
		if (launcher) {
			launcher.toggleAttribute('launcher-disabled', reason !== undefined);
			launcher.title = reason ? `Layout options: ${reason}` : 'Layout options';
		}
		const align = this.root.querySelector<RibbonCommand>('[command="auto-align"]');
		if (align) {
			const available = !reason && availability.align;
			align.disabled = !available;
			align.title = available
				? `${AUTO_ALIGN}: snap ${this.#scope(state) ? 'the selected shapes' : 'every shape on the page'} into rows and columns and even out the spacing.`
				: `${AUTO_ALIGN}: ${reason ?? 'the page needs two or more movable, unprotected shapes.'}`;
		}
		if (this.options.open) {
			if (reason && !state.edit.busy) this.options.close();
			else this.options.busy(state.edit.busy);
		}
	}
	/** Whether Position can open for Auto Align & Space. */
	available(state: ViewerState): boolean {
		return this.#editable(state) && this.#availability(state).align;
	}
}
