import type { VisioDocument, VisioPage, VisioShape } from 'ooxml-core/visio';
import {
	VISIO_TEXT_BLOCK_HANDLES,
	visioSelectionIsOnPage,
	visioShapeLocalPoint,
	visioTextBlockDrag,
	visioTextBlockEdit,
	visioTextBlockFrame,
	visioTextBlockMatrix,
	visioTextBlockShape,
	type VisioTextBlockFrame,
	type VisioTextBlockHandle,
} from 'ooxml-core/visio/ui';
import type { ViewerController, ViewerState } from './controller';
import { matrix } from './render-svg';
import { wireHandleEvents } from './viewer-handle-events';

interface Drag {
	pointer: number;
	handle: VisioTextBlockHandle;
	document: VisioDocument;
	page: VisioPage;
	shape: VisioShape;
	frame: VisioTextBlockFrame;
	start: { x: number; y: number };
	next: VisioTextBlockFrame;
}
const SVG = 'http://www.w3.org/2000/svg';

/**
 * Home > Tools > Text Block (Ctrl+Shift+4): the selected shape's text block gets a frame that
 * moves, eight resize handles and a rotation handle. Releasing writes one undoable format-text
 * edit with the TxtPinX/TxtPinY/TxtWidth/TxtHeight/TxtAngle cells.
 */
export class ViewerTextBlockTool {
	#active = false;
	#overlay: SVGGElement | undefined;
	#drag: Drag | undefined;
	constructor(
		private readonly viewport: HTMLElement,
		private readonly controller: ViewerController,
		private readonly options: {
			announce(message: string): void;
			edit(run: () => Promise<void>, success: string): void;
			/** The tool turned on or off. */
			changed(active: boolean): void;
		},
	) {}
	get active(): boolean {
		return this.#active;
	}
	toggle(): void {
		this.#active = !this.#active;
		this.options.announce(
			this.#active
				? 'Text Block tool: select a shape, then drag its text block, its handles or the round rotation handle. Press Escape to finish.'
				: 'Text Block tool off.',
		);
		this.render(this.controller.state);
		this.options.changed(this.#active);
	}
	exit(): void {
		if (!this.#active) return;
		this.#active = false;
		this.render(this.controller.state);
		this.options.changed(false);
	}
	#target(state: ViewerState) {
		const page = state.document?.pages[state.pageIndex];
		const selection = state.selectedShape;
		if (
			!this.#active ||
			!page ||
			!state.document ||
			!selection ||
			state.selectedShapes.length !== 1 ||
			!visioSelectionIsOnPage(selection, page.id) ||
			!state.edit.sourceAvailable ||
			state.edit.busy ||
			state.loading
		)
			return undefined;
		const shape = visioTextBlockShape(page, selection.id);
		return shape ? { document: state.document, page, shape } : undefined;
	}
	render(state: ViewerState): void {
		this.viewport.dataset.textBlock = String(this.#active);
		if (this.#drag) return;
		this.#overlay?.remove();
		this.#overlay = undefined;
		const target = this.#target(state);
		const svg = this.viewport.querySelector<SVGSVGElement>('svg.paper');
		if (!target || !svg) return;
		const screen = svg.getScreenCTM?.();
		const scale = screen ? Math.hypot(screen.a, screen.b) : 96 * state.zoom;
		this.#overlay = this.#draw(
			svg,
			target.page,
			target.shape,
			visioTextBlockFrame(target.shape),
			scale,
		);
	}
	#draw(
		svg: SVGSVGElement,
		page: VisioPage,
		shape: VisioShape,
		frame: VisioTextBlockFrame,
		scale: number,
	): SVGGElement {
		const create = <K extends keyof SVGElementTagNameMap>(name: K) =>
			svg.ownerDocument.createElementNS(SVG, name) as SVGElementTagNameMap[K];
		const group = create('g');
		group.dataset.textBlockOverlay = shape.id;
		group.setAttribute(
			'transform',
			`translate(0 ${page.height}) scale(1 -1) ${matrix(shape.transform)} ${matrix(visioTextBlockMatrix(frame))}`,
		);
		const rect = create('rect');
		rect.dataset.textBlockFrame = '';
		rect.dataset.textBlockHandle = 'move';
		rect.setAttribute('width', String(frame.width));
		rect.setAttribute('height', String(frame.height));
		rect.setAttribute('vector-effect', 'non-scaling-stroke');
		rect.setAttribute('aria-label', 'Drag to move the text block');
		group.append(rect);
		const radius = String(5 / (scale || 96));
		const handle = (id: VisioTextBlockHandle, x: number, y: number, label: string) => {
			const circle = create('circle');
			circle.dataset.textBlockHandle = id;
			circle.setAttribute('cx', String(x));
			circle.setAttribute('cy', String(y));
			circle.setAttribute('r', radius);
			circle.setAttribute('vector-effect', 'non-scaling-stroke');
			circle.setAttribute('aria-label', label);
			group.append(circle);
		};
		for (const location of VISIO_TEXT_BLOCK_HANDLES)
			handle(
				location.id,
				location.x * frame.width,
				location.y * frame.height,
				`Drag ${location.id} text block handle`,
			);
		handle(
			'rotate',
			frame.width / 2,
			frame.height + 24 / (scale || 96),
			'Drag to rotate the text block',
		);
		svg.append(group);
		return group;
	}
	wire(): () => void {
		// Escape ends the tool wherever focus is, except in text fields and dialogs.
		const scope = this.viewport.getRootNode() as ShadowRoot | Document;
		const keys = (event: Event) => {
			if (
				event instanceof KeyboardEvent &&
				event.key === 'Escape' &&
				this.#active &&
				!this.#drag &&
				!event.defaultPrevented &&
				!event
					.composedPath()
					.some(
						(node) =>
							node instanceof Element && node.matches('input, textarea, select, office-ui-dialog'),
					)
			) {
				event.preventDefault();
				this.exit();
			}
		};
		scope.addEventListener('keydown', keys, true);
		const dispose = wireHandleEvents(this.viewport, {
			pointer: () => this.#drag?.pointer,
			start: (event) => this.#start(event),
			move: (event) => this.#move(event),
			finish: (event) => this.#finish(event),
			cancel: () => {
				this.#drag = undefined;
				this.render(this.controller.state);
			},
		});
		return () => {
			scope.removeEventListener('keydown', keys, true);
			dispose();
			this.#overlay?.remove();
			this.#overlay = undefined;
		};
	}
	#local(event: PointerEvent, page: VisioPage, shape: VisioShape) {
		const svg = this.#overlay?.ownerSVGElement;
		const screen = svg?.getScreenCTM?.();
		if (!screen) return undefined;
		const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(screen.inverse());
		return visioShapeLocalPoint(shape, { x: point.x, y: page.height - point.y });
	}
	#start(event: PointerEvent): void {
		const element = (event.target as Element)?.closest?.<SVGElement>('[data-text-block-handle]');
		const target = this.#target(this.controller.state);
		if (!element || !this.#overlay?.contains(element) || !target || event.button !== 0) return;
		const start = this.#local(event, target.page, target.shape);
		if (!start) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		const frame = visioTextBlockFrame(target.shape);
		this.#drag = {
			pointer: event.pointerId,
			handle: element.dataset.textBlockHandle as VisioTextBlockHandle,
			...target,
			frame,
			start,
			next: frame,
		};
		this.#overlay.dataset.textBlockPreview = '';
		// Like the other handles, a drag gives the drawing window focus for Escape and shortcuts.
		this.viewport.focus({ preventScroll: true });
		this.viewport.setPointerCapture?.(event.pointerId);
	}
	#move(event: PointerEvent): void {
		const drag = this.#drag;
		if (!drag || event.pointerId !== drag.pointer) return;
		const point = this.#local(event, drag.page, drag.shape);
		event.preventDefault();
		event.stopImmediatePropagation();
		if (!point || !this.#overlay) return;
		drag.next = visioTextBlockDrag(drag.frame, drag.handle, drag.start, point);
		const svg = this.#overlay.ownerSVGElement!;
		const scale = Math.hypot(svg.getScreenCTM?.()?.a ?? 96, svg.getScreenCTM?.()?.b ?? 0);
		this.#overlay.remove();
		this.#overlay = this.#draw(svg, drag.page, drag.shape, drag.next, scale);
		this.#overlay.dataset.textBlockPreview = '';
	}
	async #finish(event: PointerEvent): Promise<void> {
		const drag = this.#drag;
		if (!drag || event.pointerId !== drag.pointer) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		this.#drag = undefined;
		if (this.viewport.hasPointerCapture?.(drag.pointer))
			this.viewport.releasePointerCapture(drag.pointer);
		const state = this.controller.state;
		const unchanged = (['x', 'y', 'width', 'height', 'angle'] as const).every(
			(key) => Math.abs(drag.next[key] - drag.frame[key]) < 1e-6,
		);
		if (unchanged || state.document !== drag.document || state.edit.busy) {
			this.render(state);
			return;
		}
		const edit = visioTextBlockEdit(drag.page, drag.shape, drag.next);
		this.options.edit(
			() => this.controller.applyEdits([edit]),
			drag.handle === 'move'
				? 'Moved the text block.'
				: drag.handle === 'rotate'
					? 'Rotated the text block.'
					: 'Resized the text block.',
		);
		this.render(this.controller.state);
	}
}
