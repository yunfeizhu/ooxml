import {
	visioCalloutCommand,
	visioContainerCommand,
	visioSelectionIsOnPage,
} from 'ooxml-core/visio/ui';
import type { OfficeUiGallery } from '../ribbon/gallery';
import type { ViewerController, ViewerState } from './controller';
import type { VisioDiagramPartAction } from './ribbon-action';
import {
	CALLOUT_STYLE_NAMES,
	CONTAINER_STYLE_NAMES,
	syncDiagramPart,
	type DiagramPart,
} from './ribbon-diagram-parts';
import type { RibbonCommand } from './ribbon-parts';

/**
 * Insert > Container and Callout (and the shape menu's Container): one core edit each, so undo
 * restores the page in one step. Availability follows the selection; core admission decides.
 */
export class ViewerDiagramParts {
	constructor(
		private readonly root: ShadowRoot,
		private readonly controller: ViewerController,
		private readonly edit: (run: () => Promise<void>, message: string) => void,
		private readonly revealText: () => void,
	) {}
	reason(state: ViewerState, part: DiagramPart): string | undefined {
		if (!state.edit.sourceAvailable) return 'Open a .vsdx file to insert diagram parts.';
		if (state.loading || state.edit.busy) return 'Wait for the current operation to finish.';
		const page = state.document?.pages[state.pageIndex];
		if (!page || state.selectedShapes.some((shape) => !visioSelectionIsOnPage(shape, page.id)))
			return 'Select shapes on the current page.';
		const ids = state.selectedShapes.map((shape) => shape.id);
		if (part === 'container' && !visioContainerCommand(page, ids, 'classic'))
			return 'Select top-level shapes on this page, or nothing for an empty container.';
		if (part === 'callout' && !visioCalloutCommand(page, ids, 'rectangle'))
			return 'Select one two-dimensional shape to attach the callout to.';
		return undefined;
	}
	run(action: VisioDiagramPartAction): void {
		if (this.reason(this.controller.state, action.part) !== undefined) return;
		const name =
			action.part === 'container'
				? `${CONTAINER_STYLE_NAMES[action.style]} container`
				: `${CALLOUT_STYLE_NAMES[action.style]} callout`;
		this.edit(async () => {
			await this.controller.insertDiagramPart(
				action.part === 'container'
					? { kind: 'container', style: action.style }
					: { kind: 'callout', style: action.style },
			);
			// A new callout is empty: type its text straight away, as in Visio.
			if (action.part === 'callout') this.revealText();
		}, `Inserted a ${name}.`);
	}
	render(state: ViewerState): void {
		for (const part of ['container', 'callout'] as const) {
			const gallery = this.root.querySelector<OfficeUiGallery>(
				`office-ui-gallery[command="${part}"]`,
			);
			if (gallery) syncDiagramPart(gallery, part, this.reason(state, part));
		}
		const item = this.root.querySelector<RibbonCommand>('[command="ctx-container"]');
		if (item) {
			const reason = this.reason(state, 'container');
			item.disabled = reason !== undefined;
			item.title = reason ? `Container: ${reason}` : 'Container: frame the selected shapes.';
		}
	}
}
