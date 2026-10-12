import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { MARKER, compare, measurePackage, sanitize } from './bundle-size.mjs';

test('an entry point counts its static imports once and skips lazy and bare ones', () => {
	const directory = mkdtempSync(join(tmpdir(), 'ooxml-bundle-size-'));
	try {
		mkdirSync(join(directory, 'dist'));
		writeFileSync(
			join(directory, 'package.json'),
			JSON.stringify({
				name: 'pkg',
				exports: {
					'.': { types: './dist/index.d.ts', import: './dist/index.mjs' },
					'./extra': './dist/extra.js',
					'./*': './dist/*.js',
					'./package.json': './package.json',
				},
			}),
		);
		writeFileSync(
			join(directory, 'dist/index.mjs'),
			"import { a } from './chunk-a.mjs';\nexport * from './chunk-b.mjs';\nimport 'dep';\nconst lazy = () => import('./lazy.mjs');\n",
		);
		writeFileSync(
			join(directory, 'dist/chunk-a.mjs'),
			"export { b } from './chunk-b.mjs'; export const a = 1;",
		);
		writeFileSync(join(directory, 'dist/chunk-b.mjs'), 'export const b = 2;');
		writeFileSync(join(directory, 'dist/lazy.mjs'), 'x'.repeat(10_000));
		writeFileSync(join(directory, 'dist/extra.js'), 'export {};');
		const sizes = measurePackage(directory);
		assert.deepEqual(Object.keys(sizes), ['pkg', 'pkg/extra']);
		assert.equal(sizes.pkg.files, 3);
		assert.ok(sizes.pkg.raw < 1000, 'the lazy chunk is not counted');
		assert.equal(sizes['pkg/extra'].files, 1);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test('untrusted measurements keep only path-like names and numeric sizes', () => {
	assert.deepEqual(
		sanitize({
			entries: {
				'ooxml-core/xml': { raw: 10.4, gzip: 4 },
				'<img src=x onerror=alert(1)>': { raw: 1, gzip: 1 },
				'ooxml-core/bad': { raw: '9', gzip: 1 },
				'ooxml-core/negative': { raw: -1, gzip: 1 },
			},
		}),
		{ 'ooxml-core/xml': { raw: 10, gzip: 4 } },
	);
	assert.deepEqual(sanitize(null), {});
});

test('the comment lists changed, new and removed entry points', () => {
	const base = {
		entries: {
			'pkg/a': { raw: 2048, gzip: 1024 },
			'pkg/b': { raw: 10, gzip: 10 },
			'pkg/gone': { raw: 1, gzip: 1 },
		},
	};
	const head = {
		entries: {
			'pkg/a': { raw: 4096, gzip: 2048 },
			'pkg/b': { raw: 10, gzip: 10 },
			'pkg/fresh': { raw: 1, gzip: 512 },
		},
	};
	const { body, changed } = compare(base, head, { baseLabel: 'main (abc1234)' });
	assert.equal(changed, 3);
	assert.ok(body.startsWith(MARKER));
	assert.ok(body.includes('3 of 4 entry points changed size against main (abc1234):'));
	assert.ok(body.includes('| `pkg/a` | 1.0 kB | 2.0 kB | +1.0 kB (+100.0%) |'));
	assert.ok(body.includes('| `pkg/fresh` | | 0.5 kB | new |'));
	assert.ok(body.includes('| `pkg/gone` | 0.0 kB | removed | |'));
	assert.equal(compare(base, base).changed, 0);
	// A package missing from the head measurement was not built, not deleted.
	const unbuilt = compare(
		{ entries: { 'core/x': { raw: 1, gzip: 1 }, 'ui/y': { raw: 1, gzip: 1 } } },
		{ entries: { 'core/x': { raw: 1, gzip: 1 } } },
	);
	assert.equal(unbuilt.changed, 0);
	assert.ok(!unbuilt.body.includes('ui/y'));
	assert.ok(compare(base, base).body.includes('No entry point changed size against main.'));
	// Without a change there is nothing to tabulate.
	assert.ok(!compare(base, base).body.includes('| Entry point'));
	assert.ok(body.includes('<details><summary>All entry points</summary>'));
});
