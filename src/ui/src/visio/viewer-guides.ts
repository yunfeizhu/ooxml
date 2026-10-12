import { VISIO_SNAP, visioSnapGlue, type VisioPage } from 'ooxml-core/visio';
import {
	editErrorMessage,
	isEditCancellation,
	visioGuideCreateCommand,
	visioGuideMoveCommand,
	visioPageGuides,
	visioSnapMoveDelta,
	type VisioSnapGrid,
	type VisioPagePoint,
} from 'ooxml-core/visio/ui';
import type { ViewerController, ViewerState } from './controller';
import { pagePoint } from './viewer-page-point';

const SVG = 'http://www.w3.org/2000/svg';
/** Screen pixels within which a moving shape snaps to a guide or, with Dynamic Grid, a shape. */
const SNAP_PIXELS = 8;
type Box = HTMLElement & { checked: boolean; disabled: boolean };

/**
 * View > Guides and View > Dynamic Grid. Guides are the page's `Type="Guide"` shapes, drawn as
 * dashed lines when Guides is on: drag from the top ruler for a horizontal guide or the left
 * ruler for a vertical one, drag a guide to move it, click it and press Delete to remove it.
 * Each is one source edit. Moving shapes snaps to shown guides and, with Dynamic Grid, to other
 * shapes' edges and centres, showing alignment hints while dragging.
 */
export class ViewerGuides {
	#shown = false;
	/** On by default, as in Visio: moving shapes snap to other shapes' edges and centres. */
	#dynamic = true;
	#selected: string | undefined;
	#drag:
		| { pointer: number; line: SVGGElement; id?: string; vertical: boolean; x: number; y: number }
		| undefined;
	constructor(
		private readonly root: ShadowRoot,
		private readonly viewport: HTMLElement,
		private readonly rulers: HTMLElement,
		private readonly controller: ViewerController,
		private readonly announce: (message: string) => void,
	) {}
	get shown(): boolean {
		return this.#shown;
	}
	toggleGuides(): void {
		this.#shown = !this.#shown;
		this.#selected = undefined;
		this.announce(
			this.#shown
				? 'Guides shown: drag from a ruler to add one; shapes snap to guides.'
				: 'Guides hidden.',
		);
		this.render(this.controller.state);
	}
	toggleDynamicGrid(): void {
		this.#dynamic = !this.#dynamic;
		this.announce(this.#dynamic ? 'Dynamic Grid on.' : 'Dynamic Grid off.');
		this.render(this.controller.state);
	}
	#svg(): SVGSVGElement | null {
		return this.viewport.querySelector<SVGSVGElement>('svg.paper');
	}
	#editable(state: ViewerState): boolean {
		return state.edit.sourceAvailable && !state.loading && !state.edit.busy;
	}
	/**
	 * Snap a shape drag; draws alignment hints. `grid` is the Snap to Grid step in page inches (0
	 * while the grid is hidden). Unchanged when no snapping is active.
	 */
	snap(
		page: VisioPage,
		ids: readonly string[],
		delta: VisioPagePoint,
		grid: number | VisioSnapGrid = 0,
	): VisioPagePoint {
		const svg = this.#svg();
		this.clearHints();
		// Snap & Glue: Snap off stops all of it; Grid and Guides can be left out one by one.
		const settings = visioSnapGlue(this.controller.state.document ?? {}).snapSettings;
		if (settings & VISIO_SNAP.disabled) return delta;
		if (!(settings & VISIO_SNAP.grid)) grid = 0;
		const guides = this.#shown && !!(settings & VISIO_SNAP.guides);
		if (!guides && !this.#dynamic && !grid) return delta;
		const zoom = this.controller.state.zoom || 1;
		const result = visioSnapMoveDelta(page, ids, delta, {
			shapes: this.#dynamic,
			guides,
			threshold: SNAP_PIXELS / (96 * zoom),
			grid,
		});
		if (!svg || !result.lines.length) return result.delta;
		const hints = svg.ownerDocument.createElementNS(SVG, 'g');
		hints.dataset.snapHints = '';
		hints.setAttribute('aria-hidden', 'true');
		hints.style.pointerEvents = 'none';
		for (const line of result.lines) {
			const element = svg.ownerDocument.createElementNS(SVG, 'line');
			// Snap boxes use y = -(page y); the SVG's y is page height minus page y.
			const clamp = (value: number, size: number) => Math.max(-size, Math.min(2 * size, value));
			const { height, width } = page;
			const vertical = line.axis === 'x';
			const [x1, y1, x2, y2] = vertical
				? [line.pos, clamp(height + line.start, height), line.pos, clamp(height + line.end, height)]
				: [clamp(line.start, width), height + line.pos, clamp(line.end, width), height + line.pos];
			for (const [name, value] of Object.entries({ x1, y1, x2, y2 }))
				element.setAttribute(name, String(value));
			element.setAttribute('stroke', 'var(--_vv-accent)');
			element.setAttribute('stroke-width', '1');
			element.setAttribute('vector-effect', 'non-scaling-stroke');
			hints.append(element);
		}
		svg.append(hints);
		return result.delta;
	}
	clearHints(): void {
		for (const node of this.viewport.querySelectorAll('[data-snap-hints]')) node.remove();
	}
	/** Page inches with y up from a pointer event, unbounded, or undefined off the page SVG. */
	#point(event: PointerEvent, page: VisioPage) {
		const svg = this.#svg();
		const point = svg && pagePoint(svg, page, event, { snap: false, bounded: false });
		return point && { x: point.x, y: page.height - point.y };
	}
	/** A guide: a wide transparent hit line under the visible dashed line. */
	#line(vertical: boolean, position: number, page: VisioPage, id?: string): SVGGElement {
		const doc = this.root.ownerDocument;
		const group = doc.createElementNS(SVG, 'g');
		group.classList.add('guide');
		group.dataset.orientation = vertical ? 'vertical' : 'horizontal';
		for (const kind of ['guide-hit', 'guide-line']) {
			const line = doc.createElementNS(SVG, 'line');
			line.classList.add(kind);
			line.setAttribute('vector-effect', 'non-scaling-stroke');
			group.append(line);
		}
		this.#move(group, vertical, position, page);
		if (id !== undefined) {
			group.dataset.guideId = id;
			group.setAttribute('role', 'button');
			group.setAttribute('aria-label', `${vertical ? 'Vertical' : 'Horizontal'} guide`);
			group.setAttribute('aria-pressed', String(this.#selected === id));
		}
		return group;
	}
	#move(group: SVGGElement, vertical: boolean, position: number, page: VisioPage): void {
		const y = page.height - position;
		for (const line of group.children) {
			line.setAttribute('x1', String(vertical ? position : -page.width));
			line.setAttribute('x2', String(vertical ? position : page.width * 2));
			line.setAttribute('y1', String(vertical ? -page.height : y));
			line.setAttribute('y2', String(vertical ? page.height * 2 : y));
		}
	}
	async #commit(run: () => Promise<void>, message: string): Promise<void> {
		try {
			await run();
			this.announce(message);
		} catch (error) {
			if (!isEditCancellation(error)) this.announce(editErrorMessage(error));
		}
	}
	wire(): () => void {
		const Abort = this.root.ownerDocument.defaultView?.AbortController ?? AbortController;
		const events = new Abort();
		const options = { signal: events.signal };
		const start = (event: PointerEvent, vertical: boolean, id?: string) => {
			const state = this.controller.state;
			const page = state.document?.pages[state.pageIndex];
			const svg = this.#svg();
			if (!this.#shown || !page || !svg || event.button !== 0 || !this.#editable(state)) return;
			event.preventDefault();
			event.stopPropagation();
			const existing = id && svg.querySelector<SVGGElement>(`[data-guide-id="${CSS.escape(id)}"]`);
			const line = existing || this.#line(vertical, -1e6, page);
			if (!existing) svg.querySelector('[data-guides]')?.append(line);
			line.classList.add('dragging');
			(event.currentTarget as Element).setPointerCapture?.(event.pointerId);
			this.#drag = {
				pointer: event.pointerId,
				line,
				vertical,
				x: event.clientX,
				y: event.clientY,
				...(id ? { id } : {}),
			};
		};
		const move = (event: PointerEvent) => {
			const drag = this.#drag;
			const page = this.controller.state.document?.pages[this.controller.state.pageIndex];
			if (!drag || event.pointerId !== drag.pointer || !page) return;
			const point = this.#point(event, page);
			if (point) this.#move(drag.line, drag.vertical, drag.vertical ? point.x : point.y, page);
		};
		const finish = (event: PointerEvent) => {
			const drag = this.#drag;
			if (!drag || event.pointerId !== drag.pointer) return;
			this.#drag = undefined;
			drag.line.classList.remove('dragging');
			const state = this.controller.state;
			const page = state.document?.pages[state.pageIndex];
			const point = page && this.#point(event, page);
			const rect = this.viewport.getBoundingClientRect();
			const inside =
				event.clientX >= rect.left &&
				event.clientX <= rect.right &&
				event.clientY >= rect.top &&
				event.clientY <= rect.bottom;
			if (!page || !point || !inside || !this.#editable(state)) {
				if (!drag.id) drag.line.remove();
				this.render(state);
				return;
			}
			const position = drag.vertical ? point.x : point.y;
			if (!drag.id) {
				drag.line.remove();
				const command = visioGuideCreateCommand(
					page,
					drag.vertical ? 'vertical' : 'horizontal',
					position,
				);
				void this.#commit(() => this.controller.applyEdits([command]), 'Added a guide.');
				return;
			}
			const id = drag.id;
			this.#selected = id;
			// A click selects the guide (for Delete); only a real drag moves it.
			if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 3) {
				this.render(state);
				return;
			}
			void this.#commit(
				() => this.controller.applyEdits([visioGuideMoveCommand(page, id, position)]),
				'Moved the guide.',
			);
		};
		for (const [selector, vertical] of [
			['.ruler-h', false],
			['.ruler-v', true],
		] as const) {
			const ruler = this.rulers.querySelector<HTMLElement>(selector);
			if (!ruler) continue;
			ruler.addEventListener('pointerdown', (event) => start(event, vertical), options);
			ruler.addEventListener('pointermove', move, options);
			ruler.addEventListener('pointerup', finish, options);
			ruler.addEventListener('pointercancel', () => this.#cancel(), options);
		}
		this.viewport.addEventListener(
			'pointerdown',
			(event) => {
				const line = (event.target as Element).closest?.<SVGGElement>('[data-guide-id]');
				if (!line) return;
				const id = line.dataset.guideId!;
				this.#selected = id;
				for (const other of this.viewport.querySelectorAll('[data-guide-id]'))
					other.setAttribute('aria-pressed', String(other === line));
				start(event, line.dataset.orientation === 'vertical', id);
			},
			options,
		);
		this.viewport.addEventListener('pointermove', move, options);
		this.viewport.addEventListener('pointerup', finish, options);
		this.viewport.addEventListener('pointercancel', () => this.#cancel(), options);
		this.viewport.addEventListener(
			'keydown',
			(event) => {
				if (event.key !== 'Delete' || !this.#selected || !this.#shown) return;
				const state = this.controller.state;
				const page = state.document?.pages[state.pageIndex];
				if (!page || !this.#editable(state)) return;
				event.preventDefault();
				event.stopPropagation();
				const shapeId = this.#selected;
				this.#selected = undefined;
				void this.#commit(
					() => this.controller.applyEdits([{ type: 'delete-guide', pageId: page.id, shapeId }]),
					'Deleted the guide.',
				);
			},
			{ ...options, capture: true },
		);
		return () => {
			this.#cancel();
			events.abort();
		};
	}
	#cancel(): void {
		const drag = this.#drag;
		this.#drag = undefined;
		if (drag && !drag.id) drag.line.remove();
		if (drag) this.render(this.controller.state);
	}
	render(state: ViewerState): void {
		for (const [id, on] of [
			['guides', this.#shown],
			['dynamic-grid', this.#dynamic],
		] as const) {
			const box = this.root.querySelector<Box>(`[data-check="${id}"]`);
			if (!box) continue;
			box.checked = on;
			box.disabled = !state.document?.pages[state.pageIndex];
		}
		this.viewport.dataset.guides = String(this.#shown);
		const svg = this.#svg();
		const page = state.document?.pages[state.pageIndex];
		if (this.#drag && (!svg || !this.#drag.line.isConnected)) this.#cancel();
		if (this.#drag) return;
		svg?.querySelector('[data-guides]')?.remove();
		if (!svg || !page || !this.#shown) return;
		const group = svg.ownerDocument.createElementNS(SVG, 'g');
		group.dataset.guides = '';
		const guides = visioPageGuides(page);
		if (!guides.some((guide) => guide.id === this.#selected)) this.#selected = undefined;
		for (const guide of guides)
			group.append(this.#line(guide.orientation === 'vertical', guide.position, page, guide.id));
		svg.append(group);
	}
}
