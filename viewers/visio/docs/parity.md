# Visio capability ledger

## Line jumps, Ruler & Grid, Snap & Glue and a horizontal legend, 2026-10-10

Four commands that were shown disabled now work, each as one undoable edit of
the drawing:

- Design > Connectors > Show Line Jumps. Connectors that cross are drawn with
  a jump, by the page's LineJumpCode (none, horizontal lines, vertical lines,
  last or first displayed) and LineJumpStyle (arc, gap, square, two to seven
  sides), on screen and in SVG export. The toggle writes LineJumpCode 1 or 0.
  A page without the cells jumps on horizontal lines with arcs, as recorded
  from Visio 16.
- View > Show > Ruler & Grid (the group's launcher). Ruler subdivisions and
  zero point, and the grid's spacing (Fine, Normal, Coarse, Fixed), minimum
  spacing and origin, per axis, saved as PageSheet cells. The canvas grid, Snap
  to Grid and the rulers follow them.
- View > Visual Aids > Snap & Glue (the group's launcher). Whether snapping and
  gluing are active and the Snap to and Glue to lists, saved as the drawing's
  DocumentSettings.
- Data > Insert Legend > Horizontal.

A drawing written with these edits was opened in Visio 16, which read every
cell and setting back with the saved values and saved the file again.

Not matched, or approximate:

- Only routable or glued connectors with straight segments jump or are jumped;
  curved connectors and lines drawn with the Line tool do not. The jump width
  is an estimate (Visio's base size is not documented), and "last routed line"
  is treated as last displayed. The per-connector jump cells (ConLineJumpCode,
  ConLineJumpStyle, ConLineJumpDirX/Y) are not read, and the Layout & Routing
  dialog still has no line jump page.
- The variable grid's steps at 100% (1/4, 1/2 and 1 inch for Fine, Normal and
  Coarse) are read off Visio's window. Normal and Coarse rulers show a half
  and a quarter of the subdivisions, which is a rule of this editor.
- Snap & Glue acts on Snap (grid and guides), Glue and Glue to connection
  points. The other choices are saved for Visio only, and the dialog says so.
  The bit meanings follow Visio's VisSnapSettings and VisGlueSettings
  enumerations and were not checked against Visio's dialog box by box. Snap to
  Grid still needs View > Grid on, where Visio snaps to a hidden grid too. View
  > Dynamic Grid stays a per-viewer toggle and does not write
  > DynamicGridEnabled; the Advanced tab (snap strength, extensions, angles) is
  > not built.

Still disabled, with one plain sentence each:

- Not built yet: Review > Check Accessibility (how Visio stores a shape's alt
  text was not recorded, so there is no honest Alt Text edit to pair it with),
  the Text dialog's Tabs tab, Data Graphics Position, Configure and Auto Space,
  Data Graphic Fields, Advanced Data Graphics and Link Data.
- No bundled data or codec: Review > Thesaurus, Insert > Object, Chart and CAD
  Drawing, Import Rules From.
- Not possible in a browser editor: SharePoint Workflow, New Window, Arrange
  All, Cascade, Switch Windows, Macros, Add-Ons and Ink.

## Stencil groups and their parts, 2026-10-10

Stencil shapes that are groups (Visio's Can, Cube and Pyramid, most network and
people shapes) are edited like single stencil shapes. What is saved was recorded
from Visio 16 (`scripts/record-visio-group-instance.ps1`) and matches it cell
for cell for Can, Cube and the nested Pyramid; files saved here reopen in Visio
with every part still bound to its master.

- Resize handles, Size & Position, dragging, nudging, Rotate and Flip work on a
  stencil group; its parts follow through the master's formulas.
- Fill, line and text formatting of a group reaches every part, as Visio's
  ribbon does. A part whose master computes its own colour (the shaded faces of
  the Cube) keeps it.
- A second click inside a selected group sub-selects one part: it takes fill,
  line and text formatting and its own text. Its size and place stay with the
  group.
- A master with several top-level shapes drops from the Document Stencil as one
  group, as in Visio.

Still refused, each with a plain sentence:

- Resizing a group one of whose parts keeps a size of its own (Visio scales
  such a part; that scaling is not reproduced). It still moves and rotates.
- A group that holds a picture, or a shape added to it on the page.
- Moving or resizing one part on its own; filling a part whose master protects
  its fill.
- A master whose top-level shapes are turned or flipped is not dropped.
- Text formatting only reaches the parts that already hold text; Visio also
  stores the style on parts without text.
- Groups drawn on the page (not from a stencil) still move but do not resize.

## Shapes that size themselves from their text, 2026-10-10

A shape whose size follows its text now follows it here too: a text box whose
height is `TEXTHEIGHT(TheText, Width)`, a label as wide as `TEXTWIDTH(TheText)`,
and the flowchart shapes' Resize with Text. After a text edit, a font, size or
weight change, a text block change or a resize, the size and everything that
follows from it (pin, text block, geometry, connection points, the menu cells
that show or hide Resize with Text) is computed again, and connectors glued to
the shape are laid out again. On a stencil shape the new values are saved as
caches of the master's formulas, which stay in effect.

Recorded from Visio 16: TEXTWIDTH is the widest line from the font's own
advance widths, without hinting or kerning, plus the advance of one space and
the left and right margins. TEXTHEIGHT is 120% of the font size per line
(or the paragraph's own line spacing) plus the top and bottom margins, wrapped
at the given width less the side margins.

Measured against 192 recorded strings (Calibri, Arial and Segoe UI, regular and
bold, 8 to 24 pt, with and without margins): every width is within 0.011 pt of
Visio's. Of 960 wrapped heights, 948 are equal and 12 are left undecided. For a
flowchart Process shape that Visio grew for a long label, shrinking it and
typing the label again writes the same cached values Visio wrote, cell for
cell. Four drawings saved here (11 pt, regular and bold) reopened in Visio with
the height Visio itself computes.

Kept at the saved size, with a note in the edit's diagnostics, instead of
writing a doubtful size:

- A font the measurements do not cover. Built in: Calibri, Calibri Light,
  Arial, Segoe UI and Times New Roman, regular and bold, printable ASCII. In
  the browser other installed fonts, italics and other characters are measured
  with the browser's fonts at a 1% tolerance; a font that is not installed is
  never measured. That browser path is not compared with Visio.
- A font that is not known for sure: a missing font cell, or one taken from a
  theme's font scheme. A themed font where no font theme is selected resolves
  to the No Style root font, as in Visio.
- A line that fits or overflows by less than the tolerance (0.05% with the
  built-in tables).
- Bulleted paragraphs, tab characters, right-to-left paragraphs, superscript,
  subscript and small caps.
- A size formula that needs more than arithmetic around the two text
  functions, another shape whose formulas read the resized shape, and a glued
  connector that cannot be laid out again.

Not done: paragraph spacing and indents are applied as modelled but were not
recorded from Visio. While typing, only the editing frame grows (around the
shape's middle, or away from the edge the text is aligned to); the shape takes
its new size when the text is saved.

## Visio's Dynamic connector, 2026-10-10

Visio's own connector is a stencil shape (a master instance). Until now every
edit of it, or of a shape glued to it, was refused. It is now laid out again
the way Visio saves it, recorded from Visio 16 with
`scripts/record-visio-instance-connector.ps1` and compared cell for cell:

- A shape glued to a Dynamic connector can be moved, resized and rotated,
  whether it is drawn or from a stencil; the connector follows. For the
  recorded cases (a level run, one bend, a plumb run, a resized and a rotated
  shape, an end on a connection point) the saved connector equals Visio's.
- The connector takes Design > Connectors (right-angle, straight, curved),
  can be moved, and shows its two end handles: dragging an end away unglues it
  as Visio does, and dropping it on a shape or a connection point glues it.
- The Connector tool and AutoConnect glue to stencil shapes, and stencil shapes
  made of one shape are obstacles a right-angle connector routes around.
- The Dynamic connector in the Document Stencil can be dropped on the page: a
  connector with two free ends, saved as Visio saves a dropped one.
- The side each end takes follows Visio for the recorded positions: straight
  across between facing sides (with one jog close to the first shape when they
  are not level), sideways and then up or down when the shapes overlap or
  nearly meet in height, otherwise up or down and then in from the side.
- Drawn shapes in a drawing that has an end glued to a stencil shape's
  connection point, or a connector with a free end, can be edited again; the
  checks that guard saved values no longer stop at those two formulas.

Files written this way were reopened in Visio 16: every connector kept its
master, its glue and its path.

Still different or refused:

- When the simple path is blocked, the shared router finds the detour. Visio
  may end on another side of the shape (in the recorded detour it ends on the
  top of the second shape, this editor on its left).
- An end on a connection point is approached like a free point; Visio takes the
  side the point sits on into account.
- A curved connector is this editor's single cubic, not Visio's curve, and a
  curve between ends less than a quarter inch apart in one direction is drawn
  as the straight run.
- A stencil connector whose master is not built like the Dynamic connector, a
  connector inside a group, and routing styles other than right-angle,
  straight and curved (tree, organization chart, flowchart directions) are
  refused with a sentence that says so.
- Connectors are not rerouted when an unrelated shape is moved onto them, and
  there are no line jumps.
- The dropped connector is not put on the Connector layer Visio adds.
- Duplicating or copying a stencil connector is still refused.

## Whole-shape commands on stencil shapes, 2026-10-10

A shape dropped from a stencil (a master instance) now takes the commands that
act on the shape as a whole, and stays an instance of its master through each.
What is saved was recorded from Visio 16 (`scripts/record-visio-instance-shape.ps1`
in the core); delete, duplicate, bring to front, layer assignment and master
replacement are compared with those recordings cell for cell, and every file
written in the checks reopened in Visio 16 with the expected masters, sizes and
glue.

- Delete removes the shape and leaves its master in the Document Stencil. A
  connector from a stencil (Visio's Dynamic connector) that was glued to it
  keeps its end where it was and loses the glue, as in Visio. Deleting such a
  connector works too.
- Duplicate (Ctrl+D), Copy, Cut and Paste copy the shape as an instance of the
  same master. A connector glued to the original stays with the original.
- Bring to Front, Send to Back and the one-step forms work on a stencil shape,
  and on a drawn shape that sits among stencil shapes, groups or pictures.
- Assign to Layer writes the membership on the stencil shape.
- Group takes stencil shapes that have no connector glued to them. The group
  can be moved, rotated and ungrouped; a group Visio made is ungrouped too.
- Change Shape on a stencil shape lists the other shapes of the Document
  Stencil and makes the shape an instance of the one picked. It keeps its
  place, its own size if it has one, its text, formatting and layers.
- Moving, resizing or rotating a stencil shape on a locked layer is refused by
  the core as well as greyed out.

Before this, any drawing made in Visio refused Duplicate, Copy, ordering,
Group and new text boxes outright, because every stencil master carries
formulas the editor treated as unsafe (`SETATREF`, `SHAPETEXT`, a container
lookup). They are now refused only for what they can disturb: a function the
editor does not know, a reference built from text, or a container lookup when
the shape concerned is itself a container.

Still refused, with a plain reason:

- Lines and connectors from a stencil are not duplicated, copied or grouped.
- Pasting a stencil shape into another drawing, or onto another page: the
  clipboard needs the same master and the same page settings.
- Grouping or ungrouping shapes that have a connector glued to them, and
  ungrouping a rotated or flipped group that holds stencil shapes.
- Change Shape when a connector is glued to a connection point of the shape,
  when a glued connector would have to follow another size, or when the shape
  changed its master's outline by hand. A drawn shape still changes to a Basic
  Shapes outline, not to a master; a stencil shape changes to a master, not to
  an outline.
- Deleting a group that was made here, and duplicating a drawn shape that has a
  connector glued to it.

Different from Visio: Change Shape keeps the shape's sheet ID where Visio
assigns a new one; a grouped stencil shape gets a plain position in the group
where Visio writes formulas that scale it with the group; a released
connector keeps its routing code.

## Theme colour formulas, the full Format Shape pane and the Custom colour tab, 2026-10-10

What every swatch of Visio 16's Fill, Line and Font Color galleries writes was
recorded through UI Automation, and the pickers now do the same:

- A Theme Colors swatch is saved as Visio's formula over the resolved colour:
  `THEMEGUARD(THEMEVAL("AccentColor"))` for a base swatch,
  `THEMEGUARD(MSOTINT(THEMEVAL("AccentColor"),80))` for a lighter one and a
  negative percent for a darker one. Applying a theme, changing its variant or
  clearing it recalculates those colours on the page, as Visio does. Files
  written this way opened in Visio 16 with the formulas intact and the same
  colours Visio computes.
- The grid has Visio's columns (White, Black, Light, Dark, Accent 1-6) and its
  row of seven variant colours, with the page theme's own Light and Dark. A
  drawing without a theme shows the colours Visio shows there.
- More Colors is Office's Custom tab (the shared `office-ui-color-custom`): a
  hue and saturation square, a luminance slider, Hex, Red/Green/Blue and
  Hue/Sat/Lum fields.
- The Format Shape task pane has Fill (none or solid, colour, transparency,
  pattern and pattern background), Line (colour, transparency, width, dash,
  cap, rounding, begin and end arrow type and size) and Effects (shadow, glow,
  soft edges, reflection). Line ends, cap and rounding are new `format-shape`
  properties, saved as Visio saves them. The Fill & Line and Format Shape
  dialogs are gone: the menus' More Options and Options commands and the shape
  menu's Format Shape open the pane at the matching section.

Still different from Visio:

- Gradient fill is listed in the pane but disabled: gradients are drawn, but
  there is no edit for stops, angle or type. Compound lines, join type, bevel
  and 3-D rotation are not offered either.
- Arrow types are numbered (Arrow 1 to Arrow 45) with no preview, and fill
  patterns are numbered with no swatch.
- Visio also rewrites `FillBkgnd` with a `SHADE` formula when a fill colour is
  picked; this editor leaves the background as it was.
- The Standard Colors row is Office's, not Visio's slightly different ten.
- Recent colours last for the session of one viewer; they are not saved with
  the drawing.
- Format Painter still does not copy arrowheads or rounding.
- Excel (ribbon and Format Cells) and Word now use the same shared colour
  grid. PowerPoint does not yet: each of its five framework bindings has its
  own swatch-grid component.

Evidence: `src/core/visio/theme-color-ref.test.ts` (recorded formulas and
colours, theme changes), `edit-formatting-line-ends.test.ts`,
`src/ui/src/form/color-custom.test.ts`, `color-grid.test.ts`,
`viewer-color-menus.test.ts`, `viewer-format-pane.test.ts`, and the browser
workflows `color-picker.spec.ts`, `paint-properties.spec.ts` and
`themes-effects.spec.ts`.

## Masters in the package, 2026-10-10

A shape dragged from a built-in stencil is now what it is in Visio: an instance
of a master that the drawing carries in its own Document Stencil.

- The first drop of a built-in master (Basic Shapes, Basic Flowchart Shapes,
  Miscellaneous Flowchart Shapes, Arrow Shapes) copies the master into the
  drawing (`masters.xml`, a master part, relationships and content types,
  created when the drawing has none); later drops reuse it. A drawing that
  already has a master of that name, such as Visio's own Process, gets an
  instance of its own master instead of a second one.
- Shapes window drops and activation, Quick Shapes, AutoConnect and the sample
  drawing all add instances. Change Shape on a stencil shape swaps its master
  and, as recorded from Visio, keeps position, size, text, formatting and
  whole-shape glue and renames the shape after the new master.
- A dropped instance is named as Visio names it (`Process`, then `Process.7`),
  joins the master's layers (the Flowchart layer is added to the page for the
  flowchart masters) and grows an Auto Size page.
- Connectors glue to a dropped instance and follow it when it moves or is
  resized. A dropped one-shape instance keeps its master's size beside its pin
  as inherited caches, the form Visio saves for inherited cells; an instance
  with only its pin, as a fresh Visio drop has, is read through its master.
- Quick Shapes lists the drawing's own masters first. A stencil file the
  drawing docks that has no built-in stand-in is listed by its file name as
  unavailable. The stencil a drawing docks is the one showing; its Document
  Stencil is listed folded.

Checked against Visio 16 through COM, hidden: the sample and drawings with
dropped, resized, restyled, connected and changed instances open without
repair with every instance bound to its master, the masters listed in the
Document Stencil, names, layers and sizes as written; a file Visio saved again
is edited further here and the next drop reuses the master Visio kept. Visio
rewrites the tail of a master's `UniqueID`, so ours are written in that form.

Limits:

- The masters are this editor's outlines in the drawing's default styles: no
  icon (Visio draws one), connection points, Shape Data or control handles.
  The theme look of a drop is saved on the instance, not in the master.
- Change Shape keeps the shape's ID (Visio gives the changed shape a new
  one). It offers the built-in shapes and the other one-shape masters of the
  Document Stencil, through one core edit. It is refused while a connector is
  glued to one of the shape's connection points, and for groups. A shape with
  connectors glued to it keeps the size it shows.
- A connector cannot be glued to a group instance; the refusal says so.
- The sample's boxes and shapes added from the Shapes window are instances.
  They are deleted, duplicated, copied, ordered, grouped, resized, formatted
  and connected like drawn shapes (`sample-drawing-edits.test.ts`); the
  limits of those commands on stencil shapes are in the sections below.
- Layers are not assigned to the sub-shapes of a group master, and a locked
  page layer leaves the drop on the master's inherited membership.

## Inline Quick Styles, Themes and Variants, 2026-10-10

Home > Shape Styles > Quick Styles, Design > Themes and Design > Variants are
rows of tiles in the ribbon with a More button that opens the whole gallery, as
in Visio. They are the shared `office-ui-gallery` in its inline mode. A tile in
the row applies at once; the row of Themes starts at the page's theme when that
lies beyond the first tiles, and a page without a theme shows four empty,
disabled Variants tiles.

The ribbon does not fold its groups, so the viewer's width sets the number of
tiles: seven, six and four at 1860 px and wider, down to two each, and the
labelled drop-down buttons again at 760 px and narrower. Not matched: Visio's
row scrolls with up and down arrows above the More button, and its Quick Styles
row shows the theme's Variant Styles; this row is the first Theme Styles row.

## Collapsing ribbon groups and the External Data window, 2026-10-10

A window too narrow for the ribbon no longer scrolls it sideways under a
scrollbar. Groups collapse into one button each, from the right (on Home:
Editing first, Clipboard last), and the button opens the group's commands in a
popup; Escape, a click elsewhere or a chosen command closes it. Host add-in
tabs collapse the same way. Below 761 px the phone layout (the Tools
disclosure) is used instead and nothing collapses. The External Data window is
now the shared task pane (title and close button), with the recordset picker
and link commands in a bar above the grid.

Still different from Visio:

- Visio first shrinks large commands to small ones and galleries to fewer
  columns before it collapses a whole group; here a group is either full or one
  button.
- The Home tab is wider than Visio's (about 1620 px against about 1180 px), so
  Editing already collapses on a 1600 px window where Visio still shows it.
- Key tips do not reach commands inside a collapsed group.
- The External Data window is docked under the drawing and cannot be floated,
  resized or docked elsewhere.

## Office colour picker and Format Shape task pane, 2026-10-10

Home > Fill, Line and Font Color open Office's colour picker (the shared
`office-ui-color-grid`) instead of a short fixed list: Theme Colors (ten
columns, each a base colour over five lighter and darker variants, by Office's
luminance rule), Standard Colors, No Fill or No Line, Recent Colors and More
Colors. More Colors is a dialog with a hex field and Red, Green and Blue; a
custom colour is then listed under Recent Colors in every picker for the
session. The current colour of the selection is marked.

The Shape Styles launcher opens a Format Shape task pane instead of a dialog:
Fill (No fill or Solid fill, colour, transparency) and Line (No line or Solid
line, colour, transparency, width, dash type). It follows the selection and
each change is applied at once as one undoable `format-shape` edit per selected
shape.

Limits, stated plainly:

- Superseded by the section at the top: theme swatches are now saved as theme
  formulas, the grid has Visio's columns, More Colors has the Custom tab, and
  the pane has patterns, line ends, cap, rounding and effects.
- Recent Colors are not saved with the drawing or between sessions, and there
  is no Automatic font colour.
- Not compared with Visio pixel for pixel; the pane's layout was not measured
  against Visio's.

Evidence: `src/core/color/theme-palette.test.ts` (variant rule and colours
against Office's swatches), `src/ui/src/form/color-grid.test.ts`,
`viewer-color-menus.test.ts`, `viewer-format-pane.test.ts`, and the browser
workflow `e2e/visio/color-picker.spec.ts`.

## AutoConnect, 2026-10-10

View > Visual Aids > AutoConnect works and is on by default, as in Visio. With
the Pointer tool, resting the mouse or pen on a top-level two-dimensional shape
shows an arrow outside each side. Resting on an arrow opens a mini toolbar with
the first four Quick Shapes of the current stencil (the stencil opened last in
the Shapes window, else Basic Shapes). Choosing one adds it in that direction
and glues a right-angle connector from the source to it; the shape, its theme
style and the connector are one undo step. Clicking the arrow itself connects
to the neighbouring shape it points at, or adds the first Quick Shape when no
shape is there.

Spacing was recorded from Visio 16 through `Shape.AutoConnect`: the gap between
the two facing sides is the page's "space between shapes" (0.375 in. on a new
drawing), and a place that is already taken moves on by one shape and gap (to
the right for up and down). The core's right-angle router now shares the space
between two close facing sides, so the connector across the gap is one segment.

Different from Visio:

- The gap is always 0.375 in.; the page's own AvenueSizeX/Y is not read.
- A neighbour is the nearest connectable shape within 2 in. of that side that
  overlaps the source across the direction. Visio's rule is not documented and
  was not measured.
- Arrows show without Visio's short hover delay, and there is no live preview
  of the shape before it is added.
- Stencil instances (master-linked shapes), groups and connectors have no
  arrows, because the core cannot glue to them yet.
- Arrows are a mouse and pen aid. Touch and the keyboard do not show them; the
  Connector tool covers both.
- After adding, the new shape and its connector are both selected; Visio
  selects only the new shape.

Evidence: `src/core/visio/ui/auto-connect.test.ts`,
`src/ui/src/visio/viewer-auto-connect.test.ts` and `e2e/visio/auto-connect.spec.ts`
on all six framework demos.

## Document Stencil and the drawing's own stencils, 2026-10-10

The Shapes window now follows the open drawing, as Visio's does:

- A drawing with masters lists them first as its Document Stencil, each drawn
  from its own master geometry (without text) and named by its Name or NameU.
  Dragging one onto the page, or activating it, adds a real master instance:
  a shape that names the master and carries only its pin, which is what Visio
  writes for a drop. A group master gets one sub-shape per master sub-shape.
  The page gains its relationship to the master part when it has none.
- The stencils a drawing docks (the Stencil windows of `visio/windows.xml`)
  open with it: Basic Shapes, Basic Flowchart Shapes and Arrow Shapes stand in
  for Visio's `BASIC`, `BASFLO` and `ARROWS` stencil files. The first stencil
  the drawing docks is the one showing (its Document Stencil when it docks
  none of them); the others start folded. The sample flowchart docks Basic
  Flowchart Shapes.
- Basic Flowchart Shapes has Visio's fourteen masters, names, order and drop
  sizes (Process, Decision, Subprocess, Start/End, Document, Data, Database,
  External Data, Custom 1 to 4, On-page reference, Off-page reference). The
  other flowchart outlines moved to Miscellaneous Flowchart Shapes.

Checked against Visio 16 through COM, hidden: the stencil's master names and
sizes; that drawings with instances dropped by this editor (a single-shape
and a group master) reopen with every instance bound to its master; and that
the sample reopens with `BASFLO_U.vssx` docked.

Limits:

- A line or connector master that is not built like Visio's Dynamic connector
  and a master with more than one top-level shape are listed disabled with the
  reason; they cannot be dropped. The Dynamic connector itself drops as a
  connector (see the section above).
- A dropped instance is not put on the master's layers and gets no name
  (Visio names it `Process.5`), and the page is not grown to hold it.

- A 1-D master (Dynamic connector) and a master with more than one top-level
  shape are listed disabled with the reason; they cannot be dropped.
- The built-in stencils are this editor's own outlines, not Visio's masters:
  no connection points, Shape Data or shapesheet behaviour. Stencil files
  (.vssx) are never opened; a docked one without a built-in stand-in is
  listed by its file name as unavailable.
- Masters cannot be edited, renamed or deleted. (Names, layers, page growth
  and built-in masters joining the drawing: see "Masters in the package".)
- Previews use the first 200 masters and no page theme.

## Right-angle connectors route around placeable shapes, 2026-10-10

Right-angle connectors drawn here now avoid other shapes the way Visio's do.
Recorded from Visio 16 (`scripts/record-visio-connector-route.ps1`):

- Visio routes a dynamic connector around placeable shapes only (`ObjType` 1).
  A shape left at `ObjType` 0 stays in a connector's way, and Visio sets
  `ObjType` to 1 on both shapes when a dynamic connector is glued to them.
- Its detour turns 3/16 inch before the shape and passes 3/16 inch over it.

Implemented to match: gluing a connector marks its targets placeable (an
`ObjType` that is already set, or computed by a formula, is left alone); when a
right-angle connector is drawn, re-glued or laid out again because a glued
shape moved or was resized, the route goes around the other local placeable
shapes of the page with the same 3/16 inch clearance, and the drag preview
shows the same route. For the recorded scene (two shapes with a three-inch-tall
placeable shape between them) the first turn and the height of the detour equal
Visio's. A file saved this way opens in Visio without repair, with the route
and both glue records intact.

The search is PowerPoint's orthogonal connector router, moved to
`ooxml-core/geometry` and shared by both products.

Not Visio's router, and still different:

- Visio picks the glued sides together with the route; here the sides are the
  nearest pair, chosen first. In the recorded scene Visio ends on the top of
  the second shape and this route ends on its left side.
- Only a connector being laid out is routed. Dropping or moving an unrelated
  shape onto an existing connector does not reroute it (Visio does).
- Master instances are not obstacles, because their size and `ObjType` can live
  in the master. At most the 24 nearest obstacles are considered.
- No spacing between parallel connectors, no Re-Layout. (Line jumps are drawn
  now; see the section on them above.)
- Visio's own Dynamic connector (a master instance) still cannot be rerouted or
  re-glued here. The recorded instance keeps `PinX`, `PinY`, `LocPinX`,
  `LocPinY`, `TxtPinX`, `TxtPinY` and the TextPosition control as inherited
  formulas with local caches, `Width` and `Height` as `GUARD` formulas whose
  form changes with the route (`GUARD(0.25 in)` for a straight run), and its
  Geometry as partial overrides of the master's rows. Writing that form needs
  the master's rows, the text position rule and more recorded cases; it is not
  done, and such connectors are refused with a message rather than rewritten.

- No line jumps, no spacing between parallel connectors, no Re-Layout.
- Visio's own Dynamic connector is now laid out again (see the section above).

## Stencil shapes: move, resize, rotate and format, 2026-10-10

Shapes dropped from a stencil (master instances) made of one plain shape now
take the resize handles, Size & Position, Rotate and Flip, the rotation handle,
dragging and nudging, and fill, line and text formatting (ribbon, Format Shape,
Text dialog, Format Painter, Rotate Text). Before, only their text could change.

- Saved as Visio saves it, recorded from Visio 16: the changed size, pin, angle
  or format cell becomes a local value on the shape, and every inherited cell
  that follows from a new size or position (pin, text block, geometry,
  connection points) gets a refreshed value that keeps the master's formula. For
  Visio's Process, Decision, Document and Data flowchart shapes the drawn cells
  written equal Visio's; files written this way were reopened in Visio 16, which
  showed the new size, position, angle and formatting with the master's formulas
  still in place.
- Stencil shapes sit on their stencil's layer. That no longer blocks them; a
  locked layer still does. Drawn shapes assigned to a layer stay as before.
- Drawn shapes in a drawing that also holds stencil shapes can be moved and
  formatted again: the checks that guard saved values no longer stop at the
  menu, add-on and container formulas every Visio stencil shape carries.

Not done, each refused with a message instead of a wrong result:

- A stencil shape with a stencil connector glued to it that is not built like
  Visio's Dynamic connector cannot be moved, resized or rotated. The Dynamic
  connector itself now follows (see the section above).
- Stencil shapes made of several shapes (groups), stencil lines and connectors,
  and shapes inside a group instance.
- A master formula outside plain arithmetic on the shape's own cells, when a
  drawn cell depends on it.
- A stencil shape whose master sizes it from its text follows the text only
  where the text can be measured (see the section on shapes that size
  themselves from their text); otherwise it keeps its saved size.

## Ribbon tabs checked against Visio, add-in tabs, 2026-10-10

The groups and commands of every tab were read from Visio 16 through UI
Automation and compared with this ribbon. Changed to match:

- Home > Paragraph has Rotate Text. As recorded from Visio, each use adds 90
  degrees to `TxtAngle` and leaves the text block's size and pin alone; it
  needs a top-level two-dimensional shape.
- Insert > Pages is New Page (it was Blank Page); Online Pictures is gone,
  because Visio has no such button.
- Data has Visio's five groups: External Data, Data Graphics (with Position,
  Configure and Auto Space), Display Data, Show/Hide (with Data Graphic Fields)
  and Advanced Data Linking.
- Process has SharePoint Workflow; Review has Accessibility and Ink; View >
  Show has the Ruler & Grid launcher and Visio's order of check boxes.
- The title bar centres the drawing's name and keeps the account at the right.

Commands added only for the match are disabled and say why in their tooltip:
Position, Configure, Auto Space, Data Graphic Fields, Link Data, Advanced Data
Graphics, the four SharePoint Workflow commands, Check Accessibility, Ink and
the Ruler & Grid launcher.

Still different from Visio:

- Icons are the shared monochrome line icons, not Visio's coloured ones.
- View > Views keeps Full Screen, which Visio does not have.
- A narrow ribbon scrolls; Visio collapses groups into buttons.
- The Shapes window opens the Basic Shapes stencil for every drawing; Visio
  opens the stencils saved with the drawing (Basic Flowchart Shapes for a
  flowchart).

A host can add its own tabs after Help (`ribbonAddIns`, see the API page), as
an add-in does in Visio. No add-in tab ships with the viewer.

## Comments, Shape Reports, Check Diagram and Subprocess, 2026-10-09

Review comments are read from `visio/comments.xml` (the Visio 2013 and later
`AuthorList` and `CommentList`, related from the document part) into the model,
together with Visio 2010 `Annotation` section rows, which are shown read only.
Review > New Comment, Comments Pane, the shape and page context menus' Add
Comment and File > Info > Add Comment open the shared ooxml-ui comments pane.
Visio's comments are flat, so the comments on one shape (or on the page) read as
one conversation: a reply adds another comment on the same shape, Resolve sets
Visio's `Done` flag on all of them, and Edit (own comments, by the shared
profile name) and Delete change single entries. The author is the File >
Account profile name (or "Anonymous"). The core creates the comments part, its
relationship and the content-type override when the drawing has none; at most
10 000 comments of up to 16 384 characters are kept. Commented shapes and the
page show a count marker on the canvas that opens the conversation. Not
supported: Visio for the web's threaded comments, @mentions, comment
positioning on the page, and native Visio reopen of core-written comments (not
yet verified in Visio).

Review > Shape Reports lists the shapes of the current page or of every
foreground page (page, ID, name, type, master ID, size, pin, text and visible
Shape Data values; group members after their group) with Export CSV (a local
download, formula-like text neutralised) and Copy (tab-separated text). Visio's
report definitions (`.vrd`), Excel/XML output, filters and grouping are not
supported.

Process > Check Diagram runs this viewer's own generic rules: connectors glued
at one end only, shapes named like connectors glued at neither end, connectors
glued to the same shape at both ends, shapes entirely off the page, shapes
stacked exactly on another shape, and shapes with no text that draw nothing,
grouped into Connectivity, Placement and Content rule sets that Rules to Check
turns on and off. The Issues window lists them; choosing one selects the shape.
Ignore This Issue hides the selected issue for the session only: Visio keeps
ignored issues in the document's `Validation` element with its own rule sets,
which this viewer neither evaluates (Import Rules From stays disabled) nor
writes. The Flowchart, BPMN and other built-in Visio rule sets are not
reproduced.

Process > Create New inserts a page after the current page and links the
selected shape to it with a page hyperlink; Create from Selection moves the
selected top-level shapes to a new page (same positions) and replaces them with
one rectangle labelled and linked with the page name; Link to Existing links the
selected shape to another page. Each is one transaction and one undo step.
Create from Selection admits only shapes the shape clipboard admits (unglued,
unlayered, local leaves without outside references) and refuses shapes with text
fields or formulas reading the page number, count or name. Visio's subprocess
shape master and its automatic page-name synchronisation are not reproduced.

## Layout, layers, selection, guides and output, 2026-10-09

- **Design > Re-Layout Page** (gallery: Flowchart top to bottom, Flowchart left to
  right, Hierarchy, Compact Tree, Circular) and the **Layout** group launcher
  (style, spacing, current page or selection). The connector graph comes from the
  page's Connect rows (connector begin to end); the layout is a small layered
  (Sugiyama-style: cycle breaking, longest-path or breadth-first layers, barycenter
  ordering) placement, an indented tree or one circle per connected component, with
  unconnected shapes in a grid after them (shared `geometry/graph-layout.ts`). It is
  applied as one batch of `move-shape` edits (one undo step); connectors with the
  viewer's own dynamic glue follow through core glue recalculation. Not Visio's
  layout engine: no connector routing styles, no page resizing, no container or
  swimlane awareness; Visio-saved glue, masters, locked and protected shapes are
  left in place (counted in the status message) or refused by core admission.
- **Home > Arrange > Position > Auto Align & Space** clusters shape centres into
  rows and columns, snaps each cluster to a shared centre line and spaces rows and
  columns evenly (at least 0.25 in). It does not follow connector flow as Visio's
  command does.
- **Home > Editing > Layers > Assign to Layer...** writes `LayerMember` on
  top-level shapes and can add new layers to the page's Layer section in the same
  transaction (`assign-layers`). Mixed memberships stay per shape. Groups, locked
  layers, formula-driven membership and formulas reading `LayerMember` are refused.
  Layered shapes on unlocked layers can now be moved; formatting, resizing,
  duplication, grouping and ordering of layered shapes are still refused.
- **Home > Editing > Select > Select by Type...** selects by shape type (shapes,
  groups, connectors and lines, text-only shapes, pictures and objects), by layer
  or by master ID (master names are not modelled; an instance name labels each).
- **Home > Paste Special...**: Visio shapes (the viewer's own shape clipboard),
  Unformatted text (a new text box) and Picture (PNG, JPEG or GIF through the
  picture insertion edit). Needs the browser's clipboard read permission;
  Picture needs `navigator.clipboard.read`. No other formats.
- **View > Guides**: page guides (`Type="Guide"` shapes) are drawn when shown;
  drag from the top or left ruler to add one, drag one to move it, click and
  Delete to remove it (`create-guide`, `move-guide`, `delete-guide`). Moving
  shapes snaps to shown guides. Guides that shapes are glued to are refused;
  shapes are not glued to guides; guides are not printed or exported.
- **View > Dynamic Grid** snaps moving shapes to other shapes' edges and centres
  with alignment hints. Not Visio's spacing hints or grid-relative snapping.
- **View > Task Panes > Drawing Explorer**: a dialog tree of pages, layers, shapes
  (with group members) and masters used; activating an item navigates or selects.
  It is not a dockable pane and does not list styles, fonts or foreign data.
- **File > Export > Create PDF/XPS Document**: one picture page per foreground
  page at the drawing's page size (150 dpi JPEG, capped at 4096 px), written by
  the shared `ooxml-ui` PDF page writer. Text is not selectable and nothing is
  vector; XPS is not offered. **Change File Type** offers VSDX, SVG, PDF and PNG
  only.
- **Help** (F1) and **Show Training** open the viewer guide
  (christophervr.github.io/ooxml/visio/) in a new tab with `noopener`; there is no
  bundled help or training content.
- New Window, Arrange All, Cascade and Switch Windows stay disabled: the viewer
  shows one drawing window.

## Presentation Mode, 2026-10-09

Presentation Mode (F5, the View tab command and the status-bar button) shows the
current foreground page fitted to the screen on a dark backdrop, read only, with
background pages composed under it as in the drawing window and the viewer's
layer visibility applied. Right, Down, Page Down, Space, Enter and a click go
forward; Left, Up, Page Up and Backspace go back; Home and End jump to the ends;
a typed page number then Enter jumps to that foreground page; Escape exits. A
small page indicator with previous, next and exit buttons sits in a corner. The
show renders its own copy of each page, so the drawing window's page, zoom and
selection are unchanged on exit. It uses the Fullscreen API when the browser
allows it and otherwise covers the viewer element itself (in the Office suite
that is the editor area, not the whole window). Full Screen moved off F5 and
stays on the View tab. Not supported: Visio's touch swipe gestures, hyperlink
navigation and shape-data screen tips while presenting, a pen or laser
pointer, and presenting on a second monitor.

## Themes, variants and more shape effects, 2026-10-09

Design > Themes is a shared `office-ui-gallery` with No Theme and six built-in
themes defined as data in core (`theme-builtins.ts`): Office, whose accents are
the Office fallback colours Quick Styles already used, and five themes original
to this project. They are not Microsoft's theme set. Applying one sends a
`set-page-theme` edit (its own transaction): core writes the theme as a DrawingML
`a:theme` part through the shared `drawingml` writer, with Visio 2012 theme
extensions (scheme IDs, background colour, four variant colour schemes, connector
format scheme, font styles, variant style schemes), adds its document
relationship and content type the first time, and sets the page's ThemeIndex,
ColorSchemeIndex, EffectSchemeIndex, ConnectorSchemeIndex, FontSchemeIndex,
VariationColorIndex and VariationStyleIndex. The scheme IDs (1000-1005) and
extension URIs are this project's own; Microsoft Visio has not reopened these
parts, so whether it recognises them is unverified. Shapes whose paint is
`THEMEVAL()` recolour through the page selectors when the drawing is read again;
local shapes quick-styled while the drawing had no theme (including dropped
Basic Shapes masters) carry the exact fallback `RGB()` colours, and those are
turned into `THEMEVAL()` so they follow the theme. Dropped masters now use
variant colour 1 (Quick Style colour 100), so Design > Variants recolours them.
Shapes with other colours, master instances and LockFormat or LockThemeColors
shapes are left alone. No Theme sets those page cells to 0 and turns such shapes
back into their fallback colours (or, when the document has a verified No Style
root, leaves Visio's root formats to apply); the theme part stays in the
package. Design > Variants shows the page theme's four variants and changes
VariationColorIndex and VariationStyleIndex. Variants > More lists Colors, Fonts,
Effects, Connectors and Embellishment disabled with reasons: theme fonts are
written but text does not follow them, theme effect styles are not rendered and
custom colour sets are not written. Themes apply to the current page only.

Home > Effects > Glow (No Glow, 5/8/11/18 pt in the page theme's Accent 1-6 at
60% transparency, Glow Options), Soft Edges (none, 1 to 50 pt) and Reflection
(tight, half and full, touching or 4 or 8 pt offset) write GlowColor,
GlowColorTrans, GlowSize, SoftEdgesSize, ReflectionTrans, ReflectionSize,
ReflectionDist and ReflectionBlur through the `format-shape` edit, with the same
admission as shadows. The parser models them and the SVG renderer draws them
with filters: glow as a dilated, blurred copy in the glow colour beneath the
shape, soft edges as the geometry masked by its eroded, blurred alpha, and
reflection as the geometry mirrored about the shape's bottom edge and faded by a
gradient mask (text is not reflected). Theme-selected effect cells are not
drawn. Bevel and 3-D Rotation stay disabled: they need a 3-D renderer. These are
approximations; no pixel comparison with Visio has been made.

The Effects menu's Options commands open the Format Shape dialog (shared
`office-ui-dialog`) with Fill (colour, transparency), Line (colour, width, dash
type, transparency) and Effects (shadow preset, glow, soft edges, reflection)
sections; only changed fields are sent, as one undoable `format-shape` edit per
selected shape. Arrowheads, gradients, bevel and 3-D rotation are not in it.
(Since 2026-10-10 the Shape Styles launcher opens the Format Shape task pane.)

Evidence: core tests (theme part written and read back by the Visio and shared
readers, relationship and content type once, page selectors, recolouring and
variants through `parseVsdx`, No Theme, rejections; effect cells, round trip,
scene validation, rejections) and UI tests (Themes and Variants galleries,
effect presets with checked state and SVG output, Format Shape dialog, undo).

## Quick Styles and outer shadows, 2026-10-09

Home > Shape Styles > Quick Styles is the shared `office-ui-gallery` with Visio's
theme style grid: seven colours (Dark 1 and Accents 1-6) by six style matrices
(Subtle to Intense). A pick sends one `format-shape` edit with `quickStyle`; core
writes the QuickStyle Fill/Line/Font/Shadow colour cells, the Fill/Line/Effects/Font
matrices and QuickStyleVariation 0, and resets fill and line pattern and
transparency and every character colour so the style shows, as Visio does when
it applies a style. When the shape's theme context resolves (the parser's own
resolver, run before writing), fill, line and character colours become
`THEMEVAL()` with a `Themed` cache and render from the document theme. Without a
theme (new drawings, for example) they get fixed colours from an approximation of
the Office theme styles (`visioFallbackQuickStyle`), written as `RGB()`; these are
not the colours Visio itself would choose for a theme-less drawing. Gallery tiles
always preview the fallback colours. No tile shows which style is applied.

Effects > Shadow offers No Shadow and nine outer offset presets. Core writes
ShdwPattern, ShdwForegnd (black), ShdwForegndTrans 60%, ShapeShdwType 1,
ShapeShdwOffsetX/Y (3 pt) and ShapeShdwBlur (4 pt, 8 pt for Center) on the shape.
The parser now models a saved simple shadow (colour, opacity, page offset, blur)
and the SVG renderer draws it beneath the geometry as an offset, blurred copy
mapped through the shape's rotation and flips; themed shadow cells, oblique and
scaled shadows are diagnosed, not drawn. Bevel and 3-D Rotation stay disabled
with their reasons (Glow, Soft Edges and Reflection: see above).

Both edits use the existing admission: local, unlayered, ungrouped non-master
shapes only, LockFormat and guarded cells refuse atomically, and a numeric
theme formula cache that would go stale refuses with
`EDIT_UNSUPPORTED_FORMAT_DEPENDENCY` (`Themed` caches are exempt because readers
resolve them from the current selectors). Undo/redo uses the source history.
Evidence: core tests (cells written, parseVsdx round trip, theme-resolved and
fallback colours, shadow model and scene validation, rejections), UI tests
(gallery and shadow routing, enablement, checked preset, SVG shadow) and a
production suite run in Chromium styling three dropped Basic Shapes. Native Visio
reopen and pixel comparison of styles and shadows have not been done.

## Insert pictures, links and ScreenTips, 2026-10-09

Insert > Pictures embeds a local PNG, JPEG or GIF (validated structure, at most
8 MB, 16 megapixels and 16384 pixels per side) as a `Type="Foreign"` bitmap
shape with `ForeignData`, `ImgWidth`/`ImgHeight` cells, a `visio/media` part, a
page image relationship and a content-type default. It is centred on the page at
its 96 DPI natural size, scaled down to fit 80% of the page with its aspect
ratio, selected, and moved, resized or deleted by the existing edits (the image
cells are recalculated). SVG, BMP, TIFF and animated PNG are refused. Deleting
a picture leaves its media part and relationship in the package; Visio
reopen of core-created pictures is not yet verified natively.

Insert > Link (Ctrl+K, also the shape context menu) adds, edits or removes one
local Hyperlink section row (Address, SubAddress as a page name, Description).
Ctrl+click follows the default or first visible link: safe http, https and
mailto addresses open in a new tab with `noopener`, and page targets switch
pages; the app itself is never navigated. Insert > ScreenTip sets or clears the
shape's Comment cell, shown as the SVG tooltip and in the Shape Data window.
Both refuse master instances (inherited sections), formula-driven cells and
drawings whose formulas read `Comment` or `Hyperlink` cells. ScreenTips and
link fields are single-line (at most 4096 characters) because the XML writer
cannot preserve line breaks in attributes. Object, Chart and CAD Drawing stay
disabled with their reasons: OLE objects, Excel charts and DWG/DXF import are
not supported.

## Text dialog, Text Block, Symbol, Field and proofing, 2026-10-09

Home > Font and Paragraph dialog launchers open a Text dialog (shared
`office-ui-dialog`) with Font (font, style, size, colour, transparency, case,
super/subscript, underline, strikethrough, language), Character (letter
spacing), Paragraph (alignment, indents, spacing before/after, line spacing as
a multiple or exact points), Text Block (vertical alignment, margins, text
background colour and transparency) and Bullets (Visio's seven built-in styles
or a custom character) tabs. Only changed fields are written, as one undoable
`format-text` edit over every selected shape's whole text. The Tabs tab is
informational: tab stops are not written because the Tabs section layout is not
verified against Visio and the renderer does not lay out tab stops. Character
scale and position offsets, double underline/strikethrough, per-run dialog
editing and the bullet font are not offered. The renderer now draws letter
spacing, all/initial/small caps and super/subscript (Visio's default 2/3 size
and 1/3 offset); text backgrounds were already drawn.

Home > Tools > Text Block (Ctrl+Shift+4) frames the selected shape's text block
with a movable body, eight resize handles and a rotation handle (whole degrees).
Release writes TxtPinX/TxtPinY/TxtWidth/TxtHeight as `Width*k`/`Height*k`
formulas, TxtLocPin as half the block and TxtAngle, so the block follows later
resizes. It applies to top-level local 2D shapes only (not lines, groups,
masters or layered shapes). Escape turns the tool off.

Insert > Symbol opens the shared `office-ui-symbol-picker` (common symbols plus
a character-code field). With the shape text editor holding the caret it inserts
at the caret as an unapplied draft; otherwise it appends to the selected
shape's text with a range edit (empty text is replaced); appending directly
after a trailing field is refused, because a range edit must replace at least
one character outside a field. Insert > Field inserts
a `<fld>` and Field row for Date/Time (current, creation, last saved, last edit,
print), Document Info (title, author, subject, manager, company, category,
keywords, description), Page Info (name, number, count), Geometry (Width,
Height, Angle) or a custom numeric formula over the shape's own cells, with a
supported format-picture subset. Page, document and date fields are evaluated
when the drawing is opened; geometry fields follow resize recalculation. Fields
are atomic in the text editor: edits around them are saved as range edits and
edits that touch a field are refused with a reason. Native Visio reopening of
these Field rows (Type, Format pictures, missing UI category cells) is not
verified.

Review > Spelling (F7) selects the selected or first text shape on the page and
opens the shape text editor with the browser's native spell checking
(`spellcheck`); no dictionary is bundled and other shapes are not walked
automatically. Review > Language marks the selected shapes' text with a
proofing language (Char.LangID). Thesaurus stays disabled: no thesaurus is
bundled.

## Rich-text replacement and fixed page-size core, 2026-10-09

Source range replacements now preserve supported character formatting within
paragraphs. The existing scoped planner emits these commands, while paragraph
breaks retain the plain-text writer. Twenty-four rich native outputs and 18 plain
outputs match and reopen in Visio 16. Fields, rich paragraph deletion, paragraph
break changes and conflicting marker boundaries still refuse atomically.

The page-size command selects fixed/custom drawing dimensions without moving
shapes or changing printer paper. Native comparison and reopen evidence covers
28 outputs across fixed dimensions, size modes and a core-created document.
Affected or unknown page-size formula dependencies are refused.

## Page setup, backgrounds and page breaks, 2026-10-09

Design > Page Setup works through core page edits, each one undoable step:
Orientation swaps the page and writes PrintPageOrientation; Size offers Letter,
Tabloid, Legal, Statement, Executive, A3, A4, A5, B4, B5, ANSI C-E and ARCH C-D
in the page's orientation, Fit to Drawing (page resized to the top-level shape
extent and the movable shapes shifted onto it in one transaction; glued
connectors follow; any other shape that cannot be moved refuses the fit) and
More Page Sizes. Auto Size toggles DrawingResizeType (1 on, 2 off); while it is
on, a create, move, resize, paste or duplicate that leaves shapes beyond the
right or top edge grows the page in whole print tiles (the saved paper less its
margins at the print zoom, else the page size). Visio also grows the page left
and down by moving the page origin; that is not done, and a growth the core
cannot prove is skipped with a diagnostic while the shape edit stays.

The Page Setup dialog (group launcher, and File > Print > Page Setup) edits the
printer paper (PaperKind) and its orientation, the page size (custom, standard,
same as printer paper or fit to drawing contents), the drawing scale (PageScale
and DrawingScale in in, ft, mm, cm or m; the physical page is kept and shapes keep
their drawing units, so dependent formulas such as ThePage!DrawingScale are
refused) and the page properties (name, foreground/background type with Visio's
tab order, and the BackPage background). Margins, print zoom, the printer and
predefined architectural/engineering scale lists are not edited. The paper
table only knows common DMPAPER codes.

Backgrounds and Borders & Titles are this viewer's own small designs (Solid,
Band and Verticals backgrounds; Simple, Banner and Underline borders), not
Visio's stencil masters. Like Visio they create a background page named
VBackground-n, assign it through BackPage and draw plain local rectangles on it;
Background Color recolours the applied background. The title is plain editable
text initialised with the page name: it is not a PAGENAME field and does not
follow later renames. The shapes use explicit sizes, so they do not refit when
the page is resized later (apply the design again). A page that uses its own,
non-VBackground background page is refused. No Background and No Border remove
those shapes; the VBackground page is deleted once it is empty and no other page
uses it.

View > Page Breaks draws dashed lines where printed sheets split the page, tiling
from the top-left corner by the saved paper, orientation, margins and print
zoom. Without a saved PaperKind, Letter is assumed (the checkbox tooltip says
so). Visio's actual tile origin, centring and overlap are not reproduced, and
none of this has been reopened in Visio yet.

## Scoped replacement and zero-weight SVG output, 2026-10-09

The shared Find/Replace controls support literal case-sensitive occurrences,
selection/current-page/all-page scopes, current replacement and atomic Replace
All. Scope tokens survive owned result navigation while rejecting stale source
or manual intent. All six native bindings expose the same controller operations
and reactive document/selection callbacks. Unsupported matched text refuses the
entire source batch. Core replacement output matches 18 native Characters-range
cases and reopens in Visio 16; native dialog traversal, rich-text replacement,
case folding and whole-word matching remain open. Shared UI checks and the full
861-case browser run passed (146 active, 715 optional native captures skipped).
Installed native handles exercise the same replacement plans and reactive hooks.
An additional reproduced cancellation-ownership race is fixed and covered by
41 focused controller/adapter checks. Production builds, all six replacement
browser workflows and the final nine-tarball installed consumer passed again
after this fix.

Static SVG now applies the measured zero-weight policy without changing raw
source width: native zero weight exports at 0.75 points, while nonzero thin lines
stay literal. Twelve native cases pass through core and the shared DOM exporter,
including dotted cap variants and filled-arrow setbacks. This does not establish
native live, raster or print hairline parity.

## Paint patterns, transparency and native dashes, 2026-10-09

The shared Line menu now exposes No Line and built-in patterns. Fill & Line
provides fill patterns 0-24, background color, line patterns 0-23 and foreground/
background fill transparency plus line transparency. It commits changed fields
as one selection edit, preserving untouched mixed values and exact undo bytes.
All six native handles use the existing generic edit API and reactive hooks.

Core preserves protected cells, unrelated styles, text and geometry; transparency
uses native half-percent rounding. Ordinary inherited solid themes are supported.
Active gradient transparency/background edits require explicit paint replacement.
Native edit/reopen evidence covers 54 cases across three drawing scales. Separately,
432 native SVG cases establish built-in dash lengths and cap mapping across all
patterns, three caps, two stroke weights and three scales. Square dots retain
their fixed 0.01-point length. Complete raster equality, custom line patterns and
all gradient editing behavior remain outside this evidence. Core/UI regressions,
strict checks, native bindings, production builds and nine-tarball installed
consumer checks passed. All six installed native mounts verified every supported
fill pattern, raw opacity, No Line followed by pattern 23, document events,
preserved selection and exact byte undo. Six focused paint-property browser
workflows passed; the full production run passed 140 active checks with 715
optional native-capture cases skipped and no failures, in 7.4 minutes.

## Fixed-size Text Tool and logical text, 2026-10-09

Home Text Tool and Insert Text Box now share a plain-text draft on a dragged
fixed-size box. Existing-shape clicks reveal the text-edit controls. Rectangle,
ellipse and line creation share captured intent, atomic source acceptance and
created-selection history. Page, source, selection, zoom, visibility and
cancellation changes supersede stale drawing drafts and pending creation.
Every native binding receives this shared UI; all six generic `applyEdits()`
handles also accept the required-text `create-text-box` command.

Core owns source creation, saved default text styles, geometry planning and
dependency/protection admission. New text boxes explicitly set `FillPattern=0`
and `LinePattern=0`; line color alone cannot enable their outline. Plain-text
replacement honors effective `LockTextEdit` and refuses affected or unknown
text dependencies. VSDX logical text removes one structural terminal paragraph
marker while retaining intentional trailing LF characters and styled blank
paragraphs; legacy VSD behavior remains unchanged.

Insert > New Page exposes the existing blank-page source command on the Insert
tab. Native logical-text evidence covers ten saved inputs and forty core writer
outputs, including native resave/reparse. A separate 24-case native fixed-box API
oracle verifies default and custom Text Only/Arial 18 pt saved styles at three
drawing scales, actual core output and native reopen. Core/UI, strict checks,
native bindings, production builds and all-six installed-package workflows
passed. The full production browser suite passed 134 active checks with 715
optional native captures skipped, including all six Text Tool and resize workflows.
Text Tool GUI defaults, automatic sizing,
broader template/theme defaults, rich-text content editing, text rotation
gestures and full Visio text layout remain unverified. See
[verification](verification.md) for the bounded evidence.

## Anchored resize and numeric Size & Position, 2026-10-09

The shared pointer tool now exposes eight single-selection resize handles.
Core computes the fixed opposite anchor along saved rotated/reflected local
axes and proves the resulting source dimensions, proportional local pins and
dependent caches before mutation. Preview changes the selection frame only;
release is one history transaction. Existing `resize-shape` commands without an
anchor retain their fixed-rotation-pin behavior.

View > Task Panes > Size & Position edits X/Y and dimensions in drawing inches
and angle in counterclockwise degrees. Enter or blur commits one valid field;
exact current-value input preserves bytes/formulas/history. Drafts survive
unrelated rerenders on the same source/selection. Newer source/page/selection
intent and cancellation supersede pending edits. The same shared component
supplies these controls to all six bindings.

Admission is bounded to source-backed ordinary local, unlayered, unglued 2D
leaves. Protected cells, unsafe formulas, nonproportional guarded local pins,
dimension-dependent rotation/flip changes and affected text fields can refuse
atomically. Groups, masters, foreign objects, multi-shape resize, full-content
resize preview, snapping, aspect-modifier gestures, numeric formula/unit-string
entry and pin-position editing remain open. Native source and reopen evidence
is recorded in [verification](verification.md); it does not establish full
Visio behavior or visual parity.

## Blank drawings and pointer gestures, 2026-10-09

File > New > Blank Drawing, Ctrl+N and all six native handles create an editable
one-page VSDX through the shared load lifecycle. The core owns package generation,
declared font/style defaults and physical page dimensions. Native Visio 16 opens
and resaves blank and rectangle fixtures at three paper sizes. Templates, theme
galleries and additional New document types remain open.

The pointer tool now previews and commits single or multiple local 2D shape moves
in one history step. Blank-page dragging supports full-enclosure marquee with
additive modifiers. Source/page/selection changes cancel gestures and pending
source acceptance. Protected targets reject the complete move. Masters, groups,
layers, foreign objects and glued connectors remain outside pointer movement;
resize handles now have the separate bounded proof described above; routing
remains unsupported.

Pure deletion batches now permit references entirely inside the removed set.
Retained references, metadata and Connect records still refuse, with all target
protections checked before mutation. Native deletion and core Cut/Paste reopen
cover nine cases across three drawing scales. Mixed edit/delete transactions
retain the previous sequential policy; connector healing remains open.

## Shape clipboard, 2026-10-09

Copy, Cut and Paste now run through the shared web component and every native
binding handle. Home, context menus, Tell me, keyboard and native clipboard
events use a single DOM adapter. Core captures source XML in a worker; paste
validates the actual payload, allocates fresh IDs/names and selects the result
in one history step. Cut deletes only after a successful clipboard write.
Denied access, protected deletion and superseded actions have explicit feedback.
Text inputs retain native clipboard behavior.

This is viewer shape clipboard support using a bounded versioned `text/plain`
payload. It is not native Microsoft Visio clipboard interoperability. Captured
ordinary local unglued 2D leaves survive edits or deletion of their originals.
Paste requires matching font/style/theme definitions and page settings, ordinal,
background context and drawing ratio. Groups, masters, layers, foreign content,
outside-selection references and unsupported formulas remain refused. Paste
Special, resource import, cross-scale placement and native paste cascade remain
open. See the [API](api.md#experimental-shape-clipboard) and
[verification record](verification.md) for the precise contract and evidence.

## Format Painter and Change Case, 2026-10-09

Home > Clipboard > Format Painter copies the single selected shape's fill
(solid colour, classic pattern, background colour, transparency or No Fill),
line (colour, weight, pattern, transparency) and text formatting (font, size,
colour, bold, italic, underline, strikethrough, alignment, left indent and
bullets) as the existing whole-shape `format-shape` and `format-text` edits.
A click applies once to the next selection (one shape or a multi-selection);
a double click keeps it on until Escape or another click on the button. The
button shows its pressed state while armed, and each application is one atomic,
undoable transaction. Text formatting comes from the first run and paragraph and
is applied to the whole target text, so per-run differences are not copied.
A target without text receives only fill and line formatting, because the core
text formatting edit refuses to create a Text element.
Gradients, arrowheads, shadows, rounding and theme effects have no edit command
yet and are not copied; the announcement and tooltip name what was skipped.
Sources and targets follow the existing formatting admission (local leaf shapes
without masters, groups, foreign images or layers), and fonts must already be
declared in the drawing.

Home > Font > Change Case offers Sentence case., lowercase, UPPERCASE, Capitalize
Each Word and tOGGLE cASE. The conversion is the format-neutral
`changeTextCaseRanges` in `ooxml-core/text`; the Visio command emits
`replace-text-ranges` spans split at every run and line boundary, so rich runs
keep their own formatting and markers instead of being flattened. Fields,
shapes without a local Text element and the other range-edit refusals are
reported honestly. Case conversion is per code point with sentence and word
context; Visio's own exceptions (for example its sentence detection after
abbreviations) are not reproduced exactly.

Evidence: core `text/change-case.test.ts`, `visio/ui/change-case.test.ts` and
`visio/ui/format-painter.test.ts` (edit, save and reparse), and shared UI
`viewer-format-painter.test.ts`. Not yet checked by native Visio save/reopen.

## Home formatting, selection and arrangement, 2026-10-09

The Home ribbon now routes font family/size, increase/decrease size, bold, italic,
underline, strikethrough, font color, bullets, indentation, horizontal/vertical
text alignment including justification, solid fill, line color/weight and Bring
to Front/Forward and Send to Back/Backward through source-backed edits.
All six bindings use the same web component, worker, history and VSDX export path.
React and Vue state subscriptions also follow viewer replacement; native reactive
state remains available in React, Vue, Angular, Svelte and Solid, with subscriptions
in vanilla.

Ordered multi-selection is shared across all six bindings, with additive clicks,
Select All, Escape, immutable `selection-change` events and native state hooks.
Formatting and deletion apply atomically to the selection. Six alignment actions
use the first selected shape as their reference. Horizontal and vertical spacing
use equal edge gaps, ordered by shape centers with selection-order ties.
Arrangement currently admits ordinary local leaf shapes with saved pins,
excluding groups, masters, layered shapes and glued connectors. A protected
target rejects the entire batch. Single-target edit panels and stacking commands
remain disabled for multiple selection.

Formatting currently admits ordinary local leaf shapes. Whole-shape text
formatting updates effective character/paragraph rows while preserving mixed
run markers, unrelated style bits and supported cached fields. Character,
paragraph and vertical operations validate their own affected source sections.
Font-size steps require a uniform size; the explicit size picker can format
mixed-size text. Fonts must already be declared in the drawing. Protected cells,
ambiguous rows, unsupported inheritance and affected formula
dependencies reject the transaction. Stacking-order edits admit ordinary local
top-level siblings in display band zero; layers, masters, groups, foreign shapes
and dynamic/container dependencies remain outside that edit scope. Untouched
package payloads are preserved, and successful edits participate in undo/redo.

Duplicate is available from Home's Paste menu, the shape context menu, Tell me,
Ctrl+D and every native binding's `duplicateSelection()` method. The core clones
admitted local unglued 2D leaf XML with fresh IDs and names, preserves source
stacking order and remaps supported copied-shape references. Native offsets are
0.33 drawing inches right and down, independent of page scale. The copies become
the selection in one undoable transaction; newer user selection intent wins over
pending work or history restoration. Groups, masters, layers, foreign shapes and
unsupported formula dependencies remain outside duplication admission.

Evidence: core `edit-formatting.test.ts` and `edit-shape-order.test.ts`, shared UI
`viewer-formatting.test.ts`, `viewer-arrangement.test.ts`, the all-six binding
`state-lifecycle.test.ts`, and browser workflows `ribbon-formatting.spec.ts` and
`multi-selection.spec.ts`. Native Visio 16 save/reopen checks cover the formatting
cells and all four stacking actions at three drawing scales, all eight
arrangement actions at three scales, and 34 distribution overlap/tie cases.
The [verification record](verification.md) describes the exact scope and numerical
bounds. General native visual and file compatibility remain unproven.

Group and Ungroup are available from Home > Arrange > Group, the shape context
menu, Tell me, Ctrl+Shift+G and Ctrl+Shift+U. The core `group-shapes` edit wraps
two or more admitted top-level local 2D trees in a new `Type="Group"` sheet whose
pin, width and height bound the members' rotated alignment boxes, places it at the
topmost member's stacking position and rewrites only member pins into group-local
inches. `ungroup-shape` returns direct members to page coordinates through the
group's pin, rotation and flips (angles and flip cells are recomposed exactly) and
converts native group-scaling member formulas such as `Sheet.N!Width*0.5` to their
cached values. The parsed page-space transform of every member is unchanged by both
edits. A top-level group can be moved (pointer drag or the Size & Position pane) as
one sheet; the first click on a member selects its outermost group and a second
click subselects one level deeper, as in Visio. Both edits are single undoable
transactions and the new group, or the former members, become the selection.
Masters, lines and other 1D sheets, foreign objects, glued shapes, layered
members, LockGroup or other active protection, formulas that read a member's pin
(or, on ungroup, its rotation and flips), dynamic or page-referencing member
formulas, references to the removed group and groups with their own geometry or
text are refused. Members are written with plain values rather than Visio's
group-scaling formulas, so resizing or flipping a group remains unsupported here
and native Visio group-resize behaviour for these groups is unverified; Add to
Group, Remove from Group, container behaviour and native save/reopen acceptance
remain open. Evidence: core `edit-group.test.ts` and `ui/shape-group.test.ts`,
shared UI `viewer-grouping.test.ts`.

Remaining functionality includes native clipboard interoperability, broader
arrangement admission, master overrides and replacement, connector
routing/glue, character-range text editing, theme fonts and effects, bevel and 3-D effects, Data tab commands, Visio rule sets and proofing, and
the other capabilities marked missing below.

The stacking scope follows Microsoft's documented
[DisplayLevel bands](https://learn.microsoft.com/en-us/office/client-developer/visio/displaylevel-cell-shape-layout-section)
and refuses dynamic container lookups whose results depend on
[container z-order](https://learn.microsoft.com/en-us/office/client-developer/visio/containersheetref-function).

## Capability inventory

Full Microsoft Visio parity is a target, not a current claim. Snapshot: 2026-10-09.

Gradient fidelity remains open: native PNG captures show that two-stop colors
and path-following contours differ from native SVG export. Exact native-SVG
comparisons below do not establish native raster parity. See verification.md
for the 68-case and extended 84-case raster captures and the
unverified-gradient-raster diagnostic.

Linear gradient viewing also covers native height-zero line shapes. Along-line,
perpendicular and rotated oblique captures meet the existing interior bounds
on all six routes for live and portable SVG. Save/core reparse preserves their
paint through direct straight-line movement and while an unrelated 2D control
is moved. Native horizontal, diagonal, vertical and reversed straight lines now
move through the shared editing and dependency path with preserved midpoint and
length formulas. All six routes cover controls, undo/redo, download and reload.
Unreferenced local lines also delete through shared LockDelete and reference
checks, with native four-line deletion and all-six history/download/reload
comparisons. Movement checks include local and inherited endpoint locks.
Width-cell resizing now admits positive Width with zero Height on proven local
straight lines. Native assignments preserve endpoint cells and midpoint/angle
formulas while replacing Width and recalculating geometry/local pins. Four
native orientations and all-six controls/history/download/reload comparisons
verify caches and poses. Resized gradient interiors meet existing native PNG
bounds on all six live/export routes. Nonzero line Height,
broader 1D resize/movement formulas, routing/glue, arrow paint,
point-sized strokes and native Office reopen acceptance remain open.

The shared `move-line-endpoint` API now edits begin or end coordinates on proven
local unglued straight lines with native derived transform formulas. Eight native
cases and twelve all-framework worker/history/download/reload scenarios verify
caches and poses. Pointer endpoint handles now commit the same command once on
release, with a preview, cancellation and all-six native pose/history/save/reload
comparisons. Static Width overrides, flipped or coincident endpoints, broader
formulas and glued connector routing remain open. Native Visio snapping, keyboard
endpoint manipulation remain unverified. Native drawing-to-page
ratios 0.5, 2 and 3 have 72 distinct API/pointer workflows across six frameworks,
including both endpoints, undo/redo, download and reload. Independent native SVG
measurements verify physical paper sizes and saved endpoints, and page-scale
metadata is preserved byte-for-byte. Other scales and unit conventions remain
unverified. Native endpoint assignments also verify oblique linear stroke paint
after API editing, undo/redo and save/reload: eight two/three-stop opaque and
translucent cases across six frameworks, live and portable SVG. Interior errors
meet existing bounds (maximum four, mean below 0.885), with exact pixels,
native Office reopen acceptance still open. The same eight paint cases also
pass actual pointer editing and saved reload across all six frameworks within
the unchanged paint bounds and existing four-decimal pointer geometry contract.
Other gradient directions/angles and exact pointer-paint pixels remain open.

The shared `create-line` command creates unglued straight lines with native
endpoint-derived transforms, local geometry and DocumentSettings style defaults.
Line drawing uses the existing rectangle gesture lifecycle, shared shape-ID
allocation and physical-page conversion; the menu and Ctrl+6 select it. Four
native orientations match core formulas, geometry, styles and cached poses.
All six framework routes verify actual drag creation, undo/redo, cancellation,
public save and reload, with independent native SVG endpoint measurements.
Native drawing-to-page ratios 0.5, 1, 2 and 3 now have creation comparisons
across all six routes, including lines extending past the paper edge. Line
gestures retain those endpoints rather than clamping them to paper dimensions.
Native mouse snapping, outside-page gesture semantics and visibility,
adjoining-line glue, other creation styles, other scales/unit conventions,
exact paint pixels and native Office reopen acceptance remain unverified.

Freeform (Ctrl+5), Pencil (Ctrl+4) and Arc (Ctrl+7) draw through one shared
`create-path` command. The core (`path-fit.ts`, `ui/draw-path-plan.ts`) fits the
pointer stroke: Freeform simplifies the samples with Ramer-Douglas-Peucker and
fits smooth cubic segments through them; Pencil splits the stroke at sharp
corners into straight lines and circular arcs; Arc draws a quarter of the
axis-aligned ellipse spanned by the drag. A Freeform or Pencil stroke ending
within 1/8 inch of its start closes into a filled shape; open paths are
unfilled. A stroke that fits one straight segment becomes an ordinary line.
The shape is a local 2D shape whose single Geometry section uses only relative
rows (RelMoveTo, RelLineTo, RelCubBezTo, RelEllipticalArcTo; arc axis ratios are
the formula `Width/Height*k`), so it moves, rotates, deletes, undoes and
resizes; resize admission accepts these rows only with that ratio proof and
zero arc rotation. Unsupported or unverified: Visio writes NURBSTo or
SplineStart/SplineKnot for freeform curves and ArcTo for pencil arcs, which
are not reproduced; Pencil chains segments within one drag, not across
separate drags, and has no vertex-editing mode; Freeform has no precision
setting; native mouse snapping is not inferred, and these shapes have not yet
been reopened in Visio.

The Connector tool (Home > Tools > Connector, Ctrl+3) draws a straight
connector with `create-line` plus `connect: { begin?, end? }`. An end released
on a visible, local, top-level 2D shape is glued to it with native dynamic
(shape-to-shape) glue: `_WALKGLUE(BegTrigger,EndTrigger,WalkPreference)` on the
glued endpoint cells, `_XFTRIGGER(Sheet.N!EventXFMod)` triggers, `ObjType` 2, an
end arrow (code 4) and `Connect` rows (`FromCell` BeginX/EndX, `FromPart` 9/12,
`ToCell` PinX, `ToPart` 3). An end released on empty canvas stays unglued. The
shape under the pointer is highlighted as the glue target while the tool is
active. Glued ends sit on the side midpoints of the alignment boxes that are
closest to each other (skipping coincident pairs of touching shapes); moving,
resizing (including anchored resizing), rotating or flipping a glued shape walks
and recalculates the connector's endpoints, midpoint, length and angle in the
same transaction. Dragging a connector or one of its endpoints unglues the
affected ends, deleting a glued shape removes its `Connect` rows and leaves the
connector's end where it was, and deleting a connector removes its rows. Undo
and redo use the ordinary edit history. Glued pages keep formatting, text and
stacking edits.

Connection points and routes. Home > Tools > Connection Point (Ctrl+Shift+1)
adds a `Connection` row where a local top-level 2D shape is clicked, with
`Width*x` and `Height*y` formulas so the point follows resizing
(`add-connection-point`); clicking a point selects it and Delete removes it
(`delete-connection-point`), ungluing ends glued to it in place and renumbering
later rows together with the glue that names them. View > Visual Aids >
Connection Points shows every shape's points (inherited master rows included,
drawn fainter) as blue x markers. A connector end released within 8 pixels of a
point glues to it with point-to-point glue: `PAR(PNT(Sheet.N!Connections.Xk,
Sheet.N!Connections.Yk))` on both end cells and a `Connect` row with `ToCell`
`Connections.Xk` and `ToPart` 100 plus the row index (k counts rows from 1).
Dropping a connector's endpoint on a shape or point re-glues it
(`glue-connector`). New connectors are right-angle by default: Visio's
dynamic-connector cell form (Angle 0, `Width` `EndX-BeginX`, `Height`
`EndY-BeginY`, `ShapeRouteStyle` 1, `ConLineRouteExt` 1) with an orthogonal
polyline from a small candidate router that leaves each glued end along its
side and avoids crossing the two glued shapes; the route is recomputed when a
glued shape moves or resizes, and the move preview shows it live. Design >
Connectors switches the selected connectors (and new ones) between
Right-Angle, Straight (`ShapeRouteStyle` 16, the straight cell form) and Curved
(`ConLineRouteExt` 2, one `NURBSTo` cubic); Insert > Connector picks the style
and arms the Connector tool. All of these are ordinary undoable edits.

Limits: the router is not Visio's (it avoids placeable shapes only, see the section on that above;
no spacing between parallel connectors, no Re-Layout); right-angle and curved
connectors cannot be resized, rotated or flipped (they change through their ends
and route); connection points are added to and glued on local top-level 2D
shapes only, so master instances (whose points come from the master) can be
neither glued nor edited, and inherited points can only be displayed; points
are never added to 1D shapes or groups; formulas other than glue that read a
shape's `Connections` cells block deleting its points; `ShapeRouteStyle` and
`ConLineRouteExt` values follow Visio's documented constants but Visio's own
reopen of these connectors, of point glue and of the `Connections.Xk` naming has
not been verified; glue in files saved by Visio is still refused for geometry
edits because their connectors are master instances; dragging a connector
together with its glued shapes keeping glue is not supported. View > AutoConnect
is described in its own section at the top.

Rectangle creation now shares the line command's DocumentSettings style
references and inherited-style admission. Native standard and distinct custom
line/fill/text default IDs verify effective rectangle geometry, color, line
weight and poses. All six browser routes compare unselected fill/stroke colors
and opacity with native SVG, then verify undo/redo and saved reload.
Shape-dependent inherited style formulas remain refused. Other default styles,
text paint, exact pixels and native Office reopen acceptance remain unverified.

The shared `create-ellipse` command now uses the rectangle's box transform
and drawing-default style construction. The Ellipse menu and Ctrl+9 use the
same gesture lifecycle, page conversion and ID allocator. Native DrawOval
control formulas are preserved, and canonical axis-aligned local ellipses
can resize through the existing dependency recalculator. Standard and custom
style references verify core creation/move/resize plus all-six pointer creation,
geometry controls, undo/redo and public save/reload. Native SVG extent and
color comparisons cover basic unscaled ellipses. Native drawing-to-page ratios
0.5, 2 and 3 also cover rectangle/ellipse pointer creation and ellipse resize/move,
history and saved reload across all six routes. Shared page conversion is reused,
and unrelated package parts remain byte-for-byte unchanged. Rectangle and ellipse
gestures now retain off-paper coordinates through the same unbounded conversion
as lines, instead of collapsing both corners at the paper edge. Arbitrary control axes,
other formulas, other scales and rotated browser authoring, native snapping, exact pixels
and native Office reopen acceptance remain unverified.

The shared `rotate-shape` command also admits proven local top-level 2D groups,
including nested descendants. Native parent-angle assignments verify a custom
pivot at 30 degrees and a two-level group at 210 degrees on drawing-to-page
ratio 0.5. Child local cells and formulas remain unchanged; the shared affine
composer and renderer place every descendant from the changed parent transform.
The shared model admission now exposes the existing pointer handle and
left/right quarter-turn menu for those group trees, alongside the angle control.
Flips retain leaf-only admission. This reuses the existing atomic geometry edit,
protection, dependency, preview renderer, worker and history paths. Descendant dependencies affected by the changed Angle, masters,
foreign objects, 1D descendants and glue remain refused. Native snapping and
group-selection semantics, other group edits, complex display modes, exact paint
and native Visio reopen acceptance remain open.

The shared `rotate-shape` command sets a local 2D shape's angle in radians
through the existing geometry transaction, protection and dependency path.
The shared experimental control accepts degrees and forwards that command.
Native rectangle and ellipse rotations at 30, -45, 90 and 210 degrees, with
drawing-to-page ratios 1, 2, 0.5 and 3, compare cached poses and unchanged
local geometry/styles. All six bindings cover control editing, undo/redo and
public save/reload. Local/inherited LockRotate and guarded/dependent angle
formulas are checked; angle units are explicit. Unguarded resolved static Angle
formulas now share the flip source dependency/cache proof. Native absolute and
quarter-turn captures verify formula replacement, including a current-value
assignment that changes the formula without changing the pose. That API edit is
undoable; formula-free same-value commands still preserve source bytes. Control,
pointer and menu workflows use the same existing command/history path.
Pointer rotation handles reuse
shared geometry and preserve the source pin, including off-centre pivots.
Live preview uses the existing renderer without source/history changes;
native snapping and preview paint remain unverified. The shared quarter-turn
command builder reuses local-shape admission and the existing rotation edit.
Ten native per-shape Left/Right 90-degree comparisons cover custom pins,
signed normalization, scaled pages and both half-turn boundaries. The nested
Position > Rotate Shapes menu now uses the shared nested menu control and
routes Left/Right 90-degree commands through the existing worker/history path.
Flip Horizontal and Flip Vertical now use one atomic core edit that toggles
the local flip flag and negates Angle while retaining the saved pin. Four native
rectangle/ellipse comparisons cover a custom pivot at 30 degrees and scaled
pages at 210 degrees. Native locked and guarded-angle horizontal flips now
retain the original Angle cell while toggling the flip flag; both shapes pass
core comparisons and six-binding menu/history/save/reload checks. Scalar
inherited rotation locks also have core regression coverage. Guarded FlipX/FlipY
flags now retain their formula/cache while an unprotected Angle negates, matching
four further native rectangle/ellipse poses. Fully blocked flips preserve source
bytes without a dirty part. Two native fully blocked references (guarded Angle
plus flag, and rotation lock plus guarded flag) now verify unchanged poses and
source bytes for rectangle/ellipse, including scaled/custom pivots. Six-binding
menu checks preserve generation, clean state and undo/redo branches and report
that no change occurred. Unguarded static Angle/flip formulas now use the shared
read-only dependency evaluator and source-cache proof. Three native captures
verify replaced nonzero Angle and toggled flag formulas, and retention of a
zero Angle formula; six-binding menu/history/save/reload comparisons cover
these rectangle/ellipse poses. Unknown or inconsistent dependent sources,
inherited transforms, groups/masters/glue, broader native flip gestures and
Microsoft Visio reopen acceptance remain open. Unproven protections are refused
instead of being overwritten.
Native keyboard rotation
commands, grouped/master/glued and 1D rotation, broader angle/formula
and text/gradient paint cases, exact contours/pixels and native Office reopen
acceptance remain unverified.

Native endpoint-cell assignment after a Width override retains the fixed Width,
changing midpoint and angle while displayed endpoints diverge from raw cells.
Eight saved native cases verify viewing geometry across six frameworks, with
the current endpoint-command refusal preserving model/source bytes. Native
mouse-drag semantics for these sources remain unverified; this is not endpoint
editing parity after Width-cell resizing.

Saved oblique linear fills now use the shared physical endpoint helper rather
than native-SVG box rotation. Native 45-degree rectangle paint and 225-degree
paint on a 30-degree rotated rectangle meet the existing interior bounds across
all six routes for live and portable SVG, with maximum channel error four.
Other shapes/angles, contours, exact pixels and native reopening remain open.

Saved linear strokes now reuse the fill-gradient parser, sampler and painter.
Native horizontal and vertical rectangle strokes with two/three stops and
independent transparency meet the existing interior error bounds across all six
routes for live rendering and portable SVG. Colored layers override them with
solid layer paint. Oblique rectangle strokes at 45 degrees and at 225 degrees
on a 30-degree rotated shape also meet those interior bounds, using the shared
physical endpoint helper. Exact pixels, contours, other angles/shapes/groups,
arrowheads, nonlinear directions, editing controls and native save/reopen
acceptance remain open.

Saved opaque two-stop fills now use the measured sigma/gamma profile, and saved
radial fills use physical circular radii. The native PNG interior benchmark
still has nonzero channel differences; transparency and exact edge pixels
remain open. This improvement does not establish parity.

The saved-gradient native PNG benchmark now covers all 68 captured cases:
52 rectangles (directions 0-12) and 16 path fills (direction 13 on rectangles,
ellipses, triangles and notched polygons), with two/three stops and
opaque/translucent paint, across six frameworks.
Internal region seams are suppressed for every region fill. Native export bounds
are registered explicitly; all gradients retain a raster-fidelity warning.
Path fills reuse the evaluated outline and shared region/radial renderer.
Measured path-fill interior errors remain as high as 10 channel levels, with
mean below 2.5. Curves beyond canonical ellipses, holes, offset outlines,
broader concave topologies and transformed native comparisons remain open.
The extended capture adds pentagons, chevrons, U-shapes and stars. The 80
non-star cases meet the existing regression bounds; all six star scenarios
remain explicit expected fidelity failures, with maximum channel errors of 43.
These failures are recorded independently of successful import/render checks.
A separate 32-case path capture verifies 30-degree shape rotation against native
page-space poses. Twenty-five cases meet the existing regression bounds; stars
and three opaque polygon cases remain explicit failures. Rotated PNGs register
to native geometry extents with uniform fitting, rather than the different SVG
export frame. Exact contour pixels and broader rotations/groups remain open.

Implementation status is based on source inspection. Test filenames identify evidence; current pass counts and limitations are recorded in verification.md. Generated fixtures and the original demo scene do not establish visual parity with Microsoft Visio.

| Capability                     | Target                                                                                                                                                                                                               | Current state                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Evidence to inspect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Still missing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| VSDX package intake            | Safe local OPC/ZIP reading                                                                                                                                                                                           | Initial implementation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Core package.ts; package.test.ts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Broader producer corpus, independent security review                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Format discovery and pages     | Relationships, page order, dimensions                                                                                                                                                                                | Initial implementation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Core parser.ts; parser.test.ts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | More genuine document fixtures                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Background pages               | Resolve and draw inherited background pages                                                                                                                                                                          | Partial                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Core getVisioPageLayers; viewer render-svg.ts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Visio reference comparisons; page-scale interactions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Master inheritance             | Master and instance cell/section merging                                                                                                                                                                             | Partial                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Core shapes.ts and sheet.ts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Formula-driven resizing, full master semantics                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Group transforms               | Nested coordinate systems, rotation, flips and group display modes                                                                                                                                                   | Partial                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Core geometry.ts; groupDisplayMode; renderer order tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Complex group corpus and reference renders                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Basic paths                    | Move, line, relative quadratic/cubic segments                                                                                                                                                                        | Partial                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Core geometryPaths in geometry.ts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Comprehensive geometry conformance corpus                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Ellipses and arcs              | Native cached arc and ellipse geometry                                                                                                                                                                               | Partial                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Core geometry.ts; geometry.test.ts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Degenerate cases and reference images                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| NURBS, splines, polylines      | All Visio Geometry row forms                                                                                                                                                                                         | Partial: polylines, cached splines and bounded NURBS approximation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Core geometry.ts; literal/spline analytic tests; real upstream NURBS fixture                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Periodic/nonclamped forms, expressions, global error bounds and native spline fixtures                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Line and fill styles           | Full styles, patterns, gradients and opacity                                                                                                                                                                         | Partial: cached caps/dashes, theme gradients and saved shape-rotating linear, radial and rectangular gradients, native classic orthogonal patterns 25-30, triangle-region patterns 31-35 and radial patterns 36-40; native hatch tiles 2-24 with separate foreground/background alpha; page-aligned hatch axes, native quarter-turn phase and crisp edges                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Core style/root and generated horizontal-gradient tests; ten real theme gradients; six real pattern-23 strokes; SVG paint tests; layer-paint and legacy-fill-gradient tests; native two- and three-stop classic gradients; 46 native pattern pages, exact RGBA tile tests and all-six live/export interior comparisons; 23 quarter-turn and 23 scaled native pages; 46 native single-shape X/Y-flip pages and 92 two-level quarter-turn/reflected group pages with exact all-six live/export interior comparisons; shared affine and hatch-transform regressions; ten native opaque/translucent radial pages and ten region-gradient pages with 240 exact full-page live/export comparisons; native saved 90/270-degree gradients with inherited theme placeholders; historical opaque 30-degree and translucent 225-degree native-SVG comparisons, superseded by physical native-PNG projection for saved oblique fills; seven modern radial presets and five modern rectangular presets with opaque/translucent native comparisons | Oblique hatch pixel equality (one-byte channel differences remain), broader nested group transforms, resizing and oblique flip placement, broader grouped/rotated region gradients, broader transformed saved gradients, path-following fills and effects and native edit/save/reopen                                                                                                                                                                                                                                                                                                                                                                        |
| Arrowheads                     | All connector end variants                                                                                                                                                                                           | Partial: codes 1-7 and 9; native open geometry and straight filled codes 2, 4, 5, 6 with measured page/drawing scale normalization                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Viewer arrowheads.ts; SVG markers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Curved/two-ended overlapping filled setbacks, remaining codes, broader scaled-page corpus and browser pixel corpus                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Connectors and glue            | Connectivity, routing, dynamic glue                                                                                                                                                                                  | Partial: read model; Connector tool creates right-angle (default), straight or curved connectors with native shape-to-shape or point-to-point glue that follow moved, resized, rotated or deleted shapes; Connection Point tool adds and deletes points; endpoints re-glue                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Core page connection model; edit-connector*.ts, edit-connection-points.ts, connector-route.ts and their tests; viewer-connector-tool.ts, viewer-connection-points.ts, viewer-connector-routes.ts and their tests; connectors.spec.ts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Visio router parity (obstacle avoidance, line jumps, Re-Layout), Glue on groups/masters, Visio-saved glue edits, native reopen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ShapeSheet formulas            | Recalculation and dependencies                                                                                                                                                                                       | Partial: bounded numeric dependency recalculation for admitted geometry edits and local numeric page-number/count caches on page edits                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Core formula, edit-recalculate and independent review tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Scoped package/master/theme graph, dynamic functions and native conformance                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Text                           | Runs, margins, orientation, paragraphs and layout                                                                                                                                                                    | Partial: rich runs, wrapping, spacing, RTL and bullets; byte-quantized character color alpha                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Core paragraph model; bounded text/paragraph layout tests; native character transparency and shared SVG/snapshot regressions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Exact Visio font metrics, tabs, advanced typography and reference comparisons                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Themes and styles              | Theme colors, variants and inheritance                                                                                                                                                                               | Partial: selected theme records, explicit root-style caches, Quick Style edits that resolve from them, and per-page built-in themes and variants (Design tab)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Core theme resolver; upstream colors/gradients; hash-pinned root-cache regressions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Missing caches, complete theme variants/fonts/effects and native reference equivalence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Images and foreign data        | Raster, vector, OLE and foreign objects                                                                                                                                                                              | Partial: embedded PNG/JPEG/GIF (also inserted as Foreign bitmap shapes); isolated bounded EMF primitives                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Core raster/admission tests; inert vector boundary; isolated production worker and shared rendering tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Most EMF records, EMF+/WMF, SVG/OLE, effects and native Visio fidelity                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Layers                         | Visibility, locks, colors and print settings                                                                                                                                                                         | Partial: shared display controls, bounded visibility, native single-layer geometry/text colors and transparency                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Core layer-paint.test.ts; 21 Visio 16 SVG/PNG cases; shared rendering and snapshot tests; all-six binding APIs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Colored group/image/vector/text-background behavior, editing, native visibility and print policy; native reopening of the new paint corpus                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Shape data and hyperlinks      | Properties, data graphics and links                                                                                                                                                                                  | Partial: cached data, guarded hyperlink metadata, local Link and ScreenTip editing with Ctrl+click following; Define Shape Data (add, change and delete typed Property rows: string, number, Boolean, date, fixed and variable lists, on local shapes and top-level master instances); Data > Quick Import and Custom Import of a local CSV or workbook (first or chosen sheet, optional range, header row) through the shared xlsx loader, saved as DataRecordSets parts (recordsets.xml, ADO rowset data parts, relationships and content types) with RowMap links; the External Data window with drag-to-link, Link to Selected Shapes, Automatically Link by a key column matching shape text or name, Unlink and Remove; Refresh All by row order through a File System Access handle when the browser gives one, otherwise by choosing the file again; Data Graphics as plain shapes and formatting: text callouts, data bars and icon circles are separate marked shapes, Color by Value changes the shape fill and remembers the old one, Remove Data Graphics, and a grouped vertical legend                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Core shape-data and data-recordset round-trip tests (edit-shape-data.test.ts, edit-data.test.ts, data-table.test.ts, data-graphics.test.ts); viewer-data.test.ts; data.spec.ts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | External subaddresses, frames, links on master instances; deleting master-inherited Shape Data rows; rows read by formulas are refused; no data connection is stored, so Visio cannot refresh the source itself and acceptance of the written DataRecordSets by Microsoft Visio is unverified; primary keys and reconciliation are not written (refresh matches by row order); Visio data graphic masters (callouts, data bars and icon sets that follow their shape) are not written, so the viewer's graphics do not move with the shape and are not updated on refresh until applied again; horizontal legends; duration and currency types are read only |
| Containers and swimlanes       | Container relationships and layout                                                                                                                                                                                   | Partial. Insert > Container (Classic, Plain, Banner, Dashed) and the shape menu Container wrap the selected top-level shapes (or add an empty one) in one undoable core `insert-container` edit: a local 2D sheet with User.msvStructureType = "Container", a heading band and a margin around the members, placed behind them. Dragging the container moves its members in the same transaction; deleting it keeps them. Membership is recorded in a non-native User row (`ooxmlContainerMembers`); Visio containers are read from their Relationships DEPENDSON(1, ...) text for membership only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | edit-diagram-parts.ts, shape-structure.ts, ui/diagram-parts.ts, viewer-diagram-parts.ts; edit-diagram-parts.test.ts, ui/diagram-parts.test.ts, viewer-diagram-parts.test.ts, diagram-parts.spec.ts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Native Relationships formulas (not written: the formula engine cannot yet admit DEPENDSON or SheetRef), automatic resize to members, adding or removing members by dragging, lists and swimlanes, container formulas; not reopened in Visio                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Stencils and callouts          | More Shapes, Quick Shapes, stencil files and callouts                                                                                                                                                                | Partial. More Shapes opens built-in stencils as data over core outlines (Basic Flowchart Shapes and Arrow Shapes, `stencils.ts` and `stencil-shapes.ts`); each opens as a collapsible, closable section of the Shapes window, is searchable from Search and drops through the same insert path and default Quick Style as Basic Shapes. Quick Shapes shows the first masters of every open stencil, editable with Add to / Remove from Quick Shapes; open stencils and Quick Shapes persist per browser in localStorage. Insert > Callout (Rectangle, Rounded, Oval, Text only) adds a User.msvStructureType = "Callout" text box and a straight leader connector glued to it and to the selected shape with the core dynamic glue, so the leader follows either shape; deleting the callout deletes its leader                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | stencils.ts, stencil-shapes.ts, stencil-catalog.ts, shapes-sections.ts, edit-diagram-parts.ts; stencils.test.ts, shapes-sections.test.ts, viewer-diagram-parts.test.ts, diagram-parts.spec.ts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Stencil files (.vssx, .vss) and Visio's master shapesheets, connection points and Shape Data; curves are polylines; the callout leader is a separate connector, not part of a callout master, and Relationships DEPENDSON(3/6) formulas are not written; not reopened in Visio                                                                                                                                                                                                                                                                                                                                                                               |
| Document text search           | Find and navigate matching diagram text                                                                                                                                                                              | Partial: bounded visible-shape literal search across pages                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Shared controller/index/UI tests and all-six native binding integration                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Per-occurrence highlighting, regex, language collation, shape-data search and native visibility comparison                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Page navigation                | Visio bottom page tabs, Ctrl+Page Up/Down and "Page N of M" status                                                                                                                                                   | Partial: shared page tabs, blank-page insertion, Reorder Pages, Rename Page and Delete Page dialogs with undo/redo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Core edit-pages, edit-page-order, edit-page-rename, edit-page-delete and edit-page-formulas tests; shared UI page-insertion.test.ts; six-binding browser page-insertion.spec.ts; native Visio reopen scripts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Deletion renumber option and template/locale replacement defaults; general inherited/string/background-render-context page formulas; broader native page-setting corpus                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Page setup and backgrounds     | Design > Page Setup, Backgrounds, Borders & Titles and View > Page Breaks                                                                                                                                            | Partial: orientation, standard sizes, Fit to Drawing, Auto Size growth right and up, Page Setup dialog (paper, size, drawing scale, page properties), VBackground backgrounds, borders and plain-text titles, page break lines                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Core edit-page-setup.test.ts, edit-page-decoration.test.ts; UI viewer-page-setup.test.ts; browser page-setup.spec.ts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Native reopen, Visio background masters and PAGENAME titles, left/bottom Auto Size growth, margin and print zoom editing, Visio tile origin                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Zoom and fit                   | Visio status-bar zoom slider, Fit to Window (Ctrl+Shift+W), Page Width, 100%, Ctrl+wheel                                                                                                                             | Initial implementation: shared ooxml-ui zoom slider, View ribbon Zoom group and the floating Pan & Zoom window (page thumbnail, visible-area outline, click or drag to pan, arrow keys, Ctrl+wheel zoom)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | viewer-element.ts; viewer-commands.ts; viewer-pan-zoom.ts; viewer-chrome.test.ts; viewer-pan-zoom.test.ts; visio-toolbar.spec.ts; task-windows.spec.ts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Zoom dialog presets, resizing the Pan & Zoom outline to zoom, pinch behavior and large-diagram performance                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Ribbon and toolbar commands    | Microsoft Visio window: File backstage, Quick Access Toolbar, Home, Insert, Design, Data, Process, Review, View and Help tabs, Tell me, Shapes window, context menus, page bar and status bar, with native shortcuts | Partial. Layout follows a capture of Visio 16: tabs, groups, large and three-row commands, dropdown and split menus, dialog launchers; File backstage; Tell me what you want to do (Alt+Q) over every ribbon command with its location; KeyTips (Alt, then letters) across tabs and both Home and View levels; the Shapes window with the Basic Shapes stencil and a minimised Shapes strip that reopens it; shape and page context menus; page tabs with All pages and Insert Page; the Presentation Mode button in the status bar. Working: bounded Home and mixed-run formatting, the Quick Styles gallery and Effects > Shadow presets, Format Painter (fill, line and text; no gradients or effects) and Change Case, source duplication and viewer shape clipboard, shape ordering, multi-selection, atomic deletion and alignment/distribution (see above), Undo/Redo, Pointer Tool with local 2D selection movement and marquee, Connector tool (Ctrl+3, right-angle, straight or curved connectors with shape-to-shape or point glue), Connection Point tool (Ctrl+Shift+1), View > Connection Points, Design > Connectors and Insert > Connector, Rectangle, Ellipse, Line, Freeform, Arc and Pencil drawing tools, fixed-size Text Tool and every Basic Shapes master (Ellipse and Circle as native ellipses, the rest as local line outlines from `basic-shapes.ts`; the Can's curves are polylines and Visio's own master shapesheets are not reproduced), Change Shape (the Home > Editing gallery of the Basic Shapes, enabled for exactly one top-level local 2D shape: its Geometry sections are replaced through the core `change-shape` edit, keeping position, size, rotation, flips, text and formatting, with Rounding set for the rounded rectangle and cleared otherwise; Ellipse and Circle use the native Ellipse row and keep the shape's own size; master instances, groups, 1D lines and connectors, pictures, glued shapes, shapes with control handles, LockReplace or LockVtxEdit, and outlines read by other formulas are refused with their reason; Visio's own master replacement, which swaps the master and its shapesheet, is not reproduced and changed shapes are not yet reopened in Visio), Insert Text Box and Blank Page, Edit Text, Shape Data, Find, Layer Properties, Ruler, Grid, Task Panes, Pan & Zoom, Zoom presets, Fit to Window, Page Width, Presentation Mode (F5, read-only page-by-page show), Full Screen, File New blank drawing, Open, Save and Save As (VSDX copy), Export SVG, Print current page, Close, Info, Account (shared ooxml-ui profile editor, stored on this device) and Visio Options (shared ooxml-ui options dialog; User name and Initials honoured, every other setting disabled with its reason). Every other command, master and page is visible, disabled and names the missing capability. Composed from shared ooxml-ui elements, including the ribbon tab row, File backstage, print preview, Find bar and rulers | ribbon*.ts, backstage.ts, viewer-backstage.ts, viewer-options.ts, viewer-tell-me.ts, viewer-options.test.ts, shapes-window.ts, viewer-stencil.ts, ribbon-change-shape.ts, viewer-change-shape.ts, edit-change-shape.ts, viewer-context-menu.ts, viewer-commands.ts, viewer-presentation.ts, viewer-ruler.ts; viewer-chrome.test.ts, viewer-commands.test.ts, viewer-presentation.test.ts, shapes-window.test.ts, viewer-change-shape.test.ts, edit-change-shape.test.ts, visio-toolbar.spec.ts. Rectangle create plus delete reopened in Visio 16 over COM with exact PinX/PinY/Width/Height; the other Basic Shapes masters are not yet reopened in Visio                                                                                                                                                                                                                                                                                                                                                                           | Native clipboard interoperability and broader clipboard admission, advanced text formatting, theme fonts and effects, bevel and 3-D effects, grouping and broader arrangement admission, Change Shape for master instances and the remaining Insert, Design, Process and Review commands need new core edit commands. Also missing: PDF export, bundled Help, broader on-canvas gesture admission, Guides and stencil files. Page Breaks works                                                                                                                                                                                                               |
| Shape selection                | Identify shapes by page and shape ID                                                                                                                                                                                 | Ordered immutable multi-selection, additive pointer/keyboard toggles, Select All, Escape and first-selected primary; all six native state/event bindings                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Page-scoped selection, roving focus, lifecycle tests and all-six browser formatting/arrangement workflows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Marquee selection, assistive-technology and broader cross-browser audit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Framework integration          | One renderer across host frameworks                                                                                                                                                                                  | Six thin native adapters with lifecycle tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | React/Vue/Angular/Svelte/Solid/vanilla runtime checks; selected SSR/hydration checks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Standalone packaging, cross-browser and historical peer-version matrix                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Editing and history            | Move, resize, style, text, undo/redo                                                                                                                                                                                 | Experimental plain text and admitted top-level local 2D create/move/resize/delete (rectangle and canonical ellipse creation), local unglued straight-line creation/moves, Width-cell resizing and endpoint API/pointer edits, unreferenced local line deletion, plus local rotation/quarter-turn/flip commands (including proven static transform formulas), bounded primitive master-instance moves with explicit local pins, bounded local formatting/stacking order, multi-selection alignment/distribution and atomic deletion with undo/redo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Shared geometry controls, atomic API, all-six forwarding and Chrome editing tests; core corpus: 12 admitted master instances across four files, 59 refusals from 71 scanned                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Master resize/delete, group edits beyond proven rotation, glue, unsupported package dependencies, rich-text and advanced style edits and native Visio fidelity remain unsupported or unverified                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Native save and round-trip     | Save editable VSDX preserving unknown parts                                                                                                                                                                          | Experimental local VSDX copy export for admitted text, geometry, formatting and ordering edits                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Core atomic preservation, dependency and independent safety tests; worker-isolated edits, bounded history and explicit downloaded copies. Signed and macro packages are rejected                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | General writer, broader geometry and scoped cache recalculation, rich text and general native fidelity; specific formatting/arrangement captures pass native Visio reopen (see verification record)                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Export and print               | SVG, images, PDF and print layout                                                                                                                                                                                    | Partial: SVG export and bounded immutable print artifacts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Shared export/snapshot APIs, all-six handle tests, four-page real snapshot and raster pixel tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Print frames/dialogs, saved printer/layer settings, PNG/PDF output, embedded fonts and native comparison                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Legacy and other Visio formats | VSD, VDX, stencils, templates, macros                                                                                                                                                                                | Bounded binary VSD v11 preview through ole2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Byte-signature dispatch; explicit page/shape transforms, move/line geometry and plain text with diagnosed fallback styles. Legacy source is retained, with VSDX editing/export disabled.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Older binary versions, groups/masters, rich formatting, complex geometry, native Visio fidelity, VDX, stencils, templates and macros                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Collaboration and comments     | Shared editing with durable state                                                                                                                                                                                    | Partial: File > Share starts a live session (ooxml-core/collab, Yjs) between windows of this browser over BroadcastChannel. The whole VSDX package is shared; remote changes arrive as one undoable history step; collaborators show with the shared ooxml-ui presence element                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | viewer-share.ts; viewer-share.test.ts (two controllers sync a load, an edit and an undo); core package-sync.test.ts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Sharing across devices (needs a host-provided server transport), field-level merging (concurrent changes: the last package wins), threaded and live comments (comments are saved in the file; see above), authentication and roles                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Visio visual parity            | Measured equivalence on real documents                                                                                                                                                                               | Not established; real corpus under comparison                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 19 upstream drawings import; secondary embedded-thumbnail comparisons reveal gaps                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Full reference renders, fonts/settings, measured fidelity and manual review                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Corner rounding                | Rounded contiguous geometry                                                                                                                                                                                          | Partial: closed axis-aligned rectangles and native-observed clamped open orthogonal paths                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Analytic regressions; nine Visio 16 native cases; five 60973 rectangles and seven connectors (18 cached corners)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | General polygon, compressed PolylineTo and mixed/curved path rounding; live rerouting and broader native visual comparison                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Drawing/page scales            | Native physical page and drawing units                                                                                                                                                                               | Partial: page and shape geometry normalized; pointer insertion converts back to drawing inches                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Core page-scale.test.ts; UI page-scale.test.ts; six native Visio pages                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Broader native group/image/background corpus; native editing dependency closure; browser pixels                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

## Evidence required

1. Genuine Visio-authored documents and a representative compatibility corpus.
2. Versioned Visio reference renders with fonts/page settings.
3. Measured geometry, text, connector and style comparisons.
4. End-to-end edit, save and reopen tests in Microsoft Visio.
5. Unknown XML part and relationship preservation.
6. Cross-framework/browser interaction and accessibility tests.

Warnings are useful but not comprehensive. Absence of diagnostics is not a fidelity guarantee.

## References

- [Microsoft file format reference](https://learn.microsoft.com/en-us/office/client-developer/visio/visio-file-format-reference)
- [Introduction to VSDX](https://learn.microsoft.com/en-us/office/client-developer/visio/introduction-to-the-visio-file-formatvsdx)
- [MS-VSDX](https://learn.microsoft.com/en-us/openspecs/sharepoint_protocols/ms-vsdx/50c23601-c943-4ff2-b4a1-02445f52daf0)
- [Engine repository](https://github.com/ChristopherVR/ooxml), local implementation under src/core/visio. Unpublished changes may not be on the remote.
- [Viewer design reference](https://github.com/ChristopherVR/pptx-viewer)
