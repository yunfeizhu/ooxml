import {
	VISIO_GLUE,
	visioSnapGlue,
	type VisioConnectorRoute,
	type VisioPage,
} from 'ooxml-core/visio';
import {
	editErrorMessage,
	isEditCancellation,
	visioGlueableShape,
	visioConnectorCreationCommand,
	visioDrawIsLargeEnough,
	visioNearestConnectionPoint,
} from 'ooxml-core/visio/ui';
import type { ViewerController, ViewerState } from './controller';
import { ViewerDrawingGesture } from './viewer-drawing-gesture';
import { pagePoint } from './viewer-page-point';

const TARGET = 'connectTarget';
const SVG = 'http://www.w3.org/2000/svg';
/** Screen distance within which a released end snaps to a connection point. */
const POINT_SNAP_PX = 8;
/** What an end released at the pointer would glue to. */
export interface ConnectorGlueHit {
	shapeId: string;
	/** A connection point of the shape (point-to-point glue); otherwise the shape itself. */
	point?: number;
	x?: number;
	y?: number;
}

/** A page shape the core can glue to: a visible top-level 2D shape, drawn or from a stencil. */
export function connectorGlueTarget(page: VisioPage, element: Element | null): string | undefined {
	let group = element?.closest?.<SVGGElement>('[data-shape-id]');
	while (group) {
		const id = group.dataset.shapeId,
			shape = page.shapes.find((candidate) => candidate.id === id);
		if (shape) return visioGlueableShape(shape) ? shape.id : undefined;
		group = group.parentElement?.closest<SVGGElement>('[data-shape-id]');
	}
	return undefined;
}

/**
 * The glue target under a client point: the nearest connection point within a few pixels of it,
 * else the shape under it. Pointer capture retargets events, so the point itself is hit-tested.
 */
export function connectorGlueAt(
	viewport: HTMLElement,
	page: VisioPage,
	event: Pick<PointerEvent, 'clientX' | 'clientY' | 'target'>,
	zoom: number,
	/** The drawing's GlueSettings (Snap & Glue): Glue off glues nothing, and connection points can be left out. */
	glue: number = VISIO_GLUE.connectionPoints,
): ConnectorGlueHit | undefined {
	if (glue & VISIO_GLUE.disabled) return undefined;
	const svg = viewport.querySelector<SVGSVGElement>('svg.paper');
	const point = svg ? pagePoint(svg, page, event, { snap: false, bounded: false }) : undefined;
	if (point && svg && glue & VISIO_GLUE.connectionPoints) {
		const scale = svg.getScreenCTM?.()?.a || 96 * zoom;
		const hit = visioNearestConnectionPoint(
			page,
			{ x: point.x, y: page.height - point.y },
			POINT_SNAP_PX / scale,
		);
		if (hit) return { shapeId: hit.shapeId, point: hit.index, x: hit.x, y: page.height - hit.y };
	}
	const root = viewport.getRootNode() as Document | ShadowRoot;
	const hits =
		typeof root.elementsFromPoint === 'function'
			? root.elementsFromPoint(event.clientX, event.clientY)
			: [event.target as Element];
	for (const hit of hits) {
		if (!viewport.contains(hit) || hit.classList?.contains('draw-preview')) continue;
		const id = connectorGlueTarget(page, hit);
		if (id) return { shapeId: id };
	}
	return undefined;
}

/**
 * Home > Tools > Connector (Ctrl+3). A drag draws a dynamic connector in the current route
 * (right-angle by default); ends released on shapes glue to them, ends released on a connection
 * point glue to that point. The shape (and point) under the pointer is highlighted.
 */
export class ViewerConnectorTool {
	#gesture: ViewerDrawingGesture;
	#request = 0;
	#begin: ConnectorGlueHit | undefined;
	#hover: ConnectorGlueHit | undefined;
	#marker: SVGCircleElement | undefined;
	constructor(
		private readonly viewport: HTMLElement,
		private readonly controller: ViewerController,
		private readonly options: {
			active(): boolean;
			announce(message: string): void;
			/** Route for new connectors (Design > Connectors, Insert > Connector). */
			route?(): VisioConnectorRoute;
		},
	) {
		this.#gesture = new ViewerDrawingGesture(viewport, controller, {
			tool: () => (options.active() ? 'line' : undefined),
			announce: options.announce,
			finish: async (drag, end) => {
				const request = ++this.#request;
				const begin = this.#begin,
					hover = this.#hover;
				try {
					if (!visioDrawIsLargeEnough('line', drag.start, end) || !this.#gesture.current(drag))
						return;
					const command = visioConnectorCreationCommand(
						drag.page,
						drag.start,
						end,
						{
							...(begin === undefined ? {} : { begin: begin.shapeId }),
							...(begin?.point === undefined ? {} : { beginPoint: begin.point }),
							...(hover === undefined ? {} : { end: hover.shapeId }),
							...(hover?.point === undefined ? {} : { endPoint: hover.point }),
						},
						options.route?.() ?? 'right-angle',
					);
					await controller.applyCreationEdits([command], drag.token);
					if (request === this.#request)
						options.announce(
							`Connector ${command.shapeId} added${command.connect?.begin || command.connect?.end ? ' and glued' : ''}.`,
						);
				} catch (error) {
					if (request === this.#request && !isEditCancellation(error))
						options.announce(editErrorMessage(error));
				} finally {
					this.#highlight(undefined);
				}
			},
		});
	}
	get drawing(): boolean {
		return this.#gesture.drawing;
	}
	/** The shape currently highlighted as a glue target, for tests and status text. */
	get target(): string | undefined {
		return this.#hover?.shapeId;
	}
	/** The connection point currently targeted, if any. */
	get targetPoint(): number | undefined {
		return this.#hover?.point;
	}
	cancel(): void {
		++this.#request;
		this.#gesture.cancel();
		this.#begin = undefined;
		this.#highlight(undefined);
	}
	render(state: ViewerState): void {
		this.#gesture.render(state);
		if (!this.options.active()) this.#highlight(undefined);
		else if (this.#hover) this.#highlight(this.#hover, true);
	}
	wire(): () => void {
		const Abort = this.viewport.ownerDocument.defaultView?.AbortController ?? AbortController;
		const events = new Abort();
		const options = { signal: events.signal, capture: true };
		// Registered before the gesture so the begin target is known when the drag starts.
		this.viewport.addEventListener(
			'pointerdown',
			(event) => {
				if (!this.options.active() || this.#gesture.drawing) return;
				this.#begin = this.#targetAt(event);
			},
			options,
		);
		this.viewport.addEventListener(
			'pointermove',
			(event) => {
				if (this.options.active()) this.#highlight(this.#targetAt(event));
			},
			options,
		);
		this.viewport.addEventListener(
			'pointerleave',
			() => {
				if (!this.#gesture.drawing) this.#highlight(undefined);
			},
			options,
		);
		const dispose = this.#gesture.wire();
		return () => {
			this.cancel();
			dispose();
			events.abort();
		};
	}
	#targetAt(event: PointerEvent): ConnectorGlueHit | undefined {
		const state = this.controller.state;
		const page = state.document?.pages[state.pageIndex];
		return page
			? connectorGlueAt(
					this.viewport,
					page,
					event,
					state.zoom,
					visioSnapGlue(state.document ?? {}).glueSettings,
				)
			: undefined;
	}
	#highlight(hit: ConnectorGlueHit | undefined, force = false): void {
		if (!force && hit?.shapeId === this.#hover?.shapeId && hit?.point === this.#hover?.point)
			return;
		this.#hover = hit;
		const id = hit?.shapeId;
		for (const group of this.viewport.querySelectorAll<SVGGElement>('[data-connect-target]'))
			if (group.dataset.shapeId !== id) delete group.dataset[TARGET];
		if (id)
			for (const group of this.viewport.querySelectorAll<SVGGElement>('[data-shape-id]'))
				if (group.dataset.shapeId === id) group.dataset[TARGET] = 'true';
		this.#marker?.remove();
		this.#marker = undefined;
		const svg = this.viewport.querySelector<SVGSVGElement>('svg.paper');
		if (hit?.point === undefined || hit.x === undefined || hit.y === undefined || !svg) return;
		// Point-glue feedback: a ring on the target connection point.
		const marker = this.viewport.ownerDocument.createElementNS(SVG, 'circle') as SVGCircleElement;
		marker.classList.add('connect-point-target');
		marker.setAttribute('cx', String(hit.x));
		marker.setAttribute('cy', String(hit.y));
		marker.setAttribute(
			'r',
			String(5 / (svg.getScreenCTM?.()?.a || 96 * this.controller.state.zoom)),
		);
		marker.setAttribute('vector-effect', 'non-scaling-stroke');
		svg.append(marker);
		this.#marker = marker;
	}
}
