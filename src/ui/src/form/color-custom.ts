import { html } from 'lit';
import { hexToRgbChannels, hslToRgb, normalizePaletteHex, rgbToHsl, toHex } from 'ooxml-core/color';
import { OfficeElement, controlStyles, flag } from '../base';
import { definer, emit, present } from '../registry';
import css from './color-custom.css?raw';

/** Detail of `office-color-change`: the colour as lower-case `#rrggbb`. */
export interface OfficeColorChange {
	color: string;
}
export type OfficeColorChangeEvent = CustomEvent<OfficeColorChange>;

/** Office shows hue, saturation and luminance on a 0-255 scale. */
const SCALE = 255;
type Channel = 'red' | 'green' | 'blue' | 'hue' | 'sat' | 'lum';
const CHANNELS: readonly [Channel, string][] = [
	['red', 'Red'],
	['green', 'Green'],
	['blue', 'Blue'],
	['hue', 'Hue'],
	['sat', 'Sat'],
	['lum', 'Lum'],
];
const clamp = (value: number, max = 1) => Math.min(max, Math.max(0, value));

/**
 * `<office-ui-color-custom>`: the Custom tab of Office's Colors dialog. A hue (across) and
 * saturation (up) square, a luminance slider, Hex, Red/Green/Blue and Hue/Sat/Lum fields (0-255,
 * as Office shows them) that follow each other, and New over Current swatches. `value` is the
 * colour (`#rrggbb`); `current` the colour being replaced. Every change emits
 * `office-color-change` `{ color }`. The square and the slider take the arrow keys (Shift moves
 * in larger steps), Home and End. The element is only the body: a product puts it in its dialog.
 */
export class OfficeUiColorCustom extends OfficeElement {
	static override styles = controlStyles(css);
	static override properties = {
		value: { type: String, noAccessor: true },
		current: { type: String },
		label: { type: String },
		disabled: flag,
		hsl: { state: true },
		typed: { state: true },
		bad: { state: true },
	};
	declare current: string | null;
	declare label: string | null;
	declare disabled: boolean;
	/** Kept beside the colour so grey keeps its hue and black its saturation while dragging. */
	declare hsl: { h: number; s: number; l: number };
	/** A hex being typed that is not a colour yet. */
	declare typed: string | null;
	/** A channel field holding something outside 0-255. */
	declare bad: Channel | null;

	constructor() {
		super();
		this.current = null;
		this.label = null;
		this.disabled = false;
		this.hsl = { h: 0, s: 0, l: 0 };
		this.typed = null;
		this.bad = null;
	}

	get value(): string {
		const { r, g, b } = hslToRgb(this.hsl.h, this.hsl.s, this.hsl.l);
		return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toLowerCase();
	}
	set value(next: string | null) {
		const color = normalizePaletteHex(next ?? '');
		// The same colour keeps the hue and saturation the user was working with.
		if (!color || color === this.value) return;
		const rgb = hexToRgbChannels(color)!;
		this.hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
		this.typed = null;
		this.bad = null;
	}

	private set(next: Partial<{ h: number; s: number; l: number }>): void {
		if (present(this.disabled)) return;
		this.hsl = { ...this.hsl, ...next };
		this.typed = null;
		this.bad = null;
		emit(this, 'office-color-change', { color: this.value } satisfies OfficeColorChange);
	}

	private fromSquare(event: PointerEvent): void {
		const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
		if (!box.width || !box.height) return;
		this.set({
			h: clamp((event.clientX - box.left) / box.width) * 359.999,
			s: 1 - clamp((event.clientY - box.top) / box.height),
		});
	}
	private fromSlider(event: PointerEvent): void {
		const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
		if (box.height) this.set({ l: 1 - clamp((event.clientY - box.top) / box.height) });
	}
	private drag(move: (event: PointerEvent) => void) {
		return (event: PointerEvent) => {
			if (present(this.disabled) || event.button > 0) return;
			const target = event.currentTarget as HTMLElement;
			target.setPointerCapture?.(event.pointerId);
			target.focus();
			move.call(this, event);
			const onMove = (next: Event) => move.call(this, next as PointerEvent);
			const stop = () => {
				target.removeEventListener('pointermove', onMove);
				target.removeEventListener('pointerup', stop);
				target.removeEventListener('pointercancel', stop);
			};
			target.addEventListener('pointermove', onMove);
			target.addEventListener('pointerup', stop);
			target.addEventListener('pointercancel', stop);
		};
	}

	private squareKey(event: KeyboardEvent): void {
		const step = event.shiftKey ? 10 : 1;
		const { h, s } = this.hsl;
		const next: Partial<{ h: number; s: number }> | undefined =
			event.key === 'ArrowRight'
				? { h: clamp(h + step * (360 / SCALE), 359.999) }
				: event.key === 'ArrowLeft'
					? { h: clamp(h - step * (360 / SCALE), 359.999) }
					: event.key === 'ArrowUp'
						? { s: clamp(s + step / SCALE) }
						: event.key === 'ArrowDown'
							? { s: clamp(s - step / SCALE) }
							: event.key === 'Home'
								? { h: 0 }
								: event.key === 'End'
									? { h: 359.999 }
									: undefined;
		if (!next) return;
		event.preventDefault();
		event.stopPropagation();
		this.set(next);
	}
	private sliderKey(event: KeyboardEvent): void {
		const step = (event.shiftKey ? 10 : 1) / SCALE;
		const { l } = this.hsl;
		const next =
			event.key === 'ArrowUp' || event.key === 'ArrowRight'
				? clamp(l + step)
				: event.key === 'ArrowDown' || event.key === 'ArrowLeft'
					? clamp(l - step)
					: event.key === 'Home'
						? 0
						: event.key === 'End'
							? 1
							: undefined;
		if (next === undefined) return;
		event.preventDefault();
		event.stopPropagation();
		this.set({ l: next });
	}

	private channels(): Record<Channel, number> {
		const { r, g, b } = hslToRgb(this.hsl.h, this.hsl.s, this.hsl.l);
		return {
			red: r,
			green: g,
			blue: b,
			hue: Math.round((this.hsl.h / 360) * SCALE),
			sat: Math.round(this.hsl.s * SCALE),
			lum: Math.round(this.hsl.l * SCALE),
		};
	}
	private onChannel(name: Channel, event: Event): void {
		const input = event.target as HTMLInputElement;
		const value = Number(input.value);
		if (present(this.disabled)) return;
		if (input.value.trim() === '' || !Number.isInteger(value) || value < 0 || value > SCALE) {
			this.bad = name;
			return;
		}
		if (name === 'hue') return this.set({ h: Math.min(359.999, (value / SCALE) * 360) });
		if (name === 'sat') return this.set({ s: value / SCALE });
		if (name === 'lum') return this.set({ l: value / SCALE });
		const now = this.channels();
		const rgb = { ...now, [name]: value };
		const next = rgbToHsl(rgb.red, rgb.green, rgb.blue);
		// A grey has no hue of its own: keep the one in use.
		this.set(next.s === 0 ? { ...next, h: this.hsl.h } : next);
	}
	private onHex(event: Event): void {
		if (present(this.disabled)) return;
		const text = (event.target as HTMLInputElement).value;
		const color = /^#?[0-9a-f]{6}$/i.test(text.trim()) ? normalizePaletteHex(text) : undefined;
		if (!color) {
			this.typed = text;
			return;
		}
		const rgb = hexToRgbChannels(color)!;
		this.set(rgbToHsl(rgb.r, rgb.g, rgb.b));
	}

	/** Whether the fields hold a colour (a half-typed hex or an out-of-range channel does not). */
	get valid(): boolean {
		return this.typed === null && this.bad === null;
	}

	protected override willUpdate(): void {
		this.setAttribute('role', 'group');
		this.setAttribute('aria-label', this.label ?? 'Custom color');
	}

	protected override render() {
		const disabled = present(this.disabled);
		const { h, s, l } = this.hsl;
		const values = this.channels();
		const color = this.value;
		const current = normalizePaletteHex(this.current ?? '');
		return html`<div class="custom" part="custom">
			<div class="picker">
				<div
					class="square"
					role="slider"
					tabindex=${disabled ? -1 : 0}
					aria-label="Hue and saturation"
					aria-valuemin="0"
					aria-valuemax=${SCALE}
					aria-valuenow=${values.hue}
					aria-valuetext=${`Hue ${values.hue}, saturation ${values.sat}`}
					aria-disabled=${String(disabled)}
					@pointerdown=${this.drag(this.fromSquare)}
					@keydown=${this.squareKey}
					><span
						class="cross"
						style=${`inset-inline-start:${(h / 360) * 100}%;top:${(1 - s) * 100}%`}
					></span
				></div>
				<div
					class="slider"
					role="slider"
					tabindex=${disabled ? -1 : 0}
					aria-label="Luminance"
					aria-orientation="vertical"
					aria-valuemin="0"
					aria-valuemax=${SCALE}
					aria-valuenow=${values.lum}
					aria-disabled=${String(disabled)}
					style=${`--_pure:hsl(${h} ${s * 100}% 50%)`}
					@pointerdown=${this.drag(this.fromSlider)}
					@keydown=${this.sliderKey}
					><span class="thumb" style=${`top:${(1 - l) * 100}%`}></span
				></div>
			</div>
			<div class="fields">
				<label class="hex"
					><span>Hex</span
					><input
						type="text"
						maxlength="7"
						spellcheck="false"
						data-color-field="hex"
						placeholder="#RRGGBB"
						aria-invalid=${String(this.typed !== null)}
						.value=${this.typed ?? color.toUpperCase()}
						?disabled=${disabled}
						@input=${this.onHex}
				/></label>
				${CHANNELS.map(
					([name, text]) =>
						html`<label
							><span>${text}</span
							><input
								type="number"
								min="0"
								max=${SCALE}
								step="1"
								data-color-field=${name}
								aria-invalid=${String(this.bad === name)}
								.value=${String(values[name])}
								?disabled=${disabled}
								@input=${(event: Event) => this.onChannel(name, event)}
						/></label>`,
				)}
				<div class="preview" aria-hidden="true">
					<span>New</span>
					<span class="swatch" data-preview="new" style=${`--_swatch:${color}`}></span>
					<span
						class="swatch"
						data-preview="current"
						style=${`--_swatch:${current ?? 'transparent'}`}
					></span>
					<span>Current</span>
				</div>
			</div>
		</div>`;
	}
}

export const defineColorCustom = definer('office-ui-color-custom', () => OfficeUiColorCustom);
