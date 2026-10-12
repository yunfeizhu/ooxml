import type { VisioEdit, VisioPage } from 'ooxml-core/visio';
import {
	visioAutoConnectArrows,
	visioAutoConnectNeighbor,
	visioAutoConnectPlan,
	visioAutoConnectShape,
	visioSelectionIsOnPage,
	visioShapePageBox,
	type VisioAutoConnectDirection,
} from 'ooxml-core/visio/ui';
import type { ViewerController, ViewerState } from './controller';
import { shapesDocument } from './shapes-document';
import { currentQuickShapes } from './shapes-storage';
import { findMaster, masterCreation } from './stencil-catalog';
import { autoConnectArrow, autoConnectBar } from './viewer-auto-connect-parts';
import { connectorGlueTarget } from './viewer-connector-tool';
import { MASTER_QUICK_STYLE } from './viewer-draw-tool';
import { pagePoint } from './viewer-page-point';

/** Screen pixels from a shape's side to the centre of its arrow. */
const OFFSET = 22;
/** The top arrow of a selected shape clears the rotation handle. */
const SELECTED_TOP_OFFSET = 46;
/** Pixels beyond the arrows within which the pointer still belongs to the shape. */
const KEEP = 14;
type Box = HTMLElement & { checked: boolean; disabled: boolean };
export interface AutoConnectHost {
	/** The viewer's shadow root (a document in tests): the ribbon check box and event scope. */
	root: ShadowRoot | Document;
	viewport: HTMLElement;
	controller: ViewerController;
	announce(message: string): void;
	edit(run: () => Promise<void>, message: string): void;
	/** Arrows belong to the Pointer tool. */
	pointerTool(): boolean;
}

/**
 * View > Visual Aids > AutoConnect, on by default as in Visio. Resting the mouse on a top-level
 * two-dimensional shape with the Pointer tool shows an arrow outside each side. An arrow shows a
 * mini toolbar with the current stencil's first four Quick Shapes: choosing one adds it one gap
 * away in that direction with a connector glued to both shapes, as one undoable step. Clicking
 * the arrow itself connects to the neighbouring shape it points at, or adds the first Quick Shape
 * when there is none. Arrows are a mouse and pen aid: touch and the keyboard never show them.
 */
export class ViewerAutoConnect {
	#on = true;
	#hover: string | undefined;
	#arrow: VisioAutoConnectDirection | undefined;
	#pressed = false;
	#layer: HTMLDivElement | undefined;
	#signature = '';
	constructor(private readonly host: AutoConnectHost) {}
	get enabled(): boolean {
		return this.#on;
	}
	/** The shape whose arrows show, for tests and status text. */
	get source(): string | undefined {
		return this.#layer ? this.#hover : undefined;
	}
	toggle(): void {
		this.#on = !this.#on;
		this.host.announce(
			this.#on
				? 'AutoConnect on: rest the pointer on a shape and use its arrows.'
				: 'AutoConnect off.',
		);
		this.render(this.host.controller.state);
	}
	/** Quick Shapes of the stencil the Shapes window shows for this drawing. */
	#quickShapes(state: ViewerState) {
		return currentQuickShapes(
			this.host.viewport.ownerDocument,
			shapesDocument(state.document).docked,
		);
	}
	#page(state: ViewerState): VisioPage | undefined {
		return state.document?.pages[state.pageIndex];
	}
	#available(state: ViewerState): boolean {
		return (
			this.#on &&
			!this.#pressed &&
			this.host.pointerTool() &&
			state.edit.sourceAvailable &&
			!state.loading &&
			!state.edit.busy &&
			this.host.viewport.dataset.textEditing === undefined
		);
	}
	#clear(): void {
		this.#layer?.remove();
		this.#layer = undefined;
		this.#signature = '';
	}
	render(state: ViewerState): void {
		const box = this.host.root.querySelector<Box>('[data-check="auto-connect"]');
		const page = this.#page(state);
		if (box) {
			box.checked = this.#on;
			box.disabled = !page;
		}
		const shape = page && this.#hover ? visioAutoConnectShape(page, this.#hover) : undefined;
		const svg = this.host.viewport.querySelector<SVGSVGElement>('svg.paper');
		if (!page || !shape || !svg || !this.#available(state)) {
			if (!shape) this.#hover = this.#arrow = undefined;
			return this.#clear();
		}
		const bounds = this.host.viewport.getBoundingClientRect();
		const matrix = svg.getScreenCTM?.();
		const scale = matrix?.a || 96 * (state.zoom || 1);
		const paper = svg.getBoundingClientRect();
		const place = (point: { x: number; y: number }) => {
			const screen = matrix
				? new DOMPoint(point.x, point.y).matrixTransform(matrix)
				: { x: paper.left + point.x * scale, y: paper.top + point.y * scale };
			return { x: screen.x - bounds.left, y: screen.y - bounds.top };
		};
		const selected =
			state.selectedShapes.length === 1 &&
			state.selectedShape?.id === shape.id &&
			visioSelectionIsOnPage(state.selectedShape, page.id);
		const arrows = visioAutoConnectArrows(page, shape, OFFSET / scale).map((arrow) => {
			const lift =
				arrow.direction === 'up' && selected ? (SELECTED_TOP_OFFSET - OFFSET) / scale : 0;
			return { direction: arrow.direction, ...place({ x: arrow.x, y: arrow.y - lift }) };
		});
		const masters = this.#arrow ? this.#quickShapes(state) : [];
		const signature = JSON.stringify([
			shape.id,
			this.#arrow,
			arrows.map((arrow) => [Math.round(arrow.x), Math.round(arrow.y)]),
			masters.map((master) => master.id),
			this.host.viewport.scrollLeft,
			this.host.viewport.scrollTop,
		]);
		// Rebuilding under the pointer would swallow the click that follows a press.
		if (this.#layer?.isConnected && signature === this.#signature) return;
		this.#clear();
		const doc = this.host.viewport.ownerDocument;
		const layer = doc.createElement('div');
		layer.className = 'auto-connect';
		layer.dataset.autoConnectFor = shape.id;
		layer.style.left = `${this.host.viewport.scrollLeft}px`;
		layer.style.top = `${this.host.viewport.scrollTop}px`;
		for (const arrow of arrows) {
			const neighbour = visioAutoConnectNeighbor(page, shape, arrow.direction);
			layer.append(autoConnectArrow(doc, arrow, !!neighbour));
			if (arrow.direction === this.#arrow && masters.length)
				layer.append(autoConnectBar(doc, arrow, masters));
		}
		this.host.viewport.append(layer);
		this.#layer = layer;
		this.#signature = signature;
	}
	/** Connects in `direction`: to `masterId` as a new shape, else to the neighbour or first Quick Shape. */
	connect(direction: VisioAutoConnectDirection, masterId?: string): void {
		const state = this.host.controller.state;
		const page = this.#page(state);
		const source = page && this.#hover ? visioAutoConnectShape(page, this.#hover) : undefined;
		if (!page || !source || !state.edit.sourceAvailable || state.loading || state.edit.busy) return;
		const neighbour = masterId ? undefined : visioAutoConnectNeighbor(page, source, direction);
		const id = masterId ?? (neighbour ? undefined : this.#quickShapes(state)[0]?.id);
		const master = id ? masterCreation(id) : undefined;
		const plan = visioAutoConnectPlan(
			page,
			source.id,
			direction,
			neighbour
				? { shapeId: neighbour.id }
				: master
					? { master: { kind: 'stencil', master: id! }, size: master.size }
					: { shapeId: '' },
		);
		if (!plan) return this.host.announce('AutoConnect cannot connect from this shape.');
		const edits: VisioEdit[] = [
			...plan.edits,
			...(plan.added
				? [
						{
							type: 'format-shape' as const,
							pageId: page.id,
							shapeId: plan.targetId,
							quickStyle: MASTER_QUICK_STYLE,
						},
					]
				: []),
		];
		const token = this.host.controller.captureCreationToken(page.id);
		this.#arrow = undefined;
		this.#clear();
		this.host.edit(
			() => this.host.controller.applyCreationEdits(edits, token),
			plan.added
				? `${findMaster(id!)?.master.name ?? 'Shape'} ${plan.targetId} added and connected to shape ${source.id}.`
				: `Connected shape ${source.id} to shape ${plan.targetId}.`,
		);
	}
	#track(event: PointerEvent): void {
		const state = this.host.controller.state;
		const page = this.#page(state);
		const target = event.target as Element | null;
		const own = target?.closest?.<HTMLElement>('.auto-connect');
		if (!event.buttons) this.#pressed = false;
		let hover = this.#hover,
			arrow = this.#arrow;
		if (event.pointerType === 'touch' || event.buttons || !page || !this.#available(state)) {
			hover = arrow = undefined;
		} else if (own) {
			const button = target?.closest?.<HTMLElement>('[data-auto-connect]');
			if (button) arrow = button.dataset.autoConnect as VisioAutoConnectDirection;
		} else {
			arrow = undefined;
			const over = connectorGlueTarget(page, target);
			if (over && visioAutoConnectShape(page, over)) hover = over;
			else if (hover && !this.#near(page, hover, event, state)) hover = undefined;
		}
		if (hover === this.#hover && arrow === this.#arrow) return;
		this.#hover = hover;
		this.#arrow = arrow;
		this.render(state);
	}
	/** The pointer is still within reach of the shape's arrows. */
	#near(page: VisioPage, id: string, event: PointerEvent, state: ViewerState): boolean {
		const shape = visioAutoConnectShape(page, id);
		const svg = this.host.viewport.querySelector<SVGSVGElement>('svg.paper');
		const box = shape && visioShapePageBox(page, shape);
		const point = svg && pagePoint(svg, page, event, { snap: false, bounded: false });
		if (!box || !point || !svg) return false;
		const scale = svg.getScreenCTM?.()?.a || 96 * (state.zoom || 1);
		const margin = (SELECTED_TOP_OFFSET + KEEP) / scale;
		return (
			point.x >= box.x - margin &&
			point.x <= box.x + box.width + margin &&
			point.y >= box.y - margin &&
			point.y <= box.y + box.height + margin
		);
	}
	wire(): () => void {
		const { viewport, root } = this.host;
		const Abort = viewport.ownerDocument.defaultView?.AbortController ?? AbortController;
		const events = new Abort();
		const options = { signal: events.signal };
		const own = (event: Event) =>
			(event.target as Element | null)?.closest?.('.auto-connect') ?? undefined;
		viewport.addEventListener('pointermove', (event) => this.#track(event), options);
		viewport.addEventListener(
			'pointerleave',
			() => {
				this.#hover = this.#arrow = undefined;
				this.#clear();
			},
			options,
		);
		// The arrows and mini toolbar are not part of the drawing: presses on them never reach the
		// canvas gestures (selection, marquee, move), which listen on the viewport below this root.
		for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'dblclick'] as const)
			root.addEventListener(
				type,
				(event) => {
					if (own(event)) {
						event.stopPropagation();
						// Keep keyboard focus on the drawing.
						if (type === 'mousedown' || type === 'pointerdown') event.preventDefault();
						return;
					}
					if (!viewport.contains(event.target as Node)) return;
					if (type === 'pointerdown') {
						// A drag starts: the arrows go until the pointer is released and moves again.
						this.#pressed = true;
						this.#arrow = undefined;
						this.#clear();
					} else if (type === 'pointerup') this.#pressed = false;
				},
				{ ...options, capture: true },
			);
		root.addEventListener(
			'pointercancel',
			() => {
				this.#pressed = false;
			},
			{ ...options, capture: true },
		);
		root.addEventListener(
			'click',
			(event) => {
				if (!own(event)) return;
				event.stopPropagation();
				event.preventDefault();
				const target = event.target as Element;
				const master = target.closest<HTMLElement>('[data-auto-connect-master]');
				const arrow =
					target.closest<HTMLElement>('[data-auto-connect]')?.dataset.autoConnect ??
					target.closest<HTMLElement>('.auto-connect-bar')?.dataset.side;
				if (arrow)
					this.connect(arrow as VisioAutoConnectDirection, master?.dataset.autoConnectMaster);
			},
			{ ...options, capture: true },
		);
		viewport.addEventListener('scroll', () => this.render(this.host.controller.state), {
			...options,
			passive: true,
		});
		return () => {
			events.abort();
			this.#hover = this.#arrow = undefined;
			this.#clear();
		};
	}
}
