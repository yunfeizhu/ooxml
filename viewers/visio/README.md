<div align="center">

# visio-viewer

[![npm version](https://img.shields.io/npm/v/visio-react-viewer.svg)](https://www.npmjs.com/package/visio-react-viewer)
[![license](https://img.shields.io/npm/l/visio-react-viewer.svg)](https://github.com/ChristopherVR/ooxml/blob/main/viewers/visio/LICENSE)
[![types](https://img.shields.io/npm/types/visio-react-viewer.svg)](https://www.npmjs.com/package/visio-react-viewer)

**A local-first browser Visio diagram viewer with one SVG renderer, one web component and thin adapters for your framework.**
A public beta: not Microsoft Visio parity, and not lossless export.

[![docs](https://img.shields.io/badge/docs-christophervr.github.io-2b579a.svg)](https://christophervr.github.io/ooxml/visio/)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![CI](https://github.com/ChristopherVR/ooxml/actions/workflows/ci.yml/badge.svg)](https://github.com/ChristopherVR/ooxml/actions/workflows/ci.yml)

[**Live demo**](https://christophervr.github.io/ooxml/visio/demo/) &nbsp;&middot;&nbsp;
[**Documentation**](https://christophervr.github.io/ooxml/visio/) &nbsp;&middot;&nbsp;
[**Getting started**](#getting-started) &nbsp;&middot;&nbsp;
[**Packages**](#packages)

Part of [ooxml](https://github.com/ChristopherVR/ooxml#readme): [Office](https://github.com/ChristopherVR/ooxml#ooxml-office-the-whole-suite-in-one-app) &middot; [Word](https://github.com/ChristopherVR/ooxml/tree/main/viewers/docx#readme) &middot; [Excel](https://github.com/ChristopherVR/ooxml/tree/main/viewers/xlsx#readme) &middot; [PowerPoint](https://github.com/ChristopherVR/ooxml/tree/main/viewers/pptx#readme) &middot; **[Visio](https://github.com/ChristopherVR/ooxml/tree/main/viewers/visio#readme)** &middot; [OpenTeams](https://github.com/ChristopherVR/ooxml/tree/main/viewers/teams#readme) &middot; [Core](https://github.com/ChristopherVR/ooxml/tree/main/src/core#readme)

![The visio-viewer rendering a workflow diagram with its ribbon, Shapes window and page tabs](https://raw.githubusercontent.com/ChristopherVR/ooxml/main/viewers/visio/docs/public/hero-viewer.webp)

</div>

## Why visio-viewer?

- **One viewer, every framework.** A `<visio-viewer>` custom element owns the SVG renderer, ribbon, page tabs, status bar, selection, search, layers and editing controls. React, Vue, Angular, Svelte, Solid and vanilla adapters only handle lifecycle, properties and events.
- **One document model.** Package loading, XML, the model, ShapeSheet interpretation, editing and serialization live in the `visio` area of [`ooxml-core`](https://github.com/ChristopherVR/ooxml). This repository is UI only.
- **Local-first.** Files stay in the browser: no uploads, telemetry, external fonts or document URL fetches. Document XML is never injected into the DOM, and the custom element parses in a dedicated worker with cancellation and a time limit.
- **Honest limits.** Unsupported features are reported, not hidden. The [capability ledger](docs/parity.md) separates implemented code, tested evidence and missing functionality, and the [verification record](docs/verification.md) holds the current evidence.

## Features and limitations

A public beta: the areas below have unit, binding and browser coverage. Recorded native Visio save/reopen checks cover specific editing cases, as detailed in the [verification record](docs/verification.md). General native file compatibility and full-page visual equivalence remain unproven.

|                      |                                                                                                                                                                                                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Editor**           | Visio-style ribbon with File backstage, Tell me and KeyTips, Shapes window, bottom page tabs, status-bar zoom slider, Pan & Zoom window, rulers, literal text search, layer visibility, shape data, undo and redo, full screen. Unavailable commands say why.   |
| **Editing**          | Bounded source edits: text/shape formatting, multi-selection, align/distribute, ordering, duplicate, viewer shape clipboard, plain-text replacement, create, move, resize and delete. Core validates atomic worker edits; shared history supports undo/redo.    |
| **File formats**     | `.vsdx`, saved as an explicit downloaded VSDX copy that never overwrites the source. Legacy binary Visio `.vsd` (v11) is read-only, previewed through the shared `ole2` codecs inside `ooxml-core`.                                                             |
| **Objects**          | Shapes with master inheritance, groups, background pages, paths, arcs, splines and bounded NURBS, cached line and fill styles, theme colours and gradients, arrowheads, rich text, embedded PNG/JPEG/GIF images and a narrow subset of embedded EMF primitives. |
| **Export and print** | Static current-page SVG export and frozen print-ready page artifacts. No PDF or bitmap export; saved printer and layer print settings are not applied.                                                                                                          |
| **Not supported**    | Live connector routing and glue, containers and swimlanes, general ShapeSheet recalculation, most EMF records, EMF+, WMF and OLE, VDX, stencils, templates and macros. Signed and macro-enabled packages cannot be edited.                                      |
| **Localization**     | Interface in English only; there is no `locale` option yet. Diagram content is never translated.                                                                                                                                                                |

## Getting started

### 1. Install

```bash
npm install visio-react-viewer
```

Choose the package for your framework in the package table below. Each viewer
installs `ooxml-core` and `ooxml-ui` for you and re-exports the `visio-core`
document API. For source development, see [Development](#development).

### 2. Mount the viewer

Give the host a height, mount it in the browser and pass the file to the
imperative `load()` handle (`File`, `Blob`, `Uint8Array` or `ArrayBuffer`);
the `document` property takes a parsed model, not a file URL.

```tsx
import { useRef } from 'react';
import { VisioViewer, type ViewerHandle } from 'visio-react-viewer';

export function Diagram() {
	const viewer = useRef<ViewerHandle>(null);
	return (
		<>
			<input
				type="file"
				accept=".vsdx"
				onChange={async (event) => {
					const file = event.currentTarget.files?.[0];
					if (file) await viewer.current?.load(file);
				}}
			/>
			<VisioViewer ref={viewer} showToolbar style={{ height: 600 }} />
		</>
	);
}
```

<details>
<summary><strong>Vue 3</strong></summary>

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { VisioViewer, type ViewerHandle } from 'visio-vue-viewer';

const viewer = ref<ViewerHandle>();
async function open(event: Event) {
	const file = (event.target as HTMLInputElement).files?.[0];
	if (file) await viewer.value?.load(file);
}
</script>

<template>
	<input type="file" accept=".vsdx" @change="open" />
	<VisioViewer ref="viewer" :show-toolbar="true" style="height: 600px" />
</template>
```

</details>

<details>
<summary><strong>Angular</strong></summary>

```ts
import { Component } from '@angular/core';
import { VisioViewerComponent } from 'visio-angular-viewer';

@Component({
	selector: 'app-diagram',
	standalone: true,
	imports: [VisioViewerComponent],
	template: `
		<input type="file" accept=".vsdx" (change)="open($event, viewer)" />
		<visio-viewer-host #viewer [showToolbar]="true" style="display: block; height: 600px" />
	`,
})
export class DiagramComponent {
	async open(event: Event, viewer: VisioViewerComponent) {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (file) await viewer.load(file);
	}
}
```

</details>

<details>
<summary><strong>Svelte 5</strong></summary>

```svelte
<script lang="ts">
  import { VisioViewer } from 'visio-svelte-viewer';
  let viewer: ReturnType<typeof VisioViewer>;
  async function open(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) await viewer.load(file);
  }
</script>

<input type="file" accept=".vsdx" onchange={open} />
<VisioViewer bind:this={viewer} showToolbar={true} style="height: 600px" />
```

</details>

<details>
<summary><strong>SolidJS</strong></summary>

```tsx
import { VisioViewer, type ViewerHandle } from 'visio-solid-viewer';

export function Diagram() {
	let viewer: ViewerHandle | undefined;
	return (
		<>
			<input
				type="file"
				accept=".vsdx"
				onChange={async (event) => {
					const file = event.currentTarget.files?.[0];
					if (file) await viewer?.load(file);
				}}
			/>
			<VisioViewer
				viewerRef={(handle) => {
					viewer = handle;
				}}
				showToolbar
				style={{ height: '600px' }}
			/>
		</>
	);
}
```

</details>

<details>
<summary><strong>Vanilla JavaScript</strong></summary>

```js
import { mountViewer } from 'visio-vanilla-viewer';

const host = document.createElement('div');
host.style.height = '600px';
document.body.append(host);

const viewer = mountViewer(host, { showToolbar: true });
const bytes = await (await fetch('/diagram.vsdx')).arrayBuffer();
await viewer.load(bytes);
const { bytes: copy, dirty, diagnostics } = viewer.exportVsdx();
viewer.destroy();
```

For direct custom-element use, call `registerVisioViewer()` and create a
`<visio-viewer>` element; importing the package does not register it.

</details>

Every handle also supports `fit()`, `replacePlainText()`, `applyEdits()`,
`undo()`, `redo()`, `exportVsdx()`, `exportSvg()` and `createPrintSnapshot()`;
saving or downloading exported bytes is the application's responsibility. See
the [viewer API](docs/api.md) for search, layers, export and editing, and the
[bindings guide](packages/bindings/README.md) for each framework's props, events
and lifecycle. Every framework demo runs the same workspace:
[React](https://christophervr.github.io/ooxml/visio/demo-react/),
[Vue](https://christophervr.github.io/ooxml/visio/demo-vue/),
[Angular](https://christophervr.github.io/ooxml/visio/demo-angular/),
[Svelte](https://christophervr.github.io/ooxml/visio/demo-svelte/),
[Solid](https://christophervr.github.io/ooxml/visio/demo-solid/) and
[vanilla](https://christophervr.github.io/ooxml/visio/demo/).

## Packages

Eight packages are published on npm, each versioned independently:

| Package                | What it is                                                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `visio-core`           | DOM-free Visio document API (`packages/core`, a thin re-export of `ooxml-core/visio`).                                      |
| `visio-react-viewer`   | React component with a forwarded handle and hooks (`packages/react`).                                                       |
| `visio-vue-viewer`     | Vue 3 component (`packages/vue`).                                                                                           |
| `visio-angular-viewer` | Angular standalone component, `<visio-viewer-host>` (`packages/angular`).                                                   |
| `visio-svelte-viewer`  | Svelte 5 component (`packages/svelte`).                                                                                     |
| `visio-solid-viewer`   | Solid component (`packages/solid`).                                                                                         |
| `visio-vanilla-viewer` | `mountViewer` and the plain `<visio-viewer>` custom element, no framework (`packages/vanilla`).                             |
| `visio-viewer-mcp`     | Headless MCP tools that delegate document operations to `ooxml-core/automation` (`mcp`, separate from the viewer packages). |

Each `*-viewer` package is self-contained: it ships the shared viewer, its adapter and both browser workers, and re-exports the `visio-core` document API. A package depends on `visio-core`, `ooxml-core`, `ooxml-ui` (the shared `office-ui-*` web components; installed for you, never imported by your code), `emf-converter` and its framework peer, so `@christophervr/ole2` does not need to be installed.

The viewer implementation lives in `ooxml-ui/visio` (the `ooxml` repository), which every viewer package depends on. `src/` here only re-exports it, and `packages/bindings` (framework lifecycle and event adapters) is a **private** build input that is never published; it is bundled into each viewer package at build time.

## Development

Node.js 22.12 or newer is required.

```bash
npm ci --ignore-scripts
npm ci --prefix packages/bindings --ignore-scripts
npm run dev                 # docs landing page and /demo/ workspace
npm run typecheck           # viewer and demo TypeScript
npm test                    # controller, renderer, scene safety and binding tests
npm run check:bindings      # native adapter types, lifecycle and SSR
npm run check:core          # core TypeScript and focused Visio tests
npm run test:docs           # VitePress docs build, ledger and theme tests
npm run docs:build          # the VitePress docs and every demo in docs/.vitepress/dist
npm run build               # ESM/declarations and the playground in site-dist/
npm run check               # all non-browser checks and production build
npm run test:browser        # Playwright Chromium workflows
npm run fmt                 # oxfmt
```

`CHROMIUM_PATH` selects an explicit Chromium for the browser tests; otherwise install Playwright's Chromium. `npm run test:corpus -- LIBVISIO_CHECKOUT POI_CHECKOUT` runs optional hash-pinned real and security fixture regressions (see [corpus setup](docs/corpus.md)). Normal builds use the released `ooxml-core/visio`; for core development, `VISIO_CORE_DIR` and `npm run link:core` point this checkout at a local `ooxml` clone (restore the published ranges before committing).

## Documentation

[Guide](https://christophervr.github.io/ooxml/visio/docs/) &middot; [Viewer API](docs/api.md) &middot; [Architecture](docs/architecture.md) &middot; [Capability ledger](docs/parity.md) &middot; [Verification record](docs/verification.md) &middot; [Corpus setup](docs/corpus.md) &middot; [Framework bindings](packages/bindings/README.md) &middot; [EMF adoption review](docs/research/emf-adoption-review.md)

## Releasing

Releases are automated from conventional commits: the hourly `release.yml` workflow versions each package independently, writes changelogs and publishes with npm trusted publishing and provenance after package and browser checks. Never run `npm publish` or push release tags by hand. See the [release policy](docs/releasing.md).

## Contributing

This repository is trunk-based and uses [Conventional Commits](https://www.conventionalcommits.org); the commit type sets the version bump and the touched paths decide which packages release. Format logic belongs in [`ooxml`](https://github.com/ChristopherVR/ooxml) and shared Office controls in `ooxml-ui`; read [`AGENTS.md`](AGENTS.md) before changing code here.

## License

[Apache License 2.0](LICENSE). See [`NOTICE`](NOTICE) for attributions.
