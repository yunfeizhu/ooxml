# Framework bindings

Six thin native integrations use one browser element and one `mountViewer` implementation. Each is published as its own self-contained package; none parses documents, draws diagrams or owns another renderer.

Each native handle exposes `createBlankDrawing(options?: CreateVsdxOptions)`.
The shared controller creates and accepts the new source through its existing
load lifecycle; state hooks and document events update normally. Pointer movement
and marquee selection run inside the same shared web component for all bindings.

| Framework | Package                | Export                                       |
| --------- | ---------------------- | -------------------------------------------- |
| Vanilla   | `visio-vanilla-viewer` | `mountViewer`                                |
| React     | `visio-react-viewer`   | `VisioViewer`                                |
| Vue 3     | `visio-vue-viewer`     | `VisioViewer`                                |
| Angular   | `visio-angular-viewer` | `VisioViewerComponent` (`visio-viewer-host`) |
| Svelte 5  | `visio-svelte-viewer`  | default `VisioViewer`                        |
| Solid     | `visio-solid-viewer`   | `VisioViewer`                                |

Import a specific framework package to avoid loading unrelated framework runtimes. The source of the adapters is `packages/bindings` in the repository, and its README lists the checks that guard them.

## Shared contract

All adapters accept the same properties:

- `document`: a `VisioDocument` or `null` to clear it
- `pageIndex`: zero-based page index
- `zoom`: scale, where `1` means 100%
- `showToolbar`: toolbar visibility
- `ribbonAddIns`: tabs the host adds after Help (see [Ribbon add-in tabs](api.md#ribbon-add-in-tabs))
- `events`: typed callback map using literal event names

The event map currently contains `document-load`, `document-change`, `document-error`, `page-change`, `zoom-change`, `shape-select`, `selection-change` and `office-ribbon-add-in`. It is derived from the canonical contract. All adapters pass every event; none parse documents or own another renderer.

Property updates are partial. Native framework snapshots are diffed so unrelated rerenders do not undo an imperative load or a user-changed viewport. Omitted or `undefined` properties preserve current viewer state. `null` explicitly clears the document. Removing the `events` prop clears callback-map handlers. Supply a new document object for an external replacement; in-place mutation is not a supported reactivity mechanism. Page and zoom interactions may update internal viewer state; the props request changes when their framework updates them.

The imperative `ViewerHandle` exposes `element`, `controller`, `load(bytesOrBlob)` and `fit()`. Editing methods include `applyEdits(edits)`, `replacePlainText(pageId, shapeId, text)`, `duplicateSelection()`, `copySelection()`, `cutSelection()`, `pasteSelection()`, `undo()`, `redo()`, `cancelEdit()` and `exportVsdx()`. Clipboard preparation state is available at `controller.state.clipboard` through each native reactive subscription; clipboard methods require a browser user gesture and support the bounded viewer shape format. They forward to the same source-backed worker-isolated implementation. `ViewerEditState` and `VsdxExportResult` are shared exported types; state is available at `controller.state.edit`. Angular exposes the native `documentChange` output; every adapter supports the `document-change` callback map. Read access and operations through a framework handle fail clearly before mounting or after unmounting. A retained controller or element is also disposed when the owner unmounts. Vanilla returns the full shared binding with `update()` and idempotent `destroy()`.

The editor itself mounts on the client. Separate Node tests verify all six entry points import without browser globals; React, Vue, Svelte and Solid also render empty native hosts on the server. React and Vue have tests hydrating their actual server markup before mounting the shared element. Angular server rendering and Solid/Svelte hydration remain unverified, as does cross-document mounting. These checks use the installed versions and do not imply full SSR-framework integration coverage.

## Native usage

React uses a forwarded ref and ordinary props:

```tsx
const ref = useRef<ViewerHandle>(null);
<VisioViewer ref={ref} document={diagram} events={{ 'document-error': reportError }} />;
```

Vue exposes the same handle on its component ref and also emits the native kebab-case events:

```vue
<VisioViewer ref="viewer" :document="diagram" @document-error="reportError" />
```

Angular exposes native inputs and outputs. Add the standalone component to the application's imports:

```html
<visio-viewer-host [document]="diagram" (documentError)="reportError($event)" />
```

Angular outputs are `documentLoad`, `documentError`, `pageChange`, `zoomChange` and `shapeSelect`. The complete `events` callback map is also accepted as an input. Vue and Angular invoke the callback-map handler and then emit their native output; use either API unless both notifications are intended.

For large immutable document models, use Vue `shallowRef`/`markRaw` and Svelte `$state.raw` rather than deeply proxying a newly constructed options object on every update. Rewrapping a document in a new reactive proxy changes its identity and requests an external replacement. In-place mutation is not supported.

Svelte uses native callback props through `events`. Its component exports `load`, `fit`, and `getHandle` so the complete typed handle is accessible without exposing private DOM:

```svelte
<VisioViewer bind:this={viewer} document={diagram}
  events={{ 'document-error': reportError }} />
```

Solid supplies a ref callback with the handle on mount and `undefined` on unmount or ref replacement:

```tsx
<VisioViewer
	document={diagram()}
	viewerRef={setViewer}
	events={{ 'document-error': reportError }}
/>
```

Vanilla owns only the child it creates:

```ts
const viewer = mountViewer(host, { document: diagram, zoom: 1 });
viewer.update({ events: { 'document-error': reportError } });
// Later:
viewer.destroy();
```

Style hooks are native to each framework: React `className`/`style`, Vue inherited attributes, Angular host attributes, Svelte `class`/`style`, and Solid `class`/`style`. The application must give the host a usable height. Shared viewer styling and accessibility live in the custom element.
