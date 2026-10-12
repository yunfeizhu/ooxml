# Getting started

Open a diagram locally, understand the current limits, and embed the same viewer in your application.

::: warning Initial viewer support, not Visio certification
This is a public beta. Do not use a successful file open as evidence that every shape, formula or format feature is represented faithfully. See the [capability ledger](/parity).
:::

## Try the local playground

1. [Open the playground](/demo/){target="_self"} to see an original sample document.
2. Choose a local `.vsdx` file using the file picker or drop area.
3. Switch pages, adjust zoom, fit the page and select a shape.
4. Review compatibility notes. Compare important files with their Microsoft Visio rendering.

No document upload is performed. The controls support search, display layers, experimental plain-text editing, bounded undo/redo, SVG export and explicit VSDX-copy downloads. Print snapshots are API-only preparation; there is no print dialog. General drawing, PDF export and most legacy binary `.vsd` features are outside this build.

The other framework builds of the same playground are listed on [the demos page](/demos).

## Install a framework package

Install one viewer package for your framework. Each includes the shared viewer, its adapter, workers and document API.

::: code-group

```bash [React]
npm install visio-react-viewer react
```

```bash [Vue]
npm install visio-vue-viewer vue
```

```bash [Angular]
npm install visio-angular-viewer
```

```bash [Svelte]
npm install visio-svelte-viewer svelte
```

```bash [Solid]
npm install visio-solid-viewer solid-js
```

```bash [Vanilla JS]
npm install visio-vanilla-viewer
```

:::

| Framework | Package                | Export                 |
| --------- | ---------------------- | ---------------------- |
| Vanilla   | `visio-vanilla-viewer` | `mountViewer`          |
| React     | `visio-react-viewer`   | `VisioViewer`          |
| Vue 3     | `visio-vue-viewer`     | `VisioViewer`          |
| Angular   | `visio-angular-viewer` | `VisioViewerComponent` |
| Svelte 5  | `visio-svelte-viewer`  | default `VisioViewer`  |
| Solid     | `visio-solid-viewer`   | `VisioViewer`          |

All six adapters forward the same controller, properties, events and imperative handle through the shared viewer. See the [framework guides](/frameworks/react) and the [binding contract](/bindings).

## Mount a viewer

The container must have a height. A browser `File`, `Blob`, `Uint8Array` or `ArrayBuffer` can be passed to `load`.

```ts
import { mountViewer } from 'visio-vanilla-viewer';

const viewer = mountViewer(host, {
	events: { 'shape-select': (shape) => console.log(shape) },
});

await viewer.load(file); // A local File or bytes
viewer.fit();

// When your view unmounts:
viewer.destroy();
```

## Run the development workspace

Use Node.js 22.12 or newer. Normal builds install the released `ooxml-core/visio` API from npm.

```bash
npm ci --ignore-scripts
npm ci --prefix packages/bindings --ignore-scripts
npm run check
npm run dev
```

Use the local URL printed by Vite. This starts a development server; it does not publish the site.

## Experimental plain-text editing {#editing}

Load a local source package, select a supported shape, and use its text controls. `replacePlainText(pageId, shapeId, text)`, `undo()` and `redo()` expose the same operations through each handle. A model assigned with `document` has no package bytes and stays read-only.

Editing rejects master-linked text, rich text, fields, signed packages and macro content. History is bounded and can discard old undo states. Saved formula caches are not recalculated. General drawing and style editing are not implemented.

`exportVsdx()` returns original or edited package bytes and diagnostics for an explicit copy download. It never overwrites the input file. Native Visio reopening and lossless round-trip fidelity remain unverified.

## Export a static SVG {#export}

`viewer.exportSvg()` returns the current page's SVG string, dimensions, byte length and compatibility diagnostics. It leaves selection, zoom and the source document unchanged. The playground's Export SVG button performs an explicit local download.

Supported background content and validated raster images are embedded. Fonts are not embedded; wrapping and other approximations remain visible in the SVG description and metadata. Export is limited to 16 MiB, with conservative early resource checks. Callers can lower the limit with `{ maxBytes }`. This is not editable VSDX output. Downstream rasterizers must independently cap dimensions and pixel area.

## Prepare page snapshots

`createPrintSnapshot()` returns immutable SVG page artifacts and diagnostics through the API. It preserves drawing dimensions but does not apply native printer settings, open a print dialog or implement PDF export. This prepares data for a future print workflow.

## Properties and events

| Surface    | Current contract                                                                                                                               |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Properties | `document`, `pageIndex`, `zoom`, `showToolbar`, `ribbonAddIns`                                                                                 |
| Events     | `document-load`, `document-change`, `document-error`, `page-change`, `zoom-change`, `shape-select`, `selection-change`, `office-ribbon-add-in` |
| Lifecycle  | `update`, `load`, `fit`, `exportSvg`, `createPrintSnapshot`, `replacePlainText`, `undo`, `redo`, `cancelEdit`, `exportVsdx`, `destroy`         |

Mount after the host exists and call `destroy()` when the framework view unmounts. Repeated destruction is safe. Partial updates leave omitted properties unchanged. The full reference is the [viewer API](/api).

## Verification before adoption

Run `npm run check` and `npm run test:browser` in the viewer checkout. Core parser tests belong to the sibling engine. These checks establish only their asserted behavior; they do not establish Microsoft Visio visual parity.
