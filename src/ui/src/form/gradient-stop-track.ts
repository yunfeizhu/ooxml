import { sortGradientStops } from 'ooxml-core/chart';

export interface GradientStopTrackOptions {
	stops: readonly { position: number; color: string }[];
	selected: number;
	disabled: boolean;
	label: string;
	stopLabel(index: number): string;
	onSelect(index: number): void;
	onMove?(index: number, position: number): void;
	onPreview?(index: number, position: number | undefined): void;
}

/** Native buttons provide keyboard navigation and focus for the shared Office gradient strip. */
export function createGradientStopTrack(doc: Document) {
	const element = doc.createElement('div');
	element.className = 'office-gradient-stop-track';
	element.setAttribute('role', 'group');
	const style = doc.createElement('style');
	style.textContent = `.office-gradient-stop-track{position:relative;height:40px;margin:12px 7px}
.office-gradient-stop-paint{position:absolute;inset:3px 0 15px;border:1px solid var(--line,#aaa)}
.office-gradient-stop{position:absolute;top:0;width:14px;height:30px;padding:0;border:1px solid var(--line,#888);border-radius:2px;cursor:pointer;touch-action:none}
.office-gradient-stop[aria-pressed=true]{outline:2px solid var(--accent,#217346);outline-offset:2px}
.office-gradient-stop:focus-visible{outline:2px solid var(--accent,#217346);outline-offset:3px}
.office-gradient-stop:disabled{opacity:.5;cursor:default}`;
	const paint = doc.createElement('div');
	paint.className = 'office-gradient-stop-paint';
	let current: GradientStopTrackOptions;
	let drag:
		| { pointer: number; index: number; x: number; width: number; origin: number; value: number }
		| undefined;
	const paintStops = (stops: GradientStopTrackOptions['stops']) => {
		paint.style.background = `linear-gradient(90deg,${sortGradientStops(stops)
			.map((stop) => `${stop.color} ${stop.position}%`)
			.join(',')})`;
	};
	const cancel = () => {
		if (!drag) return;
		const previous = drag;
		drag = undefined;
		paintStops(current.stops);
		const buttons = element.querySelectorAll<HTMLButtonElement>('button');
		buttons[previous.index]?.style.setProperty('left', `calc(${previous.origin}% - 7px)`);
		current.onPreview?.(previous.index, undefined);
		if (element.hasPointerCapture?.(previous.pointer))
			element.releasePointerCapture(previous.pointer);
	};
	const update = (options: GradientStopTrackOptions) => {
		cancel();
		current = options;
		element.setAttribute('aria-label', options.label);
		paintStops(options.stops);
		element.replaceChildren(
			style,
			paint,
			...options.stops.map((stop, index) => {
				const button = doc.createElement('button');
				button.type = 'button';
				button.className = 'office-gradient-stop';
				button.disabled = options.disabled;
				button.setAttribute('aria-label', options.stopLabel(index));
				button.setAttribute('aria-pressed', String(index === options.selected));
				button.style.left = `calc(${stop.position}% - 7px)`;
				button.style.background = stop.color;
				button.addEventListener('click', () => {
					if (!current.disabled) current.onSelect(index);
				});
				button.addEventListener('keydown', (event) => {
					const next =
						event.key === 'ArrowRight'
							? index + 1
							: event.key === 'ArrowLeft'
								? index - 1
								: undefined;
					if (next === undefined || current.disabled) return;
					event.preventDefault();
					const selected = Math.max(0, Math.min(current.stops.length - 1, next));
					current.onSelect(selected);
					element.querySelectorAll<HTMLButtonElement>('button')[selected]?.focus();
				});
				return button;
			}),
		);
	};
	element.addEventListener('pointerdown', (event) => {
		if (
			drag ||
			!current ||
			event.isPrimary === false ||
			event.button !== 0 ||
			current.disabled ||
			!current.onMove
		)
			return;
		const button = (event.target as Element).closest('button');
		const index = Array.from(element.querySelectorAll('button')).indexOf(
			button as HTMLButtonElement,
		);
		if (index < 0) return;
		event.preventDefault();
		current.onSelect(index);
		const width = paint.getBoundingClientRect().width;
		const origin = current.stops[index]?.position;
		if (!width || origin === undefined) return;
		drag = { pointer: event.pointerId, index, x: event.clientX, width, origin, value: origin };
		try {
			element.setPointerCapture?.(event.pointerId);
		} catch {
			/* Synthetic pointers cannot be captured. */
		}
		element.querySelectorAll<HTMLButtonElement>('button')[index]?.focus();
	});
	element.addEventListener('pointermove', (event) => {
		if (!drag || event.pointerId !== drag.pointer || current.disabled) return;
		const value = Math.max(
			0,
			Math.min(100, Math.round(drag.origin + ((event.clientX - drag.x) / drag.width) * 100)),
		);
		if (value === drag.value) return;
		drag.value = value;
		const buttons = element.querySelectorAll<HTMLButtonElement>('button');
		buttons[drag.index]?.style.setProperty('left', `calc(${value}% - 7px)`);
		paintStops(
			current.stops.map((stop, index) =>
				index === drag!.index ? { ...stop, position: value } : stop,
			),
		);
		current.onPreview?.(drag.index, value);
	});
	element.addEventListener('pointerup', (event) => {
		if (!drag || event.pointerId !== drag.pointer) return;
		const previous = drag;
		cancel();
		if (!current.disabled && element.isConnected && previous.value !== previous.origin)
			current.onMove?.(previous.index, previous.value);
	});
	for (const name of ['pointercancel', 'lostpointercapture'] as const)
		element.addEventListener(name, (event) => {
			if (drag?.pointer === event.pointerId) cancel();
		});
	element.addEventListener('keydown', (event) => {
		if (event.key === 'Escape' && drag) {
			event.preventDefault();
			event.stopPropagation();
			cancel();
		}
	});
	return {
		element,
		update,
		cancel,
		preview: (stops: GradientStopTrackOptions['stops']) => {
			paintStops(stops);
			const buttons = element.querySelectorAll<HTMLButtonElement>('button');
			stops.forEach((stop, index) => {
				const button = buttons[index];
				if (button) {
					button.style.left = `calc(${stop.position}% - 7px)`;
					button.style.background = stop.color;
				}
			});
		},
	};
}
