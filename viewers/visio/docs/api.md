# Viewer API

The framework-neutral API behind every viewer package. Each framework package
(`visio-react-viewer`, `visio-vue-viewer`, `visio-angular-viewer`,
`visio-svelte-viewer`, `visio-solid-viewer`, `visio-vanilla-viewer`) forwards
the same handle methods and events; see `packages/bindings/README.md` for the
native props, events and lifecycle of each adapter. Rendering and editing are
beta features; the [capability ledger](parity.md) lists what is missing.

## Mount and load

```ts
import { mountViewer } from 'visio-vanilla-viewer';
const viewer = mountViewer(container, {
	zoom: 1,
	events: { 'document-error': (error) => console.error(error) },
});
await viewer.load(file); // Blob, Uint8Array or ArrayBuffer
viewer.fit();
viewer.update({ pageIndex: 1 });
const snapshot = viewer.exportSvg(); // SVG string, dimensions, byteLength and diagnostics
const prepared = viewer.createPrintSnapshot(); // Frozen current-page artifacts, no printing
viewer.destroy(); // idempotent; later commands reject
```

Importing the module is SSR-safe; mounting and element registration are
browser-only. `ViewerController` is DOM-free, so another renderer can subscribe
to the same state/events. `renderPage` is the SVG renderer port. See
[architecture](architecture.md) for the module ownership.

## Select shapes

Every mounted/native handle exposes `selectShapes(targets)`, `selectAll()` and
`clearSelection()`. A target has `{ id, name, pageId? }`; omitted `pageId` means
the current page. `controller.state.selectedShapes` is an ordered, immutable
array, and its first item is the primary `selectedShape`. The existing
`shape-select` event reports that primary item; `selection-change` reports the
complete array. These states are available through each framework's native hook,
composable, signal or store. Vue emits `selection-change`; Angular exposes
`selectionChange`; all six adapters accept `events['selection-change']`.

Shift, Ctrl or Meta clicking toggles a shape. Background clicks and Escape clear
selection. Hidden/deleted targets are removed, selecting a group excludes its
descendants, and changing pages/documents clears selection. Select All includes
visible foreground shapes. Single-target text and geometry panels require
exactly one selected shape. Home formatting and deletion operate atomically on
multiple selected shapes; source protection of any target rejects the batch.

## Create a blank drawing

Every mounted/native handle and the shared element expose
`createBlankDrawing(options?: CreateVsdxOptions): Promise<void>`. The controller
offers the same method. Optional `width` and `height` use physical inches;
defaults are 8.5 by 11 with one empty page and a 1:1 drawing scale. File > New >
Blank Drawing and Ctrl+N call the same lifecycle. Editable controls keep their
native shortcut behavior.

An accepted New request replaces the document, selection and history, and the
element names it `New drawing.vsdx`. Source bytes can be exported immediately;
`dirty` records subsequent edits. Superseded loads, cancellation and disposal
cannot accept a late result. State changes flow through each binding's existing
reactive state API.

## Pointer movement and marquee selection

Dragging an eligible local 2D shape moves the current selection by a common
translation. A four-client-pixel threshold preserves ordinary clicks. The preview
changes only SVG presentation; releasing submits one atomic source edit. Escape,
lost pointer capture, source/page/selection changes and tool changes cancel it.
Movement uses physical page coordinates and converts to drawing units in core,
preserving saved rotation and local pins. Source protections remain authoritative.

Dragging blank page space selects fully enclosed visible foreground shapes using
their transformed width/height extents. Shift, Ctrl or Meta adds to the current
selection. Pointer movement currently excludes masters, groups, layers, foreign
objects and glued connectors. Resize handles and connector routing are separate
capabilities; resize handles are described below, while routing remains outside
this gesture scope.

## Resize handles and Size & Position

The shared pointer tool shows eight resize handles for one eligible local 2D
shape. Edge handles change one dimension; corner handles change both. The
opposite edge or corner stays fixed in the shape's saved rotated/reflected local
axes. Saved off-centre local pins scale proportionally where source proof allows
it. During dragging, only the selection frame previews the new bounds; releasing
submits one source edit and one undo step. Crossing the opposite handle clamps
the dimension at the smaller of its original size and 1/16 physical inch without
changing flip flags. Snapping, aspect-modifier gestures, full-content preview and
multi-shape resize are not implemented.

View > Task Panes > Size & Position opens the shared numeric pane. X/Y are the
rotation pin in drawing inches from the bottom-left origin, with Y increasing
upward. Width and height also use drawing inches, independent of physical page
scale. Angle uses degrees, positive counterclockwise. Enter or leaving a field
commits that field once; Escape restores its saved value. Width/height changes
in this pane hold the rotation pin fixed, unlike the anchored pointer handles.
Exact current-value input leaves source bytes, formulas and history unchanged.
Drafts survive zoom and other edits on the same source/selection; replacement or
a different selection clears them.

Both controls require source-backed VSDX and one ordinary local, unlayered,
unglued 2D shape with saved pins. Groups, masters, foreign objects and multiple
selection are unavailable. Scene eligibility is preliminary: core checks source
geometry, protections, formulas and dependencies on submission. A rejection
shows an error without changing source bytes or history. Cancellation, disposal
and newer source/page/selection intent prevent a pending edit from accepting.

The core `visioSizePositionState(page, shapeId)` helper supplies frozen numeric
state. `visioSizePositionCommand(page, shapeId, field, value)` returns ordinary
edits, an empty array for exact no-op input, or `undefined` for an invalid or
unsupported candidate. Custom controls can use these helpers with the existing
atomic editing API. Unit strings, formula entry and changing the pin position
are not supported by the numeric pane.

## Find diagram text

The shared search controls find literal text across visible shapes and pages.
Programmatic hosts use `controller.setSearchQuery(query)`, `nextSearchResult()`,
`previousSearchResult()` and `selectSearchResult(index)`; immutable
query/results are available in `controller.state.search`. Querying leaves
selection alone until explicit navigation. A new document clears the search, and
newer reentrant host actions supersede old result navigation.

Search returns one result per matching shape, with a bounded text preview. It
uses ECMAScript lowercase comparison, not regex or language-aware collation.
Limits are 256 query characters, 500 matching shapes, 32,768 indexed characters
per shape and 2 million indexed characters overall. The status explicitly
identifies partial results. Hidden subtrees and suppressed group text are
excluded; background pages are indexed once as separate pages. Per-occurrence
highlighting and Shape Data search are not implemented.

## Display layers

Use the shared Layers controls or any mounted/native handle's
`setLayerVisibility(pageId, layerId, visible)` to override display visibility.
`visible: null` restores one saved flag; `resetLayerVisibility(pageId?)` resets
one source page or the entire document. Source-page IDs distinguish foreground
and background layers. Frozen overrides are available in
`controller.state.layerVisibilityOverrides`.

Layer changes synchronize rendering, selection and search without changing the
document. Guides, NoShow and incompletely described legacy hidden shapes cannot
be revealed by a layer override. The accessible panel shows at most 200 unique
layers and announces truncation; the API allows at most 25,000 document-scoped
overrides. SVG and print artifacts continue to use saved visibility. Layer
colors, editing and saved print policy are not implemented.

## Ribbon add-in tabs

A host can add tabs after Help, as an add-in does in Visio. `ribbonAddIns` is a
property of the element and a prop of every framework binding, and
`office-ribbon-add-in` is part of the event map:

```tsx
const tabs = [
	{
		id: 'reports',
		label: 'Reports',
		groups: [
			{
				label: 'Export',
				commands: [{ id: 'export', label: 'Export', icon: 'save', run: () => exportReport() }],
			},
		],
	},
];

<VisioViewer
	ribbonAddIns={tabs}
	events={{ 'office-ribbon-add-in': ({ tab, command }) => track(tab, command) }}
/>;
```

Vue takes `:ribbon-add-ins` and emits `office-ribbon-add-in`; Angular takes
`[ribbonAddIns]` and has the `(ribbonAddIn)` output; the vanilla binding takes
`mountViewer(host, { ribbonAddIns })` and `viewer.update({ ribbonAddIns })`. On
the element itself, set `element.ribbonAddIns` and listen for the DOM event.

A command runs its `run` callback and then raises the event. Leaving the prop
out keeps the current tabs; an empty array removes them. Passing an equal
descriptor again, as a framework does on every render, keeps the panels and
only replaces the callbacks. The descriptor (`RibbonAddInTab`, from
`ooxml-core/ribbon`, also exported by `ooxml-ui` and every framework package) is
shared with the Word, Excel and PowerPoint editors. A tab cannot take the id of
a built-in tab (`home`, `insert`, `design`, `data`, `process`, `review`, `view`,
`help`).

## Static SVG export

`exportPageSvg(model, pageIndex, { maxBytes })` and each mounted/native handle's
`exportSvg()` return a current-page snapshot without changing the document,
selection or viewport. Export includes supported backgrounds, embedded raster
resources and visible compatibility notes in SVG description/metadata. SVG export
has no remote assets or automatic downloads. The demo downloads only after an
explicit button press.

The UTF-8 ceiling is 16 MiB; callers can lower it. Conservative preflight checks
can reject content whose eventual serialization would be smaller. Fonts are not
embedded and text/layout remain approximate. Physical page dimensions are
preserved; downstream rasterizers must cap their output dimensions and pixel area
before allocating an image surface. PDF, bitmap export and print layout remain
unimplemented.

Optional Linux secondary pixel tests run with
`node scripts/test-svg-rasterization.mjs` after building, using system Python 3,
librsvg/Cairo and the core's native canvas dependency. These checks are separate
from browser or Microsoft Visio validation.

## Prepare drawing-page artifacts

`createPrintSnapshot(model, { pageIndices: [0, 2] })` preserves explicit page
order and returns deeply frozen, separate SVG records with drawing dimensions and
all export diagnostics. Each mounted/native handle's `createPrintSnapshot()`
captures its current page. It rejects document replacement during preparation
without changing view state. There are no frames, dialogs, downloads or printer
commands.

The snapshot uses saved display appearance. Layer Print, NonPrinting and saved
printer settings are not applied; drawing dimensions are not printer paper or
print scale. The result includes these limitations. Guards bound selected pages,
aggregate bytes, repeated backgrounds, raster dimensions, text/path work and
repeated whole-model validation. Callers may lower limits. Separate SVGs must
remain isolated because their internal resource IDs can repeat. This is
preparation for a future print workflow, not native Visio printing support.

## Scoped Find and Replace

Home > Find > Replace and Ctrl+H open the shared replacement controls. Find Next,
Previous, Replace and Replace All use full, literal, case-sensitive occurrences.
Scopes are Selection, Current page and All pages. Selection includes selected
group subtrees in ordered-selection/source order, with overlapping targets
deduplicated. Page scopes use saved source order, including hidden source text.
Navigation wraps and selects a visible target when possible. Match case is
checked and currently fixed; whole-word, case folding and special search codes
are not implemented. These scope/traversal rules are bounded application policy,
not a claim of native Find dialog equivalence.

Every native binding exposes the same `controller`: hosts can use
`captureTextReplaceToken(scope)`, `getTextReplaceOccurrences(token, query)`,
`selectTextReplaceOccurrence(token, occurrence, query)`,
`planTextReplacement(token, { query, replacement, mode, current? })` and
`applyTextReplacePlan(plan, token)`. Navigation and application return a fresh
opaque token. Retain that token to keep the original selected scope while moving
between matches. Manual selection/page changes, source replacement or another
operation invalidate prior tokens. `cancelTextReplace(token)` cancels only that
token's active application, leaving newer unrelated edits running. Plans and tokens belong to their controller
and cannot be forged or reused across instances.

Replacement uses one atomic source edit and one undo edge, including cross-page
result navigation. Native `document-change`, `selection-change` and `shape-select`
events remain available through the framework callbacks. Replace All preserves
selection; current replacement advances to the next occurrence. A same-text
replacement keeps exact source bytes and adds no history while still navigating.
Unsupported matched rich, field-bearing, master-linked, protected or dependent
text refuses the entire batch. The draft displays the error and remains editable.
Closing the controls or changing intent cancels its pending operation.

## Experimental local plain-text editing

After `load(bytesOrBlob)`, select a local shape and use the shared text controls,
or call `replacePlainText(pageId, shapeId, text)` on any mounted/native handle.
`undo()` and `redo()` use bounded document history; `cancelEdit()` cancels
pending work. All six adapters forward the same methods and `document-change`
event, whose detail is `{ document, dirty, kind: 'edit' | 'undo' | 'redo' }`.
Inspect `controller.state.edit` for source availability, busy/dirty status,
undo/redo availability, history truncation, errors and diagnostics.

Source-backed VSDX documents loaded or created by the viewer can be edited or
exported as VSDX.
Binary VSD v11 imports use the released ole2 codec through ooxml-core: supported
explicit page/shape transforms, move/line geometry and plain text are previewed
with diagnosed fallback styles. Original legacy bytes remain privately retained;
editing, undo/redo and VSDX export are disabled for legacy sources. Earlier binary
versions, groups/masters, complex geometry, stencils, templates and macro-enabled
formats remain unsupported. Assigning a model with `document` does not supply
editable package bytes. Core validation rejects master-linked shapes, rich text,
fields, signed packages and macro-enabled content. XML/package edits run in an
isolated worker; framework wrappers do not implement format logic. Plain-text
edits refuse affected or unknown text-dependent formula caches instead of leaving
them stale, and respect effective `LockTextEdit` protection. VSDX logical text
excludes its stored terminal paragraph marker while retaining intentional
trailing LF characters and blank paragraphs. Legacy VSD text semantics are
unchanged. Rich-text content editing remains unsupported.

`exportVsdx()` returns `{ bytes, dirty, diagnostics }` for an explicit downloaded
copy. It does not overwrite the source file, upload it or claim native round-trip
fidelity. The shared UI downloads only after the user's explicit action. History
is bounded and may discard older undo states, reported by `historyTruncated`.
Plain-text replacement remains limited to the admitted subset above. The
formatting and geometry operations below have separate admission rules. Native
reopen evidence covers specific recorded cases, described in the
[verification record](verification.md); it does not establish general fidelity.

## Experimental formatting and arrangement

The Home ribbon and `applyEdits()` share `format-text`, `format-shape` and
`reorder-shape` commands. Text formatting includes saved font families, point
size, bold/italic/underline/strikethrough, color, bullets, indentation and
horizontal/vertical alignment. Shape formatting includes solid fill and line
color/weight, line patterns 0-23, fill patterns 0-24, background color and
transparency. Formatting requires ordinary local leaf shapes. Whole-shape text
formatting updates each effective character or paragraph row while preserving
run markers, text, unrelated style bits and supported cached fields. Character
and paragraph formatting have separate source admission; vertical alignment
does not rewrite either section. Protected or ambiguous rows and affected
formula dependencies reject the complete transaction. Font-size increase and
decrease require a uniform size; the size picker can set a mixed-size selection.
Local Character/Paragraph `F="Inh"` cells are editable when their ancestor and
cached value/units can be proven. Cacheless delegation requires a real ancestor;
an explicit formatting choice creates a local override even if its value is
unchanged. Top-level inherited protection and transform cells remain guarded.
Fonts must already exist in the source drawing. Stacking commands support
front/back/forward/backward on one ordinary top-level shape in display band zero.

`format-shape` accepts `linePattern`, `fillPattern`, `fillBackgroundColor`
(`'#RRGGBB'`), `lineTransparency` and `fillTransparency` (percent from 0 to 100).
Transparency is rounded to half-percent steps, with ties upward. Fill transparency
sets foreground and background together. Pattern 0 means no paint; pattern 1 is
solid. Explicit `linePattern: 1` enables an outline independently of line color.
An explicit fill pattern overrides the solid pattern implied by `fillColor`;
`fillColor: 'none'` with a nonzero fill pattern is rejected. Active gradient
transparency requires explicit paint replacement, while ordinary inherited solid
theme paints are supported.

The shared Line menu exposes No Line and built-in patterns. Both paint menus'
More Options and the shape context menu open the Format Shape task pane, which
applies each change at once as one selection transaction. Mixed source values
show as empty until changed. `fillColorTheme`, `lineColorTheme` and (on
`format-text`) `fontColorTheme` name the Theme Colors swatch a colour came
from, so it is saved as Visio's theme formula; `beginArrow`, `endArrow`,
`beginArrowSize`, `endArrowSize`, `lineCap` and `rounding` set the line ends,
cap and corner rounding. All six native bindings use the existing `applyEdits()` and
reactive document/selection events; no framework-specific paint engine is added.
`visioShapeFormattingState(shapes)` provides aggregate source paint values for
custom controls. These values are separate from gradient/tile opacity multipliers.

Six Align commands align to the first selected shape. Position provides equal
horizontal and vertical edge spacing for three or more shapes. The core
`visioArrangeCommands(page, selectedIds, action)` helper produces atomic edits
for hosts with custom controls. It measures rotated width/height boxes, orders
distribution by centers and preserves selection order for ties. Groups, masters,
layers and glued connectors remain outside its admission scope. These actions
share history, selection retention and VSDX download/reopen with other edits.

## Experimental duplication

`duplicateSelection(): Promise<void>` on the controller and every mounted/native
handle duplicates admitted selected shapes on the current page. Home's Paste
menu, the shape context menu, Tell me and Ctrl+D call the same method. Text
inputs retain their native keyboard behavior. Duplicate does not use the system
clipboard.

The core `visioDuplicateCommand(page, selectedIds)` helper produces a
`duplicate-shapes` source command with fresh page-local IDs. Copies retain source
XML, mixed text and stacking order, receive fresh names without copied unique
IDs, and move 0.33 drawing inches right and down. Source validation currently
admits local unglued 2D leaf shapes, excluding masters, groups, foreign content,
layers, ambiguous identities and unsupported dependencies. Pin protection and
affected formula caches are checked before accepting any source change.

The resulting copies become the selection in one atomic history step. Undo
restores the original selection and redo the copies unless a newer selection or
page action supersedes it. Failed, cancelled or superseded operations cannot
partially change source bytes or selection. The ordinary `selection-change` and
`document-change` events expose the accepted result to native framework state.

## Experimental shape clipboard

Every mounted/native handle exposes `copySelection()`, `cutSelection()` and
`pasteSelection()`, each returning `Promise<void>`. Invoke them from a user
gesture so the browser can grant clipboard access. Home, context menus, Tell me
and Ctrl/Meta+C, X and V use the same shared adapter. Text inputs retain native
clipboard behavior. Clipboard failures appear in the viewer without changing
source bytes, history or selection. Cut writes the clipboard before deleting;
if protection prevents deletion, the copied shapes remain on the clipboard and
the viewer reports that they could not be cut.

The payload is bounded `text/plain` with the `OOXML-VISIO-SHAPES/1` marker. It
contains captured shape XML and required source context, so editing or cutting
the originals does not invalidate the copied content. Paste always reads the
current system clipboard; it does not silently reuse an internal previous copy.
Native Microsoft Visio clipboard formats, arbitrary text, images and Paste
Special are not supported. Pasted shapes receive fresh IDs/names and an offset
of 0.33 drawing inches right and down. Repeated paste uses this same offset;
native paste cascade and cross-page placement are not established.

The first supported scope is ordinary local unglued 2D leaves with matching
document font/style/theme definitions and page settings, ordinal, background
context and drawing ratio. References must remain inside the copied selection.
Groups, masters, layers, foreign content, relationship-bearing fragments,
unsupported formulas and resource import remain refused. Core validates the
entire payload before an atomic source edit. Paste selects its copies and shares
Duplicate's bounded history and selection-intent rules.

`controller.state.clipboard` exposes immutable `ready`, `preparing` and `error`
state through each framework's existing reactive subscription. Source capture
runs in a cancellable worker and is invalidated by selection, page, visibility
or document changes. Hosts providing their own clipboard transport can use
`captureClipboardToken()`, `prepareClipboardSelection(token)`,
`getPreparedClipboard(token)`, `cutPreparedSelection(token)` and
`pasteClipboardText(text, token)` on the controller. Tokens reject stale actions.
The DOM-free core exports `captureVisioClipboard`, `serializeVisioClipboard`,
`deserializeVisioClipboard`, the `paste-shapes` edit and the
`visioPasteCommand(page, clipboard, offset?)` command builder.

## Experimental geometry editing

The shared geometry controls expose create rectangle, move, resize and safe
delete. Every native/mounted framework handle also forwards
`applyEdits(edits: readonly VisioEdit[])` for an atomic batch through the same
worker, history and cancellation path.

Home > Text Tool and Insert > Text Box use the same shared fixed-size text-box
draft. Drag blank page space, enter plain text, then use Add text box or
Ctrl/Meta+Enter; Escape cancels it. Empty drafts do not create source shapes;
intentional spaces and newlines are preserved. Clicking an existing shape with Text Tool selects it and reveals
the existing text-edit controls. Rectangle, ellipse and line drawing use the
same guarded creation lifecycle. Their internal controller transaction captures
source, page, ordered selection, zoom and visibility intent before drawing,
checks that intent before source acceptance, and selects created shapes in the
same undo step. Newer intent or disposal supersedes a pending creation. Internal
creation tokens are not an additional native binding API.

All six public handles accept the new ordinary command through `applyEdits()`:

```ts
await handle.applyEdits([
	{
		type: 'create-text-box',
		pageId: '0',
		shapeId: '10',
		x: 4,
		y: 5,
		width: 3,
		height: 2,
		text: 'Text with an intentional trailing blank paragraph\n',
	},
]);
```

Text is required. The saved default text style supplies the initial character
formatting. Explicit `FillPattern=0` and `LinePattern=0` make the new box
paint-free; changing line color alone does not enable an outline. Fixed-size
draft creation does not establish native GUI Text Tool defaults, automatic text
sizing or rich-text content editing. Generic `applyEdits()` keeps its existing
selection behavior; the shared drawing tool owns the created-shape selection.
Native evidence covers 24 saved fixed-box API cases at three drawing scales,
using default and custom Text Only/Arial 18 pt styles, with core outputs reopened
in Visio. These saved-style cases do not measure interactive GUI defaults; see
the [verification record](verification.md).

Insert > New Page routes through the existing source-backed page insertion
command, then selects the new page. It shares the page bar's insertion behavior,
undo/redo and source admission; this does not add template-backed page creation.

```ts
await handle.applyEdits([
	{
		type: 'create-rectangle',
		pageId: '0',
		shapeId: '9',
		x: 4,
		y: 5,
		width: 3,
		height: 2,
		text: 'New shape',
	},
	{ type: 'move-shape', pageId: '0', shapeId: '1', x: 6, y: 7 },
]);
```

Coordinates are rotation-pin positions in drawing inches, bottom-left origin,
up-positive. Resizing holds the pin fixed unless the command includes
`anchor: { x, y }`. Each anchor coordinate is `0`, `0.5` or `1`, identifying the
fixed point in the shape's normalized, upward local width/height bounds. For
example, `{ x: 0, y: 0 }` holds its local bottom-left corner fixed. Anchored
resizing has a separate source proof for local pins, affected caches and fixed
rotation/flip values. IDs are explicit. Existing admitted
local top-level 2D shapes can be edited, including shapes imported from other
producers. Core evaluates supported affected numeric ShapeSheet dependencies and
preserves untouched ZIP payloads. The viewer never mutates XML itself.

This is a narrow admitted subset. Masters/groups/foreign shapes,
connectors/glue, unsafe protection/redirection, unsupported affected formulas,
ambiguous package dependencies and referenced deletion fail with a visible
error. Relative line geometry scales; absolute line geometry needs a supported
dimension dependency. See the core
[`src/core/visio/README.md`](https://github.com/ChristopherVR/ooxml/blob/main/src/core/visio/README.md)
for the command contract, numeric limits, exclusion reasons and next expansions.
The [capability ledger](parity.md) records the current admitted set, which now
also includes bounded primitive master-instance moves with explicit local pins.

Generated/imported simple-shape tests and a local Chrome workflow pass. The 19
accepted public corpus diagrams currently admit zero geometry edits because
non-page dependency scope cannot yet be proved independent. Thirteen also lack an
eligible local shape. Practical editing coverage for that corpus remains blocked;
next work is a scoped package/master/theme dependency graph and master-instance
editing, followed by glued endpoint routing. Native reopen has since been
verified for the specific formatting and arrangement captures in the
[verification record](verification.md); general fidelity remains unverified.
