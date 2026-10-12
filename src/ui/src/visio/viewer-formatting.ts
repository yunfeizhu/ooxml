import type { VisioEdit, VisioTextFormatEdit, VisioThemeColorRef } from 'ooxml-core/visio';
import {
	visioChangeCaseCommand,
	visioChangeCaseShape,
	visioFormattingShape,
	visioFormatTargetShape,
	visioFontFamilies,
	visioTextBlockEdit,
	visioTextBlockFrame,
	visioTextBlockShape,
	visioOrderingShape,
	visioTextFormattingState,
	visioTextIndentCommand,
	visioTextFontStepCommand,
} from 'ooxml-core/visio/ui';
import type { ViewerController, ViewerState } from './controller';
import type { VisioFormattingAction } from './ribbon-action';
import type { RibbonCommand } from './ribbon-parts';
import { renderPaintMenus } from './viewer-paint-menu';
import { pageAccentColor, renderShapeStyleControls } from './viewer-shape-styles';
import { VISIO_GLOW_TRANSPARENCY } from 'ooxml-core/visio';

type Combo = RibbonCommand & {
	value: string;
	options: { value: string; label: string; disabled?: boolean }[];
};
const sizes = [6, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72];
const toggles = ['bold', 'italic', 'underline', 'strikethrough'] as const;
const horizontal = ['left', 'center', 'right'] as const;
const vertical = ['top', 'middle', 'bottom'] as const;

/** Selection-aware ribbon presentation; all writes go through the controller's edit worker. */
export class ViewerFormatting {
	#fontColor = '#000000';
	/** The Theme Colors swatch the split button's colour came from, if any. */
	#fontColorTheme: VisioThemeColorRef | undefined;
	constructor(
		private readonly root: ShadowRoot,
		private readonly controller: ViewerController,
		private readonly edit: (run: () => Promise<void>, success: string) => void,
	) {}

	run(action: VisioFormattingAction): void {
		const state = this.controller.state;
		if (action.type === 'glow-preset') {
			const page = state.document?.pages[state.pageIndex];
			const color = pageAccentColor(page, action.accent);
			return this.run({
				type: 'shape-format',
				patch: { glow: { size: action.size, color, transparency: VISIO_GLOW_TRANSPARENCY } },
			});
		}
		if (!state.edit.sourceAvailable || state.loading || state.edit.busy) return;
		const sourceGeneration = this.controller.sourceGeneration;
		const page = state.document?.pages[state.pageIndex];
		const selections = state.selectedShapes;
		if (
			!page ||
			!selections.length ||
			selections.some((selection) => selection.pageId && selection.pageId !== page.id)
		)
			return;
		if (action.type === 'shape-order' && selections.length > 1) return;
		if (action.type === 'change-case') {
			if (selections.some(({ id }) => !visioChangeCaseShape(page, id))) return;
			const edits = selections
				.map(({ id }) => visioChangeCaseCommand(page, id, action.mode))
				.filter((edit) => !!edit);
			// No command means the text already has that case: the edit runner reports no change.
			this.edit(
				async () => (edits.length ? this.controller.applyEdits(edits) : undefined),
				'Changed text case.',
			);
			return;
		}
		if (action.type === 'text-rotate') {
			const blocks = selections.map(({ id }) => visioTextBlockShape(page, id));
			if (blocks.some((shape) => !shape)) return;
			// As Visio: TxtAngle gains 90 degrees and the block keeps its size and pin.
			const edits = blocks.map((shape) => {
				const frame = visioTextBlockFrame(shape!);
				const turns = Math.round(frame.angle / (Math.PI / 2)) + 1;
				return visioTextBlockEdit(page, shape!, {
					...frame,
					angle: (((((turns + 2) % 4) + 4) % 4) - 2) * (Math.PI / 2),
				});
			});
			this.edit(() => this.controller.applyEdits(edits), 'Rotated the text.');
			return;
		}
		const candidates = selections.map(({ id }) =>
			action.type === 'shape-order'
				? visioOrderingShape(page, id)
				: action.type === 'shape-format'
					? visioFormatTargetShape(page, id)
					: visioFormattingShape(page, id),
		);
		if (candidates.some((shape) => !shape)) return;
		const shapes = candidates.filter((shape) => !!shape);
		const aggregate = visioTextFormattingState(shapes);
		if (action.type === 'font-color' && action.value) {
			this.#fontColor = action.value;
			this.#fontColorTheme = action.theme;
		}
		const commands: VisioEdit[] = shapes.map((shape) => {
			const target = { pageId: page.id, shapeId: shape.id };
			if (action.type === 'shape-order')
				return { type: 'reorder-shape', ...target, order: action.order };
			if (action.type === 'shape-format')
				return { type: 'format-shape', ...target, ...action.patch };
			if (action.type === 'text-indent')
				return visioTextIndentCommand(page, shape.id, action.direction)!;
			if (action.type === 'font-step')
				return visioTextFontStepCommand(
					page,
					shape.id,
					action.direction === 1 ? 'increase' : 'decrease',
				)!;
			const patch: Omit<VisioTextFormatEdit, 'type' | 'pageId' | 'shapeId'> = {};
			switch (action.type) {
				case 'text-toggle':
					patch[action.property] = !aggregate[action.property];
					break;
				case 'text-bullets':
					patch.bullets = !aggregate.bullets;
					break;
				case 'font-color':
					patch.fontColor = this.#fontColor;
					if (this.#fontColorTheme) patch.fontColorTheme = this.#fontColorTheme;
					break;
				case 'font-family':
					patch.fontFamily = action.value;
					break;
				case 'font-size':
					patch.fontSize = action.value;
					break;
				case 'text-align':
					if (action.axis === 'horizontal') patch.horizontalAlign = action.value;
					else patch.verticalAlign = action.value;
					break;
			}
			return { type: 'format-text', ...target, ...patch };
		});
		if (commands.some((command) => !command)) return;
		const current = this.controller.state;
		if (
			current.document !== state.document ||
			current.pageIndex !== state.pageIndex ||
			current.selectedShapes !== selections ||
			this.controller.sourceGeneration !== sourceGeneration
		)
			return;
		this.edit(
			() =>
				action.type === 'shape-format'
					? this.controller.applySelectionEdits(commands)
					: this.controller.applyEdits(commands),
			action.type === 'shape-order' ? 'Updated shape order.' : 'Updated shape formatting.',
		);
	}

	render(state: ViewerState): void {
		const page = state.document?.pages[state.pageIndex];
		const selections = state.selectedShapes;
		const selection = state.selectedShape;
		const currentPage = selections.every((item) => !item.pageId || item.pageId === page?.id);
		const candidates =
			page && currentPage ? selections.map((item) => visioFormattingShape(page, item.id)) : [];
		const styleCandidates =
			page && currentPage ? selections.map((item) => visioFormatTargetShape(page, item.id)) : [];
		const shapes = candidates.filter((shape) => !!shape);
		const styleShapes = styleCandidates.filter((shape) => !!shape);
		const shape = shapes.length === selections.length ? shapes.at(-1) : undefined;
		const styleShape = styleShapes.length === selections.length ? styleShapes.at(-1) : undefined;
		const aggregate = visioTextFormattingState(shapes);
		const baseReason = state.loading
			? 'Opening diagram.'
			: state.edit.busy
				? 'Updating diagram.'
				: !state.edit.sourceAvailable
					? 'Open a .vsdx file to edit formatting.'
					: !selection
						? 'Select a shape to edit formatting.'
						: '';
		const reason =
			baseReason ||
			(!shape
				? 'Text formatting needs a shape or a stencil group: not a group drawn on the page, a picture, a stencil connector, a drawn shape on a layer or a shape on a locked layer.'
				: '');
		const styleReason =
			baseReason ||
			(!styleShape
				? 'Formatting needs a shape or a stencil group: not a group drawn on the page, a picture, a stencil connector, a drawn shape on a layer or a shape on a locked layer.'
				: '');
		const set = (element: RibbonCommand | null, disabled: string, pressed?: boolean) => {
			if (!element) return;
			element.disabled = !!disabled;
			const label = element.getAttribute('label') ?? element.getAttribute('aria-label') ?? '';
			element.title = disabled
				? `${label}: ${disabled}`
				: `${label}: source formulas and protection can refuse this edit.`;
			if (pressed !== undefined) element.setAttribute('pressed', String(pressed));
		};
		const button = (id: string) => this.root.querySelector<RibbonCommand>(`[command="${id}"]`);
		for (const property of toggles) set(button(property), reason, !!shape && aggregate[property]);
		for (const value of horizontal)
			set(button(`align-${value}`), reason, !!shape && aggregate.horizontalAlign === value);
		set(button('justify'), reason, !!shape && aggregate.horizontalAlign === 'justify');
		set(button('bullets'), reason, !!shape && aggregate.bullets);
		set(
			button('rotate-text'),
			baseReason ||
				(!page || !currentPage || selections.some((item) => !visioTextBlockShape(page, item.id))
					? 'Rotate Text requires top-level two-dimensional shapes.'
					: ''),
		);
		const indentReason =
			reason ||
			(!page || !shapes.every((item) => visioTextIndentCommand(page, item.id, 'increase'))
				? 'Indent requires uniform supported paragraph indents.'
				: '');
		set(button('indent-increase'), indentReason);
		set(
			button('indent-decrease'),
			indentReason || (!aggregate.canIndentDecrease ? 'The selected text has no left indent.' : ''),
		);
		set(button('font-color'), reason);
		const caseReason =
			baseReason ||
			(!page || !currentPage || selections.some((item) => !visioChangeCaseShape(page, item.id))
				? 'Change Case requires selected shapes with text.'
				: '');
		set(this.root.querySelector<RibbonCommand>('[data-menu="change-case"]'), caseReason);
		for (const mode of ['sentence', 'lower', 'upper', 'capitalize', 'toggle'])
			set(button(`case-${mode}`), caseReason);
		for (const value of vertical)
			set(button(`align-${value}`), reason, !!shape && aggregate.verticalAlign === value);
		for (const [id, direction] of [
			['grow-font', 'increase'],
			['shrink-font', 'decrease'],
		] as const)
			set(
				button(id),
				reason ||
					(!page || !shapes.every((item) => visioTextFontStepCommand(page, item.id, direction))
						? 'Font-size steps require uniform run sizes within the supported range of 1 to 1000 pt.'
						: ''),
			);
		const font = this.root.querySelector<Combo>('[data-combo="font"]');
		const size = this.root.querySelector<Combo>('[data-combo="font-size"]');
		const families = state.document ? visioFontFamilies(state.document) : [];
		set(font, reason || (!families.length ? 'The drawing has no supported font definitions.' : ''));
		set(size, reason);
		if (font) {
			font.options = families.map((value) => ({ value, label: value }));
			const current = aggregate.fontFamily ?? '';
			if (!families.includes(current))
				font.options.unshift({
					value: current,
					label: current || (selections.length ? 'Mixed' : 'Font'),
					disabled: true,
				});
			font.value = aggregate.fontFamily ?? '';
		}
		if (size) {
			const current =
				shape && aggregate.fontSize !== undefined
					? Number((aggregate.fontSize * 72).toFixed(2))
					: undefined;
			size.options = [...new Set([...sizes, ...(current === undefined ? [] : [current])])]
				.sort((a, b) => a - b)
				.map((value) => ({ value: String(value), label: `${value} pt` }));
			if (current === undefined)
				size.options.unshift({
					value: '',
					label: selections.length ? 'Mixed' : 'Size',
					disabled: true,
				});
			size.value = current === undefined ? '' : String(current);
		}
		renderPaintMenus(this.root, styleShape ? styleShapes : [], styleReason, set);
		renderShapeStyleControls(this.root, styleShape ? styleShapes : [], styleReason, set, page);
		const ordering =
			page && selection && currentPage ? visioOrderingShape(page, selection.id) : undefined;
		const orderReason =
			state.loading || state.edit.busy || !state.edit.sourceAvailable || !selection
				? baseReason
				: selections.length > 1
					? 'Select one shape to change its drawing order.'
					: !ordering
						? 'Ordering takes a stencil shape off locked layers, or a drawn shape that is not a group, a picture or on a layer.'
						: '';
		const index = ordering && page ? page.shapes.indexOf(ordering) : -1;
		for (const id of ['bring-to-front', 'bring-forward', 'ctx-bring-to-front', 'ctx-bring-forward'])
			set(
				button(id),
				orderReason ||
					(index === (page?.shapes.length ?? 0) - 1 ? 'The shape is already at the front.' : ''),
			);
		for (const id of ['send-to-back', 'send-backward', 'ctx-send-to-back', 'ctx-send-backward'])
			set(button(id), orderReason || (index === 0 ? 'The shape is already at the back.' : ''));
	}
}
