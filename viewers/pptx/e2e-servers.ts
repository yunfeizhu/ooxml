/**
 * The dev servers the pptx e2e suite needs: the collaboration relay and one Vite server per
 * demo. `playwright.config.ts` builds its `webServer` list from this, and the same list backs
 * the warm-server commands, so the two cannot disagree on ports.
 *
 * Starting five Vite servers (each with `--force`, so a cold dependency optimize) is minutes of
 * every local run. Keep them up between runs instead:
 *
 *   bun e2e-servers.ts start     # start whatever is not listening, wait until ready
 *   bun e2e-servers.ts status
 *   bun e2e-servers.ts stop
 *   bun e2e-servers.ts restart   # after rebuilding ooxml-ui, core or the angular package
 *
 * Playwright reuses a server it finds listening (`reuseExistingServer` outside CI), so
 * `bun run e2e` then starts at once. A running server serves stale code after a package rebuild:
 * `restart` (or `stop`) after building.
 *
 * @module e2e-servers
 */
import { spawn, spawnSync } from 'node:child_process';
import {
	closeSync,
	existsSync,
	mkdirSync,
	openSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { createConnection } from 'node:net';
import { join, resolve } from 'node:path';

export interface E2eServer {
	name: string;
	port: number;
	/** Working directory, relative to this folder. */
	cwd: string;
	command: string;
	env?: Record<string, string>;
	/** HTTP servers are ready on a URL; the relay is ready on its port. */
	url?: string;
}

/** Ports and demos mirror `demos/pptx/demo-*` (react 4173, angular 4174, vue 4175, vanilla 4176, svelte 4177). */
export function e2eServers(
	offset = Number(process.env.PPTX_E2E_PORT_OFFSET ?? 0),
): readonly E2eServer[] {
	const demos: [string, number][] = [
		['react', 4173],
		['vue', 4175],
		['angular', 4174],
		['vanilla', 4176],
		['svelte', 4177],
	];
	return [
		{
			name: 'collab',
			port: 1234 + offset,
			cwd: '.',
			command: 'bun ../../demos/pptx/demo-react/collab-server.mjs',
			env: { PORT: String(1234 + offset) },
		},
		...demos.map(([name, base]) => ({
			name,
			port: base + offset,
			cwd: `../../demos/pptx/demo-${name}`,
			command: `npx vite --force --port ${base + offset} --strictPort`,
			url: `http://localhost:${base + offset}`,
		})),
	];
}

const ROOT = resolve(__dirname);
const STATE = join(ROOT, '.e2e-servers');
const PIDS = join(STATE, 'pids.json');

const listening = (port: number): Promise<boolean> =>
	new Promise((done) => {
		const socket = createConnection({ port, host: 'localhost' });
		socket.once('connect', () => {
			socket.destroy();
			done(true);
		});
		socket.once('error', () => done(false));
	});

const sleep = (ms: number) =>
	new Promise((done) => {
		setTimeout(done, ms);
	});

function readPids(): Record<string, number> {
	return existsSync(PIDS) ? (JSON.parse(readFileSync(PIDS, 'utf8')) as Record<string, number>) : {};
}

function kill(pid: number): void {
	if (process.platform === 'win32') {
		spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
	} else {
		try {
			process.kill(-pid);
		} catch {
			// already gone
		}
	}
}

async function start(): Promise<void> {
	mkdirSync(STATE, { recursive: true });
	const pids = readPids();
	const pending: E2eServer[] = [];
	for (const server of e2eServers()) {
		if (await listening(server.port)) {
			console.log(`${server.name}: already listening on ${server.port}`);
			continue;
		}
		const log = openSync(join(STATE, `${server.name}.log`), 'w');
		const child = spawn(server.command, {
			cwd: resolve(ROOT, server.cwd),
			env: { ...process.env, ...server.env },
			shell: true,
			// Bun on Windows gives a detached child no stdio, so it never starts; an unref'd one outlives us.
			detached: process.platform !== 'win32',
			stdio: ['ignore', log, log],
			windowsHide: true,
		});
		child.unref();
		closeSync(log);
		if (child.pid) {
			pids[server.name] = child.pid;
		}
		pending.push(server);
	}
	writeFileSync(PIDS, JSON.stringify(pids));
	const deadline = Date.now() + 240_000;
	for (const server of pending) {
		while (!(await listening(server.port))) {
			if (Date.now() > deadline) {
				throw new Error(`${server.name} did not come up on ${server.port}; see ${STATE}`);
			}
			await sleep(500);
		}
		console.log(`${server.name}: up on ${server.port}`);
	}
}

/** Process ids listening on `port`: the shell that spawned a server exits, so the pid we saved is not it. */
function pidsOnPort(port: number): number[] {
	const found = new Set<number>();
	if (process.platform === 'win32') {
		const out = spawnSync('netstat', ['-ano'], { encoding: 'utf8' }).stdout;
		for (const line of out.split(/\r?\n/)) {
			const cells = line.trim().split(/\s+/);
			if (cells[3] === 'LISTENING' && cells[1]?.endsWith(`:${port}`)) {
				found.add(Number(cells[4]));
			}
		}
	} else {
		const out = spawnSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], {
			encoding: 'utf8',
		}).stdout;
		for (const pid of out.split('\n')) {
			if (pid) {
				found.add(Number(pid));
			}
		}
	}
	return [...found];
}

function stop(): void {
	for (const server of e2eServers()) {
		for (const pid of pidsOnPort(server.port)) {
			kill(pid);
			console.log(`${server.name}: stopped (${pid})`);
		}
	}
	for (const pid of Object.values(readPids())) {
		kill(pid);
	}
	rmSync(PIDS, { force: true });
}

async function status(): Promise<void> {
	for (const server of e2eServers()) {
		console.log(
			`${server.name.padEnd(8)} ${server.port}  ${(await listening(server.port)) ? 'up' : 'down'}`,
		);
	}
}

async function main(): Promise<void> {
	const command = process.argv[2] ?? 'status';
	if (command === 'start') {
		await start();
	} else if (command === 'stop') {
		stop();
	} else if (command === 'restart') {
		stop();
		await sleep(1000);
		await start();
	} else if (command === 'status') {
		await status();
	} else {
		console.error('usage: bun e2e-servers.ts start | stop | restart | status');
		process.exit(2);
	}
}

if (process.argv[1] && /e2e-servers.ts$/.test(process.argv[1])) {
	main().catch((error: unknown) => {
		console.error(error);
		process.exit(1);
	});
}
