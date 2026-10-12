import type { VisioPageLayout } from './page-layout';
import type { VisioSnapGlue } from './snap-glue';
import type { VisioForeignVector } from './foreign-vector';
import type { VisioHyperlink, VisioShapeData } from './shape-metadata';
import type { VisioComment } from './comments';
export type { VisioComment } from './comments';
import type { VisioDataRecordset } from './data-recordsets';

/** Visio's internal distance unit is the inch; angles are radians. */
export type VisioMatrix = readonly [number, number, number, number, number, number];
export interface VisioDiagnostic {
	code: string;
	severity: 'info' | 'warning';
	message: string;
	part?: string;
	pageId?: string;
	shapeId?: string;
}
export interface VisioGeometry {
	/** SVG path data in local, y-up, inch coordinates. No untrusted markup. */
	path: string;
	fill: boolean;
	stroke: boolean;
}
export interface VisioGradientPaint {
	stops: { offset: number; color: string; opacity: number }[];
	/** Native opaque two-stop interpolation; source stops remain unchanged. */
	interpolation?: 'sigma-gamma22';
}
export interface VisioLinearGradient extends VisioGradientPaint {
	type: 'linear';
	/** Local y-up inches, or normalized coordinates when boundingBoxAngle is present. */
	start: readonly [number, number];
	end: readonly [number, number];
	/** Rotation in local y-up degrees around the normalized bounding-box center. */
	boundingBoxAngle?: number;
}
export interface VisioRadialGradient extends VisioGradientPaint {
	type: 'radial';
	/** Normalized local y-up object-bounding-box coordinates. */
	center: readonly [number, number];
	radius: number;
	/** Absent uses normalized bounds; local uses y-up inches and a circular radius. */
	coordinateSpace?: 'local';
}
export interface VisioGradientRegion {
	/** Normalized local y-up triangle vertices; endpoint space comes from the owning paint. */
	points: readonly (readonly [number, number])[];
	start: readonly [number, number];
	end: readonly [number, number];
	/** Native clockwise SVG rotation in degrees, retained for exact rasterization. */
	angle: number;
}
export interface VisioRegionGradient extends VisioGradientPaint {
	type: 'regions';
	/** Shape uses normalized y-up endpoints shared by every triangle; absent uses triangle bounds. */
	coordinateSpace?: 'shape';
	regions: VisioGradientRegion[];
}
export type VisioFillGradient = VisioLinearGradient | VisioRadialGradient | VisioRegionGradient;
export interface VisioFillPattern extends VisioImage {
	/** Physical tile dimensions in local inches; bytes encode a normalized 8-by-8 PNG. */
	width: number;
	height: number;
	bytes: Uint8Array;
}
/** A simple outer shape shadow. Offsets are page inches with Y up; blur is a radius in inches. */
export interface VisioShadow {
	color: string;
	opacity: number;
	offsetX: number;
	offsetY: number;
	blur: number;
}
/** A glow around the shape outline; size is the glow radius in inches. */
export interface VisioGlow {
	color: string;
	opacity: number;
	size: number;
}
/** A mirrored copy below the shape, fading from `opacity` to clear over `size` of its height. */
export interface VisioReflection {
	opacity: number;
	/** Fraction (0-1] of the shape height shown. */
	size: number;
	/** Gap below the shape and blur radius, in inches. */
	distance: number;
	blur: number;
}
export interface VisioStyle {
	fill: string;
	/** Supported normalized gradient; fill remains the solid fallback color. */
	fillGradient?: VisioFillGradient;
	fillPattern?: VisioFillPattern;
	/** Cached source paint properties, independent of gradient/tile render multipliers. */
	fillPatternIndex?: number;
	fillForegroundOpacity?: number;
	fillBackgroundColor?: string;
	fillBackgroundOpacity?: number;
	lineColor: string;
	/** Saved gradient paint; lineColor remains the fallback and arrow-marker color. */
	lineGradient?: VisioFillGradient;
	lineWidth: number;
	/** Normalized SVG-compatible cap; absent means the effective cap is unresolved. */
	lineCap?: 'round' | 'butt' | 'square';
	/** Effective ShapeSheet line pattern; 0 is no line, 1 is solid (also invalid-cache fallback). */
	linePattern: number;
	/** Alternating dash/gap lengths in stroke-width multiples, not inches.
	 * Native built-ins 2-23 use cap-aware spacing (2-6 entries, each 0-40).
	 * Absent for solid, invisible or unresolved patterns. Consumers scale by lineWidth,
	 * substituting lineDashDotLength for zero-length square-cap dots when present.
	 */
	lineDash?: readonly number[];
	/** Physical inches used for zero-length square-cap dots in native built-in dashes. */
	lineDashDotLength?: number;
	/** Cached LineColorTrans opacity, independent of gradient rendering. */
	lineColorOpacity?: number;
	fillOpacity: number;
	lineOpacity: number;
	/** Visio arrowhead codes. Consumers must report unsupported arrow variants. */
	startArrow: number;
	endArrow: number;
	startArrowSize?: number;
	endArrowSize?: number;
	/** Saved corner rounding radius in inches (already applied to the geometry); absent when 0. */
	rounding?: number;
	shadow?: VisioShadow;
	glow?: VisioGlow;
	/** Soft edge radius in inches. */
	softEdges?: number;
	reflection?: VisioReflection;
}
export interface VisioTextRun {
	text: string;
	fontFamily: string;
	fontSize: number;
	color: string;
	/** Native character color alpha, including a single colored layer override. */
	opacity?: number;
	bold: boolean;
	italic: boolean;
	underline: boolean;
	/** Single native Strikethru decoration; double strikethrough is separate. */
	strikethrough?: boolean;
	/** Char.Letterspace in inches; omitted when zero. */
	letterSpacing?: number;
	/** Char.Pos; omitted for normal baseline text. */
	position?: 'superscript' | 'subscript';
	/** Char.Case display transform; the stored text keeps its own case. */
	textCase?: 'all-caps' | 'initial-caps' | 'small-caps';
	/** Char.LangID, a Windows language identifier; omitted when unset or zero. */
	language?: number;
}
/** A text field's span in plainText. Display text is evaluated where supported. */
export interface VisioTextField {
	start: number;
	end: number;
	/** The cached text stored in the source <fld> element (source-backed edits compare it). */
	cached: string;
	/** The Field row's Value formula, when it has one. */
	formula?: string;
}
export interface VisioParagraph {
	/** UTF-16 offsets into plainText. End excludes the paragraph's newline. */
	start: number;
	end: number;
	horizontalAlign: 'left' | 'center' | 'right' | 'justify' | 'distributed';
	indentLeft: number;
	indentRight: number;
	indentFirst: number;
	spaceBefore: number;
	spaceAfter: number;
	/** Exact values are inches; multiples scale the largest font size on the line. */
	lineSpacing: { kind: 'multiple' | 'exact'; value: number };
	direction: 'ltr' | 'rtl';
	bullet?: { text: string; fontFamily: string; fontSize: number; offset: number };
}
export interface VisioText {
	/** Logical displayed text. VSDX excludes its stored terminal paragraph marker. */
	plainText: string;
	/** Default character styles, including for an empty text block. */
	bold?: boolean;
	italic?: boolean;
	underline?: boolean;
	strikethrough?: boolean;
	/** Default character extras (Char row 0), as on VisioTextRun. */
	letterSpacing?: number;
	position?: 'superscript' | 'subscript';
	textCase?: 'all-caps' | 'initial-caps' | 'small-caps';
	language?: number;
	/** Optional backdrop behind laid-out text, not the complete shape rectangle. */
	backgroundColor?: string;
	backgroundOpacity?: number;
	runs: VisioTextRun[];
	paragraphs?: VisioParagraph[];
	/** Text fields (<fld>), in text order. Omitted when the text has none. */
	fields?: VisioTextField[];
	fontFamily: string;
	fontSize: number;
	color: string;
	opacity?: number;
	horizontalAlign: 'left' | 'center' | 'right' | 'justify';
	verticalAlign: 'top' | 'middle' | 'bottom';
	/** Local text box transform (y-up), dimensions and margins in inches. */
	transform: VisioMatrix;
	width: number;
	height: number;
	margins: { left: number; right: number; top: number; bottom: number };
}
export interface VisioPlacedForeignVector {
	vector: VisioForeignVector;
	x: number;
	y: number;
	width: number;
	height: number;
	opacity: number;
}
export interface VisioImage {
	mimeType: 'image/png' | 'image/jpeg' | 'image/gif';
	/** Validated embedded raster bytes shared between instances. Consumers must not modify them. */
	bytes: Uint8Array;
	pixelWidth: number;
	pixelHeight: number;
	opacity?: number;
	/** Optional placement in local y-up inches, defaulting to the shape bounds. */
	x?: number;
	y?: number;
	width?: number;
	height?: number;
}
export interface VisioLayer {
	id: string;
	name: string;
	visible: boolean;
	printable: boolean;
	locked: boolean;
	color?: string;
	colorOpacity?: number;
}
/** Summary of normalized layer Print flags, not a shape printing decision or mixed-layer policy. */
export type VisioLayerPrintSummary =
	| 'unlayered'
	| 'all-enabled'
	| 'all-disabled'
	| 'mixed'
	| 'unknown';
/** Saved reasons retained independently so display overrides cannot reveal intrinsic hiding. */
export interface VisioShapeVisibility {
	layerHidden: boolean;
	/** Guides are hidden by this renderer, but can be printable in Visio. */
	guide: boolean;
	/** Legacy shape-level NoShow compatibility flag, not Geometry.NoShow. Missing means unknown. */
	noShow?: boolean;
	layerPrintSummary: VisioLayerPrintSummary;
	/**
	 * Cached NonPrinting only. Missing or unusable caches remain unknown.
	 * https://learn.microsoft.com/en-us/office/client-developer/visio/nonprinting-cell-miscellaneous-section
	 */
	nonPrinting?: boolean;
}
export interface VisioShape {
	id: string;
	name: string;
	kind: 'shape' | 'group' | 'connector' | 'foreign';
	/** Cached group data ordering: 0 hides own data, 1 behind members, 2 in front. */
	groupDisplayMode?: 0 | 1 | 2;
	width: number;
	height: number;
	/** Local y-up coordinates to parent y-up coordinates. */
	transform: VisioMatrix;
	/** Saved parent-space pin in physical page inches and counterclockwise radians.
	 * Optional for older/manually constructed scenes; never infer a pin from a bounds center.
	 */
	rotation?: { pinX: number; pinY: number; angle: number };
	geometry: VisioGeometry[];
	style: VisioStyle;
	text: VisioText;
	/** Saved display suppression of this shape and its subtree; retained for existing consumers. */
	hidden: boolean;
	/** Additive metadata. Older or manually constructed scenes may omit it. */
	visibility?: VisioShapeVisibility;
	children: VisioShape[];
	masterId?: string;
	layerIds?: string[];
	image?: VisioImage;
	foreignVector?: VisioPlacedForeignVector;
	shapeData?: VisioShapeData[];
	hyperlinks?: VisioHyperlink[];
	/** Cached Comment cell text, which Visio shows as the shape's ScreenTip. Inert plain text. */
	screenTip?: string;
	/** A container or callout (User.msvStructureType) with its members or target, when known. */
	structure?: VisioShapeStructure;
	/** Connection rows in local y-up coordinates; `index` is the zero-based row IX. */
	connectionPoints?: VisioConnectionPoint[];
	/** A 1D shape's begin and end points in local y-up coordinates. */
	lineEnds?: { begin: VisioLocalPoint; end: VisioLocalPoint };
	/** A dynamic connector's route from its ShapeRouteStyle and ConLineRouteExt caches. */
	connectorRoute?: 'right-angle' | 'straight' | 'curved';
	/**
	 * A two-dimensional shape Visio lays out and routes around (ObjType 1). Visio marks a shape
	 * placeable when a dynamic connector is glued to it; right-angle connectors avoid these only.
	 */
	placeable?: boolean;
}
export interface VisioLocalPoint {
	x: number;
	y: number;
}
export interface VisioConnectionPoint extends VisioLocalPoint {
	index: number;
	/** True when the row comes from the shape's master rather than the shape itself. */
	inherited: boolean;
}
export type VisioShapeStructure =
	| { type: 'container'; memberIds: string[] }
	| { type: 'callout'; targetId?: string; leaderId?: string };
export interface VisioConnection {
	fromShapeId: string;
	toShapeId: string;
	fromCell: string;
	toCell: string;
	fromPart?: number;
	toPart?: number;
}
/** Cached Print Properties and drawing scale of a PageSheet. Every field is optional. */
export interface VisioPageSetup {
	/** PageScale and DrawingScale in internal inches: `pageScale` on paper equals `drawingScale`. */
	readonly pageScale?: number;
	readonly drawingScale?: number;
	/** DrawingScale display unit (`FT`, `MM`, ...), as saved. */
	readonly drawingScaleUnit?: string;
	/** PrintPageOrientation: 0 same as printer, 1 portrait, 2 landscape. */
	readonly printPageOrientation?: 0 | 1 | 2;
	/** PaperKind: the Windows DMPAPER code of the printer paper. */
	readonly paperKind?: number;
	/** Print margins in inches (PageLeftMargin and the others), only when all four are cached. */
	readonly margins?: {
		readonly left: number;
		readonly right: number;
		readonly top: number;
		readonly bottom: number;
	};
	/** Print zoom (ScaleX), where 1 prints at 100%. */
	readonly printZoom?: number;
}
/** The theme a page uses, for the Design tab. Colours are `#rrggbb`. */
export interface VisioPageTheme {
	name: string;
	/** Set when the theme part is one of the built-in themes this package writes. */
	builtIn?: string;
	/** Selected variant, 0-3. */
	variant: number;
	/** Accent 1-6. */
	accents: string[];
	/** The theme's Light (`lt1`) and Dark (`dk1`) colours, when it has them. */
	light?: string;
	dark?: string;
	/** Each variant's seven variant colours. */
	variants: string[][];
}
export interface VisioPage {
	id: string;
	/** Explicit cached drawing page-size modes. Missing or invalid source caches are omitted. */
	drawingSizeType?: number;
	drawingResizeType?: number;
	/** Cached PageScale/DrawingScale. Scene geometry is in physical page inches;
	 * source-backed geometry edits continue to accept drawing inches. Omitted means 1.
	 */
	drawingToPageScale?: number;
	/** Cached print and drawing-scale settings; absent when none are usable. */
	pageSetup?: VisioPageSetup;
	/** Stored line jump, grid and ruler cells; `visioPageLayout(page)` adds Visio's defaults. */
	layout?: Partial<VisioPageLayout>;
	name: string;
	width: number;
	height: number;
	isBackground: boolean;
	backgroundPageId?: string;
	shapes: VisioShape[];
	connectors: VisioConnection[];
	layers?: VisioLayer[];
	theme?: VisioPageTheme;
}
/** One master of the drawing's document stencil (visio/masters). */
export interface VisioMaster {
	id: string;
	/** The local name, or the universal one when there is none. */
	name: string;
	nameU?: string;
	/** The master page size in inches. */
	width: number;
	height: number;
	/** Top-level shapes in the master; an instance inherits the only one. */
	rootCount: number;
	/** A 1-D master (a connector or a line), which is glued or stretched rather than dropped. */
	oneDimensional: boolean;
	/**
	 * A 1-D master whose transform follows its ends the way Visio's Dynamic connector does: it can
	 * be dropped as a connector with two free ends. Other lines and connectors cannot.
	 */
	dynamicConnector?: boolean;
	/** The master's shapes drawn alone, for a preview; empty when they could not be resolved. */
	shapes: VisioShape[];
}
export interface VisioDocument {
	format: 'vsdx' | 'vsd';
	/** The document stencil: visible masters in file order. Absent when the drawing has none. */
	masters?: VisioMaster[];
	/** File names of the stencils docked in the drawing window when it was saved (no folders). */
	stencils?: string[];
	/** Existing source FaceNames available for conservative source-backed font edits. */
	fontFamilies?: readonly string[];
	/** Saved external data (DataRecordSets): cached rows and shape links. Never refreshed here. */
	dataRecordsets?: VisioDataRecordset[];
	/** Stored Snap & Glue settings; `visioSnapGlue(document)` adds Visio's defaults. */
	snapGlue?: Partial<VisioSnapGlue>;
	pages: VisioPage[];
	diagnostics: VisioDiagnostic[];
	/** Review comments (visio/comments.xml) and read-only Visio 2010 annotations. */
	comments?: VisioComment[];
}
