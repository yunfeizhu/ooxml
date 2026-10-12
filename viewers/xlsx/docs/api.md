# Element API

`<xlsx-editor>` (class `XlsxEditorElement`) is the one editor every package mounts. Register it with `defineXlsxEditor()` (exported by every package; registration is idempotent and does nothing without `customElements`), or let `mountEditor` and the framework components do it for you.

```ts
import { defineXlsxEditor } from 'xlsx-vanilla-viewer';

defineXlsxEditor();
const editor = document.createElement('xlsx-editor');
editor.fileName = 'Budget.xlsx';
document.body.append(editor);
await editor.load(bytes, 'Budget.xlsx');
```

## Attributes and properties

| Attribute          | Property         | Type                                                  | Default      |
| ------------------ | ---------------- | ----------------------------------------------------- | ------------ |
| `locale`           | `locale`         | `en \| fr \| de \| es \| zh-CN` (any tag maps to one) | `en`         |
| `read-only`        | `readOnly`       | boolean                                               | `false`      |
| `file-name`        | `fileName`       | string                                                | `Book1.xlsx` |
| `author-name`      | `authorName`     | string                                                | `Author`     |
| `theme`            | `theme`          | `light \| dark \| auto`                               | `auto`       |
| `show-toolbar`     | `showToolbar`    | boolean (`"false"` hides)                             | `true`       |
| `show-formula-bar` | `showFormulaBar` | boolean (`"false"` hides)                             | `true`       |

Properties only:

| Property             | Type                                 | Notes                                                                                  |
| -------------------- | ------------------------------------ | -------------------------------------------------------------------------------------- |
| `themeColors`        | `Partial<Record<...>>`               | Token overrides applied as `--xve-*` custom properties ([theming](/theming)).          |
| `hiddenActions`      | `string[]`                           | Ribbon controls to hide by stable id.                                                  |
| `ribbonAddIns`       | `RibbonAddInTab[]`                   | Tabs the host adds after the built-in ones ([bindings](/bindings#ribbon-add-in-tabs)). |
| `workbook`           | `Workbook \| null`                   | Get the open workbook, or set one to replace it.                                       |
| `dirty`              | `boolean` (read only)                | Unsaved edits.                                                                         |
| `activeSheet`        | `number`                             | Zero-based index of the visible sheet.                                                 |
| `collaboration`      | `XlsxCollaborationOptions \| null`   | Shares the open workbook in a room while set ([collaboration](/collaboration)).        |
| `collaborationState` | `XlsxCollaborationState` (read only) | Whether sharing, the connection status and who is in the room.                         |

## Methods

| Method                        | Returns               | Notes                                                                                                                           |
| ----------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `load(bytes, fileName?)`      | `Promise<void>`       | `.xlsx`, `.xlsm`, `.xltx`, `.xls`, `.csv`; the format is sniffed from the bytes. Emits `workbook-error` and rejects on failure. |
| `newWorkbook()`               | `void`                | A blank workbook named `Book1.xlsx`.                                                                                            |
| `save()`                      | `Promise<Blob>`       | `.xlsx`. Does not clear `dirty`.                                                                                                |
| `saveBytes(format?)`          | `Promise<Uint8Array>` | `'xlsx'` (default) or `'csv'` (the active sheet, formatted values).                                                             |
| `download(name?)`             | `Promise<void>`       | Saves, downloads, then `markClean()`.                                                                                           |
| `markClean()`                 | `void`                |                                                                                                                                 |
| `select(ref)`                 | `void`                | An A1 cell or range on the active sheet (`'C3'`, `'A1:D20'`).                                                                   |
| `getSelection()`              | `string`              | The current selection as an A1 reference.                                                                                       |
| `setActiveSheet(index)`       | `void`                |                                                                                                                                 |
| `undo()`, `redo()`            | `void`                | While shared, only this window's edits are undone.                                                                              |
| `startCollaboration(options)` | `Promise<void>`       | Joins a room; rejects when already sharing or no workbook is open.                                                              |
| `stopCollaboration()`         | `void`                | Leaves the room and clears `collaboration`; the workbook stays as it is.                                                        |
| `reconnectCollaboration()`    | `void`                | Restarts the connection, keeping changes made offline.                                                                          |
| `share()`                     | `void`                | Opens File > Share.                                                                                                             |
| `focusGrid()`                 | `void`                | Moves keyboard focus to the grid so typing edits the active cell.                                                               |

## Events

All events are `CustomEvent`s that bubble and cross the shadow boundary (`composed`).

| Event                  | `detail`                                                                                   | Notes                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `workbook-change`      | `{ workbook }`                                                                             | After an edit, a load or a new workbook.                                       |
| `workbook-error`       | `{ error, message }`                                                                       | A load or save failed.                                                         |
| `workbook-warning`     | `{ warnings }`                                                                             | Content the loader read but could not model.                                   |
| `readonly-change`      | `{ readOnly }`                                                                             |                                                                                |
| `ribbon-action`        | `{ id }`                                                                                   | A ribbon command ran.                                                          |
| `file-command`         | `{ command: 'new' \| 'open' \| 'save' \| 'saveAs' \| 'export' \| 'exportCsv' \| 'print' }` | **Cancelable**: `preventDefault()` to handle it yourself.                      |
| `selection-change`     | `{ sheet, ref, active }`                                                                   | `ref` is the selected range, `active` the active cell.                         |
| `sheet-change`         | `{ index, name }`                                                                          |                                                                                |
| `dirty-change`         | `{ dirty }`                                                                                |                                                                                |
| `office-ribbon-add-in` | `{ tab, command }`                                                                         | A command of a host tab (`ribbonAddIns`) was chosen.                           |
| `collaboration-change` | `{ active, roomId, status, synced, people }`                                               | Sharing started or stopped, the connection changed, or someone joined or left. |

```ts
editor.addEventListener('file-command', (event) => {
	if (event.detail.command === 'save') {
		event.preventDefault();
		void editor
			.save()
			.then(uploadToMyStorage)
			.then(() => editor.markClean());
	}
});
```

## Shadow parts

The element exposes its regions as CSS shadow parts, for styling with `xlsx-editor::part(grid)` and for tests: `ribbon`, `name-box`, `formula-bar`, `grid`, `sheet-tabs` and `status-bar`.
