import { html, nothing } from 'lit';
import { OfficeElement, controlStyles } from '../base';
import { definer } from '../registry';
import { OFFICE_TOKENS } from '../tokens';
import css from './ruler.css?raw';

/** Tick subdivisions per unit for a given unit length in CSS pixels, finer as it grows. */
export function rulerDivisions(unitPixels: number): number {
	return unitPixels >= 192 ? 16 : unitPixels >= 96 ? 8 : unitPixels >= 48 ? 4 : 2;
}

/** A draggable marker on the ruler (an indent, a tab stop, a margin handle). */
export interface RulerMarker {
	/** Identifies the marker in events and in its `data-marker` attribute. */
	name: string;
	/** CSS pixels from the ruler's start edge, at 100% zoom. */
	position: number;
	/** Which side of the ruler the pointer sits on; defaults to `bottom`. */
	edge?: 'top' | 'bottom';
	/** Accessible name of the marker. */
	label?: string;
}

/** Detail of `ruler-marker-move`, `ruler-marker-commit` and `ruler-marker-cancel`. */
export interface RulerMarkerEventDetail {
	name: string;
	/** Pointer position in CSS pixels from the start edge at 100% zoom (zoom already removed). */
	position: number;
}

/**
 * `<office-ui-ruler>`: an Office ruler (inches by default). The product positions it
 * and says where zero is: `origin` is the CSS-pixel offset of zero from the ruler's start edge,
 * `scale` the CSS pixels per unit (96 at 100% for inches). `orientation="vertical"` draws a
 * side ruler; `direction="reverse"` makes values grow toward the start edge, as Visio's
 * vertical ruler grows upward from the page bottom. `density` (1 by default) is the share of the
 * subdivisions shown: 0.5 draws every second tick and 0.25 every fourth (Visio's Normal and
 * Coarse ruler subdivisions).
 *
 * Page rulers add: `extent` (the ruler's own length in px, as long as the page), `marginStart` /
 * `marginEnd` (shaded margin bands), `zoom` (the ruler is shown at that CSS zoom) and
 * `labelsWithinMargins` (whole-unit labels only between the margins, counted up from `origin`).
 * `markers` are draggable: the element fires `ruler-marker-move` while one is dragged (the host
 * answers by updating `markers` to preview), then `ruler-marker-commit` on release or
 * `ruler-marker-cancel`; all carry a `RulerMarkerEventDetail`. Without a `label` the ruler is
 * hidden from assistive technology; with one it is an image with that name.
 */
export class OfficeUiRuler extends OfficeElement {
	static override styles = controlStyles(css);
	static override properties = {
		orientation: { type: String, reflect: true },
		origin: { type: Number },
		scale: { type: Number },
		direction: { type: String },
		density: { type: Number },
		extent: { type: Number },
		marginStart: { type: Number },
		marginEnd: { type: Number },
		zoom: { type: Number },
		labelsWithinMargins: { type: Boolean },
		label: { type: String },
		markers: { attribute: false },
	};
	declare orientation: string;
	declare origin: number;
	declare scale: number;
	declare direction: string;
	declare density: number;
	declare extent: number;
	declare marginStart: number;
	declare marginEnd: number;
	declare zoom: number;
	declare labelsWithinMargins: boolean;
	declare label: string;
	declare markers: readonly RulerMarker[];
	private frame = 0;
	private zoomApplied = false;
	private observer: ResizeObserver | undefined;

	constructor() {
		super();
		this.orientation = '';
		this.origin = 0;
		this.scale = 96;
		this.direction = '';
		this.density = 1;
		this.extent = 0;
		this.marginStart = 0;
		this.marginEnd = 0;
		this.zoom = 1;
		this.labelsWithinMargins = false;
		this.label = '';
		this.markers = [];
	}

	override connectedCallback(): void {
		super.connectedCallback();
		const Observer = this.ownerDocument.defaultView?.ResizeObserver;
		this.observer = Observer ? new Observer(() => this.schedule()) : undefined;
		this.observer?.observe(this);
		this.schedule();
	}

	override disconnectedCallback(): void {
		super.disconnectedCallback();
		this.observer?.disconnect();
		if (this.frame) this.ownerDocument.defaultView?.cancelAnimationFrame?.(this.frame);
		this.frame = 0;
	}

	private schedule(): void {
		if (this.frame || !this.isConnected) return;
		const view = this.ownerDocument.defaultView;
		this.frame = view?.requestAnimationFrame?.(() => this.draw()) ?? 0;
		if (!this.frame) this.draw();
	}

	protected override willUpdate(): void {
		if (this.label) {
			this.removeAttribute('aria-hidden');
			this.setAttribute('role', 'img');
			this.setAttribute('aria-label', this.label);
		} else {
			this.setAttribute('aria-hidden', 'true');
			if (this.getAttribute('role') === 'img') this.removeAttribute('role');
			this.removeAttribute('aria-label');
		}
	}

	protected override updated(): void {
		if (this.extent > 0)
			this.style.setProperty(
				this.orientation === 'vertical' ? 'height' : 'width',
				`${this.extent}px`,
			);
		if (this.zoom !== 1 && this.zoom > 0) {
			this.style.setProperty('zoom', String(this.zoom));
			this.zoomApplied = true;
		} else if (this.zoomApplied) {
			this.style.removeProperty('zoom');
			this.zoomApplied = false;
		}
		this.schedule();
	}

	private get zoomFactor(): number {
		return this.zoom > 0 ? this.zoom : 1;
	}

	private pointerPosition(event: PointerEvent): number {
		const box = this.getBoundingClientRect();
		const offset =
			this.orientation === 'vertical' ? event.clientY - box.top : event.clientX - box.left;
		return offset / this.zoomFactor;
	}

	private emit(type: string, detail: RulerMarkerEventDetail): void {
		this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
	}

	private dragMarker(event: PointerEvent, name: string): void {
		if (event.button !== 0) return;
		event.preventDefault();
		const marker = event.currentTarget as HTMLElement;
		marker.setPointerCapture?.(event.pointerId);
		const move = (e: PointerEvent) =>
			this.emit('ruler-marker-move', { name, position: this.pointerPosition(e) });
		const finish = (e: PointerEvent) => {
			marker.removeEventListener('pointermove', move);
			marker.removeEventListener('pointerup', finish);
			marker.removeEventListener('pointercancel', finish);
			this.emit(e.type === 'pointerup' ? 'ruler-marker-commit' : 'ruler-marker-cancel', {
				name,
				position: this.pointerPosition(e),
			});
		};
		marker.addEventListener('pointermove', move);
		marker.addEventListener('pointerup', finish);
		marker.addEventListener('pointercancel', finish);
	}

	private draw(): void {
		this.frame = 0;
		const canvas = this.renderRoot.querySelector('canvas');
		if (!canvas) return;
		const view = this.ownerDocument.defaultView;
		const vertical = this.orientation === 'vertical';
		const reverse = this.direction === 'reverse';
		const box = this.getBoundingClientRect();
		// Layout size ignores the host's own CSS zoom; fall back to the box where there is no layout.
		const length =
			(vertical ? this.offsetHeight : this.offsetWidth) || (vertical ? box.height : box.width);
		const thickness =
			(vertical ? this.offsetWidth || box.width : this.offsetHeight || box.height) ||
			parseFloat(OFFICE_TOKENS['--office-ruler-size']);
		const ratio = (view?.devicePixelRatio ?? 1) * this.zoomFactor;
		canvas.width = Math.max(1, Math.round((vertical ? thickness : length) * ratio));
		canvas.height = Math.max(1, Math.round((vertical ? length : thickness) * ratio));
		const context = canvas.getContext?.('2d');
		if (!context || !length) return;
		context.scale(ratio, ratio);
		// A canvas cannot read custom properties: draw with the host's computed, token-driven style.
		const style = view?.getComputedStyle(this);
		const ink = style?.color || OFFICE_TOKENS['--office-muted-foreground'];
		context.strokeStyle = ink;
		context.fillStyle = ink;
		context.lineWidth = 1;
		context.font = `${style?.fontSize || OFFICE_TOKENS['--office-font-size-3xs']} ${style?.fontFamily || OFFICE_TOKENS['--office-font']}`;
		const origin = Number.isFinite(this.origin) ? this.origin : 0;
		const unit = Math.max(1, Number.isFinite(this.scale) ? this.scale : 96);
		const density = this.density > 0 && this.density <= 1 ? this.density : 1;
		const divisions = Math.max(1, Math.round(rulerDivisions(unit) * density));
		const step = unit / divisions;
		const sign = reverse ? -1 : 1;
		// Every tick index whose position falls inside the ruler, with one spare at each end.
		const a = (0 - origin) / (sign * step);
		const b = (length - origin) / (sign * step);
		const first = Math.floor(Math.min(a, b)) - 1;
		const last = Math.ceil(Math.max(a, b)) + 1;
		context.beginPath();
		for (let index = first; index <= last; index++) {
			const at = Math.round(origin + sign * index * step) + 0.5;
			const tick =
				index % divisions === 0
					? thickness
					: index % (divisions / 2) === 0
						? thickness * 0.5
						: thickness * 0.3;
			if (vertical) {
				context.moveTo(thickness, at);
				context.lineTo(thickness - tick, at);
			} else {
				context.moveTo(at, thickness);
				context.lineTo(at, thickness - tick);
			}
			if (index % divisions !== 0) continue;
			if (
				this.labelsWithinMargins &&
				(index < 0 || at < this.marginStart || at > length - this.marginEnd)
			)
				continue;
			const label = String(index / divisions);
			if (!vertical) context.fillText(label, at + 2, 9);
			else {
				context.save();
				context.translate(9, at - 2);
				context.rotate(-Math.PI / 2);
				context.fillText(label, 0, 0);
				context.restore();
			}
		}
		context.stroke();
	}

	protected override render() {
		const vertical = this.orientation === 'vertical';
		const band = (side: 'start' | 'end', size: number) =>
			size > 0
				? html`<div
						class="margin"
						data-margin=${side}
						style="${side === 'start' ? (vertical ? 'top' : 'left') : vertical ? 'bottom' : 'right'}:0;${vertical ? 'height' : 'width'}:${size}px"
					></div>`
				: nothing;
		return html`${band('start', this.marginStart)}${band('end', this.marginEnd)}<canvas
			></canvas>${this.markers.map(
				(marker) =>
					html`<div
						class="marker ${marker.edge === 'top' ? 'top' : 'bottom'}"
						data-marker=${marker.name}
						style="${vertical ? 'top' : 'left'}:${marker.position}px"
						aria-label=${marker.label ?? nothing}
						@pointerdown=${(event: PointerEvent) => this.dragMarker(event, marker.name)}
					></div>`,
			)}`;
	}
}

export const defineRuler = definer('office-ui-ruler', () => OfficeUiRuler);
