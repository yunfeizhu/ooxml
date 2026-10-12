#!/usr/bin/env node
// Points a viewer at this checkout of ooxml-core and ooxml-ui, so a change here can be tried and
// pushed there without waiting for a release, and puts the version ranges back afterwards.
//
//   node scripts/link-local.mjs <viewer-dir>             link (builds core and ui first)
//   node scripts/link-local.mjs <viewer-dir> --restore   restore the recorded ranges
//   node scripts/link-local.mjs <viewer-dir> --no-build  link without building
//
// Linking rewrites each manifest to `file:` paths and records the original ranges in
// `.ooxml-link.json` in the viewer. Run `bun install --force` there afterwards. Never commit a
// linked manifest: the viewers' `check:published` and the sync workflow both refuse `file:` ranges.
import { execFileSync } from 'node:child_process';
import {
	closeSync,
	existsSync,
	openSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
	writeSync,
} from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const here = resolve(fileURLToPath(import.meta.url), '..', '..');
export const TARGETS = { 'ooxml-core': 'src/core', 'ooxml-ui': 'src/ui' };
export const BACKUP = '.ooxml-link.json';

/** Rewrites the known packages to `file:` paths; returns the manifest and what to restore. */
export function linkManifest(manifest, fromDir, ooxmlDir = here) {
	const next = structuredClone(manifest);
	const saved = [];
	for (const section of SECTIONS)
		for (const name of Object.keys(next[section] ?? {})) {
			const target = TARGETS[name];
			const range = next[section][name];
			if (target === undefined || typeof range !== 'string' || range.startsWith('file:')) continue;
			const path = relative(fromDir, resolve(ooxmlDir, target)).replaceAll(sep, '/');
			saved.push({ section, name, range });
			next[section][name] = `file:${path}`;
		}
	return { manifest: next, saved };
}

export function restoreManifest(manifest, saved) {
	const next = structuredClone(manifest);
	for (const { section, name, range } of saved)
		if (next[section]?.[name]) next[section][name] = range;
	return next;
}

function manifests(root) {
	return execFileSync('git', ['ls-files', '--', '*package.json'], { cwd: root, encoding: 'utf8' })
		.split('\n')
		.filter((file) => file && !file.includes('node_modules/') && !file.includes('/dist/'));
}

const write = (path, raw, value) => {
	const indent = /^\t/m.test(raw) ? '\t' : 2;
	const eol = raw.includes('\r\n') ? '\r\n' : '\n';
	writeFileSync(path, JSON.stringify(value, null, indent).replace(/\n/g, eol) + eol);
};

/**
 * `ooxml-ui` declares `ooxml-core` with a bare range, so its own install may hold an old published
 * copy. A viewer that links `ooxml-ui` by path resolves types through it, so an old copy turns
 * every new core export into `any`. Point it at this checkout instead (`bun install` here undoes it).
 */
function pointUiAtThisCheckout() {
	const modules = resolve(here, 'src/ui/node_modules');
	if (!existsSync(modules)) return;
	const link = resolve(modules, 'ooxml-core');
	rmSync(link, { recursive: true, force: true });
	symlinkSync(resolve(here, 'src/core'), link, 'junction');
}

function main() {
	const args = process.argv.slice(2);
	const dir = args.find((arg) => !arg.startsWith('--'));
	if (!dir) throw new Error('Usage: link-local.mjs <viewer-dir> [--restore] [--no-build]');
	const root = resolve(dir);
	const backupPath = resolve(root, BACKUP);
	if (args.includes('--restore')) {
		if (!existsSync(backupPath)) throw new Error(`${BACKUP} not found: nothing to restore`);
		const backup = JSON.parse(readFileSync(backupPath, 'utf8'));
		for (const [file, saved] of Object.entries(backup)) {
			const path = resolve(root, file);
			const raw = readFileSync(path, 'utf8');
			write(path, raw, restoreManifest(JSON.parse(raw), saved));
		}
		rmSync(backupPath);
		console.log('Restored. Run `bun install --force` in the viewer.');
		return;
	}
	// Exclusive create: fails fast when already linked, with no check-then-write race.
	let backupFd;
	try {
		backupFd = openSync(backupPath, 'wx');
	} catch (error) {
		if (error?.code === 'EEXIST')
			throw new Error(`${BACKUP} exists: already linked (use --restore)`, { cause: error });
		throw error;
	}
	if (!args.includes('--no-build'))
		for (const cwd of [resolve(here, 'src/core'), resolve(here, 'src/ui')])
			execFileSync('bun', ['run', 'build'], {
				cwd,
				stdio: 'inherit',
				shell: process.platform === 'win32',
			});
	const backup = {};
	for (const file of manifests(root)) {
		const path = resolve(root, file);
		const raw = readFileSync(path, 'utf8');
		const { manifest, saved } = linkManifest(JSON.parse(raw), resolve(path, '..'));
		if (!saved.length) continue;
		backup[file] = saved;
		write(path, raw, manifest);
	}
	writeSync(backupFd, JSON.stringify(backup, null, 2));
	closeSync(backupFd);
	pointUiAtThisCheckout();
	console.log(
		`Linked ${Object.keys(backup).length} manifests. Run \`bun install --force\` in the viewer.`,
	);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
