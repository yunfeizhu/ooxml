import type { AppProperties, CoreProperties, CustomProperty } from '../opc/properties/types';
import type { DiagramDrawing, DiagramIssue } from '../diagram/types';
import type { CellAddress, CellRange } from './address';
import type {
	ChartSummary,
	ChartSummarySeries,
	ChartSummaryType,
	ChartThemePalette,
} from '../chart/render/summary';

/** Excel error values. */
export const ERROR_CODES = [
	'#NULL!',
	'#DIV/0!',
	'#VALUE!',
	'#REF!',
	'#NAME?',
	'#NUM!',
	'#N/A',
	'#GETTING_DATA',
	'#SPILL!',
	'#CALC!',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** An error cell value (`#DIV/0!`, `#N/A`, ...). */
export interface CellError {
	readonly error: ErrorCode;
}

export const isErrorCode = (value: string): value is ErrorCode =>
	(ERROR_CODES as readonly string[]).includes(value);
export const cellError = (error: ErrorCode): CellError => ({ error });
export const isCellError = (value: unknown): value is CellError =>
	typeof value === 'object' && value !== null && 'error' in value;

/**
 * A cell's value. Dates are numbers (serial days since the workbook epoch) whose style carries a
 * date number format, exactly as SpreadsheetML stores them.
 */
export type CellValue = number | string | boolean | CellError | null;

/** A colour as SpreadsheetML records it: explicit ARGB, a theme slot with tint, or a legacy index. */
export interface Color {
	/** `AARRGGBB` or `RRGGBB`, upper case. */
	rgb?: string;
	/** Theme colour slot (0 lt1/bg1, 1 dk1/tx1, 2 lt2, 3 dk2, 4-9 accent1-6, 10 hlink, 11 folHlink). */
	theme?: number;
	/** -1 (darker) to 1 (lighter). */
	tint?: number;
	/** Legacy palette index (64 is system foreground, 65 system background). */
	indexed?: number;
	/** `auto` colour (the system default). */
	auto?: boolean;
}

export type UnderlineStyle = 'single' | 'double' | 'singleAccounting' | 'doubleAccounting';

export interface Font {
	name?: string;
	/** Points. */
	size?: number;
	bold?: boolean;
	italic?: boolean;
	underline?: UnderlineStyle;
	strike?: boolean;
	color?: Color;
	vertAlign?: 'superscript' | 'subscript';
	/** Font family class (`2` swiss, ...), kept for round trip. */
	family?: number;
	scheme?: 'major' | 'minor';
}

export type PatternType =
	| 'none'
	| 'solid'
	| 'gray125'
	| 'gray0625'
	| 'darkGray'
	| 'mediumGray'
	| 'lightGray'
	| 'darkHorizontal'
	| 'darkVertical'
	| 'darkDown'
	| 'darkUp'
	| 'darkGrid'
	| 'darkTrellis'
	| 'lightHorizontal'
	| 'lightVertical'
	| 'lightDown'
	| 'lightUp'
	| 'lightGrid'
	| 'lightTrellis';

export interface GradientStop {
	position: number;
	color: Color;
}

export type Fill =
	| { type: 'pattern'; pattern: PatternType; fgColor?: Color; bgColor?: Color }
	| {
			type: 'gradient';
			gradient: 'linear' | 'path';
			degree?: number;
			stops: GradientStop[];
	  };

export type BorderStyle =
	| 'thin'
	| 'medium'
	| 'thick'
	| 'dashed'
	| 'dotted'
	| 'double'
	| 'hair'
	| 'mediumDashed'
	| 'dashDot'
	| 'mediumDashDot'
	| 'dashDotDot'
	| 'mediumDashDotDot'
	| 'slantDashDot';

export interface BorderEdge {
	style: BorderStyle;
	color?: Color;
}

export interface Border {
	left?: BorderEdge;
	right?: BorderEdge;
	top?: BorderEdge;
	bottom?: BorderEdge;
	diagonal?: BorderEdge;
	diagonalUp?: boolean;
	diagonalDown?: boolean;
}

export type HorizontalAlignment =
	| 'general'
	| 'left'
	| 'center'
	| 'right'
	| 'fill'
	| 'justify'
	| 'centerContinuous'
	| 'distributed';
export type VerticalAlignment = 'top' | 'center' | 'bottom' | 'justify' | 'distributed';

export interface Alignment {
	horizontal?: HorizontalAlignment;
	vertical?: VerticalAlignment;
	wrapText?: boolean;
	shrinkToFit?: boolean;
	indent?: number;
	/** 0-90 counter-clockwise, 91-180 clockwise (90 + n), 255 vertical stacked text. */
	textRotation?: number;
	readingOrder?: number;
}

export interface Protection {
	locked?: boolean;
	hidden?: boolean;
}

/**
 * A fully resolved cell format (one `cellXfs` entry with its font, fill, border and number
 * format inlined). Style 0 of every workbook is the default format. Formats are immutable: an
 * edit creates or reuses another entry through {@link StyleTable}.
 */
export interface CellStyle {
	font: Font;
	fill: Fill;
	border: Border;
	/** The number format code (`General`, `0.00`, `m/d/yyyy`, ...). */
	numFmt: string;
	alignment?: Alignment;
	protection?: Protection;
	/** Name of the cell style (`Normal`, `Heading 1`) this format derives from, if any. */
	cellStyleName?: string;
	/** Text typed with a leading apostrophe (`quotePrefix`): shown and edited as text. */
	quotePrefix?: true;
	/** The cell shows a pivot table field drop-down (`pivotButton`). */
	pivotButton?: true;
}

/** A run of rich text in a cell (`<r>` in a shared string). */
export interface RichTextRun {
	text: string;
	font?: Font;
}

export interface Cell {
	value: CellValue;
	/** The formula without its leading `=`, as written in `<f>`. */
	formula?: string;
	/** Array formula range (`<f t="array" ref="...">`), when this cell anchors one. */
	arrayRange?: CellRange;
	/** Index into {@link Workbook.styles}; absent means style 0. */
	styleId?: number;
	/** Rich text runs for a string value with mixed formatting. */
	richText?: RichTextRun[];
	/**
	 * The formula was stored as an Excel dynamic-array formula (`cm` pointing at `XLDAPR`
	 * cell metadata with `fDynamic`). Informational: formulas without {@link legacyFormula}
	 * are always evaluated with dynamic-array semantics, and the writer stores any formula that
	 * spills (or needs array evaluation) as a dynamic array whether or not this flag is set.
	 */
	dynamicArray?: true;
	/**
	 * The formula came from a file without dynamic-array metadata, so it uses pre-dynamic-array
	 * semantics: a range or array where one value is expected is reduced by implicit
	 * intersection (Excel shows these formulas with `@`) and the result never spills. The
	 * readers set it on plain formulas they load (not on CSE array formulas, which keep
	 * {@link arrayRange}); formulas typed in an edit session do not have it and are dynamic.
	 * Copying, filling and moving a cell keep the flag.
	 */
	legacyFormula?: true;
	/**
	 * One-based `vm` index into the source `xl/metadata.xml` value metadata (rich values: data
	 * types, pictures in cells, rich `#SPILL!`/`#CALC!` errors). Written back only while the cell
	 * still holds an error value (Excel stores those cells as `#VALUE!`) and the source metadata
	 * part is kept; a typed value drops it.
	 */
	valueMetadata?: number;
	/** One-based `cm` index of source cell metadata other than the dynamic-array marker. */
	cellMetadata?: number;
}

export interface RowInfo {
	/** Points. */
	height?: number;
	customHeight?: boolean;
	hidden?: boolean;
	/** Hidden by the active auto-filter, even if a later value edit would match its criteria. */
	filteredOut?: boolean;
	/** Manual hiding to restore when a row hidden for both reasons passes the filter again. */
	manuallyHidden?: boolean;
	styleId?: number;
	outlineLevel?: number;
	collapsed?: boolean;
}

export interface ColumnInfo {
	/** Zero-based first and last column this entry covers. */
	min: number;
	max: number;
	/** Width in characters of the default font's maximum digit width. */
	width?: number;
	customWidth?: boolean;
	hidden?: boolean;
	styleId?: number;
	outlineLevel?: number;
	collapsed?: boolean;
	bestFit?: boolean;
}

export interface Hyperlink {
	range: CellRange;
	/** External target (URL or file); absent for in-workbook locations. */
	target?: string;
	/** In-workbook location (`Sheet2!A1`). */
	location?: string;
	tooltip?: string;
	display?: string;
}

export interface Comment {
	address: CellAddress;
	author: string;
	text: string;
	/** Threaded-comment replies, oldest first (read from `threadedComments` when present). */
	replies?: { author: string; text: string; date?: string }[];
}

export type ConditionalOperator =
	| 'lessThan'
	| 'lessThanOrEqual'
	| 'equal'
	| 'notEqual'
	| 'greaterThanOrEqual'
	| 'greaterThan'
	| 'between'
	| 'notBetween';

/** Differential format applied by conditional formatting (`dxf`). */
export interface DifferentialStyle {
	font?: Font;
	fill?: Fill;
	border?: Border;
	numFmt?: string;
}

export interface CfvoThreshold {
	type: 'min' | 'max' | 'num' | 'percent' | 'percentile' | 'formula';
	value?: string;
	/**
	 * Icon sets: whether a value equal to the threshold reaches it (`>=`, the default) or must
	 * exceed it (`>`, `gte="0"`).
	 */
	gte?: boolean;
}

export type ConditionalRule =
	| {
			type: 'cellIs';
			operator: ConditionalOperator;
			formulas: string[];
			style: DifferentialStyle;
			priority: number;
			stopIfTrue?: boolean;
	  }
	| {
			type: 'expression';
			formula: string;
			style: DifferentialStyle;
			priority: number;
			stopIfTrue?: boolean;
	  }
	| {
			type: 'colorScale';
			thresholds: CfvoThreshold[];
			colors: Color[];
			priority: number;
			stopIfTrue?: boolean;
	  }
	| {
			type: 'dataBar';
			min: CfvoThreshold;
			max: CfvoThreshold;
			color: Color;
			priority: number;
			stopIfTrue?: boolean;
			showValue?: boolean;
			/** Logical bar length percentages; linked x14 values override the legacy fallback on read. */
			minLength?: number;
			maxLength?: number;
			/** GUID linking this rule to its Excel 2010 (`x14:dataBar`) extension, kept for round trip. */
			extensionId?: string;
			/** Self-contained linked x14 rule XML, retaining advanced settings and unknown fields. */
			extensionXml?: string;
	  }
	| {
			type: 'iconSet';
			iconSet: string;
			thresholds: CfvoThreshold[];
			priority: number;
			stopIfTrue?: boolean;
			reverse?: boolean;
			showValue?: boolean;
	  }
	| {
			type: 'top10';
			rank: number;
			bottom?: boolean;
			percent?: boolean;
			style: DifferentialStyle;
			priority: number;
			stopIfTrue?: boolean;
	  }
	| {
			type: 'aboveAverage';
			below?: boolean;
			equalAverage?: boolean;
			style: DifferentialStyle;
			priority: number;
			stopIfTrue?: boolean;
	  }
	| {
			type:
				| 'duplicateValues'
				| 'uniqueValues'
				| 'containsBlanks'
				| 'notContainsBlanks'
				| 'containsErrors'
				| 'notContainsErrors';
			style: DifferentialStyle;
			priority: number;
			stopIfTrue?: boolean;
	  }
	| {
			type: 'containsText' | 'notContainsText' | 'beginsWith' | 'endsWith';
			text: string;
			style: DifferentialStyle;
			priority: number;
			stopIfTrue?: boolean;
	  }
	| {
			/** "A Date Occurring": the cell's date falls in a period relative to today. */
			type: 'timePeriod';
			timePeriod: TimePeriod;
			style: DifferentialStyle;
			priority: number;
			stopIfTrue?: boolean;
	  };

/** Periods of a `timePeriod` conditional-format rule (`ST_TimePeriod`). */
export type TimePeriod =
	| 'today'
	| 'yesterday'
	| 'tomorrow'
	| 'last7Days'
	| 'thisWeek'
	| 'lastWeek'
	| 'nextWeek'
	| 'thisMonth'
	| 'lastMonth'
	| 'nextMonth';

export const TIME_PERIODS: readonly TimePeriod[] = [
	'today',
	'yesterday',
	'tomorrow',
	'last7Days',
	'thisWeek',
	'lastWeek',
	'nextWeek',
	'thisMonth',
	'lastMonth',
	'nextMonth',
];

export interface ConditionalFormat {
	ranges: CellRange[];
	rules: ConditionalRule[];
}

export type ValidationType =
	| 'none'
	| 'whole'
	| 'decimal'
	| 'list'
	| 'date'
	| 'time'
	| 'textLength'
	| 'custom';

export interface DataValidation {
	ranges: CellRange[];
	type: ValidationType;
	operator?: ConditionalOperator;
	formula1?: string;
	formula2?: string;
	allowBlank?: boolean;
	/** Show the in-cell drop-down for list validations (SpreadsheetML inverts this flag). */
	showDropDown?: boolean;
	showErrorMessage?: boolean;
	showInputMessage?: boolean;
	errorStyle?: 'stop' | 'warning' | 'information';
	errorTitle?: string;
	error?: string;
	promptTitle?: string;
	prompt?: string;
}

export interface FreezePane {
	/** Number of frozen rows at the top. */
	rows: number;
	/** Number of frozen columns on the left. */
	cols: number;
}

export interface AutoFilter {
	range: CellRange;
	/** Per-column filters keyed by zero-based column offset within the range. */
	columns?: AutoFilterColumn[];
}

export interface AutoFilterColumn {
	offset: number;
	values?: string[];
	blank?: boolean;
	/**
	 * The `<filterColumn>` XML as read (custom, top 10, dynamic, colour, icon and date-group
	 * criteria the model does not represent). Written back, re-indexed to `offset`, while
	 * `values` and `blank` still match it; an edit that replaces the column drops it.
	 */
	sourceXml?: string;
}

export interface TableColumn {
	name: string;
	/** Original table-column id, keeping source metadata attached through renames and shifts. */
	sourceId?: number;
	totalsRowFunction?: string;
	totalsRowLabel?: string;
	calculatedColumnFormula?: string;
}

/** An Excel table (ListObject). */
export interface Table {
	id: number;
	name: string;
	displayName: string;
	range: CellRange;
	headerRow: boolean;
	totalsRow: boolean;
	columns: TableColumn[];
	styleName?: string;
	showRowStripes?: boolean;
	showColumnStripes?: boolean;
	showFirstColumn?: boolean;
	showLastColumn?: boolean;
	/** Package part the table was read from, reused on save. */
	partName?: string;
}

/** Where a drawing object sits on the grid (two-cell anchor, offsets in EMU). */
export interface DrawingAnchor {
	from: CellAddress & { colOffset: number; rowOffset: number };
	to?: CellAddress & { colOffset: number; rowOffset: number };
	/** Extent in EMU for one-cell and absolute anchors. */
	ext?: { cx: number; cy: number };
}

export interface ImageObject {
	kind: 'image';
	anchor: DrawingAnchor;
	/** Package part of the image (`xl/media/image1.png`). */
	partName: string;
	contentType: string;
	name?: string;
	description?: string;
}

export type ChartType = ChartSummaryType;

/** A spreadsheet chart series: the neutral summary series plus its SpreadsheetML colour. */
export interface ChartSeries extends ChartSummarySeries {
	color?: Color;
}

/** A chart anchored on a sheet: the neutral chart summary plus its anchor and package part. */
export interface ChartObject extends ChartSummary<ChartSeries> {
	kind: 'chart';
	anchor: DrawingAnchor;
	/** Package part of the chart (`xl/charts/chart1.xml`), kept so unmodelled detail survives. */
	partName?: string;
	name?: string;
}

/** A shape or object the model does not draw; reported so the UI can say so honestly. */
export interface UnsupportedDrawingObject {
	kind: 'unsupported';
	anchor: DrawingAnchor;
	/** What it is (`shape`, `smartArt`, `ole`, `form control`, ...). */
	description: string;
	/** The anchor element's XML as read, written back verbatim when the drawing is regenerated. */
	sourceXml?: string;
}

/** One content node of a SmartArt data model (for a placeholder or an outline view). */
export interface SmartArtNode {
	id: string;
	text: string;
	/** Model id of the parent content node, when it has one. */
	parentId?: string;
}

/**
 * A SmartArt graphic (`xdr:graphicFrame` with the DiagramML graphic). Shown from the drawing the
 * producing application cached (`dsp:drawing`); no SmartArt layout is computed and the content
 * is not editable. On save the frame XML and every diagram part are kept verbatim; only the
 * anchor position is written from the model.
 */
export interface SmartArtObject {
	kind: 'smartArt';
	anchor: DrawingAnchor;
	name?: string;
	/**
	 * The cached drawing, in EMU relative to the frame: what `<office-ui-smartart>` (`ooxml-ui`)
	 * takes as `drawing`. Absent when the file has no usable cached drawing: show a placeholder
	 * with `nodes`.
	 */
	diagram?: DiagramDrawing;
	/** Content nodes of the data model, in document order. */
	nodes: SmartArtNode[];
	/** `dgm:layoutDef/@uniqueId` (`urn:microsoft.com/office/officeart/2005/8/layout/default`). */
	layoutId?: string;
	/** What is and is not shown, for the UI to display honestly. */
	notice: string;
	/** Problems met reading the diagram parts; empty when everything resolved. */
	issues: DiagramIssue[];
	/** The anchor element's XML as read, written back (re-anchored) on save. */
	sourceXml: string;
}

export type DrawingObject = ImageObject | ChartObject | SmartArtObject | UnsupportedDrawingObject;

export interface SheetView {
	showGridLines: boolean;
	showHeaders: boolean;
	showZeros: boolean;
	rightToLeft: boolean;
	/** Percent. */
	zoom: number;
	freeze?: FreezePane;
	/** Top-left visible cell of the scrollable pane. */
	topLeft?: CellAddress;
	selection?: { active: CellAddress; ranges: CellRange[] };
	/** Show formula text instead of results (`showFormulas`, Ctrl+`). */
	showFormulas?: boolean;
}

/** Print options (`<printOptions>`). */
export interface PrintOptions {
	/** Print gridlines. */
	gridLines?: boolean;
	/** Print row and column headings. */
	headings?: boolean;
	horizontalCentered?: boolean;
	verticalCentered?: boolean;
}

export interface PageSetup {
	orientation?: 'portrait' | 'landscape';
	paperSize?: number;
	scale?: number;
	fitToWidth?: number;
	fitToHeight?: number;
	margins?: {
		left: number;
		right: number;
		top: number;
		bottom: number;
		header: number;
		footer: number;
	};
	printArea?: CellRange;
	/** Odd-page (or every-page) header and footer. */
	header?: string;
	footer?: string;
	/** Even-page header and footer, used when `differentOddEven` is set. */
	evenHeader?: string;
	evenFooter?: string;
	/** First-page header and footer, used when `differentFirst` is set. */
	firstHeader?: string;
	firstFooter?: string;
	differentFirst?: boolean;
	differentOddEven?: boolean;
	/** Absent means the Excel default (on); kept as read. */
	scaleWithDoc?: boolean;
	alignWithMargins?: boolean;
}

/** `<sheetFormatPr>` attributes besides the default row height and column width. */
export interface SheetFormat {
	/** Rows are hidden unless written (`zeroHeight`). */
	zeroHeight?: boolean;
	baseColWidth?: number;
	customHeight?: boolean;
	thickTop?: boolean;
	thickBottom?: boolean;
}

/**
 * An ECMA-376 agile password hash: digest name, base64 salt and hash, and the number of extra
 * rounds (absent when the file omits `spinCount`, so a round trip does not invent one).
 */
export interface ModernPasswordHash {
	algorithmName: string;
	hashValue: string;
	saltValue: string;
	spinCount?: number;
}

export interface SheetProtection {
	sheet: boolean;
	/** Legacy password hash (`password` attribute), kept for round trip. */
	passwordHash?: string;
	/**
	 * Excel 2013+ password hash (`algorithmName`, `hashValue`, `saltValue`, `spinCount`), which
	 * Excel writes instead of (or as well as) the legacy one. `verifySheetPassword` checks it
	 * synchronously for SHA-1, SHA-256, SHA-384 and SHA-512; the writer emits it only from here.
	 */
	modernHash?: ModernPasswordHash;
	/** Actions still allowed (`formatCells`, `insertRows`, `sort`, `autoFilter`, ...). */
	allow?: string[];
}

export type SheetState = 'visible' | 'hidden' | 'veryHidden';

export interface Worksheet {
	name: string;
	/** `sheetId` from workbook.xml; unique and stable within the workbook. */
	sheetId: number;
	state: SheetState;
	/** Cells keyed by row index, then column index (both zero-based). */
	rows: Map<number, Map<number, Cell>>;
	rowInfo: Map<number, RowInfo>;
	columns: ColumnInfo[];
	/** Points. */
	defaultRowHeight: number;
	/** Characters; absent means the Excel default (8.43 plus padding). */
	defaultColWidth?: number;
	/** Other `sheetFormatPr` attributes; absent for new sheets. */
	format?: SheetFormat;
	merges: CellRange[];
	view: SheetView;
	hyperlinks: Hyperlink[];
	comments: Comment[];
	conditionalFormats: ConditionalFormat[];
	dataValidations: DataValidation[];
	tables: Table[];
	drawings: DrawingObject[];
	autoFilter?: AutoFilter;
	pageSetup?: PageSetup;
	/** Print options; absent means none set. */
	printOptions?: PrintOptions;
	protection?: SheetProtection;
	tabColor?: Color;
	/**
	 * Worksheet XML elements the model does not represent, keyed by local name and kept verbatim
	 * so a save writes them back in schema order (`printOptions`, `rowBreaks`, `extLst`, ...).
	 */
	preserved: Map<string, string[]>;
	/** Package part the sheet was read from, reused on save. */
	partName?: string;
}

export interface DefinedName {
	name: string;
	/** The reference or formula, without a leading `=`. */
	formula: string;
	/** Zero-based sheet index for a sheet-scoped name. */
	localSheet?: number;
	hidden?: boolean;
	comment?: string;
}

/** The workbook theme's colour palette and fonts, resolved for rendering. */
export type ThemePalette = ChartThemePalette;

/**
 * Document properties: every core (`docProps/core.xml`) and extended (`docProps/app.xml`) field
 * of the shared OPC model, plus custom properties. On save, `headingPairs` and `titlesOfParts`
 * are refreshed from the sheet names; app.xml elements the model does not know are kept.
 */
export interface WorkbookProperties extends CoreProperties, AppProperties {
	/**
	 * `docProps/custom.xml`. Absent: the source part (if any) is saved unchanged; present (even
	 * empty) it replaces the part, and an empty list removes it.
	 */
	custom?: CustomProperty[];
}

export interface Workbook {
	sheets: Worksheet[];
	/** Resolved cell formats; index 0 is the default. */
	styles: CellStyle[];
	/** Named cell styles (`Normal`, `Good`, `Heading 1`, ...) available for the styles gallery. */
	namedStyles: { name: string; style: CellStyle; builtinId?: number }[];
	definedNames: DefinedName[];
	theme: ThemePalette;
	/** Zero-based index of the sheet shown first. */
	activeSheet: number;
	/** Dates count from 1904-01-01 instead of 1900-01-01. */
	date1904: boolean;
	properties: WorkbookProperties;
	/** Recalculate formulas when the file opens (`calcPr fullCalcOnLoad`). */
	fullCalcOnLoad?: boolean;
	/** Workbook structure protection (no adding, deleting or renaming sheets). */
	structureLocked?: boolean;
	/** Legacy 16-bit hash of the structure protection password (`workbookPassword`, hex). */
	workbookPasswordHash?: string;
	/**
	 * Excel 2013+ structure protection hash (`workbookAlgorithmName`, `workbookHashValue`,
	 * `workbookSaltValue`, `workbookSpinCount`), which Excel writes instead of the legacy one.
	 */
	workbookModernHash?: ModernPasswordHash;
	/** Calculation mode (`calcPr calcMode`); absent means automatic. */
	calcMode?: 'auto' | 'manual';
	/**
	 * Iterative calculation (`calcPr iterate`, `iterateCount`, `iterateDelta`). Present when
	 * enabled: a circular reference is then recalculated up to `count` times, stopping once no cell
	 * in it changes by more than `delta`, instead of being reported and left at 0.
	 */
	iterate?: { count: number; delta: number };
	/**
	 * The package the workbook was loaded from, kept so parts the model does not represent
	 * (charts' full detail, VBA, pivot caches, custom XML) survive a save. Absent for new workbooks.
	 */
	source?: SourcePackage;
	/** Where the workbook came from, for honest reporting in the UI. */
	format: 'xlsx' | 'xlsm' | 'xls' | 'csv' | 'new';
	/** Things the loader read but could not model, surfaced to the user. */
	warnings: string[];
	/**
	 * The digital signatures of the loaded package (`_xmlsignatures/`), when it was signed. They
	 * are not verified, and `saveXlsx` never writes them: a regenerated package invalidates them.
	 */
	signatures?: WorkbookSignatures;
}

/** The digital signatures found in a loaded package. */
export interface WorkbookSignatures {
	/** How many signature parts the package holds. */
	count: number;
	/** The signature part names (`_xmlsignatures/sig1.xml`, ...). */
	parts: string[];
}

/** Raw parts of the loaded package, keyed by part name (no leading slash). */
export interface SourcePackage {
	parts: Map<string, Uint8Array>;
}

export type {
	AppProperties,
	CoreProperties,
	CustomProperty,
	CustomPropertyType,
	HeadingPair,
} from '../opc/properties/types';
export type * from './model-sparklines';
