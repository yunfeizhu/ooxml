<div align="center">

# xlsx-viewer

[![npm version](https://img.shields.io/npm/v/%40christophervr%2Fxlsx-react-viewer.svg)](https://www.npmjs.com/package/@christophervr/xlsx-react-viewer)
[![license](https://img.shields.io/npm/l/%40christophervr%2Fxlsx-react-viewer.svg)](https://github.com/ChristopherVR/ooxml/blob/main/viewers/xlsx/LICENSE)
[![types](https://img.shields.io/npm/types/%40christophervr%2Fxlsx-react-viewer.svg)](https://www.npmjs.com/package/@christophervr/xlsx-react-viewer)

**A browser Excel spreadsheet editor with one workbook model, one web component and thin adapters for your framework.**
An early implementation: not Microsoft Excel parity, and not lossless export.

[![docs](https://img.shields.io/badge/docs-christophervr.github.io-1f9d63.svg)](https://christophervr.github.io/ooxml/xlsx/)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![CI](https://github.com/ChristopherVR/ooxml/actions/workflows/ci.yml/badge.svg)](https://github.com/ChristopherVR/ooxml/actions/workflows/ci.yml)

[**Live demo**](https://christophervr.github.io/ooxml/xlsx/demo/) &nbsp;&middot;&nbsp;
[**Documentation**](https://christophervr.github.io/ooxml/xlsx/) &nbsp;&middot;&nbsp;
[**Getting started**](#getting-started) &nbsp;&middot;&nbsp;
[**Packages**](#packages)

Part of [ooxml](https://github.com/ChristopherVR/ooxml#readme): [Office](https://github.com/ChristopherVR/ooxml#ooxml-office-the-whole-suite-in-one-app) &middot; [Word](https://github.com/ChristopherVR/ooxml/tree/main/viewers/docx#readme) &middot; **[Excel](https://github.com/ChristopherVR/ooxml/tree/main/viewers/xlsx#readme)** &middot; [PowerPoint](https://github.com/ChristopherVR/ooxml/tree/main/viewers/pptx#readme) &middot; [Visio](https://github.com/ChristopherVR/ooxml/tree/main/viewers/visio#readme) &middot; [OpenTeams](https://github.com/ChristopherVR/ooxml/tree/main/viewers/teams#readme) &middot; [Core](https://github.com/ChristopherVR/ooxml/tree/main/src/core#readme)

![The xlsx-viewer editor showing a workbook with the Excel-style ribbon, formula bar and sheet tabs](https://raw.githubusercontent.com/ChristopherVR/ooxml/main/viewers/xlsx/docs/public/hero-editor.webp)

</div>

## Why xlsx-viewer?

- **One editor, every framework.** An `<xlsx-editor>` web component owns the grid, ribbon, formula bar, sheet tabs, selection, commands, history and styling. React, Vue, Angular, Svelte, Solid and vanilla adapters only handle lifecycle and events.
- **One workbook model.** A framework-neutral model, formula engine, parser and serializer sit under the editor, in the `xlsx` area of [`ooxml-core`](https://github.com/ChristopherVR/ooxml). This repository is UI only.
- **Careful preservation.** Parts the model does not cover (VBA, pivot caches, chart detail, custom XML) are carried through on save where the sheet still exists.
- **Honest limits.** Unsupported features are reported, not hidden. See [features and limitations](https://christophervr.github.io/ooxml/xlsx/features).

## Features and limitations

An early release: the areas below work and are covered by unit and browser tests, but this is not Excel parity and saving is not lossless for what the model does not cover.

|                   |                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Editor**        | Ribbon, name box, formula bar, grid with frozen panes, sheet tabs, status bar (sum, average, count), undo and redo, find and replace, tables, outline groups, sheet and workbook protection (legacy password hash), read-only mode, one web component.                                                                                                                                                                                        |
| **Formulas**      | A calculation engine in `ooxml-core` with a large function library, dynamic arrays and recalculation of dependents; automatic or manual calculation, Calculate Now / Sheet, Show Formulas. Unknown functions show `#NAME?`; no iterative calculation.                                                                                                                                                                                         |
| **Formatting**    | Fonts, fills, borders, alignment, number formats, merged cells, column widths, row heights, conditional formatting (rules, colour scales, data bars, icon sets), validation lists.                                                                                                                                                                                                                                                            |
| **Objects**       | Common chart types drawn as SVG from live values and pictures; both can be selected, moved, resized and deleted, and a chart's type, title and legend changed. Shapes, SmartArt and form controls show as placeholders.                                                                                                                                                                                                                       |
| **File formats**  | `.xlsx`, `.xlsm` (macros never run, kept on save), `.xltx`, legacy Excel 97-2003 `.xls` (read; saved as `.xlsx`) via the shared `ole2` codecs inside `ooxml-core`, and `.csv`.                                                                                                                                                                                                                                                                |
| **Not supported** | Pivot tables, slicers, external links and Power Query are kept but not shown or refreshed. Sparklines are drawn but cannot be created or edited. Password-protected loading and saving use the shared core encryption API; UI support varies by operation. Real-time co-editing shares cell content, formats, sheets and names only (charts, comments and other parts stay local; the host provides the server), see `docs/collaboration.md`. |
| **Localization**  | Interface in English, French, German, Spanish and Simplified Chinese through a `locale` option. Workbook content is never translated.                                                                                                                                                                                                                                                                                                         |

## Getting started

### 1. Install

```bash
npm install @christophervr/xlsx-react-viewer
```

Choose the package for your framework in the package table below. The editor
installs its core and shared UI dependencies and re-exports its model API.
For source development, see [Development](#development).

### 2. Mount the editor

Install one self-contained editor package for your framework, for example `npm install @christophervr/xlsx-react-viewer react`. Each one bundles the editor, brings the workbook model (`@christophervr/xlsx-core`) with it and re-exports it, so a single install and a single import path are all an application needs. Install `@christophervr/xlsx-core` on its own only for headless use.

```tsx
import { useState } from 'react';
import { createWorkbook, SpreadsheetEditor } from '@christophervr/xlsx-react-viewer';

export function Editor() {
	const [workbook, setWorkbook] = useState(() => createWorkbook());
	return <SpreadsheetEditor workbook={workbook} onWorkbookChange={setWorkbook} />;
}
```

<details>
<summary><strong>Vue 3</strong></summary>

```vue
<script setup lang="ts">
import { shallowRef } from 'vue';
import { createWorkbook, SpreadsheetEditor } from 'xlsx-vue-viewer';

const workbook = shallowRef(createWorkbook());
</script>
<template>
	<SpreadsheetEditor :workbook="workbook" @workbook-change="workbook = $event" />
</template>
```

</details>

<details>
<summary><strong>Angular</strong></summary>

```ts
import { createWorkbook, SpreadsheetEditorComponent } from 'xlsx-angular-viewer';

@Component({
	standalone: true,
	imports: [SpreadsheetEditorComponent],
	template: '<spreadsheet-editor [workbook]="workbook" (workbookChange)="workbook = $event" />',
})
export class EditorComponent {
	workbook = createWorkbook();
}
```

</details>

<details>
<summary><strong>Svelte 5</strong></summary>

```svelte
<script>
  import XlsxEditor from 'xlsx-svelte-viewer';
  import { createWorkbook } from 'xlsx-svelte-viewer/runtime';
  let workbook = $state.raw(createWorkbook());
</script>
<XlsxEditor {workbook} onworkbookchange={(next) => (workbook = next)} />
```

</details>

<details>
<summary><strong>SolidJS</strong></summary>

```tsx
import { createSignal } from 'solid-js';
import { createWorkbook, SpreadsheetEditor } from 'xlsx-solid-viewer';

export function Editor() {
	const [workbook, setWorkbook] = createSignal(createWorkbook());
	return <SpreadsheetEditor workbook={workbook()} onWorkbookChange={setWorkbook} />;
}
```

</details>

<details>
<summary><strong>Vanilla JavaScript</strong></summary>

```ts
import { mountEditor } from 'xlsx-vanilla-viewer';

const editor = mountEditor(container, {
	fileName: 'Budget.xlsx',
	onWorkbookChange: (workbook) => console.log(workbook.sheets.length),
	onWorkbookError: (error) => console.error(error),
});
await editor.load(bytes, 'Budget.xlsx');
const saved = await editor.save();
editor.destroy();
```

</details>

See the [bindings guide](https://christophervr.github.io/ooxml/xlsx/bindings) for props, events and the handle, and the [element API](https://christophervr.github.io/ooxml/xlsx/api) for `<xlsx-editor>` itself.

## Packages

Seven packages are published on npm, each versioned independently:

| Package                            | What it is                                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `@christophervr/xlsx-core`         | Workbook model, formula engine, parser and serializer (`packages/core`, a thin entry over `ooxml-core/xlsx`). |
| `@christophervr/xlsx-react-viewer` | React component (`packages/react`).                                                                           |
| `xlsx-vue-viewer`                  | Vue 3 component (`packages/vue`).                                                                             |
| `xlsx-angular-viewer`              | Angular standalone component (`packages/angular`).                                                            |
| `xlsx-svelte-viewer`               | Svelte 5 component (`packages/svelte`).                                                                       |
| `xlsx-solid-viewer`                | Solid component (`packages/solid`).                                                                           |
| `xlsx-vanilla-viewer`              | `mountEditor` and the plain `<xlsx-editor>` web component, no framework (`packages/vanilla`).                 |

Each `*-viewer` package is self-contained: workbook loading and the legacy `.xls` reader come from `ooxml-core` (`/xlsx/load`, which inlines the shared ole2 codecs). A package depends on `@christophervr/xlsx-core`, `ooxml-core`, `ooxml-ui` (the shared `office-ui-*` web components; installed for you, never imported by your code) and its framework peer, so `@christophervr/ole2` does not need to be installed.

The workspace also holds **private** packages that are never published and are inlined into each editor package at build time: `web-component` (the shared `<xlsx-editor>`) and `bindings` (framework lifecycle and event adapters).

## Development

```bash
bun run typecheck       # tsc and svelte-check
bun run test            # Vitest (binding contract tests)
bun run test:scripts    # release planner, publish guards, commit checks
bun run check:shared    # shared-code boundary check
bun run build:packages
bun run check:published   # no tarball may import an internal package or ole2
bun run pack:smoke
bunx playwright install chromium
bun run test:browser    # Playwright contract tests
bun run fmt:check       # oxfmt
bun install --cwd docs && bun run --cwd docs docs:build   # site and all demos
```

`PLAYWRIGHT_CHROMIUM_EXECUTABLE` selects an explicit Chromium and `PLAYWRIGHT_PORT` (default 4180) the preview port. See the [release policy](https://christophervr.github.io/ooxml/xlsx/releasing).

## Documentation

[Getting started](https://christophervr.github.io/ooxml/xlsx/getting-started) &middot; [Architecture](https://christophervr.github.io/ooxml/xlsx/architecture) &middot; [Framework bindings](https://christophervr.github.io/ooxml/xlsx/bindings) &middot; [Element API](https://christophervr.github.io/ooxml/xlsx/api) &middot; [Theming](https://christophervr.github.io/ooxml/xlsx/theming) &middot; [Localization](https://christophervr.github.io/ooxml/xlsx/localization) &middot; [Features and limitations](https://christophervr.github.io/ooxml/xlsx/features)

## License

[Apache License 2.0](LICENSE). See [`NOTICE`](NOTICE) for attributions.
