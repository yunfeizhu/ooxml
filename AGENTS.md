# AGENTS.md

Guidance for coding agents (Claude Code, Codex, and others) working in this
repository. This file is canonical: `CLAUDE.md` only imports it, so edit this
file and never fork the two (the viewer repositories drifted that way once).

## Working agreements

- `mcp/` owns the `ooxml-mcp` combined server. Each viewer owns its
  standalone MCP package, transport schemas and registration. PowerPoint document-tool
  schemas live with their operations in `src/core/pptx/automation/schemas`. The combined server composes
  those registrations without duplicating tools. Shared headless document operations
  and filesystem execution live in `src/core/automation/`; all format logic stays in core.

- The repository root is a private Bun workspace root (scripts, CI, docs, `site/`); the library is the workspace package `src/core` (manifest, tsconfigs, bundler configs and build scripts live there) and `src/ui` is `ooxml-ui`. The root `bun run` scripts delegate to `src/core`.
- This repository is the **single published package `ooxml-core`**. It owns **all the logic** of the Office products: OOXML (ECMA-376 / ISO 29500) packaging, XML, WordprocessingML, PresentationML and SpreadsheetML models, parsing and serialization, DrawingML, charts, diagrams (SmartArt), maths, geometry, layout, editing commands, validation, and collaboration (Yjs and the sync protocol). It is a sibling of `ole2`.
- The viewers (`viewers/pptx`, `viewers/docx`, `viewers/xlsx`, `viewers/visio` and `viewers/teams`) own **only the framework bindings** (hooks, wrappers, framework state), demos, end-to-end tests and docs sites. Logic lives in `src/<area>/`; the product editors' DOM code (the custom elements, ribbons, dialogs, grids) lives in `src/ui/src/<product>/` and ships as the `ooxml-ui/<product>` subpath (today `ooxml-ui/pptx`, `ooxml-ui/xlsx`, `ooxml-ui/docx` and `ooxml-ui/visio`, the editor and viewer elements moved verbatim from their repositories; `<teams-app>` lives in `ooxml-ui/teams`). Those product editors are imperative custom elements, not Lit classes, and keep their own `?raw` CSS; the Lit rule below applies to the shared primitives. DOM-free pieces of a product editor move on to `src/<area>/` over time. Viewers consume this package and must not keep, copy or fork logic that belongs here. PowerPoint shared rendering now lives in `src/ui/src/pptx`; its private shared package is a compatibility facade.
- `ole2` owns the legacy compound-file and binary formats (DOC, XLS, PPT, CFB, RC4/MD4). Never move modern OOXML into `ole2`, and never move binary codecs here. The encrypted-package container is CFB (ole2); the encryption primitives are modern OOXML (here).
- One shared XML model and one structure for every Office type. Parsers and writers are written once against it; type-specific code lives in its own area (`docx`, `pptx`, `xlsx`) of this package, shared code in `xml`, `opc`, `drawingml`, `chart`, `diagram`, and so on.
- Before adding logic, search the existing core areas and shared UI for a reusable implementation. Reuse or extend it first; extract repeated product logic into one shared product helper, and format-neutral logic into the appropriate shared area. Review new helpers and imports for duplication before committing.
- Layout: `src/core/<area>/` with its own `index.ts`; each area is a subpath export (`ooxml-core/xml`) and the root entry groups them by namespace. Do not add a second logic package; add an area. The one exception is `src/ui`: it is not an area but the separate, DOM-only `ooxml-ui` package (see `docs/ooxml-ui-plan.md`), a Bun workspace that sits in this tree. Core never imports it, and the core's tsconfig, vitest, release planner (`exclude` in `scripts/release-plan.mjs`) and CI planner all treat `src/ui` as outside the core, so a change there never releases or tests `ooxml-core`.
- `viewers/` holds the `pptx`, `docx`, `xlsx`, `visio` and `teams` viewer repositories, imported with
  their history and release tags (the `pptx-viewer` repository now holds only a pointer here). Each
  keeps its own scripts, docs and changelogs; its `.github/` folder is inert here. Their packages, MCP
  servers and docs are members of the root workspace (one `bun install`, one lockfile), but the root
  `typecheck`, `test`, `fmt` and `lint` skip them: CI runs each viewer's own checks (`VIEWERS` in
  `scripts/ci-plan.mjs`), the release flow publishes their packages (`scripts/viewer-packages.mjs`) and
  the Pages build includes their sites (`scripts/build-pages.mjs`).
- `demos/<product>/` (`pptx`, `docx`, `xlsx`, `visio`, `teams`) holds the demo apps of the viewers, at the root. Each is a private workspace package declaring what its own files import (pptx has one package per framework demo, `demos/pptx/demo-*`, plus `demos/pptx` for the files they share); the demo is built and served by its viewer's scripts and vite config (`viewers/<product>`), so a viewer's `package.json` still owns `build`, `demo` and `test:browser`. A change under `demos/<product>/` checks that viewer in CI (`scripts/ci-plan.mjs`), and the Pages build reads it.
- `e2e/<product>/` (`pptx`, `docx`, `xlsx`, `visio`, `teams`) holds the Playwright browser tests and their fixtures, at the root. Each is a private workspace package declaring what its specs import (all but pptx also have a `tsconfig.json` extending the viewer's). Playwright is still configured and run from the viewer (`cd viewers/<product> && bun run test:browser`, `bun run e2e` for pptx), whose config points `testDir` here. The pptx browser suite is large, so CI runs it in its own jobs split by framework and shard (`pptx-*` in `.github/workflows/ci.yml`).
- `apps/office-suite/` is the private `ooxml-office` application package: document sessions, shared profile/theme, Teams integration and assistant wiring. It consumes existing core and UI packages, never duplicates Office parsing or editing logic. `site/` supplies its HTML/CSS shell. `scripts/build-suite.mjs` bundles `suite-dist/` with suite and standalone PWA entry points; desktop consumes the same output. GitHub Pages also includes the viewers' independent docs and demos.
- Bun, TypeScript strict (including `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`), Vitest with tests next to the code, ESM output (add CJS when a consumer needs it).
- Vitest shares workers across test files (`isolate: false` in `src/core`, `src/ui` and the `viewers/pptx` binding packages, see its `AGENTS.md`), which is most of the speed. Files that call `vi.mock` or are named `*ssr.test.ts` are found by content and run in their own `*-isolated` project, so they need no registration. Tests must clean up what they change: never leave global or prototype mutations behind (unstub globals, restore spies), since the next file in the worker sees them.
- Keep source modules under 300 lines where practical. Add regression tests for parsing, preservation, round-trip and editing behaviour; move tests with the code they cover.
- Unsupported features must be reported honestly. Never claim Office parity or lossless export without evidence.
- Record extraction provenance (source repository, path, commit, what changed) in `PROVENANCE.md` for every module moved here.
- Releases are automated from conventional commits: `scripts/release-plan.mjs` versions the package from the commits since its last `ooxml-core@<version>` tag, and `.github/workflows/release.yml` tags, writes the changelog and publishes via npm trusted publishing (OIDC, provenance, no token). See `docs/releasing.md`. Never run `npm publish` or push release tags by hand; no commits to published history; never publish fixtures or stale output.
- Status: areas `units`, `color`, `geometry`, `xml`, `opc`, `drawingml`, `diagram`, `docx`, `xlsx`, `collab`, `digest`, `crypto`, `chart`, `math`, `text`, `i18n`, `ribbon`, `visio`, `teams` and `automation` are populated (`crypto` is the format-neutral ECMA-376 package encryption every format's loader uses, with the CFB container inlined from ole2 and kept out of the root entry; `digest` holds every synchronous message digest and the agile password spin that protection and verifier elements use; `opc/signature` holds signature detection and stripping; `drawingml` holds the format-neutral colour, fill, text-body and geometry readers, the colour and fill writers and the theme model (docx and xlsx read their themes through it; the line and effect models, the format scheme and the pptx codecs are still in pptx); `diagram` is the format-neutral SmartArt part model; `chart` holds the format-neutral chart algorithms and formatting helpers; `math` converts LaTeX and OMML; `text` holds shared text rules such as tab leaders and script detection; `i18n` holds locale normalisation, dictionary merging and the translator every product UI uses; `ribbon` holds the DOM-free ribbon contracts every product and binding shares, today the add-in tab descriptor a host uses to add its own tabs; `visio` is the Visio package model and geometry; `teams` is the workspace logic described below; `automation` is the shared headless document operations; see `docs/structure-plan.md` and `docs/agnostic-core-plan.md` for the migration order of the rest of `drawingml`, `chart` and the diagram code). `docx-core` is a thin re-export of `ooxml-core/docx` (and `/docx/embedded`), and `@christophervr/xlsx-core` of `ooxml-core/xlsx` (and `/xlsx/load`); thin viewer-side packages reference only their own area.
- The `xlsx` area is strict. Its modules: `model.ts` and helpers, `numfmt/`, `formula/`, `read/`, `write/`, `edit/`, `layout/` (the DOM-free view logic the Excel UI paints: grid metrics, colours, cell views, conditional formats, navigation, chart SVG), and `load/` (the `ooxml-core/xlsx/load` subpath: format detection, legacy `.xls` through ole2's `readXlsWorkbook`, CSV), and `collab/` (the `ooxml-core/xlsx/collab` subpath: the Yjs workbook mapping and the edit-session binding, see `docs/collab-area.md`). The main `xlsx` entry never imports ole2. Document properties (core, app, custom) go through the shared `opc/properties` model; SmartArt frames load through `diagram` (`read/smart-art.ts`) and are saved verbatim. Fixtures and their generators (openpyxl and Excel COM) live in `src/core/xlsx/__fixtures__/`; `scripts/xlsx-excel-acceptance.ps1` (Windows, real Excel, manual) checks that saved workbooks open without repair.
- **The `pptx` area is compiled with relaxed flags (temporary).** It was moved from the PowerPoint viewer and predates this repository's strict settings. `tsconfig.pptx.json` (also read by the bundlers, so it still lists `pptx/ui`) extends the base but turns off `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` and `noImplicitOverride`; `src/core/pptx` is excluded from the strict base project (`tsconfig.json` lists each relaxed subdirectory; `tsconfig.build.json` excludes it whole) except `src/core/pptx/ui`, which already compiles strict. `cli` and `smartart-layouts` stay relaxed because strict compilation follows their imports into `pptx/core`. `bun run typecheck` runs both. Tighten the pptx flags gradually, one directory at a time; new code elsewhere stays strict, and code moved out of `src/core/pptx` into a shared area must compile under the strict project.
- The pptx area is bundled with tsup (ESM `.mjs` + CJS `.cjs`, legacy codecs from `@christophervr/ole2` inlined) and declarations from tsdown (`bun run build` runs the tsc declarations, both tsup bundles and the tsdown declarations in parallel via `scripts/build.mjs`; `prepack` only builds when `dist` is missing). Its subpaths are `./pptx`, `./pptx/converter`, `./pptx/cli`, `./pptx/signature-node`; the root entry does not re-export it, so importing another area never pulls the pptx bundle into the strict project. The pptx area keeps its own XML model (`fast-xml-parser` object trees); unifying it with the shared `xml` area is the next step.
- pptx tests read decks from `src/core/pptx/__tests__/fixtures`, including a committed snapshot of `e2e/pptx/fixtures` under `fixtures/e2e` (the generator scripts are in `viewers/pptx/scripts`). Core tests never read from `viewers/`. The viewer's Playwright setup regenerates its own copies; refresh the snapshot here deliberately, never automatically.
- `teams` is the logic of the open-source, bring-your-own-server team workspace (channels and chat on Yjs, presence, WebRTC calls with pluggable signaling, server configuration and the `createTeamsClient` store every UI binds to). It is built on `collab`, DOM-free and format-neutral. Its visual primitives are Lit elements in `src/ui/src/teams`; the app (`<teams-app>`), its framework bindings and the reference server live in `viewers/teams`. See `docs/teams-area.md`.
- Every element in `src/ui` is a Lit class on `OfficeElement` (`src/ui/src/base.ts`): a `<name>.ts` with `declare`d properties and a `render()` template next to a real `<name>.css` (imported `?raw`, bare `var(--office-x)` tokens), grouped in a folder per kind (`form`, `ribbon`, `menu`, `dialog`, `notices`, `chrome`, `presence`, `smartart`, `teams`). Products subclass these elements, so read the "How the elements are built" section of `src/ui/README.md` before changing base behaviour: updates are synchronous, `textContent` of text elements is exact (the formatter runs in strict whitespace mode there), and a constructor never assigns an overridable accessor.
- `collab` is the format-neutral collaboration area (Yjs, `y-protocols` and `lib0` are real dependencies). It must stay free of DOM, UI frameworks, ProseMirror and product document mapping: products implement `DocumentAdapter` and keep their model-to-Yjs code in the viewers until it moves into the product area. See `docs/collab-area.md`.

## Working on a viewer

The viewers ship one product to several frameworks, and almost every expensive bug in pptx-viewer's
history came from breaking one of the rules below. They apply to every viewer here; each viewer's
own `AGENTS.md` (`viewers/<name>/AGENTS.md`, read it before working there) has the details, and
`viewers/pptx/AGENTS.md` keeps the concrete failures behind them.

- **A fix or feature in one binding reaches all of them.** The bindings are ports of each other, so a
  bug fixed in React is almost always present in the others. Find the root cause, grep every other
  binding for the same pattern, fix them all in the same change, and add a regression test per
  binding plus a framework-neutral browser spec when a demo can show it. If one binding is genuinely
  blocked, say so and file an issue; silently fixing one is how bindings drift. "Framework-specific"
  means change detection, runes, effect ordering and the like, not a wrong colour or a dialog that
  does not open.
- **Office logic goes to the core, view behaviour to the viewer's shared layer.** Document, chart,
  colour, geometry and text algorithms belong in `src/core/<area>/`. Decisions every binding needs
  belong in the viewer's framework-free layer (for pptx, `src/ui/src/pptx/render/`) as a
  pure function returning a descriptor the binding only maps onto its template. Making the same edit
  in more than one binding, or finding a framework-free helper inside a binding, is the signal to
  extract it.
- **Normalise before you branch** (compare a shape through `getShapeType`, never the raw `shapeType`
  string), and after adding a behaviour-bearing style in shared code, check that no binding spreads
  and then overrides it.
- **Unit tests passing does not mean a binding works.** Load the change in each framework demo. Know
  how each demo resolves its packages (some read a package's `dist`, so a source edit is invisible
  until that package is built), and suspect stale Vite caches (`node_modules/.vite`) and zombie dev
  servers before your code when one demo disagrees with the others.
- **Declare what you import.** The workspace uses Bun's isolated linker, so a package (a demo, a test
  package, a script's package) sees only its declared dependencies. An import that only worked
  because a parent folder's `node_modules` had it fails here.
- **Every English UI string needs every locale.** A key added to a viewer's English dictionary needs
  an entry in each locale; the locale tests enforce it.
- **Browser tests that crash hosted runners** are tagged `@local-only` and excluded in CI; run them
  yourself (`bun run e2e:local-only` in `viewers/pptx`) before pushing a change to what they cover.

## Where things live

Repositories are named by their GitHub name under `ChristopherVR/`. Where each
one is checked out on a given machine is local knowledge: keep it in an
untracked `CLAUDE.local.md` (git-ignored), never in this file.

| Repository         | npm package                                                                               | Owns                                                                                                                                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ooxml` (this one) | `ooxml-core`, `ooxml-ui`, and every package of `viewers/*`                                | **All OOXML logic**, by area under `src/core/`, the DOM-only `src/ui`, the Office-suite launcher in `site/`, and the pptx, docx, xlsx, visio and teams viewers under `viewers/` (see below).    |
| `docx-viewer`      | `docx-core`, `docx-<framework>-viewer`                                                    | Word UI: the `<docx-editor>` web component and six bindings (react, vue, angular, svelte, solid, vanilla), demos, browser tests and the docs site. Consumes `src/core/docx` from here.          |
| `xlsx-viewer`      | `@christophervr/xlsx-core`, `@christophervr/xlsx-react-viewer`, `xlsx-<framework>-viewer` | Excel UI: the `<xlsx-editor>` web component and six bindings, demos, browser tests and the docs site. Consumes `src/core/xlsx` from here.                                                       |
| `teams-viewer`     | `openteams-<framework>-viewer`, `openteams-server`                                        | Team-workspace UI: `<teams-app>`, bindings (react, vue, solid, svelte, angular, vanilla) with raw hooks, the reference BYO server, demos. Consumes `ooxml-core/teams` and `ooxml-ui` from here. |
| `ole2`             | `@christophervr/ole2`                                                                     | Legacy binary formats (CFB, DOC, XLS, PPT, RC4/MD4). A pinned dev dependency here whose codecs are inlined into the bundles.                                                                    |
| `emf-converter`    | `emf-converter`                                                                           | EMF/WMF rendering.                                                                                                                                                                              |
| `mtx-decompressor` | `mtx-decompressor`                                                                        | MicroType Express (embedded EOT font) decompression.                                                                                                                                            |

The repository was renamed from `ooxml-core` to `ooxml`, and the packages
from `@christophervr/ooxml-core` and `@christophervr/office-ui` to the unscoped
`ooxml-core` and `ooxml-ui` (tags `ooxml-core@<version>` and
`ooxml-ui@<version>`). The `office-ui-*` custom element tags and the
`office-ui.web-control-contract` symbol are public API and keep their names.

The viewers in `viewers/` are released by this repository's own flow, so nothing syncs them; the former
`pptx-viewer` repository holds only a pointer here. The reusable `.github/workflows/sync-ooxml.yml` and
`bun run fleet` remain for any repository that consumes this one from the outside (none today). A
breaking change here breaks the in-repo viewers' CI at once; make it deliberately and note it in the
commit.

The viewers depend on the **published** version of this package, but never wait for a release
to work on them. From this checkout, `node scripts/link-local.mjs <viewer dir>` builds core and ui and
points the viewer's manifests at them (`file:`), then `bun install --force` there; the same command
with `--restore` puts the ranges back (the original ranges are kept in `.ooxml-link.json`). Restore
before committing: `check:published` and the sync workflow both reject `file:` ranges. A viewer
change may rely on something not released yet only if it also works on the last release (register
what you need yourself, as docx does for the title bar's search field). Commits to another repository
follow that repository's own `AGENTS.md`.

A change that needs both this package and a viewer lands here first, is released, and only then
lands in the viewer; see `docs/linked-changes.md` for the order and how to link the two pull requests.

### Where does my change go?

| The change is about...                                                                   | Make it in                                                         |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Parsing, the document model, editing commands, saving or round-trip loss (any format)    | `src/core/<format>/` here, with a round-trip test                  |
| Units, colour, geometry, XML, OPC, SmartArt or collaboration shared by formats           | the shared area here (`units`, `color`, `geometry`, `xml`, ...)    |
| `.doc` / `.xls` / `.ppt` binary codecs, CFB containers, RC4                              | `ole2`                                                             |
| How a correctly parsed element is drawn or laid out in the PowerPoint UI                 | `src/ui/src/pptx`                                                  |
| How a spreadsheet is laid out for painting (grid sizes, colours, cell views, CF, charts) | `src/core/xlsx/layout/` here (the Excel UI only paints it)         |
| Ribbons, dialogs, framework wiring, styling, demos, browser tests                        | the viewer under `viewers/` (and `demos/`, `e2e/`)                 |
| The launcher page at christophervr.github.io/ooxml                                       | `apps/office-suite/` for application wiring; `site/` for the shell |

### GitHub Pages

- `https://christophervr.github.io/ooxml/` serves the integrated Office app. Standalone installable apps live under `/ooxml/apps/{word,excel,powerpoint,visio,teams}/`.
- Viewers retain their docs and framework demos under `/ooxml/{docx,xlsx,pptx,visio,teams}/`.
- Suite appearance uses `ooxml-suite-theme`, with editor API adapters and root tokens for floating PowerPoint dialogs. The suite and standalone applications share profile-scoped IndexedDB and cross-tab theme preferences on the same origin. Demo theme keys remain independent.

## Commands

```bash
bun install
bun run typecheck      # strict project and the relaxed pptx project
bun run test           # vitest (CI splits it: bun run test --shard=1/6; add --maxWorkers=8 on a big machine)
bun run build          # declarations, tsup bundles, tsdown declarations
bun run test:package   # pack and import every entry point from a clean install
bun run test:scripts   # release planner, publish guards, commit checks
bun run fmt            # oxfmt (tabs, single quotes, width 100)
```

Build with `bun run build:suite`, then preview with `bun run preview:suite` (default port 8123). The app mounts the real editors directly. No demo iframes are used.

## Before pushing

Unit tests in the folder you changed are not what CI runs. Every one of these slipped through once:

- **Run `bun run verify`** before every push. It asks the CI planner (`scripts/ci-plan.mjs`) what
  the commits not yet on `origin/main` reach and runs that locally: lint, the formatter on changed
  files, the typechecks, the affected core and `ooxml-ui` tests and each touched viewer's own checks
  (its typecheck and `fmt:check` included). Browser suites and packaging are skipped; add
  `--browser` for the browser suites of what you touched, `--full` for everything. Steps run with
  `CI=1`, so Vitest fails on a missing snapshot instead of writing one.
- **Verify and push from your own worktree**, never the shared checkout: `verify` refuses
  uncommitted changes, and another session's commits or half-edited files must not be tested or
  pushed with yours. Push with `git push origin HEAD:main`.
- **Parallel agents each take their own worktree and port** (`PLAYWRIGHT_PORT` for the viewers'
  browser suites), or their servers and timeouts collide and real failures hide among flaky ones.
- **Integrate, verify once, push once.** Each push to `main` cancels the CI run before it, so a
  string of quick pushes leaves every run but the last unfinished.
- **Use CI's Bun** (`bun-version` in `.github/actions/setup/action.yml`); another version writes a
  different `bun.lock`. `verify` warns when they differ.

A maintainer can run it automatically with a local, uncommitted hook in
`$(git rev-parse --git-common-dir)/hooks/pre-push` that calls `node scripts/verify.mjs`;
`git push --no-verify` skips it once.

## Branching and git workflow

This repository uses **trunk-based development**: commit directly to `main`.
**Do not create feature branches unless the user explicitly asks for one**;
this overrides any default "branch before committing" assumption. Keep each
commit small and releasable, since every push to `main` can be released by the
next scheduled run.

> The working tree is sometimes shared by parallel agent sessions, and another
> session may switch the checkout underneath you. Before committing, run
> `git branch --show-current` and `git status`. To land work on `main` without
> moving a shared checkout, push `HEAD:main` (or use an isolated
> `git worktree`) rather than `git checkout main`.

## Commit conventions

Commits **must** follow [Conventional Commits](https://www.conventionalcommits.org);
`CONTRIBUTING.md` has the full rules and `scripts/check-conventional-commits.mjs`
enforces them on pull requests. The format is load-bearing: the type sets the
version bump (`feat` minor, `!` or `BREAKING CHANGE:` major, anything else
patch), and the **paths** a commit touches decide whether it releases at all
(only published files under `src/`, the bundler configs, the manifest's
shipping fields and the licence files do; `site/`, docs, tests and CI never do).

- Scope is the area: `units`, `color`, `geometry`, `xml`, `opc`, `docx`,
  `pptx`, `xlsx`, `visio`, `drawingml`, `chart`, `math`, `text`, `i18n`, `ribbon`, `teams`,
  `automation`, `collab`, `ui`, `site`, `ci`, `deps`, `docs`.
- Subject: imperative, lower-case, no trailing period, header at most 72
  characters.
- Write multi-line messages with a real heredoc or `git commit -F <file>`;
  never wrap them in a PowerShell here-string under bash, where the stray `@`
  leaks into the subject.
- Never add a Codex co-author trailer. Never include an
  AI chat share link in a commit, PR, changelog, comment or doc.

## Style

- **No em-dashes.** Never write U+2014 in source, comments, docs, commit
  messages or UI copy; use a colon, comma, semicolon, parentheses or a spaced
  hyphen. The only exception is content that intentionally renders or asserts
  that character.
- Use extensionless relative imports in bundled TypeScript source. Keep extensions for JavaScript runtime scripts, package subpaths and actual asset/worker URLs.
- Formatting is `oxfmt`; run `bun run fmt` before committing.

### PowerPoint shared UI

The framework-independent PowerPoint renderer and web components live in
`src/ui/src/pptx` and are published through `ooxml-ui/pptx`. The viewer shared
package is a compatibility facade. DOM-free document operations and tool
schemas live in `src/core/pptx/editor` and `src/core/pptx/automation/schemas`.
The migrated product UI has a separate legacy compiler project; never weaken
the strict shared UI project to accommodate it. See `docs/pptx-shared-migration.md`.
