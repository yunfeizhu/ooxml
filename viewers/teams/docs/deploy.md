# Running your own server

## The reference server

```bash
cd server && node index.mjs          # PORT=8787 HOST=127.0.0.1 by default
```

| Variable        | Meaning                                                                            |
| --------------- | ---------------------------------------------------------------------------------- |
| `PORT`, `HOST`  | Listen address. Bind `0.0.0.0` only behind TLS.                                    |
| `TEAMS_TOKEN`   | If set, sockets take it as `?token=` and file requests as `Authorization: Bearer`. |
| `TEAMS_ORIGINS` | Comma-separated allowed `Origin`s for sockets and files. Empty allows any.         |
| `TEAMS_DATA`    | Data directory (default `./data`): `rooms/<room>.bin` snapshots and `files/`.      |

It serves `ws /sync/<room>` (y-websocket compatible, one persisted `Y.Doc` per room),
`ws /signal/<room>` (a JSON relay) and `POST|GET /files/<workspace>/<name>` (25 MB cap, names
sanitised, downloads sent as attachments with `Referrer-Policy: no-referrer`). With a token, a
browser opens files through `POST /files/link/<workspace>/<name>` (token in the header), which
returns a link signed for that one file and valid for five minutes. `GET /health` reports room and call counts.

**Put it behind TLS.** Browsers refuse `ws://` from an `https://` page, and a token or call
signaling over plain HTTP is readable on the network. Any reverse proxy that upgrades WebSockets
works (nginx, Caddy, Traefik). Caddy example:

```
teams.example.com {
	reverse_proxy 127.0.0.1:8787
}
```

Then point the app at `wss://teams.example.com/sync` and `wss://teams.example.com/signal`.

**The token is a shared secret** stored in the browser: it keeps strangers out of a small team's
server, it is not per-user authentication. For real accounts, put your own auth in front (a proxy
that checks a session, or replace `tokenOk` with token verification) and keep the same three
contracts.

## Calls across NATs: TURN

Calls are peer to peer. Public STUN works on open networks; behind symmetric NAT or strict
firewalls you need a TURN relay, which also carries media only as ciphertext (DTLS-SRTP). A minimal
coturn (`turnserver.conf`):

```
listening-port=3478
tls-listening-port=5349
realm=turn.example.com
fingerprint
lt-cred-mech
user=teams:CHANGE_ME
no-multicast-peers
cert=/etc/letsencrypt/live/turn.example.com/fullchain.pem
pkey=/etc/letsencrypt/live/turn.example.com/privkey.pem
```

and in the app's server settings, one ICE server per line:

```
stun:turn.example.com:3478
turn:turn.example.com:3478,turns:turn.example.com:5349 teams CHANGE_ME
```

Static TURN credentials are visible to anyone who can open the app. For anything public, issue
short-lived credentials (coturn `use-auth-secret` plus a small endpoint that signs them) and pass
them in the `iceServers` you give the element.

## Docker

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY server/package.json ./
RUN npm install --omit=dev
COPY server/index.mjs ./
ENV HOST=0.0.0.0 TEAMS_DATA=/data
VOLUME /data
EXPOSE 8787
CMD ["node", "index.mjs"]
```

Run it with `TEAMS_TOKEN` and `TEAMS_ORIGINS` set, behind your TLS proxy.

## Using a different server

Anything that honours the contracts in the core's `docs/teams-area.md` works: a stock
`y-websocket` server for sync, any WebSocket fan-out for signaling, any object store for files (give
`<teams-app>` an `uploadFile` function, or set `uploadFile` on the element, and attachments go
there instead).
