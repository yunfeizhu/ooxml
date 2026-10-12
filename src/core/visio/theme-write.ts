/**
 * Write a built-in theme as a Visio theme part: a DrawingML `a:theme` from the shared writer with
 * the Visio 2012 theme extensions the reader (`theme.ts`) and MS-VSDX 2.2.7.4 describe: scheme IDs,
 * the background colour, four variant colour schemes, the connector format scheme, font styles
 * and variant style schemes.
 * https://learn.microsoft.com/en-us/openspecs/sharepoint_protocols/ms-vsdx/cd5bb66b-7f2f-49b5-a630-9ae976bbdb26
 * The extension URIs are this project's own; Microsoft Visio acceptance of them is unverified.
 */
import { drawingThemeXml, THEME_COLOR_SLOTS, type DrawingTheme } from '../drawingml/index';
import { THEME_NS } from './theme-color';
import { visioThemeVariantColors, type VisioBuiltInTheme } from './theme-builtins';

const EXTENSIONS = {
	schemeId: '{B5B5C0A4-6F0E-4C61-9A43-1D2E5F6A7B01}',
	background: '{B5B5C0A4-6F0E-4C61-9A43-1D2E5F6A7B02}',
	variantColors: '{B5B5C0A4-6F0E-4C61-9A43-1D2E5F6A7B03}',
	formatId: '{B5B5C0A4-6F0E-4C61-9A43-1D2E5F6A7B04}',
	connectorId: '{B5B5C0A4-6F0E-4C61-9A43-1D2E5F6A7B05}',
	connectorScheme: '{B5B5C0A4-6F0E-4C61-9A43-1D2E5F6A7B06}',
	fontStyles: '{B5B5C0A4-6F0E-4C61-9A43-1D2E5F6A7B07}',
	variantStyles: '{B5B5C0A4-6F0E-4C61-9A43-1D2E5F6A7B08}',
} as const;

const placeholder = (transform = '') => `<a:schemeClr val="phClr">${transform}</a:schemeClr>`;
const solid = (color: string) => `<a:solidFill>${color}</a:solidFill>`;
/** Matrices 1-3 tint toward white, 4 is the colour, 5-6 shade it, as the theme-less fallback. */
const FILLS = [
	solid('<a:schemeClr val="lt1"/>'),
	solid(placeholder('<a:tint val="20000"/>')),
	solid(placeholder('<a:tint val="40000"/>')),
	solid(placeholder()),
	solid(placeholder('<a:shade val="75000"/>')),
	solid(placeholder('<a:shade val="50000"/>')),
];
const LINE_COLORS = [
	placeholder(),
	placeholder(),
	placeholder(),
	placeholder('<a:shade val="75000"/>'),
	placeholder('<a:shade val="50000"/>'),
	placeholder('<a:shade val="50000"/>'),
];
const lines = (widths: readonly number[]) =>
	LINE_COLORS.map(
		(color, index) =>
			`<a:ln w="${Math.round(widths[index]! * 12700)}" cap="flat" cmpd="sng" algn="ctr">${solid(color)}<a:prstDash val="solid"/><a:round/></a:ln>`,
	).join('');
const lists = (source: VisioBuiltInTheme) =>
	`<a:fillStyleLst>${FILLS.join('')}</a:fillStyleLst><a:lnStyleLst>${lines(source.lineWidths)}</a:lnStyleLst>` +
	`<a:effectStyleLst>${'<a:effectStyle><a:effectLst/></a:effectStyle>'.repeat(6)}</a:effectStyleLst>`;
const fontProps = () =>
	[1, 2, 3, 4, 5, 6]
		.map(
			(matrix) =>
				`<vt:fontProps><vt:color><a:schemeClr val="${matrix < 4 ? 'dk1' : 'lt1'}"/></vt:color></vt:fontProps>`,
		)
		.join('');
const srgb = (value: string) => `<a:srgbClr val="${value}"/>`;

/** The complete theme part XML for one built-in theme. */
export function visioThemeXml(source: VisioBuiltInTheme): string {
	const colors: DrawingTheme['colorScheme']['colors'] = {};
	THEME_COLOR_SLOTS.forEach((slot, index) => {
		colors[slot] = { kind: 'srgb', value: source.colors[index]!, transforms: [] };
	});
	const theme: DrawingTheme = {
		name: source.name,
		colorScheme: { name: source.name, colors },
		fontScheme: {
			name: source.name,
			major: { latin: source.fonts.major, eastAsia: '', complexScript: '', scripts: {} },
			minor: { latin: source.fonts.minor, eastAsia: '', complexScript: '', scripts: {} },
		},
	};
	const id = `<vt:schemeID schemeEnum="${source.schemeId}"/>`;
	const variants = [0, 1, 2, 3]
		.map(
			(variant) =>
				`<vt:variationClrScheme>${visioThemeVariantColors(source, variant)
					.map(
						(color, index) => `<vt:varColor${index + 1}>${srgb(color)}</vt:varColor${index + 1}>`,
					)
					.join('')}</vt:variationClrScheme>`,
		)
		.join('');
	const styles = [0, 1, 2, 3]
		.map(
			() =>
				`<vt:variationStyleScheme>${[1, 2, 4, 6]
					.map(
						(matrix) =>
							`<vt:varStyle fillIdx="${matrix}" lineIdx="${matrix}" effectIdx="${matrix}" fontIdx="${matrix}"/>`,
					)
					.join('')}</vt:variationStyleScheme>`,
		)
		.join('');
	return drawingThemeXml(theme, {
		namespaces: { vt: THEME_NS },
		formatScheme: `<a:fmtScheme name="${source.name}">${lists(source)}<a:bgFillStyleLst>${solid(placeholder()).repeat(3)}</a:bgFillStyleLst></a:fmtScheme>`,
		colorSchemeExtensions: {
			[EXTENSIONS.schemeId]: id,
			[EXTENSIONS.background]: `<vt:bkgnd>${srgb(source.colors[1]!)}</vt:bkgnd>`,
			[EXTENSIONS.variantColors]: `<vt:variationClrSchemeLst>${variants}</vt:variationClrSchemeLst>`,
		},
		themeElementsExtensions: {
			[EXTENSIONS.formatId]: `<vt:fmtSchemeEx>${id}</vt:fmtSchemeEx>`,
			[EXTENSIONS.connectorId]: `<vt:fmtConnectorSchemeEx>${id}</vt:fmtConnectorSchemeEx>`,
			[EXTENSIONS.connectorScheme]: `<vt:fmtConnectorScheme name="${source.name}">${lists(source)}</vt:fmtConnectorScheme>`,
			[EXTENSIONS.fontStyles]: `<vt:fontStylesGroup><vt:connectorFontStyles>${fontProps()}</vt:connectorFontStyles><vt:fontStyles>${fontProps()}</vt:fontStyles></vt:fontStylesGroup>`,
			[EXTENSIONS.variantStyles]: `<vt:variationStyleSchemeLst>${styles}</vt:variationStyleSchemeLst>`,
		},
	});
}
