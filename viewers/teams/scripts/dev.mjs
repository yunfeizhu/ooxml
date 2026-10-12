// Starts the reference server (8787) and the vanilla demo (5173) together.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const demos = process.env.TEAMS_DEMOS ?? 'vanilla,react';
const procs = [
	spawn(process.execPath, ['server/index.mjs'], { stdio: 'inherit' }),
	...demos.split(',').map((d) =>
		spawn(process.execPath, [vite, '--host', '127.0.0.1'], {
			stdio: 'inherit',
			cwd: '../../demos/teams/' + d,
		}),
	),
];
const stop = () => procs.forEach((p) => p.kill());
process.on('SIGINT', stop);
process.on('exit', stop);
for (const p of procs) p.on('exit', (code) => code && (stop(), process.exit(code)));
