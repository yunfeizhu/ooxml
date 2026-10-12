import { createRotationDrag, resolveRotateHandlePlacement, snapAngle } from 'ooxml-core/geometry';
import {
	editErrorMessage,
	isEditCancellation,
	visioRotationShape,
	visioSelectionIsOnPage,
} from 'ooxml-core/visio/ui';
import type { ViewerController, ViewerState } from './controller';
import { pagePoint } from './viewer-draw-tool';
import {
	handleGestureIsCurrent,
	wireHandleEvents,
	type HandleGestureSnapshot,
} from './viewer-handle-events';
import { createRotationPreview } from './viewer-rotation-preview';
import { hideGestureOverlays } from './viewer-gesture-overlays';
const SVG = 'http://www.w3.org/2000/svg';
const pointOptions = { snap: false, bounded: false } as const;
/** Visio's counter-clockwise radians from the drag's clockwise degrees; Shift snaps to 15°. */
const radians = (degrees: number, snap: boolean) =>
	(-(snap ? snapAngle(degrees) : degrees) * Math.PI) / 180;
/** A source-backed rotation gesture; previews never mutate the model or history. */
export class ViewerRotationHandle {
	#drag:
		| (HandleGestureSnapshot & {
				preview: SVGLineElement;
				shapePreview: ReturnType<typeof createRotationPreview>;
				startX: number;
				startY: number;
				center: { x: number; y: number };
				rotate: (point: { x: number; y: number }) => number;
				showOverlays: () => void;
		  })
		| undefined;
	#request = 0;
	#overlay: SVGSVGElement | undefined;
	constructor(
		private readonly viewport: HTMLElement,
		private readonly controller: ViewerController,
		private readonly options: { active(): boolean; announce(message: string): void },
	) {}
	render(state: ViewerState): void {
		if (this.#drag) {
			if (handleGestureIsCurrent(this.#drag, state, this.options.active())) return;
			this.#cancel();
		}
		this.#overlay?.remove();
		this.#overlay = undefined;
		const page = state.document?.pages[state.pageIndex],
			selection = state.selectedShape;
		if (
			!page ||
			!selection ||
			!visioSelectionIsOnPage(selection, page.id) ||
			state.selectedShapes.length !== 1 ||
			!state.edit.sourceAvailable ||
			state.loading ||
			state.edit.busy ||
			!this.options.active()
		)
			return;
		const shape = visioRotationShape(page, selection.id);
		if (!shape?.rotation) return;
		const group = Array.from(this.viewport.querySelectorAll<SVGGElement>('[data-shape-id]')).find(
			(group) =>
				group.dataset.shapeId === shape.id &&
				(group.dataset.pageId ?? page.id) === page.id &&
				group.dataset.selected === 'true',
		);
		const svg = group?.ownerSVGElement,
			matrix = svg?.getScreenCTM?.();
		if (!group || !svg || !matrix) return;
		const center = { x: shape.rotation.pinX, y: page.height - shape.rotation.pinY };
		const rect = group.getBoundingClientRect(),
			bounds = this.viewport.getBoundingClientRect();
		const location = resolveRotateHandlePlacement({
			preferred: { x: (rect.left + rect.right) / 2, y: rect.top - 24 },
			selection: rect,
			bounds,
			hitWidth: 14,
			hitHeight: 14,
			obstacles: [],
		});
		if (!location) return;
		const point = { x: location.x - bounds.left, y: location.y - bounds.top };
		const pivot = new DOMPoint(center.x, center.y).matrixTransform(matrix);
		const overlay = this.viewport.ownerDocument.createElementNS(SVG, 'svg');
		overlay.classList.add('rotation-overlay');
		overlay.style.left = `${this.viewport.scrollLeft}px`;
		overlay.style.top = `${this.viewport.scrollTop}px`;
		overlay.setAttribute('width', String(bounds.width));
		overlay.setAttribute('height', String(bounds.height));
		overlay.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
		overlay.dataset.rotationOverlay = '';
		const stem = this.viewport.ownerDocument.createElementNS(SVG, 'line');
		for (const [name, value] of Object.entries({
			x1: pivot.x - bounds.left,
			y1: pivot.y - bounds.top,
			x2: point.x,
			y2: point.y,
		}))
			stem.setAttribute(name, String(value));
		stem.classList.add('rotation-stem');
		stem.setAttribute('vector-effect', 'non-scaling-stroke');
		const handle = this.viewport.ownerDocument.createElementNS(SVG, 'circle');
		handle.dataset.rotationHandle = shape.id;
		handle.setAttribute('cx', String(point.x));
		handle.setAttribute('cy', String(point.y));
		handle.setAttribute('r', '8');
		handle.setAttribute('vector-effect', 'non-scaling-stroke');
		handle.setAttribute('aria-label', 'Drag rotation handle');
		// Visio's rotation handle is a circular arrow; the circle under it is the hit target.
		const glyph = this.viewport.ownerDocument.createElementNS(SVG, 'path');
		glyph.classList.add('rotation-glyph');
		glyph.setAttribute('transform', `translate(${point.x} ${point.y})`);
		glyph.setAttribute('d', 'M4.6 -2.9A5.4 5.4 0 1 0 5.4 .6M5.6 -5.9V-2.4H2.1');
		overlay.append(stem, handle, glyph);
		this.viewport.append(overlay);
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
		const refresh = () => this.render(this.controller.state);
		this.viewport.addEventListener('scroll', refresh, { passive: true });
		const Observer = this.viewport.ownerDocument.defaultView?.ResizeObserver;
		const observer = Observer ? new Observer(refresh) : undefined;
		observer?.observe(this.viewport);
		return () => {
			this.viewport.removeEventListener('scroll', refresh);
			observer?.disconnect();
			++this.#request;
			dispose();
			this.#overlay?.remove();
			this.#overlay = undefined;
		};
	}
	#start(event: PointerEvent): void {
		const handle = (event.target as Element)?.closest?.<SVGCircleElement>('[data-rotation-handle]');
		const state = this.controller.state,
			page = state.document?.pages[state.pageIndex];
		const shape = page?.shapes.find((shape) => shape.id === handle?.dataset.rotationHandle);
		const svg = this.viewport.querySelector<SVGSVGElement>('svg.paper');
		if (
			!handle ||
			!svg ||
			!page ||
			!state.document ||
			!shape?.rotation ||
			state.selectedShape?.id !== shape.id ||
			!visioSelectionIsOnPage(state.selectedShape, page.id) ||
			state.selectedShapes.length !== 1 ||
			this.#drag ||
			event.button !== 0 ||
			state.edit.busy ||
			state.loading ||
			!state.edit.sourceAvailable ||
			!this.options.active()
		)
			return;
		const source = Array.from(svg.querySelectorAll<SVGGElement>('[data-shape-id]')).find(
			(group) =>
				group.dataset.shapeId === shape.id && (group.dataset.pageId ?? page.id) === page.id,
		);
		if (!source) return;
		const start = pagePoint(svg, page, event, pointOptions);
		if (!start) return;
		// Hiding a focused SVG source must not move Escape outside the gesture owner.
		this.viewport.focus({ preventScroll: true });
		const center = { x: shape.rotation.pinX, y: page.height - shape.rotation.pinY };
		const preview = this.viewport.ownerDocument.createElementNS(SVG, 'line');
		preview.classList.add('rotation-preview');
		preview.setAttribute('vector-effect', 'non-scaling-stroke');
		for (const [name, value] of Object.entries({
			x1: center.x,
			y1: center.y,
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
			shapeId: shape.id,
			preview,
			shapePreview: createRotationPreview(state.document, page, shape, source),
			showOverlays: hideGestureOverlays(this.viewport, '[data-resize-overlay]'),
			startX: event.clientX,
			startY: event.clientY,
			center,
			rotate: createRotationDrag(center, start, (-shape.rotation.angle * 180) / Math.PI, {
				unwrapped: true,
			}),
		};
		try {
			this.#drag.shapePreview.update(shape.rotation.angle);
		} catch (error) {
			this.#cancel();
			this.options.announce(editErrorMessage(error));
			return;
		}
		event.preventDefault();
		event.stopImmediatePropagation();
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
			const angle = radians(drag.rotate(point), event.shiftKey);
			try {
				drag.shapePreview.update(angle);
			} catch (error) {
				this.#cancel();
				this.options.announce(editErrorMessage(error));
			}
			drag.preview.setAttribute('x2', String(point.x));
			drag.preview.setAttribute('y2', String(point.y));
		}
		event.preventDefault();
		event.stopImmediatePropagation();
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
		if (drag && this.viewport.hasPointerCapture?.(drag.pointer))
			this.viewport.releasePointerCapture(drag.pointer);
		return () => {
			drag?.preview.remove();
			drag?.shapePreview.dispose();
			drag?.showOverlays();
		};
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
		const angle = point ? radians(drag.rotate(point), event.shiftKey) : undefined;
		const settle = this.#release();
		if (
			angle === undefined ||
			Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 0.5 ||
			this.controller.state.document !== drag.document
		) {
			settle();
			return;
		}
		const request = ++this.#request;
		try {
			await this.controller.applyEdits([
				{ type: 'rotate-shape', pageId: drag.page.id, shapeId: drag.shapeId, angle },
			]);
			if (request === this.#request) this.options.announce('Shape rotated.');
		} catch (error) {
			if (request === this.#request && !isEditCancellation(error))
				this.options.announce(editErrorMessage(error));
		} finally {
			settle();
		}
	}
}
