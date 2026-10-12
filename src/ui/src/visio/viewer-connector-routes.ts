import { VISIO_CONNECTOR_ROUTES, type VisioConnectorRoute, type VisioEdit } from 'ooxml-core/visio';
import { visioConnectorRouteOf, visioSelectionIsOnPage } from 'ooxml-core/visio/ui';
import type { ViewerController, ViewerState } from './controller';
import type { VisioRibbonAction } from './ribbon-action';
import type { RibbonCommand } from './ribbon-parts';

/**
 * The connector style: Design > Connectors restyles the selected connectors and sets the style
 * of new ones; Insert > Connector sets the style and arms the Connector tool. New connectors are
 * right-angle, as Visio's default dynamic connector.
 */
export class ViewerConnectorRoutes {
	#route: VisioConnectorRoute = 'right-angle';
	constructor(
		private readonly root: ShadowRoot,
		private readonly controller: ViewerController,
		private readonly host: {
			setTool(tool: 'connector'): void;
			edit(run: () => Promise<void>, message: string): void;
			announce(message: string): void;
		},
	) {}
	get route(): VisioConnectorRoute {
		return this.#route;
	}
	/** Selected connectors whose route can change, with their current route. */
	#selected(state: ViewerState): { id: string; route: VisioConnectorRoute }[] {
		const page = state.document?.pages[state.pageIndex];
		if (!page) return [];
		return state.selectedShapes.flatMap((selection) => {
			if (!visioSelectionIsOnPage(selection, page.id)) return [];
			const shape = page.shapes.find((candidate) => candidate.id === selection.id);
			const route = shape ? visioConnectorRouteOf(shape) : undefined;
			return route ? [{ id: selection.id, route }] : [];
		});
	}
	run(action: Extract<VisioRibbonAction, { type: 'connector-route' }>): void {
		this.#route = action.route;
		const state = this.controller.state;
		if (action.scope === 'tool') {
			this.host.setTool('connector');
			this.host.announce(`Connector tool: new connectors are ${action.route}.`);
			this.render(state);
			return;
		}
		const page = state.document?.pages[state.pageIndex];
		const edits: VisioEdit[] = this.#selected(state)
			.filter((connector) => connector.route !== action.route)
			.map((connector) => ({
				type: 'set-connector-route',
				pageId: page!.id,
				shapeId: connector.id,
				route: action.route,
			}));
		this.render(state);
		if (!edits.length) {
			this.host.announce(`New connectors are ${action.route}.`);
			return;
		}
		this.host.edit(
			() => this.controller.applyEdits(edits),
			`${edits.length === 1 ? 'Connector' : `${edits.length} connectors`} set to ${action.route}.`,
		);
	}
	render(state: ViewerState): void {
		const editable = state.edit.sourceAvailable && !state.loading && !state.edit.busy;
		const page = state.document?.pages[state.pageIndex];
		const selected = this.#selected(state);
		const shown =
			selected.length && selected.every((connector) => connector.route === selected[0]!.route)
				? selected[0]!.route
				: this.#route;
		for (const [menu, current] of [
			['connectors', shown],
			['insert-connector', this.#route],
		] as const) {
			const trigger = this.root.querySelector<RibbonCommand>(`[data-menu="${menu}"]`);
			if (trigger) trigger.disabled = !editable || !page;
			for (const route of VISIO_CONNECTOR_ROUTES) {
				const item = this.root.querySelector<RibbonCommand>(`[command="${menu}-${route}"]`);
				item?.setAttribute('checked', String(route === current));
				if (item) item.disabled = !editable || !page;
			}
		}
	}
}
