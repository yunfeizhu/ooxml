import { html } from 'lit';
import { OfficeElement, controlStyles, flag } from '../base';
import { definer, emit, present } from '../registry';
import css from './symbol-picker.css?raw';

/** Common symbols, in the spirit of Office's Symbol gallery. Language-neutral glyphs only. */
export const OFFICE_SYMBOLS: readonly string[] = [
	'©',
	'®',
	'™',
	'§',
	'¶',
	'†',
	'‡',
	'•',
	'…',
	'–',
	'°',
	'±',
	'×',
	'÷',
	'≠',
	'≤',
	'≥',
	'≈',
	'∞',
	'√',
	'∑',
	'π',
	'Ω',
	'µ',
	'€',
	'£',
	'¥',
	'¢',
	'←',
	'→',
	'↑',
	'↓',
	'↔',
	'⇒',
	'✓',
	'✗',
	'★',
	'☆',
	'●',
	'○',
	'■',
	'□',
	'▲',
	'▼',
	'◆',
	'♥',
	'☺',
	'½',
];

/** A typed code point (`00A9`, `U+00A9`) as its character; undefined when not printable text. */
export function parseOfficeSymbolCode(text: string): string | undefined {
	const match = /^\s*(?:u\+|0x)?([0-9a-f]{1,6})\s*$/i.exec(text);
	if (!match) return undefined;
	const code = parseInt(match[1]!, 16);
	if (
		code < 0x20 ||
		(code >= 0x7f && code <= 0x9f) ||
		(code >= 0xd800 && code <= 0xdfff) ||
		(code & 0xfffe) === 0xfffe ||
		(code >= 0xfdd0 && code <= 0xfdef) ||
		code > 0x10ffff
	)
		return undefined;
	return String.fromCodePoint(code);
}
const codeOf = (symbol: string) =>
	`U+${symbol.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`;

/**
 * `<office-ui-symbol-picker>`: a grid of common symbols plus a character-code field, as in
 * Office's Insert > Symbol. `symbols` replaces the grid (default `OFFICE_SYMBOLS`), `label` names
 * the group, `disabled` disables everything. Choosing a symbol or inserting a valid code emits
 * `office-symbol-pick` with `{ symbol, code }` (`code` is `U+XXXX`). Document text is never touched.
 */
export class OfficeUiSymbolPicker extends OfficeElement {
	static override styles = controlStyles(css);
	static override properties = {
		symbols: { attribute: false },
		label: { type: String },
		disabled: flag,
		code: { state: true },
	};
	declare symbols: readonly string[];
	declare label: string | null;
	declare disabled: boolean;
	declare code: string;

	constructor() {
		super();
		this.symbols = OFFICE_SYMBOLS;
		this.label = null;
		this.disabled = false;
		this.code = '';
	}

	private pick(symbol: string): void {
		if (present(this.disabled)) return;
		emit(this, 'office-symbol-pick', { symbol, code: codeOf(symbol) });
	}

	private onCode(event: Event): void {
		event.stopPropagation();
		this.code = (event.target as HTMLInputElement).value;
	}

	private insertCode(): void {
		const symbol = parseOfficeSymbolCode(this.code);
		if (symbol) this.pick(symbol);
	}

	protected override willUpdate(): void {
		this.setAttribute('role', 'group');
		this.setAttribute('aria-label', this.label ?? 'Symbols');
	}

	protected override render() {
		const disabled = present(this.disabled);
		const typed = parseOfficeSymbolCode(this.code);
		return html`<div class="grid" part="grid"
				>${(this.symbols ?? []).map(
					(symbol) =>
						html`<button
							type="button"
							class="symbol"
							title=${`${symbol} ${codeOf(symbol)}`}
							aria-label=${`${symbol} ${codeOf(symbol)}`}
							?disabled=${disabled}
							@click=${() => this.pick(symbol)}
							>${symbol}</button
						>`,
				)}</div
			><div class="code" part="code"
				><label
					>Character code<input
						type="text"
						spellcheck="false"
						maxlength="8"
						placeholder="00A9"
						.value=${this.code}
						?disabled=${disabled}
						@input=${this.onCode}
						@keydown=${(event: KeyboardEvent) => {
							if (event.key !== 'Enter') return;
							event.preventDefault();
							this.insertCode();
						}} /></label
				><span class="preview" aria-live="polite">${typed ?? ''}</span
				><button
					type="button"
					class="insert"
					?disabled=${disabled || !typed}
					@click=${() => this.insertCode()}
					>Insert</button
				></div
			>`;
	}
}

export const defineSymbolPicker = definer('office-ui-symbol-picker', () => OfficeUiSymbolPicker);
