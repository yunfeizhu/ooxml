# Visio scenes and experimental source-backed editing

`ooxml-core/visio` imports VSDX drawing packages into a DOM-independent typed scene.
UI components live in the separate viewer. This is a supported subset, not Visio
parity or a complete ShapeSheet calculation engine. The experimental edit API
preserves untouched package payloads under the limitations documented below.

## Create a blank drawing

`createVsdx({ width?, height? })` returns a source-backed, editable single-page
VSDX. Dimensions are physical inches, defaulting to Letter (8.5 by 11) at 1:1
drawing scale. Explicit Calibri 12-point text and basic black-line/white-fill
defaults are independent of installed templates. The package includes the
Windows part required by native Visio. Invalid or out-of-range dimensions fail
before package creation.

Native Visio 16 opens blank and core-created rectangle fixtures for Letter,
landscape Letter and A4, can draw into each blank document and save them again.
The oracle checks dimensions, pins, font and basic style defaults. Generate owned
fixtures with `bun scripts/create-visio-new-drawing-fixtures.ts <directory>`,
run `scripts/record-visio-new-drawing.ps1 -OutputDirectory <directory>`, then
select that directory with `VISIO_NATIVE_NEW_DRAWING_DIR` for the optional test.
This establishes those basic drawings, not template or theme equivalence.

## Whole-shape formatting and stacking order

`editVsdx` accepts `format-text`, `format-shape` and `reorder-shape` commands.
Text properties are `fontFamily`, `fontSize` (points), `bold`, `italic`,
`underline`, `strikethrough`, `fontColor` (six-digit hex), `bullets`,
`indentLeft` (points), `horizontalAlign` (`left`, `center`, `right`, `justify`)
and `verticalAlign` (`top`, `middle`, `bottom`). Shape properties are `fillColor` (six-digit hex or
`none`), `lineColor` (six-digit hex), `lineWeight` (points), `linePattern` (0-23),
`fillPattern` (0-24), `fillBackgroundColor` (six-digit hex), `lineTransparency`
and `fillTransparency` (0-100 percent). Transparency rounds to native half-percent
steps, with midpoint ties upward. Fill transparency changes both foreground and
background. Pattern 0 hides the paint; pattern 1 is solid. Explicit line pattern
selection can enable a text-box outline without changing its color or weight.
An explicit fill pattern overrides a color's implicit solid pattern; `fillColor:
'none'` with a nonzero pattern is contradictory and rejected. Active gradient
transparency/background changes require explicit paint replacement. Ordinary
inherited solid theme paints reuse the shared theme resolver.
Reordering accepts
`order: 'front' | 'back' | 'forward' | 'backward'`. Every command includes
`pageId` and `shapeId`; the complete command batch is atomic.

The Text dialog properties extend `format-text`: `fontTransparency` (percent),
`textCase` (`normal`, `all-caps`, `initial-caps`, `small-caps`), `textPosition`
(`normal`, `superscript`, `subscript`), `language` (a Windows LCID), `letterSpacing`,
`indentRight`, `indentFirst`, `spaceBefore`, `spaceAfter` (points), `lineSpacing`
(`multiple` writes a negative SpLine, `exact` points), `bulletStyle` (0-7), `bulletText`
(one character), `margins`, `textBackground` (hex or `none`, saved with Visio's `RGB()+1`
formula), `textBackgroundTransparency` and `textBlock` (the Text Block tool: centre, size
as fractions of Width/Height and an angle, written as `Width*k`/`Height*k` formulas so
the block follows later resizes). Tab stops are not written.

## Layer properties

`set-layer-properties` sets a page layer's `visible`, `print` or `lock` flag: the Visible, Print
and Lock cells of the layer's row in the page's Layer section (Home > Layers > Layer Properties).
Omitted flags are kept, a missing cell is added, and a flag driven by a formula is refused. Layer
property edits form their own transaction and change only `pages.xml`. Renaming, removing and
recolouring layers, and the Active, Snap and Glue flags, are not written.

## Document stencil and docked stencils

`parseVsdx` lists the drawing's visible masters as `document.masters` (`VisioMaster`: `id`, `name`,
`nameU`, the master page size, `rootCount`, `oneDimensional` and the master's shapes resolved
alone, for a preview), and the file names of its Stencil windows (`visio/windows.xml`) as
`document.stencils`. `visioBuiltInStencil` maps Visio's `BASIC`, `BASFLO` and `ARROWS` stencil
files to the built-in stencils; `createVsdx({ stencils })` writes those windows. Stencil files are
never opened.

`insert-master-instance` drops a master on a page as Visio does: a shape that names the master and
carries `PinX` and `PinY`, plus one `MasterShape` sub-shape per sub-shape of a group master, and
the page's relationship to the master part when it is missing. The instance is named as Visio
names it (the master's name, then `Name.ID` once the page has that name), keeps a one-shape
master's size beside the pin as inherited caches (`F="Inh"`, the form Visio saves and keeps, so
edits that read a shape's box from the page take it like a drawn shape), joins the master's
layers by name (missing layers are added to the page; not for group masters) and grows an Auto
Size page. A master with several top-level shapes is dropped as the group Visio makes: a
`Type="Group"` shape that names the master, as large as the shapes together, with each shape as a
sub-shape whose pin and size follow the group (`Sheet.N!Width*0.25`). Visio's Dynamic connector
master drops as a connector with two free ends (`begin`/`end`). Another 1-D master, a master that
inherits another and a master whose top-level shapes are turned or flipped are refused
(`UNSUPPORTED_MASTER_INSTANCE`). `visioMasterDropCommand` (`ooxml-core/visio/ui`) builds the edit
from a pointer position.

`drop-stencil-master` drops a master of a built-in stencil (`VISIO_BUILT_IN_STENCILS`: Basic
Shapes, Basic Flowchart Shapes, Miscellaneous Flowchart Shapes, Arrow Shapes) the way Visio drops
one from a stencil file: the master is copied into the drawing's document stencil the first time
(`masters.xml`, its master part, relationships and content types, created when the drawing has
none) and the page gets an instance of it. A master copied earlier is found by its `UniqueID`; a
master of the drawing with the same universal name is reused when it is one droppable 2-D shape,
because the built-in stencils stand in for Visio's stencil files. The masters are this package's
own geometry in the drawing's default styles (`visioBuiltInMaster` gives each a stable `UniqueID`
in the form Visio keeps and its own `BaseID`); they carry no icon, connection points or Shape
Data. `visioStencilDropCommand` builds the edit from a pointer position.

Master drops may share a call with other edits: the drops run first, in order, and the remaining
edits run after them as one transaction, so a drop can be styled, resized, typed into and
connected in the same `editVsdx` call. A refusal anywhere fails the whole call.

Connectors glue to a stencil instance and follow it when it moves or is resized; its size and
connection points are read through its master, so an instance that carries only its pin (as Visio
and this package write a fresh drop) is a glue target like any other. `change-shape` with a
built-in `shape` on a stencil instance copies that built-in master into the drawing and makes the
shape an instance of it, through the same `change-shape` by `masterId` that the Document Stencil
masters use (`edit-change-shape-builtin.ts`, `edit-instance-replace.ts`). The shape keeps its
position, text, formatting, layers and whole-shape glue, keeps the size it shows when connectors
are glued to it, and is renamed after the new master (Visio also gives it a new ID; here the ID
stays). It forms its own transaction.

## Text fields

`insert-text-field` adds a `<fld>` and a Field row (Value formula and cache, Format
picture, Type 0 string, 2 number, 5 date) at an offset in the source text or at the end.
It evaluates `NOW()`, the document date functions, `TITLE()`, `CREATOR()` and the other
document-property functions, `PAGENAME()`, `PAGENUMBER()`, `PAGECOUNT()` and numeric
formulas over the shape's own cells; anything else is refused. Format pictures are the
`VISIO_FIELD_FORMATS` subset (`{{date picture}}`, `0`, `0.00`, `#,##0`, ` u` units, `@`).
The parser shows evaluated page and document context and cached Values; other fields keep
their stored text. Range edits treat a field as one atomic token and refuse ranges that
touch it; whole-text replacement of a shape with fields is refused. Visio reopening
these rows is not verified.

Formatting admits unlayered local leaf shapes and local lines. Whole-shape text
edits update effective character/paragraph rows, preserving mixed-run markers,
unrelated style bits and supported cached fields. Proven local `F="Inh"` text
cells become explicit overrides. Font family edits require an existing document FaceName;
both native name-valued `FONT` caches and older explicit font IDs are supported.
Protected/error-bearing cells, unsupported inheritance and formulas depending
on changed formatting are refused. Paint edits preserve existing rich-text runs.
Stacking edits move intact top-level ordinary shape nodes within display band
zero; masters, groups, foreign shapes, layered targets, and dynamic/container
dependencies are currently refused. Empty inherited layer membership is admitted.
Pure theme formulas can be overridden; guards and reference-bearing formulas
remain protected. Physical point sizes do not scale with the
page drawing scale. The optional `VisioDocument.fontFamilies` lists saved font
families for host pickers.

Successful saves carry experimental diagnostics. Untouched part payloads remain
byte-identical, while edited XML and ZIP representation may change. Owned native
Visio 16 captures verify all four stacking operations and these formatting cells
after save and reopen at three drawing scales. This proves the captured subset,
not general native visual equivalence. Regression coverage includes
`edit-formatting.test.ts`, `edit-shape-order.test.ts` and the optional
`edit-formatting-native-oracle.test.ts`; regenerate its references with
`scripts/record-visio-formatting.ps1`.

The DOM-free `ooxml-core/visio/ui` helpers include immutable selection snapshots,
aggregate formatting state and `visioArrangeCommands`. Alignment uses the first
selected shape as its reference. Horizontal and vertical spacing use equal gaps
between rotated width/height boxes, ordered by centers with selection-order ties,
as measured in native Visio. These helpers return ordinary atomic move commands;
source locks, glue and formula admission remain authoritative. The current
arrangement scope is unlayered local leaf shapes with saved pins, excluding
masters, groups and glued connectors. Native captures cover six alignment and
two distribution actions at three drawing scales plus 34 overlapping/tied cases.

## Source duplication and shape clipboard

`duplicate-shapes` clones admitted local unglued 2D leaves with fresh IDs and
names, preserving source stacking order, mixed text and inert unknown XML. It
remaps references between copied shapes and proves affected formula caches.
The `visioDuplicateCommand` helper defaults to 0.33 drawing inches right/down.
Native Visio 16 capture and reopen cover nine single, multiple and movement-locked
cases at three scales. Groups made here, drawn shapes on a layer, foreign shapes
and unsupported dependencies remain refused. A 2D stencil instance is copied as
an instance of its master (see "Stencil instances: whole-shape commands").

`captureVisioClipboard(bytes, pageId, shapeIds)` returns an owned
`VisioClipboardSnapshot`; `serializeVisioClipboard` and
`deserializeVisioClipboard` encode/validate bounded versioned text. These APIs
never access a system clipboard. The `paste-shapes` command imports captured XML
through the same clone transaction after checking actual font/style/theme
definitions and page settings, ordinal, background context and drawing ratio.
Its copies do not depend on originals remaining in the target package. Source
references must stay inside the copied selection. `visioPasteCommand` allocates
fresh page-local IDs and accepts an optional drawing-inch offset.

Limits include 1,000 shapes, 64 resource records, 8,388,608 UTF-16 code units
and 100,000 aggregate XML nodes before incoming DOM construction. Malformed XML,
surrogates, ambiguous resource mappings, relationship-bearing fragments and
unsupported formulas are refused before mutation. Untouched package payloads
remain byte-identical. Native reopen covers clipboard-generated output from the
nine duplicate fixtures, not native clipboard interoperability or placement.
Resource import, cross-scale paste and native paste cascade remain unsupported.

An array containing only `delete-shape` commands removes an admitted set together.
References between removed local leaves may remain inside that set; references
from retained formulas, metadata or Connect records still refuse. All targets
and deletion locks are checked before any node is removed. Mixed command arrays
retain the sequential single-shape policy. This enables Cut of a closed selection
without weakening retained-reference protection. Native Visio 16 deletion and
core capture/delete/paste reopen cover nine cases at three drawing scales,
including reverse selection order and independent movement locks. Use
`scripts/record-visio-batch-delete.ps1` and `VISIO_NATIVE_BATCH_DELETE_DIR` for
the optional oracle. Stencil instances are deleted whole and a stencil connector
glued to a deleted shape is released; deleting a group made here remains open.

## Plan literal text replacement

The DOM-free `ooxml-core/visio/ui` helpers `visioTextReplaceOccurrences`,
`visioTextReplaceFindNext` and `visioTextReplacePlan` operate on full logical text
with nonoverlapping UTF-16 ranges. Requests require `matchCase: true`, a nonempty
literal query, `pageId` and an explicit `selection`, `current-page` or `all-pages`
scope. Selection scope includes each selected group's subtree, deduplicated in
ordered-selection/source order. Page scopes follow source order and Find Next
wraps. These traversal policies have not been compared with native Find dialog
navigation. Unicode case folding, whole-word matching and special search codes
remain unsupported.

Plans accept `mode: 'current' | 'all'`, literal replacement text, and an optional
current occurrence. `visioTextReplaceCommands(model, plan)` rejects forged or
stale text/identity/order snapshots and returns an owned atomic edit batch. A host
must additionally bind its source revision and operation intent. Matched rich,
field-bearing, master-linked, protected or unsupported text is retained in the
batch so the source editor refuses the entire operation instead of silently
skipping it. Empty replacement deletes matches; an unchanged replacement retains
source admission checks. Output, match and input limits reject oversized work
without truncation.

`record-visio-text-replace.ps1` records 18 native Characters-range cases across
three drawing scales. Actual core output matches their literal text and preserved
geometry/style, retains untouched package payloads, and reopens in Visio 16. Use
`VISIO_NATIVE_TEXT_REPLACE_DIR` for the optional oracle. This proves the measured
range replacements, not native Find/Replace dialog or rich-text parity.

## Read a drawing

```ts
import { parseVsdx, getVisioPageLayers } from 'ooxml-core/visio';

const drawing = await parseVsdx(bytes);
const layers = getVisioPageLayers(drawing, drawing.pages[0]!.id);
```

Coordinates are inches, y-up; angles are radians. A shape's six-number affine
matrix maps its local coordinates into its parent's coordinate system. Geometry
is inert SVG path data, never source markup. Apply the page y-axis inversion only
at the rendering boundary, and invert text and raster images appropriately.
Background page layers are returned in painting order.

## Implemented

- Page identity, dimensions, order, background chains, and connector attachment metadata
- Group transforms, rotation, flips, pin/local-pin positions, and cached connector endpoints
- Master cells, sections, rows, child inheritance and deletion; style chains and document defaults
- Absolute/relative move and line rows; relative quadratic/cubic Beziers; circular arcs,
  three-point elliptical arcs, and ellipses with orthogonal axes
- Saved corner radius on explicitly closed, axis-aligned rectangular line geometry;
  exact circular SVG arcs with radius clamped to half the shortest edge
- Literal `POLYLINE` coordinate lists; bounded approximation of literal, clamped,
  positive-weight NURBS. Cached contiguous `SplineStart`/`SplineKnot` sequences use
  the same sampler with implicit unit weights. Both produce explicit approximation diagnostics
- Cached solid colors/fills, line widths/pattern codes, arrow codes/sizes, and opacity
- Cached/themed normalized line caps, with native Visio 16 SVG evidence for cached caps
- Cached line patterns 2-23 normalized to native cap-aware dash/gap sequences.
  Custom master patterns and non-solid themed dashes remain unresolved
- Saved Quick Style color selectors and internal DrawingML theme color/variant records;
  solid fills, linear gradient endpoints/stops, tint/shade/alpha color transforms,
  and themed line widths, with diagnostics for approximations
- Saved horizontal linear gradients with complete cached stops and per-stop opacity;
  explicit root selection resolves existing themed stop cells without inventing rows
- Explicit root-style selection for saved themed colors and scalar line/fill formats;
  root fill patterns and opacity honor zero Quick Style fill-matrix selection
- Character runs, fonts, bold/italic/underline, text box transforms and margins;
  paragraph offsets, alignment, indentation, spacing, direction, bullet metadata,
  and cached text backdrop colors/transparency
- Page layer membership and cached visibility. MS-VSDX path visibility rules apply;
  layer colors, printability and locking are retained as metadata
- Embedded PNG, GIF and common 8-bit JPEG, with verified format signatures,
  structural validation, dimensions and byte limits. Instances share byte arrays;
  consumers must treat these as immutable and release any created object URLs
- Inherited Shape Data rows with cached types, values, units, labels and errors;
  inert hyperlink metadata with separately validated external targets

## Explicit limits

Only saved cached values, supported theme records and numeric coordinate-list literals are used. No formulas,
macros, addons, hyperlinks, external data, or network resources are executed or
fetched. Unsupported theme effects/transforms, complex paint, arbitrary-path corner rounding,
layer color overrides, nonliteral/periodic
splines, most foreign/vector records, OLE objects, APNG, uncommon JPEG coding, and arbitrary image
clipping are unsupported. Resized masters with inherited absolute geometry are
warned because their formulas are not recalculated. Master roots that themselves
inherit another master are diagnosed. Missing/unsupported features are returned
as diagnostics; unsafe or malformed packages throw `VisioPackageError`.

Text layout and raster decoding remain viewer responsibilities. Paragraph offsets
are UTF-16 offsets into `plainText`, excluding newline delimiters. Exact line
spacing is in inches; multiple spacing scales the largest font on a line. Raster
placement is local y-up inches and should be clipped to the shape frame. Header
validation does not replace browser image decoding or guarantee pixel fidelity.
Text backdrops apply behind laid-out text. Supported theme gradients expose local
y-up inch endpoints and at most 32 sorted stops. Radial and non-horizontal saved gradients, incomplete saved
gradient overrides, and unsupported color transforms retain a solid fallback and
diagnostic. Selected theme effects and unsupported line styling are diagnosed
separately. Visio-specific ignored theme attributes do not alter normalized paint.
Root fill-format selection replaces only existing `Themed` scalar caches, preserves
literal caches and leaves missing root values unresolved. Only complete saved horizontal gradients (zero or pi radians modulo turns), with
shape rotation enabled and group gradients disabled, are normalized. Existing themed
root stop cells resolve at matching indices; literal caches remain authoritative.
The first ten active stop rows are used. Hatch rendering and arbitrary saved
gradients remain unsupported; native visual equivalence is unverified.
Normalized `style.lineCap` maps directly to SVG `stroke-linecap`. An absent effective
cell leaves it undefined; consumers retain their documented fallback. Themed caps
resolve independently of line width and use Office's flat default when the selected
theme line omits its cap. Native Visio 16 SVG exports confirm cached caps 1/2 map
to butt/square. These measurements establish endpoint and dash attributes, not
complete pixel equality for every geometry and paint combination.
Normalized `style.lineDash` contains alternating dash/gap lengths in stroke-width
multiples, unlike the scene's inch coordinates. Consumers multiply by the actual
`lineWidth` without a minimum-width floor. Zero-length square-cap dots substitute
`lineDashDotLength`, which stores the native fixed 0.01-point length in inches.
`visioLineDashLengths` from the UI helper export applies both rules. The cached
built-in sequences have 2-6 entries, each at most 40. The recorder
`scripts/record-visio-line-patterns.ps1` and optional `line-pattern-native.test.ts`
compare 432 native cases: patterns 0-23, all three caps, 1/3-point strokes and
drawing scales 0.5, 1 and 2. Set `VISIO_NATIVE_LINE_PATTERNS_DIR` to the recorder
output to run the oracle. Cached
values override unused themed dashes. A requested themed pattern stays unresolved
with a solid fallback; custom pattern 254 and invalid enumerations are diagnosed.
`visioSvgStrokeStyle` applies the native SVG export policy: an exactly zero saved
weight renders at 0.75 points, including dash lengths and arrow setbacks. Smaller
nonzero weights remain literal and the model retains the raw zero width. Static
SVG clients can use this output policy. Twelve native vector cases cover round, butt
and square dots plus filled arrow 4 at zero, 0.001 and 0.75 points. Regenerate with
`record-visio-svg-zero-stroke.ps1` and select `VISIO_NATIVE_SVG_ZERO_STROKE_DIR`.
Native raster output instead uses device hairlines and different arrow sizes;
live, raster and print hairline parity remain unmeasured.
Line properties, including arrowheads, must be suppressed when geometry has
`stroke: false` or the effective `linePattern` is 0.
Rectangle rounding preserves local coordinates and winding, and honors inherited
cached line styles. Open orthogonal line chains support native-observed ordered
radius clamping on short segments, preserving endpoints. Duplicates, reversals,
compressed PolylineTo rows, curves and mixed subpaths remain
diagnosed and unchanged. See [connector rounding evidence](../../../docs/visio-connector-rounding.md).
Negative radii are ignored; radii below output precision are diagnosed.
Shape Data dates remain serial days and durations remain days; formats are retained
without locale-dependent evaluation. Raw hyperlink addresses are untrusted metadata.
Relative/file targets, external addresses with subaddresses, and unsupported link
options remain unresolved. Nothing is navigated or fetched during parsing.

## Bounded processing

Default package limits: 32 MiB input, 2,048 entries, 16 MiB per inflated entry,
128 MiB total declared/actual inflated bytes, 200:1 compression ratio, 16 MiB XML
characters, 128 XML nesting depth, 250,000 XML nodes per part, one million XML nodes
across the package, and a ten-second cooperative
deadline. ZIP validation checks local and central headers, CRCs, aliases, traversal,
overlap and unsupported encryption/ZIP64. XML rejects DTD/entity declarations and
malformed or ambiguous namespace constructs. Internal relationships must resolve
inside the package to existing parts.

Scene limits: 25,000 shapes/expanded inherited shapes, depth 64, 500,000 geometry
commands, five million text characters, 100,000 text runs, 50,000 paragraphs and 2,000 diagnostics. Raster defaults:
8 MiB each, 16 million pixels, and a maximum dimension of 16,384 pixels. Literal
curve limits include 64 KiB formulas, 256 controls and 2,048 generated segments.
NURBS uses positive-weight control-hull flatness at 0.0001 inch, with floating-point
fidelity unverified. Weighted curve work is also bounded per curve and per package.
Diagnostic strings are bounded before deduplication, with a one-million-character
aggregate cap. Metadata limits include 256-character source IDs/attribute names,
128-character geometry row types, 1,024-character fonts/inherited IDs, and
4,096-character display names. Metadata limits do not truncate document text or
geometry formulas; excessive metadata throws `METADATA_LIMIT`.
Layer membership limits are 8,192 cached characters before trimming, 1,024 tokens
per shape before deduplication, 256 characters per normalized ID, and 100,000
processed membership tokens plus five million cached characters across all pages
and inherited instances. These include duplicate tokens and whitespace. Layer
names are limited to 4,096 characters. Each page uses one indexed layer lookup.
Shape Data/hyperlink budgets are separate: 100,000 rows and five million retained
characters per document, at most 1,024 rows per shape and 8,192 characters per
metadata string. `ParseVsdxOptions.metadata` configures the aggregate limits.

Selected package and scene limits are configurable via `ParseVsdxOptions`. Runtime checks cannot preempt an
already executing JavaScript inflater chunk; output retained by the reader is
bounded. Put parsing in an application worker when hard UI responsiveness is
required.

## Local development

Run `npm run build:visio` for just this area, or the repository's normal build for
all areas. Tests: `npx vitest run src/core/visio`. Strict typecheck remains the base
repository TypeScript project. Synthetic fixture generators are not shipped.

Cached spline sequences require a preceding endpoint and one or more contiguous knot
rows. They are bounded to 256 controls, degrees 1-25, 2,048 output segments and
2 million weighted refinement/subdivision work units per curve. The package default
`maxCurveWork` is 20 million aggregate units, checked during refinement and subdivision.
Maximum degree and control counts are independent ceilings and may not be combined
within the work budget. Only clamped, nondecreasing compact knot vectors are supported;
missing numeric caches, malformed order and unsupported nonclamped/periodic
sequences omit the complete geometry section with diagnostics. Approximation uses
positive-weight homogeneous knot insertion and Bezier control-hull subdivision
with a 0.0001-inch flatness threshold. This avoids fixed-sample aliasing, but
floating-point fidelity is not certified. Generated analytic
quadratic/cubic tests cover sampled chord error, but no genuine spline-row fixture
or native Visio comparison is yet available.

## Metafile inspection and bounded worker conversion

`inspectVisioEmfAdmission` performs bounded classic-record inspection and returns
`renderingEnabled: false` in every result. No converter runs. VSDX enhanced-metafile
parts receive specific diagnostics through an inspection-only package adapter,
limited to 32 unique parts, 32 MiB aggregate bytes and 100,000 inspected records.
Parts exceeding available encoded-byte budgets are rejected from validated ZIP
metadata before inflation. Concurrent duplicate requests share a reserved promise,
and distinct inspections are queued so aggregate budgets remain deterministic.
Original-equivalent WMF comments are recognized only in their documented position
with validated lengths/flags and whole-file checksum; the payload is never decoded.
All EMF+, images, text, unresolved palette colors and INSIDEFRAME pens remain
unsupported, as do characterized converter mapping/full-circle edge cases.

`sanitizeVisioForeignVectorTree` converts a narrow unknown SVG tree to inert numeric
paths, literal paints, matrices and a closed indexed clipping graph.
`validateVisioForeignVector` validates and copies that canonical scene again after
transport or raw host input. Both return deeply frozen independent data and reject
unsafe tags, URLs, fonts, styles, sparse arrays, accessors, cycles, invalid paths,
coordinate/transform amplification and expanded clip work. These helpers are not a
metafile renderer or a guarantee of converter completeness. The private viewer renders the supported primitive subset only through its
deadline-controlled parser worker. The non-worker fallback remains converter-free.

`convertVisioMetafile` is an experimental adapter for a trusted
`emf-converter` browser-package function supplied by the host. It copies and
reinspects input, narrows admission further to stock-painted primitive shapes
and lines, fixes non-raster conversion options, and validates the resulting tree.
Its 256 KiB, 512-record, 2048-pixel limits do not establish a hard heap quota.
Use it only inside a disposable worker with a parent-owned deadline; it neither
loads Node codecs nor enables conversion by default. `parseVsdx` accepts an optional
trusted `metafileConverter` callback for worker-only use. Per-document admission
allows at most eight unique conversions and 1 MiB aggregate input. See
[bounded conversion](../../../docs/visio-metafile-conversion.md) for the exact subset. All format conversion remains in
`emf-converter`; the adapter owns admission and the inert output boundary only.

## Experimental plain-text save

`editVsdx(input, edits, options)` applies an atomic, source-backed batch of
`{ type: 'replace-plain-text', pageId, shapeId, text }` commands and returns
`{ bytes, changedParts, diagnostics }`. It edits one existing local plain-text
`Text` element per command. It does not serialize the normalized rendering model.

Untouched package part payloads retain their exact uncompressed bytes, including
unknown parts, relationships and content types. An edited XML part preserves
unrelated content semantically, not lexically. ZIP headers, comments, directory
entries, extra fields and compression representation are not preservation targets.
A no-op returns an independent copy of the original archive. Changed saves use
STORE compression to avoid introducing compression ratios outside reader limits;
files may grow and exceeding the output limit fails without returning a result.

Only VSDX drawing packages are admitted. Signed/macro-indicated packages,
deleted targets, missing/ambiguous IDs, rich text, fields and unknown text markup
are rejected for local shapes. A stencil (master) instance, or a sub-shape of a
group instance, follows what native Visio 16 saves
(`scripts/record-visio-instance-text.ps1`, checked by the optional
`VISIO_NATIVE_INSTANCE_TEXT_DIR` test): replacing all its text writes a plain
local `Text` and nothing else, even over formatted master text; over master
text with fields each inherited Field row is also marked deleted locally; a
range edit (Find and Replace, editing around a field) works on the local `Text`
or on a local copy of the master's that keeps its run and field markers. The
master's `LockTextEdit` applies unless the instance overrides it. An instance
with its own formatted text accepts range edits only. A shape that sizes
itself from its text (`TEXTWIDTH(TheText)`, `TEXTHEIGHT(TheText, ...)`, the
flowchart masters' Resize with Text) is measured again after a text, font or
text block edit and after a resize (`edit-text-size.ts`): its size and what
follows from it are saved as refreshed caches of unchanged formulas. The
measurer (`text-extent.ts`, `visioTextExtents`) uses the fonts' own advance
widths as recorded from Visio 16 (`scripts/record-visio-glyph-advances.ps1`,
`scripts/record-visio-text-extent.ps1`); `setVisioTextMeasurer` lets a UI
measure other fonts. Text that cannot be measured reliably (an unknown or
guessed font, bullets, tabs, a line that only just fits) keeps the saved size
and the result carries an `edit-text-size-kept` diagnostic; a refreshed size
carries `edit-text-size`.
Replacement text must contain valid XML
characters and cannot contain carriage returns. Edited documents containing
carriage-return text or tab/newline/carriage-return attribute values are rejected
conservatively because this slice does not establish their serialization fidelity.
UTF-16 source XML becomes declared UTF-8 only in the edited part.

Every retained payload is inflated through the bounded reader and CRC checked.
External relationships remain inert. Unknown untouched payloads are preserved as
opaque bytes; this is not a safety certification of their content. Dirty output
is re-admitted with the remaining transaction deadline. Package limits still
apply, plus defaults of 1,000 commands, one million replacement UTF-16 code units
and an output ceiling equal to `maxInputBytes`. Output is streamed with an actual
byte limit. Runtime checks are cooperative, not hard CPU/heap quotas; applications
should run editing in a disposable worker for responsiveness.

Calls own input bytes and command values before their first asynchronous step.
Each call has a fresh bounded operation lifetime; do not keep a `VisioPackage`
reader alive as an interactive editing session. No public mutable DOM is exposed.

Plain-text replacement respects effective `LockTextEdit` protection and refuses
affected or unknown text dependencies before mutation. It does not recalculate
text-dependent formulas. Rich-text content editing and master overrides remain
unsupported. VSDX logical text excludes exactly one stored terminal paragraph
marker; intentional trailing LF characters and blank paragraphs are preserved.
Legacy VSD text semantics are unchanged.

Owned native Visio 16 evidence verifies ten logical-text input cases and forty
core outputs across rectangle, ellipse, text-box creation and plain-text
replacement. Native `Shape.Text`, `Characters.Text` and reparsing native-resaved
outputs retain these logical strings. This does not establish exact text layout,
automatic text sizing or general native rendering fidelity.

## Experimental geometry transaction

The same atomic `editVsdx` transaction accepts the typed `VisioEdit` union:

```ts
{ type: 'create-rectangle', pageId, shapeId, x, y, width, height, text? }
{ type: 'create-text-box', pageId, shapeId, x, y, width, height, text }
{ type: 'move-shape', pageId, shapeId, x, y }
{ type: 'resize-shape', pageId, shapeId, width, height, anchor? }
{ type: 'delete-shape', pageId, shapeId }
```

Coordinates are drawing inches, bottom-left origin, up-positive, at the rotation
pin. Resizing without an anchor holds that pin fixed. Shape IDs are explicit canonical positive
unsigned integers. Coordinates and dimensions are bounded to one million inches;
dimensions must be positive. Existing admitted top-level local 2D shapes can be
edited, including shapes imported from another producer. There is no provenance
requirement that the viewer created the shape.

`create-text-box` requires plain text and positive fixed box dimensions. It uses
the document's saved default text style, with explicit `FillPattern=0` and
`LinePattern=0`. Assigning line color alone does not enable an outline. The same
source scope, protection and dependency checks guard creation. This command does
not model native Text Tool automatic sizing, rich-text content editing or all
template/theme defaults. The DOM-free drawing planner under `visio/ui` owns
coordinate conversion, snapped creation bounds, minimum dimensions and fresh ID
planning; UI adapters hold temporary previews and user intent.

Two owned native captures verify twelve default-style and twelve custom
`DefaultTextStyle=1` cases at drawing scales 1, 2 and 0.5, including fixed text,
multiline text, intentional trailing blank paragraphs and empty text. The custom
Text Only style uses Arial 18 pt, left/top alignment and zero margins. Actual
`editVsdx` outputs match native scene text/styles/geometry, preserve every
untouched package payload byte-for-byte, and reopen in Visio with the measured
text, style IDs, pins, dimensions, transforms and paint patterns. These 24 cases
prove saved fixed-box API behavior, not interactive Text Tool defaults or
automatic sizing. See `edit-text-box-native.test.ts` and
`scripts/record-visio-text-box.ps1` (`-CustomTextStyle`, then `-CoreOutputPath`).

Optional `anchor: { x, y }` on `resize-shape` fixes a normalized local bounds
point; each coordinate must be `0`, `0.5` or `1`, with local Y increasing upward.
For example, `{ x: 0, y: 0 }` fixes the local bottom-left corner. Anchored resize
admits ordinary local unlayered 2D leaves with supported line-based geometry or
canonical ellipses. It preserves rotation/flip values, scales unguarded local
pins proportionally, and retains guarded local-pin formulas only when their
projected values prove the same pose. Source locks, inherited protections,
affected dependency caches and coordinate limits are checked before any write.
Groups, masters, foreign shapes, glued targets, nonproportional guarded pins,
affected text fields and dimension-dependent Angle/Flip formulas are refused.
No-op dimensions preserve source payloads after admission.

The DOM-free `visioResizeDrag` helper converts physical page movement to one
anchored drawing-inch command and a preview frame. `visioSizePositionState`
returns frozen drawing-inch pin/dimension values and counterclockwise degrees;
`visioSizePositionCommand` produces fixed-pin size/move/rotation commands.
Exact current-value input returns an empty command array before unit conversion,
preserving formulas and avoiding floating round-trip changes. Both helpers use
coarse scene eligibility; source admission remains authoritative.

Native Visio 16 direct numeric cell-edit and core-output reopen evidence covers
15 cases at scales 0.5, 1 and 2. Anchored actual-edit comparisons cover 288
supported rectangle cases within 456 recorded native observations; all 288 rectangle outputs and 192
accepted ellipse outputs passed native COM reopen. The record does not establish native window behavior,
general anchored admission or visual parity. Optional tests use
`VISIO_NATIVE_SIZE_POSITION_DIR` and `VISIO_NATIVE_ANCHORED_RESIZE_DIR`; their
recorders are `scripts/record-visio-size-position.ps1` and
`scripts/record-visio-anchored-resize.ps1`.

Local unglued straight lines also admit `move-shape`: both endpoints translate
while native midpoint and length formulas remain intact. This reuses the same
protection and bounded dependency closure. Required evidence is explicit local
endpoints, positive Width, zero Height, canonical midpoint formulas, a native
endpoint-length formula or a proven explicit Width override,
an explicit Angle and one local MoveTo/LineTo geometry section. Length, angle,
local rotation pins and flips remain fixed. Horizontal, diagonal, vertical and
reversed native DrawLine cases match native caches after save/core reparse;
all six demos cover controls, undo/redo, download and reload. Native Office
reopening remains unverified. Broader 1D movement formulas and routing/glue
remain unsupported. Endpoint LockBegin/LockEnd caches and style
ancestry participate in the shared movement protection checks.

Unreferenced top-level local lines also admit `delete-shape` through the same
LockDelete and reference guards as 2D deletion. Deletion removes a whole leaf
without modifying its transform, so a height-zero or point-sized cache and
curved geometry do not need translation/resize admission. Formula or Connect
references still refuse; cascading connector deletion remains unsupported.
Native four-line deletion and all six framework save/reload routes preserve
the surviving control shape. Native Office reopening remains unverified.

Height-zero local straight lines also admit Width-cell `resize-shape` with
positive Width and Height=0. This matches native Width assignment: replace the
derived Width formula with the requested cached width, recalculate dependent
geometry/local pins, and preserve endpoint cells, midpoint formulas and Angle.
The rotation pin stays fixed. Shared line admission, protection, dimension
dependency proof and cache writeback are reused. Resized lines can move and
resize again. Four native orientations verify caches and XYToPage poses; all
six routes cover controls/history/download/reload, plus native PNG interior
comparisons for resized gradient paint. Nonzero line Height,
broader 1D resize formulas, routing/glue and native reopening remain open.

`move-line-endpoint` assigns either `endpoint: 'begin'` or `'end'` to drawing-inch
`x`/`y` coordinates on proven local unglued straight lines. Native midpoint,
endpoint-length, angle and half-dimension local-pin formulas remain intact;
the existing dependency graph recalculates their caches and geometry. The other
endpoint stays fixed. Package/master dependency admission shares one changed-cell
mapping, and worker snapshots and page-to-drawing conversion support the command.
Eight native cases verify caches and poses; twelve browser API scenarios cover
history, download and reload across six frameworks. Numeric model comparisons
allow 12-digit floating-point roundoff. Static Width overrides, flips, coincident
endpoints, broader formulas and glue remain unsupported
or unverified. Native Office reopen acceptance remains unverified.

Native combined Width-override/endpoint assignments clarify that limitation:
Width remains constant while midpoint and angle follow the raw endpoint cells.
The displayed line endpoints consequently differ from those cells. Eight native
cases verify saved poses and all-six viewing against native SVG endpoints;
source-backed endpoint commands remain refused with unchanged bytes/model.
Native pointer behavior after a Width override still needs evidence before
extending the current fixed-opposite-endpoint gesture semantics.

The shared UI now offers pointer endpoint handles on selected visible top-level
straight connectors with editable source bytes. This is visual eligibility,
not a source-formula/protection certificate: core can refuse the edit. Handles
sit above overlapping shapes, retain five-pixel radii through zoom, and use the
existing page-point and page-to-drawing conversion helpers. A preview does not
change the model; release commits once. Escape/pointer cancellation and disposal
remove it. Twelve native pointer workflows cover both endpoints across six
frameworks, with four-decimal pose/length comparisons for browser-coordinate
roundoff; the underlying API's 12-digit native tests remain unchanged. Native
snapping and keyboard handles remain unverified. Native drawing-to-page ratios
0.5, 2 and 3 now have 72 distinct
all-framework API and pointer workflows covering both endpoints, history,
download and reload. Native exported SVG independently verifies physical paper
dimensions and saved endpoint positions; unchanged page-scale metadata is
preserved byte-for-byte. Other scales and unit conventions remain unverified.

Native endpoint assignments also verify oblique linear stroke paint after API
editing, undo/redo and save/reload. Eight begin/end cases with two/three stops
and opacity cover six frameworks and live/portable output. Interior errors stay
within the existing bounds (maximum channel error four, mean below 0.885); this does
not prove exact pixels or native Office reopening. Actual pointer edits also
cover these eight paint cases across six frameworks, with saved output reloaded
before the unchanged native interior paint comparisons. Pointer poses, lengths
and physical gradient endpoints use the existing four-decimal contract; API
comparisons retain 12 digits. Other paint directions and angles remain open.

Numeric ShapeSheet interpretation uses a bounded AST, never JavaScript execution.
Arithmetic, comparisons, IF, GUARD, Width/Height scaling, local geometry/named-row
references and static Sheet.ID references have dependency analysis. MODULUS,
AND/OR/NOT and bounded BITAND/BITOR/BITXOR are supported. Bitwise inputs must be
integral scalars in 0..65535; undocumented negative/fractional coercions refuse.
Squared-length intermediates support compatible distance/SQRT calculations, but
area caches cannot be written into length or scalar cells. ATAN2 uses
(y,x); SIGN defaults to fuzz 1e-9. DL/DP/DT caches are internal inches and DA is
radians. Dimensional comparisons require explicit compatible units, such as
`Width > 3 IN`. Unknown units and unsupported compound dimensions fail. Defaults are 8,192
formula characters, 1,024 AST nodes, depth 64, 100,000 indexed cells, 10,000
affected cells and 100,000 aggregate evaluation steps per recalculation. Existing
package and transaction deadlines still apply. These are cooperative bounds.

Affected caches are computed before writeback, with F/U retained. Implicit local
and text pin/dimension dependencies participate. Unsupported known pure formulas
can remain unchanged when provably independent. Opaque, unknown-function or
dynamic dependencies fail safely. A final check refuses formulas that would
contradict the requested dimensions or fixed pin.

`F="No Formula"` is the native locally deleted/blocked formula marker, not an
expression. Its numeric cache remains usable and the marker is preserved when
setting a direct value. `F="Inh"` requires actual inheritance resolution; it is
never treated as the blocked marker. See the [Microsoft Cell schema](https://learn.microsoft.com/en-us/office/client-developer/visio/cell-element-geometry-sectionvisio-xml).
Master IDs and page IDs have separate scopes; PageSheet metadata uses its owning
Page ID. Selected/default styles, ancestry, local overrides and planned creates
are checked before saving. Unsupported affected inheritance and unknown dynamic
dependencies still refuse. Theme reads record implicit theme/QuickStyle selector
dependencies; independent caches are preserved, while affected theme evaluation
remains unsupported. THEMEGUARD is distinct from GUARD and does not protect
manual formatting. Literal double-click event handlers are inert during geometry
recalculation; transform events receive no such exemption.

Untouched active masters undergo a separate bounded independence proof. Effective
template, instance override and selected style cells are resolved in their actual
sheet scopes, including named Control rows. Static master-local Sheet references
never become page references. Missing mappings, ambiguous style inputs, inherited
fields, cycles and unknown dependencies refuse. The proof allows only direct
single-reference SETATREF and field-free local TheText measurement forms; it does
not evaluate text layout, write master caches or bypass redirection. See Microsoft's
[SETATREF](https://learn.microsoft.com/en-us/office/client-developer/visio/setatref-function),
[TEXTWIDTH](https://learn.microsoft.com/en-us/office/client-developer/visio/textwidth-function)
and [TEXTHEIGHT](https://learn.microsoft.com/en-us/office/client-developer/visio/textheight-function)
contracts. Construction is limited to 100,000 work steps and 10,000 bindings;
dependency traversal has a separate 100,000-step limit and depth 64.

Master-linked top-level 2D instances admit only a narrowly proven move: all six
transform caches must be proven lengths in their effective sources, the two rotation pins must be
unguarded direct overrides, and effective master/style movement protection must be proven
inactive. All six protection caches must be explicit scalar booleans with matching
supported static formulas.
Selected inherited protection caches must agree with their resolved ancestors,
including styles selected only by the master's template.
Width, height, aspect and deletion locks may remain active during these proven
moves; their cells and the protected dimensions remain
unchanged. This operation-specific style policy requires the owned master move
certificate; existing non-master admission policy remains conservative. See Microsoft's
[LockAspect](https://learn.microsoft.com/en-us/office/client-developer/visio/lockaspect-cell-protection-section),
[LockWidth](https://learn.microsoft.com/en-us/office/client-developer/visio/lockwidth-cell-protection-section),
[LockMoveX](https://learn.microsoft.com/en-us/office/client-developer/visio/lockmovex-cell-protection-section)
and [LockDelete](https://learn.microsoft.com/en-us/office/client-developer/visio/lockdelete-cell-protection-section)
contracts. Inherited pin guards and redirection still refuse. Only the two local
pin caches are written; dimensions, geometry, LocPin caches, master attributes
and definitions remain unchanged. Any other effective or page cache reading a
changed pin refuses the whole transaction, including transitive dependencies.
Master-linked deletion remains unsupported. A formula the proof cannot follow
(menus, add-on calls, container lookups: every Visio stencil shape has some)
no longer refuses the transaction on its own: it can only read another page
shape by naming its sheet, and naming an edited or dependent cell still refuses.
Width, Height and LocPin caches may remain inherited from a resolved master/style.
Both local cache representations and effective inherited sources undergo error/unit
checks. No missing transform cells are synthesized, and effective dimensions are
read-only transaction data keyed by the owned instance DOM.
Move preparation has an aggregate 100,000-work budget charging formula source
length, evaluation steps and cell/command checks, with deadline checks throughout.

### Stencil instances: resize, rotate, flip and format

`resize-shape`, `rotate-shape`, `flip-shape`, `format-shape` and `format-text`
accept a top-level instance of a one-shape master (`edit-instance-*.ts`). What
is written was recorded from Visio 16 with
`scripts/record-visio-instance-geometry.ps1`; the optional
`VISIO_NATIVE_INSTANCE_GEOMETRY_DIR` test compares against those recordings.

- A changed Width, Height, PinX, PinY, Angle or flip flag becomes a local value
  on the instance (a new Width or Height is tagged `U="IN"`, as Visio's).
- Every inherited cell whose value follows from it is evaluated over the
  instance's effective sheet (its own cells over the master's) and written as a
  refreshed cache marked `F="Inh"`, in the master's section and row, so the
  master's formula stays in effect. Unchanged values are not written. A
  refreshed length whose master cell has no unit of its own is tagged
  `U="IN"`, as Visio's.
- Only arithmetic, comparisons, `IF`, `MIN`, `MAX`, `BOUND`, `AND`/`OR`/`NOT`
  and references inside the instance are evaluated. A drawn cell (transform, text block,
  geometry, connection point, formatting) that depends on anything else refuses
  the edit with `EDIT_UNSUPPORTED_DEPENDENCY`. Caches in User, Property,
  Actions, Scratch and similar data sections that cannot be computed (they
  usually need text metrics) are left as saved; Visio does not recompute them on
  open, so a menu entry such as Resize with Text can stay hidden until the
  shape is next changed in Visio.
- A dimension that is not changed but follows the other one or the text
  (`Height = User.ResizeTxtHeight`) is written as a local value too, so the
  shape keeps the size asked for.
- Formatting is planned on a detached copy of the master with the instance laid
  over it and saved as local cells and partial Character and Paragraph rows.
  Stencil shapes sit on their stencil's layer; they are refused only when that
  layer is locked.
- `move-shape` takes this path when a connector is glued to the instance or the
  pin-only proof above cannot follow the drawing; cells that read the pin are
  then recomputed instead of refused.
- Visio does not lay connectors out again when it opens a file. A glued
  connector that `rerouteConnector` cannot handle (Visio's own Dynamic
  connector is a master instance) therefore refuses the move, resize or
  rotation with `UNSUPPORTED_INSTANCE_EDIT` instead of being left behind.

#### Instances of group masters

An instance of a group master (Visio's Can, Cube and Pyramid, most network and
people shapes) takes the same edits (`edit-instance-scope.ts`). Recorded with
`scripts/record-visio-group-instance.ps1`; the optional
`VISIO_NATIVE_GROUP_INSTANCE_DIR` test compares cell for cell.

- The scope of the edit is the group and every sub-shape at any depth. A
  master's formula names the master's shape IDs (`Sheet.5!Width`), a formula
  written on the page names the page's; both resolve to the instance's sheets,
  so a resize refreshes the sub-shapes' pins, sizes and geometry as `Inh`
  caches. Move, rotate and flip write on the group alone.
- `BOUND` (control handles), percentage literals and a bare constant added to
  a length (inches) are evaluated; a named `Controls` row resolves by name.
- `format-shape` and `format-text` on the group reach the group and every
  sub-shape. A cell a master protects with `GUARD`, and a sub-shape that cannot
  take the formatting (no text, a lock), is passed over, as Visio's ribbon
  does; the command fails only when every part refuses.
- A sub-shape's ID targets it alone, with its own sub-shapes when it is a
  nested group (Visio's sub-selection). There a protected cell refuses the
  command. `replace-plain-text` writes a local `Text` on the sub-shape.
- The group Visio makes for a master with several top-level shapes has no
  master shape behind it: its cells are local, and its sub-shapes follow it
  through formulas written on the page, which keep their formulas when resized.

Refused for groups: a resize when a sub-shape keeps a pin or size with no
formula (Visio scales it; that is not reproduced), a shape added to the
instance on the page, a picture inside the group, and resizing or moving one
sub-shape on its own.

Refused: masters that inherit another master, 1D masters (lines and
connectors), locally deleted sections, `GUARD`ed sizes and pins, active locks,
and another page shape whose formula reads a changed cell of the instance. A shape whose master sizes it
from its text still keeps its saved size after a text edit: `TEXTHEIGHT` needs
text metrics the core does not have.

Refused: group masters and sub-shapes of a group instance, masters that inherit
another master, 1D masters (lines and connectors), locally deleted sections or
rows, `GUARD`ed sizes and pins, active locks, and another page shape whose
formula reads a changed cell of the instance. A shape whose master sizes it
from its text follows the text where it can be measured, and otherwise keeps
its saved size (see the plain-text section).

rows, `GUARD`ed sizes and pins, active locks, a locked layer, and another page
shape whose formula reads a changed cell of the instance. A shape whose master
sizes it from its text still keeps its saved size after a text edit:
`TEXTHEIGHT` needs text metrics the core does not have.

### Stencil instances: whole-shape commands

Delete, Duplicate, Copy and Paste, ordering, layers, Group and Change Shape take
stencil instances as well (`edit-instance-shape.ts` and its neighbours). What is
written was recorded from Visio 16 with
`scripts/record-visio-instance-shape.ps1`; the optional
`VISIO_NATIVE_INSTANCE_SHAPE_DIR` test compares delete, duplicate, bring to
front, layer assignment and master replacement against those recordings.

- `delete-shape` removes the instance with its sub-shapes and leaves the master
  in the document stencil. A stencil connector (Visio's Dynamic connector)
  glued to a deleted shape keeps its end where it was: the glue and trigger
  formulas become plain values and the Connect row goes. Deleting such a
  connector removes its Connect rows. Checked: `LockDelete` in effect (the
  instance's cell, else its master's) and locked layers. Visio also steps the
  connector's `ConFixedCode` and drops a released cell that equals the master's;
  this editor leaves both as they were.
- `duplicate-shapes` and `paste-shapes` copy a 2D instance as it is: the same
  master and local cells, a new sheet ID and name (`Process.6`), the pin moved.
  Sub-shapes of a group instance take the next free IDs. A connector glued to
  the source stays with the source. A paste needs the same master under the
  same ID (its UniqueID, BaseID and NameU are captured with the clipboard) and a
  page already related to it; anything else is a paste between drawings and is
  refused. Stencil lines and connectors are not copied.
- `reorder-shape` moves an instance among its siblings, or a drawn shape past
  instances, groups and pictures. Each sibling must sit in the ordinary display
  band; an instance's band and locks come from its master when it has none.
- `assign-layers` writes a local `LayerMember` on an instance.
- `group-shapes` takes unglued 2D instances as members: each stays an instance
  and takes its group-local pin as a local value. A group that holds instances
  can be moved, rotated and ungrouped; `ungroup-shape` also turns the scaling
  formulas of a group Visio made into values. A rotated or flipped group cannot
  be ungrouped while it holds instances.
- `change-shape` with `masterId` makes a one-shape 2D instance an instance of
  another such master of the drawing: the `Master` attribute changes, the
  caches of the old master's formulas are dropped, and the caches that follow
  the shape's own size are evaluated against the new master. Position, a local
  size, text, formatting, shape data and layers stay; the page gains its
  relationship to the master's part. Visio also gives the shape a new sheet ID;
  this editor keeps it, so dynamic glue stays valid. Refused: glue to a
  connection point, glue when the size would change, a local override of the
  old master's geometry or other rows, `LockReplace` and locked layers.
- Moving, resizing, rotating or flipping an instance on a locked layer is
  refused by the core, not only greyed out by the interface.

Whole-shape commands used to be refused by any formula in the package that the
analyser called dynamic, which every Visio stencil master has (`SETATREF`,
`SHAPETEXT`, `CONTAINERSHEETREF`, event functions). `formula-functions.ts`
lists the ShapeSheet functions Visio documents, and the scope is now: a
function outside that list refuses; so does a reference built from text
(`INDIRECT`, `EVALCELL`, `EVALTEXT`, `REF`); a lookup through containers
(`CONTAINERSHEETREF` and its family) refuses only when the shape being
reordered, copied or grouped is itself a container or a list. A master's
`Sheet.N!` reference names a shape of that master and no longer collides with a
new page shape of the same ID.

This first bundle has deliberate exclusions:

| Exclusion                                              | Reason                                                  | Next expansion                                 |
| ------------------------------------------------------ | ------------------------------------------------------- | ---------------------------------------------- |
| Master-linked delete, group masters and foreign shapes | Nested transforms and resource semantics are not proven | Group instance overrides and instance deletion |

| Resizing group masters; foreign shapes | Nested transforms and resource semantics are not proven | Group instance overrides |
| Glue/Connects participation and broader 1D editing | Proven straight-line translation does not establish connector routing or glue | Endpoint editing and glued connector routing |
| Non-page affected/unknown dependencies | Page metadata, document, master and style scopes can otherwise retain stale caches | Scoped package-wide graph, starting with page metadata and pure theme functions |
| GUARD, SETATREF and referenced transform formulas | Direct overwrites would bypass protection/redirection or discard semantics | Verified redirection commands; never bypass protection |
| Protected cells and inherited/ambiguous protection | LockMoveX/Y, LockWidth/Height/Aspect/Delete must be honored | Proven effective protection resolution |
| Absolute geometry lacking dimension-dependent formulas; nonlinear geometry | Scaling cached coordinates can distort shape semantics | Additional row evaluators and explicit scaling proofs |
| Deletion referenced outside a removed set | Retained formulas, Connects or metadata could dangle | Explicit validated dependency-removal and connector-healing transactions |

Relative MoveTo/LineTo geometry scales with Width/Height. Absolute MoveTo/LineTo
coordinates require a supported transitive dependency on dimensions, except zero
coordinates. Formula graph cycles, error caches, unknown affected dependencies
and incomplete recalculation refuse the whole transaction.

Contract, independent review and preservation tests cover the admitted synthetic
subset and hash-pinned public corpus. Of 19 admitted drawings, seven accept rectangle
creation. Existing shapes in blue-box (page 0/shape 75), color-boxes (0/68),
qs-box (0/75) and test_text_extraction (0/1) each accept separate move, resize and
delete commands with round-trip and untouched-payload preservation assertions.
The latter also verifies combined move/resize, mutation isolation and unchanged
Router master instances. Two candidates remain refused: test (0/1) has explicit
container membership dependencies; 60973 (0/11) has ambiguous IDs and unsupported
dynamic dependencies on other pages. Thirteen drawings have no candidate in the test's first-page scan;
this is not a claim about every shape on every page. Ten malformed inputs retain
their expected admission failures. Native Visio reopen/fidelity is unverified.
An additional master-linked Pentagon in test_text_extraction (0/3) accepts move
and inverse-move only, with parsed scene translation and unchanged geometry,
siblings, inherited caches and every untouched ZIP payload verified separately.
This adds a move candidate without extending the resize/delete corpus counts.
The separate bounded scan of 71 top-level non-group master-linked instances
admits twelve moves: this Pentagon, the Router (0/2) in the same POI drawing, bgcolor
(0/1, 0/2, 0/3), dwg (0/1, 0/2, 0/3, 0/4) and fdo86664 (0/1, 0/2, 0/3). All eleven additional
inherited-transform instances have hash-pinned pristine move/inverse-move tests.
The other 59 refuse safely: one unsupported geometry, 54 unsupported package
dependencies and four unknown dependencies. The two newly admitted shapes retain
their inherited active LockAspect cells through move and inverse-move tests. Successful
output preserves geometry and untouched payloads; every scan input stays unchanged.
Affected master caches, container membership changes and connector routing still
require explicit supported recalculation before their editing scope can expand.
