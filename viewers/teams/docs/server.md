# Bring your own server

OpenTeams has no hosted service. The workspace runs either with **no server** (`mode: 'local'`,
tabs of one browser only) or against **a server you run** that honours three small contracts. The
reference implementation, `openteams-server`, does all three in one Node process of about 300
lines; any other server that speaks the same contracts works just as well.

::: danger No end-to-end encryption
Chat travels as Yjs updates through your server, which stores the room document and every uploaded
file in plain form and can read them. Call media is encrypted between peers (DTLS-SRTP), and a TURN
relay cannot decrypt it, but signaling passes through the server.
:::

## Run the reference server

Needs Node 22 or later.

```bash
npx openteams-server                    # listens on 127.0.0.1:8787
TEAMS_TOKEN=change-me TEAMS_ORIGINS=https://app.example.com TEAMS_DATA=/var/lib/openteams npx openteams-server
```

It is configured through the environment only; the command takes no flags.

| Variable        | Default     | Meaning                                                                            |
| --------------- | ----------- | ---------------------------------------------------------------------------------- |
| `PORT`          | `8787`      | Listen port.                                                                       |
| `HOST`          | `127.0.0.1` | Listen address. Bind `0.0.0.0` only behind TLS.                                    |
| `TEAMS_TOKEN`   | none        | If set, sockets take it as `?token=` and file requests as `Authorization: Bearer`. |
| `TEAMS_ORIGINS` | none (any)  | Comma-separated allowed `Origin`s for sockets and files.                           |
| `TEAMS_DATA`    | `./data`    | Data directory: `rooms/<room>.bin` snapshots and `files/<workspace>/`.             |

Or embed it:

```js
import { createTeamsServer } from 'openteams-server';

const server = createTeamsServer({
	token: process.env.TEAMS_TOKEN,
	origins: ['https://app.example.com'],
	dataDir: '/var/lib/openteams',
	maxFileBytes: 25 * 1024 * 1024, // default
	log: console.log,
});
await server.listen(8787, '127.0.0.1');
// server.http is the node:http server; server.close() flushes every room to disk.
```

Then point the client at it:

```ts
const config = {
	mode: 'server',
	syncUrl: 'wss://teams.example.com/sync',
	signalingUrl: 'wss://teams.example.com/signal',
	iceServers: [{ urls: 'stun:stun.example.com:3478' }],
	token: 'change-me', // only if TEAMS_TOKEN is set
};
```

[Deploying the reference server](/deploy) covers TLS, the token, TURN, Docker and a Caddy example.

## Endpoints

| Endpoint                              | What it does                                                                                                            |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `ws /sync/<room>`                     | y-websocket compatible sync: one `Y.Doc` and awareness per room, persisted to `rooms/<room>.bin`. Messages up to 32 MB. |
| `ws /signal/<room>`                   | JSON relay for call signaling: forwards each text message to the room's other sockets. Messages up to 256 KB.           |
| `POST /files/<workspace>/<name>`      | Stores an attachment (25 MB cap) and answers `201 { url, size }`.                                                       |
| `GET /files/<workspace>/<name>`       | Downloads it as an attachment (`Content-Disposition: attachment`, `Referrer-Policy: no-referrer`, `nosniff`).           |
| `POST /files/link/<workspace>/<name>` | Returns `{ url }`: a link signed for that one file, valid for five minutes, so the token never appears in a URL.        |
| `GET /health`                         | `{ ok, rooms, calls, auth }`.                                                                                           |

Room names must match `^[\w-]{1,128}$` and workspace ids in file paths `^[\w-]{1,64}$`; file names
are sanitised to letters, digits, `.`, `-`, `_`, spaces and parentheses, and capped at 120
characters.

## The contracts

Any server that does these three things works with every binding.

### Sync

`ws(s)://host/<base>/<room>` speaks the y-websocket wire format (sync step 1 and 2, updates,
awareness, query awareness). A stock y-websocket server works. A server that keeps a `Y.Doc` per
room and persists it gives history to people who join later.

### Signaling

`ws(s)://host/<base>/<room>` forwards each JSON text message to the **other** sockets of the room,
and sends `{ "type": "bye", "from": <id> }` to them when a socket closes. A socket speaks for one
peer id (the first `from` it uses). The server does not need to understand the messages.

### Files

Optional. `POST|GET <origin>/files/<workspace>/<name>` with the token in an `Authorization: Bearer`
header, plus `POST <origin>/files/link/<workspace>/<name>` returning a short-lived signed `{ url }`
for opening a file in a browser tab. The origin is taken from `syncUrl`. Without a file server, give
the element an `uploadFile` function (to put attachments in your own object store), or attachments
are shared by name only.

Both sockets receive `?token=<token>` when a token is configured, because a browser cannot set
headers on a WebSocket. Enforce it, and an origin allowlist, on the server.

## Calls: STUN and TURN

`iceServers` carries STUN and TURN URLs. Public STUN is enough on open networks and never enough
behind symmetric NAT or strict firewalls: run your own TURN (for example coturn) and give clients
credentials. TURN entries without credentials are rejected by the core's `parseServerConfig`.
Static TURN credentials are visible to anyone who can open the app; for anything public, issue
short-lived ones. The [deployment guide](/deploy#calls-across-nats-turn) has a coturn example.

## What the reference server does not do

Be clear about these before you put people on it:

- **No end-to-end encryption.** It stores and can read every message and file.
- **No user accounts.** `TEAMS_TOKEN` is one shared secret for everybody, stored in the browser. It
  keeps strangers out of a small team's server; it is not per-user authentication. Author and role
  checks in the client can be bypassed by a hostile client, so the server is the trust boundary:
  put your own authentication in front (a proxy that checks a session) for real use.
- **No TLS of its own.** Run it behind a reverse proxy that terminates TLS and upgrades
  WebSockets; browsers refuse `ws://` from an `https://` page.
- **One process, rooms in memory.** It does not scale horizontally. A room is unloaded 30 seconds
  after its last socket closes.
- **One snapshot per room, no compaction.** The document grows with history and is never pruned.
- **Plain file storage.** No listing, no deletion, no per-workspace quota; uploading a file with an
  existing name replaces it. Files are capped at 25 MB each.
- **No rate limiting** and no media server: calls are peer to peer (mesh).
