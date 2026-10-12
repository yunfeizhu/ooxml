# ooxml-ui

[![npm version](https://img.shields.io/npm/v/ooxml-ui.svg)](https://www.npmjs.com/package/ooxml-ui)
[![license](https://img.shields.io/npm/l/ooxml-ui.svg)](https://github.com/ChristopherVR/ooxml/blob/main/LICENSE)
[![types](https://img.shields.io/npm/types/ooxml-ui.svg)](https://www.npmjs.com/package/ooxml-ui)

> Shared Office controls, styles and custom elements for browser applications.

[Try the apps](https://christophervr.github.io/ooxml/) | [npm](https://www.npmjs.com/package/ooxml-ui) | [Full docs](https://christophervr.github.io/ooxml/) | [Source](https://github.com/ChristopherVR/ooxml)

Part of [ooxml](https://github.com/ChristopherVR/ooxml#readme): **[Office](https://github.com/ChristopherVR/ooxml#ooxml-office-the-whole-suite-in-one-app)** &middot; [Word](https://github.com/ChristopherVR/ooxml/tree/main/viewers/docx#readme) &middot; [Excel](https://github.com/ChristopherVR/ooxml/tree/main/viewers/xlsx#readme) &middot; [PowerPoint](https://github.com/ChristopherVR/ooxml/tree/main/viewers/pptx#readme) &middot; [Visio](https://github.com/ChristopherVR/ooxml/tree/main/viewers/visio#readme) &middot; [OpenTeams](https://github.com/ChristopherVR/ooxml/tree/main/viewers/teams#readme) &middot; [Core](https://github.com/ChristopherVR/ooxml/tree/main/src/core#readme)

Shared, format-neutral web components and styles for the Office viewers (Word, PowerPoint and
Excel). Custom elements with shadow-root controls and typed events, no framework. The runtime
dependencies are `ooxml-core` (types and a few pure helpers) and `lit`, which every element is built on
(see "How the elements are built").

> **You do not install this package.** It is a regular `dependency` of every published editor
> package (`docx-*-viewer`, `pptx-*-viewer` and `xlsx-*-viewer`), so installing the editor of your framework pulls it
> in. It is published separately only so that the editors share one copy of the controls. Do not
> add it to your own install instructions or `package.json`; import controls through the editor
> package, which registers them for you. Importing `ooxml-ui` directly is for
> the viewer packages themselves and for people building their own Office-style UI.

## How the elements are built

`office-ui-smartart` accepts `schemeFonts` (`major` and `minor` Latin typefaces)
alongside `schemeColors`. Cached shape font references provide inherited text
color and font; explicit run formatting takes precedence. Color transforms and
alpha reuse the core DrawingML resolver, with unsupported transforms reported in
`unappliedColorTransforms` on the render report.

Every element is a Lit class that reads like a component, in a folder named for what it is:
`<name>.ts` holds the reactive properties and a `render()` template, `<name>.css` the styles (a real
stylesheet imported as `?raw`, tokens only). The folders are `form/` (checkbox, switch, radio, select,
search, zoom), `ribbon/` (button, group, stack, toolbar, tabs, section, toggle), `menu/` (menu button
and item, separator, context menu, command search), `dialog/` (dialog, options dialog, dialog footer),
`notices/` (toasts, read-only banner, paste options), `chrome/` (title bar, status bar and item, tab
strip, task pane, backstage, account, find bar, print preview, ruler), `comments/` (the comments pane), `presence/`,
`smartart/` and `teams/`.

- **`OfficeElement`** (`base.ts`) is the base class, exported for products that build their own
  elements. Bare `var(--office-x)` in a `.css` file gets the token's default when the sheet loads
  (`withTokens`), so an element renders correctly with or without the installed theme.
- **Updates are synchronous.** Setting a property or attribute redraws the shadow DOM before the call
  returns (the contract the earlier hand-built elements had and every test relies on). The team
  elements keep Lit's batched updates (`static syncUpdates = false`).
- **Products subclass these elements** (pptx-viewer registers `pptx-ui-*` aliases that keep their own
  event names and ids), so the base class keeps what those subclasses lean on: the shadow root exists
  when the constructor returns, a connected element renders on first `shadowRoot` read or in a
  microtask even if a subclass skips `super.connectedCallback()`, and a property that a product hook
  reads as an attribute (`icon`, `command`, `launcher`, `placement`) writes the attribute through.
  A constructor must not assign a property a subclass may override with its own accessor (it would
  run the subclass's setter before its fields exist); such state (`state`, `groups`, ...) lives in a
  private field behind a hand-written accessor.
- **Text is exact.** Text-bearing elements are written without whitespace between nodes, because
  consumers compare `textContent`. `oxfmt` is set to `htmlWhitespaceSensitivity: "strict"` for
  `src/ui/src` (not `teams/`) so it never adds whitespace to a template; `glyph.ts` opts out of
  the formatter with `// prettier-ignore` because it reflows `<svg>` regardless.
- **`ribbon-section` and `keytips`** keep imperative DOM on purpose: the section patches light-DOM
  children keyed by id (so focus and a product's tags survive), and keytips attaches a badge layer to
  a scope it does not own.

## Team workspace elements (`ooxml-ui/teams`)

The chat and meeting pieces of the open-source Teams-style workspace (logic in `ooxml-core/teams`,
app in the `teams-viewer` repository): `office-ui-avatar`, `-app-rail`, `-channel-list`, `-chat-list`,
`-chat-composer`, `-prejoin`, `-call-grid` and `-call-controls`. Properties in, bubbling `office-*`
events out, no data fetching; message text is always rendered as text.

`teams-app` opens Settings as a workspace page beside the app rail, retaining
the underlying chat, selected tab and edited workbook. Its `teams-settings`
element also supports standalone modal use; pass `embedded` to render a
modeless page sized to the containing workspace. Escape and Close settings
emit `teams-settings-close`; the host controls the `open` attribute. Personal
preferences apply immediately, while connection changes require Apply and
reconnect.

```ts
import { registerOfficeUi } from 'ooxml-ui';
registerOfficeUi(); // defines every element, idempotent
```

## Install

Applications using a viewer receive this package as a dependency. For a custom
Office UI, install it directly:

```bash
npm install ooxml-ui
```

## Quick start

```js
import { registerOfficeUi } from 'ooxml-ui';

registerOfficeUi();
const button = document.createElement('office-ui-button');
button.setAttribute('label', 'Save');
button.setAttribute('command', 'save');
button.addEventListener('office-command', (event) => console.log(event.detail));
document.body.append(button);
```

## API: entries (ESM only)

The shared `office-ui-gallery` also supports `mode="panel"` for modal pickers.
It displays labelled preview tiles directly, keeps focus when a pick refreshes the
selection, and supports arrow, Home and End keys. Panel mode has no dropdown
trigger or popup; `open` remains false. XLSX uses this mode for chart types while
PowerPoint continues to use the same component for ribbon galleries.

| Entry               | Contents                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| `ooxml-ui`          | everything below plus `registerOfficeUi()` and `OFFICE_UI_TAGS`                                              |
| `ooxml-ui/theme`    | `THEME_CSS`, `installOfficeUiTheme()` (tokens, dark mode, forced-colors, touch targets)                      |
| `ooxml-ui/icons`    | icon registry (`registerIcon`, `getIcon`, `listIcons`) and `<office-ui-icon>`                                |
| `ooxml-ui/controls` | button, checkbox, switch, select, ribbon group, toolbar, dialog, status bar and item, zoom slider, tab strip |
| `ooxml-ui/presence` | `<office-ui-presence>` avatar stack for collaboration awareness                                              |
| `ooxml-ui/smartart` | `<office-ui-smartart>`: draws a core `DiagramDrawing` as SVG                                                 |

Every entry declares an `import` and a `default` export condition, so CommonJS consumers on Node 20.19+ or 22.12+ load it through `require(esm)`.

Importing an entry never touches the DOM (SSR-safe). Elements are defined by the `define*` /
`register*` functions, which are idempotent, no-ops without a `window`, and refuse to coexist
with an incompatible build of this package.

## Features: elements

`office-ui-menu-button` accepts `submenu` when nested inside another menu.
Its trigger becomes a menu item; hover, click or ArrowRight opens the child
panel beside the parent, with viewport edge placement. ArrowLeft or Escape
returns focus to its trigger; choosing a command closes the whole menu tree.
Arrow navigation stays within the current menu and skips disabled entries.

| Tag                                                   | Attributes / properties                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Events (all bubble, composed)                                                                                                                                                                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `office-ui-button`                                    | `label`, `icon`, `command`, `disabled`, `pressed`, `expanded`, `icon-only`, `variant="stacked"`, `keyshortcuts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `office-command` `{ command }`                                                                                                                                                                                                                    |
| `office-ui-checkbox`, `office-ui-switch`              | `checked`, `disabled`, `value`, `aria-label`; form-associated                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `input`, `change`                                                                                                                                                                                                                                 |
| `office-ui-select`                                    | `<option>` / `<optgroup>` children (`data-display-label`, `data-description`, font previews) or the `options` property `[{ value, label, disabled? }]`; `value`, `selectedIndex`, `disabled`, `aria-label`, `variant="ribbon-font"                                                                                                                                                                                                                                                                                                                                                                                                               | "ribbon-icon"`, `data-font-picker`; `icon`and`custom` slots; arrows, Home, End, PageUp/PageDown, typeahead                                                                                                                                        | `input`, `change` |
| `office-ui-ribbon-group`                              | `label`, `launcher` (dialog launcher command), `launcher-disabled`; default slot                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | launcher: `office-command` `{ command }`                                                                                                                                                                                                          |
| `office-ui-ribbon-stack`                              | `orientation="horizontal"`; default slot (three-row column of small commands by default)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | none                                                                                                                                                                                                                                              |
| `office-ui-menu-button` / `-menu-item`                | button: `label`, `icon`, `command` (split button), `variant`, `disabled`, `keyshortcuts`; item: `command`, `label`, `icon`, `disabled`, `checked`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | item choice: `office-command` `{ command }`                                                                                                                                                                                                       |
| `office-ui-toolbar`                                   | `aria-label`, `aria-orientation`; arrow-key focus movement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | none                                                                                                                                                                                                                                              |
| `office-ui-dialog`                                    | `open`, `heading`, `dismissible="false"`, `show()`, `close()`; slots default, `footer`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `office-dialog-close` `{ reason }` (cancelable)                                                                                                                                                                                                   |
| `office-ui-status-bar` / `-status-item`               | `label`, `value`, `interactive`, `id`; controlled bar: `state` `{ items?, toggles?, views?, zoom? }` with `summary`, `collaboration` and `end` slots                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `office-status-activate` `{ id }`                                                                                                                                                                                                                 |
| `office-ui-zoom-slider`                               | `value` (percent), `min`, `max`, `step`, `disabled`, `fit` (fit button name), `label`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `input`, `change`; fit: `office-command` `{ command: 'zoom-fit' }`                                                                                                                                                                                |
| `office-ui-color-grid`                                | Office's colour picker body: `themeColors` (ten base colours; Theme Colors grid with lighter and darker variants), `themeNames` (a product's own column names), `variantLabel` (names a variant swatch, for a translated product), `extraColors` (one more theme-bound row), `standardColors`, `recentColors`, `value`, `none-label`, `automatic-label`, `more-label`, `label`, `disabled`; events `office-color-pick` `{ color, source, label, theme?, index? }` (a theme swatch reports its column and variant so a product can save a theme reference) and `office-color-more`. The palette maths is `ooxml-core/color` (`buildThemePalette`) |
| `office-ui-color-custom`                              | The Custom tab of Office's Colors dialog: a hue and saturation square, a luminance slider, Hex, Red/Green/Blue and Hue/Sat/Lum fields (0-255) and New over Current swatches. `value` (`#rrggbb`), `current`, `label`, `disabled`, `valid`; event `office-color-change` `{ color }`                                                                                                                                                                                                                                                                                                                                                               |
| `office-ui-tab-strip`                                 | `tabs` `[{ id, label, title? }]`, `selected`, `label`, `previous-label`, `next-label`, `add-label`, `add-disabled`, `add-title`, `disabled`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `office-tab-select` `{ id }` (cancelable); add: `office-command` `{ command: 'tab-add' }`                                                                                                                                                         |
| `office-ui-context-menu` / `office-ui-menu-separator` | Children mode: `label`, `openAt(x, y)`, `close()`, `open` over `office-ui-menu-item` and separator children. Controlled mode: `state` `{ x, y, label, items: [{ id, label, separatorBefore?, heading?, danger?, disabled?, checked?, icon? }], markers?, zIndex?, autoFocus? }`; arrows, Home, End and type-ahead in both                                                                                                                                                                                                                                                                                                                        | children: item `office-command` `{ command }`; controlled: `office-menu-request` `{ id }`, `office-menu-close` `{ reason }` (never closes itself)                                                                                                 |
| `office-ui-command-search`                            | `commands` `[{ id, label, keywords?, description?, disabled?, title? }]`, `placeholder`, `label`, `limit` (Office's "Tell me what you want to do")                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | choice: `office-command` `{ command }`                                                                                                                                                                                                            |
| `office-ui-options-dialog`                            | `categories` `[{ id, label, description?, disabled?, sections: [{ id, title, controls }] }]` (controls: `toggle`, `select`, `number`, `text`, each optionally `disabled` with a reason), `values`, `category`, `open`, `heading`, `show()`, `close()`                                                                                                                                                                                                                                                                                                                                                                                            | OK: `office-options-change` `{ values, changed }`                                                                                                                                                                                                 |
| `office-ui-account`                                   | `profile` `{ displayName, avatarColor, initial? }`; slots `sign-in` and default (product sections)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `office-profile-change` `{ profile }`                                                                                                                                                                                                             |
| `office-ui-ribbon`                                    | Tab row over tab panels. Panels are children with `data-ribbon-tab`, `data-label`, optional `data-tab-keytip`; slots `quick-access`, `search`, `end`, `actions` (right end of the tab row); `selected`, `label`, `file-label`, `no-file`, `file-expanded`, `file-keytip`; `focusFile()`, `focusTab()`                                                                                                                                                                                                                                                                                                                                            | `office-ribbon-select` `{ tab }` (cancelable), `office-ribbon-file`                                                                                                                                                                               |
| `office-ui-backstage`                                 | `items` `[{ id, label, group?: 'footer', disabled?, title? }]`, `open`, `selected`, `label`, `back-label`, `show(page?)`, `close()`; pages are children with `data-backstage-page`                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `office-backstage-select` `{ id }` (cancelable), `office-backstage-close` `{ reason }` (cancelable)                                                                                                                                               |
| `office-ui-find-bar`                                  | `open`, `label`, `input-label`, `placeholder`, `maxlength`, `disabled`, `navigation-disabled`, `previous-label`, `next-label`, `close-label`; `value`, `status`, `statusTitle`, `show()`, `close()`                                                                                                                                                                                                                                                                                                                                                                                                                                              | `office-find-input` `{ query }`, `office-find-step` `{ direction }`, `office-find-close`                                                                                                                                                          |
| `office-ui-ruler`                                     | `orientation="vertical"`, `origin` (px offset of zero), `scale` (px per unit, default 96), `direction="reverse"`; decorative                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | none                                                                                                                                                                                                                                              |
| `office-ui-print-preview`                             | `pages` (rendered nodes; an inert clone of the current one is shown), `index`, `label`, `empty-label`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `office-print-preview-page` `{ index }`                                                                                                                                                                                                           |
| `office-ui-radio`                                     | `checked`, `disabled`, `value`, `name`; radios of one tag sharing a `name` form a roving-focus group; form-associated                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `input`, `change`                                                                                                                                                                                                                                 |
| `office-ui-search`                                    | `value`, `placeholder`, `disabled`, `aria-label`, `variant="titlebar"`; `focus()`, `select()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `input`, `change`                                                                                                                                                                                                                                 |
| `office-ui-ribbon-toggle`                             | `label`, `checked`, `disabled`, `title`, `command` (a labelled ribbon checkbox row; static `checkboxTag` picks the inner checkbox)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `office-toggle` `{ command, checked }`                                                                                                                                                                                                            |
| `office-ui-dialog-footer`                             | `state` `{ actions: [{ id, label, variant?, icon?, disabled?, busy?, title?, align?, testId? }] }`, `focusAction(id)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `office-dialog-footer-request` `{ id }`                                                                                                                                                                                                           |
| `office-ui-toasts`                                    | `state` `{ toasts: [{ id, code?, severity, message }], overflowCount?, labels? }`; hidden when empty, host positions it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `office-toasts-request` `{ id: 'dismiss', toastId }` or `{ id: 'dismissAll' }`                                                                                                                                                                    |
| `office-ui-read-only-banner`                          | `state` `{ kind, message, passwordPromptOpen?, passwordError?, checkingPassword?, labels? }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `office-read-only-request` (Edit anyway, Dismiss, password submit or cancel)                                                                                                                                                                      |
| `office-ui-paste-options`                             | `state` `{ left, top, options: [{ id, label }], label? }`; fixed 4px past the pasted object                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `office-paste-options-request` `{ format }`, `office-paste-options-dismiss`                                                                                                                                                                       |
| `office-ui-title-bar`                                 | `state` `{ appMark?, fileName, status?, tone?, autosave?, quickAccess?: { label, items, showLabels? }, search? }`, `placement` (`titleBar`, `belowRibbon`); slots `collaboration`, `account`; tokens `--office-title-bar-*`                                                                                                                                                                                                                                                                                                                                                                                                                      | `office-autosave-toggle`, `office-command` `{ command }`, `office-command-search` `{ query, command? }`                                                                                                                                           |
| `office-ui-ribbon-section`                            | `groups` `[{ id, label, commands: [{ id, label, icon, title?, size?, badge?, disabled?, active?, compact?, hidden?, caret?, pressed?, expanded?, column? }] }]`; keyed groups and commands in the light DOM                                                                                                                                                                                                                                                                                                                                                                                                                                      | the commands' own events (`office-command`)                                                                                                                                                                                                       |
| `office-ui-gallery`                                   | `state` `{ id, label, moreLabel?, disabled?, command?, sections: [{ title?, columns, tileWidth, tileHeight, items: [{ id, label, applied?, preview? }] }], inline? }`, `mode` (`inline`), `chevron-only`, `icon`; `open`, `disabled`, `close()`; tiles in light DOM (`data-gallery-item`), previews parsed by `parseSvgPreview`                                                                                                                                                                                                                                                                                                                  | `office-gallery-pick` `{ gallery, itemId }`                                                                                                                                                                                                       |
| `office-ui-comments-pane`                             | `threads` `[{ id, anchorLabel?, resolved, comments: [{ id, author, initials?, color?, created?, text, edited? }] }]`, `activeThreadId`, `read-only` (controls disabled), `list-only` (navigation list only), `closable`, `add-disabled`, `currentAuthor` (may edit own comments), `labels` (every string), `classNames` (`{ thread?, comment? }` product hook classes), `locale`; arrows, Home and End between threads, Enter or Space selects                                                                                                                                                                                                   | `comment-add` `{ text }`, `comment-reply` `{ threadId, text }`, `comment-edit` `{ threadId, commentId, text }`, `comment-delete` `{ threadId, commentId }`, `thread-resolve` / `thread-reopen` / `thread-select` `{ threadId }`, `comments-close` |
| `office-ui-presence`                                  | `participants`, `max`, `label`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `office-presence-select` `{ id }`                                                                                                                                                                                                                 |
| `office-ui-smartart`                                  | `drawing` (core `DiagramDrawing`), `schemeColors`, `label`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `office-smartart-render` (render report)                                                                                                                                                                                                          |
| `office-ui-icon`                                      | `name`, `label`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | none                                                                                                                                                                                                                                              |

The local profile behind `office-ui-account` is stored on the device only, under one suite-wide
key (`readOfficeProfile`, `writeOfficeProfile`, `clearOfficeProfile`), so every Office viewer on
an origin shows the same name and avatar colour.

`attachKeyTips(scope)` (from `ooxml-ui/controls`) adds Office KeyTips to any element or shadow
root: press and release Alt to show badges on controls marked `data-keytip="H"`, type a badge to
activate it (controls inside open shadow roots of shared elements, such as ribbon tabs, are included), and use `data-keytip-panel` / `data-keytip-level` for a tab's second level. Escape
steps back; disabled controls are dimmed and never run.

Elements with intent events read their event name and test-id prefix from static class fields (`requestEvent`, `testIdPrefix`), so a product can register a subclass under its own tag that keeps its published contract.

Setting a property never emits an event; only user activation does. Controls honour
`prefers-color-scheme`, `forced-colors: active` (system colours and a visible focus ring) and
coarse pointers (44px targets through `--office-target-size`).

## Ribbon add-in tabs

A host application can add its own ribbon tabs after a product's tabs, as an
Office add-in does (the ACROBAT tab in Visio and Excel). The tab is plain data,
and the same descriptor works in every editor: `ribbonAddIns` is a property of
`<visio-viewer>`, `<xlsx-editor>` and `<docx-editor>` and a prop of each of their
framework bindings, and a prop of the five PowerPoint viewers (which draw their
own ribbon; see `pptx-ui-ribbon-add-in` and `viewers/pptx/docs/guide/customization.md`).

```ts
import type { RibbonAddInTab } from 'ooxml-ui';

const tab: RibbonAddInTab = {
	id: 'reports',
	label: 'Reports',
	groups: [
		{
			label: 'Export',
			commands: [
				{ id: 'export', label: 'Export', icon: 'save', run: () => exportReport() },
				{ id: 'options', label: 'Options', icon: 'settings', size: 'small' },
				{ id: 'send', label: 'Send', items: [{ id: 'send-mail', label: 'By mail' }] },
			],
		},
	],
};
editor.ribbonAddIns = [tab];
editor.addEventListener('office-ribbon-add-in', (event) => {
	const { tab, command } = event.detail; // 'reports', 'export'
});
```

- A command runs its `run` callback and then dispatches the bubbling, composed
  `office-ribbon-add-in` event (`{ tab, command }`) from the editor. It never
  reaches the product's own command router, Tell me or key tips.
- The elements a panel is built from are defined on demand, and a panel whose
  look did not change is kept across assignments, so passing a new array with
  new callbacks on every render is cheap and never closes an open drop-down.
- In the PowerPoint ribbon a drop-down (`items`) is drawn as its items, and the
  phone toolbar does not list host tabs.
- `size: 'small'` commands fill columns of three; `items` makes a drop-down.
  `icon` is a name from the shared icon set; `registerIcon` adds your own.
- Assign a new array to change the tabs; an empty array removes them. A tab
  whose id is empty, repeated or equal to a built-in tab id is skipped, so an
  add-in cannot replace a product tab.
- The descriptor types and the event name are DOM-free and live in
  `ooxml-core/ribbon`; `ooxml-ui` re-exports them.
- Products render the list with `syncRibbonAddIns(ribbon, tabs, options)`
  (`src/ribbon/add-in-tabs.ts`); a new product editor calls it rather than
  building panels itself.

## Design tokens

Every control is token based: no colour, length, radius, font size, shadow, duration or layer
is written literally. `OFFICE_TOKENS` (from `ooxml-ui/theme`) is the single table of
`--office-*` tokens and their defaults; controls read them through `tok(name)`, which expands to
`var(--office-…, <default>)`, so they render correctly with or without the installed theme.
`THEME_CSS` declares every default on `:root`, plus dark-mode and forced-colours values. Override
any token on `:root` or on any container to retheme or resize the suite:

- semantic colours: `--office-foreground`, `-background`, `-surface`, `-selected`, `-border`,
  `-accent`, `-accent-foreground`, `-ring`, `-danger`, `-warning`, `-info`, `-popover`, `-overlay`,
  `-notice-*`, `-paper`;
- scales: `--office-space-*`, `--office-radius-*`, `--office-font-size-*`, `--office-icon-size-*`,
  `--office-control-height-*`, `--office-shadow-*`, `--office-duration-*`, `--office-z-*`;
- component tokens that default to the scales, for example `--office-checkbox-size`,
  `--office-switch-width`, `--office-ribbon-tab-height`, `--office-backstage-nav-width` and
  `--office-dialog-max-width`.

Only the two layout breakpoints (`COMPACT`, `TOUCH`) are literal, because CSS does not allow
custom properties in media queries. A test fails when any control's stylesheet contains a raw
colour or length outside a token, or references an undeclared token.

### Theming a product

A product whose theme variables follow the shadcn names (`--<prefix>foreground`,
`-muted-foreground`, `-card`, `-primary`, `-destructive`, ...) bridges it in one line:
`shadcnBridge(':host', '--dve-')` (from `ooxml-ui/theme`) returns the CSS that feeds every
`--office-*` colour from it. `themeBridge(selector, map)` takes any mapping. Declare the result on
the product's root (or `:host` inside its shadow root) rather than `:root`, so a nested theme or
a dark scheme keeps working.

## Custom Elements Manifest

`custom-elements.json` (the package's `customElements` field, also exported as
`ooxml-ui/custom-elements.json`) lists every element with its attributes, properties and events,
for framework bindings and editor tooling. Properties and attributes are read from the live classes;
events are the names each element fires, taken from its source, so an event dispatched under a name
built at run time would be missing. A test fails while the file is out of date: run
`bun run --cwd src/ui gen:manifest` after changing an element.

`office-ui-smartart` shows the drawing the producing application cached; it never lays out a
diagram itself. Preset outlines it cannot draw are rendered as rectangles, gradient and pattern
fills are approximated, and 3D is flattened. All of that is listed in the `office-smartart-render`
event detail (`approximatedGeometries`, `approximatedFills`, `flattened3d`); nothing is hidden.

## Scope

Only what every Office product needs lives here. Product-specific ribbon content (PowerPoint
slides, transitions, animations; Word styles and review) stays in the viewers. See
`docs/ooxml-ui-plan.md` in the repository for what moves when, and how the `pptx-ui-*` tags
become aliases of `office-ui-*`.

## Development

```
bun install
bun run build                              # build core declarations first
bun run --cwd src/ui typecheck
bun run --cwd src/ui test
bun run --cwd src/ui build
bun run --cwd src/ui test:package
```

The Teams PowerPoint preview consumes `src/core/dist/pptx` declarations during
UI typechecking. The core PPTX area still uses relaxed compiler settings;
importing its source into the strict UI project would bypass that boundary.
The UI build first stages PowerPoint declarations in the ignored `.types-pptx`
directory, so the strict Teams build can consume the DOM adapter's declarations
without importing legacy source or overwriting its declaration inputs.
`bun run typecheck` stages the same declarations first, so it needs no prior
build; the vitest config resolves `ooxml-ui/pptx/dom` to source for the same reason.

## Documentation

`ooxml-ui/pptx/dom` exposes the framework-independent PowerPoint DOM renderer.
Use `createDefaultRegistry()` with `renderSlideStage()` to render a parsed
`PptxSlide` into a supplied `Document`. Pass the deck's canvas size, theme,
table styles, media URL map and translator (`createTranslator()` from
`ooxml-ui/pptx/i18n`). The stage lays out at authored dimensions and applies
the requested scale; its host must reserve the scaled width and height.
Embedded hosts own navigation, media cleanup, asset lifetimes and presentation
playback. The renderer does not provide Office editing or collaboration on its own.

`loadPresentation()` resolves slide pictures, table fills and media using the
existing core handler and returns the archive handler, media URLs and deck
metadata. Dispose the handler and call `revokeBlobUrls()` on its returned URL
list when replacing or closing the document. Its options accept the core archive
expansion budget. Set `reading: true` on a slide stage for accessible reading
content and native media controls without editing overlays.

[Core and UI source](https://github.com/ChristopherVR/ooxml) |
[Shared UI plan](https://github.com/ChristopherVR/ooxml/blob/main/docs/ooxml-ui-plan.md)

## License

Apache-2.0. Several controls are derived from `pptx-viewer`; see
`PROVENANCE.md` at the repository root.
