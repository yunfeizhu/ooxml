import type { VisioPage } from 'ooxml-core/visio';
import {
	editErrorMessage,
	isEditCancellation,
	visioSelectionIsOnPage,
	visioSubprocessCommand,
} from 'ooxml-core/visio/ui';
import type { ViewerController, ViewerState } from './controller';
import type { RibbonCommand } from './ribbon-parts';
import { InsertDialog } from './viewer-insert-dialog';

type Run = (action: () => Promise<void>, success: string) => void;
type Mode = 'new' | 'selection' | 'existing';
const LABELS: Record<Mode, { id: string; label: string }> = {
	new: { id: 'create-new', label: 'Create New' },
	selection: { id: 'create-from-selection', label: 'Create from Selection' },
	existing: { id: 'link-existing', label: 'Link to Existing' },
};

/**
 * Process > Subprocess. Create New and Create from Selection are one core transaction (one undo
 * step); Link to Existing adds a hyperlink to a chosen page. Links follow with Ctrl+click.
 */
export class ViewerSubprocess {
	readonly link: InsertDialog;
	#target: { pageId: string; shapeId: string; row?: string; generation: number } | undefined;
	constructor(
		private readonly root: ShadowRoot,
		private readonly controller: ViewerController,
		private readonly announce: (message: string) => void,
		private readonly run: Run,
	) {
		this.link = new InsertDialog(
			root,
			'link-existing-dialog',
			'Link to Existing',
			[{ name: 'page', label: 'Page', choices: true }],
			['OK', 'Cancel'],
			(button) => void this.#applyLink(button),
		);
	}
	#page(state: ViewerState): VisioPage | undefined {
		return state.document?.pages[state.pageIndex];
	}
	#ids(state: ViewerState): string[] {
		const page = this.#page(state);
		if (!page || !state.selectedShapes.every((shape) => visioSelectionIsOnPage(shape, page.id)))
			return [];
		return state.selectedShapes.map((shape) => shape.id);
	}
	reason(state: ViewerState, mode: Mode): string {
		if (!state.edit.sourceAvailable) return 'Open a .vsdx file to create subprocesses.';
		if (state.loading || state.edit.busy) return 'Wait for the current operation to finish.';
		const page = this.#page(state);
		if (!page || page.isBackground) return 'Open a foreground page.';
		const ids = this.#ids(state);
		if (mode === 'selection')
			return ids.length && visioSubprocessCommand(state.document!, page, ids, 'selection')
				? ''
				: 'Select top-level shapes on the current page.';
		if (ids.length !== 1) return 'Select one shape on the current page.';
		if (mode === 'existing' && state.document!.pages.length < 2)
			return 'The drawing has no other page to link to.';
		return '';
	}
	start(mode: Mode): void {
		const state = this.controller.state;
		if (this.reason(state, mode)) {
			this.announce(`${LABELS[mode].label}: ${this.reason(state, mode)}`);
			return;
		}
		const page = this.#page(state)!;
		const ids = this.#ids(state);
		if (mode === 'existing') return this.#openLink(state, page, ids[0]!);
		const command = visioSubprocessCommand(state.document!, page, ids, mode);
		if (!command) return;
		const generation = this.controller.documentGeneration;
		this.run(async () => {
			await this.controller.applyEdits([command]);
			const shapeId = command.selection?.shapeId;
			if (shapeId && this.controller.documentGeneration === generation + 1)
				this.controller.selectShape({ id: shapeId, name: '' });
		}, `Created subprocess page ${command.name}. Ctrl+click the linked shape to open it.`);
	}
	#openLink(state: ViewerState, page: VisioPage, shapeId: string): void {
		const shape = page.shapes.find((item) => item.id === shapeId);
		const existing = (shape?.hyperlinks ?? []).find((link) => !link.invisible);
		this.#target = {
			pageId: page.id,
			shapeId,
			generation: this.controller.documentGeneration,
			...(existing ? { row: existing.name } : {}),
		};
		const others = state.document!.pages.filter(
			(item) => item.id !== page.id && !item.isBackground,
		);
		this.link.choices(
			'page',
			others.map((item) => item.name),
			others[0]?.name ?? '',
		);
		this.link.error.textContent = '';
		this.link.dialog.show();
		this.link.fields.get('page')?.focus();
	}
	async #applyLink(button: string): Promise<void> {
		if (button === 'Cancel') return this.link.dialog.close();
		const target = this.#target;
		const name = this.link.value('page');
		if (!target || this.controller.documentGeneration !== target.generation) return;
		if (!name) {
			this.link.error.textContent = 'Choose a page.';
			return;
		}
		try {
			await this.controller.applyEdits([
				{
					type: 'set-shape-hyperlink',
					pageId: target.pageId,
					shapeId: target.shapeId,
					...(target.row === undefined ? {} : { row: target.row }),
					hyperlink: { address: '', subAddress: name, description: name },
				},
			]);
			if (this.#target === target) this.link.dialog.close();
			this.announce(`Linked the shape to ${name}. Ctrl+click it to open the page.`);
		} catch (error) {
			if (this.link.dialog.open && !isEditCancellation(error))
				this.link.error.textContent = editErrorMessage(error);
		}
	}
	close(): void {
		this.link.dialog.close();
	}
	render(state: ViewerState): void {
		for (const mode of ['new', 'selection', 'existing'] as const) {
			const { id, label } = LABELS[mode];
			const control = this.root.querySelector<RibbonCommand>(`[command="${id}"]`);
			if (!control) continue;
			const reason = this.reason(state, mode);
			control.disabled = !!reason;
			control.title = reason
				? `${label}: ${reason}`
				: mode === 'existing'
					? `${label}: link the selected shape to another page.`
					: `${label}: insert a page linked from ${mode === 'new' ? 'the selected shape' : 'a shape replacing the selection'} (one undo step).`;
		}
		if (
			this.link.dialog.open &&
			(!state.edit.sourceAvailable ||
				state.loading ||
				this.controller.documentGeneration !== this.#target?.generation)
		)
			this.link.dialog.close();
		else if (this.link.dialog.open) this.link.busy(state.edit.busy);
	}
}
