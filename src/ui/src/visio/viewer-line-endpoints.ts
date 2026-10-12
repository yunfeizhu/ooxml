import {
	visioSnapGlue,
	type VisioDocument,
	type VisioEdit,
	type VisioPage,
	type VisioShape,
} from 'ooxml-core/visio';
import {
	editErrorMessage,
	isEditCancellation,
	visioConnectorEndHandles,
	visioConnectorRouteOf,
	visioPageEditToDrawing,
	visioStraightLineHandles,
	visioSelectionIsOnPage,
} from 'ooxml-core/visio/ui';
import type { ViewerController, ViewerState } from './controller';
import { pagePoint } from './viewer-draw-tool';
import { handleGestureIsCurrent, wireHandleEvents } from './viewer-handle-events';
import { connectorGlueAt, type ConnectorGlueHit } from './viewer-connector-tool';

const SVG = 'http://www.w3.org/2000/svg';
const pointOptions = { snap: false, bounded: false } as const;
interface EndpointDrag {
	pointer: number;
	svg: SVGSVGElement;
	page: VisioPage;
	document: VisioDocument;
	shapeId: string;
	endpoint: 'begin' | 'end';
	preview: SVGLineElement;
	startX: number;
	startY: number;
}
/** Local end handles: a straight line's (0,0) and (Width,0), or a routed connector's ends. */
function lineHandles(shape: VisioShape) {
	if (visioStraightLineHandles(shape))
		return { begin: { x: 0, y: 0 }, end: { x: shape.width, y: 0 } };
	return visioConnectorEndHandles(shape);
}

/** A preview-only endpoint gesture; release commits one source-backed core transaction. */
export class ViewerLineEndpoints {
	#drag: EndpointDrag | undefined;
	#request = 0;
	#overlay: SVGGElement | undefined;
	constructor(
		private readonly viewport: HTMLElement,
		private readonly controller: ViewerController,
		private readonly options: { active(): boolean; announce(message: string): void },
	) {}
	render(state: ViewerState): void {
		const page = state.document?.pages[state.pageIndex];
		if (this.#drag) {
			if (handleGestureIsCurrent(this.#drag, state, this.options.active())) return;
			this.#cancel();
		}
		this.#overlay?.remove();
		this.#overlay = undefined;
		if (
			!page ||
			!state.selectedShape ||
			!visioSelectionIsOnPage(state.selectedShape, page.id) ||
			state.selectedShapes.length !== 1 ||
			!state.edit.sourceAvailable ||
			state.edit.busy ||
			state.loading ||
			!this.options.active()
		)
			return;
		const shape = page.shapes.find((shape) => shape.id === state.selectedShape!.id);
		const ends = shape ? lineHandles(shape) : undefined;
		if (
			!shape ||
			!ends ||
			// Dragging a glued connector's endpoint unglues that end, as in Visio.
			page.connectors.some((connection) => connection.toShapeId === shape.id)
		)
			return;
		const group = Array.from(this.viewport.querySelectorAll<SVGGElement>('[data-shape-id]')).find(
			(group) =>
				group.dataset.shapeId === shape.id &&
				(group.dataset.pageId ?? page.id) === page.id &&
				group.dataset.selected === 'true',
		);
		if (!group) return;
		const svg = group.ownerSVGElement;
		if (!svg) return;
		const overlay = this.viewport.ownerDocument.createElementNS(SVG, 'g');
		overlay.dataset.lineEndpointOverlay = '';
		const rootMatrix = svg.getCTM?.(),
			groupMatrix = group.getCTM?.();
		if (rootMatrix && groupMatrix) {
			const matrix = rootMatrix.inverse().multiply(groupMatrix);
			overlay.setAttribute(
				'transform',
				`matrix(${matrix.a} ${matrix.b} ${matrix.c} ${matrix.d} ${matrix.e} ${matrix.f})`,
			);
		}
		const screen = group.getScreenCTM?.();
		const screenScale = screen ? Math.hypot(screen.a, screen.b) : 96 * state.zoom;
		for (const endpoint of ['begin', 'end'] as const) {
			const handle = this.viewport.ownerDocument.createElementNS(SVG, 'circle');
			handle.dataset.lineEndpoint = endpoint;
			handle.dataset.lineShapeId = shape.id;
			handle.setAttribute('cx', String(ends[endpoint].x));
			handle.setAttribute('cy', String(ends[endpoint].y));
			handle.setAttribute('r', String(5 / screenScale));
			handle.setAttribute('vector-effect', 'non-scaling-stroke');
			handle.setAttribute('aria-label', `Drag ${endpoint} endpoint`);
			overlay.append(handle);
		}
		svg.append(overlay);
		this.#overlay = overlay;
	}
	wire(): () => void {
		const dispose = wireHandleEvents(this.viewport, {
			pointer: () => this.#drag?.pointer,
			start: (event) => this.#start(event),
			move: (event) => this.#move(event),
			finish: (event) => this.#finish(event),
			cancel: () => this.#cancel(),
		});
		return () => {
			++this.#request;
			dispose();
			this.#overlay?.remove();
			this.#overlay = undefined;
		};
	}

	#start(event: PointerEvent): void {
		const handle = (event.target as Element)?.closest?.<SVGCircleElement>('[data-line-endpoint]');
		const state = this.controller.state,
			page = state.document?.pages[state.pageIndex];
		const svg = this.viewport.querySelector<SVGSVGElement>('svg.paper');
		const endpoint = handle?.dataset.lineEndpoint;
		if (
			!handle ||
			!svg ||
			!page ||
			!state.document ||
			!state.selectedShape ||
			!visioSelectionIsOnPage(state.selectedShape, page.id) ||
			handle.dataset.lineShapeId !== state.selectedShape.id ||
			state.selectedShapes.length !== 1 ||
			this.#drag ||
			event.button !== 0 ||
			state.edit.busy ||
			state.loading ||
			!state.edit.sourceAvailable ||
			!this.options.active() ||
			(endpoint !== 'begin' && endpoint !== 'end')
		)
			return;
		const other = handle.parentElement?.querySelector<SVGCircleElement>(
			`[data-line-endpoint="${endpoint === 'begin' ? 'end' : 'begin'}"]`,
		);
		const matrix = other?.getScreenCTM();
		if (!other || !matrix) return;
		const centre = new DOMPoint(other.cx.baseVal.value, other.cy.baseVal.value).matrixTransform(
			matrix,
		);
		const fixed = pagePoint(svg, page, { clientX: centre.x, clientY: centre.y }, pointOptions);
		const start = pagePoint(svg, page, event, pointOptions);
		if (!fixed || !start) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		const preview = this.viewport.ownerDocument.createElementNS(SVG, 'line');
		preview.classList.add('endpoint-preview');
		preview.setAttribute('vector-effect', 'non-scaling-stroke');
		for (const [name, value] of Object.entries({
			x1: fixed.x,
			y1: fixed.y,
			x2: start.x,
			y2: start.y,
		}))
			preview.setAttribute(name, String(value));
		svg.append(preview);
		this.#drag = {
			pointer: event.pointerId,
			svg,
			page,
			document: state.document,
			shapeId: state.selectedShape.id,
			endpoint,
			preview,
			startX: event.clientX,
			startY: event.clientY,
		};
		this.viewport.setPointerCapture?.(event.pointerId);
	}
	#move(event: PointerEvent): void {
		const drag = this.#drag;
		if (!drag || event.pointerId !== drag.pointer) return;
		if (!handleGestureIsCurrent(drag, this.controller.state, this.options.active())) {
			this.#cancel();
			return;
		}
		const point = pagePoint(drag.svg, drag.page, event, pointOptions);
		if (point) {
			drag.preview.setAttribute('x2', String(point.x));
			drag.preview.setAttribute('y2', String(point.y));
		}
		this.#target(this.#glueAt(drag, event));
		event.preventDefault();
		event.stopImmediatePropagation();
	}
	/**
	 * Where a dragged connector end would glue: dynamic connectors drawn by the Connector tool
	 * re-glue to a shape or connection point under the pointer (never the other end's shape).
	 */
	#glueAt(drag: EndpointDrag, event: PointerEvent): ConnectorGlueHit | undefined {
		const shape = drag.page.shapes.find((candidate) => candidate.id === drag.shapeId);
		if (!shape || visioConnectorRouteOf(shape) === undefined) return undefined;
		const other = drag.page.connectors.find(
			(connection) =>
				connection.fromShapeId === drag.shapeId &&
				connection.fromCell === (drag.endpoint === 'begin' ? 'EndX' : 'BeginX'),
		)?.toShapeId;
		const hit = connectorGlueAt(
			this.viewport,
			drag.page,
			event,
			this.controller.state.zoom,
			visioSnapGlue(this.controller.state.document ?? {}).glueSettings,
		);
		return hit && hit.shapeId !== other ? hit : undefined;
	}
	#target(hit: ConnectorGlueHit | undefined): void {
		for (const group of this.viewport.querySelectorAll<SVGGElement>('[data-connect-target]'))
			if (group.dataset.shapeId !== hit?.shapeId) delete group.dataset.connectTarget;
		if (hit)
			for (const group of this.viewport.querySelectorAll<SVGGElement>('[data-shape-id]'))
				if (group.dataset.shapeId === hit.shapeId) group.dataset.connectTarget = 'true';
	}
	#cancel(): void {
		this.#release()();
	}
	/**
	 * Ends the gesture and returns the removal of its previews, which a finished drag keeps until its
	 * source edit settles (removing them first showed the old geometry for as long as the edit took).
	 */
	#release(): () => void {
		const drag = this.#drag;
		this.#drag = undefined;
		this.#target(undefined);
		if (drag && this.viewport.hasPointerCapture?.(drag.pointer))
			this.viewport.releasePointerCapture(drag.pointer);
		return () => drag?.preview.remove();
	}
	async #finish(event: PointerEvent): Promise<void> {
		const drag = this.#drag;
		if (!drag || event.pointerId !== drag.pointer) return;
		if (!handleGestureIsCurrent(drag, this.controller.state, this.options.active())) {
			this.#cancel();
			return;
		}
		event.preventDefault();
		event.stopImmediatePropagation();
		const point = pagePoint(drag.svg, drag.page, event, pointOptions);
		const glue = this.#glueAt(drag, event);
		const settle = this.#release();
		if (
			!point ||
			Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 0.5 ||
			this.controller.state.document !== drag.document
		) {
			settle();
			return;
		}
		const request = ++this.#request;
		const edit: VisioEdit = glue
			? {
					type: 'glue-connector',
					pageId: drag.page.id,
					shapeId: drag.shapeId,
					endpoint: drag.endpoint,
					target: glue.shapeId,
					...(glue.point === undefined ? {} : { point: glue.point }),
				}
			: visioPageEditToDrawing(drag.page, {
					type: 'move-line-endpoint',
					pageId: drag.page.id,
					shapeId: drag.shapeId,
					endpoint: drag.endpoint,
					x: point.x,
					y: drag.page.height - point.y,
				});
		try {
			await this.controller.applyEdits([edit]);
			if (request === this.#request)
				this.options.announce(
					`${drag.endpoint === 'begin' ? 'Begin' : 'End'} endpoint ${glue ? 'glued' : 'moved'}.`,
				);
		} catch (error) {
			if (request === this.#request && !isEditCancellation(error))
				this.options.announce(editErrorMessage(error));
		} finally {
			settle();
		}
	}
}
