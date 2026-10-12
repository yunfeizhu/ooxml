# The `teams` area (`ooxml-core/teams`)

The logic of an open-source, bring-your-own-server team workspace that sits beside Word, Excel,
PowerPoint and Visio: channels and chat, presence, calls (WebRTC) and links to Office files. It is
**new code** (nothing moved here), built on the `collab` area. DOM-free: storage, `fetch`, media
devices, `RTCPeerConnection` and `WebSocket` are all injectable.

The UI is split the same way as every other product:

| Layer                | Where                                                        | Owns                                                                   |
| -------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Logic                | `src/core/teams/` (this area)                                | model, chat CRDT, signaling, calls, server config, client store        |
| Visual primitives    | `src/ui/src/teams/` (`ooxml-ui/teams`)                       | `office-ui-avatar`, `-app-rail`, `-channel-list`, `-chat-list`, ...    |
| App, bindings, demos | the `teams-viewer` repository (`ChristopherVR/teams-viewer`) | `<teams-app>`, React/Vue/Solid/Svelte/Angular/vanilla bindings, server |

## The client: one state, plain actions

```ts
import { createTeamsClient } from 'ooxml-core/teams';

const teams = createTeamsClient({
	workspaceId: 'acme', // 1-128 chars of [A-Za-z0-9_-]; also the sync room
	user: { id: 'u1', name: 'Ada' },
	config, // see "Bring your own server"
	storage: localStorage, // optional: offline snapshot of the shared document and read markers
});

const stop = teams.subscribe(() => render(teams.getState())); // coalesced per tick
teams.send({ text: 'hello' });
```

`getState()` returns one immutable `TeamsState` snapshot: connection `status`, `channels` (with
unread counts and a `live` flag), the selected channel with its `messages` and `files`, `people`
(presence), `typing`, the composer's `replyingTo` / `editing`, `searchResults`, `allFiles` and
`call` (`null`, or a phase of `prejoin` / `joining` / `connected` with participants and a camera
preview). Every button is an action: `select`, `createChannel`, `send` (with file uploads),
`startReply`, `startEdit`, `deleteMessage`, `toggleReaction`, `notifyTyping`, `setAvailability`,
`search`, `openCall`, `setPrejoin`, `joinCall`, `leaveCall`, `toggleMic`, `toggleCamera`,
`toggleScreenShare`, `toggleHand`, `fileUrl` (async: a short-lived signed link, never the token), `destroy`. Errors a user should see arrive as
`on('notice', ...)`.

This is the shape every binding exposes as a raw hook (`useTeams` in React and Vue,
`createTeamsClient` in Solid, `teamsStore` in Svelte, `TeamsService` in Angular), so an app can
render its own UI without `<teams-app>`.

Lower layers, each usable alone: `createTeamsWorkspace` (collab session plus chat store plus
calls), `createChatStore(doc, user)`, `createCallSession(...)`, the signaling channels, and the
pure projections in `view.ts` (`channelViews`, `filesOf`, `searchMessages`, ...).

## Chat

Channels live in one `Y.Map`, messages in one `Y.Map` per channel, reactions in a flat map keyed
`message|emoji|user`, so two people reacting at once never overwrite each other. Edits and deletes
are author-only (a delete is a soft tombstone so threads keep their shape). Everything a peer wrote
is **re-validated when read back** (`model.ts`): markup is stripped, control characters removed,
lengths capped, attachment URLs must be `http(s)` or a same-origin path, reactions must be one short
token. The UI renders text with `textContent` semantics only.

Files are links, never inlined bytes: `send({ files })` uploads through `uploadFile` (or the
configured server's `/files` endpoint) and posts the returned URL. `detectOfficeKind` maps a name to
`docx` / `xlsx` / `pptx` / `vsdx` so a host can open it in the matching viewer.

## Calls

`createCallSession` is a full-mesh set of peer connections using the "perfect negotiation" pattern
(the side with the smaller id is polite, so glare never deadlocks). Audio and video ride two
permanent transceivers whose tracks are swapped with `replaceTrack`, so muting, turning the camera
off and sharing the screen never renegotiate. Mesh needs no media server and is honest up to about a
dozen people (`maxParticipants`, default 12); an SFU would plug in behind the same `CallSession`
surface. `iceTransportPolicy: 'relay'` forces TURN.

## Bring your own server

`TeamsServerConfig` (validated by `parseServerConfig`, which reports every problem and never
throws):

```ts
{ mode: 'local' | 'server', syncUrl?, signalingUrl?, iceServers: [...], iceTransportPolicy?, token? }
```

- **`local`**: no server. Tabs of one browser share chat and calls over `BroadcastChannel`.
- **`server`**: your server. Any server that honours these three contracts works; the reference
  implementation is `server/index.mjs` in `teams-viewer` (about 300 lines, Node and `ws`).

### Server contract

1. **Sync**: `ws(s)://host/<base>/<room>` speaks the y-websocket wire format (sync step 1/2/update,
   awareness, query-awareness; see `collab/transport-provider.ts`). A stock y-websocket server works.
   A server that keeps a `Y.Doc` per room and persists it gives history to late joiners.
2. **Signaling**: `ws(s)://host/<base>/<room>` forwards each JSON text message to the **other**
   sockets of the room, and sends `{ "type": "bye", "from": <id> }` to them when a socket closes. A
   socket speaks for one peer id (the first `from` it uses). It does not need to understand the
   messages (`signaling.ts` defines them).
3. **Files** (optional): `POST|GET <origin>/files/<workspace>/<name>`, with the token in an
   `Authorization: Bearer` header. To open a file in a browser tab the client calls
   `POST <origin>/files/link/<workspace>/<name>` (same header) and gets `{ url }` back: a link
   signed for that one file, valid for a few minutes (`?sig=...&exp=...`), so the token never
   appears in a URL.

Both sockets receive `?token=<token>` when a token is configured (a browser cannot set headers on
a WebSocket); enforce it, and an origin allowlist, on the server. Validate room names (`^[\w-]{1,128}$`) and cap message sizes.

### STUN and TURN

`iceServers` carries STUN and TURN URLs. Public STUN is enough on open networks and never enough
behind symmetric NAT: run your own TURN (for example coturn with `use-auth-secret`) and give the
clients credentials. TURN entries without credentials are rejected by `parseServerConfig`.

## Honest limits

- **No end-to-end encryption.** Chat travels as Yjs updates through your server, which can read
  them. Media is DTLS-SRTP between peers (or to your TURN relay, which cannot decrypt it).
- **Authorization is the server's job.** The `role` and author checks here are client-side; a
  hostile client can write anything the server accepts. Treat the server as the trust boundary.
- **Mesh calls scale to a handful of people**, not a webinar.
- A sync server that never compacts will grow with history; the reference server stores one
  snapshot per room.
- Presence is advisory and unauthenticated, like any Yjs awareness.
- No claim of Microsoft Teams feature parity beyond what the UI actually implements (channels,
  posts with replies, reactions, files, search, presence, meetings with screen share and raise
  hand). Not implemented: threads as separate panes, 1:1 chats, notifications, calendar, recording,
  background blur, live captions.
