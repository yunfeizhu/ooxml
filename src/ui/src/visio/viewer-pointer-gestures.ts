import type { VisioDocument, VisioPage } from 'ooxml-core/visio';
import {
	visioMoveCommands,
	visioMoveTargets,
	visioMovementShape,
	visioPageDragDelta,
	visioMarqueeBox,
	visioMarqueeSelection,
	visioSelectionIsOnPage,
	editErrorMessage,
	isEditCancellation,
	type VisioPagePoint,
} from 'ooxml-core/visio/ui';
import type { ViewerController, ViewerState } from './controller';
import { pagePoint } from './viewer-draw-tool';
import { wireHandleEvents } from './viewer-handle-events';
import { documentVisibility } from './viewer-layers';
import { createMovementPreview } from './viewer-movement-preview';
import { hideGestureOverlays } from './viewer-gesture-overlays';
import { pointerShapeTarget } from './viewer-shape-target';

interface Gesture {
	pointer: number;
	svg: SVGSVGElement;
	document: VisioDocument;
	page: VisioPage;
	selection: ViewerState['selectedShapes'];
	layers: ViewerState['layerVisibilityOverrides'];
	zoom: number;
	start: VisioPagePoint;
	clientX: number;
	clientY: number;
	started: boolean;
	additive: boolean;
	target?: { id: string; name: string; pageId: string };
	preview?: ReturnType<typeof createMovementPreview>;
	marquee?: SVGRectElement;
	showOverlays?: () => void;
}
const pointOptions = { snap: false, bounded: false } as const;
/** Direct pointer movement and full-enclosure marquee; release is the only source edit. */
export class ViewerPointerGestures {
	#drag: Gesture | undefined;
	#request = 0;
	#cancelClick = false;
	constructor(
		private readonly viewport: HTMLElement,
		private readonly controller: ViewerController,
		private readonly options: {
			active(): boolean;
			announce(message: string): void;
			/** Guides and Dynamic Grid: adjust a drag delta and show alignment hints. */
			snap?(page: VisioPage, ids: readonly string[], delta: VisioPagePoint): VisioPagePoint;
			clearSnap?(): void;
		},
	) {}
	render(state: ViewerState): void {
		if (this.#drag && !this.#current(this.#drag, state)) this.#cancel();
	}
	wire(): () => void {
		const stopOutside = (event: PointerEvent) => {
			if (this.#drag && !this.#drag.started && !event.composedPath().includes(this.viewport))
				this.#cancel();
		};
		this.viewport.ownerDocument.addEventListener('pointerup', stopOutside);
		const dispose = wireHandleEvents(this.viewport, {
			pointer: () => this.#drag?.pointer,
			start: (event) => this.#start(event),
			move: (event) => this.#move(event),
			finish: (event) => this.#finish(event),
			cancel: () => this.#cancel(),
			shouldSuppressClick: () => !!this.#drag?.started,
			consumeClick: () => {
				const value = this.#cancelClick;
				this.#cancelClick = false;
				return value;
			},
		});
		return () => {
			++this.#request;
			this.viewport.ownerDocument.removeEventListener('pointerup', stopOutside);
			dispose();
		};
	}
	#current(drag: Gesture, state = this.controller.state): boolean {
		return (
			state.document === drag.document &&
			state.document?.pages[state.pageIndex] === drag.page &&
			state.selectedShapes === drag.selection &&
			state.layerVisibilityOverrides === drag.layers &&
			state.zoom === drag.zoom &&
			drag.svg.isConnected &&
			!state.loading &&
			!state.edit.busy &&
			this.options.active()
		);
	}
	#start(event: PointerEvent): void {
		this.#cancelClick = false;
		if (this.#drag || event.button !== 0 || !this.options.active()) return;
		const node = event.target as Element;
		if (
			node.closest?.(
				'[data-line-endpoint], [data-rotation-handle], [data-resize-handle], .rotation-overlay, [data-guide-id]',
			)
		)
			return;
		const state = this.controller.state,
			page = state.document?.pages[state.pageIndex];
		const svg = this.viewport.querySelector<SVGSVGElement>('svg.paper');
		if (!svg || !page || !state.document || state.loading || state.edit.busy || !svg.contains(node))
			return;
		// Dragging inside a group moves the whole top-level group, as in Visio.
		const group = pointerShapeTarget(node, state.selectedShapes, true);
		if (
			group &&
			(!state.edit.sourceAvailable ||
				(group.dataset.pageId ?? page.id) !== page.id ||
				!visioMovementShape(page, group.dataset.shapeId!))
		)
			return;
		const start = pagePoint(svg, page, event, pointOptions);
		if (!start) return;
		const drag: Gesture = {
			pointer: event.pointerId,
			svg,
			page,
			document: state.document,
			selection: state.selectedShapes,
			layers: state.layerVisibilityOverrides,
			zoom: state.zoom,
			start,
			clientX: event.clientX,
			clientY: event.clientY,
			started: false,
			additive: event.shiftKey || event.ctrlKey || event.metaKey,
			...(group
				? {
						target: {
							id: group.dataset.shapeId!,
							name: group.dataset.shapeName ?? '',
							pageId: page.id,
						},
					}
				: {}),
		};
		if (this.#current(drag)) this.#drag = drag;
	}
	#begin(drag: Gesture): boolean {
		if (drag.target) {
			const selected = drag.selection.some(
				(shape) => shape.id === drag.target!.id && visioSelectionIsOnPage(shape, drag.page.id),
			);
			if (!selected) {
				const intended = drag.additive ? [...drag.selection, drag.target] : [drag.target];
				this.#drag = undefined;
				this.controller.selectShapes(intended);
				const state = this.controller.state;
				if (
					state.document !== drag.document ||
					state.document.pages[state.pageIndex] !== drag.page ||
					state.layerVisibilityOverrides !== drag.layers ||
					state.loading ||
					state.edit.busy ||
					!this.options.active() ||
					state.selectedShapes.length !== intended.length ||
					!state.selectedShapes.every(
						(shape, index) =>
							shape.id === intended[index]!.id && visioSelectionIsOnPage(shape, drag.page.id),
					)
				)
					return false;
				drag.selection = state.selectedShapes;
				this.#drag = drag;
			}
			if (
				!drag.selection.every((shape) => visioSelectionIsOnPage(shape, drag.page.id)) ||
				!visioMoveCommands(
					drag.page,
					drag.selection.map((shape) => shape.id),
					{ x: 0, y: 0 },
				)
			) {
				this.options.announce(
					'The entire selection must contain movable local two-dimensional shapes.',
				);
				return false;
			}
			// Container members move with their container, so they preview with it too.
			drag.preview = createMovementPreview(
				drag.svg,
				drag.page,
				visioMoveTargets(
					drag.page,
					drag.selection.map((shape) => shape.id),
				),
			);
			drag.showOverlays = hideGestureOverlays(
				this.viewport,
				'[data-resize-overlay], .rotation-overlay',
			);
		} else {
			const rect = this.viewport.ownerDocument.createElementNS(
				'http://www.w3.org/2000/svg',
				'rect',
			);
			rect.dataset.marqueePreview = '';
			rect.setAttribute('fill', 'var(--_vv-accent)');
			rect.setAttribute('fill-opacity', '0.12');
			rect.setAttribute('stroke', 'var(--_vv-accent)');
			rect.setAttribute('stroke-width', '1.5');
			rect.setAttribute('vector-effect', 'non-scaling-stroke');
			rect.setAttribute('aria-hidden', 'true');
			rect.style.pointerEvents = 'none';
			drag.svg.append(rect);
			drag.marquee = rect;
		}
		drag.started = true;
		this.viewport.focus({ preventScroll: true });
		this.viewport.setPointerCapture?.(drag.pointer);
		return true;
	}
	#move(event: PointerEvent): void {
		const drag = this.#drag;
		if (!drag || event.pointerId !== drag.pointer) return;
		if (!this.#current(drag)) {
			this.#cancel();
			return;
		}
		if (!drag.started) {
			if (Math.hypot(event.clientX - drag.clientX, event.clientY - drag.clientY) < 4) return;
			try {
				if (!this.#begin(drag)) {
					this.#cancel();
					return;
				}
			} catch (error) {
				this.#cancel();
				this.options.announce(editErrorMessage(error));
				return;
			}
		}
		if (this.#drag !== drag || !this.#current(drag)) {
			this.#cancel();
			return;
		}
		const point = pagePoint(drag.svg, drag.page, event, pointOptions);
		if (point && this.#current(drag)) {
			if (drag.preview) drag.preview.update(this.#delta(drag, point));
			const box = drag.marquee && visioMarqueeBox(drag.start, point);
			if (box)
				for (const [name, value] of Object.entries(box))
					drag.marquee!.setAttribute(name, String(value));
		}
		event.preventDefault();
		event.stopImmediatePropagation();
	}
	#delta(drag: Gesture, point: VisioPagePoint): VisioPagePoint {
		const delta = visioPageDragDelta(drag.start, point);
		const ids = drag.selection.map((shape) => shape.id);
		return this.options.snap?.(drag.page, ids, delta) ?? delta;
	}
	#cancel(): void {
		this.#release()();
	}
	/**
	 * Ends the gesture and returns the removal of its previews. A finished move keeps showing the
	 * preview until its source edit settles; removing it first showed the shape back at its old
	 * position for as long as the edit took.
	 */
	#release(): () => void {
		const drag = this.#drag;
		this.#drag = undefined;
		if (drag?.started) this.#cancelClick = true;
		if (drag && this.viewport.hasPointerCapture?.(drag.pointer))
			this.viewport.releasePointerCapture(drag.pointer);
		return () => {
			drag?.preview?.dispose();
			drag?.showOverlays?.();
			drag?.marquee?.remove();
			if (drag?.preview) this.options.clearSnap?.();
		};
	}
	async #finish(event: PointerEvent): Promise<void> {
		const drag = this.#drag;
		if (!drag || event.pointerId !== drag.pointer) return;
		if (!this.#current(drag) || !drag.started) {
			this.#cancel();
			return;
		}
		const point = pagePoint(drag.svg, drag.page, event, pointOptions);
		event.preventDefault();
		event.stopImmediatePropagation();
		const settle = this.#release();
		if (!point || !this.#current(drag) || !drag.target) settle();
		if (!point || !this.#current(drag)) return;
		if (!drag.target) {
			const box = visioMarqueeBox(drag.start, point);
			if (box) {
				const selected = visioMarqueeSelection(
					drag.page,
					box,
					documentVisibility(drag.document, drag.layers),
				);
				if (this.#current(drag))
					this.controller.selectShapes(drag.additive ? [...drag.selection, ...selected] : selected);
			}
			return;
		}
		const edits = visioMoveCommands(
			drag.page,
			drag.selection.map((shape) => shape.id),
			this.#delta(drag, point),
		);
		this.options.clearSnap?.();
		if (!edits?.length || !this.#current(drag)) {
			settle();
			return;
		}
		const request = ++this.#request;
		try {
			await this.controller.applySelectionEdits(edits);
			if (request === this.#request) this.options.announce('Shapes moved.');
		} catch (error) {
			if (request === this.#request && !isEditCancellation(error))
				this.options.announce(editErrorMessage(error));
		} finally {
			settle();
		}
	}
}
