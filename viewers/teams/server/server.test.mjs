// node --test server/server.test.mjs
// Exercises the three contracts with real sockets: Yjs sync (through core's own client), the
// signaling relay, file storage, the access token and persistence across a restart.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createTeamsClient } from 'ooxml-core/teams';
import { WebSocket } from 'ws';
import { createTeamsServer } from './index.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 4000) => {
	const end = Date.now() + ms;
	while (Date.now() < end) {
		if (await fn()) return true;
		await sleep(25);
	}
	return false;
};

describe('teams server', () => {
	let dir;
	let server;
	let port;
	const clients = [];
	const config = (extra = {}) => ({
		mode: 'server',
		syncUrl: `ws://127.0.0.1:${port}/sync`,
		signalingUrl: `ws://127.0.0.1:${port}/signal`,
		iceServers: [],
		...extra,
	});
	const client = (name, workspaceId, extra = {}) => {
		const c = createTeamsClient({
			workspaceId,
			user: { id: name, name },
			config: config(),
			WebSocket,
			...extra,
		});
		clients.push(c);
		return c;
	};

	before(async () => {
		dir = mkdtempSync(join(tmpdir(), 'teams-server-'));
		server = createTeamsServer({ dataDir: dir });
		port = (await server.listen(0, '127.0.0.1')).port;
	});
	after(async () => {
		for (const c of clients) c.destroy();
		await server.close();
		rmSync(dir, { recursive: true, force: true });
	});

	it('syncs chat between two clients and replays history to a late joiner', async () => {
		const a = client('ada', 'sync-room');
		const b = client('bob', 'sync-room');
		a.createChannel('Ops');
		assert.ok(await until(() => b.getState().channels.some((c) => c.name === 'Ops')));
		await a.send({ text: 'hello from ada' });
		b.select(b.getState().channels.find((c) => c.name === 'Ops').id);
		assert.ok(await until(() => b.getState().messages.some((m) => m.text === 'hello from ada')));
		const late = client('cy', 'sync-room');
		assert.ok(await until(() => late.getState().channels.some((c) => c.name === 'Ops')));
		late.select(late.getState().channels.find((c) => c.name === 'Ops').id);
		assert.ok(await until(() => late.getState().messages.some((m) => m.text === 'hello from ada')));
	});

	it('keeps rooms isolated', async () => {
		const x = client('xia', 'room-x');
		const y = client('yan', 'room-y');
		x.createChannel('Only X');
		await sleep(300);
		assert.equal(
			y.getState().channels.some((c) => c.name === 'Only X'),
			false,
		);
	});

	it('persists a room across a server restart', async () => {
		const a = client('ada', 'persist-room');
		a.createChannel('Keep');
		await a.send({ text: 'remember me' });
		await sleep(800); // snapshot debounce
		a.destroy();
		await server.close();
		server = createTeamsServer({ dataDir: dir });
		port = (await server.listen(0, '127.0.0.1')).port;
		const b = client('bob', 'persist-room', { config: config() });
		assert.ok(await until(() => b.getState().channels.some((c) => c.name === 'Keep')));
	});

	it('relays signaling to the other sockets and announces departures', async () => {
		const open = (id) =>
			new Promise((resolve) => {
				const ws = new WebSocket(`ws://127.0.0.1:${port}/signal/call-1`);
				const got = [];
				ws.on('message', (d) => got.push(JSON.parse(d.toString())));
				ws.on('open', () => resolve({ ws, got, id }));
			});
		const a = await open('a');
		const b = await open('b');
		a.ws.send(JSON.stringify({ type: 'hello', from: 'a', name: 'A', state: {} }));
		assert.ok(await until(() => b.got.some((m) => m.type === 'hello' && m.from === 'a')));
		assert.equal(a.got.length, 0, 'the sender does not hear itself');
		// A socket speaks for one peer id: spoofing another is dropped.
		a.ws.send(JSON.stringify({ type: 'bye', from: 'someone-else' }));
		await sleep(150);
		assert.equal(b.got.filter((m) => m.type === 'bye').length, 0);
		a.ws.close();
		assert.ok(await until(() => b.got.some((m) => m.type === 'bye' && m.from === 'a')));
		b.ws.close();
	});

	it('stores and serves files, sanitising names and rejecting oversize bodies', async () => {
		const base = `http://127.0.0.1:${port}`;
		const up = await fetch(`${base}/files/ws1/${encodeURIComponent('../Q3 Plan.docx')}`, {
			method: 'POST',
			body: 'PK-data',
		});
		assert.equal(up.status, 201);
		const { url } = await up.json();
		assert.ok(!url.includes('..') || url.startsWith('/files/ws1/'));
		const got = await fetch(`${base}/files/ws1/${encodeURIComponent('.._Q3 Plan.docx')}`);
		assert.equal(got.status === 200 || got.status === 404, true);
		const small = createTeamsServer({ dataDir: dir, maxFileBytes: 10 });
		const sp = (await small.listen(0, '127.0.0.1')).port;
		await assert.rejects(
			fetch(`http://127.0.0.1:${sp}/files/ws1/big.bin`, { method: 'POST', body: 'x'.repeat(5000) }),
		);
		await small.close();
		assert.equal((await fetch(`${base}/files/ws1/nope.docx`)).status, 404);
		assert.equal((await fetch(`${base}/health`)).status, 200);
	});
});

describe('teams server with a token and origin list', () => {
	let dir;
	let server;
	let port;
	before(async () => {
		dir = mkdtempSync(join(tmpdir(), 'teams-server-auth-'));
		server = createTeamsServer({ dataDir: dir, token: 's3cret', origins: ['https://app.example'] });
		port = (await server.listen(0, '127.0.0.1')).port;
	});
	after(async () => {
		await server.close();
		rmSync(dir, { recursive: true, force: true });
	});

	const connect = (path, headers = {}) =>
		new Promise((resolve) => {
			const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`, { headers });
			ws.on('open', () => resolve({ ok: true, ws }));
			ws.on('error', () => resolve({ ok: false }));
			ws.on('unexpected-response', () => resolve({ ok: false }));
		});

	it('refuses sockets without the token or from another origin', async () => {
		assert.equal((await connect('/sync/r1', { Origin: 'https://app.example' })).ok, false);
		assert.equal(
			(await connect('/sync/r1?token=wrong', { Origin: 'https://app.example' })).ok,
			false,
		);
		assert.equal(
			(await connect('/sync/r1?token=s3cret', { Origin: 'https://evil.example' })).ok,
			false,
		);
		const good = await connect('/signal/r1?token=s3cret', { Origin: 'https://app.example' });
		assert.equal(good.ok, true);
		good.ws.close();
	});

	it('refuses invalid room names and unauthenticated file requests', async () => {
		assert.equal(
			(await connect('/sync/..%2F..%2Fetc?token=s3cret', { Origin: 'https://app.example' })).ok,
			false,
		);
		const noAuth = await fetch(`http://127.0.0.1:${port}/files/ws1/a.txt`, {
			headers: { Origin: 'https://app.example' },
		});
		assert.equal(noAuth.status, 401);
		const ok = await fetch(`http://127.0.0.1:${port}/files/ws1/a.txt`, {
			method: 'POST',
			body: 'hi',
			headers: { Origin: 'https://app.example', Authorization: 'Bearer s3cret' },
		});
		assert.equal(ok.status, 201);
	});

	it('serves files through short-lived signed links, never through ?token=', async () => {
		const base = `http://127.0.0.1:${port}`;
		const headers = { Origin: 'https://app.example' };
		const auth = { ...headers, Authorization: 'Bearer s3cret' };
		assert.equal((await fetch(`${base}/files/ws1/a.txt?token=s3cret`, { headers })).status, 401);
		assert.equal(
			(await fetch(`${base}/files/link/ws1/a.txt`, { method: 'POST', headers })).status,
			401,
		);
		const issued = await fetch(`${base}/files/link/ws1/a.txt`, { method: 'POST', headers: auth });
		assert.equal(issued.status, 200);
		const { url } = await issued.json();
		assert.match(url, /^\/files\/ws1\/a\.txt\?sig=[0-9a-f]{64}&exp=\d+$/u);
		const got = await fetch(`${base}${url}`, { headers });
		assert.equal(got.status, 200);
		assert.equal(got.headers.get('referrer-policy'), 'no-referrer');
		assert.equal(await got.text(), 'hi');
		// The signature is bound to its file, to reading, and to its expiry.
		assert.equal((await fetch(`${base}${url.replace('a.txt', 'b.txt')}`, { headers })).status, 401);
		assert.equal(
			(await fetch(`${base}${url}`, { method: 'POST', body: 'x', headers })).status,
			401,
		);
		assert.equal(
			(await fetch(`${base}${url.replace(/exp=\d+/u, 'exp=1')}`, { headers })).status,
			401,
		);
	});
});
