// Reference bring-your-own server for the teams viewers. One process, three jobs:
//   ws  /sync/<room>      y-websocket compatible Yjs document + awareness server (persisted to disk)
//   ws  /signal/<room>    WebRTC signaling relay (forwards JSON to the other sockets of the room)
//   http POST|GET /files/<id>/<name>   plain file storage for attachments
//   http POST /files/link/<id>/<name>  short-lived signed download link (token in Authorization)
// Nothing here understands Office formats or chat: it moves bytes, so any other server that speaks
// the same three contracts (see docs/server-contract.md) works just as well.
import { createServer } from 'node:http';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
	mkdirSync,
	existsSync,
	readFileSync,
	writeFileSync,
	createReadStream,
	createWriteStream,
	statSync,
	renameSync,
	unlinkSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const MESSAGE_QUERY_AWARENESS = 3;
const ROOM = /^[\w-]{1,128}$/u;
const WS_OPEN = 1;

const sameSecret = (a, b) => {
	const ha = createHash('sha256').update(String(a)).digest();
	const hb = createHash('sha256').update(String(b)).digest();
	return timingSafeEqual(ha, hb);
};

/**
 * @param {{ port?: number, host?: string, token?: string, origins?: string[], dataDir?: string,
 *   maxFileBytes?: number, maxSyncBytes?: number, maxSignalBytes?: number, log?: (m: string) => void }} [options]
 */
export function createTeamsServer(options = {}) {
	const {
		token = process.env.TEAMS_TOKEN || '',
		origins = (process.env.TEAMS_ORIGINS || '')
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean),
		dataDir = resolve(process.env.TEAMS_DATA || './data'),
		maxFileBytes = 25 * 1024 * 1024,
		maxSyncBytes = 32 * 1024 * 1024,
		maxSignalBytes = 256 * 1024,
		log = () => {},
	} = options;
	const roomsDir = join(dataDir, 'rooms');
	const filesDir = join(dataDir, 'files');
	mkdirSync(roomsDir, { recursive: true });
	mkdirSync(filesDir, { recursive: true });

	const originAllowed = (origin) => origins.length === 0 || (origin && origins.includes(origin));
	const tokenOk = (url) => !token || sameSecret(url.searchParams.get('token') ?? '', token);

	// ---- signed file links ------------------------------------------------------------------
	// A download link is valid for one path and a few minutes, so the long-lived token never has to
	// appear in a URL (history, logs, Referer). WebSockets cannot send headers, so only /sync and
	// /signal still take `?token=`.
	const LINK_TTL_MS = 5 * 60 * 1000;
	const linkKey = createHash('sha256').update(`teams-file-link|${token}`).digest();
	const sign = (path, exp) => createHmac('sha256', linkKey).update(`${path}|${exp}`).digest('hex');
	const signedUrl = (path) => {
		const exp = Date.now() + LINK_TTL_MS;
		return `${path}?sig=${sign(path, exp)}&exp=${exp}`;
	};
	const linkOk = (url) => {
		const exp = Number(url.searchParams.get('exp'));
		const sig = url.searchParams.get('sig') ?? '';
		return Number.isFinite(exp) && exp > Date.now() && sameSecret(sig, sign(url.pathname, exp));
	};

	// ---- sync rooms -------------------------------------------------------------------------
	/** @type {Map<string, { doc: Y.Doc, awareness: awarenessProtocol.Awareness, conns: Map<any, Set<number>>, timer: any, idle: any }>} */
	const syncRooms = new Map();
	const snapshotPath = (name) => join(roomsDir, `${name}.bin`);

	const send = (ws, message) => {
		if (ws.readyState === WS_OPEN) ws.send(message, (err) => err && ws.close());
	};

	function getRoom(name) {
		let room = syncRooms.get(name);
		if (room) {
			clearTimeout(room.idle);
			return room;
		}
		const doc = new Y.Doc();
		const file = snapshotPath(name);
		if (existsSync(file)) {
			try {
				Y.applyUpdate(doc, readFileSync(file));
			} catch (error) {
				log(`room ${name}: ignoring unreadable snapshot (${error.message})`);
			}
		}
		const awareness = new awarenessProtocol.Awareness(doc);
		awareness.setLocalState(null);
		room = { doc, awareness, conns: new Map(), timer: null, idle: null };
		const persist = () => {
			clearTimeout(room.timer);
			room.timer = setTimeout(() => {
				const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`;
				writeFileSync(tmp, Y.encodeStateAsUpdate(doc));
				renameSync(tmp, file);
			}, 500);
		};
		doc.on('update', (update, origin) => {
			const encoder = encoding.createEncoder();
			encoding.writeVarUint(encoder, MESSAGE_SYNC);
			syncProtocol.writeUpdate(encoder, update);
			const message = encoding.toUint8Array(encoder);
			for (const conn of room.conns.keys()) if (conn !== origin) send(conn, message);
			persist();
		});
		awareness.on('update', ({ added, updated, removed }, origin) => {
			const changed = [...added, ...updated, ...removed];
			if (origin && room.conns.has(origin)) {
				const owned = room.conns.get(origin);
				for (const id of added) owned.add(id);
				for (const id of removed) owned.delete(id);
			}
			const encoder = encoding.createEncoder();
			encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
			encoding.writeVarUint8Array(
				encoder,
				awarenessProtocol.encodeAwarenessUpdate(awareness, changed),
			);
			const message = encoding.toUint8Array(encoder);
			for (const conn of room.conns.keys()) send(conn, message);
		});
		syncRooms.set(name, room);
		return room;
	}

	function leaveSync(name, room, ws) {
		const owned = room.conns.get(ws);
		room.conns.delete(ws);
		if (owned?.size) awarenessProtocol.removeAwarenessStates(room.awareness, [...owned], null);
		if (room.conns.size === 0) {
			room.idle = setTimeout(() => {
				if (room.conns.size > 0) return;
				clearTimeout(room.timer);
				writeFileSync(snapshotPath(name), Y.encodeStateAsUpdate(room.doc));
				room.awareness.destroy();
				room.doc.destroy();
				syncRooms.delete(name);
			}, 30_000);
			room.idle.unref?.();
		}
	}

	function handleSync(ws, name) {
		const room = getRoom(name);
		room.conns.set(ws, new Set());
		ws.binaryType = 'arraybuffer';
		ws.on('message', (data) => {
			try {
				const decoder = decoding.createDecoder(new Uint8Array(data));
				const type = decoding.readVarUint(decoder);
				if (type === MESSAGE_SYNC) {
					const encoder = encoding.createEncoder();
					encoding.writeVarUint(encoder, MESSAGE_SYNC);
					syncProtocol.readSyncMessage(decoder, encoder, room.doc, ws);
					if (encoding.length(encoder) > 1) send(ws, encoding.toUint8Array(encoder));
				} else if (type === MESSAGE_AWARENESS) {
					awarenessProtocol.applyAwarenessUpdate(
						room.awareness,
						decoding.readVarUint8Array(decoder),
						ws,
					);
				} else if (type === MESSAGE_QUERY_AWARENESS) {
					const states = [...room.awareness.getStates().keys()];
					if (states.length) {
						const encoder = encoding.createEncoder();
						encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
						encoding.writeVarUint8Array(
							encoder,
							awarenessProtocol.encodeAwarenessUpdate(room.awareness, states),
						);
						send(ws, encoding.toUint8Array(encoder));
					}
				}
			} catch (error) {
				log(`sync ${name}: dropped malformed message (${error.message})`);
			}
		});
		ws.on('close', () => leaveSync(name, room, ws));
		ws.on('error', () => ws.close());
		// Our side of the handshake: ask for the client's state and offer ours.
		const hello = encoding.createEncoder();
		encoding.writeVarUint(hello, MESSAGE_SYNC);
		syncProtocol.writeSyncStep1(hello, room.doc);
		send(ws, encoding.toUint8Array(hello));
		const states = [...room.awareness.getStates().keys()];
		if (states.length) {
			const encoder = encoding.createEncoder();
			encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
			encoding.writeVarUint8Array(
				encoder,
				awarenessProtocol.encodeAwarenessUpdate(room.awareness, states),
			);
			send(ws, encoding.toUint8Array(encoder));
		}
	}

	// ---- signaling rooms --------------------------------------------------------------------
	/** @type {Map<string, Set<any>>} */
	const signalRooms = new Map();
	function handleSignal(ws, name) {
		let peers = signalRooms.get(name);
		if (!peers) signalRooms.set(name, (peers = new Set()));
		peers.add(ws);
		let peerId = null;
		ws.on('message', (data, isBinary) => {
			if (isBinary) return;
			const text = data.toString();
			let parsed;
			try {
				parsed = JSON.parse(text);
			} catch {
				return;
			}
			if (!parsed || typeof parsed.from !== 'string') return;
			// A socket speaks for one peer id: the first one it claims.
			peerId ??= parsed.from;
			if (parsed.from !== peerId) return;
			for (const other of peers) if (other !== ws) send(other, text);
		});
		ws.on('close', () => {
			peers.delete(ws);
			if (peerId)
				for (const other of peers) send(other, JSON.stringify({ type: 'bye', from: peerId }));
			if (peers.size === 0) signalRooms.delete(name);
		});
		ws.on('error', () => ws.close());
	}

	// ---- files ------------------------------------------------------------------------------
	const cors = (res, req) => {
		const origin = req.headers.origin;
		if (origin && originAllowed(origin)) {
			res.setHeader('Access-Control-Allow-Origin', origin);
			res.setHeader('Vary', 'Origin');
		}
		res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
		res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
	};
	const cleanName = (n) =>
		decodeURIComponent(n)
			.replace(/[^\w.\- ()]/gu, '_')
			.slice(0, 120);

	const http = createServer((req, res) => {
		cors(res, req);
		const url = new URL(req.url ?? '/', 'http://localhost');
		if (req.method === 'OPTIONS') return void res.writeHead(204).end();
		if (url.pathname === '/health') {
			return void res.writeHead(200, { 'Content-Type': 'application/json' }).end(
				JSON.stringify({
					ok: true,
					rooms: syncRooms.size,
					calls: signalRooms.size,
					auth: Boolean(token),
				}),
			);
		}
		const link = /^\/files\/link\/([\w-]{1,64})\/([^/]{1,200})$/u.exec(url.pathname);
		const m = link ?? /^\/files\/([\w-]{1,64})\/([^/]{1,200})$/u.exec(url.pathname);
		if (!m) return void res.writeHead(404).end();
		if (!originAllowed(req.headers.origin ?? '')) return void res.writeHead(403).end();
		const bearer = /^Bearer (.+)$/u.exec(req.headers.authorization ?? '')?.[1];
		const authorised = bearer !== undefined && sameSecret(bearer, token);
		// A signed link only ever opens its own file, and only for reading.
		const signedRead = req.method === 'GET' && !link && linkOk(url);
		if (token && !authorised && !signedRead) return void res.writeHead(401).end();
		if (link) {
			if (req.method !== 'POST') return void res.writeHead(405).end();
			const path = `/files/${m[1]}/${m[2]}`;
			return void res
				.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
				.end(JSON.stringify({ url: token ? signedUrl(path) : path }));
		}
		const dir = join(filesDir, m[1]);
		const file = join(dir, cleanName(m[2]));
		if (req.method === 'GET') {
			if (!existsSync(file)) return void res.writeHead(404).end();
			res.writeHead(200, {
				'Content-Type': 'application/octet-stream',
				'Content-Length': statSync(file).size,
				'Content-Disposition': 'attachment',
				'Referrer-Policy': 'no-referrer',
				'X-Content-Type-Options': 'nosniff',
			});
			return void createReadStream(file).pipe(res);
		}
		if (req.method === 'POST') {
			mkdirSync(dir, { recursive: true });
			const tmp = `${file}.${randomBytes(4).toString('hex')}.part`;
			const out = createWriteStream(tmp);
			let size = 0;
			let rejected = false;
			req.on('data', (chunk) => {
				size += chunk.length;
				if (size > maxFileBytes && !rejected) {
					rejected = true;
					out.destroy();
					req.destroy();
					try {
						unlinkSync(tmp);
					} catch {}
				}
			});
			req.pipe(out);
			out.on('finish', () => {
				if (rejected) return;
				renameSync(tmp, file);
				res
					.writeHead(201, { 'Content-Type': 'application/json' })
					.end(JSON.stringify({ url: url.pathname, size }));
			});
			out.on('error', () => !res.headersSent && res.writeHead(500).end());
			return;
		}
		res.writeHead(405).end();
	});

	const syncWss = new WebSocketServer({ noServer: true, maxPayload: maxSyncBytes });
	const signalWss = new WebSocketServer({ noServer: true, maxPayload: maxSignalBytes });
	http.on('upgrade', (req, socket, head) => {
		const url = new URL(req.url ?? '/', 'http://localhost');
		const m = /^\/(sync|signal)\/([^/]+)$/u.exec(url.pathname);
		const name = m ? decodeURIComponent(m[2]) : '';
		if (!m || !ROOM.test(name)) return void socket.destroy();
		if (!originAllowed(req.headers.origin ?? '')) {
			socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
			return void socket.destroy();
		}
		if (!tokenOk(url)) {
			socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
			return void socket.destroy();
		}
		const wss = m[1] === 'sync' ? syncWss : signalWss;
		wss.handleUpgrade(req, socket, head, (ws) =>
			m[1] === 'sync' ? handleSync(ws, name) : handleSignal(ws, name),
		);
	});

	return {
		http,
		listen: (port = Number(process.env.PORT) || 8787, host = process.env.HOST || '127.0.0.1') =>
			new Promise((ok) => http.listen(port, host, () => ok(http.address()))),
		close: () =>
			new Promise((ok) => {
				// Flush every room (a debounced snapshot must not be lost on shutdown), then release it.
				for (const [name, room] of syncRooms) {
					clearTimeout(room.timer);
					clearTimeout(room.idle);
					writeFileSync(snapshotPath(name), Y.encodeStateAsUpdate(room.doc));
					room.awareness.destroy();
					room.doc.destroy();
				}
				syncRooms.clear();
				for (const c of [...syncWss.clients, ...signalWss.clients]) c.terminate();
				http.close(() => ok());
				http.closeAllConnections();
			}),
	};
}

/** Start a server configured from the environment and log where it listens (the CLI entry). */
export async function runTeamsServer() {
	const server = createTeamsServer({ log: (m) => console.log(m) });
	const addr = await server.listen();
	const auth = process.env.TEAMS_TOKEN
		? 'token required'
		: 'no token (set TEAMS_TOKEN for anything but localhost)';
	console.log(`teams server on http://${addr.address}:${addr.port}  [${auth}]`);
	console.log(
		'  ws://%s:%d/sync/<room>   ws://%s:%d/signal/<room>   /files/<id>/<name>',
		addr.address,
		addr.port,
		addr.address,
		addr.port,
	);
	return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	await runTeamsServer();
}
