# Architecture

OpenTeams is split the same way as the other products built on
[`ooxml`](https://github.com/ChristopherVR/ooxml) (Word, Excel, PowerPoint): the logic and the
visual primitives live there, and this repository (`teams-viewer`) holds only the app that
composes them, the framework bindings, a reference server and the demos.

| Layer             | Where                                                                   | Owns                                                                                           |
| ----------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Logic             | `ooxml-core/teams` (`src/core/teams` in the ooxml repository)           | the chat CRDT, presence, calls, signaling, server configuration, the `createTeamsClient` store |
| Collaboration     | `ooxml-core/collab`                                                     | Yjs sessions and transports (WebSocket, `BroadcastChannel`), format-neutral                    |
| Visual primitives | `ooxml-ui` (`src/ui/src/teams`)                                         | avatar, app rail, channel list, chat list, composer, pre-join, call grid and controls          |
| App               | `packages/web-component` here (private `teams-viewer`, never published) | `<teams-app>`: composes the primitives over the store, settings dialog, raw store helpers      |
| Bindings          | `packages/{react,vue,angular,svelte,solid,vanilla}` here                | lifecycle adapters plus a raw hook each, published as `openteams-<framework>-viewer`           |
| Reference server  | `server/` here                                                          | Yjs sync, signaling relay, file storage, published as `openteams-server`                       |

The core's own description of the area is
[`docs/teams-area.md`](https://github.com/ChristopherVR/ooxml/blob/main/docs/teams-area.md).

## The client: one state, plain actions

Everything a UI needs comes from one client created by `createTeamsClient` (the bindings wrap it as
`createTeams`, which adds a guarded `localStorage` for offline snapshots):

```ts
import { createTeams } from 'openteams-vanilla-viewer';

const teams = createTeams({ workspaceId: 'acme', user: { id: 'u1', name: 'Ada' }, config });
const stop = teams.subscribe(() => render(teams.getState())); // coalesced per tick
teams.send({ text: 'hello' });
```

`getState()` returns one immutable `TeamsState` snapshot. Every button is an action on the client.
Errors a user should see arrive as `on('notice', ...)`. The UI never touches Yjs,
`RTCPeerConnection` or the server directly: **state in, actions out**.

## `<teams-app>`

One Lit element with one template and one real CSS file (`teams-app.ts`, `teams-app.css`). It
decides what is on screen and forwards user intent to client actions; colours, spacing and radii
come from the `ooxml-ui` tokens (`var(--office-...)`). Anything a peer sent is rendered as text
(`textContent` semantics), never as markup, and the core re-validates everything it reads back
from the shared document.

## Bindings

A binding is a lifecycle adapter: it creates `<teams-app>`, forwards props with `bindTeams` (class included; `class` or `className` per framework)
and re-emits events, all in `packages/web-component/src/bind.ts`. `onOpenFile` is `(detail, event)` everywhere except Angular, whose single-value output emits `{ detail, event }`. Each
also exposes the raw hook over `createTeams`:

| Binding  | Component                       | Raw hook                                                 |
| -------- | ------------------------------- | -------------------------------------------------------- |
| React    | `<Teams />`                     | `useTeams(options)` (`useTeamsClient`, `useTeamsState`)  |
| Vue 3    | `<Teams />`                     | `useTeams(() => options)` returns shallow refs           |
| Solid    | `Teams(props)`                  | `createTeamsClient(() => options)` returns signals       |
| Svelte 5 | `Teams.svelte` (default export) | `teamsStore(options)` from `/runtime` (a readable store) |
| Angular  | `<teams-workspace>`             | `TeamsService` (signals)                                 |
| Vanilla  | `mountTeams(el, props)`         | `createTeams(options)`                                   |

A behaviour bug is fixed once, in the web component or the core. A hook or wiring bug is fixed in
every binding in the same change.

At build time `scripts/build-packages.mjs` inlines the private web component, CSS included, into
every framework bundle and flattens its declarations, so a published tarball imports only what its
manifest declares (`ooxml-core`, `ooxml-ui`, `lit` and the framework peer).

## Chat, presence and calls

- **Chat.** Channels live in one `Y.Map`, messages in one `Y.Map` per channel, reactions in a flat
  map keyed by message, emoji and user, so concurrent reactions never overwrite each other. Edits
  and deletes are author-only on the client (a delete is a soft tombstone).
- **Presence** is Yjs awareness: online people, typing and availability. Advisory and
  unauthenticated.
- **Calls** are a full mesh of peer connections using the perfect-negotiation pattern; muting, the
  camera and screen share swap tracks without renegotiating. Mesh is honest up to about a dozen
  people (`maxParticipants`, default 12).
- **Files** are links, never inlined bytes: uploaded through `uploadFile` or the server's `/files`
  endpoint. Word, Excel, PowerPoint and Visio files are recognised by name so a host can open them in
  the matching viewer (the `openers` prop or the open-file event).

## Transports

In `local` mode the client syncs and signals over `BroadcastChannel`, so only tabs of one browser
see each other; the GitHub Pages demos run this way. In `server` mode it uses the y-websocket wire
format for sync and a JSON relay for signaling; see [Bring your own server](/server).
