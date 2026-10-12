# Framework bindings

All bindings mount `<xlsx-editor>` through the same `mountEditor` function in `packages/bindings/src/index.ts`, so every framework gets identical semantics.

## Props

| Prop             | Type                          | Default      | Notes                                                                                                                   |
| ---------------- | ----------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `workbook`       | `Workbook`                    | none         | Shown when a **new object** is passed. The workbook the editor emits is never assigned back (no loop).                  |
| `bytes`          | `Uint8Array \| ArrayBuffer`   | none         | File bytes; loaded again whenever a new array is passed.                                                                |
| `src`            | `string`                      | none         | URL fetched and loaded when the string changes; the file name defaults to the URL's last segment.                       |
| `fileName`       | `string`                      | `Book1.xlsx` | Forwarded only when the parent changes it, so File > Open in the editor can rename the workbook.                        |
| `readOnly`       | `boolean`                     | `false`      |                                                                                                                         |
| `locale`         | `string`                      | `en`         | `en`, `fr`, `de`, `es`, `zh-CN` or a tag that maps to one (`de-DE`).                                                    |
| `theme`          | `'light' \| 'dark' \| 'auto'` | `auto`       | `auto` follows the operating system.                                                                                    |
| `authorName`     | `string`                      | `Author`     | Recorded on new comments.                                                                                               |
| `showToolbar`    | `boolean`                     | `true`       | The ribbon.                                                                                                             |
| `showFormulaBar` | `boolean`                     | `true`       | The name box and formula bar.                                                                                           |
| `hiddenActions`  | `string[]`                    | `[]`         | Ribbon controls to hide, by stable id.                                                                                  |
| `ribbonAddIns`   | `RibbonAddInTab[]`            | none         | Tabs the host adds after the built-in ones; see [Ribbon add-in tabs](#ribbon-add-in-tabs).                              |
| `themeColors`    | `Partial<Record<...>>`        | `{}`         | Token overrides, see [theming](/theming).                                                                               |
| `collaboration`  | `XlsxCollaborationOptions`    | none         | Shares the open workbook in a room while set; a new object rejoins, `null` leaves. See [collaboration](/collaboration). |

## Callbacks and events

| Callback (React, Solid, vanilla) | Vue event              | Angular output        | Svelte prop             | Payload                     |
| -------------------------------- | ---------------------- | --------------------- | ----------------------- | --------------------------- |
| `onWorkbookChange`               | `workbook-change`      | `workbookChange`      | `onworkbookchange`      | `Workbook`                  |
| `onWorkbookError`                | `workbook-error`       | `workbookError`       | `onworkbookerror`       | `Error`                     |
| `onSelectionChange`              | `selection-change`     | `selectionChange`     | `onselectionchange`     | `{ sheet, ref, active }`    |
| `onDirtyChange`                  | `dirty-change`         | `dirtyChange`         | `ondirtychange`         | `boolean`                   |
| `onReadOnlyChange`               | `readonly-change`      | `readOnlyChange`      | `onreadonlychange`      | `boolean`                   |
| `onRibbonCustomize`              | `ribbon-customize`     | `ribbonCustomize`     | `onribboncustomize`     | `string[]` (hidden actions) |
| `onRibbonAddIn`                  | `office-ribbon-add-in` | `ribbonAddIn`         | `onribbonaddin`         | `{ tab, command }`          |
| `onCollaborationChange`          | `collaboration-change` | `collaborationChange` | `oncollaborationchange` | `XlsxCollaborationState`    |
| `onReady`                        | `ready`                | `ready`               | `onready`               | the `<xlsx-editor>` element |

Load failures (corrupt, encrypted or unsupported files) reach `onWorkbookError`; a failed `src` fetch does too. A `src` fetch still in flight is dropped when new `bytes` or a new `workbook` arrive, or `src` is cleared or changed. The element's other events (`workbook-warning`, `file-command`, `sheet-change`, `ribbon-action`) are listened to on the element itself, see the [element API](/api).

Every prop is forwarded only when its value changes (`hiddenActions` and `themeColors` are compared by value), so a parent re-render never undoes what the user changed inside the editor: Editing / Viewing, File > Options theme or language, or Customize Ribbon. A controlled parent keeps its state in step through `onReadOnlyChange` and `onRibbonCustomize` (in Angular, `[(readOnly)]`).

## Ribbon add-in tabs

A host can add its own ribbon tabs after Excel's own, as an Office add-in does.
`ribbonAddIns` takes plain data and is a prop of every binding; a chosen command
runs its `run` callback and is reported through `onRibbonAddIn` (Vue
`office-ribbon-add-in`, Angular `ribbonAddIn`, Svelte `onribbonaddin`) with
`{ tab, command }`.

```tsx
const tabs = [
	{
		id: 'reports',
		label: 'Reports',
		groups: [
			{
				label: 'Export',
				commands: [
					{ id: 'export', label: 'Export', icon: 'save', run: () => exportReport() },
					{ id: 'options', label: 'Options', size: 'small' },
					{ id: 'send', label: 'Send', items: [{ id: 'send-mail', label: 'By mail' }] },
				],
			},
		],
	},
];

<SpreadsheetEditor ribbonAddIns={tabs} onRibbonAddIn={({ tab, command }) => track(tab, command)} />;
```

`size: 'small'` commands fill columns of three and `items` makes a drop-down.
Passing an equal descriptor again, as a framework does on every render, keeps
the panels and only replaces the callbacks; leaving the prop out removes the
tabs. A tab cannot take the id of a built-in tab, and its commands never reach
the editor's own command handling. The same descriptor (`RibbonAddInTab`, from
`ooxml-core/ribbon`, re-exported by every framework package) works in the Word,
Excel, PowerPoint and Visio editors. No add-in tab ships with the editor.

## Handle

Every adapter exposes the same handle: React through `ref`, Vue through the template ref, Angular through the component instance, Solid through `editorRef`, Svelte through the component's exports and vanilla as the return value of `mountEditor`.

| Member                          | Effect                                                              |
| ------------------------------- | ------------------------------------------------------------------- |
| `element`                       | The mounted `<xlsx-editor>`.                                        |
| `load(bytes, fileName?)`        | Opens `.xlsx`, `.xlsm`, `.xls` or `.csv` bytes; rejects on failure. |
| `newWorkbook()`                 | Replaces the workbook with a blank one.                             |
| `save()`                        | Resolves to an `.xlsx` Blob. Does not clear `dirty`.                |
| `saveBytes(format?)`            | `'xlsx'` (default) or `'csv'` (active sheet) bytes.                 |
| `download(fileName?)`           | Saves, downloads in the browser and marks the workbook clean.       |
| `markClean()`                   | Clears `dirty` after you persisted a saved Blob yourself.           |
| `select(ref)`, `getSelection()` | Selection as an A1 reference (`'B2:D8'`).                           |
| `setActiveSheet(index)`         | Switches sheet.                                                     |
| `share()`                       | Opens File > Share. Unmounting the editor leaves any shared room.   |
| `dirty`                         | Unsaved edits (Svelte: `isDirty()`).                                |

Calling a handle method before the editor is mounted throws `Editor is not mounted`.

## Server rendering

Every package imports without a DOM. Registration (`defineXlsxEditor`) and mounting are client operations.
