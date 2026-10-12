# The live demos

The same demo app is built once per framework adapter and published next to these docs. Each one is the real `<docx-editor>` running entirely in your browser: nothing is uploaded, and there is no server behind them.

| Demo                                         | Adapter               | Source                                                           |
| -------------------------------------------- | --------------------- | ---------------------------------------------------------------- |
| [React](/demo/){target="_self"}              | `docx-react-viewer`   | `demos/docx/demo-vanilla` built with `VITE_DEMO_FRAMEWORK=react` |
| [Vue](/demo-vue/){target="_self"}            | `docx-vue-viewer`     | same app, `vue`                                                  |
| [Angular](/demo-angular/){target="_self"}    | `docx-angular-viewer` | same app, `angular`                                              |
| [Svelte](/demo-svelte/){target="_self"}      | `docx-svelte-viewer`  | same app, `svelte`                                               |
| [Solid](/demo-solid/){target="_self"}        | `docx-solid-viewer`   | same app, `solid`                                                |
| [Vanilla JS](/demo-vanilla/){target="_self"} | `docx-vanilla-viewer` | same app, `vanilla`                                              |

The home page embeds them with a framework switcher: [open the live demo section](/#live-demo).

## What you can do in a demo

- Choose **Open the sample document**, or drop in a DOCX or legacy DOC file of your own. Files stay in the tab.
- Add `?sample=1` to a demo URL to open the sample document straight away, and `?locale=de` (also `fr`, `es`, `zh-CN`) to start in another interface language.
- Use the demo's theme button, or the theme toggle on this site: all the demos follow the `vitepress-theme-appearance` preference live (see [theming](/theming)).

## Collaboration demo

Add `?room=<session>` to a demo URL to join a shared session of the same browser. The window that also has `sample=1` hosts it; the others join by name, in any framework: for example `/demo-vue/?sample=1&room=my-room` and `/demo-solid/?room=my-room` in two tabs. The home page shows two panes with a framework picker for each. The [two-peer page](/demo/collaboration.html){target="_self"} adds a Pause delivery button for concurrent edits. See [collaboration](/collaboration) for what is and is not supported.

## Embedded here

<iframe
	src="/ooxml/docx/demo/?sample=1"
	title="docx-viewer live demo"
	loading="lazy"
	allow="clipboard-read; clipboard-write; fullscreen"
	style="width: 100%; height: 640px; border: 1px solid var(--vp-c-divider); border-radius: 8px"
></iframe>

## Run them locally

```bash
bun install
bun run demo
```

`bun run docs:build` (from `docs/`) builds the documentation and all six demos exactly as the Pages workflow does.
