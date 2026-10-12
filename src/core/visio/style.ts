import { savedShapeGradient } from './saved-fill-gradient';
import { legacyFillGradient } from './legacy-fill-gradient';
import { cachedFillPattern } from './fill-pattern';
import { clampUnitInterval } from '../color/color-primitives';
import { themeLinearGradient } from './theme-gradient';
import { themeLineWeight, reportThemeEffects, themeSolidLinePattern } from './theme-line';
import { lineCap } from './line-style';
import { linePattern } from './line-pattern';
import { sourcePaint } from './source-paint';
import { shapeShadow } from './shadow';
import { shapeEffects } from './effects';
import { themeColor, type ThemeResources } from './theme-resolve';
import { textBackground } from './text-background';
import { characterExtras } from './text-character';
import { textFieldDisplay } from './text-field-display';
import type { VisioFieldContext } from './text-fields';
import { textParagraphs, type ParagraphMarker } from './paragraphs';
import { decodeVisioPlainText } from './plain-text';
import type { VisioStyle, VisioText, VisioTextField, VisioTextRun, VisioGeometry } from './model';
import { transform } from './geometry';
import { number, sectionRows, type Cells, type Report, type Sheet } from './sheet';

export interface Resources extends ThemeResources {
	colors: Map<string, string>;
	fonts: Map<string, string>;
	/** Page and document context for text fields, set per page by the parser. */
	fieldContext?: VisioFieldContext;
}
const PALETTE = [
	'#000000',
	'#ffffff',
	'#ff0000',
	'#00ff00',
	'#0000ff',
	'#ffff00',
	'#ff00ff',
	'#00ffff',
	'#800000',
	'#008000',
	'#000080',
	'#808000',
	'#800080',
	'#008080',
	'#c0c0c0',
	'#e6e6e6',
	'#cdcdcd',
	'#b3b3b3',
	'#9a9a9a',
	'#808080',
	'#666666',
	'#4d4d4d',
	'#333333',
	'#1a1a1a',
];
export function color(
	cells: Cells,
	name: string,
	fallback: string,
	resources: Resources,
	report: Report,
	themeCells: Cells = cells,
	gradientRendered = false,
): string {
	const value = cells.get(name)?.value;
	if (value === undefined) return fallback;
	if (/^#[0-9a-f]{6}$/i.test(value)) return value;
	if (/^\d+$/.test(value)) {
		const entry = resources.colors.get(value) ?? PALETTE[Number(value)];
		if (entry && /^#[0-9a-f]{6}$/i.test(entry)) return entry;
	}
	if (value === 'Themed') {
		const resolved = themeColor(themeCells, name, resources, report, gradientRendered);
		if (resolved) return resolved;
	}
	report('unsupported-color', `Cell ${name} uses an unresolved color; a default was used.`);
	return fallback;
}
const opacity = (value: number) => Math.max(0, Math.min(1, 1 - value));
export function shapeStyle(
	sheet: Sheet,
	resources: Resources,
	report: Report,
	width = number(sheet.cells, 'Width', 1),
	height = number(sheet.cells, 'Height', 1),
	geometry: readonly VisioGeometry[] = [],
): VisioStyle {
	const cells = sheet.cells,
		pattern = number(cells, 'FillPattern', 1, report);
	const savedGradient =
		pattern !== 0
			? savedShapeGradient(
					sheet,
					width,
					height,
					(stops) => color(stops, 'GradientStopColor', '', resources, report),
					report,
					geometry,
				)
			: undefined;
	const legacyGradient = savedGradient
		? undefined
		: legacyFillGradient(cells, width, height, (name) => color(cells, name, '', resources, report));
	const fillGradient =
		savedGradient ??
		legacyGradient ??
		(pattern === 1 ? themeLinearGradient(sheet, resources, width, height, report) : undefined);
	const fillPattern = fillGradient
		? undefined
		: cachedFillPattern(cells, (name) => color(cells, name, '', resources, report));
	const lineGradient =
		number(cells, 'LinePattern', 1) !== 0
			? savedShapeGradient(
					sheet,
					width,
					height,
					(stops) => color(stops, 'GradientStopColor', '', resources, report),
					report,
					geometry,
					'Line',
				)
			: undefined;
	if (fillGradient || lineGradient)
		report(
			'unverified-gradient-raster',
			"Gradient colors may differ from Microsoft Visio's native rendering.",
		);
	if (pattern > 1 && !fillGradient && !fillPattern)
		report(
			'unsupported-fill-pattern',
			`Fill pattern ${pattern} is approximated by its foreground color.`,
		);
	if (fillPattern && Math.abs(Math.sin(2 * number(cells, 'Angle', 0, report))) > 1e-10)
		report(
			'unverified-hatch-angle',
			'Native pixel equality for oblique hatch fills is not established.',
		);
	if (
		(!fillGradient && number(cells, 'FillGradientEnabled', 0, report)) ||
		(!lineGradient && number(cells, 'LineGradientEnabled', 0, report))
	)
		report(
			'unsupported-gradient',
			'Gradient fills and strokes are approximated with their foreground colors.',
		);
	if (lineGradient && (number(cells, 'BeginArrow', 0) || number(cells, 'EndArrow', 0)))
		report('unsupported-gradient-arrows', 'Arrow markers retain the solid line fallback color.');
	reportThemeEffects(cells, resources, report);
	const shadow = shapeShadow(
		cells,
		(name, fallback) => color(cells, name, fallback, resources, report),
		report,
	);
	const effects = shapeEffects(
		cells,
		(name, fallback) => color(cells, name, fallback, resources, report),
		report,
	);
	const cap = lineCap(cells, resources, report);
	// The geometry reader reports a bad value; here it is only shown to the user.
	const rounding = number(cells, 'Rounding', 0, () => {});
	return {
		fill:
			pattern === 0
				? 'none'
				: color(cells, 'FillForegnd', '#ffffff', resources, report, cells, !!fillGradient),
		...(fillGradient ? { fillGradient } : {}),
		...(fillPattern ? { fillPattern } : {}),
		...sourcePaint(cells, (name, fallback) => color(cells, name, fallback, resources, () => {})),
		lineColor: color(cells, 'LineColor', '#000000', resources, report),
		...(lineGradient ? { lineGradient } : {}),
		lineWidth:
			themeLineWeight(cells, resources, report) ??
			Math.max(0, number(cells, 'LineWeight', 0.01, report)),
		...(cap === undefined ? {} : { lineCap: cap }),
		...(themeSolidLinePattern(cells, resources) ?? linePattern(cells, report, cap)),
		// Saved and legacy stop transparencies already supply the fill opacity.
		fillOpacity:
			savedGradient || legacyGradient || fillPattern
				? 1
				: opacity(number(cells, 'FillForegndTrans', 0, report)),
		lineOpacity: lineGradient ? 1 : opacity(number(cells, 'LineColorTrans', 0, report)),
		startArrow: number(cells, 'BeginArrow', 0, report),
		endArrow: number(cells, 'EndArrow', 0, report),
		startArrowSize: number(cells, 'BeginArrowSize', 2, report),
		endArrowSize: number(cells, 'EndArrowSize', 2, report),
		...(rounding > 0 && rounding <= 100 ? { rounding } : {}),
		...(shadow ? { shadow } : {}),
		...effects,
	};
}
const literalFont = (value: string | undefined, resources: Resources): string | undefined =>
	(value
		? (resources.fonts.get(value) ??
			(!/^\d+$/.test(value) && value !== 'Themed' ? value.replace(/^"|"$/g, '') : undefined))
		: undefined) || undefined;
/**
 * A `Themed` font where no font theme is selected (FontSchemeIndex 0 on the shape, or inherited
 * from a page that has none) is the font of the verified No Style root, as for root paint
 * (MS-VSDX 2.4.4.58). Theme font schemes themselves are not resolved.
 */
function rootFont(themeCells: Cells, resources: Resources): string | undefined {
	const index = (cells: Cells | undefined) => {
		const value = cells?.get('FontSchemeIndex')?.value;
		return value !== undefined && /^\d+$/.test(value) ? Number(value) : undefined;
	};
	const local = index(themeCells);
	const selected =
		local !== undefined && local !== 65534 ? local : (index(resources.pageCells) ?? 0);
	if (selected !== 0 || !resources.rootSheet) return undefined;
	return literalFont(
		sectionRows(resources.rootSheet, 'Character')[0]?.cells.get('Font')?.value,
		resources,
	);
}
/** The family and whether it is a guess (a missing or unresolved font cell reads as Arial). */
function fontOf(
	cells: Cells,
	resources: Resources,
	themeCells: Cells,
): { family: string; assumed: boolean } {
	const value = cells.get('Font')?.value;
	const family =
		literalFont(value, resources) ??
		(value === 'Themed' ? rootFont(themeCells, resources) : undefined);
	return { family: family ?? 'Arial', assumed: !family };
}
const assumedFonts = new WeakSet<VisioText>();
/**
 * True when a font of this parsed text is a guess: its cell was missing, or themed by a font
 * scheme this parser does not resolve. Anything that needs real metrics must not use it.
 */
export const visioFontAssumed = (text: VisioText): boolean => assumedFonts.has(text);
function runStyle(
	cells: Cells,
	resources: Resources,
	report: Report,
	themeCells: Cells,
): Omit<VisioTextRun, 'text'> {
	const bits = number(cells, 'Style', 0, report);
	const transparency = clampUnitInterval(number(cells, 'ColorTrans', 0, report));
	return {
		fontFamily: fontOf(cells, resources, themeCells).family,
		fontSize: Math.max(0.001, number(cells, 'Size', 10 / 72, report)),
		color: color(cells, 'Color', '#000000', resources, report, themeCells),
		...(transparency > 0 ? { opacity: 1 - Math.round(transparency * 255) / 255 } : {}),
		bold: !!(bits & 1),
		italic: !!(bits & 2),
		underline: !!(bits & 4),
		strikethrough: number(cells, 'Strikethru', 0, report) !== 0,
		...characterExtras(cells, report),
	};
}
export function shapeText(
	sheet: Sheet,
	node: Element | undefined,
	width: number,
	height: number,
	resources: Resources,
	report: Report,
	consume: (length: number) => void,
	consumeParagraph: () => void,
): VisioText {
	const cells = sheet.cells;
	const characters = new Map(sectionRows(sheet, 'Character').map((row) => [row.index, row.cells]));
	const defaultCells =
		characters.get('0') ?? new Map<string, { value?: string; formula?: string }>();
	let currentCells = defaultCells;
	const runs: VisioTextRun[] = [];
	const paragraphMarkers: ParagraphMarker[] = [];
	const fields: VisioTextField[] = [];
	let textOffset = 0,
		terminalDirectText = false;
	const used = new Set<Cells>();
	const append = (text: string, direct = false) => {
		terminalDirectText = direct;
		if (text) {
			used.add(currentCells);
			consume(text.length);
			runs.push({ text, ...runStyle(currentCells, resources, report, cells) });
			textOffset += text.length;
		}
	};
	if (node && !number(cells, 'HideText', 0, report)) {
		for (const part of Array.from(node.childNodes)) {
			if (part.nodeType === 3 || part.nodeType === 4) {
				if (part.nodeValue) append(part.nodeValue, true);
			} else if (part.nodeType === 1) {
				const element = part as Element;
				if (element.localName === 'cp')
					currentCells = characters.get(element.getAttribute('IX') ?? '0') ?? defaultCells;
				else if (element.localName === 'pp')
					paragraphMarkers.push({ offset: textOffset, index: element.getAttribute('IX') ?? '0' });
				else if (element.localName === 'fld') {
					const field = textFieldDisplay(element, sheet, resources.fieldContext);
					fields.push({
						start: textOffset,
						end: textOffset + field.text.length,
						cached: field.cached,
						...(field.formula ? { formula: field.formula } : {}),
					});
					append(field.text);
				} else if (element.localName !== 'pp' && element.localName !== 'tp') {
					report(
						'unsupported-text-element',
						`Text element ${element.localName} is represented as plain text.`,
					);
					append(element.textContent ?? '');
				}
			}
		}
	}
	const paragraph = sectionRows(sheet, 'Paragraph')[0]?.cells ?? new Map();
	const alignment = number(paragraph, 'HorzAlign', 1, report);
	const textWidth = Math.max(0, number(cells, 'TxtWidth', width, report)),
		textHeight = Math.max(0, number(cells, 'TxtHeight', height, report));
	const vertical = number(cells, 'VerticalAlign', 1, report);
	const storedText = runs.map((r) => r.text).join('');
	const defaultRun = runStyle(defaultCells, resources, report, cells);
	const paragraphs = textParagraphs(
		storedText,
		paragraphMarkers,
		sheet,
		defaultRun.fontFamily,
		defaultRun.fontSize,
		resources,
		report,
		runs,
		consumeParagraph,
	);
	// Paragraph offsets use the stored final marker; logical runs exclude it.
	// A field's cached text is content, never a structural paragraph terminator.
	const lastRun = runs.at(-1);
	if (terminalDirectText && lastRun) lastRun.text = decodeVisioPlainText(lastRun.text);
	const plainText = runs.map((run) => run.text).join('');
	const result: VisioText = {
		plainText,
		...textBackground(cells, resources, report),
		paragraphs,
		runs,
		...(fields.length ? { fields } : {}),
		...runStyle(defaultCells, resources, report, cells),
		horizontalAlign:
			alignment === 1 ? 'center' : alignment === 2 ? 'right' : alignment === 3 ? 'justify' : 'left',
		verticalAlign: vertical === 0 ? 'top' : vertical === 2 ? 'bottom' : 'middle',
		width: textWidth,
		height: textHeight,
		transform: transform(
			number(cells, 'TxtPinX', width / 2, report),
			number(cells, 'TxtPinY', height / 2, report),
			number(cells, 'TxtLocPinX', textWidth / 2, report),
			number(cells, 'TxtLocPinY', textHeight / 2, report),
			number(cells, 'TxtAngle', 0, report),
		),
		margins: {
			left: number(cells, 'LeftMargin', 0.04, report),
			right: number(cells, 'RightMargin', 0.04, report),
			top: number(cells, 'TopMargin', 0.04, report),
			bottom: number(cells, 'BottomMargin', 0.04, report),
		},
	};
	if ([defaultCells, ...used].some((item) => fontOf(item, resources, cells).assumed))
		assumedFonts.add(result);
	return result;
}
