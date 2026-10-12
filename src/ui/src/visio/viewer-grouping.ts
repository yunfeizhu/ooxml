import {
	visioGroupCommand,
	visioUngroupCommand,
	visioSelectionIsOnPage,
} from 'ooxml-core/visio/ui';
import type { ViewerController, ViewerState } from './controller';
import type { RibbonCommand } from './ribbon-parts';

type Operation = 'group' | 'ungroup';
const COMMANDS: Record<Operation, { ids: readonly string[]; label: string; keys: string }> = {
	group: { ids: ['group-shapes', 'ctx-group'], label: 'Group', keys: 'Ctrl+Shift+G' },
	ungroup: { ids: ['ungroup', 'ctx-ungroup'], label: 'Ungroup', keys: 'Ctrl+Shift+U' },
};

/** Group and Ungroup availability; the controller owns the transaction and new selection. */
export class ViewerGrouping {
	constructor(
		private readonly root: ShadowRoot,
		private readonly controller: ViewerController,
		private readonly edit: (run: () => Promise<void>, message: string) => void,
	) {}
	private reason(state: ViewerState, operation: Operation): string {
		if (!state.edit.sourceAvailable) return 'Open a .vsdx file to group shapes.';
		if (state.loading || state.edit.busy) return 'Wait for the current operation to finish.';
		const page = state.document?.pages[state.pageIndex];
		if (!page || state.selectedShapes.some((shape) => !visioSelectionIsOnPage(shape, page.id)))
			return 'Select shapes on the current page.';
		const ids = state.selectedShapes.map((shape) => shape.id);
		if (operation === 'group' && !visioGroupCommand(page, ids))
			return 'Select two or more top-level shapes that are not lines or connectors, have no connector glued to them and are not on a locked layer.';
		if (operation === 'ungroup' && !visioUngroupCommand(page, ids))
			return 'Select one group that was made here and has no connector glued to its shapes.';
		return '';
	}
	run(operation: Operation): void {
		if (this.reason(this.controller.state, operation)) return;
		this.edit(
			() => this.controller.groupSelection(operation),
			operation === 'group' ? 'Grouped selected shapes.' : 'Ungrouped the selected group.',
		);
	}
	render(state: ViewerState): void {
		let any = false;
		for (const operation of ['group', 'ungroup'] as const) {
			const reason = this.reason(state, operation);
			any ||= !reason;
			const { ids, label, keys } = COMMANDS[operation];
			for (const id of ids) {
				const command = this.root.querySelector<RibbonCommand>(`[command="${id}"]`);
				if (!command) continue;
				command.disabled = !!reason;
				command.title = reason
					? `${label} (${keys}): ${reason}`
					: `${label} (${keys}): source locks and formulas may refuse this edit.`;
			}
		}
		const menu = this.root.querySelector<RibbonCommand>('[data-menu="group"]');
		if (menu) menu.disabled = !any;
	}
}
