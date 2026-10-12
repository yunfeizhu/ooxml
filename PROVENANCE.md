# Provenance

## Shared core build command runner

Source: ChristopherVR/ooxml at `376480f82`, `src/core/scripts/build.mjs`.
Its process-spawning helper moved to `src/core/scripts/run-build.mjs`, retaining
the Windows command flow and adding spawn-error rejection. The full build and
new Visio build orchestrator share it. Visio also reuses the strict declaration
compiler and `scripts/esm-declarations.mjs`, replacing tsup's unsupported legacy
declaration API. The fast bundle includes both public Visio entry points.

## Oblique Visio stroke projection

Source: ChristopherVR/ooxml at `376480f82`,
`src/core/visio/theme-gradient.ts` and `native-gradient-stops.ts`.
The stroke descriptor now calls the existing physical linearGradientEndpoints
helper for cached oblique angles, with physical stroke margins. No geometry
formula or painter was copied. UI supplies the already normalized shape size;
source caches remain intact. Two native raster captures verify the bounded
45-degree and rotated 225-degree rectangle scopes.

## Shared Visio stroke gradient descriptors

Source: ChristopherVR/ooxml at `e567a4a8a`, the existing fill-gradient parser in
`src/core/visio/saved-fill-gradient.ts`, native stop helper in
`scripts/visio-native-gradient.ps1`, and SVG painter in
`src/ui/src/visio/render-fill.ts`. They now serve both fills and strokes without
copied parsing or stop serialization. The new physical stroke span descriptor
was moved from the in-progress UI painter into
`src/core/visio/native-gradient-stops.ts`; UI delegates through the existing
`ooxml-core/visio/ui` export. Source stop caches remain unchanged. Native section
248, layer overrides and horizontal/vertical PNG measurements motivate the
stroke-specific behavior; nonlinear directions and arrow paint remain explicit
limitations.

Every module moved into this repository is recorded here: source repository and path, the commit it was taken at, and what was changed on the way in. Entries name the area (`src/<area>/`) of the single package `ooxml-core`. Consumers replace their own copy only after the moved module's tests pass here.

| Package    | Module                                                                                                                                                                 | Source                                                                                            | Source commit                                  | Changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `units`    | `units.ts`, `units.test.ts`                                                                                                                                            | `docx-viewer/packages/core/src/units.ts`                                                          | `c56b3ae` (main, 2026-10-01)                   | Verbatim copy; header comment reworded; `EMU_PER_*` constants added (previously duplicated in `docx-core/drawing.ts` and pptx `core/constants.ts`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `color`    | `color-primitives.ts`, `color-linear.ts`, `color-primitives.test.ts`                                                                                                   | `pptx-viewer/packages/core/src/core/color/`                                                       | `3b50c7a28` (last change to these files; main) | Copied unchanged except relative imports now end in `.js`. Compiles under this repo's strict settings. `color-transforms`, `color-utils` and `theme-color-ref` stay in pptx until the unified XML package exists (they take pptx's `XmlObject`).                                                                                                                                                                                                                                                                                                                                                                                          |
| `geometry` | 78 modules and 19 test files (preset shape definitions, connection sites, clip paths, callouts, guide-formula core, boolean shape operations, adjustment-aware shapes) | `pptx-viewer/packages/core/src/core/geometry/`                                                    | `17d75540e` (origin/main when copied)          | Relative imports end in `.js`; added `indexed.ts` (`at`) and fixed all `noUncheckedIndexedAccess`/`exactOptionalPropertyTypes` errors with bounds-checked access (empty-polygon edge cases in boolean union/clip now throw `RangeError`); added `index.ts`. **Not moved** (they import pptx types or utilities): `connector-geometry`, `connector-preset-geometry`, `custom-geometry*` (parser, guides, live eval, command order, guide write-back), `freeform-builder`, `guide-formula` (+ `-paths`), `preset-adjustment-validation`, `preset-shape-evaluator`, `shape-geometry`, `transform-utils`, and five tests that depend on them. |
| `xml`      | `xml.ts` (+ new `namespaces.ts`, tests)                                                                                                                                | `docx-viewer/packages/core/src/xml.ts`                                                            | `3be6e4c` (main)                               | Generalised: element/attribute helpers take a namespace (docx keeps Word defaults in a thin wrapper); `parseXml` takes a label for error messages (docx passes `DOCX`, so its messages are unchanged); added `NS` constants for all part families and unit tests. This is the baseline of the unified XML model decided on 2026-10-01.                                                                                                                                                                                                                                                                                                    |
| `opc`      | `relationships.ts`, `content-types.ts`, `package.ts`, `safe-href.ts`, `relationship-types.ts` (+ tests)                                                                | `docx-viewer/packages/core/src/{relationships,package-parts,zip-parts,relationship-allocator}.ts` | `8795a34` (main)                               | Merged docx's two different `parseRelationships` into one (`{id,type,target,mode}`); `buildRelationshipsXml` takes the map key as id; `ensureDocumentRelationship` generalised to `ensureRelationship(zip, relsPath, ...)`; added relationship-type constants, `relationshipsPartFor`, `nextRelationshipId`, `findOfficeDocumentPart`; content-type `raw` element dropped (unused). `RelationshipAllocator` and `DocPrIdAllocator` stay in docx until the DrawingML package exists.                                                                                                                                                       |

## `docx` area (moved 2026-10-01)

| Area   | Modules                                                                                                                                                                                     | Source                                                        | Source commit                  | Changes                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docx` | All 179 files of `docx-viewer/packages/core/src/` (model, parser, serializer, editing, validation, numbering, styles, revisions, `embedded.ts`, `generated/`, `test-support/`, `*.test.ts`) | `docx-viewer/packages/core/src/` (`@christophervr/docx-core`) | `f4a557d` (docx-viewer `main`) | Copied into `src/core/docx/` (file history stays in docx-viewer). Imports of `ooxml-core/{units,xml,opc}` became relative imports of the sibling areas; nothing else in the sources changed except header-comment wording and two files re-wrapped by `oxfmt`. The Word wrappers (`units`, `xml`, `relationships`, `package-parts`, `zip-parts`) stay in this area. `@christophervr/docx-core` is now a thin re-export of `ooxml-core/docx`. |
| `docx` | `schemas/ecma-376-transitional/` (ECMA-376 5th edition Transitional XSDs, with their ECMA and W3C licence texts)                                                                            | `docx-viewer/packages/core/schemas/ecma-376-transitional/`    | `f4a557d`                      | Unchanged. Used by `src/core/docx/schema-validity.test.ts` through `xmllint-wasm` (new devDependency).                                                                                                                                                                                                                                                                                                                                       |
| `docx` | `scripts/gen-schema-types.ts` (script `gen:docx-schema-types`)                                                                                                                              | `docx-viewer/packages/core/scripts/gen-schema-types.ts`       | `f4a557d`                      | Output path now `src/core/docx/generated/wml-simple-types.ts`; schema directory is `schemas/` at the repository root.                                                                                                                                                                                                                                                                                                                        |

## pptx area (2026-10-01)

| Package | Module                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Source                                                                                                                                            | Source commit                         | Changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pptx`  | All of `packages/core/src` (`core/`, `converter/`, `cli/`, `signature-node/`, `index.ts`, `__tests__/` and its fixtures) and the core scripts: `gen-test-fixture`, `generate-*`, `perf-*` plus the generators that import or write core files (`make-font-advance-table.ps1`, `gen-smartart-gallery-baseline`, `measure-smartart-engine-vs-legacy`, `update-smartart-allowlist`, `dump-smartart-fixture`, `debug-pyra`, `make-saltless-verifier-fixture`) | `pptx-viewer/packages/core/src`, `pptx-viewer/packages/core/scripts`, `pptx-viewer/scripts`, `pptx-viewer/e2e/fixtures` (decks used by the tests) | `17d75540e` (origin/main when copied) | Copied to `src/core/pptx` and `scripts/pptx`. `src/core/color` and `src/core/geometry` modules that already live in the `color` and `geometry` areas were deleted and their importers repointed at `../../color/*.js` / `../../geometry/*.js` (100 files removed: the duplicated sources and their exact-duplicate tests, which already exist in those areas); `EMU_PER_*` constants now come from `units`. Test fixtures that read `e2e/fixtures` of the viewer now read the snapshot in `src/core/pptx/__tests__/fixtures/e2e` (decks, `.ppt`, small media); `openxml-coverage.test.ts` resolves evidence paths relative to the area. Everything else is unchanged and compiled with relaxed TS flags (`tsconfig.pptx.json`); the XML model is still `fast-xml-parser` object trees. |

Notices that cover the moved code: `NOTICE` (MTX decompression is the external `mtx-decompressor` package, MPL-2.0) and `THIRD-PARTY-LICENSES` (runtime dependencies). The `font-advance-widths*.generated.ts` tables are glyph advance measurements taken from Microsoft PowerPoint through COM automation (numeric facts, no font data is embedded).

## Chart gradient fills (2026-10-01)

| Package | Module                                                                                                                                                                                                                                                                                                                                                                                                        | Source                                                                                                                                        | Source commit                                                                                                                                                                               | Changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pptx`  | Chart series and data-point gradient fills (pptx-viewer issue #387): `chart-gradient-fill-writer`, `chart-gradient-fill-xml`, `chart-xml-series-fill`, `chart-gradient-input`, `chart-gradient-operations`, `setChartSeriesGradient`, `setChartDataPointGradient`, `ChartBuilder.gradient`, `ChartSeriesInput.gradientFill`, `PptxChartDataPoint.gradientFill`, series/data-point save paths, and their tests | `sedrew/pptx-viewer` branch `feat/core-chart-gradient-fill` (contributor Sergei Malygin, GitHub `sedrew`; fork of the Apache-2.0 pptx-viewer) | `b363b2b` (fix: persist removal of the last data point override), `415317c` (feature), `9a06370` (tests), `255830f` (OOXML_PERCENT_UNITS), `6b7fde0` (angular test, not ported: UI package) | Paths mapped `packages/core/src/<x>` to `src/core/pptx/<x>` and applied as a patch; `OOXML_ANGLE_UNITS_PER_DEGREE` / `OOXML_PERCENT_UNITS` added to `src/core/pptx/core/constants.ts`. Reviewed for CT_ShapeProperties order, one fill choice, lossless round trip and line-drawn handling; no behavioural changes to the contribution were needed. The builder-guide documentation commit (`fd380db`) and the angular package test are not ported (docs and UI live in pptx-viewer). Everything else is as contributed. |

## diagram area (2026-10-02)

Extracted from `src/core/pptx` of this repository at `c3e0979` (itself taken from `pptx-viewer` `17d75540e`) so that Word can read SmartArt; plan in `docs/agnostic-core-plan.md`.

| Area         | Module                                                                                                             | Source                                                                                                                                                                           | Changes                                                                                                                                                                                                                                                                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `diagram`    | `attributes.ts`                                                                                                    | `pptx/core/utils/smartart-data-model-attributes.ts` (`parseSmartArtConnection`, `parseSmartArtPointCustomLayout`), `diagram-relationship-ids.ts` (`parseDiagramRelationshipIds`) | Rewritten against an `AttributeReader` (name to string) instead of `XmlObject`; same results and key order. The pptx functions now call these with an `@_`-attribute reader.                                                                                                                                                                                                      |
| `diagram`    | `layout-category.ts`                                                                                               | `pptx/core/core/runtime/smartart-layout-category.ts`                                                                                                                             | Moved; the pptx file is a one-line delegate.                                                                                                                                                                                                                                                                                                                                      |
| `diagram`    | `relationships.ts`                                                                                                 | `pptx/core/core/runtime/smartart-drawing-part.ts`                                                                                                                                | Resolution order unchanged; the host supplies relationship lookup and `.rels` entries (`DiagramPartHost`) instead of a presentation runtime. pptx adapts its slide rels and parser.                                                                                                                                                                                               |
| `diagram`    | `data-model.ts`                                                                                                    | `PptxSmartArtParser.ts`, `parseSmartArtConnections` (pptx runtime), `smartart-connector-labels.ts` (`collectSmartArtTransitionText`), `validateSmartArtDataModelCore`            | New DOM parser with the same semantics (transition labels, parent edges, issue codes); `collectTransitionText` and `connectionLabel` are shared with pptx.                                                                                                                                                                                                                        |
| `diagram`    | `definitions.ts`, `drawing*.ts`, `load.ts`, `types.ts`                                                             | new, modelled on `parseSmartArtQuickStyle`, `parseSmartArtDrawingShapes`/`parseDrawingShape` and `types/smart-art*.ts`                                                           | New neutral model and DOM parsers; theme resolution is injected (`DrawingColorTheme`) instead of the handler runtime. Not yet used by pptx (its drawing parser still resolves colours through the runtime); a parity test is planned (plan, step 4). Colour resolution (`drawing-color.ts`) follows `pptx/core/color/color-transforms.ts` for the transforms it lists as applied. |
| `pptx` types | `SmartArtLayoutType`, `SmartArtColorScheme`, `SmartArtStyle`, `PptxSmartArtConnection`, `SmartArtNodeCustomLayout` | `pptx/core/types/smart-art*.ts`                                                                                                                                                  | Now aliases of the `diagram` types; identical shape.                                                                                                                                                                                                                                                                                                                              |
| `docx`       | `diagram.ts`, `diagram-document.ts`, `diagram-theme.ts`                                                            | new                                                                                                                                                                              | `DocxDiagram` on `InlineImage.diagram`; reads the parts through `diagram`.                                                                                                                                                                                                                                                                                                        |
| fixture      | `src/core/docx/__fixtures__/smartart.docx`                                                                         | built by `scripts/docx/build-smartart-fixture.mjs` from `src/core/pptx/__tests__/fixtures/corpus/smartart-orgchart-assistants.pptx`                                              | The five parts of diagrams 1 and 2 and the theme are copied byte for byte except the `relId` of `dsp:dataModelExt` in each data part (rewritten to the Word relationship id). `document.xml`, relationships and content types are hand-built; the file was not produced by Word.                                                                                                  |

## `drawingml` area (2026-10-08)

Step 3 of `docs/agnostic-core-plan.md`. Moved with `git mv` inside this repository from `src/core/diagram` at `d9ef4e075`, where they were written as provisional, diagram-independent DrawingML code.

| Area        | Module                                                                                                                                                                                                                                                                                                                                                      | Source                                                                      | Changes                                                                                                                                                                                                                                                                           |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `drawingml` | `drawing-color.ts`, `drawing-color-css.ts`, `drawing-color-brightness.ts`, `ordered-color-transforms.ts`, `drawing-fill.ts`, `drawing-text.ts`, `drawing-geometry.ts`, `drawing-shadow.ts`, `write-color.ts`, `write-fill.ts`, `gradient-presets.ts`, `gradient-preset-data.ts`, `gradient-geometry.ts`, `rect-path-gradient.ts`, `dom.ts`, and their tests | `src/core/diagram/` (same file names)                                       | Moved unchanged apart from type names: `DiagramColor`, `DiagramFill`, `DiagramLine`, `DiagramText*`, `DiagramFrame` and `DiagramPath*` became `Drawing*` in `drawingml/types.ts`. `diagram` keeps the old names as aliases, re-exports the moved modules and re-exports `dom.ts`. |
| `drawingml` | `theme-model.ts`, `theme.ts`, `theme-color.ts`                                                                                                                                                                                                                                                                                                              | new, modelled on `src/core/docx/theme.ts` and `src/core/xlsx/read/theme.ts` | Neutral colour scheme (as `DrawingColor`), font scheme with script overrides, colour map parser and `clrMap` resolution. `docx/theme.ts`, `docx/diagram-theme.ts` and `xlsx/read/theme.ts` now map it onto their unchanged public types.                                          |
| `docx`      | `theme-color.ts`                                                                                                                                                                                                                                                                                                                                            | private linear-light helpers                                                | Replaced by the identical `srgb255ToLinear`, `linearToSrgb255` and `toHex` of the `color` area.                                                                                                                                                                                   |

## `diagram` model and layout engine (2026-10-08)

Step 2 of `docs/agnostic-core-plan.md`. Moved with `git mv` inside this repository from `src/core/pptx` at `03b6a34ac` (the pptx code itself came from `pptx-viewer` `17d75540e`).

| Area       | Module                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Source                                                                                                                                                                    | Changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `diagram`  | `model/constraint-rules.ts`, `model/layout-primitives.ts`, `model/layout-definition.ts`, `model/style-definition.ts`, `model/node.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `pptx/core/types/smart-art-constraint-rules.ts`, `smart-art-layout-primitives.ts`, `smart-art-layout-definition.ts`, `smart-art-style-definition.ts`, `smart-art-node.ts` | Renamed `PptxSmartArt*` to `Diagram*` (`PptxSmartArtColorStyleLabel` became `DiagramColorTransformLabel`, `SmartArtRoleColorList` became `DiagramRoleColorList`). The raw-XML slot (`rawXml`), the run style and the 3D models became type parameters (`R`, `S`, `Scene`/`Shape`/`Text`, default `unknown`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `diagram`  | `model/data.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `pptx/core/types/smart-art.ts` (`SmartArtLayout`, `PptxSmartArtPresLayoutVars`, the neutral fields of `PptxSmartArtData`)                                                 | `DiagramLayoutPreset`, `DiagramPresLayoutVars` and `DiagramData`. `PptxSmartArtData` now `extends DiagramData` and adds the relationship ids, cached drawing shapes, chrome and save hints.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `pptx`     | `core/types/smart-art-model.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | new                                                                                                                                                                       | Every moved `PptxSmartArt*` name is an alias binding the neutral type to `XmlObject`, `TextStyle` and the pptx 3D types, so no pptx type changed shape.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `geometry` | `preset-shape-evaluator.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `pptx/core/geometry/preset-shape-evaluator.ts`                                                                                                                            | Moved so the diagram layout engine can evaluate preset shapes without pptx. Imports point at the sibling shared modules; `fill`, `stroke` and `textRect` accept an explicit `undefined` (as the code already produced) for the strict project. Not exported from the `geometry` entry; pptx imports it by path and its tests stay in `pptx/core/geometry`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `geometry` | `ooxml-arc.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `ooxmlArcToSvg` and `ArcToResult` from `pptx/core/geometry/guide-formula-paths.ts`                                                                                        | Moved unchanged; `ArcToResult` is now exported. pptx (`guide-formula-paths`, `custom-geometry`, the `guide-formula` barrel and tests) imports it from here.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `diagram`  | `engine/*.ts` (the engine modules and its XML-free tests: `alg-cycle`, `alg-hier`, `alg-pyra`, `alg-snake`, `constraint-eval`, `constraint-fill-idiom`, `ordered-xml`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `pptx/core/utils/smartart-engine/` (same file names)                                                                                                                      | Typed over `DiagramData`, `DiagramNode`, `DiagramConnection` and `DiagramStyleIntensity` instead of the pptx names; preset shapes come from `geometry/preset-shape-evaluator`. Strict: index reads that the algorithms already guarantee are asserted (`!`), optional fields that the code assigns `undefined` to accept it explicitly, and `alg-connector` checks a missing predecessor before `indexOf` (same result). No behaviour change. The seven tests that load decks through `PptxHandler` or `smartart-decompose` stay in `pptx/core/utils/smartart-engine/` and import the engine from here. `engine/index.ts` is new and exports the entry points from `ooxml-core/diagram`.                                                                                                                                                                                                                                                                                                                                                                                                            |
| `diagram`  | `layout/smartart-text-wrap-fit.ts`, `smartart-line-pitch.ts`, `smartart-layout-item-font-tier-fit.ts`, `smartart-layout-style-helpers.ts`, `smartart-layout-types.ts`, their tests and `font-kerning.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                               | `pptx/core/utils/` (same file names)                                                                                                                                      | The text-fit and layout-result modules the engine shares with the pptx interpreters. `TieredFontFitItem` moved into `smartart-layout-item-font-tier-fit.ts` (re-exported by the pptx `smartart-layout-item-font-tier.ts`) so the engine does not import the interpreters; `flattenNodes` is generic over the node style. Optional result fields accept an explicit `undefined`. `layout/index.ts` is new.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `diagram`  | `layout/smartart-font-table.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `resolveFontTable` from `pptx/core/utils/smartart-layout-item-font-size.ts`                                                                                               | Moved unchanged; the pptx module re-exports it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `diagram`  | `layout/smartart-layout-interpreter-when*.ts`, `-axis-count`, `-axis-depth`, `-axis-hop`, `-axis-range`, `-presof-choose`, `-composite-detect` and their tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `pptx/core/utils/` (same file names), moved with `git mv` at `0f081d260`                                                                                                  | The `dgm:if` evaluation, axis navigation and composite detection the choose walkers decide with. Typed over `DiagramNode`/`DiagramLayoutNode`/`DiagramWhen`; the axis helpers are generic over the node type so pptx keeps `PptxSmartArtNode` results. Strict: three asserted index reads. No behaviour change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `diagram`  | `layout/smartart-layout-interpreter-choose-branch.ts`, `-choose-algorithm.ts`, `-choose-composite.ts`, `-choose-depth.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `pptx/core/utils/` (same file names), `git mv` at `0f081d260`                                                                                                             | Ported from the `fast-xml-parser` `XmlObject` tree to the engine's ordered-XML elements (`engine/ordered-xml`), iterated through `groupedChildren` (same-named siblings grouped in first-appearance order, the order the object tree gave). The public functions take a `RawXmlView` that turns a model raw slot into an element. pptx keeps bound wrappers of the same names (`pptx/core/utils/smartart-layout-interpreter-choose-algorithm.ts`, `-choose-depth.ts`) and their tests. Parity: `pptx/core/utils/smartart-choose-walkers-corpus.test.ts` ran every walker over the 353 distinct layout definitions of the committed decks and built-in layouts with the old and new code and produced byte-identical output; its digests are committed as a file snapshot.                                                                                                                                                                                                                                                                                                                           |
| `diagram`  | `layout/smartart-choose-xml.ts`, `layout/smartart-layout-control-flow.ts`, `layout/smartart-constraint-rules.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | new; the parsers and validators extracted from `pptx/core/utils/smartart-layout-control-flow.ts` and `smartart-constraint-rules.ts`                                       | `dgm:forEach`/`dgm:if` and `dgm:constr`/`dgm:rule` attribute parsing through an `AttributeReader`, validation and the attribute values a writer sets. The pptx modules keep the object-tree lookups and writers and call these. Constraint parity: 85,299 constraints over 544 layout parts parsed, validated and written identically by the old and new code (one-off test, not committed).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `diagram`  | `layout/smartart-constraint-values.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `pptx/core/utils/smartart-constraint-values.ts`, `git mv`                                                                                                                 | Moved unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `diagram`  | `layout/smartart-constraint-solver.ts`, `-constraint-resolve.ts`, `-constraint-branch-index.ts`, `-constraint-declared-by.ts`, `-constraint-sibling-roles.ts`, `-constraint-ratio-fallback.ts`, `layout/smartart-layout-interpreter-constraints.ts` and their tests                                                                                                                                                                                                                                                                                                                                                                         | `pptx/core/utils/` (same file names), `git mv` at `985110b2e`                                                                                                             | The constraint family: typed over `DiagramConstraint`/`DiagramNumericRule`/`DiagramLayoutNode`; `findConstraint` is generic over the constraint type so pptx keeps `PptxSmartArtConstraint`. Strict: the solver's target parameter accepts explicit `undefined`, two tests type their literals. No behaviour change. `smartart-constraint-rules.ts` stays in pptx as the object-tree reader and writer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `diagram`  | `layout/smartart-layout-interpreter-model.ts`, `-flow.ts`, `-flow-direction.ts`, `-arrangement-kind.ts`, `-choose-resolve.ts`, `-composite-alternative.ts`, `-hierarchy-descendant.ts`, `-position-family.ts`, `-tree-location.ts` and the tests of `-choose-resolve`, `-composite-alternative`, `-position-family`                                                                                                                                                                                                                                                                                                                         | `pptx/core/utils/` (same file names), `git mv` at `51c88cda3`                                                                                                             | The interpreter model (arrangement discovery). `discoverArrangement`, `resolveNonHierarchyChoose` and `hasHierarchyDescendant` take the `RawXmlView` first and are generic over the raw slot; `ArrangementPlan`, `walkWithTreeLocation`, `itemTemplateNodes`, `itemNode` and `selectArrangedNodes` are generic so pptx keeps its node types. The flow module no longer re-exports the choose resolution. pptx keeps `smartart-layout-interpreter-model.ts` and `-flow.ts` as bound facades (and the `-model`/`-flow` tests, which use object-tree literals). Strict: `WhenContext` fields accept explicit `undefined`; four asserted index reads. No behaviour change (corpus walker snapshot unchanged).                                                                                                                                                                                                                                                                                                                                                                                           |
| `diagram`  | `hierarchy/smartart-hierarchy-*.ts` (all 39 modules) and `hierarchy/smartart-layout-interpreter-hierarchy.ts`, with the tests of every module but `-generation-templates` and `-tailed-transpose`                                                                                                                                                                                                                                                                                                                                                                                                                                           | `pptx/core/utils/` (same file names), `git mv` from `8fb1f582d`                                                                                                           | The hierarchy arranger and its placers. Typed over `DiagramNode`/`DiagramLayoutNode`/`DiagramPresLayoutVars`/`DiagramStyleIntensity`. The functions that read a layout node's raw `dgm:choose` XML (`resolveHierarchyDispatchLinDir`, `-ChAlign`, `resolveHierarchyRootAlign`, `resolveHierarchyGenerationTemplates`, `tailedHierarchyDeclaresChAlign`) and every caller up to `arrangeHierarchy` take the `RawXmlView` first and are generic over the raw slot; `flattenOrgChartGroupWrappers` and `applyChildOrder` are generic over the node type. Strict: four asserted index reads, optional option and result fields accept an explicit `undefined`, `DiagramNode.parentId` accepts `undefined` (the org-chart flattening already wrote it). The moved tests pass a `RawXmlView` that returns nothing (their literals have no raw slots) and type the `HierarchyHangShape` literals they always left partial. pptx keeps `smartart-layout-interpreter-hierarchy.ts` as a bound facade and the two tests that use object-tree raw XML. No behaviour change (corpus walker snapshot unchanged). |
| `diagram`  | `layout/smartart-layout-interpreter-hierarchy-fontfit.ts`, `-preset-node.ts`, `-render.ts`, `layout/smartart-layout-item-font-role.ts`, `-font-size.ts`, `-font-tier.ts`, `layout/smartart-layout-shape-preset.ts`, `-shape-polygon.ts` and their tests (not `-item-font-tier.test.ts`, which drives a pptx interpreter)                                                                                                                                                                                                                                                                                                                    | `pptx/core/utils/` (same file names), `git mv` from `8fb1f582d`                                                                                                           | The item font sizing, styled node builders and preset-shape resolution the hierarchy reaches. Types renamed as above; the font modules take the neutral `ArrangementPlan`. Optional parameter fields accept an explicit `undefined`. No behaviour change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `diagram`  | `layout/smartart-tree.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `TreeNode`, `buildForest`, `buildTree`, `treeWidth`, `treeDepth` from `pptx/core/utils/smartart-helpers.ts`                                                               | Moved unchanged apart from a run-style type parameter (`TreeNode<S>`). `smartart-helpers.ts` keeps the slide-element factories, re-exports the functions and aliases `TreeNode` to `TreeNode<TextStyle>`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `diagram`  | `layout/smartart-layout-interpreter.ts` and the rest of the interpreter family (`-arranged-selection`, `-aux`, `-composite*` (19), `-conn-path`, `-connector-order`, `-custom`, `-cycle*` (17), `-dispatch`, `-hub`, `-hub-detect`, `-item-role*`/`-item-roles*` (11), `-linear*` (6), `-named-rules`, `-pyramid*`, `-render`, `-snake`), `layout/smartart-layout-item-tx-anchor.ts`, `layout/smartart-layout-snake-grid.ts`, `layout/smartart-node-role-colors.ts`, `layout/smartart-node-tree-axis.ts`, and their tests except those of `-arranged-selection`, `-hub`, `-hub-detect` and `-item-tx-anchor` (object-tree raw XML literals) | `pptx/core/utils/` (same file names), `git mv` from `2ed4281d8`                                                                                                           | Typed over the neutral model (`DiagramConnection`, `DiagramIteratorAttributes`, `DiagramNodeCustomLayout`). Every function that reads raw `dgm:choose`/`dgm:forEach` XML, and every caller up to `interpretSmartArtLayout`, takes a `RawXmlView<unknown>` first (the interpreters' layout nodes keep an untyped raw slot, so these are not generic); `smartArtChildrenOf` and the other tree-axis helpers are generic over the run style. Strict: asserted index reads (runtime no-ops), optional fields of option and result types and of `DiagramLayoutNode` accept an explicit `undefined`; the moved tests pass a `RawXmlView` that returns nothing and assert their index reads. pptx keeps bound facades of the public entry points (`smartart-layout-interpreter.ts`, `-linear.ts`, `-composite.ts`, `-aux.ts`), so `ooxml-core/pptx` is unchanged, and `pptxOrderedXml` is typed over `unknown` (it already ignored non-object slots). No behaviour change (corpus walker snapshot unchanged).                                                                                              |
| `diagram`  | `layout/smartart-interpreter-fold-text.ts` (`collectFoldedDescendants`, `foldedItemText`, `foldedDescendantTexts`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `pptx/core/utils/smartart-interpreter-fold-text.ts`, `git mv`                                                                                                             | Generic over the node type. `projectFoldedNodeText`, which projects pptx text runs, stays in a new pptx module of the same name that re-exports the moved functions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `pptx`     | `core/utils/smartart-ordered-xml-adapter.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | new                                                                                                                                                                       | The pptx boundary: converts a layout definition's `XmlObject` raw slot to an ordered element once (cached per object). `smartart-layout-item-tx-anchor`, `-interpreter-item-role-orientation`, `-interpreter-hub-detect` and `smartart-hierarchy-tailed-transpose` now walk the converted element instead of the object tree.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `text`     | `font-metrics/font-advance-widths*.generated.ts`, `font-metrics/font-kerning.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `pptx/core/utils/` (same file names)                                                                                                                                      | Moved unchanged (generated PowerPoint glyph advance tables). `scripts/pptx/make-font-advance-table.ps1` now writes here. Not exported from the `text` entry.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

## `docx/layout` and `docx/load` (2026-10-02)

| Area          | Modules                                                                                                                                                                                                                                             | Source                                                                                                    | Source commit                  | Changes                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docx/layout` | about 27 modules and 21 test files: pagination (`layoutDocumentModel`, `layoutDocument`, `layoutSections`), adapter from `DocumentModel`, paragraph/line breaking, tab stops, tables, floats, notes, keep rules, fonts, units, `createFakeMeasurer` | `docx-viewer/packages/layout/src/` (`@christophervr/docx-layout`)                                         | `f009c62` (docx-viewer `main`) | Imports of `@christophervr/docx-core` became relative imports of the `docx` area; `defined-props` and `expect-defined` now reuse the `docx` copies; `__tests__/helpers.ts` became `test-helpers.ts`. `createCanvasMeasurer` (the only DOM code) was **not moved**: it stays in the viewer as the browser implementation of `TextMeasurer`. New `regression.test.ts` (determinism, page breaks, table splitting, section/header-footer contract). |
| `docx/load`   | `detect.ts` (`detectDocumentFormat`, `loadDocument`), `legacy-doc.ts` (`loadLegacyDoc`, `LegacyDocError`), tests and `__fixtures__/ole-word-97.doc`                                                                                                 | `docx-viewer/packages/document/src/index.ts`, `docx-viewer/packages/legacy/src/index.ts` and `__tests__/` | `f009c62`                      | Relative imports of the `docx` model and `loadDocx`. The legacy loader imports `@christophervr/ole2` (0.3.0, a devDependency; the viewer pinned 0.2.0), which `tsup.config.ts` inlines into `docx/load` so consumers need no ole2; ole2 is consumed, never copied.                                                                                                                                                                               |

## ooxml-ui package (2026-10-02)

Second published package of this repository (`ooxml-ui`, `packages/ui`); plan in `docs/ooxml-ui-plan.md`. The elements are new `office-ui-*` implementations that reuse the contracts and some code of `pptx-viewer` (`f08abea17`, `packages/shared/src/web-components`) and of `docx-viewer` (`abf4e79`, `packages/web-component/src`). Nothing was copied from `docx-viewer` yet.

| Module (`packages/ui/src`)                                                                     | Source                                                                                                                                                                                               | Changes                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `styles.ts`                                                                                    | `control-styles.ts` (`attachControlStyles`)                                                                                                                                                          | Renamed `attachStyles`; shared forced-colors/coarse-pointer rules added.                                                                                                                                                                                                                                                    |
| `registry.ts`                                                                                  | `registration-contract.ts` (`assertWebControlContract`, `markWebControlContract`)                                                                                                                    | New contract symbol `office-ui.web-control-contract`; `defineOnce`/`definer` wrap the lazy-class, idempotent definition pattern of `index.ts`.                                                                                                                                                                              |
| `checkable.ts`                                                                                 | `checkbox.ts`, `checkbox-styles.ts`                                                                                                                                                                  | Checkbox and a new `switch` share one implementation; `--pptx-*` tokens became `--office-*`; Enter toggles the switch.                                                                                                                                                                                                      |
| `button.ts`                                                                                    | `ribbon-command.ts`, `ribbon-command-styles.ts`                                                                                                                                                      | Rewritten format-neutral: `office-command` event with a `command` string instead of `RibbonControlId`; icon lookup through the shared registry; `delegatesFocus`.                                                                                                                                                           |
| `context-menu.ts` (controlled mode), `menu-model.ts`                                           | pptx-viewer `fe7b4ad40`, `packages/shared/src/web-components/{context-menu,context-menu-model,context-menu-view,context-menu-styles}.ts` and `render/flyout-position.ts`                             | Merged into the existing office-ui-context-menu as a second, state-driven mode sharing keyboard, type-ahead and dismissal; events renamed `office-menu-*` with static overrides; marker names any `data-*`; icons on rows; token based                                                                                      |
| `select.ts`                                                                                    | `select.ts`, `select-menu.ts`, `select-trigger.ts`, `select-value.ts`                                                                                                                                | Rewritten as one module with the same keyboard contract (arrows, Home/End, typeahead, Enter/Space/Escape, disabled skipping); options are a property only, no `<option>` children yet.                                                                                                                                      |
| `ribbon.ts`                                                                                    | `ribbon-group.ts`                                                                                                                                                                                    | Group without the ResizeObserver centring (product layout); new `toolbar` with arrow-key navigation.                                                                                                                                                                                                                        |
| `icons.ts`                                                                                     | `ribbon-icons.ts`                                                                                                                                                                                    | Only the product-neutral glyphs (16); registry API is new; the view, insert and animation sets stay in pptx-viewer.                                                                                                                                                                                                         |
| `theme.ts`                                                                                     | host and control CSS variables of pptx-viewer (`--pptx-*`)                                                                                                                                           | New `--office-*` token set incl. dark, forced-colors and touch-target rules.                                                                                                                                                                                                                                                |
| `dialog.ts`, `status-bar.ts`, `presence.ts`, `smartart*.ts`                                    | new                                                                                                                                                                                                  | Written for this package. `smartart-svg.ts` draws the core `diagram` `DiagramDrawing` (not a copy of pptx-viewer's `smartart-drawing.ts`, which is bound to the pptx model).                                                                                                                                                |
| `account.ts`                                                                                   | pptx-viewer `fe7b4ad40`, `packages/shared/src/render/account.ts` and `viewer-prefs-storage.ts` (`ViewerProfile`, swatches, initials, profile persistence)                                            | Renamed `OfficeProfile`; one suite-wide storage key; validation of stored data; new `office-ui-account` element replaces the per-binding account pages' profile editor. Autosave storage summary stays in pptx-viewer                                                                                                       |
| `options.ts`                                                                                   | pptx-viewer `fe7b4ad40`, `packages/shared/src/render/options/viewer-options-controls.ts` (control/section/tab schema, `clampOptionNumber`)                                                           | Labels resolved by the product instead of i18n keys; flat value keys; per-control and per-category `disabled` reasons; new `office-ui-options-dialog` element replaces the per-binding settings dialogs' rendering                                                                                                          |
| `select.ts`, `select-menu.ts`, `select-styles.ts`                                              | pptx-viewer `fe7b4ad40`, `packages/shared/src/web-components/{select,select-menu,select-trigger,select-value,select-styles,select-ribbon-styles}.ts`                                                 | Replaces the earlier ooxml-ui select: declarative `<option>`/`<optgroup>` children plus the `options` property, token-based styles, popup placement read from tokens                                                                                                                                                        |
| `radio.ts`, `search-field.ts`, `ribbon-toggle.ts`, `chrome-controls.ts`, `document-notices.ts` | pptx-viewer `fe7b4ad40`, `packages/shared/src/web-components/{radio,search-field,ribbon-toggle,dialog-footer,compat-toasts,read-only-banner,paste-options}.ts` and `render/chrome-controls-state.ts` | Tags renamed to `office-ui-*`, `--office-*` tokens, text supplied translated instead of i18n keys, event names and test ids moved to static class fields so pptx keeps its tags as subclasses, positioning and option lists left to the product; the dialog footer now reorders buttons in place so focus survives removals |
| `ribbon-tabs.ts`, `find-bar.ts`, `ruler.ts`, `print-preview.ts`                                | visio-viewer `fe7fed1` (`src/ribbon.ts` tab row, `src/viewer-search.ts`, `src/viewer-ruler.ts`, the backstage print preview)                                                                         | Moved out of the Visio viewer and made format-neutral (labels, origin and scale supplied by the product); pptx-viewer keeps per-binding copies until it adopts these                                                                                                                                                        |
| `backstage.ts`                                                                                 | pptx-viewer `fe7b4ad40`, `packages/shared/src/render/backstage.ts` (`BACKSTAGE_NAV` model), and visio-viewer `fe7fed1` (`src/backstage.ts`, `src/viewer-backstage.ts`, `src/styles/backstage.css`)   | One element for the File view shell: items with a footer group, light-DOM pages, cancelable select and close events                                                                                                                                                                                                         |

## `collab` area (2026-10-02)

Logic that is DOM-free and useful to both products was extracted and generalised; DOM, UI, ProseMirror and product document mapping stayed in the viewers (see `docs/collab-area.md` for the full moved/stayed list). Source commits: `pptx-viewer` `f08abea17`, `docx-viewer` `abf4e79`.

| Module (`src/core/collab/`)                                                                                                                   | Source                                                                                                                                                                                                                                                                                            | Changes                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `validation.ts`                                                                                                                               | `pptx-viewer/packages/shared/src/render/collaboration-presence.ts` (room id, user name, colour, avatar, index/coordinate clamps, mixed-content check); `docx-viewer/packages/web-component/src/collaboration-protocol.ts` (`validId`)                                                             | `sanitizeSlideIndex` became `sanitizeIndex`, `clampCursorPosition` became `clampCoordinate` with a configurable margin; `isMixedContentBlocked` reads `globalThis.location` instead of `window`; added `validateDisplayName` (docx `validatePresenceProfile` rules), `isNonNegativeSafeInteger`.                                                                   |
| `identity.ts`                                                                                                                                 | `collaboration-presence.ts` (palette, `assignUserColor`, `formatCursorLabel`); `collaboration-active-session.ts` (`getUserInitials`, `buildActiveSessionUsers`); `docx-viewer .../collaboration-identity.ts` (`createCollaborationIdGenerator`); `pptx-viewer .../types.ts` (`CollaborationRole`) | Id generator takes a product prefix (`dve` was hard-coded) and no longer imports ProseMirror (the ProseMirror id-repair transaction stays in docx-viewer); roster drops the slide number (product payload); `createClientId` added.                                                                                                                                |
| `presence.ts`                                                                                                                                 | `collaboration-presence.ts` (`sanitizePresence`, `derivePresenceList`, `presenceToCursors`, `isPresenceFresh`, `asSelectionIds`, timing constants)                                                                                                                                                | Split into an identity part and a product payload sanitiser (`derivePresence<T>`); the pptx canvas payload is kept as `deriveCanvasPresence` with the same wire shape (`presence` awareness field). `mapAwarenessCursors` (legacy flat Angular/Vue shape) stays in pptx-viewer.                                                                                    |
| `awareness.ts`                                                                                                                                | `collaboration-presence-publisher.ts`; `collaboration-external-session.ts` (`borrowExternalCollaborationAwareness`); `collaboration-departure.ts` (`removeAwarenessStatesLocally`); `collaboration-teardown.ts` (`clearLocalAwareness`)                                                           | Publisher generic over the payload and takes an injectable clock; identity is no longer pptx-shaped.                                                                                                                                                                                                                                                               |
| `lifecycle.ts`                                                                                                                                | `collaboration-teardown.ts`, `collaboration-departure.ts`                                                                                                                                                                                                                                         | Channel and leave-message names configurable and neutral by default (`ooxml-core:`); pptx-viewer's former names exported as `LEGACY_PPTX_*` constants.                                                                                                                                                                                                             |
| `policy.ts`                                                                                                                                   | `collaboration-sync-gate.ts`, `collaboration-load-origin.ts`, `collaboration-broadcast-follow.ts`                                                                                                                                                                                                 | Load rule takes `roomIsNonEmpty` instead of a slide count.                                                                                                                                                                                                                                                                                                         |
| `assets.ts`                                                                                                                                   | `collaboration-assets.ts`                                                                                                                                                                                                                                                                         | The pptx field table and `pptx:assets` map name became an `AssetSpec` (`createAssetSync`), so pptx documents stay wire-compatible.                                                                                                                                                                                                                                 |
| `external-provider.ts`                                                                                                                        | `collaboration-external-session.ts` (`observeExternalCollaborationSession`); per-binding y-websocket/y-webrtc wiring                                                                                                                                                                              | `adaptYjsProvider` is new (wraps y-websocket/y-webrtc as a `SyncProvider`).                                                                                                                                                                                                                                                                                        |
| `ordering.ts`                                                                                                                                 | `docx-viewer .../collaboration.ts`, `collaboration-protocol.ts`, `presence.ts` (version/sequence/duplicate rules, bounded caches, `freezeBatch`) and `collaboration-authority.ts` (request idempotency)                                                                                           | ProseMirror removed: the same decisions as pure functions and small classes (`classifyVersion`, `IdempotencyCache`, `SequenceTracker`, `BoundedMap`, `freezeDeep`). The step-rebasing authority itself stays in docx-viewer.                                                                                                                                       |
| `codec.ts`, `emitter.ts`, `provider.ts`, `transport-provider.ts`, `memory-transport.ts`, `websocket-transport.ts`, `session.ts`, `binding.ts` | New                                                                                                                                                                                                                                                                                               | No source: the two viewers had no shared session, transport abstraction, in-memory transport or update validation. `transport-provider.ts` implements the y-websocket wire protocol (sync step 1/2/update, awareness, query-awareness) over a `Transport`. `binding.ts` encodes the seeding/adoption rules from pptx-viewer `collaboration-external-readiness.ts`. |

## `visio` area (2026-10-02)

New DOM-independent Visio VSDX scene logic, developed in this repository alongside
`ChristopherVR/visio-viewer`. The viewer's integration snapshot at commit
`ad5644f` (`integration/ooxml-visio.patch`) records this code against ooxml
`1a927a16ea8451f569a4ba226ac3db4baa5d87df`; these modules were not extracted
from an existing viewer implementation. Publication adds the `ooxml-core/visio`
subpath and strict ESM/CJS/declaration build entries. UI, text layout, raster
decoding, and worker lifecycle remain in the viewer. EMF conversion remains in
`emf-converter`; this area supplies bounded admission and inert vector validation.
The initial publication was a read-only supported subset. Subsequent original
work adds bounded cached horizontal gradients, optional trusted worker metafile
conversion, and an experimental source-backed plain-text transaction. The new
`edit*.ts`, `saved-fill-gradient*.ts` and `theme-root-gradient.test.ts` modules
were developed here, not extracted from another repository. This remains a
supported subset, not a ShapeSheet engine or general round-trip editor.

The subsequent bounded open orthogonal rounding extension is original work in
`geometry.ts` and `rounded-geometry.ts`, with analytic and hash-pinned external
Apache POI corpus regressions in `orthogonal-rounding.test.ts` and
`orthogonal-rounding-corpus.test.ts`. See `docs/visio-connector-rounding.md` for
primary semantics, fixture provenance and the nonclamped admission boundary.
The source evidence supports five connectors and 14 corners; native Visio
pixel equivalence and short-segment radius allocation remain unverified.

All new files under `src/core/visio/`:

- `README.md`
- `complex-geometry.test.ts`
- `complex-geometry.ts`
- `convert-metafile.test.ts`
- `convert-metafile.ts`
- `corpus-regressions.test.ts`
- `diagnostics.ts`
- `emf-admission-adversarial.test.ts`
- `emf-admission-comment.ts`
- `emf-admission-compatibility.test.ts`
- `emf-admission-context.ts`
- `emf-admission-corpus.test.ts`
- `emf-admission-geometry.ts`
- `emf-admission-input.ts`
- `emf-admission-records.ts`
- `emf-admission-types.ts`
- `emf-admission.test-fixtures.ts`
- `emf-admission.test.ts`
- `emf-admission.ts`
- `foreign-vector-adversarial.test.ts`
- `foreign-vector-graph.ts`
- `foreign-vector-path.ts`
- `foreign-vector-test-fixtures.ts`
- `foreign-vector-types.ts`
- `foreign-vector-validation.test.ts`
- `foreign-vector-validation.ts`
- `foreign-vector-values.ts`
- `foreign-vector.test.ts`
- `foreign-vector.ts`
- `geometry.test.ts`
- `geometry.ts`
- `images-integration.test.ts`
- `index.ts`
- `layer-limits.test.ts`
- `layers.test.ts`
- `layers.ts`
- `line-pattern.test.ts`
- `line-pattern.ts`
- `line-style.test.ts`
- `line-style.ts`
- `media.test.ts`
- `media.ts`
- `metadata.test.ts`
- `metadata.ts`
- `model.ts`
- `nurbs-flatten.test.ts`
- `nurbs-flatten.ts`
- `nurbs-independent.test.ts`
- `nurbs.ts`
- `package-common.ts`
- `package.test.ts`
- `package.ts`
- `paragraphs.ts`
- `parser.test.ts`
- `parser.ts`
- `parts.ts`
- `prepare-images.ts`
- `prepare-metafiles.test.ts`
- `prepare-metafiles.ts`
- `raster-inspection.test.ts`
- `rounded-geometry.test.ts`
- `rounded-geometry.ts`
- `shape-metadata.test.ts`
- `shape-metadata.ts`
- `shapes.ts`
- `sheet.ts`
- `spline-geometry.test.ts`
- `spline-geometry.ts`
- `style-inheritance.ts`
- `style.ts`
- `test-fixtures.ts`
- `text-background.ts`
- `text.test.ts`
- `theme-color.ts`
- `theme-fixtures.ts`
- `theme-gradient.test.ts`
- `theme-gradient.ts`
- `theme-line.test.ts`
- `theme-line.ts`
- `theme-resolve.ts`
- `theme-root-corpus.test.ts`
- `theme-root-fallthrough.test.ts`
- `theme-root-fill.test.ts`
- `theme-root.test.ts`
- `theme-root.ts`
- `theme.test.ts`
- `theme.ts`
- `visibility-limits.test.ts`
- `visibility-metadata.test.ts`
- `visibility.test.ts`
- `visibility.ts`
- `xml-validation.ts`
- `zip-validation.ts`

## `xlsx` area (2026-10-03)

New code, written for this repository rather than moved: no viewer had a SpreadsheetML implementation to extract. The pptx area's embedded-workbook helpers (`src/core/pptx/core/utils/chart-xlsx-*`, `parse-embedded-xlsx`) were left in place; they serve chart data inside decks and can move onto `xlsx` once the pptx area adopts the shared XML model.

| Area         | Modules                                                                                                                        | Source | Notes                                                                                                                                                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `xlsx`       | `model.ts`, `address.ts`, `cells.ts`, `workbook.ts`, `styles.ts`, `numfmt/`, `formula/`, `read/`, `write/`, `edit/`, `layout/` | New    | Expected results in the tests were recorded from Excel 16 through COM (`__fixtures__` generators: number formats, formula results, theme tints). Fixtures were generated with openpyxl and Excel COM; personal metadata is scrubbed by the generators. |
| `xlsx/load`  | `detect.ts`, `legacy-xls*.ts`, `csv.ts`                                                                                        | New    | Maps ole2's `readXlsWorkbook` (new in ole2 on branch `xls-workbook`) onto the workbook model; ole2 is inlined by tsup like `docx/load`. The `.xls` fixtures are copies of ole2's `test/fixtures/xls/`, which holds their generator.                    |
| `xml`, `opc` | `namespaces.ts` (`xdr`, `x14`, `x14ac`, `xr`, `tc`, `xv`, ...), `relationship-types.ts` (SpreadsheetML types)                  | New    | Appended constants only.                                                                                                                                                                                                                               |

## `digest` area (2026-10-03)

New code, written for this repository rather than moved. A strict shared area holding
synchronous, pure-TypeScript message digests and the ECMA-376 agile password hash, so every
format can verify protection hashes without Web Crypto (which needs a secure context and is too
slow when each of Office's 100,000 spin rounds is awaited).

- `sha512.ts` (SHA-512 and SHA-384 on one core with separate IVs) moved from
  `src/core/xlsx/edit/sha512.ts` (commit `b38a0b7`, new code there); `sha256.ts` and `sha1.ts` are new.
  The tests check each digest against `node:crypto` across the padding boundaries and against the
  FIPS 180-4 vectors.
- `algorithm-names.ts` ports `normalizeDigestAlgorithmName` and its tests from the pptx area's
  `src/core/pptx/core/utils/digests/algorithm-names.ts` (same repository); the pptx module has
  since been removed in favour of this one (see below).
- `password-hash.ts` (`hashPassword`, `verifyPasswordHash`) replaces the spin loops in
  `src/core/xlsx/edit/protection.ts`. Expected values are hashes Excel 16 wrote through COM for a
  sheet and a workbook structure password.
- `md2.ts`, `md5.ts`, `ripemd-functions.ts`, `ripemd128.ts`, `ripemd160.ts`, `whirlpool.ts`,
  `whirlpool-table.ts`, `whirlpool-sbox.ts` and their tests moved from the pptx area's
  `src/core/pptx/core/utils/digests/` (this repository, commit `d9ef4e075`). Changes: strict flags
  (`noUncheckedIndexedAccess`), `@module` paths, WHIRLPOOL rewritten on 32-bit halves with split
  T-tables (it used one BigInt per lookup, tens of seconds for a 100,000-round spin), and
  RIPEMD-160's lane step on plain 32-bit arithmetic. Test vectors unchanged.
- `bit-ops.ts` and `md4.ts` are pure-TypeScript ports of `@christophervr/ole2`'s
  `utils/digests/bit-ops` and `utils/digests/md4` (which the pptx area forwarded to), so this area
  never imports ole2; MD4's round schedules are generated from RFC 1320 section 3.4 and MD5's
  feedback round is a flag on `applyRotatingRound`. `md4.test.ts` (RFC 1320 vectors) moved with it.
- The pptx `digests` folder is gone: its Web Crypto `digest` dispatcher and `algorithm-names.ts`
  are replaced by this area's `digestFunction` and `normalizeDigestAlgorithmName`, and
  `p:modifyVerifier` (`src/core/pptx/core/utils/modify-verifier-codec.ts`) now runs the shared
  synchronous `spinPasswordHash` instead of awaiting a digest per round (over 30 s per check).

## Math equation conversion (2026-10-03)

Source: `ChristopherVR/pptx-viewer`, commit `32df019105bbf5c77e63798c8fa1c0af23fc4e70`,
`packages/shared/src/render/`. The source and destination are Apache-2.0; the existing
root LICENSE and NOTICE cover this extraction. No third-party implementation was added.

- Moved `latex-omml-siblings.ts`, `latex-omml-symbols.ts`, `latex-to-omml.ts`,
  `latex-to-omml-commands.ts`, `latex-to-omml-constructs.ts`,
  `latex-to-omml-environments.ts`, `omml-color.ts`, `omml-to-latex.ts`,
  `omml-to-latex-helpers.ts`, `omml-to-latex-layout.ts`, `omml-to-mathml.ts`
  and the four existing converter/helper test files into `src/core/math`.
- The MathML converter was split into helpers, construct converters and dispatch
  to keep each source module below 300 lines. Strict indexing was made explicit
  in the delimiter loop; output behavior is unchanged.
- Product imports became local neutral OMML types. The compatibility tree keeps
  the established `@_` attributes and encoded ordering key spelling so existing
  PowerPoint equation load/edit/save output is unchanged. Ordering helpers are
  local and import no PowerPoint code. The shared DOM adapter additionally
  accepts ordered, namespace-aware OMML from any Office format, normalizes known
  namespace prefixes and uses the shared XML parser.
- Viewer entry files delegate to `ooxml-core/math`; their existing tests remain
  as compatibility coverage. Sanitization, equation editor controls and template
  galleries remain UI. The older PPTX Markdown `OmmlLatexConverter` remains
  unchanged because it has a distinct output contract.

## SVG curve flattening (2026-10-03)

Source: `ChristopherVR/pptx-viewer`, commit `bb89b9bddd6b3f696143164665f9539257cc057c`,
`packages/shared/src/render/svg-path-flatten.ts` and its colocated test file.
Both repositories are Apache-2.0; the existing LICENSE and NOTICE cover the extraction.

- Moved the pure SVG path-to-points algorithm and seven original tests into `src/core/geometry`.
  Cubic, quadratic and elliptical-arc sampling live in `svg-path-curves.ts`; the neutral
  `Point2` contract lives in `svg-path-types.ts`. No product model, DOM or UI dependency moved.
- Strict array indexing uses the geometry area's existing checked accessor. Incomplete
  move commands and nonfinite coordinates are ignored; invalid sampling counts use the
  default and excessive counts are bounded. Ordinary valid SVG output is unchanged.
- The viewer module delegates to `ooxml-core/geometry`, preserving the imports used by
  custom-shape merge outlines and SmartArt extrusion. The existing core boolean SVG
  parser and its linear-only behavior remain unchanged.

## Shared chart calculations and text primitives (2026-10-03)

Source: `ChristopherVR/pptx-viewer`, commit
`0d5a181fbfbd9f65c82fb7f973c05ebf4afade49`, `packages/shared/src/render/`.
Both repositories are Apache-2.0; the existing LICENSE and NOTICE cover this extraction.

- `chart-overlays-regression.ts`, `chart-box-whisker-stats.ts`,
  `chart-blank-display.ts` and `chart-stacked-series.ts` moved into `src/core/chart`
  as `regression.ts`, `box-stats.ts`, `blank-display.ts` and `stacked-series.ts`.
  The functions keep their established numerical contracts; structural series types
  replace product-specific imports. Algorithm tests accompany the move and viewer
  tests remain as compatibility coverage. The legacy viewer trendline implementation
  now calls the same regression functions rather than keeping a second copy.
- `unicode-script-detection.ts` moved into `src/core/text`, with tests. Runtime behavior
  is unchanged. It is a block-based font-category heuristic, not full Unicode script
  analysis or Word's language, hint and bidi font-slot rules.
- The viewer keeps thin compatibility entries through `pptx-viewer-core/chart`,
  `/text`, `/geometry` and `/color`. Its duplicate `normalizeHexColor`,
  `clampUnitInterval`, `hexToRgbChannels` and `colorWithOpacity` definitions now
  use the already canonical `src/core/color` implementations; no color algorithm was copied.

## Hyperlink policy (2026-10-03)

| Area  | Module                                    | Source                                                                                    | Source commit                 | Changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----- | ----------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `opc` | `safe-href.ts` (`hyperlinkPolicy`), tests | `pptx-viewer/packages/shared/src/render/hyperlink-security.ts` (`isUrlSafe`) and its test | `266f2558e` (pptx-viewer-new) | The blocked-scheme, case and whitespace/zero-width/NUL hardening and its tests were ported into a new store/open policy (allowlist instead of blocklist: open http/https/mailto; store also ftp/file, relative, UNC, drive and in-document locations). Broadened the stripped set (all C0 controls, DEL, soft hyphen, bidi marks, word joiner) and added a rejection for allowed schemes split by ignorable characters. `isSafeHyperlinkHref` is unchanged. The slide-jump and `window.open` helpers stay in pptx-viewer (UI). |

## xlsx drawing anchors (2026-10-03)

| Area          | Module                                      | Source                                                                                                                                       | Source commit                  | Changes                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `xlsx/layout` | `anchors.ts`, `anchors.test.ts` (new tests) | `xlsx-viewer/packages/web-component/src/grid/drawings.ts` (`anchorBox`, `boxAnchor`, `EMU_PER_PX`) and `commands/insert.ts` (picture extent) | `6196ce1` (xlsx-viewer `main`) | `anchorBox` became `anchorToPixelBox(sheet, anchor, metrics?)` and `boxAnchor` became `pixelBoxToAnchor(sheet, box, metrics?, like?)` (`like` is the previous anchor or `'oneCell'`/`'twoCell'`, default one-cell); same maths (4 px minimum two-cell edge, 200 px default extent, offsets rounded to whole EMU at 100% zoom). `EMU_PER_PIXEL` comes from `units`; the insert-picture extent became `pictureAnchorAt` and `pixelSizeToExtent`. |

## Document properties and xlsx SmartArt (2026-10-03)

| Area             | Module                                                                                           | Source                                                                                                                 | Changes                                                                                                                                                                                                                                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `opc/properties` | `core.ts`, `app.ts`, `custom.ts`, `types.ts`, `properties.test.ts`                               | new; the patch-in-place approach follows `src/core/docx/core-properties.ts` (`applyCoreProperties`) of this repository | Core (all Dublin Core and `cp:` fields), extended (known `app.xml` fields, `HeadingPairs`/`TitlesOfParts`) and custom (`lpwstr`, `i4`, `r8`, `bool`, `filetime`, other variants kept raw, pid allocation) properties over the shared `xml` DOM. Writers patch the source part so unknown elements survive. `docx` still uses its own six-field module. |
| `xlsx`           | `read/workbook-part.ts` (`parseDocProps`), `write/doc-props.ts`, `edit/doc-properties.ts`, tests | `write/workbook-part.ts` (`coreXml`, `appXml`) of this repository                                                      | `WorkbookProperties` extends the OPC core and app types plus `custom`; `docProps/app.xml` and `core.xml` are patched instead of regenerated; `docProps/custom.xml` written with its content type and root relationship; `EditSession.setDocumentProperties` (undoable).                                                                                |
| `xlsx`           | `read/smart-art.ts`, `read/smart-art.test.ts`, `SmartArtObject` in `model.ts`                    | new; mirrors `src/core/docx/diagram.ts` (`resolveDiagramParts`) of this repository                                     | SmartArt graphic frames load through `diagram`'s `loadDiagram` into `{ kind: 'smartArt' }` with the cached `DiagramDrawing`; the writer keeps the frame XML and every diagram part, re-anchoring only the position.                                                                                                                                    |
| fixture          | `src/core/xlsx/__fixtures__/excel-smartart.xlsx`                                                 | generated by `src/core/xlsx/__fixtures__/generate-excel-smartart.ps1` (Excel COM, Basic Block List, three nodes)       | Author fields and the save folder replaced after saving; the account name is never changed.                                                                                                                                                                                                                                                            |

## xlsx formula-bar text (2026-10-03)

| Area        | Module                                    | Source                                                                  | Source commit                  | Changes                                                                                                                                                                                                                                                                  |
| ----------- | ----------------------------------------- | ----------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `xlsx/edit` | `input-text.ts` (tests in `find.test.ts`) | `xlsx-viewer/packages/web-component/src/formula-bar/cell-input-text.ts` | `408fe71` (xlsx-viewer `main`) | Same rules (dates as `m/d/yyyy h:mm:ss AM/PM`, percents with `%`, 15 significant digits, apostrophe for text that would re-parse); split into `numberInputText`, `formulaBarText(workbook, cell, { quote })` and `cellInputText`. Find and replace now search this text. |

## `crypto` area and OPC signatures (2026-10-03)

Moved within this repository from the pptx area, source commit
`5ef0c503f1c6b48bd3ac15bb805a587a7e485d6a` (`src/core/pptx/core/utils/`). The old pptx files are now
one-line (or, for the ArrayBuffer-returning PowerPoint names, few-line) compatibility re-exports,
so every pptx importer and the Node verifier (`src/core/pptx/signature-node`) are unchanged.

| Area            | Module                                                                                                                                                                  | Source (`src/core/pptx/core/utils/`)                                                                          | Changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `crypto`        | `index.ts`, `types.ts`, `errors.ts`, `decrypt.ts`, `encrypt.ts`, `encryption-info.ts`, `encryption-info-write.ts`, `key-derivation.ts`, `detect.ts`, `aes-ecb.ts` (new) | `ooxml-crypto.ts`, `ooxml-crypto-{types,errors,decrypt,encrypt,key-derivation}.ts`, `encryption-detection.ts` | Neutral API `decryptOoxmlPackage`, `encryptOoxmlPackage`, `verifyOoxmlPackagePassword`, `isEncryptedOoxmlPackage`, `openEncryptedPackage` (bytes in, `Uint8Array` out); errors gained a stable `code` and `PasswordRequiredError` is new. Split to stay under 300 lines; strict flags (`exactOptionalPropertyTypes` fixes). The password spin now runs once per derivation on the synchronous `digest` SHA functions (Excel's 100,000-round file opens in about 0.4 s instead of 13 s). Two Standard-scheme bugs fixed and checked against node:crypto and Excel 16: the key always goes through the X1/X2/X3 extension ([MS-OFFCRYPTO] 2.3.4.7, AES-128 was a plain truncation), and the verifier and package use AES-ECB, not CBC (Excel rejected our Standard files before). The CFB container and AES/HMAC primitives still come from `@christophervr/ole2` subpaths, inlined by tsup; not in the root entry. |
| `crypto` tests  | `crypto.test.ts`, `detect.test.ts`, `standard.test.ts` (new)                                                                                                            | `ooxml-crypto.test.ts`, `encryption-detection.test.ts`                                                        | Renamed to the neutral API. The PowerPoint-authored fixture test, the compound-file round trip and new compatibility-name checks stay in `src/core/pptx/core/utils/ooxml-crypto.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `opc/signature` | `detection.ts`, `types.ts`, `constants.ts`, `xml-utils.ts`, `digest.ts`, `inspection-status.ts`, `reference-utils.ts`, `index.ts` and their tests                       | `signature-*.ts` and tests                                                                                    | Moved unchanged apart from strict fixes (optional properties spread, indexed access) and the new `isSignaturePart` / `SIGNATURE_PART_PREFIX`. Re-exported as the `signature` namespace of `ooxml-core/opc`. `constants.ts` still holds the pptx-viewer manifest namespace and environment variable names the Node verifier uses.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `xlsx/load`     | `detect.ts`, `errors.ts` (new), `encrypted.test.ts` (new)                                                                                                               | New                                                                                                           | `WorkbookFormat` gained `'encrypted'` and `'xlsb'`; `loadWorkbook(input, { password })`, `saveWorkbook(workbook, 'xlsx', { password })`. `__fixtures__/encrypted/excel-encrypted.xlsx` was saved by Excel 16 (its `generate-excel-encrypted.ps1`, `RemovePersonalInformation`); our agile and Standard output was opened in Excel 16 with the password through COM.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `docx/load`     | `detect.ts`, `encrypted.test.ts` (new)                                                                                                                                  | New                                                                                                           | `loadDocument(input, { password })`; `__fixtures__/word-encrypted.docx` was saved by Word 16 (`generate-word-encrypted.ps1`); our encrypted .docx was opened in Word 16 through COM.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `xlsx`          | `read/load.ts`, `write/save.ts`, `model.ts` (`signatures`), `write/signatures.test.ts`                                                                                  | New                                                                                                           | `loadXlsx` records `workbook.signatures` and warns; `saveXlsx` never carries the signature origin, signatures, their relationships or content types. The signed test package is built by hand (signing through Excel COM needs a certificate in the user's store).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

## PowerPoint headless automation (2026-10-03)

Moved from ChristopherVR/pptx-viewer at 7a27232ea0461c78df8c1ed9dd11636044d7c818:
packages/tools/src/tools (28 implementation modules), packages/tools/src/execution.ts, packages/tools/src/types.ts and packages/tools/src/codec (2 implementation modules), with their tool, execution and codec regression tests and Word fixture. Destination: src/core/pptx/automation. Apache-2.0 license retained. Imports of pptx-viewer-core now resolve to the local pptx entry. Model operations are unchanged; viewer modules are compatibility exports of the core namespace. Schemas, MCP registration, filesystem transport and CLI stay in the viewer repository. Yjs remains an external dependency to preserve constructor identity across the codec and its host.

## `teams` area (2026-10-04)

New code, nothing moved. `src/core/teams` (model, chat, signaling, peer, call, server-config, workspace, store, view) is written for this repository on top of the `collab` area; the Lit elements in `packages/ui/src/teams` are new. The y-websocket wire format it speaks is the one documented in `src/core/collab/transport-provider.ts`. See `docs/teams-area.md`.

## Editor logic moved out of the viewers (2026-10-05)

| Area           | Module                                                                                                                                                                        | Source                                                                                                                                                                                   | Changed                                                                                                                                                |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `xlsx/formula` | `editor-text.ts`, `editor-text.test.ts`                                                                                                                                       | ChristopherVR/xlsx-viewer `packages/web-component/src/grid/formula-text.ts` (408fe71)                                                                                                    | Imports point at core modules; the test moved with the code.                                                                                           |
| `docx`         | `document-stats.ts`, `document-stats.test.ts`                                                                                                                                 | ChristopherVR/docx-viewer `packages/web-component/src/document-stats.ts` (44b369f)                                                                                                       | Imports point at core modules; exported from the `docx` entry.                                                                                         |
| `docx`         | `column-settings.ts`, `line-spacing.ts`, `section-layout.ts` (with `sectionsOf`), `column-settings.test.ts`                                                                   | ChristopherVR/docx-viewer `packages/web-component/src` (same names; `sectionsOf` from `section-commands.ts`)                                                                             | Imports point at core modules; the test no longer needs the editor.                                                                                    |
| `docx`         | `section-edit.ts`, `page-size.ts`, `page-setup-model.ts`, `attr-units.ts`, `case-transform.ts` (+ `page-setup-model.test.ts`, `attr-units.test.ts`, `case-transform.test.ts`) | ChristopherVR/docx-viewer `packages/web-component/src` (`section-commands.ts` model functions, `page-size.ts`, `page-setup-model.ts`, `attr-units.ts`, `change-case.ts` `transformCase`) | Selection-bound parts (`currentSectionIndex`, `insertSectionBreak`, the break plugin, `changeCase`) stay in the viewer; imports point at core modules. |

## `ooxml-ui/xlsx`

The whole `<xlsx-editor>` element (`packages/ui/src/xlsx/`, with its tests) moved from ChristopherVR/xlsx-viewer `packages/web-component/src` at `d981768`. Changes: imports of `@christophervr/xlsx-core` point at `ooxml-core/xlsx`, `ooxml-ui` self-imports became relative, `.css?inline` became `.css?raw`, the locale `import.meta.glob` became explicit imports, `:scope >` child queries became `children` filters (jsdom 30), and the legacy `.xls` fixture moved to `src/core/xlsx/__fixtures__/`.

## `ooxml-ui/docx`

The whole `<docx-editor>` element (`packages/ui/src/docx/`, with its tests) moved from ChristopherVR/docx-viewer `packages/web-component/src` at `77f820f`. Changes: `docx-core` imports point at `ooxml-core/docx`, `ooxml-ui` self-imports became relative, `.css?inline` became `.css?raw`, the SmartArt fixture moved to `src/core/docx/__fixtures__/`, and `attr-units`, `page-size`, `page-setup-model`, the pure section setters and `transformCase` are imported from `ooxml-core/docx` instead of kept as copies.

## `ooxml-ui/visio` and `ooxml-ui/teams` app

`packages/ui/src/visio/` is the whole root `src/` of ChristopherVR/visio-viewer at `818f4a4` (the `<visio-viewer>` element, renderer, workers, ribbon, print snapshot and their tests). Changes: `ooxml-ui` self-imports became relative, `.css?inline` became `.css?raw`, the two test fixtures it shared with the browser suite were copied to `src/core/visio/__fixtures__/`, and the demo-only `workspace-theme.test.ts` stayed in the viewer. The edit and parse workers are separate `ooxml-ui` build entries (`dist/edit-worker.js`, `dist/parse-worker.js`) next to the chunk that starts them. `packages/ui/src/teams/app/` is `packages/web-component/src` of ChristopherVR/teams-viewer at `e410d9b` (`<teams-app>`, settings, controller, bindings contract, store, storage), exported from `ooxml-ui/teams`.

## `ooxml-core/xlsx/ui`

The DOM-free modules of the xlsx editor moved from `packages/ui/src/xlsx` (itself from xlsx-viewer `d981768`) to `src/core/xlsx/ui/` with their tests: the editor context, command registry and every command, the dialog registry, selection model, localization and string tables, grid geometry, paint, icon-set and cell-item logic, theme tokens, formula-bar name resolution, backstage templates and the context-menu items. `commands/icons.ts` was split (glyph data stays pure, registration stays in the UI package) and `dialogHost` moved to `dialogs/host.ts`. The one name clash (`cssFont`) is `styleCssFont` for cell styles. The UI package imports the lot from `ooxml-core/xlsx/ui`.

## `ooxml-core/docx/ui`

The editor modules of `ooxml-ui/docx` (from docx-viewer `77f820f`) that need no DOM and no `prosemirror-view` value import moved to `src/core/docx/ui/`: the ProseMirror node and mark schema parts for breaks, notes, review and inline content, run properties and numbering helpers, the collaboration authority, identity, protocol and session ordering, header/footer history, table visuals, word count, zoom fit, ribbon action ids and colours, and the theme tokens. Core now depends on the headless ProseMirror packages (`prosemirror-model`, `-state`, `-transform`, `-commands`, `-history`, `-keymap`, `-collab`) and the `prosemirror-view` types.

## `ooxml-core/visio/ui`

The DOM-free modules of `ooxml-ui/visio` (from visio-viewer `818f4a4`) moved to `src/core/visio/ui/` with their tests: the viewer contract, diagnostics, document history, text search, edit commands and errors, foreign-vector budget, scene validation and snapshot scene. The workers and everything that renders or touches the DOM stay in `packages/ui/src/visio`.

## `ooxml-core/chart` automatic value axis

`src/core/chart/axis-nice.ts` and its test moved from ChristopherVR/pptx-viewer `packages/shared/src/render/chart-axis-nice.ts` at `15ed646e4`, unchanged apart from the test import path. The scale is PowerPoint's automatic-axis policy (zero anchor, 5% headroom, 1/2/2.5/5 steps, interval count from plot height); Excel uses a different interval policy, so `xlsx` keeps its own.

## `ooxml-core/chart` histogram binning

`src/core/chart/histogram-binning.ts` moved from ChristopherVR/pptx-viewer `packages/shared/src/render/chart-histogram-binning.ts` at `15ed646e4`. Changes: the PowerPoint options type became the neutral `HistogramOptions`, bin edges are labelled through an injected formatter (default `String`) instead of the viewer's `formatAxisValue`, the indexed bin access is guarded for `noUncheckedIndexedAccess`, and it gained the unit tests the viewer lacked.

## `ooxml-core/pptx/ui`

`src/core/pptx/ui/theme-color-swatches.ts` and `theme-color-picker-state.ts`, with their tests, moved from ChristopherVR/pptx-viewer `packages/shared/src/render` at `15ed646e4`. Changes: `pptx-viewer-core` imports became relative imports of the pptx core and the shared `color` area. The new `ooxml-core/pptx/ui` subpath (dual ESM/CJS through the pptx tsup config) holds DOM-free PowerPoint editor logic; the popup UI stays in the viewer.

## `viewers/pptx` (2026-10-06)

The whole ChristopherVR/pptx-viewer repository moved to `viewers/pptx` at `cd68df440` (its `main`), with its history rewritten under that path by `git filter-repo` and its 1,007 release tags kept; the merge is `dde62beb1`, and `viewers/pptx` at that commit has the same tree as pptx-viewer `main`. Nothing in the sources changed on import. Afterwards: its packages joined the root workspace and lockfile, `build:packages` and `scripts/build-pages.mjs` were added, its docs moved to `/ooxml/pptx/` on the shared Pages site, its package manifests name this repository, and CI and the release table list it. pptx-viewer now holds only a README pointing here, its licence files and a redirect from its old Pages site.

## PowerPoint viewer helpers moved to shared areas (2026-10-06)

Moved from `viewers/pptx/packages/shared/src/render` at `43e3e07e6`, with their tests where the viewer had them. Each viewer module is now a compatibility entry that re-exports the core through `pptx-viewer-core/<area>`, so the bindings' imports are unchanged.

| Area       | Module                                                                                                           | Source (`render/`)                                                                                                                                    | Changed                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `chart`    | `pie-best-fit.ts`, `pie-label-collision.ts`, `radar-geometry.ts`, `treemap-squarify.ts`, `trendline-equation.ts` | `chart-pie-best-fit.ts`, `chart-pie-label-collision.ts`, `chart-radar-geometry.ts`, `chart-treemap-squarify.ts`, `chart-trendline-equation-format.ts` | Indexed access guarded for `noUncheckedIndexedAccess` (best-fit corners, squarify rows). |
| `color`    | `contrast.ts`, `unit-rgb.ts`                                                                                     | `color-contrast.ts`, `color-units.ts`                                                                                                                 | None.                                                                                    |
| `text`     | `tab-leader.ts`, `decimal-tab.ts`                                                                                | `tab-leader.ts`, `text-tab-decimal.ts`                                                                                                                | `charAt` instead of an unchecked index.                                                  |
| `geometry` | `snap-guides.ts`, `align-distribute.ts`                                                                          | `snap-guides.ts`, `element-align.ts`                                                                                                                  | None. The `'slide'` align reference is the page or canvas the boxes sit on.              |

The viewer copies of `chart-axis-nice.ts`, `chart-histogram-binning.ts`, `theme-color-swatches.ts` and `theme-color-picker-state.ts`, left behind when those modules moved earlier (see above), are now forwarders too and their duplicate tests were removed; the histogram forwarder only binds the viewer's axis number format. `pptx-viewer-core` gained a `./ui` entry over `ooxml-core/pptx/ui` for the theme modules.

## Built-in SmartArt layout definitions (2026-10-07)

`src/core/pptx/core/utils/smartart-builtin-layouts/{catalog,data}.ts` hold 176 `dgm:layoutDef` definitions, one per `uniqueId`, extracted by `src/core/scripts/pptx/gen-smartart-builtin-layouts.mjs` from the layout parts of the ground-truth gallery fixtures (`src/core/pptx/__tests__/fixtures/smartart-gallery`, produced by PowerPoint through COM; see its README). Whitespace between tags is removed; each definition is stored as its own gzip member. The definitions are Microsoft's, as PowerPoint embeds them in every document that uses the layout. Basis for including them, recorded 2026-10-07 on the maintainer's decision to accept the residual risk:

- Microsoft's [Open Specification Promise](https://learn.microsoft.com/en-us/openspecs/dev_center/ms-devcentlp/1c24c7c8-28b0-4ce1-a47d-95fe1ff504bc) covers ECMA-376, ISO/IEC 29500 and `[MS-ODRAWXML]` (the DiagramML language the engine implements). It is a patent promise only and states that no other rights are granted by implication, so it is not a copyright licence for these files.
- Microsoft's [Creating Custom SmartArt Layouts](<https://learn.microsoft.com/en-us/previous-versions/office/developer/office-2010/gg583880(v=office.14)>) article says the `.glox` files for all built-in layouts are available for download and tells developers to copy the layout parts of existing documents as the starting point for their own layouts. It states no licence or terms of use and is archived.

No explicit licence for redistribution was found. If Microsoft objects, remove `catalog.ts` and `data.ts` and author the definitions in the repository's own words instead (`smartart-fabrication-layouts.ts` is the precedent); the engine runs any definition.

## PowerPoint chart grid editing policy

Source: ChristopherVR/ooxml, commit `862a71733d7b2015589ea25df07c6a9a4e2afc49`.

- `viewers/pptx/packages/shared/src/render/chart-data-grid-ops.ts` moved to
  `src/core/pptx/core/utils/chart-grid-operations.ts`. Imports now use the core
  chart model and immutable transforms directly. Public exports use the
  `chartGrid` prefix to avoid collisions with mutating element SDK functions.
  Invalid non-integer and out-of-range indices return null, including cell
  category indices that previously reached the throwing primitive.
- The adjacent source tests moved to `chart-grid-operations.test.ts`; the viewer
  tests remain to verify the compatibility facade. Added guards, immutability
  and point-formatting follow/pin policy regressions.
- The old viewer module is a re-export facade that preserves its six function
  names for all five framework bindings. No DOM or framework code moved to core.

## Shared colour-picker palette

Source: ChristopherVR/ooxml, commit `862a71733d7b2015589ea25df07c6a9a4e2afc49`.
`viewers/pptx/packages/shared/src/render/color-swatches.ts` and its adjacent
regression tests moved to `src/ui/src/form/color-swatches.ts` and `.test.ts`.
The palette, labels, order and public types are preserved. The controls entry
exports the catalogue for other product colour pickers. The viewer retains its
existing module until the new UI exports are published. No product palette is changed.

The chart-grid viewer facade was restored to its original implementation in
the follow-up commit to remain compatible with published core versions. Both
viewer adoption steps are tracked in `docs/pptx-shared-migration.md`.

## Chart text defaults added during the renderer migration

Source: `IHAGI-c/ooxml`, commit `d29c143e65f0200dc9894a77c220d804c8cd100d` (PR #13).
The new `chart-text-defaults.ts` and `.test.ts` modules move from
`viewers/pptx/packages/shared/src/render` to `src/ui/src/pptx/render`.
Their core type imports use `ooxml-core/pptx`; chart font behavior is preserved.

## PowerPoint shared renderer and document operations

Extracted the complete `viewers/pptx/packages/shared/src` implementation at
`c666f2ee933be0b0be83a0ef4e3e094c1620fe61` (original repository `ChristopherVR/pptx-viewer`) into
`src/ui/src/pptx`, with DOM-free document operations in `src/core/pptx/editor`.
Tool schemas moved from `viewers/pptx/packages/tools/src/schemas` into
`src/core/pptx/automation/schemas` at the same commit.

[The module inventory](docs/pptx-migration-provenance.json) records each source
and destination. Imports now use the published core/UI entry points, fixture
references follow the moved tests, and shared palette/grid policy is reused.
The private shared package retains compatibility exports. Angular consumes
public UI entries instead of copying the renderer into its published output.

The combo-chart and table-subscript follow-up in PR #15 adds five modules from
`IHAGI-c/ooxml` at `824b9366dae65664316082dcfce4b7aebdfe44f7`:
`chart-bar-cluster-geometry.ts`, `chart-combo-format.test.ts`,
`chart-series-line-style.ts`, `chart-series-line-style.test.ts` and
`table-cell-padding.ts`. Their source directory was
`viewers/pptx/packages/shared/src/render`; they now live in
`src/ui/src/pptx/render`. Type imports use `ooxml-core/pptx`, matching the
renderer migration; their implementations and regression assertions are preserved.

## Word pagination page fields

Source: ChristopherVR/ooxml at `b0343f441fbaa6b211b02a712ad1c81ab983ed29`,
`src/ui/src/docx/print-header-footer.ts`. The DOM-free page-number formatting,
header/footer slot resolution, section-page counting and field-display logic
now live in `src/core/docx/layout/page-fields.ts`. UI code retains compatibility
exports and delegates to the shared core. Numeric page facts replace parsing
formatted labels for odd/even slots. Continuous-section restart offsets and
parity are corrected against twelve native Word PDF/DOCX references. Core
reference tests accompany the extraction; existing UI facade tests remain.

## Word comment editing commands

Source: ChristopherVR/ooxml at `04cce34d7d6ce56deffffb05f124169e207344bb`,
`src/ui/src/docx/comment-commands.ts`. Anchor editing/navigation and comment
reply, resolve and delete operations moved to `src/core/docx/ui/comment-commands.ts`.
Commands use the supplied view's schema, enforce its read-only state for anchor
mutations, and no longer import the UI schema. The UI keeps a compatibility
facade. DOM-free core regressions cover overlapping anchors, read-only edits
and immutable thread operations; browser-model/export and ribbon tests remain
beside the UI code they exercise. Yjs thread synchronization is a separate step.

## Shared Office GUID generation

Extracted `randomBytes`, `randomHex` and `generateChartUniqueId` from
`src/core/pptx/core/utils/chart-series-identity.ts` in `ChristopherVR/ooxml` at
`91a856ae3137b960472d0df713ddb95258c85af7` (original area: `ChristopherVR/pptx-viewer`)
into `src/core/crypto/uuid.ts`. The four generator regression tests moved from
`chart-series-identity.test.ts` to `crypto/uuid.test.ts`. The shared helper compiles
with strict indexed access, retains the Web Crypto and older-runtime fallbacks,
and keeps the PowerPoint API as an alias. XLSX clipboard copies reuse it for new
x14 conditional-rule identities.

## PowerPoint snapshot cloning and neutral cached drawing bounds

Source: ChristopherVR/ooxml at `e536c3553ad87ccc4e35a1d2212ab65bb22e821f`
(original repository: ChristopherVR/pptx-viewer).

- `src/ui/src/pptx/render/clone.ts` and `clone.test.ts` moved to
  `src/core/pptx/editor/render/`. Document/history cloning is unchanged,
  including the JSON-only XML failure behavior. UI keeps explicit compatibility
  exports. The circular-XML regression also moved into the core contract.
- The bounds algorithm in `src/ui/src/pptx/render/smartart-drawing-viewbox.ts`
  moved to strict, format-neutral `src/core/diagram/drawing-bounds.ts`.
  It uses diagram shape/text frames in caller units. UI adapts the PowerPoint
  fields, preserving their individual fallback values. Core regressions cover
  frame unions, independent text, negative coordinates and empty drawings;
  existing renderer tests remain in UI to cover the adapter.

## Word revision recording and resolution

Source: ChristopherVR/ooxml at `2e493931f821785829127c69cd133b9b360db680`,
`src/ui/src/docx/track-changes-mode.ts` and `review-commands.ts`. These modules
moved to `src/core/docx/ui/`; the UI keeps explicit compatibility exports.
Recording and resolution use the caller's schema. Revision IDs reuse the shared
client identity generator, including a persistent collaboration-session generator.
Legacy colliding IDs are separated by author and move linkage. Resolution and
undo/redo bypass recording; resolution checks read-only views and ignores stale
ranges. Explicit commands use a shared boundary helper to isolate them from
nearby typing in both ProseMirror and Yjs history. DOM-free regression tests accompany the
core logic; existing model conversion, move, editor and Yjs tests remain in UI
to cover those adapters. Subsequent native references corrected move names and export text.

## Word paragraph traversal for export identity mapping

Source: ChristopherVR/ooxml at `26c54cd5db2c8ed69547540ed4448c979357cde4`,
`src/core/docx/revision-ids.ts`. Its block traversal, story enumeration and
document-wide paragraph mapping moved to `src/core/docx/document-paragraphs.ts`.
Revision ID export retains its existing behavior through those helpers, and
move-name export reuses them. Regression tests cover the body, table cells,
headers, footers, footnotes and endnotes with one shared identity map.

## Shared chart color palette catalog

Source: ChristopherVR/ooxml at `9daa589d8dddba52c810efead7d7314886b580fb`,
`src/ui/src/pptx/render/ribbon-galleries/chart-color-palette-catalog.ts`
(original product: ChristopherVR/pptx-viewer). The 17 Office Change Colors
palettes and series-count interpolation moved to strict, DOM-free
`src/core/chart/color-palettes.ts`. The PowerPoint path keeps compatibility
exports. Product-specific chart patching and gallery descriptors stay in UI.

The shared catalog uses the existing `diagram/resolveDrawingColor` instead of
the PowerPoint XML-object adapter and duplicate sRGB transfer functions.
A before/after probe confirmed identical output for all 3,332 colors in the
two recorded native Excel fixtures. The new recorder uses its own hidden COM
instance and records all palettes under Office and custom themes with
1, 2, 4, 7, 10, 19 and 55 series. Of 238 cases, 224 match Excel exactly;
38 individual colors in the remaining 14 cases have unresolved one-channel-step
rounding differences. The regression distinguishes the exact 85-case Office
baseline from extended comparisons that permit that measured difference.

## Word run-to-mark mapping

Source: ChristopherVR/ooxml at `94274409912976a358179ee79a16e3c5da9f88dc`,
`src/ui/src/docx/run-marks.ts`. The model-to-ProseMirror mark mapping moved to
`src/core/docx/ui/run-marks.ts`, with the caller's schema replacing the global
UI schema. The UI keeps a compatibility facade. Imported formatting-revision
rejection reuses this mapping to restore formatting without replacing text,
links or comment anchors. Existing model conversion tests and native formatting
references verify both callers.

## Word direct paragraph property parsing

Source: ChristopherVR/ooxml at `30d586d1893090538aa45dfe8bc1f42652638071`,
`src/core/docx/block-parser.ts`. Direct paragraph property parsing moved to
`src/core/docx/paragraph-properties.ts`, preserving its existing behavior and
native units. All stories and paragraph-format rejection use this one parser.
Restoration keeps prior opaque XML as the writer's basis, overlays later known
property edits, and retains text, bookmarks and paragraph mark revisions.
Native rejected documents, both export paths and editor conversion cover the
new caller; existing paragraph, style, decoration and table tests cover parsing.

## Shared affine composition for Visio hatch transforms

Source: ChristopherVR/ooxml at `1bf7486161cb286f15ec0775bae7aa1cad1124d8`,
`src/core/visio/foreign-vector-values.ts`, `compose`. Its six-coefficient
multiplication moved into `src/core/geometry/affine.ts`. Foreign vector composition
retains its existing bounded-value checks; Visio rendering reuses the same
composition through the DOM-free Visio UI contract to accumulate group transforms.
Regression tests cover composition order and rotated child translations.

## Shared ribbon SVG color previews

Source: ChristopherVR/ooxml at `bd436dd9dc392805f84a2c483c67f09e424b2e5d`,
`src/ui/src/pptx/render/ribbon-galleries/gallery-preview-svg.ts` and
`chart-gallery-tiles.ts` (original product: ChristopherVR/pptx-viewer).
The SVG shell, escaping and safe-color helpers moved to
`src/ui/src/ribbon/svg-preview.ts`; the swatch-strip painter moved to
`src/ui/src/ribbon/color-preview.ts`. Their behavior is unchanged and the
PowerPoint paths retain compatibility exports. XLSX reuses these painters and
the existing OfficeUiGallery, with a thin translated command adapter. Chart
palettes and color-style XML remain in core; no PowerPoint engine dependency
was introduced into the XLSX UI. Existing PowerPoint gallery regressions cover
the compatibility paths and XLSX browser tests cover the shared control.

## Visio gradient scene validation extraction (2026-10-07)

Source: ChristopherVR/ooxml, src/core/visio/ui/scene-validation.ts at
e26a6f5e7464f3f37b940e36137e13531be55c7b.
The existing linear/radial gradient validation moved to
src/core/visio/ui/gradient-details.ts. The original finite-number checks and
aggregate metadata accounting are passed in, rather than copied. The helper adds
bounded triangle-region validation and exposes the number of independently
rendered gradients. Scene stop limits, SVG byte estimates and print work budgets
reuse that count so multi-region paints do not bypass the existing limits.

## Shared native chart-style reader and contract

Source: ChristopherVR/ooxml at `c0e42f0b611371ffef7334fa950db5ce9a98cbdd`,
`src/core/pptx/core/types/chart-style-definition.ts` and
`src/core/pptx/core/utils/chart-style-definition-parser.ts` (original product:
ChristopherVR/pptx-viewer). Their resolved contract and per-element parsing
rules moved to strict `src/core/chart/style-definition.ts` and `read-style.ts`.
PowerPoint retains compatibility type names and an XML-object adapter; the
actual reader uses shared XML and DrawingML color, fill and line readers.

The shared model retains theme choices, ordered color transforms, reference
indices, direct fills/lines and original XML, including entries and effects
the painters do not yet interpret. Resolved defaults prefer direct properties
over references, including explicit no-fill overrides. PowerPoint's earlier
reader used only reference line/fill colors. XLSX imports the same style-part
model and preserves its package bytes while editing chart titles. New native
fixtures cover 16 independently created Excel style parts (201 through 216);
COM font sizes establish 15 title defaults and all 16 axis/legend defaults.
Style 204 omits a title size and COM returned a non-positive value, recorded
as unavailable rather than treated as an expected font size.

## Shared native Visio gradient setup (2026-10-07)

Source: ChristopherVR/ooxml, scripts/record-visio-layer-colors.ps1 at
92b92518ac72d67630cc961882a0eb64349f4aa5. The owned native ShapeSheet gradient
setup moved into scripts/visio-native-gradient.ps1. The layer capture retains
its original angle, colors and transparency; the fill capture reuses the same
helper with explicit parameters. Section 249 and stop setup are unchanged.
A fresh native run reproduced all 21 prior layer paint records exactly.

## Shared Word mark-to-run formatting mapping

Source: ChristopherVR/ooxml at `88582ed132cd20ef1620f1b3c59904e8650eb34c`,
`src/ui/src/docx/run-adapter.ts`, `applyMarkFormatting`, `linkFromMarks` and their
private helpers. These DOM-free model conversions moved unchanged to
`src/core/docx/ui/run-mark-properties.ts`, alongside the shared run-to-mark
mapping. The Word UI imports them through the core subpath; schema construction
and inline DOM views stay in UI. Existing editor conversion and review/Yjs tests
cover the caller, and core tests cover an independent caller-provided schema.

## Shared Word paragraph attribute mapping

Source: ChristopherVR/ooxml at `98cb8e365a792352a2123a52d57ad6fc5bdcfb1a`,
`src/ui/src/docx/model-adapter.ts`, the paragraph attributes in `paragraphNode`,
the object construction in `convertParagraph`, and `KEEP_KEYS`. They moved
unchanged into strict, DOM-free `src/core/docx/ui/paragraph-attributes.ts`.
UI keeps schema construction, inline DOM adapters, list labels and its existing
unchanged-paragraph identity check. The shared mapping reuses the existing
branded twip attribute conversion. Native before/tracked/rejected paragraph
references cover both directions without a DOM; existing editor conversion,
review, list and table tests cover the UI caller.

## Shared chart gradient geometry and workbook font stacks

Source: ChristopherVR/ooxml at `3ad172db60523a8a4d49b16e9b75b2f80a351e7f`,
`src/ui/src/pptx/render/chart-gradient-defs.ts`, `chart-svg-def-types.ts`,
and `src/core/pptx/core/types/chart.ts` (original product: pptx-viewer).
Their resolved gradient contract and bounding-box geometry moved to strict
`src/core/chart/gradient-definition.ts`. PowerPoint keeps compatible names and
uses the same builder. Linear vectors and centered circle gradients retain
their behavior; off-box focal points now use the farthest corner radius.
XLSX resolves its imported DrawingML stops and focus rectangle into that contract.

The workbook font-stack helper moved unchanged from
`src/core/xlsx/ui/grid/cell-paint.ts` at the same commit to
`src/core/xlsx/layout/font-family.ts`. Cell painting retains its compatibility
export; chart text uses the same fallback stack instead of falling back to a
serif font when an authored Office font is unavailable. No font binaries were
copied or added. Shared chart style and direct-formatting readers now use one
DrawingML text/fill/line property reader in `chart/read-appearance.ts`.

## Shared native radial fill geometry

Source: ChristopherVR/ooxml at ef81f394cd2f275bcc9db87830db24b0adb2ec8b,
`src/core/visio/legacy-fill-gradient.ts`. Its classic radial centers and radii
moved to `src/core/visio/radial-fill-gradient.ts`, where the matching modern
saved presets share the same geometry. Native Visio 16 captures established
the two additional edge-center presets. No DOM or renderer logic was copied.
The existing shared radial SVG renderer, scene snapshot and validation are reused.

The shared native-gradient setup in `scripts/visio-native-gradient.ps1` now
accepts a direction and is named Set-VisioNativeFillGradient. Both existing
capture callers use it. Saved-gradient preservation tests also share one
parameterized test body across linear and radial captures.

## Shared native rectangular gradient geometry

Source: ChristopherVR/ooxml at 9e8a56c14,
`src/core/visio/legacy-fill-gradient.ts`. Native triangle-gradient presets moved
unchanged to `src/core/visio/region-fill-gradient.ts`. The classic pattern numbers
and modern saved direction numbers map into this one implementation. Both reuse
the shared DrawingML linear endpoint helper and the existing region SVG renderer.
Stop color, position and transparency normalization remain in the saved parser.
Path-following direction 13 remains explicitly unsupported.

## Shared imported chart gradient resolution

Source: ChristopherVR/ooxml at `c14f42d99db1aad93ff522a4436aab29606d52d6`,
`src/core/xlsx/layout/chart-appearance.ts`, the imported gradient stop and focus
rectangle conversion. It moved unchanged into `resolveChartGradient` in
`src/core/chart/gradient-definition.ts`. XLSX chart backgrounds, series and point
fills use that resolver and the existing geometry extracted from PowerPoint.
The DrawingML writer and ordered color-transform mode are new shared core code;
they reuse the existing color conversion helpers rather than a viewer-local
color engine. Existing callers keep their default conversion behavior.

## Shared modal focus traversal

Source: ChristopherVR/ooxml at `0e10bc55a`,
`src/ui/src/pptx/render/modal-focus.ts`. Its DOM-only focusable-element traversal,
selector and deep active-element resolver moved to `src/ui/src/dialog/focus.ts`.
PowerPoint keeps compatible exports and its existing modal lifecycle and Escape
rules. The traversal now excludes hidden ancestor subtrees, so collapsed channel
rows cannot receive focus from OpenTeams' navigation drawer. No Office logic or
product rendering moved into this helper.

## Shared Word formatting snapshot comparison

Source: ChristopherVR/ooxml at `af2b24cfca36df8da11de71d9b6a62f0a76ba0de`,
`src/core/docx/ui/track-run-formatting.ts`, the namespace-aware `signature`
function. It moved unchanged to `propertiesSignature` in
`src/core/docx/revision-properties.ts`. Run and paragraph formatting recorders
share it, the ordinary OOXML writer and the existing mark/paragraph conversions.
The paragraph recorder is new core code; no viewer logic was copied.

## Shared SVG outer-shadow primitive

Source: ChristopherVR/ooxml at `50a928804`,
`src/ui/src/pptx/render/ribbon-galleries/gallery-preview-svg.ts`, the outer
`feDropShadow` primitive in `filterDefs`. It moved unchanged into
`svgDropShadowElement` in strict `src/core/diagram/drawing-shadow.ts`, with the
existing numeric and color formatters supplied by each caller. PowerPoint keeps
its gallery filter composition and bounds; XLSX uses chart-space bounds so flat
lines and short bars do not have degenerate object-bounding-box filter regions.
The native DrawingML reader and themed resolver reuse shared XML, color and unit
helpers. The ordinary-shadow primitive retains the existing radius-to-Gaussian
deviation conversion; projected scale/skew shadows are not approximated by it.

## Shared native Visio geometry probes

Source: ChristopherVR/ooxml at a85cb5c72,
`scripts/verify-visio-rounding.ps1`. Its explicit MoveTo/LineTo geometry writer
moved to `scripts/visio-native-shape.ps1`; the rounding probe calls it with
NoFill enabled. Nine native rounding cases retain their previous output.
Fill probes share a second helper that creates rectangles, ellipses and genuine
native DrawPolyline polygons. Raster evidence uses native polygons because
manually replaced geometry rows produced blank polygon PNG exports in probes.

## Shared bar cluster geometry

Source: ChristopherVR/ooxml at `ab83de0bc`,
`src/ui/src/pptx/render/chart-bar-cluster-geometry.ts`. Its width, step and cluster
span calculation moved unchanged to strict `src/core/chart/bar-cluster-geometry.ts`
with a format-neutral options type. PowerPoint retains its compatibility path
and legacy missing-gap heuristic. Its horizontal bar painter now calls the same
helper instead of repeating the formula. Existing PowerPoint bar/combo callers
and bar rendering regressions cover the extraction; XLSX uses explicit Office
spacing defaults and new native Excel COM measurements.

The XLSX `bars` painter moved from `chart-svg-cartesian.ts` at the same commit
to `chart-svg-bars.ts`, keeping its stacking and paint behavior. It now uses the
shared geometry and the native horizontal series direction; SVG groups identify
series and point indices for review and future UI hit testing. Office models and
calculations remain in core, while the existing PowerPoint UI keeps its painter.

## Native Visio gradient interpolation and physical radial geometry

Source: Windows System.Drawing GDI+ SetSigmaBellShape(1, 1), sampled on
2026-10-07. Its 256 quantized blend factors are stored in
`src/core/visio/native-gradient-curve.ts`; `scripts/record-visio-gradient-raster.ps1`
records the same table in sigma-blend.json. Native Visio 16 PNG captures, rather
than SVG export, established the opaque two-stop curve and physical circular
radial geometry. This is new native evidence, not a copied renderer.

The sampler reuses shared color hex conversion; saved and classic gradients
share the existing radial-center helper. Existing gradient validation, snapshot,
SVG and print budgets now account for expanded paint. Relative source imports
remain extensionless. Saved stop rows remain intact. Translucent, themed and
classic interpolation, arbitrary path fills and exact raster equality remain
unverified; native-SVG comparisons were replaced for saved gradients only.

## PowerPoint DOM renderer for embedded Office surfaces

Source: ChristopherVR/ooxml, commit `65bc42fc7d5214784222e20db655c8cf872f1c39`.
Every module and adjacent test under
`viewers/pptx/packages/vanilla/src/viewer/render/` moved to
`src/ui/src/pptx/dom/`. The binding retains compatibility re-exports through
the new `ooxml-ui/pptx/dom` entry. Format imports now reference `ooxml-core/pptx`;
shared UI imports are relative within their owning package. Rendering behavior
is retained, including element registries, slide stages, charts, tables, text,
media, SmartArt, accessibility and presentation re-rendering.

The same source commit's `viewer/glyph-outline-cache.ts` moved to the DOM renderer,
preserving the singleton used by the vanilla viewer. Its
`viewer/i18n/translator.ts` moved to `src/ui/src/pptx/i18n/translator.ts`,
retaining dictionary fallback and interpolation. The relocated rendering tests
select happy-dom explicitly; UI tests resolve core source subpaths without
depending on stale package builds. This extraction makes the actual DOM renderer
available to OpenTeams; it does not establish embedded playback or Teams parity.

## Shared XLSX effective chart spacing

Source: ChristopherVR/ooxml at `42b7d63d9`,
`src/core/xlsx/layout/chart-svg-bars.ts`, the default gap and overlap expressions.
They moved unchanged to `chartBarSpacing` in `layout/chart-spacing.ts`. The SVG
painter and the docked series pane use the same values, so the UI does not keep
a second grouping/default calculation. Imported spacing still comes from the
native OOXML parser; all edits and history use the existing core chart commands.

## Shared native range control

Source: ChristopherVR/ooxml at `19ef348e7`,
`src/ui/src/form/zoom-slider.ts` and `zoom-slider.css`, the native range input
template, focus ring, disabled appearance and accent color. They moved to
`form/range-control.ts` and `range-control.css`, preserving zoom's input/change
callbacks and existing shadow-DOM input. The chart series pane uses the same
Lit template and stylesheet for its percentage sliders. The range helper adds
an optional step and suppresses synthetic disabled callbacks. Chart spacing
values, validation, saving and history remain in core.

## XLSX chart series fill controls

Source: ChristopherVR/ooxml at `6d3140bdc`, the legacy RGB/theme conversion in
`src/core/xlsx/write/chart-colors.ts`. It moved into `chartDrawingColor` in
`xlsx/edit/chart-series-fill.ts`, adding DrawingML luminance transforms for
SpreadsheetML tints. The writer and edit helper now use one conversion.
The pane reuses the existing `src/ui/src/xlsx/ribbon/color-grid.ts` without
copying its theme, tint, swatch, keyboard or popover logic. Native series fill
replacement was measured using `scripts/record-xlsx-chart-series-fill.ps1`;
its saved/reopened Excel 16.0 build 20430 measurements are in
`xlsx/__fixtures__/excel-chart-series-fill.json`.

## PowerPoint asset loader for embedded reading views

Source: ChristopherVR/ooxml at `2e3219cff`,
`viewers/pptx/packages/vanilla/src/viewer/load/load-presentation.ts`.
The load pipeline moved to `src/ui/src/pptx/dom/load-presentation.ts` and is
exported through `ooxml-ui/pptx/dom`; the binding retains a compatibility facade.
Its parse/media tests moved to the same UI directory, while binding source-buffer
adapter tests stay with `load/source.ts`. Asset resolution and metadata are
retained. The shared load options additionally forward the core's existing
archive expansion limit for embedded consumers. No Office parser or asset
resolution algorithm is copied into Teams.

## Shared DrawingML CSS paint conversion

Source: ChristopherVR/ooxml at `94c1f0f82`,
`src/core/xlsx/layout/chart-appearance.ts`, the resolved hex/alpha-to-CSS conversion.
It moved unchanged to `diagram/drawing-color-css.ts` and is used by chart
appearance and series/point paint resolution. Ordered alpha transforms still
come from the shared DrawingML color resolver, not a viewer-specific codec.
Solid chart transparency was measured with Excel COM using
`scripts/record-xlsx-chart-transparency.ps1`; its independently saved/reopened
0%, 37% and 100% chart XML and color-change measurements are in
`xlsx/__fixtures__/excel-chart-transparency.json`. The pane reuses the existing
native range template and number fields. Gradient-to-solid conversion and
transparency edits live in core, preserving DrawingML color choices.

## Visio native path-fill reuse

Source: ChristopherVR/ooxml at `562e07e8b`, `src/core/geometry/svg-path-flatten.ts`,
`shape-boolean-types.ts`, `shape-boolean-clipping.ts`, `shape-boolean-union.ts`,
`src/core/visio/geometry.ts` and `src/ui/src/visio/render-fill.ts`.
No modules were moved or copied. The new core `path-fill-gradient.ts` consumes
already evaluated paths and reuses shared flattening, winding, intersection and
line projection helpers. Direction 13 uses the existing region paint with
optional normalized shape coordinates, or the existing radial paint for a
canonical ellipse. Shared gradient stop/color/opacity serialization remains in
one renderer. Snapshot copying, validation and generated-stop accounting retain
the new coordinate space. Native PNG comparisons cover four captured outlines;
other topology, exact pixels and native reopen parity remain unverified.

## Settings theme preview template

- Source: `ChristopherVR/ooxml`, `src/ui/src/teams/app/teams-settings.ts`,
  commit `eff167219`.
- Destination: `src/ui/src/teams/app/settings-theme.ts`.
- Changes: extracted the existing theme-button template into a private UI helper
  and added decorative workspace previews. Theme events and persisted values
  retain their existing contract. Preview styling resides in
  `src/ui/src/teams/app/settings-previews.css`; no core logic moved.

## Shared native Visio outline capture

Source: ChristopherVR/ooxml at `e0b7ee995`, `scripts/visio-native-shape.ps1`,
triangle and notched DrawPolyline coordinates. The unchanged existing points
moved to `Get-VisioNativeFillPoints`; native drawing and raster capture metadata
consume the same helper. New pentagon, chevron, U-shape and star probes extend
the independent native corpus. No production geometry or paint algorithm was
copied. Native settings/owned-process cleanup remain in the existing recorder.

## Word inline run conversion and revision preservation

Source: ChristopherVR/ooxml at `8d4c40cc4`,
`src/ui/src/docx/run-adapter.ts`. The conversion moved to
`src/core/docx/ui/run-adapter.ts`, taking a caller-supplied schema. The UI keeps
only its schema-bound wrapper. Core now retains picture and page/column-break
run properties, including text/format revisions and opaque property bases.
A single-run conversion also lets editable review displays reuse the same
revision visibility policy as layout, including atom properties stored outside
text marks. DOM image resolution and equation rendering stay in UI.

## Shared gradient stop editing

Source: ChristopherVR/ooxml at `60f5c51fc`,
`src/ui/src/pptx/render/gradient-picker.ts`, the stop sorting, updating and
two-stop minimum removal helpers. They moved to `src/core/chart/gradient-stop-edit.ts`.
PowerPoint's existing shared picker delegates to them, keeping its normalized
state contract for all five bindings. XLSX uses the removal minimum and both
chart painters use stable visual sorting. XLSX keeps the native insertion-order
identities in the model and source XML, measured by
`scripts/record-xlsx-chart-gradient-edits.ps1` and its saved/reopened Excel
16.0 build 20430 fixture `xlsx/__fixtures__/excel-chart-gradient-edits.json`.
The new DOM stop strip is format-neutral; the XLSX pane pairs it with existing
number fields and the themed color picker. All gradient model edits and source
preservation remain in core.

## Shared Office color brightness

Source: ChristopherVR/ooxml at `a932dbd72`, the luminance conversion in
`src/core/xlsx/edit/chart-series-fill.ts`. It moved to
`src/core/diagram/drawing-color-brightness.ts`, retaining the theme-tint mapping
and adding native brightness replacement and canonical-value reading. Both
SpreadsheetML tints and gradient editing consume the same helper. The existing
DrawingML resolver paints the result; no color engine was copied into the UI.
`scripts/record-xlsx-chart-gradient-edits.ps1` now records Excel 16.0 build 20430
brightness extremes, reset, opacity preservation and explicit COM RGB replacement
in the independently saved/reopened native gradient fixture.

## Shared Office gradient direction gallery

Source: ChristopherVR/ooxml at `a932dbd72`, `src/ui/src/ribbon/gallery.ts` and
`src/core/chart/gradient-definition.ts`. No gallery or paint engine was copied.
The new format-neutral DOM adapter `src/ui/src/form/gradient-direction-gallery.ts`
uses the shared Office gallery for popup positioning, focus, keyboard selection
and sanitization, and the shared chart painter for independently namespaced
previews. XLSX routes its picks through the existing core gradient angle edits.
The Excel COM recorder now captures the eight linear angles and their native
PNG references without changing stop identities or inventing native presets.

## Shared gradient stop dragging

Source: ChristopherVR/ooxml at `2fff3122b`,
`src/ui/src/form/gradient-stop-track.ts`, `src/core/chart/gradient-definition.ts`
and the existing commit-on-release drawing interaction in
`src/ui/src/xlsx/grid/drawings.ts`. The shared strip gained pointer capture,
temporary previews and cancellation; no editing or gradient algorithm moved
into UI. The XLSX SVG preview adapter consumes the shared chart painter and
updates only temporary rendered stops, including frozen-pane copies. Release
uses the existing core position command for one history step. Excel COM captures
now cover a stop crossing its neighbor and the 0%/100% endpoints; they remain
independent native files in the gradient recorder's fixture.

## Shared number and range pairing

Source: ChristopherVR/ooxml at `03fe589bf`,
`src/ui/src/xlsx/chart-series-transparency.ts`. Its number/range synchronization
moved into `src/ui/src/form/number-range.ts`, reusing the existing shared native
`rangeControl` rather than adding a second slider component. Solid transparency
and gradient position, brightness and transparency use the same pairing,
commit-on-change and cancellation behavior. The new XLSX range-preview adapter
computes prospective fills through core's gradient edit and chart-view functions;
it changes temporary SVG stops and strip paint without duplicating color logic
or mutating the workbook before commit.

## Shared native Office sigma gradient paint

Source: ChristopherVR/ooxml at `dba018245`,
`src/core/visio/native-gradient-curve.ts` and
`src/core/visio/native-gradient-stops.ts`. The measured GDI+ factor table moved
to `src/core/color/native-gradient-curve.ts`; the gamma-2.2 sampling algorithm
moved to `src/core/color/sigma-gradient-stops.ts`. Visio delegates to the shared
helper and retains its eligibility checks and generated-stop count. XLSX's
shared chart painter now consumes the same helper for resolved, opaque, scaled
linear gradients with two endpoint stops. The editable model keeps its original
stops. DrawingML's scaled flag is now modelled and serialized, enabling the
native bounding-box vector projection without reparsing source XML in the UI.

The independent recorder `scripts/record-xlsx-chart-gradient-raster.ps1`
saved/reopened Excel 16.0 build 20430 charts at ten angles in square and wide
bounds. Its saved fill XML and 500 background pixels are committed in the chart
fixture. Core sampling and all six browser SVG painters match within two RGB
levels. Existing direction captures now activate/refresh the native chart and
reject empty or failed PNG exports.

## Extended native Excel gradient evidence

Source: ChristopherVR/ooxml at `8bd117180`,
`scripts/record-xlsx-chart-gradient-raster.ps1` and the core/browser raster
comparators. No production paint algorithm was copied or changed. The recorder
now accepts six additional profile variants and retains native PNG alpha.
Excel 16.0 build 20430 produced 120 independent saved/reopened chart captures
for transparent, interior, three-stop, crossed and coincident profiles, at ten
angles and two aspect ratios. Their source fills and 3,000 pixels live in
`src/core/chart/__fixtures__/native-gradient-linear-profiles.json`.

Comparators now handle endpoint padding and hard-step pairs and compare alpha
separately from premultiplied color. The native translucent three-stop color
residual and one coincident-edge coverage discrepancy remain explicit expected
failures. The passing sweep and native round-trip checks are separate from
these known gaps, so a green test run does not claim full gradient parity.

## Shared Word formatting toggles

Source: ChristopherVR/ooxml at `73691b88ba16cf53b10aaaf68696ecb1c95980e8`,
`src/ui/src/docx/toggle-commands.ts`. The style-aware Bold, Italic, Underline and
Strikethrough command logic moved to `src/core/docx/ui/toggle-format.ts`.
The factory accepts the caller's schema and document-style lookup; the UI now
only wires them in. The extraction extends selection handling to supported
inline objects and retains explicit-off overrides for imported atom properties.
Native run-formatting recording and restoration reuse the shared run adapter
and writer rather than adding an atom-specific property codec. UI integration
tests remain with the component; native command regressions live in core.

## Shared native Office gradient presets

Source: Excel 16.0 build 20430, `FillFormat.PresetGradient(1, 1, id)` for
all 24 `MsoPresetGradientType` values. The independent COM recorder
`scripts/record-xlsx-gradient-presets.ps1` saves and reopens each workbook.
Saved chart XML and COM getters are retained in
`src/core/xlsx/__fixtures__/excel-gradient-presets.json`. The shared diagram
catalog preserves the saved positions and absolute sRGB colors, with the
native 90-degree scaled linear geometry. No theme-dependent preset palette
or other style/variant is inferred from these captures.

Source extraction: ChristopherVR/ooxml at `ccc4cebc6`,
`src/ui/src/form/gradient-direction-gallery.ts`. Its SVG thumbnail code moved
to `gradient-gallery-preview.ts`, used by both direction and preset galleries.
The new preset UI consumes the existing shared Office gallery and shared
core gradient painter; editing and serialization remain in the core XLSX area.

## Shared Word hard-break schema and collaboration history

Source: ChristopherVR/ooxml at `5de353df2`, `src/ui/src/docx/schema.ts`.
The hard-break NodeSpec moved to `src/core/docx/ui/break-note-schema.ts` and
gained serialized run-property attributes and DOM metadata. The insertion
command moved from `src/ui/src/docx/hard-break-command.ts`
to `src/core/docx/ui/hard-break-command.ts`, with schema injection through state.
Run conversion, formatting recording, review resolution and text revision recording reuse the
existing core run adapter. Older consumer schemas without these attributes
retain mark-based behavior. Yjs peers now retain line-break properties and
history instead of losing element marks. The native recorder generated the
four line-break references in `review-line-break-formatting` with owned hidden
Word 16.0 build 20430; the companion export reports record reopening and native
Reject All. This installed perpetual build does not certify current M365 parity.

## Shared rectangular DrawingML gradient paint

Source: ChristopherVR/ooxml at `47ec69208`,
`src/ui/src/pptx/render/path-gradient-rect.ts` and its adjacent test. Both moved
to `src/core/diagram/rect-path-gradient.ts` and its test under strict flags.
The original UI entry is a thin re-export; existing PowerPoint callers retain
their 40-band defaults. Color conversion reuses core's color primitives.
An optional independent opacity mask avoids compositing translucent bands
on top of each other. XLSX chart paint uses 1,024 bands and the shared native
sigma curve only for measured opaque endpoint pairs.

Excel 16.0 build 20430 independently saved/reopened and exported 24 native
center/corner captures, opaque and translucent, in square and wide bounds.
Their DrawingML and 600 native RGBA points are retained in
`src/core/chart/__fixtures__/native-gradient-path-profiles.json`.
`scripts/record-xlsx-chart-gradient-raster.ps1` reproduces those profiles.
No generic rectangular paint engine or color engine was copied into XLSX UI.
Chart SVG and gallery serialization now share `chart/gradient-markup.ts`.

## Shared Word direct run-format commands

Source: ChristopherVR/ooxml at `a4dfbc400`,
`src/ui/src/docx/ribbon-commands.ts`, `font-format.ts` and `inline-commands.ts`.
Direct font, extra-property and mark mutation moved into the schema-driven
`src/core/docx/ui/run-format-command.ts`. UI controls translate their values
into typed patches, using existing core unit conversions. The shared command
handles text and supported inline objects, storing element properties in their
canonical attributes and retaining comments, links, field identities and text
revisions when clearing direct formatting. The Font dialog now reads inline
objects and reuses this command for atomic edits. The existing core recorder
and writer provide full prior-property snapshots; no second property codec was
introduced. The native advanced references and reopen/rejection reports in
`review-advanced-object-formatting` came from owned hidden Word 16.0 build 20430.
They cover seven advanced properties on five inline kinds, not current M365
certification or general shape/OMML formatting.

## Shared native rectangular gradient geometry controls

Source: ChristopherVR/ooxml at `af81015bc`, the saved Excel center/corner
geometry in `src/core/chart/__fixtures__/native-gradient-path-profiles.json`
and the existing `src/ui/src/form/gradient-direction-gallery.ts`.
The new diagram geometry helper derives target and tile insets from those
captures and keeps stop identities, colors and imported root flags/extensions.
The shared DrawingML reader/writer now models tile insets, so geometry edits
do not rewrite source XML in UI. No gradient or gallery engine was copied.
The existing gallery now renders rectangular directions through the same
core chart painter. XLSX uses that shared helper for one-step type/direction
commands and keeps the selected stop through those changes.

## Native circular and rectangular-shape chart paints

Source: ChristopherVR/ooxml at `e10c21a08`, the existing shared chart gradient
definition/serialization and the rectangular path painter extracted from
PowerPoint. Their extensions accept physical paint bounds; no new color or
path engine was copied into XLSX. Chart backgrounds and laid-out plot
rectangles supply their own bounds. Legacy radial descriptors retain their
previous geometry when no explicit circle path is provided.

Excel 16.0 build 20430 independently rendered 48 circle/shape center/corner
profiles in square and wide bounds, both opaque and translucent. COM first
creates the legacy rectangular fill; the recorder patches its OOXML path to
circle or shape, then imports and resaves it in Excel before capturing native
PNG samples and the resaved DrawingML. This is native import/render evidence,
not evidence for a COM command that authors modern circle/shape types directly.
The 1,200 RGBA points are in
`src/core/chart/__fixtures__/native-gradient-circle-shape-profiles.json`.
Shape captures use chart-area rectangles; arbitrary outlines and series mark
bounds are outside this extraction's verified scope.

## Independent Word inline property mapping

Source: ChristopherVR/ooxml at `469c0d4b8`, the shared Word inline schemas,
run adapter and formatting/history commands in `src/core/docx/ui`.
`inline-run-properties.ts` adds independent direct-property overrides over the
existing imported JSON basis. It reuses `DIRECT_RUN_PROPERTY_KEYS` and the
ordinary run adapter/writer; source properties and metadata retain their
existing representation. No Yjs or y-prosemirror implementation was forked.
Eight disconnected-peer regressions retain independent edits and removals and
isolate author undo. DOM regressions serialize effective properties, including
note and field metadata; the note node rule now precedes generic superscript.
The current schema uses v2 rooms, with explicit rejection of incompatible
schemas and legacy v1 support through matching legacy schemas. Existing native
advanced references still match thirty reopened export and native Reject All
checks. Concurrent review authorship and provider persistence migration remain
unfinished.

## Shared Word hyperlink commands and inline link preservation

Source: ChristopherVR/ooxml at `988a72111`,
`src/ui/src/docx/link-commands.ts` and the shared core run adapter.
Selection range discovery, hyperlink insertion, retargeting and removal moved
into schema-injected `src/core/docx/ui/link-commands.ts`. The UI retains dialog
wiring, bookmark scrolling and browser navigation. Supported inline elements
store targets with their canonical run metadata, retaining imported picture
links across Yjs instead of relying on element marks. Existing schema rules,
run conversion and OOXML writers remain the only property/link codecs.
Four peer regressions cover imported links, retargeting, clipboard conversion,
removal and author undo; a mounted editor verifies dialog and media export.
Six browser bindings verify peer picture-link export and undo/redo alongside
the existing step and Yjs collaboration scenarios. Equation hyperlink editing,
hyperlink revision attribution and complete M365 parity are not established.

## Shared native circle/shape series geometry and controls

Source: ChristopherVR/ooxml at `e2bddbfda`, the shared chart gradient bounds,
diagram geometry helper and Office gradient direction/preset/stop controls.
The geometry helper now supports circle/shape paths without changing stops or
imported flags. XLSX rectangular series marks use their final rounded paint
bounds and unique targets, including point overrides. Preview gestures update
all inherited series targets while preserving each mark's geometry. Gallery
previews use the shared square-outline painter; no series gradient engine or
gallery was copied into the viewer.

The extended recorder imports and resaves explicit circle/shape OOXML through
Excel 16.0 build 20430 on column and bar series. Its 96 profiles contain 2,400
native RGBA samples. It exports a second solid-red version of the same mark
to measure bounds independently of white gradient plateaus and gray gridlines.
The native references are in
`src/core/chart/__fixtures__/native-gradient-series-path-profiles.json`.
Browser comparisons match the native physical mark aspect to isolate fill
fidelity from unresolved chart layout differences. Two small native sampling
discrepancies remain explicit strict expected-failure repros. Type authoring
is enabled for bar/column rectangles; arbitrary shapes and other series
geometries remain outside this implementation's verified scope.

## Shared chart axis visibility serialization

Source: ChristopherVR/ooxml at `2d3652ad1`,
`src/core/chart/read-formatting.ts` and the XLSX chart writers. Axis node
selection moved into `src/core/chart/formatting-nodes.ts`, shared by the
reader and new `write-axis-formatting.ts`. New and regenerated XLSX parts use
this writer; kept parts patch explicit flags without rebuilding imported axes.
Effective visibility is compared before mutation to preserve untouched hidden
axes and high/low label positions. No viewer-side formatting codec was added.

Regression coverage includes repeated workbook saves for six chart types,
kept-part preservation and regeneration for type, grouping and series-count
changes. Excel 16.0 build 20430 reopened/resaved twelve generated exports and
retained their visibility flags. Six framework browser checks cover visible
labels, hidden labels and hidden axes. Playwright MCP inspected and downloaded
a hidden-axis chart; Excel COM resaved that download with zero visible axes
and the original delete/label flags. Other direct formatting metadata edits
and complete native chart layout remain unsupported or unverified.

## Shared Visio shape creation and ID allocation

Source: ChristopherVR/ooxml at `c699b549a`,
`src/core/visio/edit-geometry.ts`. Rectangle construction moved into
`src/core/visio/edit-shape-create.ts`, preserving its cells, geometry and text.
Rectangle and straight-line creation now share shape-container insertion and
descendant ID collision admission. New line construction follows native
DrawLine geometry and DocumentSettings defaults, reusing the existing formula
recalculation and editing admission.

Source: ChristopherVR/ooxml at `c699b549a`,
`src/ui/src/visio/viewer-draw-tool.ts`. Its DOM-free shape ID allocation moved
into `src/core/visio/ui/shape-id.ts`. The shared allocator includes ten-digit
unsigned IDs and reports exhaustion. The UI retains a compatibility re-export
and uses one pointer lifecycle, coordinate conversion, creation transaction
and selection flow for rectangles and lines.

## Independent Word inline comment ranges

Source: ChristopherVR/ooxml at `7ecbe15f2`, shared Word comment commands,
run conversion, review schema and Yjs binding; `src/ui/src/docx/editor-core.ts`.
Added `src/core/docx/ui/yjs-inline-comment-anchors.ts` using the existing Yjs
relative-position mapping, one independent map key per comment, and a view-only
mark projection. No Yjs binding code is copied or forked. Bootstrap helpers moved
from `yjs-collaboration.ts` into `yjs-bootstrap.ts`, including normalization of
legacy element marks. New `yjs-node-selection.ts` guards restoration of remotely
deleted selected nodes through the binding's existing selection state.
The UI model update now accounts for appended transactions. Core, mounted-view
and six-binding browser regressions cover concurrent anchors and local history.
The native reference records fifteen reopened synthetic exports, including the
unresolved zero-width overlapping field scope. V3 rooms require matching clients;
v1/v2 persistence migration, complete field scopes and M365 parity are unfinished.

## Shared DrawingML fill replacement and chart-element export

Source: ChristopherVR/ooxml at `da056bb9e`,
`src/core/xlsx/write/chart-colors.ts` and `src/core/diagram/write-fill.ts`.
The series writer's fill replacement moved to `setDrawingFillXml` in the
shared diagram area. It validates fragments and inserts fills before outline,
effect, 3D and extension nodes. The series writer now reuses this helper and
the shared fill-node reader; no parallel fill codec was added.

`src/core/chart/write-fill-formatting.ts` uses the shared formatting node map,
fill reader and serializer for direct element fills. New/regenerated XLSX
parts and kept chart patches retain supported fill metadata. Kept patches also
apply fills after inserting legends or replacing referenced titles. Untouched
imports retain their source XML; unsupported pattern/picture fill edits are
not implemented. Fonts, outlines and effects on regenerated parts still need
separate preservation work. Title/legend background painting and formatting
pane authoring remain outside this change's verified scope.

Excel 16.0 build 20430 reopened/resaved six exports, covering none, solid,
linear, rectangle, circle and shape fills on chart area, plot area, title and
legend. Six browser bindings verify background painting and UI export for all
six variants. Playwright MCP reviewed a circular chart/plot background and
downloaded it. Excel COM resaved the download with circle paths, center focus,
two endpoint stops and red/white RGB intact on all four elements. Native chart
layout and complete Excel parity are not established by these checks.

## Shared Word field comment selection

Source: ChristopherVR/ooxml at `4397b4bf5`, shared comment commands, field guard
and inline Yjs range mapping. Added `src/core/docx/ui/comment-selection.ts` to
expand comments to balanced complex-field boundaries, reused by ordinary text
commands and Yjs element capture. The existing writer remains unchanged.
`scripts/record-word-field-comments.ps1` records synthetic native authoring on
field markers, partial cached results and whole fields. Three committed native
fixtures and scopes verify parsing and neighboring-edit preservation; fifteen
rebuilt exports verify field scopes and isolated author restoration.
Projection observers now use the existing Yjs binding mutex to avoid writing
older text state back during remote map notifications. No binding implementation
was copied. Nested/simple-field behavior and M365 subscription builds remain
unverified.

## Shared Visio drawing style defaults

Source: ChristopherVR/ooxml at `6cc370875`,
`src/core/visio/edit-shape-create.ts` and `edit-scope.ts`. The line-only
DocumentSettings style-reference helper is now shared by rectangle and line
creation and their detached package admission. This fixes rectangle creation
falling back to white fill/black line instead of distinct document drawing
style IDs. Native line-local QuickStyle matrices and rectangle-inherited
matrices retain their existing per-type behavior. No style codec moved into UI.

The native SVG endpoint helper in `e2e/visio/native-line-svg.ts` now reads
primitive rectangle geometry and computed fill/stroke opacity as well, so
the default-style browser comparison shares native SVG registration. Native
standard/custom captures and all six browser bindings verify creation, paint,
history and saved reload. Shape-dependent inherited style formulas still
pass through the existing dependency guard and can be refused.

## Shared Word ordinary comment history

Source: ChristopherVR/ooxml at `065cb5c1c`, core comment commands and
`src/ui/src/docx/review-controller.ts`. Added schema-injected
`src/core/docx/ui/comment-history.ts` for local thread snapshots and undoable
updates. Creation/deletion now combine anchors and records in one transaction;
the UI retains pane wiring and consumes shared commands. The shared schema/model
adapter records local snapshots, and editor transactions refresh the pane when
that snapshot changes. The Yjs binding excludes the local snapshot and retains
its independent record maps. Core, mounted pane and six browser cases verify
history and exports; a Yjs detach/stop/remount regression verifies continued
ordinary thread history. Complete modern M365 comments are not established.

## Shared Word Yjs document attribute projection

Source: ChristopherVR/ooxml at `c736fabf6`,
`src/core/docx/ui/yjs-collaboration.ts`. Root document attribute mapping moved
into `src/core/docx/ui/yjs-document-attributes.ts`. Map notifications now dispatch
view projections under the existing binding mutex, preventing stale body writes
when the same provider transaction changes settings and text. Local metadata
exclusion, permission checks, history flags and teardown remain shared.
Four core regressions cover notification ordering and editing/read-only peers;
two mounted cases verify immediate models and DOCX exports. No sync-engine code
or UI logic was copied into the mapping.

## Shared chart fill controls for chart and plot backgrounds

Source: ChristopherVR/ooxml at `c3b3491a1`,
`src/core/xlsx/edit/chart-series-gradient.ts` and the existing series fill,
transparency, gradient and preview UI modules. Gradient mutation is now one
core function used by series and element targets. `chart-element-fill.ts`
provides narrow background patches and immutable preview models; the edit
session applies these without exposing unsupported formatting edits or
storing command-only fields in chart models. Existing point overrides and
unrelated formatting remain intact.

`src/ui/src/xlsx/chart-fill-binding.ts` binds those core edits to the existing
controls. The new chart-area pane reuses themed color selection, presets,
directions, gradient stops, paired ranges, preview cancellation and command
admission. It can select chart or plot area. Painted backgrounds retain hit
identity through pointer capture for double-click formatting, and opening a
background/series pane closes the other. Transparent plot hit regions,
additional format targets, outlines, effects and native pane-layout
certification remain unfinished.

The Playwright MCP visual review exposed stale resolved radial focus in
shared direction thumbnails. `withChartGradientDirection` updates both focus
representations; gallery regressions verify five distinct center/corner
previews even with imported focal points. Browser checks cover both targets,
all four geometries, five path directions, presets, color/transparency,
stop insertion/removal, undo, read-only guards and noncommitting isolated
previews. Excel 16.0 build 20430 reopened/resaved the UI-authored workbook via
the editor save API: seven-stop circle chart area (bottom-right, first-stop
37 percent transparency) and two-stop shape plot area (top-left) preserve
paths, stops, RGB, alpha and rectangle geometry exactly. Native pane layout,
chart layout and full M365 parity are not claimed.

## Shared Word field result ranges and simple-field comment scopes

Source: ChristopherVR/ooxml at `62d3fbd3a`, `src/ui/src/docx/field-update.ts`.
The DOM-free field result scanner moved to `src/core/docx/ui/field-results.ts`.
It uses the supplied document's schema; field updates and comment selection share
it. Whole simple-field comment edges now enclose `w:fldSimple` in the writer.
Synthetic source and a native result-comment recording live in field-comments;
Word 16.0.20430 expands a selected result character to scope 6:29, including the
field code. Adjacent identical simple fields still lack distinct model identity.

Simple-field parsing now reuses `collectParagraphRuns` for comment ranges and
revision wrappers, preserving inner ids when the outer collector adds its active
comments. The partial-scope regression covers that shared collector path.

## Shared Visio ellipse creation and resize

Source: ChristopherVR/ooxml at `13d6830d0`,
`src/core/visio/edit-geometry-admission.ts`. Local numeric cache reading,
cell lookup and writing moved unchanged into `edit-geometry-cells.ts`, with
compatibility re-exports. Admission and the new native ellipse construction/
resize proof use this module without a circular dependency. Integration
regressions remain beside the editing commands they exercise.

Source: ChristopherVR/ooxml at `13d6830d0`,
`src/core/visio/edit-shape-create.ts`. The rectangle's transform/default-style
construction is now shared by rectangle and ellipse creation. Native DrawOval
control-axis factors are shared between ellipse creation and resize proof;
existing dependency analysis and formula recalculation perform the updates.
No second formula engine, XML model or style resolver was added.

The UI extends its existing ShapeDrawTool, coordinate conversion, ID allocation
and command transaction to ellipse previews/creation. CanvasTool is shared
by ribbon actions, router and gesture state. The native rectangle browser
workflow moved to `e2e/visio/native-shape-create.spec.ts` and parameterizes both
shape kinds and default-style captures. Native SVG registration also measures
primitive extents. Canonical-axis coverage does not establish arbitrary ellipse
resize, snapping, exact pixels or native reopen parity.

## Shared Visio off-paper box drawing

Source: ChristopherVR/ooxml at `6c4d00839`,
`src/ui/src/visio/viewer-draw-tool.ts`. Rectangle and ellipse gestures now use
the existing line tool's unbounded page-point conversion at start, preview and
release. No new coordinate converter, gesture lifecycle or snapping code was
added. Fresh native scale captures exposed zero-size collapsed box drags at the
paper edge; the shared browser workflow now compares scaled box creation and
ellipse resize/move through history and saved reload. Geometry controls retain
their documented drawing-inch contract. Native off-paper visibility, native
pointer snapping and Office reopen acceptance remain unverified.

## Shared Word imported simple-field identity

Source: ChristopherVR/ooxml at `30500efc7`, simple-field parser, writer and
shared run adapter. Imported field result runs now carry a per-paragraph
`fieldInstanceId` in the existing opaque run-properties metadata, retaining
separate adjacent fields with identical instructions. The core result scanner
and writer compare it; clearing direct formatting preserves it. Two-peer
comment/export and field-update/history regressions exercise the same mapping.
Synthetic adjacent-source and native adjacent-result fixtures record Word's
first-field-only scope (6:29). Copies/pasted field identity and newly authored
fields without identities still require separate handling.

## Shared chart fill controls for titles and legends

Source: ChristopherVR/ooxml at `9237f7f2e`, the chart element-fill edits,
background pane and SVG rectangle painter. `CHART_FILL_PARTS` extends the
existing narrow patch, pane binding and preview path with title and legend
targets; no fill editor or codec was copied. The shared rectangle painter
uses each decoration's current layout bounds for its gradient definition,
paints before text and retains the same hit identity for double-clicks.
Absent titles and hidden legends are disabled in the selector, and removing
the selected element falls back to chart area. Borders/effects authoring and
transparent hit regions remain open.

`scripts/record-xlsx-chart-decoration-fill.ps1` creates and reopens a native
workbook for five legend positions, exports PNGs and records geometry, fonts
and fills. Measurements from Excel 16.0 build 20430 are retained in
`src/core/xlsx/layout/__fixtures__/excel-decoration-fills.json`. Native title
font inheritance and text box geometry differ from the current approximate
layout: the reference title is 18 points, while the fallback at this revision
was 14 pixels. Built-in defaults are corrected in the later chart entry; native
chart placement and raster parity remain unverified.

Eighteen browser checks cover four fill targets and existing series controls
across six bindings; core regressions cover five legend positions, gradient
bounds, paint order and save/undo. Playwright MCP reviewed the native import
and edited title/legend through the reused pane. Excel reopened/resaved its
editor-API export: bottom-right circle title with 37 percent first-stop alpha
and top-left shape legend retain paths, stops, scheme/RGB colors, alpha and
target/tile rectangles exactly. Full native UI parity remains unfinished.

## Shared Visio local shape rotation

Source: ChristopherVR/ooxml at `0048416f0`, `src/core/visio/edit-geometry.ts`,
`edit-geometry-admission.ts`, `edit-commands.ts` and UI command snapshots.
Rotation extends the existing local geometry transaction and scalar protection
resolver with Angle and LockRotate. The current cell writer and dependency
recalculator update caches; no second transform, formula engine or package
mutation path was added. Explicit radians normalize existing degree caches.
Fixed pin/dimensions are verified after recalculation, and source-byte no-ops
and unsupported geometry/protection cases are covered beside the implementation.

`src/ui/src/visio/viewer-geometry-controls.ts` composes a typed angle input and
button into the existing panel, sharing its worker transaction and draft
lifecycle across all six bindings. Native recorder rotation extends the shared
rectangle/ellipse evidence collection; browser tests reuse native SVG physical
registration. Pointer rotation handles and native Office reopen remain open.

## Shared Word field clipboard projection

Source: ChristopherVR/ooxml at `9303f68aa`, the core field guard and existing
ProseMirror clipboard hooks. New `src/core/docx/ui/field-clipboard.ts` removes
result-only field metadata while retaining ordinary formatting, slice openness
and complete complex-field representations. Copied source nodes are unchanged.
Both copy and paste use the same projection; the UI has no duplicate codec.
Native formatted-range transfer fixtures record whole-field, result-only and
partial-result behavior. This is owned desktop Word COM range evidence, not
certification of all Microsoft 365 clipboard formats or cross-app clipboard UI.

The UI model-adapter export driver consumes the core clipboard hooks; an owned
native comparison verifies all three saved exports against the recorded field
counts, text and copied bold. No clipboard, parser or provider engine is forked.

## Shared Word cached-result input

Source: ChristopherVR/ooxml at `797db1ba8`, core field guard, result scanner,
clipboard projection and existing UI model adapter. The private core
`simple-field-input.ts` retains target instructions and imported boundary
identities for typed replacements and inline text paste, while preserving pasted
formatting. It extends existing input hooks; no viewer codec or Yjs projection
was copied. Empty results and structural/non-text paste remain outside coverage.

The test fixture builder moved from `e2e/docx/fields.spec.ts` at that commit to
`field-fixtures.ts` for reuse by the field input browser matrix, without changing
fixture contents. Owned hidden Word COM scripts record four replacement fixtures
and compare eight editor-hook/model-adapter exports on reopen. Their field codes,
results, body text and bold match Word 16.0.20430. These are bounded native range
and export checks, not current Microsoft 365 subscription certification.

## Shared rotation drag geometry and Visio handle lifecycle

Source: ChristopherVR/ooxml at `c68e4f471`,
`src/ui/src/pptx/render/rotation-drag.ts`, `rotate-handle-placement.ts`,
their colocated tests and `element-interaction.ts` (computeRotation).
The DOM-free pointer bearing, anchored drag and viewport placement functions
move to `src/core/geometry`, with extensionless compatibility exports at the
original UI paths. Existing PowerPoint normalized-angle behavior remains the
default; Visio opts into accumulated signed turns. Tests move with the functions.

`src/ui/src/visio/viewer-line-endpoints.ts` supplies the shared capture,
cancellation, gesture-currentness and post-release click ownership now used
by endpoint and rotation handles. Escape retains selection until release;
a new press resets unused click suppression. Visio transforms retain their
source pin and angle through the existing transform reader and page scaler,
so an off-centre local pivot never becomes an inferred bounding-box centre.
Rotation handles use the shared PowerPoint placement helper in a viewport SVG
layer, preserving paper clipping while keeping off-paper handles interactive.
The shared native recorder adds an off-centre pivot source/target capture.

## Shared built-in chart text defaults and native title properties

Source: ChristopherVR/ooxml at `4255dcdee`, the shared chart style reader,
workbook chart appearance resolver and duplicate title XML in
`src/core/xlsx/write/chart.ts` and `chart-patch.ts`. Built-in style metadata
uses the existing style definition and shared XML namespace/model. Its text
defaults feed the existing theme resolver before external and direct styles;
no viewer font engine or Office-specific XML tree was added. The two title
writers now reuse `chart-title.ts`, retaining native rich-text property nodes
so Excel resolves inherited title fonts after regeneration.

`scripts/record-xlsx-chart-styles.ps1` reuses its COM font/paint capture for
legacy and modern built-in references. The new preparation script uses the
shared XML parser/writer to remove direct/external text styles while retaining
empty rich-text property nodes. Excel 16.0 build 20430 independently reopened
all 96 prepared references; their chart parts and font measurements are in
`src/core/chart/excel-built-in-text-styles.json` (test-only, excluded from the
published build). Regression coverage compares resolved title, legend and
axis fonts with those native measurements, style retention on regeneration,
theme/direct precedence and new/replaced title property nodes.

Playwright MCP reviewed the native import and changed its chart type through
the shared UI. Excel reopened/resaved the editor-API export and reopened that
copy: line chart, 18-point bold Aptos Narrow title and 10-point legend/axis
fonts. Built-in text defaults do not establish root chart text inheritance,
mixed-run or East Asian/complex-script font parity, native font measurement,
manual/automatic layout, built-in paint defaults or complete Excel parity.

## Empty Word cached-result preservation

Source: ChristopherVR/ooxml at `908c45ea9`, `simple-field-input.ts`, field guard,
run adapter and existing complex-field schema. Whole-result and final-character
Backspace/Delete replace a simple result with the existing begin/code/separate/end
markers, retaining its instruction and comment metadata. Deleted result formatting
is excluded from structural markers, matching the owned Word empty-result export.
No new schema, collaboration protocol or viewer codec was introduced.

The native replacement recorder now accepts empty replacement text. Its empty
fixture retains two adjacent field instructions, and the editor-hook export
matches native Word 16.0.20430 on reopen. Browser history/typing and mounted Yjs
convergence/export/undo cover the existing body representation. Cut and explicit
empty simple-field import remain outside these cases.

`track-simple-field-deletion.ts` extends the existing revision replacement replay
for this marker conversion. Retained deleted result text stays inside one field;
the current author's pending insertion is removed. The parser's field tracker
recognizes native `w:delText` alongside `w:t`. A native tracked deletion fixture
and reopen comparison retain two fields and one text revision. Core resolution
and six-binding browser cases cover accept/reject and undo; this does not establish
all field editing with Track Changes or multi-author revision attribution.

## Shared live Visio rotation preview

Source: ChristopherVR/ooxml at `f870296e5`, `src/core/visio/geometry.ts`
(transform), `src/core/geometry/affine.ts` (composeAffine) and
`src/ui/src/visio/render-svg.ts` (renderPage/drawShape/drawOwn).
`visioRotationPreviewTransform` composes the existing pin-relative rotation
and affine functions with the saved pose. No second shape transform algorithm
or model mutation path is introduced. Native scaled/custom-pivot poses and
flipped source poses cover its coefficients.

The UI temporary layer reuses the live SVG renderer with selection semantics
turned off, retains the source sibling paint order and disposes temporary
resources on update, cancellation and release. Original source visibility is
restored; pointer capture and Escape remain in the existing handle lifecycle.
Focus moves to the viewport before hiding the source SVG, keeping keyboard
cancellation inside the gesture owner. The browser matrix checks source bytes
after cancellation and during dragging, and compares preview coefficients to
the committed/reopened scene. Native snapping, preview raster equivalence and
Microsoft Visio reopen acceptance remain open.

## Atomic local Visio flip editing

Source: ChristopherVR/ooxml at `b1c737749`, the existing rotation branch in
`edit-geometry.ts`, geometry command snapshots, protection admission and
dependency recalculator, plus the shared Rotate Shapes menu. `flip-shape`
extends the same atomic geometry transaction; it toggles the requested local
scalar boolean and negates the source Angle, preserves dimensions/pins, and
verifies requested caches after recalculation. It does not add another XML,
geometry or history engine. UI actions use the existing worker transaction
and the same core local-shape admission as rotation. Source imports remain
extensionless.

The existing owned Visio 16 recorder now captures
[Selection.Flip](https://learn.microsoft.com/en-us/office/vba/api/visio.selection.flip)
with per-shape pins and guards respected. Two saved references cover horizontal
30-degree custom-pin and vertical 210-degree scaled-page rectangle/ellipse
flips. Additional native captures show LockRotate or GUARD on Angle can retain
Angle while still toggling the flip flag; those cases remain refused by this
initial edit path and require further implementation. One exploratory attempt
to address a nonexistent LockFlip cell failed before saving a reference; no
such cell is used by the implementation. Each owned instance exits through
the recorder finally block. The user's existing Visio instance is untouched.

Core regressions cover both axes, toggling twice, snapshot isolation and
unsupported guards/formulas/units/dependencies. Native comparisons verify
saved angles, pins, matrices, local geometry and styles. The quarter-turn
browser matrix is reused for actual menu flip actions, hover/cancellation,
undo/redo and public save/reload across six bindings. Locked/guarded-angle
flip semantics, groups/masters/glue, inherited transforms, native UI gesture
evidence, exact paint and Microsoft Visio reopen acceptance remain open.

## Shared Word field-aware clipboard deletion

Source: ChristopherVR/ooxml at `e3c06a736`, `field-guard.ts`, simple cached-result
input and `src/ui/src/docx/context-menu-actions.ts`. The guard now exports one
field-aware selection deletion operation. Its cut event and the UI asynchronous
clipboard fallback both reuse it; clipboard projection stays in the core and
clipboard permission/lifecycle handling stays in the existing UI host.

The synthetic source setup moves from `write-word-field-result-exports.mjs` at
that commit into `word-field-export-source.mjs`, reused by the cut export driver.
No parser, serializer or Yjs engine was copied. Existing native range copy and
reopen scripts add a move mode, recording full-result and partial-result moves
without using the system clipboard. The two editor-hook exports match the native
field counts, text and copied bold on reopen. Browser keyboard/fallback checks
and mounted Yjs history cover the body paths; full Windows clipboard formats and
all tracked cut/paste remain unverified.

## Shared chart-space text inheritance and regenerated text bodies

Source: ChristopherVR/ooxml at `f3b93358b`, the shared chart formatting reader,
XLSX appearance resolver and chart topology writer. Chart-space text defaults
are read with the existing DrawingML appearance parser and applied by
`src/core/chart/text-inheritance.ts` before direct element formatting. The
shared element mapping and XML import path preserve imported text bodies and
first title paragraph/run properties during regeneration. No font resolver,
XML tree or chart-specific UI engine was copied into a viewer.

`scripts/record-xlsx-chart-styles.ps1` now also accepts reference files, reusing
its font/paint capture. For these references it reads the actual title
TextFrame2 range, since the title-wide Font property can report a different
inherited size. Preparation uses the shared XML model to vary partial
chart-space defaults and direct overrides. Twenty-four native references
from Excel 16.0 build 20430 are retained in the test-only
`src/core/chart/excel-chart-text-inheritance.json`; theme-font tokens remain
unflattened in source XML. The browser workbook shell moved from
`e2e/xlsx/chart-built-in-text.spec.ts` into `native-chart-fixture.ts` for reuse
by both font matrices, retaining the native chart parts and fixed chart size.

Twenty-five regressions compare native inherited/direct fonts and regenerated
text properties, including minimal charts without fill/axis patches. All 74
focused browser checks pass in six bindings. Playwright MCP changed native
inherited and explicit-font charts to line charts and saved through the UI
API. Excel reopened/resaved both exports and reopened those copies, retaining
24-point italic Arial inheritance and a 32-point bold major-theme title with
direct 9-point legend/axis fonts. Mixed rich runs, multiple paragraphs,
native font measurement/layout, text effects authoring and full Excel parity
remain unfinished.

## Shared Visio quarter-turn command preparation

Source: ChristopherVR/ooxml at `87c3957b5`, the local-shape admission in
`src/ui/src/visio/viewer-rotation-handle.ts` and the existing `rotate-shape`
geometry transaction. `src/core/visio/ui/shape-rotation.ts` now owns that
model-level admission, reused by the pointer handle and quarter-turn command
builder. Source guards, inherited LockRotate and dependency recalculation
remain in the existing core edit path. Relative TypeScript imports are
extensionless; emitted worker asset URLs retain their JavaScript extension.

Five fresh owned Visio 16 captures use `Selection.Rotate` with rotation type
2 (each shape's own pin), guards respected, for ten rectangle/ellipse cases.
Source angles 210, -30, 330, 90 and -90 degrees cover signed normalization,
custom pins, drawing-to-page ratios 0.5 and 3, and both signed half-turn
boundaries. XML cache rounding near the half-turn boundary retains its native
sign; larger differences still wrap. Tests compare saved angle, transform,
pin, geometry and style against those native exports. The recorder reuses its
existing shape-cell and transform capture. Native applications are closed by
the recorder's existing finally block.

These comparisons establish core command preparation, not literal native
menu interaction. The Position > Rotate Shapes submenu, UI command wiring,
native mouse/menu gesture evidence and Microsoft Visio reopen acceptance
remain open. Six framework pointer-rotation cases pass after the admission
extraction, including cancellation, history, save and reload.

## Shared nested menus and Visio quarter-turn ribbon actions

Source: ChristopherVR/ooxml at `c342e79b8`, the existing shared
`office-ui-menu-button`, typed Visio ribbon builders/router and
`ViewerCommands` edit lifecycle. The shared menu gains a submenu mode;
product menu/item subclasses retain local keyboard navigation. Child panels
reuse popovers, viewport placement, focus restoration and command events.
Hover does not steal focus, ArrowRight enters, ArrowLeft/Escape returns and
command selection closes the tree. No Visio-only popup implementation exists.

Home > Position > Rotate Shapes routes its Left/Right 90-degree actions to
the existing core quarter-turn builder and worker/history transaction. UI
availability reuses the core local-shape admission; source protections still
run in the edit transaction. Flip commands remain explicitly unavailable.
Native references are the five owned Selection.Rotate exports recorded in
the preceding entry. Browser tests compare both rectangle and ellipse saved
poses and unchanged geometry/styles, plus undo/redo and public save/reload,
through the actual nested menu in all six bindings. Literal native menu
gestures, exact menu styling, grouped/master/glued rotation, flip editing and
Microsoft Visio reopen acceptance remain open.

## Shared DrawingML mixed text for XLSX chart titles

Source: ChristopherVR/ooxml at `b292d167b`,
`src/core/diagram/drawing-text.ts`, diagram text types, chart appearance reader,
text-body preservation writer and XLSX SVG text/paint helpers. The DrawingML
reader now exposes paragraph defaults and reads runs, cached fields and breaks
in source order. XLSX title parsing reuses it instead of its separate plain-text
scan. Mixed run views reuse the existing chart/theme resolver, and the rich
SVG title painter reuses chart text attributes, escaping and background paint.
No second XML model, DrawingML text parser or viewer font resolver was added.

Regeneration copies an unchanged title's full rich body through the shared XML
import path; edited plain titles keep the existing first-run formatting path.
The native style recorder adds per-character font measurements. The title
recorder authors two Excel mixed-run references; a shared-XML preparation script
isolates an explicit-paragraph variant. All three are independently reopened
in Excel 16.0 build 20430, and test-only parts/measurements are retained in
`src/core/chart/excel-chart-title-text.json` outside the published build.

Per-character regression checks compare native fonts before/after regeneration,
and shared-reader coverage checks field/break order and paragraph defaults.
Eighteen new browser cases reuse the native chart workbook shell in six
bindings; all 92 focused cases pass. Playwright MCP reviewed and exported a
type edit of the paragraph reference. Excel reopened/resaved the export and
reopened its copy with all 23 character font properties unchanged. Native
horizontal text measurement, automatic wrapping, line spacing/layout,
advanced text effects, list-level defaults, mixed-format font authoring UI
and full Excel parity remain open.

## Visio protected-angle flip preservation

Source: ChristopherVR/ooxml at `cffd415a9`, `protectedShape` scalar/style
protection resolution and the shared rotate/flip geometry transaction.
The resolver can now report a validated active rotation lock when a flip
retains Angle. All other callers retain the previous strict admission.
The flip branch reuses existing formula analysis to recognize GUARD and
leaves Angle's attributes untouched, toggles the local flip flag through
the existing cell writer and verifies the retained cached angle after
dependency recalculation. Malformed/error lock or angle caches remain refused.

The two owned Visio 16 protected references recorded with the preceding
flip work demonstrate horizontal rectangle/ellipse flips with LockRotate
and GUARD(30 deg). Core comparisons match native matrices, geometry, styles
and angle/pin metadata. Additional local/inherited-lock and guard cases
assert exact retained Angle attributes, unchanged package payloads and
reversibility. Existing rotation and certified-master-move regressions
remain passing. The same shared menu browser matrix now covers both protected
references in all six bindings, with Escape, hover, history and save/reload.

This resolves the recorded horizontal protected-angle cases, not all
protected shape transforms. Guarded flip flags, dependent angle/flip formulas,
broader inherited protections, groups/masters/glue, native UI gesture and
paint evidence, and Microsoft Visio reopen acceptance remain open.

## Reuse of the grid measurer for XLSX chart text

Source: ChristopherVR/ooxml at `8da3e8b05`,
`src/ui/src/xlsx/grid/measure.ts`, grid drawing layer, and
`src/core/xlsx/layout/chart-svg*.ts`. Chart titles and legends now inject the
existing cached grid canvas width measurer into the DOM-free SVG painter.
One core text metrics helper derives the painter's CSS font, checks host
results, fits Unicode text and retains the previous estimate for headless
callers. No second canvas, font cache or viewer-side chart layout was added.
The shared rich-title painter, background fill painter and legend flow all
consume these widths. Axis labels, wrapping and vertical metrics remain open.

The native mixed-title corpus supplies regression inputs. Playwright MCP
confirmed the previously overlapping Revenue/space runs now advance
contiguously; screenshot review and Excel COM title bounds identify remaining
padding/vertical placement differences. Browser tests compare painted SVG
advances and line centering in every binding before/after a type edit.

## Visio guarded flip flags

Source: ChristopherVR/ooxml at `48c91568f`, the existing protected-angle flip
branch and formula analysis. `guardedCell` shares GUARD recognition for Angle
and the selected flip flag. The native transaction retains a guarded flag's
attributes while negating an unprotected Angle, through the same cell writer,
dependency recalculator and expected-cache verification. A zero or guarded
Angle with a guarded flag produces no dirty part and preserves original bytes.

Two new owned Visio 16 Selection.Flip references cover guarded FlipX=0 with
a 30-degree custom pivot and guarded FlipY=1 at 210 degrees, rectangle and
ellipse. The existing recorder captures both without bypassing GUARD. Core
tests compare native transforms, geometry/styles and angle/pin metadata;
the existing all-six menu matrix covers navigation/cancellation, undo/redo
and public save/reload. Synthetic fully blocked flips also check byte-exact
no-op behavior. No native fully blocked-flip UI evidence is claimed.

Dependent flip/angle formulas, broader protection inheritance, groups/master
and glued transforms, native menu/pointer gestures, exact paint and Microsoft
Visio reopen acceptance remain open. Existing imports remain extensionless.

## Reuse of grid font boxes for XLSX chart baselines

Source: ChristopherVR/ooxml at `e74cf9e85`, cached canvas measurer in
`src/ui/src/xlsx/grid/measure.ts` and core chart SVG metrics/title painters.
The existing canvas now caches natural ascent/descent per CSS font; the grid
injects those metrics through the optional SVG hook. Core title layout derives
mixed-run line boxes and baseline advances from them, and plain title bounds
use the same font metrics. Headless/invalid-metric fallbacks remain unchanged.
No second DOM measurer, canvas or framework-specific layout was added.

The existing native style recorder captures three independently reopened Excel
title rectangles in `src/core/chart/excel-chart-title-geometry.json`, a test-only
fixture. Core comparisons use separately observed Chromium font boxes and
verify native height differences under 2 CSS pixels for these references.
Playwright MCP and native PNG color extents show the second-line placement
improving; the six-binding browser cases compare actual baseline advances
before/after type edits. Wrapping, paragraph spacing, manual layout and full
chart raster parity remain open.

## Native fully blocked Visio flip history and feedback

Source: ChristopherVR/ooxml at `ed7c98774`, the existing recorder, atomic flip
transaction, controller no-op handling and `ViewerCommands` feedback lifecycle.
The same recorder adds guarded-Angle/flag and rotation-lock/guarded-flag cases.
Native Visio 16 retains both cells and the rectangle/ellipse pose, including
a custom pivot and a drawing-to-page ratio of 0.5. The core already returns
original bytes with no dirty part; these native source comparisons verify it.

The UI feedback now checks the existing controller document generation before
announcing a successful mutation. Unchanged commands instead report no change.
No second no-op detector or history engine was introduced. The browser matrix
adds a shared `native-menu-noop.ts` workflow: actual menu activation, exact
source/generation/history checks, a move/undo to create a redo branch, a blocked
flip retaining that branch, redo and public save/reload. All six bindings use
the same helper. The original Visio instance remains untouched; owned capture
applications close through the existing recorder finally block.

This covers the two native fully blocked references and honest command feedback.
It does not establish all protection combinations, literal native menu gestures,
dependent transforms, groups/master/glue, exact paint or native Visio reopen
acceptance. Full Visio parity remains incomplete.

## Shared source proof for native Visio flip formulas

Source: ChristopherVR/ooxml at `9feb75113`,
`src/core/visio/edit-recalculate.ts` and geometry cell admission.
The bounded recursive cell evaluator moves into `edit-recalculate-values.ts`,
with its existing limits, units, cycle detection and missing/inherited/grouped
reference checks. Cache recalculation reuses it unchanged. Flip admission uses
the same evaluator read-only, additionally checking source formula/cache
agreement before replacing an unguarded static transform formula. No second
formula interpreter, dependency graph, worker or history engine was added.
Other geometry commands keep their existing formula admission.

The existing native recorder accepts Angle and selected-flag formulas. Three
owned Visio 16 captures cover width-dependent angles, a width-dependent boolean
flip flag, and a zero-dependent angle. Visio replaces nonzero Angle and toggled
flag formulas with constants, while retaining a zero Angle formula. Rectangle
and ellipse comparisons include custom pivots and a drawing-to-page ratio of 2.
Core checks preserve unrelated package parts, retain dependent formulas while
updating caches, and reject inconsistent caches, cycles, missing references and
formula redirection. The existing six-binding menu/history/save/reload matrix
uses the same native captures. Applications quit; the original user instance
remains untouched. Exact paint, native menu gestures, inherited/group/master/glue
transforms and Microsoft Visio reopen acceptance remain unverified.

## Shared DrawingML paragraph spacing for XLSX chart titles

Source: ChristopherVR/ooxml at `8499a584e`,
`src/core/diagram/drawing-text.ts` and types, XLSX title view/line painter,
chart unit conversion and whole-rich-body preservation. The existing reader
now exposes points/percentage line/before/after spacing for every DrawingML
text body; XLSX consumes the raw units with the same cached host font boxes.
Its line expansion preserves spacing metadata. No second XML parser, chart
serializer, canvas or framework-specific spacing engine was introduced.

The native spacing recorder creates 12 independently reopened Excel 16.0
build 20430 references retained in a test-only chart fixture. Core tests verify
native height differences under 2 CSS pixels for these observed Arial boxes
and exact rich-body preservation through a type change. The browser matrix
covers these cases in six bindings before/after an actual chart edit and
save/reload. Playwright MCP reviewed native imports; Excel reopened, resaved
and reopened its UI export with 6/8-point before/after spacing unchanged.
Compressed first-line placement, additional break/list/field cases, spacing
authoring controls, wrapping and full raster parity remain open.

## Reuse of native flip source proof for Visio rotation

Source: ChristopherVR/ooxml at `f4d411d1f`,
`src/core/visio/edit-flip-formula.ts`, the bounded cell evaluator and existing
rotate-shape/quarter-turn command path. The source-proof helper is renamed to
`edit-transform-formula.ts` and shared by rotation and flip cells. Rotation now
admits resolved static Angle formulas through the same dependency/cache proof,
then writes through the existing atomic transaction and recalculation path.
An explicit assignment replaces an executable Angle formula even at the current
value; formula-free same-value commands still preserve original bytes. This
matches native assignment and creates an ordinary undoable formula edit without
adding another history or worker engine.

The existing owned recorder adds shared source-angle setup and an exact
RotateToSourceAngle mode. Four native Visio 16 captures cover dependent angles,
unchanged-value formula replacement, scaled right quarter-turns and normalized
left quarter-turns from 330 degrees. Rectangle and ellipse checks retain pins,
geometry/styles and unrelated package parts. Existing six-binding control,
pointer and menu workflows cover worker editing, cancellation, undo/redo and
public export/reload; same-value API checks inspect bytes/history because poses
cannot distinguish that edit. Source protections remain enforced. Native pointer
snapping, exact paint, groups/master/glue, inherited or unresolved formula sources
and native Visio reopening remain unverified.

## Shared horizontal text flow for chart titles and PowerPoint SVG

Source: ChristopherVR/ooxml at `71b75cb4e`,
`src/core/pptx/converter/svg-text-lines.ts`. Horizontal flow is extracted into
`src/core/text/wrap-styled-runs.ts`; the existing PowerPoint adapter retains
its font tables and optional host measurement. The shared helper groups words
across formatting runs, measures combined fragments to preserve kerning,
retains explicit empty lines and supports optional oversized-word splitting
at grapheme boundaries. XLSX title rendering enables that splitting and uses
its existing appearance resolver and cached grid canvas measurements. No
spreadsheet-only wrapping engine or additional DOM dependency is introduced.

The owned Excel recorder captures ten independently reopened title references
with chart widths, character formatting, source parts and title rectangles.
Test-only browser metrics record Chromium 154 on Windows canvas widths and
font boxes for Arial 18-point normal and 24-point bold. Native title widths
are within 2 CSS pixels and heights within 4 for that corpus. Browser checks
cover all six bindings, actual type edits and save/reload. The MCP-reviewed
200-point word-title export reopens/resaves/reopens in Excel 16.0 build 20430
with its complete title and 152.07 by 65.1-point box unchanged. Fractional
grid drawing dimensions are retained because whole-pixel rounding moved a
word break. Six-binding pointer resizing checks reflow and undo/redo.
Manual layout, autofit, other scripts/fonts and full raster
equivalence remain unverified or incomplete.

## Shared transaction and native capture reuse for Visio group rotation

Source: ChristopherVR/ooxml at `5f905400b`,
`src/core/visio/edit-geometry.ts`, `edit-geometry-admission.ts`,
`edit-recalculate-index.ts`, `edit-recalculate-values.ts`,
`edit-transform-formula.ts`, `src/core/geometry/affine.ts` and
`scripts/record-visio-line-movement.ps1`. The length-unit admission check is
extracted for reuse by group descendants. A local group-tree proof admits only
the parent Angle through the existing atomic transaction and evaluator; affected
descendant dependencies remain unsafe. No second geometry, worker, history or
rendering engine is introduced. Child cells/formulas and unrelated package parts
are preserved.

The native cell/matrix measurement helpers move from the line recorder into
`scripts/visio-capture-geometry.ps1`, shared with the group recorder. Native
Visio 16 assignments cover a custom-pivot parent and a nested tree on a scaled
page. Shared affine composition compares every descendant against independent
native XYToPage measurements. Public API, undo/redo and saved reload are checked
across six bindings. GUI group authoring, masters/glue, foreign or 1D trees,
broader formulas, exact paint and native Visio reopen acceptance remain open.

## Shared chart manual-layout values and geometry

Source: ChristopherVR/ooxml at `14a33ed2e`,
`src/core/pptx/core/utils/chart-layout.ts` and
`src/ui/src/pptx/render/chart-manual-layout.ts`. Manual-layout value parsing
and the DOM-free edge/factor rectangle resolver move into
`src/core/chart/manual-layout.ts`. PowerPoint retains its object-tree/raw
extension adapter and region-specific title/legend/data-label calculations;
its UI re-exports the shared resolver for compatibility. XLSX uses the same
value reader through the shared XML adapter and the same rectangle resolver
for imported title positions. No duplicate spreadsheet layout parser or
viewer geometry engine is added.

Shared chart formatting captures manual-layout values and overlay flags.
Regeneration copies entire title/plot/legend layout and overlay subtrees in
schema order, retaining unknown extensions. Title positioning and title
overlay reservation/paint order now reach the XLSX SVG painter. Chart borders
use an outline so they do not shrink the SVG coordinate viewport. Manual title
width/height authoring, manual plot/legend painting, native frame/grid sizing
and complete layout/raster parity remain incomplete.

Seven owned Excel 16.0 build 20430 references are independently reopened with
chart/title/plot geometry, source parts and text properties. Existing native
recording adds an optional layout-geometry capture. Playwright MCP edits
moved/overlay references through Change Chart Type; Excel reopens/resaves and
reopens both exports at Left=40 points, Top=60/120 points and
IncludeInLayout=true/false unchanged. Existing PowerPoint layout integration
tests continue to exercise the extracted resolver.

## Shared local group rotation interaction admission

Source: ChristopherVR/ooxml at `cd7e429a2`,
`src/core/visio/ui/shape-rotation.ts`, `src/ui/src/visio/viewer-commands.ts`,
the existing geometry controls, rotation gesture and renderer-backed preview.
The model helper now scans bounded local 2D trees, including descendant master
and glue checks. Core source admission remains authoritative for formulas and
protection. The same helper feeds pointer handles and quarter-turn commands;
its leaf-only mode retains flip admission. No group-specific gesture, preview,
history or framework implementation is added.

The native group recorder reuses Selection.Rotate from the existing line
recorder for left/right quarter turns. Owned Visio captures include a custom
pivot and a nested scaled group. The existing six-binding API/history/reload
matrix is extended to controls, actual pointer gestures with cancellation and
preview/source isolation, and nested quarter-turn menus. Independent native
parent/descendant matrices remain the geometric reference. Browser pointer
rounding is bounded explicitly; native snapping/selection gestures, other group
edits, exact paint and native Visio reopening remain open. The shared submenu
manifest is refreshed from existing component definitions. Endpoint/rotation
overlays also reuse the canvas change signal and relevant viewer state changes,
avoiding needless subtree scans on search updates; the existing regression
checks this behavior.

## XLSX manual legend rendering through shared chart geometry

Source: ChristopherVR/ooxml at `6832b8c68`,
`src/core/xlsx/layout/chart-svg.ts`. The existing automatic legend painter
moves to `src/core/xlsx/layout/chart-svg-legend.ts` within the same core area.
Imported legend rectangles reuse `src/core/chart/manual-layout.ts`, extracted
from PowerPoint in the preceding increment, rather than adding new rectangle
resolution logic. PowerPoint's current fixed-width legend entry painter was
reviewed; it does not implement the native Excel resized-box flow exercised
here. XLSX adds measured horizontal/vertical flow for the tested legend boxes.

Eight owned Excel references and preserved source parts cover moved legends,
overlay reservation and wide/tall dimensions. Playwright MCP exercises actual
imports and a Line edit/export; Excel resave/reopen retains the tested tall
legend's geometry, font and overlay flag. This work does not complete native
legend packing, paint ordering, swatches, authoring controls or chart parity.

## i18n area: shared locale, dictionary and translator helpers

Source: ChristopherVR/ooxml at `d9ef4e075`. `src/core/i18n/locale.ts` generalises
the two identical `normalizeEditorLocale` copies in
`src/ui/src/docx/localization.ts` and `src/core/xlsx/ui/localization.ts`
(region fallback, Traditional Chinese rejection); `dictionary.ts` is
`mergeStringModules` from `src/core/xlsx/ui/locales/merge.ts`; `translator.ts`
unifies the docx `translateTemplate`, the xlsx `fillTemplate`/`translate` and the
pptx `src/ui/src/pptx/i18n/translator.ts` interpolation (`{name}` and `{{name}}`)
and fallback chain. The three product modules keep their public exports as thin
wrappers over `ooxml-core/i18n`; no dictionaries moved and none were added for
visio or teams.

## Elbow connector geometry dedup (wave 1, item 4)

`curvedElbowPathD` and `elbowSegmentCount` moved from
`src/ui/src/pptx/render/connector-elbow-geometry.ts` into
`src/core/geometry/connector-elbow-geometry.ts` (rewritten over `[x, y]` tuples,
tests moved alongside). The UI module now delegates to `ooxml-core/geometry` and
keeps only the pptx-typed adjustment helpers and `{ x, y }` adapters. The two
`elbowWaypoints` implementations produced identical points for every tested
segment count, flip and degenerate input, so no behaviour changed.

## Visio theme on `drawingml` (wave 2)

`src/core/visio/theme-color.ts` no longer carries its own DrawingML colour
resolver: `drawingPaint`/`drawingColor` read the colour with `parseDrawingColor`
and apply tint, shade and alpha with `resolveDrawingColor` (document order, linear
light) from `src/core/drawingml/`. What stays in visio is a thin guard that keeps
its stricter limits (only `srgbClr`, saved `sysClr` and `schemeClr`; `a:`
namespace on the colour and its transforms; at most 32 transforms; `shade`, `tint`
and `alpha` as integers up to 100000, `hueMod` ignored per MS-VSDX 2.3.4.2.22;
scheme references at most 8 deep; lower-case `#rrggbb`). `src/core/visio/theme.ts`
reads the `a:clrScheme` slots through `parseTheme`, keeping only slots that hold
exactly one `a:` colour as before; the `vt:` extensions (`bkgnd`, variation colours
and styles, effect and connector schemes, font styles) are still parsed in visio.
`VisioTheme.colors` and `variants` now hold `DrawingColor` values instead of
elements; the module exports are otherwise unchanged. Parse output of 15 local
native VSDX files (including the two hash-pinned Apache POI corpus files) is
byte-identical before and after.

## Word ruler on the shared ruler (wave 2, item 7)

The DOM ruler in `src/ui/src/docx/ruler.ts` (inch labels, shaded margins, three
draggable indent markers, its `.dve-ruler*` CSS in `docx/styles/chrome-document.css`)
now renders through `office-ui-ruler` (`src/ui/src/chrome/ruler.ts`). The shared
element gained `extent`, `marginStart`, `marginEnd`, `zoom`, `labelsWithinMargins`,
`label` and draggable `markers` with `ruler-marker-move`/`-commit`/`-cancel` events.
`docx/ruler.ts` keeps only the indent arithmetic (`markerPositions`, `markerChange`)
and a thin `createRuler`/`updateRuler` adapter. Marker hooks changed from
`.dve-ruler-marker-<name>` classes to `[data-marker="<name>"]` inside the ruler's
shadow root (the docx e2e spec was updated). The xlsx `office-bridge.css` was
replaced by `shadcnBridge(':host', '--xve-')`, and the Visio viewer now derives its
colours from the shared `--office-*` tokens (`visio/styles/theme.ts`).

## pptx document properties through `opc/properties` (wave 2)

Source: ChristopherVR/ooxml at `03b6a34ac`,
`src/core/pptx/core/services/PptxDocumentPropertiesUpdater.ts`,
`src/core/pptx/core/utils/app-properties-titles.ts` and the three `docProps`
readers in `src/core/pptx/core/core/runtime/PptxHandlerRuntimeDocProperties.ts`.
Nothing was copied: the shared `src/core/opc/properties` model gained what pptx
needed (the PowerPoint and Word statistics fields of `app.xml`, Strict
extended-property namespaces, `formatW3cdtf`, title-group helpers generalised
from `applySlideTitlesToAppProps`, a text view of custom properties) and its
writers now splice changes into the source part (`patch.ts`) instead of
reserialising the DOM. The pptx updater and readers are adapters over it
(`utils/document-properties-model.ts`); the custom-properties package entries
moved verbatim to `services/custom-properties-package.ts`; the titles module was
deleted. The word, paragraph and notes counters stay in pptx (PowerPoint
algorithms). Output differs from the former fast-xml-parser rebuild only in
form, checked on the 328 committed decks that carry docProps: the source declaration line
break and indentation are kept, inserted elements follow PowerPoint's order,
rewritten text escapes only `&`, `<`, `>` and CR, and `custom.xml` carries a
declaration. Two behaviours changed: custom properties are written even when
`app.xml` is missing, and an `app.xml` whose root has a prefix is refreshed.

## pptx title and status bar bridges (2026-10-08)

Source: ChristopherVR/ooxml at `0f081d260`,
`src/ui/src/pptx/web-components/title-bar-styles.ts` (`TITLE_BAR_BRIDGE`) and
`status-bar-styles.ts` (`STATUS_BAR_BRIDGE`). Both modules were deleted; their
token blocks moved into the per-tag extras of `office-token-bridge.ts`. The
rules that reached into the shared elements' internals became shared tokens:
`.name` colour is `--office-title-bar-name-foreground`, the highlighted search
result `--office-title-bar-result-selected`, the status-bar separators'
opacity `--office-status-bar-separator-opacity`, the AutoSave switch metrics
moved from `.switch` to `:host` (they inherit into the nested `pptx-ui-switch`)
and the status bar's `.bar` line height to `:host`. The status bar's
`.zoom-fit` rule was dropped: `.bar button` outranked it, so it never applied.

## Shared comments pane (wave 3)

Source: ChristopherVR/ooxml at `0f081d260`. `src/ui/src/comments/comments-pane.ts`
(`office-ui-comments-pane`, with `comments-pane.css` and the neutral model in
`types.ts`) is new code modelled on the Word pane in `src/ui/src/docx/comments-panel.ts`
(its thread layout, Resolve/Reopen, Reply and Delete controls and their labels), extended
to the Office 365 pane: avatar initials, formatted times, an anchor label, a resolved
badge, editing of the current author's comments, Ctrl+Enter to post, and keyboard
navigation between threads. Nothing format-specific moved: each product keeps a small
adapter from its own comment records to `OfficeCommentThread`.

- Word: `docx/comments-panel.ts` keeps its `createCommentsPanel` handle but its DOM
  builder and inline stylesheet were deleted; the pane is now the shared element with
  `.dve-comments-panel` on the host and `.dve-comment-thread` on each comment (inside the
  pane's shadow root, where the Playwright selectors still find it). Choosing a thread
  moves the caret to its anchor, and the open pane highlights the thread at the caret.
  The `Resolved` badge label was added to every Word locale.
- Excel: the Show Comments dialog (`xlsx/dialogs/comments-list.ts`) lists the sheet's
  notes and threaded replies through the pane in `list-only` mode instead of a list box
  of `A1  Author: text` rows.
- PowerPoint: not ported. `pptx/render/comments-list.ts` holds only the pure comment-array
  transforms; each framework binding draws its own comments panel, so adopting the pane
  is a per-binding change in `viewers/pptx`.

## Chart SVG painter in the chart area (wave 4, Word charts)

Source: ChristopherVR/ooxml at `8fb1f582d`, `src/core/xlsx/layout/chart-*.ts` and
`font-family.ts`, and the `ChartSpace -> ChartObject` mapping in `src/core/xlsx/read/chart.ts`.
Moved with `git mv`, file names kept, into `src/core/chart/render/` (`chart-view`,
`chart-appearance`, `chart-title-text`, `chart-colors`, `chart-scale`, `chart-spacing` and every
`chart-svg*` module); `font-family.ts` became `src/core/text/css-font-family.ts` because the
cell painter shares it. What changed: the painter reads the new neutral `ChartSummary` /
`ChartSummarySeries` / `ChartThemePalette` types (`render/summary.ts`), which the spreadsheet
`ChartObject`, `ChartSeries` and `ThemePalette` now extend; `chartView` became
`chartSummaryView(chart, theme, { evaluateRef, seriesColor })` with the value-axis helpers split
into `chart-value-axis.ts`, and `xlsx/layout/chart-view.ts` is a thin wrapper that supplies live
cell references and SpreadsheetML series colours. The series mapping moved to
`render/summary-from-space.ts` (`chartSummaryFromSpace`); the spreadsheet reader only adds the
anchor and legacy `Color`. Theme slots and the Office default colours moved to
`render/theme-palette.ts`, and the hex helpers to `src/core/color/hex-rgb.ts` (`tint.ts`
re-exports them as `parseHex`/`toHexColor`). The Excel chart tests are unchanged apart from
import paths and still pass byte for byte.

## Visio selection rendering eligibility

Source: ChristopherVR/ooxml at `fadc60d589474d0699404b1e1fb251257fb13219`,
`src/ui/src/visio/viewer-layers.ts`. The DOM-free `hasVisibleShapeContent` helper
moved into `src/core/visio/ui/selection.ts`, alongside new immutable selection
normalization helpers. Its rendering eligibility behavior is unchanged; the UI
re-exports it so SVG rendering and selection use the same implementation.

## Orthogonal connector router (shared with Visio)

Source: ChristopherVR/ooxml at `f57ee8e64`, `src/ui/src/pptx/render/`:
`connector-router.ts`, `connector-router-graph.ts`, `connector-router-astar.ts`,
`connector-router-types.ts` and their three test files moved unchanged in behaviour
to `src/core/geometry/` (exported from `ooxml-core/geometry`). Changes: bounds-checked
indexing for the strict project, the two path-string helpers written with `map`, and
the Angular `Point`/`Rect` aliases stayed in the UI. `src/ui/src/pptx/render/connector-router.ts`
and `connector-router-types.ts` are now re-exports, so the PowerPoint bindings keep
their import surface; the 71 moved tests and the bindings' own router tests pass
unchanged. `src/core/visio/connector-route-avoid.ts` is the first non-PowerPoint
caller: it scales page inches to the router's pixel-like units and back.
