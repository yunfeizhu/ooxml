<div align="center">

# ooxml

**Open, edit, validate and save Word, Excel, PowerPoint and Visio files in TypeScript, in the browser or on a server.**
One XML model, one library, ready-made editors for every major framework, and no server in the middle.

[![CI](https://github.com/ChristopherVR/ooxml/actions/workflows/ci.yml/badge.svg)](https://github.com/ChristopherVR/ooxml/actions/workflows/ci.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/ChristopherVR/ooxml/badge)](https://scorecard.dev/viewer/?uri=github.com/ChristopherVR/ooxml)
[![OpenSSF Baseline](https://www.bestpractices.dev/projects/15347/baseline)](https://www.bestpractices.dev/projects/15347)
[![npm](https://img.shields.io/npm/v/ooxml-core?label=ooxml-core)](https://www.npmjs.com/package/ooxml-core)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](../LICENSE)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg)](../CODE_OF_CONDUCT.md)

[**Open OOXML Office**](https://christophervr.github.io/ooxml/) &nbsp;&middot;&nbsp;
[**The suite**](#ooxml-office-the-whole-suite-in-one-app) &nbsp;&middot;&nbsp;
[**Quick start**](#quick-start) &nbsp;&middot;&nbsp;
[**What is here**](#what-is-in-this-repository) &nbsp;&middot;&nbsp;
[**Development**](#development) &nbsp;&middot;&nbsp;
[**Roadmap**](../docs/roadmap.md) &nbsp;&middot;&nbsp;
[**Discussions**](https://github.com/ChristopherVR/ooxml/discussions) &nbsp;&middot;&nbsp;
[**Contributing**](../CONTRIBUTING.md)

<table>
<tr>
<td align="center" width="33%">
<a href="../viewers/pptx#readme"><strong>PowerPoint</strong></a><br>
<a href="../viewers/pptx#readme"><img src="../viewers/pptx/.github/assets/editor.webp" alt="The PowerPoint editor"></a><br>
<sub><a href="https://christophervr.github.io/ooxml/pptx/demo/">Demo</a> &middot; <a href="https://christophervr.github.io/ooxml/pptx/">Docs</a> &middot; <a href="../viewers/pptx#readme">README</a></sub>
</td>
<td align="center" width="33%">
<a href="../viewers/docx#readme"><strong>Word</strong></a><br>
<a href="../viewers/docx#readme"><img src="../viewers/docx/docs/public/hero-editor.webp" alt="The Word editor"></a><br>
<sub><a href="https://christophervr.github.io/ooxml/docx/demo/">Demo</a> &middot; <a href="https://christophervr.github.io/ooxml/docx/">Docs</a> &middot; <a href="../viewers/docx#readme">README</a></sub>
</td>
<td align="center" width="33%">
<a href="../viewers/xlsx#readme"><strong>Excel</strong></a><br>
<a href="../viewers/xlsx#readme"><img src="../viewers/xlsx/docs/public/hero-editor.webp" alt="The Excel editor"></a><br>
<sub><a href="https://christophervr.github.io/ooxml/xlsx/demo/">Demo</a> &middot; <a href="https://christophervr.github.io/ooxml/xlsx/">Docs</a> &middot; <a href="../viewers/xlsx#readme">README</a></sub>
</td>
</tr>
<tr>
<td align="center" width="33%">
<a href="../viewers/visio#readme"><strong>Visio</strong></a><br>
<a href="../viewers/visio#readme"><img src="../viewers/visio/docs/public/hero-viewer.webp" alt="The Visio viewer"></a><br>
<sub><a href="https://christophervr.github.io/ooxml/visio/demo/">Demo</a> &middot; <a href="https://christophervr.github.io/ooxml/visio/">Docs</a> &middot; <a href="../viewers/visio#readme">README</a></sub>
</td>
<td align="center" width="33%">
<a href="../viewers/teams#readme"><strong>OpenTeams</strong></a><br>
<a href="../viewers/teams#readme"><img src="../viewers/teams/docs/public/hero-workspace.webp" alt="The OpenTeams workspace"></a><br>
<sub><a href="https://christophervr.github.io/ooxml/teams/demo/">Demo</a> &middot; <a href="https://christophervr.github.io/ooxml/teams/">Docs</a> &middot; <a href="../viewers/teams#readme">README</a></sub>
</td>
<td align="center" width="33%">
<a href="../apps/office-suite#readme"><strong>OOXML Office</strong></a><br>
<a href="../apps/office-suite#readme"><img src="assets/suite-workspace.webp" alt="OOXML Office: one workspace for every app"></a><br>
<sub><a href="https://christophervr.github.io/ooxml/">Open the app</a> &middot; <a href="#ooxml-office-the-whole-suite-in-one-app">About</a> &middot; <a href="../apps/office-suite#readme">README</a></sub>
</td>
</tr>
</table>

<sub>Select a product to open its README.</sub>

</div>

## Why ooxml?

- **Everything runs client-side.** Files never leave the user's machine: no Office install, no conversion service, no native binaries. The same library runs in browsers, Node.js, Bun, workers and serverless functions.
- **One model for every format.** Word, PowerPoint, Excel and Visio share one XML model, packaging layer, units, colours and geometry. Each format is an area of one package, not a dependency to keep in step.
- **Round-trips without losing what it does not understand.** Untouched parts stay byte-for-byte, unknown markup is preserved, and edits that would damage unsupported content are rejected instead of silently dropped.
- **Real editors, not only viewers.** Ribbons, grids, a formula engine (480+ functions), undo and redo, find and replace and real-time co-editing over Yjs, as web components with thin bindings for React, Vue, Angular, Svelte, Solid and plain JavaScript.
- **Password-protected and legacy files.** Open and save ECMA-376 encrypted packages, and read legacy `.doc`, `.xls` and `.ppt` through the sibling [`ole2`](https://github.com/ChristopherVR/ole2) codecs.
- **AI ready.** MCP servers let Claude, Cursor and other agents read and edit documents through the same code the editors use.
- **Honest about its limits.** Unsupported features are reported, never hidden, and nothing here claims Office parity or lossless export without evidence.

## OOXML Office: the whole suite in one app

[**OOXML Office**](https://christophervr.github.io/ooxml/) is the integrated application built from everything in this repository. It mounts the real Word, Excel, PowerPoint, Visio and OpenTeams editors (the same components the npm packages ship, not demo iframes) in one workspace with tabs, so you can move between a document, a workbook, a deck and a team conversation without losing your place.

<p align="center">
<a href="https://christophervr.github.io/ooxml/"><img src="assets/suite-chooser.webp" alt="The start chooser: open the whole suite, or Word, Excel, PowerPoint, Visio or Teams on its own" width="720"></a>
</p>

The first time you open it, it asks how you want to work:

- **[OOXML Office](https://christophervr.github.io/ooxml/)**: every app in one workspace, with a shared file library, one tab per open document, an app launcher, search and one assistant pane.
- **One product on its own**: [Word](../viewers/docx#readme), [Excel](../viewers/xlsx#readme), [PowerPoint](../viewers/pptx#readme), [Visio](../viewers/visio#readme) or [Teams](../viewers/teams#readme), each on its own site with its documentation and framework demos.

What the suite gives you:

- **One local library.** Import `.docx`, `.xlsx`, `.pptx` and `.vsdx` files, or create blank documents, workbooks, presentations and drawings. Files stay in your browser's IndexedDB (or the desktop app's WebView); nothing is uploaded, and Download always gives you the saved bytes.
- **Live tabs.** A document opens in one editor tab, and edits survive switching apps. Tabs close, close others and close to the right like a desktop app, saving first.
- **Office files in Teams.** Share a document in an OpenTeams channel, reopen it in its editor from the conversation and return to the channel. With a configured Teams server, files go through its storage.
- **Embedded documents.** Open the Office packages embedded in a parent document, edit them, and save child and parent together.
- **An assistant across files.** Pick files (and optionally the current conversation) and get bounded edit proposals you review, apply and undo. It talks to your own OpenAI-compatible endpoint, and nothing is applied without you.
- **Profiles and appearance.** Local profiles with separate libraries, plus Light, Dark and System appearance and accent themes shared by every editor.
- **Install it.** The root installs as a PWA, and each product also installs on its own (`/apps/word/`, `/apps/excel/`, `/apps/powerpoint/`, `/apps/visio/`, `/apps/teams/`), sharing one profile and library on the same origin. A [desktop build](../desktop/README.md) (Tauri) wraps the same bundle and adds a native folder picker.

Its boundaries are written down: profiles are local conveniences, not sign-in; there is no cloud drive or Microsoft 365 integration; and document co-authoring is not wired to suite files yet. The full list is in [suite integration](../docs/suite-integration.md). The source is the private [`apps/office-suite`](../apps/office-suite#readme) package; run it locally with `bun run build:suite && bun run preview:suite`.

## The products

Each product name opens its README, with install steps and a snippet for every framework.

| Product                                         | Live demo                                                 | Install                                  | What you get                                                                                 |
| ----------------------------------------------- | --------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| **[PowerPoint](../viewers/pptx#readme)**        | [Demo](https://christophervr.github.io/ooxml/pptx/demo/)  | `npm i pptx-react-viewer`                | React, Vue, Angular, Svelte and vanilla bindings, with editing, presenting and collaboration |
| **[Word](../viewers/docx#readme)**              | [Demo](https://christophervr.github.io/ooxml/docx/demo/)  | `npm i docx-react-viewer`                | `<docx-editor>`; React, Vue, Angular, Svelte, Solid and vanilla bindings                     |
| **[Excel](../viewers/xlsx#readme)**             | [Demo](https://christophervr.github.io/ooxml/xlsx/demo/)  | `npm i @christophervr/xlsx-react-viewer` | `<xlsx-editor>`; the same six bindings                                                       |
| **[Visio](../viewers/visio#readme)**            | [Demo](https://christophervr.github.io/ooxml/visio/demo/) | `npm i visio-react-viewer`               | A local-first viewer; the same six bindings                                                  |
| **[OpenTeams](../viewers/teams#readme)**        | [Demo](https://christophervr.github.io/ooxml/teams/demo/) | `npm i openteams-react-viewer`           | A bring-your-own-server workspace: chat, calls and shared Office files                       |
| **[OOXML Office](../apps/office-suite#readme)** | [Open](https://christophervr.github.io/ooxml/)            | not published                            | The integrated suite above, as a web app, installable PWAs and a desktop build               |
| **[Headless](../src/core#readme)**              |                                                           | `npm i ooxml-core`                       | Parse, edit, validate and write every format, with no UI                                     |
| **[AI agents](../mcp#readme)**                  |                                                           | `npm i ooxml-mcp`                        | One MCP server for every format                                                              |

## Quick start

**Headless: open a Word document, change it, save it**

```ts
import { loadDocx } from 'ooxml-core/docx';

const loaded = await loadDocx(bytes); // Uint8Array | ArrayBuffer
loaded.model.blocks; // paragraphs and tables
const edited = await loaded.save(); // original package parts are preserved
```

**An editor in your app (React shown; every framework has the same shape)**

```tsx
import { useState } from 'react';
import { createDocument, WordEditor } from 'docx-react-viewer';

export function Editor() {
	const [model, setModel] = useState(() => createDocument());
	return <WordEditor documentModel={model} onDocumentChange={setModel} />;
}
```

Each product's README has the snippet for every framework: [PowerPoint](../viewers/pptx#readme), [Word](../viewers/docx#readme), [Excel](../viewers/xlsx#readme), [Visio](../viewers/visio#readme) and [OpenTeams](../viewers/teams#readme). The library's areas and API are in the [`ooxml-core` README](../src/core#readme), and the [MCP server](../mcp#readme) has its own setup.

## How it fits together

```
pptx-*-viewer       ┐
docx-*-viewer       │
xlsx-*-viewer       │  framework bindings: lifecycle and events only
visio-*-viewer      ├── ooxml-ui ──┐   Lit web components: ribbons, grids, dialogs (DOM only)
openteams-*-viewer  ┘              │
                                   ├── ooxml-core ──┬── ole2 (legacy binary codecs)
ooxml-mcp ─────────────────────────┘   (all logic)   ├── emf-converter
                                                      └── mtx-decompressor
```

- **`ooxml-core`** owns the logic: packaging, XML, every format's model, parser, writer and editing commands, layout, validation and collaboration. It has no UI.
- **`ooxml-ui`** owns the DOM: the shared elements and the product editors as `ooxml-ui/<product>` subpaths. The core never imports it.
- **Viewers** own only the framework bindings, demos, end-to-end tests and docs. They never copy logic from the library.

## What is in this repository

The logic of every Office product lives in this repository, and so do the interfaces for PowerPoint, Word, Excel, Visio and OpenTeams. They are all members of one Bun workspace with one lockfile. Each folder below links to its own README.

| Folder                                             | Published as                                             | What it is                                                                                                                                                                                                                    |
| -------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`src/core`](../src/core#readme)                   | [`ooxml-core`](https://www.npmjs.com/package/ooxml-core) | The library: every format's model, parser, writer, editing commands, layout and the shared areas under them. No UI. Its README is the package's npm page.                                                                     |
| [`src/ui`](../src/ui#readme)                       | [`ooxml-ui`](https://www.npmjs.com/package/ooxml-ui)     | The shared browser elements (Lit web components): ribbons, dialogs, menus, the title and status bars, and the Word, Excel, Visio and OpenTeams editors as `ooxml-ui/<product>` subpaths. DOM only; the core never imports it. |
| [`mcp/`](../mcp#readme)                            | [`ooxml-mcp`](https://www.npmjs.com/package/ooxml-mcp)   | The combined MCP server that lets an AI assistant work with Office documents.                                                                                                                                                 |
| [`viewers/pptx`](../viewers/pptx#readme)           | PowerPoint packages (below)                              | The PowerPoint editor and its bindings for React, Vue, Angular, Svelte and vanilla JavaScript, its CLI and MCP tools. [Docs and demos](https://christophervr.github.io/ooxml/pptx/).                                          |
| [`viewers/docx`](../viewers/docx#readme)           | Word packages (below)                                    | The Word editor (`<docx-editor>`) and its bindings for React, Vue, Angular, Svelte, Solid and vanilla JavaScript. [Docs and demos](https://christophervr.github.io/ooxml/docx/).                                              |
| [`viewers/xlsx`](../viewers/xlsx#readme)           | Excel packages (below)                                   | The Excel editor (`<xlsx-editor>`) and its bindings. [Docs and demos](https://christophervr.github.io/ooxml/xlsx/).                                                                                                           |
| [`viewers/visio`](../viewers/visio#readme)         | Visio packages (below)                                   | The local-first Visio viewer and its bindings. [Docs and demos](https://christophervr.github.io/ooxml/visio/).                                                                                                                |
| [`viewers/teams`](../viewers/teams#readme)         | OpenTeams packages (below)                               | A bring-your-own-server team workspace (channels, chat, calls, shared Office files), its bindings and a reference server. [Docs and demos](https://christophervr.github.io/ooxml/teams/).                                     |
| [`apps/office-suite`](../apps/office-suite#readme) | not published                                            | The [OOXML Office](#ooxml-office-the-whole-suite-in-one-app) application: the integrated suite, the standalone PWAs and the desktop frontend.                                                                                 |
| [`site/`](../site)                                 | not published                                            | The HTML and CSS shell of the app at https://christophervr.github.io/ooxml/. Each viewer's documentation and demos are built into the same site, under `/pptx/`, `/docx/`, `/xlsx/`, `/visio/` and `/teams/`.                 |

<details>
<summary><strong>Every published package</strong></summary>

- **PowerPoint**: [`pptx-viewer-mcp`](../viewers/pptx/packages/tools#readme), [`pptx-viewer-core`](../viewers/pptx/packages/core#readme), [`pptx-react-viewer`](../viewers/pptx/packages/react#readme), [`pptx-vue-viewer`](../viewers/pptx/packages/vue#readme), [`pptx-angular-viewer`](../viewers/pptx/packages/angular#readme), [`pptx-svelte-viewer`](../viewers/pptx/packages/svelte#readme), [`pptx-vanilla-viewer`](../viewers/pptx/packages/vanilla#readme), [`@christophervr/pptx-viewer`](../viewers/pptx/packages/cli#readme)
- **Word**: [`docx-viewer-mcp`](../viewers/docx/mcp#readme), [`docx-core`](../viewers/docx/packages/core#readme), [`docx-react-viewer`](../viewers/docx/packages/react#readme), [`docx-vue-viewer`](../viewers/docx/packages/vue#readme), [`docx-angular-viewer`](../viewers/docx/packages/angular#readme), [`docx-svelte-viewer`](../viewers/docx/packages/svelte#readme), [`docx-solid-viewer`](../viewers/docx/packages/solid#readme), [`docx-vanilla-viewer`](../viewers/docx/packages/vanilla#readme)
- **Excel**: [`xlsx-viewer-mcp`](../viewers/xlsx/mcp#readme), [`@christophervr/xlsx-core`](../viewers/xlsx/packages/core#readme), [`@christophervr/xlsx-react-viewer`](../viewers/xlsx/packages/react#readme), [`xlsx-vue-viewer`](../viewers/xlsx/packages/vue#readme), [`xlsx-angular-viewer`](../viewers/xlsx/packages/angular#readme), [`xlsx-svelte-viewer`](../viewers/xlsx/packages/svelte#readme), [`xlsx-solid-viewer`](../viewers/xlsx/packages/solid#readme), [`xlsx-vanilla-viewer`](../viewers/xlsx/packages/vanilla#readme)
- **Visio**: [`visio-viewer-mcp`](../viewers/visio/mcp#readme), [`visio-core`](../viewers/visio/packages/core#readme), [`visio-react-viewer`](../viewers/visio/packages/react#readme), [`visio-vue-viewer`](../viewers/visio/packages/vue#readme), [`visio-angular-viewer`](../viewers/visio/packages/angular#readme), [`visio-svelte-viewer`](../viewers/visio/packages/svelte#readme), [`visio-solid-viewer`](../viewers/visio/packages/solid#readme), [`visio-vanilla-viewer`](../viewers/visio/packages/vanilla#readme)
- **OpenTeams**: [`openteams-react-viewer`](../viewers/teams/packages/react#readme), [`openteams-vue-viewer`](../viewers/teams/packages/vue#readme), [`openteams-angular-viewer`](../viewers/teams/packages/angular#readme), [`openteams-svelte-viewer`](../viewers/teams/packages/svelte#readme), [`openteams-solid-viewer`](../viewers/teams/packages/solid#readme), [`openteams-vanilla-viewer`](../viewers/teams/packages/vanilla#readme), [`openteams-server`](../viewers/teams/server#readme)
- **Library and shared**: [`ooxml-core`](../src/core#readme), [`ooxml-ui`](../src/ui#readme), [`ooxml-mcp`](../mcp#readme)

</details>

The viewers keep only what is specific to a framework: the bindings, demos, end-to-end tests and docs. Format logic stays in `src/core/`, and a viewer must not copy it.

## Fidelity and compatibility

These are early implementations. They are approximations of the Office applications, not parity, and saving is not lossless for content a model does not cover. Features a product does not support are reported rather than hidden, and each viewer's docs list its known gaps ([Word](https://christophervr.github.io/ooxml/docx/), [Excel](https://christophervr.github.io/ooxml/xlsx/features), [Visio](https://christophervr.github.io/ooxml/visio/)). The [roadmap](../docs/roadmap.md) says what comes next.

## Development

You need [Bun](https://bun.sh/) and Node.js 22 or newer. One install at the root sets up the library, the UI and every viewer.

```bash
bun install
bun run typecheck      # strict project and the pptx project
bun run test           # the library's unit tests
bun run build          # the library
bun run test:package   # packs the build and imports every entry point from a clean install
```

The viewers resolve `ooxml-ui` to the copy in this workspace through its built `dist`, so build the library and the UI before working on one:

```bash
bun run build && bun run --cwd src/ui build
cd viewers/docx        # or pptx, xlsx, visio, teams
bun run typecheck && bun run test
bun run demo           # docx, xlsx: the demo app (visio, teams: bun run dev)
```

Each viewer has its own scripts and browser tests; the root `typecheck`, `test`, `fmt` and `lint` do not cover `viewers/`. CI (`.github/workflows/ci.yml`) decides from the files a change touches what to run, including which viewers to verify.

Releases are automated. Every published package has its own version and tag (`<npm-name>@<version>`), planned from conventional commits, with changelogs and npm publishing through trusted publishing (OIDC, with provenance). See [docs/releasing.md](../docs/releasing.md). Commits must follow [Conventional Commits](../CONTRIBUTING.md), and nobody publishes or tags by hand.

The working agreements are in [AGENTS.md](../AGENTS.md), and [PROVENANCE.md](../PROVENANCE.md) records where each module came from.

## Documentation and related projects

- The viewers, in this repository under `viewers/` ([pptx](https://christophervr.github.io/ooxml/pptx/), [docx](https://christophervr.github.io/ooxml/docx/), [xlsx](https://christophervr.github.io/ooxml/xlsx/), [visio](https://christophervr.github.io/ooxml/visio/), [teams](https://christophervr.github.io/ooxml/teams/)): the editors and viewers built on this package.
- [OOXML Office](https://christophervr.github.io/ooxml/): the integrated suite (`apps/office-suite`, with its shell in `site/`). Each viewer's docs and demos are built into the same site.
- [ole2](https://github.com/ChristopherVR/ole2): the compound-file container and legacy binary Office codecs.
- [emf-converter](https://github.com/ChristopherVR/emf-converter) and [mtx-decompressor](https://github.com/ChristopherVR/mtx-decompressor): EMF/WMF rendering and embedded-font (MicroType Express) decompression, used by the library.

## Community and support

- **Questions and usage help:** ask in [Discussions, Q&A](https://github.com/ChristopherVR/ooxml/discussions/categories/q-a) and mark the answer that solved it.
- **Ideas:** talk them through in [Ideas](https://github.com/ChristopherVR/ooxml/discussions/categories/ideas); agreed ones become feature requests.
- **Built something?** Share it in [Show and tell](https://github.com/ChristopherVR/ooxml/discussions/categories/show-and-tell).
- **Bugs and fidelity gaps:** open an [issue](https://github.com/ChristopherVR/ooxml/issues/new/choose), ideally with a sample file.
- **Security problems:** report them privately, see [SECURITY.md](../SECURITY.md).

## License

[Apache-2.0](../LICENSE). Third-party notices are in [NOTICE](../NOTICE) and [THIRD-PARTY-LICENSES](../src/core/THIRD-PARTY-LICENSES).
