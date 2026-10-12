# visio-vue-viewer

[![npm version](https://img.shields.io/npm/v/visio-vue-viewer.svg)](https://www.npmjs.com/package/visio-vue-viewer)
[![license](https://img.shields.io/npm/l/visio-vue-viewer.svg)](https://github.com/ChristopherVR/ooxml/blob/main/viewers/visio/LICENSE)
[![types](https://img.shields.io/npm/types/visio-vue-viewer.svg)](https://www.npmjs.com/package/visio-vue-viewer)

> A browser Visio `.vsdx` viewer for Vue 3.5 or later within Vue 3. This package ships the functional viewer and its framework adapter.

[Live demo](https://christophervr.github.io/ooxml/visio/demo/) | [npm](https://www.npmjs.com/package/visio-vue-viewer) | [Full docs](https://christophervr.github.io/ooxml/visio/) | [Source](https://github.com/ChristopherVR/ooxml/tree/main/viewers/visio)

Part of [ooxml](https://github.com/ChristopherVR/ooxml#readme): [Office](https://github.com/ChristopherVR/ooxml#ooxml-office-the-whole-suite-in-one-app) &middot; [Word](https://github.com/ChristopherVR/ooxml/tree/main/viewers/docx#readme) &middot; [Excel](https://github.com/ChristopherVR/ooxml/tree/main/viewers/xlsx#readme) &middot; [PowerPoint](https://github.com/ChristopherVR/ooxml/tree/main/viewers/pptx#readme) &middot; **[Visio](https://github.com/ChristopherVR/ooxml/tree/main/viewers/visio#readme)** &middot; [OpenTeams](https://github.com/ChristopherVR/ooxml/tree/main/viewers/teams#readme) &middot; [Core](https://github.com/ChristopherVR/ooxml/tree/main/src/core#readme)

## Install

```bash
npm install visio-vue-viewer
```

## Quick start

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

## Features

| Feature    | Description                                                         |
| ---------- | ------------------------------------------------------------------- |
| Viewing    | One SVG renderer, page selection, zoom, layers and text search.     |
| Editing    | Core-validated text and geometry operations with bounded undo/redo. |
| Export     | Source-backed VSDX copies, static SVG and print snapshots.          |
| Frameworks | One shared `<visio-viewer>` UI behind six adapters.                 |

## API

The shared properties are `document` (a parsed `VisioDocument`, or `null` to clear),
`pageIndex` (zero-based), `zoom` (`1` means 100%), `showToolbar`, `ribbonAddIns` (tabs the host adds
after Help) and `events`.
The callback map uses `document-load`, `document-change`, `document-error`,
`page-change`, `zoom-change` and `shape-select`. File loading uses the imperative
`load(File | Blob | Uint8Array | ArrayBuffer)` handle; `document` is not a file URL.
Provide a height for the viewer host. Mount and load files in the browser.

The handle supports `fit()`, `replacePlainText(pageId, shapeId, text)`,
`applyEdits(edits)`, `undo()`, `redo()` and `exportVsdx()`.
`exportVsdx()` returns `{ bytes, dirty, diagnostics }`; saving or downloading those
bytes is the application's responsibility. Load original bytes through `load()`
to enable source-backed editing and export. Handles are usable after mount.

Every viewer package includes the same browser UI and re-exports the
`visio-core` document API. Parsing and editing belong to `ooxml-core/visio`;
framework bindings only manage lifecycle, properties and events.

## Limitations

Rendering and editing are beta features. Supported text and geometry edits are
bounded by core validation; unsupported operations reject and diagnostics report
limitations. Native Visio layout parity and lossless export are not established.
Files stay in the browser unless your application sends them elsewhere.

## Documentation

[Viewer guide](https://christophervr.github.io/ooxml/visio/docs/) |
[Demo](https://christophervr.github.io/ooxml/visio/demo/) |
[Source](https://github.com/ChristopherVR/ooxml/tree/main/viewers/visio)

Vue also emits the shared kebab-case events, such as `@document-change`.

## License

Apache-2.0.
