# Theming

The viewer draws its own chrome (ribbon, backstage, status bar, Shapes window) from shared `ooxml-ui` controls. The element reads its colours from CSS custom properties, so a host can restyle it from its own stylesheet.

## Shared `--office-*` tokens

The element follows the shared Office theme. When it connects it installs the `ooxml-ui` theme (`installOfficeUiTheme`, idempotent), and every colour it draws resolves from the `--office-*` custom properties, so the `--office-*` tokens are the primary way to theme it. Set them on `:root`, on a container, or on the element itself:

| Token                        | Role                                 |
| ---------------------------- | ------------------------------------ |
| `--office-background`        | Ribbon, panel and dialog surface     |
| `--office-surface`           | Window background, secondary surface |
| `--office-foreground`        | Primary text                         |
| `--office-muted-foreground`  | Secondary text                       |
| `--office-border`            | Borders                              |
| `--office-accent`            | Accent colour                        |
| `--office-accent-foreground` | Text on the accent colour            |
| `--office-ring`              | Focus ring                           |
| `--office-danger`            | Destructive and error states         |
| `--office-shadow`            | Page shadow                          |

```css
visio-viewer {
	--office-accent: #c2431f;
	--office-accent-foreground: #ffffff;
}
```

Light and dark follow the suite theme: the viewer is light by default, dark when the system prefers it, and the `data-office-theme="light" | "dark"` attribute on the document root forces one. There is no `theme` property on the element; the same switch that themes the other Office elements on the page themes the viewer.

The default accent changed with this. The viewer used to hard-code `#3955a3`; it now takes `--office-accent` (`#2563eb` in light, `#6366f1` in dark). A host that wants the previous colour sets `--office-accent: #3955a3` or the `--vv-accent` override below.

## Optional `--vv-*` overrides

The earlier `--vv-*` tokens still work. Each one, when set, wins over the `--office-*` token it aliases; when unset the viewer falls back to the shared token. Use them to restyle only this viewer without touching the rest of the page.

| Token              | Falls back to                | Role                                  |
| ------------------ | ---------------------------- | ------------------------------------- |
| `--vv-background`  | `--office-surface`           | Window background                     |
| `--vv-surface`     | `--office-background`        | Ribbon and panel surface              |
| `--vv-secondary`   | `--office-surface`           | Secondary surface                     |
| `--vv-shadow`      | `--office-shadow`            | Page shadow                           |
| `--vv-ink`         | `--office-foreground`        | Primary text                          |
| `--vv-muted`       | `--office-muted-foreground`  | Secondary text                        |
| `--vv-border`      | `--office-border`            | Borders                               |
| `--vv-accent`      | `--office-accent`            | Accent colour                         |
| `--vv-accent-soft` | 10% of the accent            | Soft accent surface (hover, selected) |
| `--vv-accent-ink`  | `--office-accent-foreground` | Text on the accent colour             |
| `--vv-focus`       | `--office-ring`              | Focus ring                            |
| `--vv-danger`      | `--office-danger`            | Destructive and error states          |

The playground sets `data-theme="light" | "dark"` on the document root and supplies matching `--vv-*` values in `demo/workspace.css` for its own page chrome (start screen, workspace shell); that file keeps working because `--vv-*` overrides still apply.

## Following the docs site theme

This site stores the visitor's appearance choice in `localStorage` under the VitePress key `vitepress-theme-appearance` (`light`, `dark` or no value, which follows the system). All the viewer sites share the `christophervr.github.io` origin, and the playground (`demo/suite-theme.js`) reads the same key at start-up and updates live on the `storage` event, so toggling the theme on this site restyles an embedded viewer without reloading it or replacing its diagram.

```ts
const key = 'vitepress-theme-appearance';
const resolve = (value: string | null) =>
	value === 'dark' || value === 'light'
		? value
		: matchMedia('(prefers-color-scheme: dark)').matches
			? 'dark'
			: 'light';

document.documentElement.dataset.theme = resolve(localStorage.getItem(key));
window.addEventListener('storage', (event) => {
	if (event.key === key || event.key === null)
		document.documentElement.dataset.theme = resolve(event.newValue);
});
```

## Status bar theme

The status bar is neutral by default, like the other editors in the suite. Desktop Visio's
"Colorful" Office theme fills it with the product colour instead. There are three ways to choose:

- **The user**: File > Options > General > Office Theme (Colorful or White). The choice is kept
  on the device.
- **The host**: the `status-bar` attribute (`colorful` or `neutral`), or the `statusBar` property,
  on `<visio-viewer>`. A host's attribute wins over the saved choice.
- **Any colours**: `--vv-status-background` and `--vv-status-ink` recolour the bar in either theme.

```html
<visio-viewer status-bar="colorful"></visio-viewer>
<visio-viewer style="--vv-status-background: #1b5e20; --vv-status-ink: #fff"></visio-viewer>
```
