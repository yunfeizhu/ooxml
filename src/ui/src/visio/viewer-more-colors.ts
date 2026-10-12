import { normalizePaletteHex } from 'ooxml-core/color';
import type { OfficeUiColorCustom } from '../controls';
import { ViewerDialog } from './viewer-dialog';

/**
 * Office's More Colors dialog, Custom tab, on the shared `office-ui-color-custom`: the hue and
 * saturation square, the luminance slider, Hex, RGB and HSL fields and the New and Current
 * swatches. OK hands the colour (`#rrggbb`) to the caller.
 */
export class ViewerMoreColors {
	readonly dialog: ViewerDialog;
	readonly picker: OfficeUiColorCustom;
	#pick: ((color: string) => void) | undefined;
	constructor(root: ShadowRoot) {
		this.dialog = new ViewerDialog(
			root,
			'more-colors-dialog',
			'Colors',
			['OK', 'Cancel'],
			(name) => (name === 'OK' ? this.#accept() : this.dialog.close()),
		);
		this.picker = root.ownerDocument.createElement('office-ui-color-custom') as OfficeUiColorCustom;
		this.dialog.body.append(this.picker);
		this.picker.addEventListener('office-color-change', () => {
			this.dialog.error.textContent = '';
		});
		// Typing stays in the fields; Enter accepts, as in Office's dialog.
		this.dialog.dialog.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') {
				event.preventDefault();
				this.#accept();
			}
			if (event.key !== 'Escape' && event.key !== 'Tab') event.stopPropagation();
		});
	}
	/** Opens on `current` (`#rrggbb`; black when it is not a colour) and reports the choice. */
	open(current: string | undefined, pick: (color: string) => void): void {
		const start = normalizePaletteHex(current ?? '') ?? '#000000';
		this.#pick = pick;
		this.picker.current = start;
		// Black first, so reopening on the same colour still resets a half-typed hex.
		this.picker.value = start === '#000000' ? '#ffffff' : '#000000';
		this.picker.value = start;
		this.dialog.show();
		const hex = this.picker.shadowRoot?.querySelector<HTMLInputElement>('[data-color-field="hex"]');
		hex?.focus();
		hex?.select();
	}
	close(): void {
		this.#pick = undefined;
		this.dialog.close();
	}
	#accept(): void {
		if (!this.picker.valid) {
			this.dialog.error.textContent =
				'Enter the colour as #RRGGBB, or Red, Green and Blue from 0 to 255.';
			return;
		}
		const color = this.picker.value;
		const pick = this.#pick;
		this.close();
		pick?.(color);
	}
}
