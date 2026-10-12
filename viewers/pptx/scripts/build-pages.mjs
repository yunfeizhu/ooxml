/**
 * build-pages.mjs: build the pptx viewer's part of the GitHub Pages site into
 * `docs/.vitepress/dist`, served at https://christophervr.github.io/ooxml/pptx/.
 *
 * Builds the VitePress documentation, then each framework demo with its asset base under
 * `/ooxml/pptx/<route>/`, and copies every demo into the docs output at that route. The root
 * `scripts/build-pages.mjs` runs this after `build:packages`, because the demos resolve the
 * bindings through their `dist`.
 */

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, rmSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const docs = resolve(root, 'docs');
const dist = resolve(docs, '.vitepress', 'dist');
const BASE = '/ooxml/pptx';

/** The routes match the ones the viewer served on its own site, so only the prefix changes. */
const demos = [
	{ framework: 'react', route: 'demo' },
	{ framework: 'vue', route: 'demo-vue' },
	{ framework: 'angular', route: 'demo-angular' },
	{ framework: 'vanilla', route: 'demo-vanilla' },
	{ framework: 'svelte', route: 'demo-svelte' },
];

function run(command, args, cwd, env = process.env) {
	console.log(`--- ${cwd.slice(root.length + 1) || '.'}: ${command} ${args.join(' ')} ---`);
	const result = spawnSync(command, args, {
		cwd,
		env,
		stdio: 'inherit',
		shell: process.platform === 'win32' && command === 'bun',
	});
	if (result.error) {
		throw result.error;
	}
	if (result.status !== 0) {
		throw new Error(`${command} ${args.join(' ')} failed in ${cwd}`);
	}
}

run('bun', ['run', 'docs:build'], docs);

for (const { framework, route } of demos) {
	const demo = resolve(root, '..', '..', 'demos', 'pptx', `demo-${framework}`);
	const built = resolve(demo, 'dist');
	rmSync(built, { recursive: true, force: true });
	run('bun', ['run', 'build'], demo, { ...process.env, DEMO_BASE: `${BASE}/${route}/` });
	const index = resolve(built, 'index.html');
	if (!existsSync(index) || statSync(index).size === 0) {
		throw new Error(`${framework} demo build did not produce ${index}`);
	}
	const out = resolve(dist, route);
	rmSync(out, { recursive: true, force: true });
	cpSync(built, out, { recursive: true });
}

console.log(`Built the pptx documentation and ${demos.length} framework demos.`);
