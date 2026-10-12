# AGENTS.md

Guidance for coding agents (Claude Code, Codex, and others) working in this
repository. This file is canonical: `CLAUDE.md` only imports it, so edit this
file and never fork the two (the viewer repositories drifted that way once).

## READ FIRST: this repository is UI only

All Excel logic lives in the `xlsx` area of the published `ooxml-core` package
(source in the `ChristopherVR/ooxml` repository): the workbook model,
addresses, number formats, the formula parser and calculation engine, editing
commands with undo, DOM-free grid layout and cell views, conditional formats,
chart view models, the `.xlsx` reader and writer (`ooxml-core/xlsx`), and
format detection, the legacy `.xls` reader and CSV (`ooxml-core/xlsx/load`).
This repository holds the **UI**: the `<xlsx-editor>` web component, six
framework bindings, ribbon and dialog views, styling, locales, demos, browser
tests and the docs site.

Before writing code, decide where it belongs (see
[Where does my change go?](#where-does-my-change-go)). Never add, copy or fork
logic here that belongs in the core; if the core lacks something, change it
there, release it, and bump the range here. The web component only paints what
the core's layout functions return and routes input to the core's edit session.

### One editor, six thin bindings

There is **one** editor: the `<xlsx-editor>` web component, which lives in `ooxml-ui/xlsx` (ooxml repository, `src/ui/src/xlsx`); `packages/web-component` only re-exports it. The
bindings in `packages/bindings` (`react.tsx`, `vue.ts`, `angular.ts`, `solid.ts`,
`XlsxEditor.svelte`, and the framework-neutral `index.ts` that Vanilla and the
others build on) are lifecycle and event adapters only: they create the
element, forward props and options, call `load` when new bytes arrive, and
re-emit its events as callbacks.

- A behaviour bug (grid, ribbon, dialog, editing, rendering, keyboard) is fixed
  in `web-component`, once, and reaches all six bindings automatically.
- A binding-only bug is almost always prop, event or lifecycle wiring. When you
  fix one, grep the other adapters in `packages/bindings/src` for the same
  pattern and fix them in the same change; the binding contract tests in
  `packages/bindings/src/*.test.ts` and `packages/vanilla/src/index.test.ts`
  should cover all of them.
- Never put editor logic in an adapter. If two adapters need the same helper, it
  goes in `packages/bindings/src/index.ts` (or the web component);
  `packages/bindings/src/common.ts` is the re-export surface every package shares.

## Working agreements

- `mcp/` owns `xlsx-viewer-mcp`: schemas, MCP registration and its stdio CLI.
  It delegates headless workbook operations and filesystem execution to
  `ooxml-core/automation` and `/automation/node`. The combined `ooxml-mcp`
  server imports this package's `registerTools`; never duplicate document logic here.

- Published packages (the same model as docx-viewer and pptx-viewer):
  `@christophervr/xlsx-core` and one self-contained editor package per
  framework (`@christophervr/xlsx-react-viewer`, `xlsx-vue-viewer`,
  `xlsx-angular-viewer`, `xlsx-svelte-viewer`, `xlsx-solid-viewer`,
  `xlsx-vanilla-viewer`; vanilla also owns the plain `<xlsx-editor>` entry and
  `mountEditor`). Every framework package re-exports the model API
  (`createWorkbook`, `loadWorkbook`, `saveWorkbook`, ...) so an application
  needs one install.
- `web-component` (`xlsx-web-component`) and `bindings` (`xlsx-bindings`) are
  `private: true` internal packages, bundled into every framework package by
  `scripts/build-packages.mjs`. A published tarball may import only
  `@christophervr/xlsx-core`, `ooxml-core`, `ooxml-ui` and its framework peer;
  `bun run check:published` and `bun run pack:smoke` enforce it.
- `@christophervr/xlsx-core` (`packages/core`) is only a thin re-export of
  `ooxml-core/xlsx` (entry `.`) and `ooxml-core/xlsx/load` (entry `./load`);
  `bun run check:shared` keeps it logic-free. The main entry never pulls in the
  legacy `.xls` reader.
- `ooxml-ui` (the shared `office-ui-*` custom elements) is a real registry
  dependency of every framework package, never bundled. Its element tag names
  keep the `office-ui-` prefix.
- `ole2` (legacy compound-file codecs) reaches this repository only through
  `ooxml-core/xlsx/load`, which inlines it. Never add `@christophervr/ole2` or an
  internal package to a manifest here, and never fork its code.
- The browser text measurer (column auto-fit, overflow) stays in
  `packages/web-component` and is injected into the core's layout functions; it
  is the one piece of layout that needs a DOM.
- Unsupported workbook features must be reported honestly (for example pivot
  tables and sparklines are preserved but not shown, charts are display-only).
  Never claim Excel parity or lossless export.
- Bun, TypeScript strict mode (with `exactOptionalPropertyTypes` and
  `noUncheckedIndexedAccess`, no `any`), Vitest (tests next to the code) and
  Playwright browser tests (`e2e/xlsx/*.spec.ts`). Keep source modules under 300
  lines where practical. Add regression tests for editing, rendering and binding
  contracts; parsing, calculation and round-trip tests belong in the core.
- The workbook fixtures used by the browser specs live in `e2e/xlsx/support` and
  `demos/xlsx/demo-vanilla/public/sample.xlsx`; their generators are
  `scripts/sample-workbook.py` and `scripts/sample-workbook-excel.ps1`.

## Packages

| Directory                | npm name                           | Published | What it is                                                                    |
| ------------------------ | ---------------------------------- | --------- | ----------------------------------------------------------------------------- |
| `packages/core`          | `@christophervr/xlsx-core`         | yes       | Re-export of `ooxml-core/xlsx` and `/xlsx/load`.                              |
| `packages/web-component` | `xlsx-web-component`               | internal  | One-line re-export of `ooxml-ui/xlsx`, the `<xlsx-editor>` element.           |
| `packages/bindings`      | `xlsx-bindings`                    | internal  | Framework adapters over one framework-neutral core (`index.ts`, `common.ts`). |
| `packages/react`         | `@christophervr/xlsx-react-viewer` | yes       | React entry (`SpreadsheetEditor`).                                            |
| `packages/vue`           | `xlsx-vue-viewer`                  | yes       | Vue 3 entry (`SpreadsheetEditor`).                                            |
| `packages/angular`       | `xlsx-angular-viewer`              | yes       | Angular entry (`SpreadsheetEditorComponent`).                                 |
| `packages/svelte`        | `xlsx-svelte-viewer`               | yes       | Svelte 5 entry (`/runtime`, `mountEditor`).                                   |
| `packages/solid`         | `xlsx-solid-viewer`                | yes       | Solid entry (`SpreadsheetEditor`).                                            |
| `packages/vanilla`       | `xlsx-vanilla-viewer`              | yes       | Plain `<xlsx-editor>` registration and `mountEditor`.                         |

`demos/xlsx/demo-vanilla` is the single demo app; `?framework=<name>` mounts the
editor through that framework's adapter (`demos/xlsx/demo-vanilla/framework.ts`), and
the browser tests run against its production build.

## Where things live

Repositories are named by their GitHub name under `ChristopherVR/`. Where each
one is checked out on a given machine is local knowledge: keep it in an
untracked `CLAUDE.local.md` (git-ignored), never in this file.

| Repository           | npm package                                     | Owns                                                                                                                     |
| -------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `xlsx-viewer` (this) | `@christophervr/xlsx-core`, the six `*-viewer`s | Excel UI: the `<xlsx-editor>` web component, six bindings, demos, browser tests and the docs site.                       |
| `ooxml`              | `ooxml-core`, `ooxml-ui`                        | **All OOXML logic** by area (`xlsx`, `docx`, `pptx`, `xml`, `opc`, `collab`, ...) and the shared `office-ui-*` elements. |
| `docx-viewer`        | `docx-core`, `docx-*-viewer`                    | Word UI over `ooxml-core/docx`; the structure this repository mirrors.                                                   |
| `pptx-viewer`        | `pptx-*-viewer`, `pptx-viewer-core`             | PowerPoint UI over `ooxml-core/pptx`.                                                                                    |
| `ole2`               | `@christophervr/ole2`                           | Legacy binary formats (XLS, DOC, PPT, CFB, RC4/MD4), inlined into `ooxml-core`.                                          |

This repository depends on the **published** `ooxml-core` and `ooxml-ui`. To
try a core change before it is released, build the `ooxml` checkout
(`bun run build`), point `packages/core` (and whichever package needs it) at it
with a `file:` dependency, run `bun install --force`, and restore the version
ranges before committing.

### Where does my change go?

| The change is about...                                                                | Make it in                                          |
| ------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Parsing, the workbook model, saving or round-trip loss                                | `src/core/xlsx/` in `ooxml`, with a round-trip test |
| Formulas, functions, recalculation, number formats, editing commands, undo            | `ooxml` (`xlsx/formula`, `numfmt`, `edit`)          |
| Grid metrics, cell views, conditional formats, chart view models, keyboard navigation | `ooxml` (`xlsx/layout`)                             |
| `.xls` loading, CSV, format detection                                                 | `ooxml` (`xlsx/load`)                               |
| A control shared by Excel, Word and PowerPoint (shared ribbon controls, dialogs)      | `ooxml-ui` in `ooxml` (`src/ui`)                    |
| `.xls` / `.doc` / `.ppt` binary codecs, CFB containers                                | `ole2`                                              |
| Ribbon, dialogs, panels, painting the grid, input handling, styling, locales          | `src/ui/src/xlsx` in the ooxml repository           |
| Framework wiring (props, events, lifecycle)                                           | `packages/bindings` here (all adapters at once)     |
| Demos, docs site, browser tests, packaging and release scripts                        | here                                                |

### GitHub Pages

`https://christophervr.github.io/ooxml/xlsx/` is the docs site (VitePress in
`docs/`), deployed by `.github/workflows/docs.yml` on pushes to `main` that touch
`docs/`, `demos/`, `packages/` or the build. `scripts/build-pages.mjs` also
builds the demo once per framework at `/demo/` (React), `/demo-vue/`,
`/demo-angular/`, `/demo-vanilla/`, `/demo-svelte/` and `/demo-solid/`. The
Office-suite launcher at `https://christophervr.github.io/ooxml/` embeds those
URLs, so a renamed demo route must be renamed there too. The demo follows the
VitePress `vitepress-theme-appearance` key in `localStorage`.

## Commands

```bash
bun install
bun run typecheck        # tsc + svelte-check
bun run test             # vitest (unit and binding contract tests)
bun run test:browser     # Playwright against the built demo (PLAYWRIGHT_PORT, default 4180)
bun run test:scripts     # release planner, publish guards, commit checks
bun run demo             # demo dev server (add ?framework=react|vue|angular|svelte|solid)
bun run build            # production build of the demo
bun run build:packages   # build the seven publishable packages into packages/*/dist
bun run check:published  # tarballs import only allowed packages
bun run pack:smoke       # pack, install into a clean consumer, load .xlsx and .xls through every package
bun run check:shared     # @christophervr/xlsx-core stays a logic-free re-export; package classification
bun run release:plan     # dry-run the release planner
bun run fmt              # oxfmt (tabs, single quotes, width 100)
```

The docs site installs separately: `cd docs && bun install && bun run docs:build`.

## Releasing

Releases are automated from conventional commits, exactly like docx-viewer,
pptx-viewer and `ooxml`; `docs/releasing.md` has the whole flow.

- `scripts/release-plan.mjs` versions each published package from the commits
  since its own `<npm-name>@<version>` tag (for example
  `@christophervr/xlsx-core@0.1.0` or `xlsx-vue-viewer@0.1.0`). A change in
  `web-component` or `bindings` releases all six framework packages; an
  `@christophervr/xlsx-core` release re-releases them too.
- `.github/workflows/release.yml` runs hourly: it bumps versions, writes the
  changelogs, commits `chore(release): ... [skip ci]` to `main`, creates the tag
  and a **GitHub release** per package, prunes superseded releases, and
  publishes to npm through trusted publishing (OIDC, provenance, no token). It
  needs the `NPM_PUBLISH=true` repository variable and the `npm` environment.
- Never run `npm publish` or push release tags by hand; a missed publish is
  re-run with `gh workflow run release.yml -f tag=<npm-name>@<version>`.

## Branching and git workflow

This repository uses **trunk-based development**: commit directly to `main`.
**Do not create feature branches unless the user explicitly asks for one**;
this overrides any default "branch before committing" assumption. Keep each
commit small and releasable, since every push to `main` can be released by the
next hourly run. Run the local checks CI runs (typecheck, unit, script and
browser tests, `build:packages`, `check:published`, `pack:smoke`) before
pushing; do not push untested code to `main`.

> The working tree is sometimes shared by parallel agent sessions, and another
> session may switch the checkout underneath you. Before committing, run
> `git branch --show-current` and `git status`. `git fetch && git rebase
> origin/main` before pushing (the release workflow pushes to `main` too). To
> land work without moving a shared checkout, push `HEAD:main` (or use an
> isolated `git worktree`) rather than `git checkout main`.

## Commit conventions

Commits **must** follow [Conventional Commits](https://www.conventionalcommits.org);
`CONTRIBUTING.md` has the full rules and `scripts/check-conventional-commits.mjs`
enforces them. The format is load-bearing: the type sets the version bump
(`feat` minor, `!` or `BREAKING CHANGE:` major, anything else patch), and the
**paths** a commit touches decide which packages release (tests, docs, demos
and CI never release anything).

- Scope is the package or area: `core`, `web-component`, `bindings`, `react`,
  `vue`, `angular`, `svelte`, `solid`, `vanilla`, `demo`, `release`, `ci`,
  `deps`, `docs`.
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
- Formatting is `oxfmt`; run `bun run fmt` before committing.
- Record extraction provenance (source repository, path, commit) when code moves
  between repositories.
