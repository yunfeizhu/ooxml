/**
 * Built-in Design > Themes for Visio drawings, as data. Every theme here is original to this
 * project except Office, whose six accents are the Office fallback colours Quick Styles already
 * use when a drawing has no theme. Each theme is written as one DrawingML theme part with Visio's
 * extensions (`theme-write.ts`) and selected per page through the page's scheme index cells.
 */

export const VISIO_BUILT_IN_THEME_IDS = [
	'office',
	'slate',
	'harbor',
	'grove',
	'ember',
	'graphite',
] as const;
export type VisioBuiltInThemeId = (typeof VISIO_BUILT_IN_THEME_IDS)[number];
export const isVisioBuiltInThemeId = (value: unknown): value is VisioBuiltInThemeId =>
	(VISIO_BUILT_IN_THEME_IDS as readonly unknown[]).includes(value);

export interface VisioBuiltInTheme {
	id: VisioBuiltInThemeId;
	name: string;
	/**
	 * Colour, effect, connector and font scheme ID written to the part and the page. Visio's own
	 * themes use IDs this project does not know; these sit in a private range above them.
	 */
	schemeId: number;
	/** dk1, lt1, dk2, lt2, accent1-6, hlink, folHlink as six hexadecimal digits. */
	colors: readonly string[];
	/** Major (headings) and minor (body) Latin typefaces. */
	fonts: { major: string; minor: string };
	/** Theme line widths in points for style matrices 1-6. */
	lineWidths: readonly number[];
}

const theme = (
	id: VisioBuiltInThemeId,
	name: string,
	index: number,
	colors: string,
	fonts: [string, string],
	lineWidths: readonly number[],
): VisioBuiltInTheme => ({
	id,
	name,
	schemeId: 1000 + index,
	colors: colors.split(' '),
	fonts: { major: fonts[0], minor: fonts[1] },
	lineWidths,
});
const THIN = [0.75, 0.75, 0.75, 1, 1.5, 2.25];
const BOLD = [1, 1.5, 1.5, 2.25, 3, 4.5];

export const VISIO_BUILT_IN_THEMES: readonly VisioBuiltInTheme[] = [
	theme(
		'office',
		'Office',
		0,
		'000000 FFFFFF 44546A E7E6E6 5B9BD5 ED7D31 A5A5A5 FFC000 4472C4 70AD47 0563C1 954F72',
		['Calibri Light', 'Calibri'],
		THIN,
	),
	theme(
		'slate',
		'Slate',
		1,
		'1F2933 FFFFFF 3E4C59 E4E7EB 52606D 7B93A8 9AA5B1 3F7CAC C97B63 6C9A8B 2B6CB0 7A5C99',
		['Segoe UI Semibold', 'Segoe UI'],
		THIN,
	),
	theme(
		'harbor',
		'Harbor',
		2,
		'102A43 FFFFFF 243B53 D9E2EC 1F78B4 33A1C9 2CB1A1 7FC97F F4A259 5C6BC0 0B69A3 6A4C93',
		['Georgia', 'Trebuchet MS'],
		BOLD,
	),
	theme(
		'grove',
		'Grove',
		3,
		'1B2A1E FFFFFF 2F4B35 E8F0E3 3E7C4F 8BAF4E C9A227 6E8B74 A35D3D 4F8A8B 2E7D32 7B6D3A',
		['Cambria', 'Calibri'],
		THIN,
	),
	theme(
		'ember',
		'Ember',
		4,
		'2B1A16 FFFFFF 5A2E22 F6E7DF D9480F E8890C C2255C F2C14E 7D5BA6 3D8C95 B83A16 8A4F7D',
		['Franklin Gothic Medium', 'Franklin Gothic Book'],
		BOLD,
	),
	theme(
		'graphite',
		'Graphite',
		5,
		'202020 FFFFFF 404040 EDEDED 595959 7F7F7F A6A6A6 2F5597 C55A11 548235 1F4E79 7030A0',
		['Arial', 'Arial'],
		THIN,
	),
];

export function visioBuiltInTheme(id: VisioBuiltInThemeId): VisioBuiltInTheme {
	return VISIO_BUILT_IN_THEMES.find((entry) => entry.id === id)!;
}

/** A theme's four colour variants: variant `v` starts its seven variant colours at accent `v + 1`. */
export function visioThemeVariantColors(source: VisioBuiltInTheme, variant: number): string[] {
	const accents = source.colors.slice(4, 10);
	return [
		...Array.from({ length: 6 }, (_, index) => accents[(index + variant) % 6]!),
		source.colors[2]!,
	];
}
