/**
 * Bundle size of every published entry point, and the PR comment comparing two measurements.
 *
 *   node scripts/bundle-size.mjs measure <package dir>... > sizes.json
 *   node scripts/bundle-size.mjs compare <base.json> <head.json> > comment.md
 *
 * An entry point's size is its ESM file plus every file it imports statically (`import`/`export
 * ... from` of a relative path), each counted once: what a consumer loads for that subpath before
 * any lazy `import()`. Bare imports (dependencies) are not counted. Sizes are of the shipped files,
 * raw and gzipped; a consumer's bundler minifies further, so read the change, not the absolute.
 *
 * `compare` reads files written by CI runs, including runs of pull requests from forks, so it
 * treats them as data: names are restricted to path characters and sizes to numbers.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

export const MARKER = '<!-- ooxml-bundle-size -->';
const STATIC_IMPORT =
	/\b(?:import|export)\s*(?:[\w*{}\s,$]*?\s*from\s*)?['"](\.{1,2}\/[^'"]+)['"]/g;

/** The ESM file of an `exports` target, or undefined for types, JSON and CSS-only entries. */
function esmTarget(target) {
	if (typeof target === 'string') return /\.m?js$/.test(target) ? target : undefined;
	if (!target || typeof target !== 'object') return undefined;
	return esmTarget(target.import) ?? esmTarget(target.default);
}

/** Files reachable from `entry` through static relative imports, the entry included. */
export function staticClosure(entry, read = (file) => readFileSync(file, 'utf8')) {
	const seen = new Set();
	const pending = [entry];
	while (pending.length) {
		const file = pending.pop();
		if (seen.has(file) || !existsSync(file)) continue;
		seen.add(file);
		for (const [, specifier] of read(file).matchAll(STATIC_IMPORT)) {
			pending.push(resolve(dirname(file), specifier));
		}
	}
	return [...seen];
}

/** `{ "<package>/<subpath>": { raw, gzip, files } }` for every ESM entry point of a package. */
export function measurePackage(directory) {
	const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
	const sizes = {};
	for (const [subpath, target] of Object.entries(manifest.exports ?? {})) {
		const file = esmTarget(target);
		if (!file || subpath.includes('*')) continue;
		const entry = resolve(directory, file);
		if (!existsSync(entry)) continue;
		let raw = 0;
		let gzip = 0;
		const files = staticClosure(entry);
		for (const path of files) {
			const bytes = readFileSync(path);
			raw += bytes.length;
			gzip += gzipSync(bytes, { level: 9 }).length;
		}
		const name = subpath === '.' ? manifest.name : `${manifest.name}/${subpath.slice(2)}`;
		sizes[name] = { raw, gzip, files: files.length };
	}
	return sizes;
}

const SAFE_NAME = /^[\w@./-]{1,200}$/;
const size = (value) => (Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined);

/** Keeps only well-formed entries of an untrusted measurement. */
export function sanitize(sizes) {
	const out = {};
	for (const [name, entry] of Object.entries(sizes?.entries ?? {})) {
		const raw = size(entry?.raw);
		const gzip = size(entry?.gzip);
		if (SAFE_NAME.test(name) && raw !== undefined && gzip !== undefined) out[name] = { raw, gzip };
	}
	return out;
}

/** `ooxml-core/xml` -> `ooxml-core`, `@scope/pkg/sub` -> `@scope/pkg`. */
const packageOf = (name) =>
	name
		.split('/')
		.slice(0, name.startsWith('@') ? 2 : 1)
		.join('/');

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;
function delta(before, after) {
	const change = after - before;
	if (!change) return '0';
	const percent = before
		? ` (${change > 0 ? '+' : ''}${((change / before) * 100).toFixed(1)}%)`
		: '';
	return `${change > 0 ? '+' : '-'}${kb(Math.abs(change))}${percent}`;
}

/** The PR comment: changed entry points first, then a collapsed table of every entry point. */
export function compare(base, head, { baseLabel = 'main' } = {}) {
	const before = sanitize(base);
	const after = sanitize(head);
	// A package the head run did not build (CI skips ooxml-ui when nothing reaches it) is left
	// out, rather than every one of its entry points reading as removed.
	const measured = new Set(Object.keys(after).map(packageOf));
	const names = [...new Set([...Object.keys(before), ...Object.keys(after)])]
		.filter((name) => measured.has(packageOf(name)))
		.sort();
	const row = (name) => {
		const b = before[name];
		const a = after[name];
		if (!a) return `| \`${name}\` | ${kb(b.gzip)} | removed | |`;
		if (!b) return `| \`${name}\` | | ${kb(a.gzip)} | new |`;
		return `| \`${name}\` | ${kb(b.gzip)} | ${kb(a.gzip)} | ${delta(b.gzip, a.gzip)} |`;
	};
	const changed = names.filter((name) => before[name]?.gzip !== after[name]?.gzip);
	const header = [
		'| Entry point | Before (gzip) | After (gzip) | Change |',
		'| --- | ---: | ---: | ---: |',
	];
	const lines = [MARKER, '### Bundle size', ''];
	if (!names.length) lines.push('No entry points were measured.');
	else if (!changed.length) lines.push(`No entry point changed size against ${baseLabel}.`);
	else {
		lines.push(
			`${changed.length} of ${names.length} entry points changed size against ${baseLabel}:`,
			'',
			...header,
			...changed.map(row),
		);
	}
	if (changed.length) {
		lines.push(
			'',
			'<details><summary>All entry points</summary>',
			'',
			...header,
			...names.map(row),
			'',
			'</details>',
		);
	}
	lines.push(
		'',
		'<sub>Each entry point with the files it imports statically, gzipped, before minification. Measured by `scripts/bundle-size.mjs`.</sub>',
	);
	return { body: `${lines.join('\n')}\n`, changed: changed.length };
}

function main([command, ...args]) {
	if (command === 'measure' && args.length) {
		const entries = {};
		for (const directory of args) {
			if (existsSync(join(directory, 'package.json')))
				Object.assign(entries, measurePackage(directory));
		}
		console.log(JSON.stringify({ entries }, null, '\t'));
		return 0;
	}
	if (command === 'compare' && args.length >= 2) {
		const [basePath, headPath, baseLabel] = args;
		const read = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {});
		const { body } = compare(read(basePath), read(headPath), baseLabel ? { baseLabel } : {});
		process.stdout.write(body);
		return 0;
	}
	console.error(
		`Usage: node ${relative(process.cwd(), process.argv[1] ?? '')} measure <package dir>... | compare <base.json> <head.json> [label]`,
	);
	return 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	process.exitCode = main(process.argv.slice(2));
}
