import type { VisioMatrix, VisioPage, VisioShape } from 'ooxml-core/visio';
import {
	composeVisioTransform,
	editErrorMessage,
	isEditCancellation,
	visioAddConnectionPointCommand,
	visioConnectableShape,
	VISIO_IDENTITY_TRANSFORM,
} from 'ooxml-core/visio/ui';
import type { ViewerController, ViewerState } from './controller';
import { pagePoint } from './viewer-page-point';

const SVG = 'http://www.w3.org/2000/svg';
const MARKER_PX = 4;
export interface SelectedConnectionPoint {
	pageId: string;
	shapeId: string;
	index: number;
}
const REFUSED =
	'Connection points can be added to local 2D shapes; groups, lines, connectors and master instances (whose points come from their master) are not edited here.';

/** The page's shapes by ID, including group members, with their page transforms. */
function placedShapes(page: VisioPage): Map<string, { shape: VisioShape; world: VisioMatrix }> {
	const result = new Map<string, { shape: VisioShape; world: VisioMatrix }>();
	const visit = (shapes: readonly VisioShape[], parent: VisioMatrix) => {
		for (const shape of shapes) {
			const world = composeVisioTransform(parent, shape.transform);
			result.set(shape.id, { shape, world });
			visit(shape.children, world);
		}
	};
	visit(page.shapes, VISIO_IDENTITY_TRANSFORM);
	return result;
}

/**
 * View > Visual Aids > Connection Points (Visio's blue x markers) and Home > Tools > Connection
 * Point (Ctrl+Shift+1): a click on a local 2D shape adds a point there, a click on a point selects
 * it, and Delete removes the selected point. Edits go through the core and undo like any other.
 */
export class ViewerConnectionPoints {
	#visible = true;
	#selected: SelectedConnectionPoint | undefined;
	#overlay: SVGGElement | undefined;
	#key: unknown[] = [];
	#request = 0;
	constructor(
		private readonly viewport: HTMLElement,
		private readonly controller: ViewerController,
		private readonly options: {
			active(): boolean;
			/** Other tools that show points while they run (the Connector tool). */
			showing(): boolean;
			announce(message: string): void;
		},
	) {}
	get visible(): boolean {
		return this.#visible;
	}
	get selected(): SelectedConnectionPoint | undefined {
		return this.#selected;
	}
	toggle(): void {
		this.#visible = !this.#visible;
		this.render(this.controller.state);
	}
	#page(state = this.controller.state): VisioPage | undefined {
		return state.document?.pages[state.pageIndex];
	}
	/** Draw the markers in the page's SVG; markers are presentation only and never exported. */
	render(state: ViewerState): void {
		const page = this.#page(state);
		const svg = this.viewport.querySelector<SVGSVGElement>('svg.paper');
		if (this.#selected && (!page || this.#selected.pageId !== page.id)) this.#selected = undefined;
		const shown =
			!!page && !!svg && (this.#visible || this.options.active() || this.options.showing());
		const key = [svg, page, state.zoom, shown, this.options.active(), this.#selected];
		if (key.every((value, i) => value === this.#key[i]) && this.#overlay?.isConnected) return;
		this.#key = key;
		this.#overlay?.remove();
		this.#overlay = undefined;
		if (!shown || !page || !svg) return;
		const doc = this.viewport.ownerDocument;
		const overlay = doc.createElementNS(SVG, 'g') as SVGGElement;
		overlay.dataset.connectionPoints = '';
		overlay.setAttribute('aria-hidden', 'true');
		const scale = svg.getScreenCTM?.()?.a || 96 * state.zoom;
		const size = MARKER_PX / scale;
		for (const { shape, world } of placedShapes(page).values()) {
			if (shape.hidden) continue;
			for (const point of shape.connectionPoints ?? []) {
				const x = world[0] * point.x + world[2] * point.y + world[4];
				const y = page.height - (world[1] * point.x + world[3] * point.y + world[5]);
				const marker = doc.createElementNS(SVG, 'path');
				marker.setAttribute(
					'd',
					`M ${x - size} ${y - size} L ${x + size} ${y + size} M ${x - size} ${y + size} L ${x + size} ${y - size}`,
				);
				marker.setAttribute('vector-effect', 'non-scaling-stroke');
				marker.dataset.connectionPoint = String(point.index);
				marker.dataset.pointShape = shape.id;
				if (point.inherited) marker.dataset.inherited = 'true';
				if (this.#selected?.shapeId === shape.id && this.#selected.index === point.index)
					marker.dataset.selected = 'true';
				overlay.append(marker);
			}
		}
		svg.append(overlay);
		this.#overlay = overlay;
	}
	wire(): () => void {
		const Abort = this.viewport.ownerDocument.defaultView?.AbortController ?? AbortController;
		const events = new Abort();
		this.viewport.addEventListener('pointerdown', (event) => this.#pointerDown(event), {
			signal: events.signal,
			capture: true,
		});
		return () => {
			++this.#request;
			events.abort();
			this.#overlay?.remove();
			this.#overlay = undefined;
			this.#key = [];
		};
	}
	/** Remove the selected point; returns false when no point is selected. */
	deleteSelected(): boolean {
		const selected = this.#selected;
		const page = this.#page();
		if (!selected || !page || selected.pageId !== page.id || !this.options.active()) return false;
		this.#selected = undefined;
		void this.#apply({ type: 'delete-connection-point', ...selected }, 'Connection point deleted.');
		return true;
	}
	#pointerDown(event: PointerEvent): void {
		if (!this.options.active() || event.button !== 0) return;
		const state = this.controller.state;
		const page = this.#page(state);
		const svg = this.viewport.querySelector<SVGSVGElement>('svg.paper');
		if (!page || !svg || state.loading || state.edit.busy || !state.edit.sourceAvailable) return;
		const point = pagePoint(svg, page, event, { snap: false, bounded: false });
		if (!point) return;
		const near = this.#pointNear(page, point, (svg.getScreenCTM?.()?.a || 96 * state.zoom) / 1);
		if (near) {
			event.preventDefault();
			this.#selected = { pageId: page.id, shapeId: near.shape.id, index: near.index };
			this.render(this.controller.state);
			this.options.announce(
				near.inherited
					? 'This connection point comes from the master and cannot be deleted here.'
					: `Connection point ${near.index + 1} of ${near.shape.name} selected. Press Delete to remove it.`,
			);
			return;
		}
		const group = this.#hits(event)
			.map((hit) => (hit as Element).closest?.<SVGGElement>('[data-shape-id]'))
			.find((value) => !!value);
		const shapeId = group?.dataset.shapeId;
		if (!shapeId) {
			this.#selected = undefined;
			this.render(this.controller.state);
			return;
		}
		event.preventDefault();
		const shape = page.shapes.find((candidate) => candidate.id === shapeId);
		const command =
			shape && visioConnectableShape(shape)
				? visioAddConnectionPointCommand(page, shape, { x: point.x, y: page.height - point.y })
				: undefined;
		if (!command) {
			this.options.announce(REFUSED);
			return;
		}
		this.#selected = undefined;
		void this.#apply(command, `Connection point added to ${shape!.name}.`);
	}
	/** The connection point within a few pixels of `point` (SVG page inches, y down). */
	#pointNear(page: VisioPage, point: { x: number; y: number }, scale: number) {
		let best:
			| { shape: VisioShape; index: number; inherited: boolean; distance: number }
			| undefined;
		for (const { shape, world } of placedShapes(page).values())
			for (const candidate of shape.connectionPoints ?? []) {
				const x = world[0] * candidate.x + world[2] * candidate.y + world[4];
				const y = page.height - (world[1] * candidate.x + world[3] * candidate.y + world[5]);
				const distance = Math.hypot(x - point.x, y - point.y) * scale;
				if (distance <= MARKER_PX + 3 && (!best || distance < best.distance))
					best = { shape, index: candidate.index, inherited: candidate.inherited, distance };
			}
		return best;
	}
	#hits(event: PointerEvent): Element[] {
		const root = this.viewport.getRootNode() as Document | ShadowRoot;
		const hits =
			typeof root.elementsFromPoint === 'function'
				? root.elementsFromPoint(event.clientX, event.clientY)
				: [];
		return [...hits, event.target as Element].filter((hit) => !!hit && this.viewport.contains(hit));
	}
	async #apply(
		edit: Parameters<ViewerController['applyEdits']>[0][number],
		message: string,
	): Promise<void> {
		const request = ++this.#request;
		try {
			await this.controller.applyEdits([edit]);
			if (request === this.#request) this.options.announce(message);
		} catch (error) {
			if (request === this.#request && !isEditCancellation(error))
				this.options.announce(editErrorMessage(error));
		}
	}
}
