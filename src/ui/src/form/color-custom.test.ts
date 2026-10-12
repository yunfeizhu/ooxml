import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { OfficeColorChange, OfficeUiColorCustom } from '../controls';
import { registerOfficeUi } from '../index';

beforeAll(() => registerOfficeUi());
afterEach(() => document.body.replaceChildren());

function make(value = '#ff0000', current = '#00ff00') {
	const el = document.createElement('office-ui-color-custom') as OfficeUiColorCustom;
	el.value = value;
	el.current = current;
	document.body.append(el);
	const changes: string[] = [];
	el.addEventListener('office-color-change', (event) =>
		changes.push((event as CustomEvent<OfficeColorChange>).detail.color),
	);
	const field = (name: string) =>
		el.shadowRoot!.querySelector<HTMLInputElement>(`[data-color-field="${name}"]`)!;
	const type = (name: string, text: string) => {
		field(name).value = text;
		field(name).dispatchEvent(new Event('input', { bubbles: true }));
	};
	const part = (selector: string) => el.shadowRoot!.querySelector<HTMLElement>(selector)!;
	const key = (target: Element, name: string, shiftKey = false) =>
		target.dispatchEvent(
			new KeyboardEvent('keydown', {
				key: name,
				shiftKey,
				bubbles: true,
				composed: true,
				cancelable: true,
			}),
		);
	return { el, changes, field, type, part, key };
}

describe('office-ui-color-custom', () => {
	it('shows the colour in every field, with the 0-255 hue, saturation and luminance', () => {
		const { el, field, part } = make();
		expect(el.getAttribute('role')).toBe('group');
		expect(field('hex').value).toBe('#FF0000');
		expect(['red', 'green', 'blue'].map((name) => field(name).value)).toEqual(['255', '0', '0']);
		expect(['hue', 'sat', 'lum'].map((name) => field(name).value)).toEqual(['0', '255', '128']);
		expect(part('[data-preview="new"]').getAttribute('style')).toContain('#ff0000');
		expect(part('[data-preview="current"]').getAttribute('style')).toContain('#00ff00');
		expect(part('.square').getAttribute('aria-label')).toBe('Hue and saturation');
		expect(part('.slider').getAttribute('aria-valuenow')).toBe('128');
		el.value = '#0000ff';
		expect(field('hex').value).toBe('#0000FF');
		expect(field('hue').value).toBe('170');
		// Not a colour: the value stays.
		el.value = 'blue';
		expect(el.value).toBe('#0000ff');
	});

	it('keeps hex, RGB and HSL in step and reports each change', () => {
		const { el, changes, field, type } = make();
		type('hex', '#123456');
		expect(el.value).toBe('#123456');
		expect(['red', 'green', 'blue'].map((name) => field(name).value)).toEqual(['18', '52', '86']);
		type('green', '200');
		expect(el.value).toBe('#12c856');
		type('lum', '255');
		expect(el.value).toBe('#ffffff');
		// White keeps the hue and saturation in use, so darkening returns to the colour.
		type('lum', '128');
		expect(el.value).not.toBe('#808080');
		expect(changes).toEqual(['#123456', '#12c856', '#ffffff', el.value]);
		// A half-typed hex is not a colour: nothing is reported and `valid` says so.
		type('hex', '#12ab');
		expect(el.valid).toBe(false);
		expect(field('hex').getAttribute('aria-invalid')).toBe('true');
		expect(changes).toHaveLength(4);
		type('red', '300');
		expect(field('red').getAttribute('aria-invalid')).toBe('true');
		type('red', '');
		expect(changes).toHaveLength(4);
		expect(el.valid).toBe(false);
		type('hex', '00ff00');
		expect(el.valid).toBe(true);
		expect(el.value).toBe('#00ff00');
	});

	it('moves through the square and the slider with the keyboard and the pointer', () => {
		const { el, changes, field, part, key } = make('#808080');
		const square = part('.square');
		const slider = part('.slider');
		const host = vi.fn();
		el.addEventListener('keydown', host);
		key(square, 'ArrowUp', true);
		expect(field('sat').value).toBe('10');
		key(square, 'ArrowRight');
		expect(field('hue').value).toBe('1');
		key(square, 'End');
		expect(field('hue').value).toBe('255');
		key(square, 'ArrowDown');
		expect(field('sat').value).toBe('9');
		key(slider, 'Home');
		expect(el.value).toBe('#000000');
		key(slider, 'End');
		expect(el.value).toBe('#ffffff');
		key(slider, 'ArrowDown', true);
		expect(field('lum').value).toBe('245');
		// Handled keys stay in the element; others go on to the host.
		expect(host).not.toHaveBeenCalled();
		key(square, 'Escape');
		expect(host).toHaveBeenCalledTimes(1);
		const count = changes.length;
		square.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100 }) as DOMRect;
		square.dispatchEvent(
			new MouseEvent('pointerdown', { clientX: 100, clientY: 0, bubbles: true, button: 0 }),
		);
		// Half way across is hue 180 of 360 (127 of 255); the top edge is full saturation.
		expect(field('hue').value).toBe('127');
		expect(field('sat').value).toBe('255');
		expect(changes.length).toBe(count + 1);
	});

	it('does nothing while disabled', () => {
		const { el, changes, type, part, key } = make();
		el.disabled = true;
		key(part('.slider'), 'Home');
		type('hex', '#000000');
		expect(part('.square').getAttribute('tabindex')).toBe('-1');
		expect(el.value).toBe('#ff0000');
		expect(changes).toEqual([]);
	});
});
