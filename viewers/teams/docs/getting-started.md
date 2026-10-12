# Getting started

OpenTeams is an open-source, bring-your-own-server team workspace: channels and chat, presence,
meetings with video and screen share over WebRTC, and Office files shared in the conversation. You
install one binding for your framework, point it at a server (or start without one), and get the
full UI, or a raw hook to build your own.

::: warning An early implementation
This is not Microsoft Teams and is not affiliated with Microsoft. There is **no end-to-end
encryption**: whoever runs the server can read every message and file. See
[Limitations](/limitations) before you rely on it.
:::

## 1. Install a binding

Each binding is self-contained: the `<teams-app>` element is bundled in, and
[`ooxml-core`](https://www.npmjs.com/package/ooxml-core) (the logic) and
[`ooxml-ui`](https://www.npmjs.com/package/ooxml-ui) (the visual primitives) install as regular
dependencies.

::: code-group

```bash [React]
npm install openteams-react-viewer react
```

```bash [Vue]
npm install openteams-vue-viewer vue
```

```bash [Angular]
npm install openteams-angular-viewer @angular/core
```

```bash [Svelte]
npm install openteams-svelte-viewer svelte
```

```bash [Solid]
npm install openteams-solid-viewer solid-js
```

```bash [Vanilla]
npm install openteams-vanilla-viewer
```

:::

| Package                    | For                             | Peer dependency |
| -------------------------- | ------------------------------- | --------------- |
| `openteams-react-viewer`   | React 18+                       | `react`         |
| `openteams-vue-viewer`     | Vue 3.4+                        | `vue`           |
| `openteams-angular-viewer` | Angular 17+ (standalone)        | `@angular/core` |
| `openteams-svelte-viewer`  | Svelte 5                        | `svelte`        |
| `openteams-solid-viewer`   | SolidJS 1.9                     | `solid-js`      |
| `openteams-vanilla-viewer` | no framework (`<teams-app>`)    | none            |
| `openteams-server`         | the reference server (Node 22+) | none            |

Use one binding per page: each registers the same custom elements. The names are `openteams-*`
because the plain `openteams` name on npm belongs to an unrelated project.

## 2. Mount it

React:

```tsx
import { Teams } from 'openteams-react-viewer';

const config = {
	mode: 'server' as const,
	syncUrl: 'wss://teams.example.com/sync',
	signalingUrl: 'wss://teams.example.com/signal',
	iceServers: [{ urls: 'stun:stun.example.com:3478' }],
};

export function Workspace() {
	return <Teams workspaceId="acme" userName="Ada" config={config} />;
}
```

Vanilla JavaScript:

```ts
import { mountTeams } from 'openteams-vanilla-viewer';

// `config` as in the React example above.
const teams = mountTeams(document.getElementById('teams')!, {
	workspaceId: 'acme',
	userName: 'Ada',
	config,
	onOpenFile: (detail) => console.log('open', detail.attachment.kind, detail.url),
});
teams.update({ workspaceId: 'acme', userName: 'Ada Lovelace', config });
teams.destroy();
```

Or plain markup, after calling `defineTeamsApp()` from `openteams-vanilla-viewer`:

```html
<teams-app
	workspace-id="acme"
	user-name="Ada"
	server-config='{"mode":"server","syncUrl":"wss://teams.example.com/sync","signalingUrl":"wss://teams.example.com/signal","iceServers":[{"urls":"stun:stun.example.com:3478"}]}'
></teams-app>
```

Every binding takes the same props: `workspaceId` (the shared room: letters, digits, `-` and `_`),
`userName`, `userId` (a stable id; defaults to one remembered in this browser), `config`,
`uploadFile` (where attachments go), `openers` (per-Office-type handlers), and three events:
ready, open file (call `preventDefault()` on it to open the file yourself) and config change
(`onReady`, `onOpenFile`, `onConfigChange` in React, Solid, Svelte and vanilla; `@ready`,
`@open-file`, `@config-change` in Vue; `(ready)`, `(openFile)`, `(configChange)` in Angular). See the
[framework guides](/frameworks/react) for each binding.

Leave `config` out and the element offers a settings dialog (remembered in this browser) or runs
in local mode.

## 3. Choose where state lives

| Mode     | `config`                                                        | What happens                                                                                                          |
| -------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `local`  | `{ mode: 'local', iceServers: [...] }`                          | No server. Tabs of one browser share chat, presence and calls over `BroadcastChannel`. Files are shared by name only. |
| `server` | `{ mode: 'server', syncUrl, signalingUrl, iceServers, token? }` | Your server syncs the shared document, relays call signaling and (optionally) stores files.                           |

Local mode is what the [live demos](/demos) use. For anything with more than one browser, run a
server:

```bash
npx openteams-server                    # the reference server on 127.0.0.1:8787
```

Then use `ws://127.0.0.1:8787/sync` and `ws://127.0.0.1:8787/signal` (or `wss://` behind TLS).
The [server guide](/server) covers the protocol, the environment variables and what the reference
server does not do; [deploying](/deploy) covers TLS, tokens, TURN and Docker.

## 4. Or build your own UI

Each binding also exposes a raw hook over the core client: state in, plain actions out.

```tsx
import { useTeams } from 'openteams-react-viewer';

const { client, state } = useTeams({
	workspaceId: 'acme',
	user: { id: 'u1', name: 'Ada' },
	config,
});
state?.channels.map((c) => <button onClick={() => client!.select(c.id)}>{c.name}</button>);
```

`state` is one immutable `TeamsState` snapshot (connection status, channels with unread counts,
the selected channel's messages and files, people, typing, search results, the call). Actions
include `select`, `createChannel`, `send`, `startReply`, `startEdit`, `deleteMessage`,
`toggleReaction`, `search`, `openCall`, `joinCall`, `leaveCall`, `toggleMic`, `toggleCamera`,
`toggleScreenShare` and `toggleHand`. The React demo shows both styles side by side.

## Run it from source

Needs Node 22+ and Bun. With the [`ooxml`](https://github.com/ChristopherVR/ooxml) repository
checked out next to this one (`../ooxml-core`), the demos and tests use its source; without it they
use the published `ooxml-core` and `ooxml-ui`.

```bash
bun install
bun run dev        # server on :8787, vanilla demo on :5173, React demo on :5174
```

Open `http://127.0.0.1:5173/?name=Ada` and, in another tab, `...?name=Bob`: two people in one
workspace. `?local=1` runs without the server. `TEAMS_USE_DIST=1` makes the demos use the built
packages (`bun run build:packages` first) and the published ooxml packages instead of any source.
Cameras and microphones need `localhost` or HTTPS.
