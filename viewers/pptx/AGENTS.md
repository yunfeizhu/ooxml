# AGENTS.md

Guidance for coding agents (Claude Code, Codex, and others) working on the
PowerPoint viewer in `viewers/pptx` of ChristopherVR/ooxml. It moved here from
the ChristopherVR/pptx-viewer repository with its history; that repository now
holds only a pointer. The repository-wide rules (layout, releases, commits,
style) are in the root [`AGENTS.md`](../../AGENTS.md) and apply here too; this
file adds what is specific to the PowerPoint viewer. `CLAUDE.md` only imports
it, so edit this file and never fork the two.

Paths below are relative to `viewers/pptx` unless they start at the repository
root (`src/core/...`, `src/ui/...`, `demos/pptx/...`, `e2e/pptx/...`).

## READ FIRST: the two rules that govern every UI change

This repo ships **five** UI bindings (react, vue, angular, svelte, vanilla) over
one framework-agnostic engine. Almost every expensive bug in its history came
from breaking one of these two rules. They are not aspirational; they are the
definition of "done" for any work that touches a binding.

### Rule 1: a fix or feature in one binding must reach all five

**Never finish a UI change in a single binding.** If you fix a bug in React, the
same bug is almost certainly present in vue, angular, svelte and vanilla, because
the bindings are ports of each other. Fixing one and stopping is how divergence
gets created, and divergence is the most expensive debt in this repo.

The required loop for **every** UI bug fix:

1. **Diagnose the root cause**, not the symptom. Ask "where does this behaviour
   actually come from?" If the answer is a shared module, one edit fixes all
   five. If the answer is per-binding code, the bug exists five times. If the
   answer is the parsed model itself, the fix belongs in `src/core/pptx` at the
   repository root (see [Where things live](#where-things-live)).
2. **Grep the other four bindings for the same pattern** before declaring the
   fix scoped. Search for the property, class name, helper, or condition you just
   changed across `packages/{react,vue,angular,svelte,vanilla}`.
3. **Fix every affected binding in the same change.** Do not defer four of them
   to "a follow-up"; the follow-up never happens and the drift becomes permanent.
4. **Add a regression test per binding**, plus a framework-neutral spec in
   `e2e/pptx/` when the behaviour is observable in a demo.
5. **Verify in the running demos**, not just the unit suites. All five suites
   have been green while a binding was visibly broken, because the defect lived
   in template wiring no unit test covered. See the demo-resolution table below
   (angular needs a build first).
6. **If one binding is genuinely blocked, say so explicitly** and file a tracking
   issue. Silently fixing one binding is the failure mode.

Assume a UI bug is structural until proven otherwise. "Genuinely
framework-specific" means Angular change detection, Svelte 5 runes, React effect
ordering, and the like. A wrong colour, a mis-clipped shape, an off-by-one drag
handle, or a dialog that will not open is almost never framework-specific.

### Rule 2: share Office logic in OOXML and view behavior in `ooxml-ui/pptx`

When you touch logic in a binding, **first decide whether it is Office logic or
view behavior**. Pure document, chart-data, color, geometry and text algorithms
belong in the core at `src/core/` of this repository, under a neutral area
when other formats can use them. Framework-independent view descriptors and editor interaction belong in
`src/ui/src/pptx/render/`. Move the implementation to its owner. This is
not a cleanup task to schedule later; it is how the parity rule above is made
cheap. Logic that lives in shared is fixed once for all five bindings, and never
drifts.

Extraction triggers, any one of which means stop and extract:

- You are about to make the same edit in more than one binding.
- You are porting a fix from one binding to the others.
- You find a pure helper (no framework imports) sitting inside
  `packages/{react,vue,angular,svelte,vanilla}`.
- You are writing new logic for a feature that all five bindings will need.

For view behavior, the target shape is a **pure decision function**: shared exports a function that
returns a framework-neutral descriptor, and the binding does nothing but map that
descriptor onto its own style object or template. Following that shape, a new
branch reaches all five bindings at once.

Both rules are expanded, with the concrete failures that motivated them, under
[Key Conventions](#key-conventions).

## Where things live

The viewer is UI only. Everything else is in this repository or a sibling one:

| Where                                         | npm package                         | Owns                                                                                                                                                                                                           |
| --------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `viewers/pptx` (this folder)                  | `pptx-*-viewer`, `pptx-viewer-core` | The five bindings, compatibility facades, locales, MCP tools, installer, docs site. `packages/core` is only a thin public entry point.                                                                         |
| `demos/pptx/`, `e2e/pptx/` (repository root)  | not published                       | The five framework demos (and the files they share) and the Playwright specs with their fixtures. Playwright is still configured and run from here.                                                            |
| `src/core` (repository root)                  | `ooxml-core`                        | **All OOXML logic.** The PowerPoint engine (parse, edit, serialize, theme resolution, geometry, charts, SmartArt, animation model, converter, CLI, signatures) is its `pptx` area; shared areas sit beside it. |
| `src/ui` (repository root)                    | `ooxml-ui`                          | Shared Lit elements and the PowerPoint renderer, web components, browser lifecycle and themes.                                                                                                                 |
| ChristopherVR/ole2                            | `@christophervr/ole2`               | **Legacy binary formats**: CFB/OLE2, `.doc`, `.xls`, `.ppt` reading and writing, RC4 CryptoAPI. A pinned dev dependency of the core whose codecs are inlined into its bundles.                                 |
| ChristopherVR/emf-converter, mtx-decompressor | `emf-converter`, `mtx-decompressor` | EMF/WMF rendering and embedded EOT font decompression.                                                                                                                                                         |

How they connect:

- `packages/core` (`pptx-viewer-core`) depends on `ooxml-core` and re-exports
  `ooxml-core/pptx` (plus `/pptx/converter`, `/pptx/cli`,
  `/pptx/signature-node`) and the shared `/math`, `/chart`, `/text`,
  `/geometry` and `/color` APIs. Its `src/` holds thin entry files and an
  entry-point contract test, nothing else. In the workspace it links to
  `src/core` itself, so it always sees the current engine.
- The React, Vue, Svelte and vanilla bindings bundle `pptx-viewer-core` (a thin
  re-export) and `pptx-viewer-locales`, and declare `ooxml-core` and `ooxml-ui`
  as runtime dependencies instead of inlining them: `ooxml-ui` depends on the
  core, so an inlined copy would ship the core twice. Angular imports the
  published `pptx-viewer-core` instead. Either way a binding can only use core
  code that has been released. A change to the core's `pptx` area (or a shared
  area it uses) still releases the bindings (`scripts/viewer-packages.mjs` at
  the repository root).
- Modern OOXML never goes into ole2; binary codecs never go into the core;
  engine logic never goes into this viewer.

### Where does my change go?

| The change is about...                                                                                                | Make it in                                                                  |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Parsed model is wrong: a value missing/misread from the XML, theme/placeholder inheritance, save/round-trip loss      | `src/core/pptx/` at the root (with a round-trip test there)                 |
| Unit, colour, geometry or preset-shape maths reused across Office formats                                             | `src/core/{units,color,geometry,chart,...}/` at the root                    |
| `.ppt` / `.doc` / `.xls` binary reading or writing, CFB containers, RC4 encryption                                    | ChristopherVR/ole2 (with a fixture-based test there)                        |
| EMF/WMF pictures or embedded EOT fonts render wrong                                                                   | ChristopherVR/emf-converter / mtx-decompressor                              |
| How a correctly parsed element is drawn, laid out, hit-tested, animated or exported; any UI decision 2+ bindings need | `src/ui/src/pptx/render/`                                                   |
| Template/JSX wiring, framework reactivity, binding-only chrome                                                        | `packages/{react,vue,angular,svelte,vanilla}/src/` (all five)               |
| UI strings                                                                                                            | `src/ui/src/pptx/i18n/` + `packages/locales/src/<locale>/`                  |
| AI/MCP tool functions                                                                                                 | `packages/tools/src/`                                                       |
| Tool schemas and DOM-free document operations                                                                         | `src/core/pptx/automation/schemas/` and `src/core/pptx/editor/` at the root |
| A demo app, or a browser test and its fixtures                                                                        | `demos/pptx/demo-*` / `e2e/pptx/` at the root                               |

Never copy an implementation from the core or ole2 into this viewer to "fix it
locally". An engine fix and the viewer change that uses it can land together
here; the release planner releases the core and, because the bindings depend
on it, the bindings too.

### Working on the engine and the viewer together

There is nothing to link: the workspace resolves `ooxml-core` to `src/core`.
After an engine edit run `bun run build` at the repository root (the bindings
and the demos read the core's `dist`), then rebuild the pptx packages you need
(`bun run build:packages` here builds all of them in order).

### Map of this viewer

```
packages/
  core/             pptx-viewer-core     - Thin entry point re-exporting ooxml-core/pptx
  shared/           pptx-viewer-shared   - Private compatibility exports from ooxml-ui/pptx
  locales/          pptx-viewer-locales  - de/es/fr/zh-CN dictionaries (internal)
  react/            pptx-react-viewer    - React viewer/editor component
  react-compat/     (private, no build)  - React 18 peer set; `packages/react` aliases onto it to
                                           re-run its suite + declaration check (`bun run test:react18`)
  vue/              pptx-vue-viewer      - Vue 3 viewer/editor component
  angular/          pptx-angular-viewer  - Angular viewer/editor component (ng-packagr; consumes ooxml-ui/pptx)
  vanilla/          pptx-vanilla-viewer  - Zero-framework (VanillaJS) viewer
  svelte/           pptx-svelte-viewer   - Svelte 5 viewer component
  tools/            pptx-viewer-mcp      - MCP server / tooling (uses core automation schemas)
  cli/              @christophervr/pptx-viewer - Installer and React compatibility re-export
scripts/            build and check scripts, fixture generators (make-*.mjs/.ps1),
                    COM acceptance against real PowerPoint (com-acceptance*.mjs, Windows + bun only)
docs/               VitePress documentation site (built into the shared Pages site under /ooxml/pptx/)
playwright*.config.ts  Playwright configs; testDir is ../../e2e/pptx

At the repository root:

src/ui/src/pptx/    renderer, web components, browser lifecycle, themes and English dictionary
src/core/pptx/editor/  DOM-free editing, loading and collaboration operations
src/core/pptx/automation/schemas/  shared assistant and MCP tool schemas
demos/pptx/demo-{react,vue,angular,vanilla,svelte}/  Vite demo apps (ports 4173/4175/4174/4176/4177)
demos/pptx/shared/  files every demo imports (the `pptx-demos` package declares their dependencies)
e2e/pptx/           Playwright specs (framework-neutral; `bun run e2e:contract` enforces it),
                    e2e/pptx/support (cross-binding parity harness), e2e/pptx/fixtures (decks, also the demos' public dir)
```

The core keeps a committed snapshot of `e2e/pptx/fixtures` under
`src/core/pptx/__tests__/fixtures/e2e` for its own tests. The generator scripts
stay here; refresh that snapshot deliberately, never automatically.

## Build & Development Commands

Install once at the repository root (`bun install` there; it is one workspace).
Build the core and `ooxml-ui` there first (`bun run build && bun run --cwd
src/ui build`): the bindings and demos read their `dist`. Then, from this
folder:

```bash
bun run build:packages       # Build core, shared, locales, tools, cli and the five bindings (what CI and releases run)
bun run build                # The same plus the React demo
bun run test                 # Run vitest across all packages (scripts/test-all.sh)
bun run typecheck            # Type-check all packages (needs built packages: CI runs build:packages first)
bun run typecheck:fresh      # Build the packages, then type-check (clean checkouts)
bun run fmt                  # Format with oxfmt (format only the files you changed)
bun run lint                 # Lint with oxlint
bun run e2e                  # Neutrality contract + Playwright (all five demos; pass --project=react etc. to narrow)
bun run demo                 # Start the React demo dev server (Vite, port 4173)
bun run demo:vue             # Start the Vue demo dev server (Vite, port 4175)
bun run demo:angular         # Start the Angular demo dev server (Vite, port 4174)
bun run demo:vanilla         # Start the VanillaJS demo dev server (Vite, port 4176)
bun run demo:svelte          # Start the Svelte demo dev server (Vite, port 4177)

# Per-package (run from package directory)
bun run build                # Run the package-specific build pipeline
bun run dev                  # Watch mode
bun run test                 # Run vitest
bun run typecheck            # Type-check
```

`build:packages` runs **core -> shared -> locales -> tools -> cli -> react ->
vue -> angular -> vanilla -> svelte**. The engine's own test suite is the core's
(`bun run test` at the repository root); `packages/core` here only runs
entry-point contract tests. Releases and the changelog come from the root
release flow (`scripts/release-plan.mjs`, `scripts/viewer-packages.mjs`); the
old `release:plan` script here is unused.

CI (`.github/workflows/ci.yml` at the root) runs this viewer in its own jobs
whenever the core's pptx area, a shared core area, `ooxml-ui`, this folder or
`demos/pptx`/`e2e/pptx` change: `pptx-build` (build, typecheck, e2e contract,
packed-binding check), `pptx-test` (one job per package, plus React 18), the
browser suite split by framework and shard (`pptx-e2e`), and the packaged-build
smoke.

### Running the tests quickly

**Unit tests share workers.** Each binding package's `vitest.config.ts` builds its `projects` from
`scripts/vitest-isolation.mjs` and runs with `isolate: false`, which is most of the speed (react
489s to about 150s, vue 294s to 40s, angular 281s to 50s, svelte 281s to 45s, vanilla 221s to 50s).
Files that need more are found by content, so a new test needs no registration:

- `vi.mock` / `vi.doMock`, or the comment `@vitest-fresh-modules` (use it when a test depends on
  module state such as an uninitialized i18n or the lazily loaded layout library): the module
  registry is reset before the file loads.
- `*ssr.test.*` or `TestBed.initTestEnvironment(`: a worker of its own.

`scripts/vitest-dom-hygiene.setup.ts` removes the `document`/`window` listeners a file leaves and
clears the body, because the DOM is shared too. Tests must still clean up what they change (module
state, globals, timers): the next file in the worker sees it. `packages/react`'s React 18 leg
(`vitest.react18.config.ts`) is unchanged and still isolates per file.

**Browser tests run React only by default** when not in CI. React is the parity reference: its
parity specs drive all five demos and diff them against it, so one project still checks every
binding, at about a fifth of the cost. Run another binding with `--project=<name>` (or
`bun run e2e -- --project=vue`), or all of them with `bun run e2e:all` /
`PPTX_E2E_ALL_BINDINGS=1`. CI always runs every binding.

- `bun run e2e:servers start|stop|restart|status` keeps the five demo dev servers and the
  collaboration relay up between runs (Playwright reuses a server that is listening). Restart them
  after rebuilding `ooxml-ui`, core or the angular package, since a running server serves the old
  build. The list lives in `e2e-servers.ts`, which `playwright.config.ts` also uses.
- `bun run e2e:changed` runs only the spec files changed against `origin/main`, plus specs that
  import a changed support file. It does not follow a change to product source: for that run the
  affected specs by name (`bun run e2e -- <spec>`), or the project (`bun run verify --browser`).
- Machine-specific settings go in the git-ignored `viewers/pptx/.env.local`, which the config
  loads: `PPTX_E2E_WORKERS=12` sets the Playwright worker count (the default is half the cores),
  `PPTX_E2E_PORT_OFFSET` shifts the ports.

### `@local-only` e2e tests and the pre-push hook

A few e2e specs do real-time video capture and reliably crash the hosted CI
runner rather than just failing (see `e2e/export-raster-tiling.spec.ts`), so
they carry the Playwright tag `@local-only` and are excluded from CI via
`grepInvert` in `playwright.config.ts`. Run them with `bun run
e2e:local-only` before pushing a change to export or video code. The
`.husky/pre-push` hook that used to run them automatically
(`scripts/pre-push-local-e2e.mjs`) is not installed in this repository, so
nothing runs them for you any more.

## How the Demos Resolve Packages (read before debugging one)

The five demo apps are the runtime surface for binding work. Each demo's
`vite.config.ts` aliases bare package specifiers, but **not uniformly**, and the
difference decides whether your edit is live on reload or needs a build first.

| Specifier                     | react      | vue        | angular    | vanilla    | svelte     |
| ----------------------------- | ---------- | ---------- | ---------- | ---------- | ---------- |
| the binding (`pptx-*-viewer`) | source     | source     | **`dist`** | source     | source     |
| `pptx-viewer-core`            | source     | source     | **`dist`** | source     | source     |
| `ooxml-ui/pptx`               | **`dist`** | source     | **`dist`** | source     | source     |
| `pptx-viewer-locales`         | source     | source     | **`dist`** | source     | source     |
| `pptx-viewer-mcp`             | **`dist`** | **`dist`** | **`dist`** | **`dist`** | **`dist`** |

`pptx-viewer-core` "source" is only the thin entry file: the engine behind it
always comes from the core's `dist` (`src/core/dist`, linked by the
workspace), so an engine edit is invisible to every demo until you run `bun
run build` at the repository root (see
[Working on the engine and the viewer together](#working-on-the-engine-and-the-viewer-together)).

Anything marked `dist` resolves through the workspace `exports` field to built
output, so **source edits are invisible until you build that package**:

- **Angular**: `pptx-angular-viewer` is built by ng-packagr, so the demo reads
  `packages/angular/dist`. Editing `packages/angular/src` changes nothing on
  screen until `bun run build` in `packages/angular`. This is the single most
  common way to waste an hour concluding "my change doesn't work in Angular".
  Angular imports the public `ooxml-ui/pptx` entries, so shared UI edits need
  a build in `src/ui` at the repository root. **Its `pptx-viewer-core` is
  `dist` too**: the demo never aliases core, unlike the other four, so a core
  change needs `bun run --filter pptx-viewer-core build` before this demo sees
  it at all. Core is also in the demo's `optimizeDeps.include`, so vite
  pre-bundles it into `demos/pptx/demo-angular/node_modules/.vite/deps/pptx-viewer-core.js`;
  that copy normally re-optimises when core's dist changes, but it has been
  observed serving a stale core anyway (a long-running server on Windows, where
  the watcher does not always see writes through the workspace symlink). If
  Angular alone disagrees with the other four demos, delete that demo's
  `node_modules/.vite` and restart before suspecting your code.
  `e2e/pptx/dist-freshness.ts` checks both axes before every e2e run.
- **Assistant schemas and document operations** are imported from
  `ooxml-core/pptx/automation`, not the viewer MCP server. Build the core
  before building shared UI so the browser receives current exports.
- **`ooxml-ui/pptx`**: after adding a NEW export, run `bun run build` in
  `src/ui` at the repository root, then rebuild the bindings that read `dist`.

Other demo gotchas:

- **Zombie vite servers** keep serving stale code after a refactor. Check with
  `netstat -ano | grep -E ":(4173|4174|4175|4176|4177) .*LISTENING"`, and if
  behaviour contradicts the source, kill the PID and relaunch rather than
  debugging the code.
- **Stale vite dep caches** cause bogus framework-internal crashes. A stale
  `demos/pptx/demo-svelte/node_modules/.vite` threw a "Cannot read properties of
  undefined" error from inside Svelte's own runtime and stopped decks rendering
  entirely. Delete the demo's `node_modules/.vite` and restart before believing
  a stack trace that points into a framework.
- **A demo that never renders is usually a cached resolution failure, not your
  code.** Vite caches a FAILED import resolution, so a module added while the
  server was running keeps 500-ing after the file exists on disk and is
  committed. The tell is that every e2e test times out on `#file-input` at once
  while the page itself returns HTTP 200: the shell serves, the app never
  mounts. Diagnose by checking which port actually 500s rather than assuming the
  suite found a real regression:
  `curl -s http://localhost:4176/@fs/<abs-path>/src/ui/src/pptx/render/index.ts`
  names the unresolved import. Then kill that port, delete that demo's
  `node_modules/.vite`, and restart it. This has masked "all parity specs
  failed" more than once; four of five demos being healthy is the clue.
- **Rebuilding `packages/angular/dist` breaks the running Angular demo.** It
  starts 404-ing on its own CSS and its vite pre-bundle of core goes stale
  (`e2e/pptx/dist-freshness.ts` checks that second axis separately and tells you to
  clear it). After any `bun run --filter pptx-angular-viewer build`, kill :4174,
  `rm -rf demos/pptx/demo-angular/node_modules/.vite` (from the repository root), and restart before running
  e2e.
- The demos serve `e2e/pptx/fixtures` as their public dir, and the landing page's
  "or create a New Presentation" button gives an editable deck without a file.
- **Every demo declares what it imports.** The root workspace uses Bun's
  isolated linker, so a package sees only its own declared dependencies. A demo
  (or `demos/pptx/shared`) that imports something it does not declare used to
  work by accident through `viewers/pptx/node_modules` and now fails to resolve.
  Add the dependency to that demo's `package.json` (or to `demos/pptx/package.json`
  for the shared files).
- **The Angular demo pins its own TypeScript for the Analog plugin.** The plugin
  imports `typescript` without declaring it, which would resolve the core's
  TypeScript 7 (no JS compiler API); `demos/pptx/demo-angular/vite.config.ts`
  registers a resolve hook before loading the plugin. Keep that order.

## Architecture

### Engine (`src/core/pptx/` at the repository root, exposed by `packages/core`)

Paths in this section are relative to `src/core/pptx/`. Do not add engine
logic to this viewer. The area is compiled with relaxed TypeScript flags for
now (`src/core/tsconfig.pptx.json`), and its geometry, colour and unit
primitives come from the `geometry`, `color` and `units` areas of the core.

- **`PptxHandler`** (`core/PptxHandler.ts`) is the public facade. It wraps
  `PptxHandlerCore` -> `PptxHandlerRuntime` (`core/core/`).
- **Runtime uses mixin composition**: focused modules in `core/core/runtime/`
  (`PptxHandlerRuntime*.ts`) each add one capability (parsing, saving, theme
  resolution, etc.) to `PptxHandlerRuntime`.
- **Type system** in `core/types/`: interfaces and type guards. `PptxElement` is
  a discriminated union of 16 element types (`text`, `shape`, `connector`,
  `image`, `picture`, `table`, `chart`, `smartArt`, `ole`, `media`, `group`,
  `ink`, `contentPart`, `zoom`, `model3d`, `unknown`). Narrow with
  `element.type`.
- **Load pipeline**: ArrayBuffer -> JSZip -> parse XML (fast-xml-parser) ->
  resolve themes/masters/layouts -> `PptxData`. Legacy `.ppt` input goes through
  `core/ppt/` (`ppt-to-pptx.ts`), whose binary reading comes from ole2.
- **Save pipeline**: `PptxSlide[]` -> serialize elements to OpenXML -> rebuild
  rels/content types -> JSZip -> `Uint8Array`. Saving as `.ppt` uses
  `core/ppt/writer/` (model conversion here, record writers in ole2).
- **Theme resolution chain**: Element -> Placeholder -> Layout -> Master -> Theme.
- **Geometry engine** in `core/geometry/`: 187 OOXML preset shapes, clip paths,
  connector routing, guide formula evaluation.
- **Converter** in `converter/`: PPTX -> Markdown with registry-pattern dispatch
  per element type. **CLI** in `cli/`, **signature verification** (Node only)
  in `signature-node/`.
- **Tests and fixtures** in `__tests__/` (integration corpus, round-trip,
  `fixtures/e2e` snapshot).

### Viewer layer (this repo)

- **`ooxml-ui/pptx`** decides; bindings render. Shared exports pure
  decision functions and descriptors (`src/ui/src/pptx/render/`), the
  ribbon/dialog view models, i18n, export, the AI panel, and the three.js
  views.
- **React** (`packages/react/src/`): `PowerPointViewer` is the forwardRef
  orchestrator. Custom hooks coordinate state (`useViewerState`,
  `useEditorHistory`, `useEditorOperations`, `useLoadContent`,
  `useExportHandlers`, `usePresentationMode`); components render and wire
  interactions. The other four bindings mirror this structure in their own
  idiom.
- **CSS-based rendering** (not Canvas): slides render as scaled HTML/SVG with
  CSS transforms. Charts render as inline SVG, tables as HTML `<table>`,
  connectors and shapes use SVG `clip-path`.
- **Export** uses html2canvas-pro for rasterization (PNG/PDF/GIF/video).

## Key Conventions

- **Mixin pattern** (engine): runtime modules are `PptxHandlerRuntime*.ts`
  files in ooxml-core. Each handles one concern. New capabilities are added as
  new mixins.
- **Barrel exports**: every directory has `index.ts`. Import from barrels, not
  individual files.
- **Type narrowing**: always use the `type` discriminant for `PptxElement`, e.g.
  `if (element.type === "image")`.
- **EMU units**: PowerPoint uses English Metric Units internally. Conversion
  constants are in `src/core/pptx/core/constants.ts` (`EMU_PER_INCH =
  914400`, `EMU_PER_POINT = 12700`, `EMU_PER_PIXEL = 9525`).
- **Service interfaces**: services define `I*` interfaces for DI/testability.
- **File naming**: kebab-case for utilities, PascalCase for classes. Tests
  colocated with source (`.test.ts` suffix).
- **No `any`.** Use concrete types, `unknown` plus narrowing, or the `XmlObject`
  type (`src/core/pptx/core/types/common.ts`) for parsed XML.
- **File size: keep every source file <= 300 LOC.** No `.vue` / `.ts` / `.tsx`
  source file should exceed ~300 lines (tests excluded). When a file approaches
  the limit, **split it out** rather than letting it grow: extract pure logic into
  a focused module, lift sub-views into their own components, and group related
  helpers into their own files. A component SFC that declares its own `interface`s
  or non-trivial computation is a smell; that logic belongs in a composable or a
  shared module, leaving the SFC as thin presentation. Prefer many small,
  single-purpose files over one large one.
- **Share framework-agnostic logic; default to `ooxml-ui/pptx`.**
  (Rule 2 above; the extraction triggers are listed there.) The vast
  majority of each binding's code is _not_ framework-specific: geometry,
  style/colour/gradient resolution, text/paragraph/bullet building, chart/axis
  maths, connector routing, animation, OMML/LaTeX, export data, etc. All of that
  belongs in **`ooxml-ui/pptx`** (`src/ui/src/pptx/render/...`),
  consumed by every binding, or further down in the core when it is about the
  document model rather than its presentation. Only the actual view layer (SFC
  templates / JSX / Angular templates + the thin reactive wiring) should live in
  a binding. When porting or adding a feature, put the logic in shared **first**,
  then have each binding import it; do not reimplement it per framework.
  - **The shape to aim for is a pure decision function.** Shared exports a
    function returning a framework-neutral _descriptor_; the binding only maps
    that descriptor onto its own style object / template. Existing examples:
    `presentation-keymap` (`mapPresentationKey`), `connector-hit-target`,
    `hollow-shape-hit-test`, `shape-geometry-cascade`. Following that shape, a
    new branch reaches all five bindings at once.
  - **"I am making the same edit in N bindings" is the extraction signal.** Not
    a nuisance to push through: stop and extract. Small tails are the dangerous
    ones, because each copy looks trivial in isolation and nobody diffs five
    files that all look fine. The shape-geometry cascade was hand-ported five
    times, and Angular silently drifted: it compared `shapeType` **raw**
    (`=== 'ellipse'`) instead of via `getShapeType`, so `oval` - a preset in the
    shape picker - and every capitalised spelling missed the branch, and it had
    no connector/line/cylinder branch at all.
  - **Normalise before you branch.** Compare against `getShapeType(...)`, never
    a raw `shapeType` string: the normaliser folds aliases (`oval`->`ellipse`,
    `can`->`cylinder`) and lowercases. A raw compare is the single most common
    way a binding drifts.
  - **A shared value can be clobbered downstream.** Setting a property in a
    shared style map does not mean it survives: a binding may spread that map
    and then override the very property (Svelte's `ElementRenderer` re-sets
    `pointerEvents` from its own interactive flag). After adding a
    behaviour-bearing style in shared, grep each binding for that property.
  - **Per-binding unit tests passing does NOT mean the binding works.** All five
    suites were green while Svelte was still visibly broken, because the defect
    lived in template wiring no unit test covered. Load the deck in each demo
    and verify the actual behaviour (see the demo-resolution table above; Angular
    needs a build first).
- **UI changes must reach all five bindings.** (Rule 1 above; the required
  bug-fix loop is listed there.) This is a merge requirement, not
  a nice-to-have: a user on Svelte is entitled to the feature set a user on
  React gets, and divergence between bindings is the most expensive debt in this
  repo.
  - **A new UI feature** (ribbon control, dialog, inspector panel, context-menu
    entry, keyboard shortcut, gesture, on-canvas affordance) is not done when it
    works in React. Put the logic in `ooxml-ui/pptx`, then implement the
    view layer in **react, vue, angular, svelte, and vanilla**, with unit tests
    per binding and a framework-neutral spec in `e2e/pptx/`.
  - **A UI fix** must be checked against the other four bindings before it is
    called finished. Most UI bugs here are structural (they came from a shared
    module, or four bindings made the same porting mistake), so the same defect
    usually exists elsewhere. Fix every affected binding in the same change and
    add a regression test to each. If one is genuinely blocked, say so
    explicitly and file a tracking issue: silently fixing one binding is what
    causes the drift.
  - **Prefer fixing a UI bug in shared over fixing it five times.** When the
    buggy behaviour is decided by logic that could live in
    `src/ui/src/pptx/render/`, move it there as part of the fix so the
    correction lands once and cannot drift again. A bug you are about to patch
    in more than one binding is the strongest possible extraction signal.
  - "Genuinely framework-specific" means Angular change detection, Svelte 5
    runes, React effect ordering, and the like. A wrong colour, a mis-clipped
    shape, an off-by-one drag handle, or a dialog that does not open is almost
    never framework-specific.
  - See `CONTRIBUTING.md` (the parity rule + decision table) for the version
    external contributors are held to.
- **No em-dashes; use ASCII punctuation.** Never write the em-dash character
  (U+2014) anywhere: source, comments, JSDoc, docs/READMEs, commit
  messages, or UI copy. Use a colon, comma, semicolon, parentheses, or a
  spaced hyphen instead, whichever reads naturally. The only
  exception is functional UI/test content that intentionally renders or
  asserts that character (for example, a no-value marker or a placeholder
  option label). The pre-commit tooling does not catch em-dashes, so keeping
  them out is on you.
- **Lint and format before committing.** There is no pre-commit hook in this
  repository (pptx-viewer's husky hooks did not move), and the root `lint` and
  `fmt` skip `viewers/`. Run `bun run lint` here, including on `.vue` files,
  and `bunx oxfmt <the files you changed>`.
- **Adding an English i18n key requires every locale too.** New entries in
  `src/ui/src/pptx/i18n/translations-en.ts` need matching entries under
  `packages/locales/src/<locale>/`; `packages/locales/src/locales.test.ts`
  enforces that every locale covers every canonical key.

## Branching, commits and releases

The root [`AGENTS.md`](../../AGENTS.md) governs these: trunk-based development
on `main` (no feature branches unless asked), Conventional Commits, no em-dashes
and no AI chat share links anywhere, and automated per-package releases. What
is specific to this viewer:

- **Scope** a commit by the package it touches (`react`, `vue`, `angular`,
  `svelte`, `vanilla`, `shared`, `tools`, `locales`, `cli`), or `pptx` for
  the engine. Keep a commit within one package where practical: the release
  planner decides what to release from the **paths** a commit touches, and the
  type sets the bump (`feat` minor, `!` or `BREAKING CHANGE:` major, anything
  else patch).
- The packages keep their own `CHANGELOG.md`, prepend-only. Never regenerate one
  from tag history.
- `.github/` in this folder is the old repository's CI and release setup. It is
  inert here and kept for its history; the live workflows are at the root.

## Tech Stack

- **TypeScript** (strict; versions differ per package, see each `package.json`),
  **Bun** (package manager/runtime), **tsup/tsdown**, **Vite/Rollup**, and
  **ng-packagr** (package-specific build pipelines)
- **React 19** (React 18 supported via `react-compat`), **Framer Motion**,
  **Tailwind CSS 4**, **Lucide React**
- **Vitest** (testing), **Playwright** (e2e), **JSZip** + **fast-xml-parser**
  (in ooxml-core), **html2canvas-pro** + **jsPDF** (export)
- **oxfmt** (formatting), **oxlint** (linting): both from the [oxc](https://oxc.rs) toolchain

## Adding a New Element Type

Engine steps happen in `src/core/pptx/` at the repository root and can land in
the same change as the viewer steps.

1. Define the interface in `core/types/elements.ts` extending `PptxElementBase`.
2. Add it to the `PptxElement` discriminated union.
3. Add a type guard in `core/types/type-guards.ts`.
4. Add a parsing module in `core/core/runtime/`.
5. Add serialization in the `*SaveElementWriter.ts` modules.
6. Add a converter processor in `converter/elements/`.
7. Add framework-independent rendering logic in `src/ui/src/pptx/render/`,
   then wire renderers in all five bindings with per-binding and
   framework-neutral e2e coverage.
