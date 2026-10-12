import { html, nothing } from 'lit';
import {
	OFFICE_STANDARD_COLORS,
	buildThemePalette,
	normalizePaletteHex,
	type ThemePaletteSwatch,
	type ThemePaletteVariant,
} from 'ooxml-core/color';
import { OfficeElement, controlStyles, flag } from '../base';
import { definer, emit, present } from '../registry';
import css from './color-grid.css?raw';

/** Where a picked colour came from. */
export type OfficeColorSource = 'theme' | 'extra' | 'standard' | 'recent' | 'none' | 'automatic';
/** Detail of `office-color-pick`: `color` is `#rrggbb`, `'none'` or `'automatic'`. */
export interface OfficeColorPick {
	color: string;
	source: OfficeColorSource;
	label: string;
	/** For a Theme Colors swatch: its column (0-9) and, below the base row, its variant. */
	theme?: { column: number; variant?: ThemePaletteVariant };
	/** For a swatch of the `extraColors` row: its position. */
	index?: number;
}
export type OfficeColorPickEvent = CustomEvent<OfficeColorPick>;

const COLUMNS = 10;

/**
 * `<office-ui-color-grid>`: Office's colour picker body. From the top: an optional `automatic-label`
 * command (Automatic) and `none-label` command (No Fill, No Line), "Theme Colors" (ten columns, a
 * base colour over its five lighter and darker variants, built from `themeColors`), "Standard
 * Colors" (preceded by the `extraColors` row when a product has one, such as Visio's variant
 * colours), "Recent Colors" when `recentColors` has any, and an optional `more-label` command (More
 * Colors...). `value` (`#rrggbb`, `'none'` or `'automatic'`) marks the current choice.
 *
 * `themeNames` renames the ten columns and `variantLabel` names their variants (for a translated
 * product). Choosing emits `office-color-pick`
 * `{ color, source, label, theme?, index? }` (a theme swatch reports its column and variant, so a
 * product can save a theme reference instead of the colour); the More Colors command emits
 * `office-color-more`. Arrow keys move through the swatches and commands, Home and End jump to
 * the ends; ArrowUp on the first row and ArrowDown on the last are left for a host menu. The
 * element is only the grid: a product puts it in its own menu, popup or pane.
 */
export class OfficeUiColorGrid extends OfficeElement {
	static override styles = controlStyles(css);
	static override properties = {
		themeColors: { attribute: false },
		themeNames: { attribute: false },
		variantLabel: { attribute: false },
		extraColors: { attribute: false },
		standardColors: { attribute: false },
		recentColors: { attribute: false },
		value: { type: String },
		label: { type: String },
		noneLabel: { attribute: 'none-label', type: String },
		automaticLabel: { attribute: 'automatic-label', type: String },
		moreLabel: { attribute: 'more-label', type: String },
		themeHeading: { attribute: 'theme-heading', type: String },
		standardHeading: { attribute: 'standard-heading', type: String },
		recentHeading: { attribute: 'recent-heading', type: String },
		disabled: flag,
	};
	/** Ten base colours in Office's order (Background 1, Text 1, Background 2, Text 2, Accent 1-6). */
	declare themeColors: readonly (string | undefined)[] | null;
	/** Names of the ten columns, when they are not Office's. */
	declare themeNames: readonly string[] | null;
	/** Names a variant swatch (a translated "Accent 1, Lighter 80%"); English when unset. */
	declare variantLabel: ((column: string, variant: ThemePaletteVariant) => string) | null;
	/** One more row of theme-bound swatches under the variants. */
	declare extraColors: readonly ThemePaletteSwatch[];
	declare standardColors: readonly ThemePaletteSwatch[];
	declare recentColors: readonly string[];
	declare value: string | null;
	declare label: string | null;
	declare noneLabel: string | null;
	declare automaticLabel: string | null;
	declare moreLabel: string | null;
	declare themeHeading: string;
	declare standardHeading: string;
	declare recentHeading: string;
	declare disabled: boolean;

	constructor() {
		super();
		this.themeColors = null;
		this.themeNames = null;
		this.variantLabel = null;
		this.extraColors = [];
		this.standardColors = OFFICE_STANDARD_COLORS;
		this.recentColors = [];
		this.value = null;
		this.label = null;
		this.noneLabel = null;
		this.automaticLabel = null;
		this.moreLabel = null;
		this.themeHeading = 'Theme Colors';
		this.standardHeading = 'Standard Colors';
		this.recentHeading = 'Recent Colors';
		this.disabled = false;
	}

	/** Focus the current choice, or the first item. */
	override focus(options?: FocusOptions): void {
		const items = this.items();
		(items.find((item) => item.getAttribute('aria-checked') === 'true') ?? items[0])?.focus(
			options,
		);
	}

	private items(): HTMLButtonElement[] {
		return [...this.renderRoot.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
	}

	private pick(
		color: string,
		source: OfficeColorSource,
		label: string,
		more: Pick<OfficeColorPick, 'theme' | 'index'> = {},
	): void {
		if (present(this.disabled)) return;
		emit(this, 'office-color-pick', { color, source, label, ...more } satisfies OfficeColorPick);
	}

	private more(): void {
		if (!present(this.disabled)) emit(this, 'office-color-more', {});
	}

	private onKey(event: KeyboardEvent): void {
		const items = this.items();
		const current = items.indexOf(event.target as HTMLButtonElement);
		if (current < 0) return;
		const at = (item: HTMLButtonElement) => ({
			row: Number(item.dataset.row),
			column: Number(item.dataset.column),
		});
		const from = at(items[current]!);
		const inRow = (row: number) => items.filter((item) => at(item).row === row);
		const rows = [...new Set(items.map((item) => at(item).row))];
		const vertical = (step: 1 | -1) => {
			const target = rows[rows.indexOf(from.row) + step];
			if (target === undefined) return undefined;
			// The nearest column: a command row has one item, a swatch row ten.
			return inRow(target).reduce((best, item) =>
				Math.abs(at(item).column - from.column) < Math.abs(at(best).column - from.column)
					? item
					: best,
			);
		};
		const next =
			event.key === 'ArrowRight'
				? items[current + 1]
				: event.key === 'ArrowLeft'
					? items[current - 1]
					: event.key === 'ArrowDown'
						? vertical(1)
						: event.key === 'ArrowUp'
							? vertical(-1)
							: event.key === 'Home'
								? items[0]
								: event.key === 'End'
									? items.at(-1)
									: undefined;
		if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key))
			return;
		// Past the top or bottom row the key belongs to a host menu, which moves on to its next item.
		if (!next && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) return;
		// Otherwise a host menu must not also move its own focus.
		event.preventDefault();
		event.stopPropagation();
		next?.focus();
	}

	protected override willUpdate(): void {
		this.setAttribute('role', 'group');
		this.setAttribute('aria-label', this.label ?? 'Colors');
	}

	protected override render() {
		const disabled = present(this.disabled);
		const value = this.value ? (normalizePaletteHex(this.value) ?? this.value) : null;
		let row = 0;
		const command = (text: string, name: string, checked: boolean | undefined, run: () => void) =>
			html`<button
				type="button"
				class="command"
				data-command=${name}
				data-row=${row++}
				data-column="0"
				role=${checked === undefined ? 'button' : 'menuitemradio'}
				aria-checked=${checked === undefined ? nothing : String(checked)}
				?disabled=${disabled}
				@click=${run}
				>${text}</button
			>`;
		const swatch = (item: ThemePaletteSwatch, source: OfficeColorSource, column: number) =>
			html`<button
				type="button"
				class="swatch"
				role="menuitemradio"
				data-color=${item.hex}
				data-source=${source}
				data-row=${row}
				data-column=${column}
				title=${item.label}
				aria-label=${item.label}
				aria-checked=${String(value === item.hex)}
				style=${`--swatch:${item.hex}`}
				?disabled=${disabled}
				@click=${() =>
					this.pick(
						item.hex,
						source,
						item.label,
						source === 'theme'
							? { theme: { column, ...(item.variant ? { variant: item.variant } : {}) } }
							: source === 'extra'
								? { index: column }
								: {},
					)}
			></button>`;
		const cells = (items: readonly ThemePaletteSwatch[], source: OfficeColorSource) => {
			const result = html`<div class="cells" data-cells=${source}
				>${items.map((item, index) => swatch(item, source, index))}</div
			>`;
			row++;
			return result;
		};
		const palette = buildThemePalette(this.themeColors ?? undefined, this.themeNames ?? undefined);
		const extra = (this.extraColors ?? []).slice(0, COLUMNS);
		const name = this.variantLabel;
		const variants = (index: number) =>
			palette.map((column) => {
				const item = column.variants[index]!;
				return name ? { ...item, label: name(column.name, item.variant!) } : item;
			});
		const recent = (this.recentColors ?? [])
			.map((hex) => normalizePaletteHex(hex))
			.filter((hex): hex is string => !!hex)
			.slice(0, COLUMNS)
			.map((hex) => ({ hex, label: hex.toUpperCase() }));
		const automatic = this.automaticLabel;
		const none = this.noneLabel;
		const more = this.moreLabel;
		return html`<div class="grid" part="grid" @keydown=${this.onKey}
			>${
				automatic
					? command(automatic, 'automatic', value === 'automatic', () =>
							this.pick('automatic', 'automatic', automatic),
						)
					: nothing
			}${
				none
					? command(none, 'none', value === 'none', () => this.pick('none', 'none', none))
					: nothing
			}
			<div class="heading">${this.themeHeading}</div>
			${cells(
				palette.map((column) => column.base),
				'theme',
			)}
			<div class="variants">${[0, 1, 2, 3, 4].map((index) => cells(variants(index), 'theme'))}</div>
			${extra.length ? cells(extra, 'extra') : nothing}
			<div class="heading">${this.standardHeading}</div>
			${cells(this.standardColors ?? OFFICE_STANDARD_COLORS, 'standard')}
			${
				recent.length
					? html`<div class="heading">${this.recentHeading}</div> ${cells(recent, 'recent')}`
					: nothing
			}
			${more ? command(more, 'more', undefined, () => this.more()) : nothing}</div
		>`;
	}
}

export const defineColorGrid = definer('office-ui-color-grid', () => OfficeUiColorGrid);
