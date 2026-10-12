import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { rewriteEsmDeclarationImports } from './esm-declarations.mjs';

test('extensionless declaration trees retain typed exports in a strict NodeNext consumer', () => {
	const directory = mkdtempSync(join(tmpdir(), 'ooxml-esm-declarations-'));
	assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
	try {
		mkdirSync(join(directory, 'nested/deeper'), { recursive: true });
		writeFileSync(join(directory, 'package.json'), '{"type":"module"}');
		writeFileSync(join(directory, 'model.d.ts'), 'export interface Model { name: string }');
		writeFileSync(join(directory, 'nested/index.d.ts'), 'export { Model } from "../model";');
		writeFileSync(join(directory, 'esm.d.mts'), 'export interface Esm { esm: true }');
		writeFileSync(join(directory, 'cjs.d.cts'), 'export interface Cjs { cjs: true }');
		writeFileSync(join(directory, 'Component.svelte.d.ts'), 'export interface Component {}');
		// A dotted file name is not an extension, and `..` names the parent directory's index.
		writeFileSync(
			join(directory, 'widths.generated.d.ts'),
			'export interface Widths { em: number }',
		);
		writeFileSync(
			join(directory, 'nested/deeper/leaf.d.ts'),
			"export { Model as Leaf } from '..';",
		);
		writeFileSync(
			join(directory, 'assets.d.ts'),
			"export type Component = import('./Component.svelte').Component;",
		);
		writeFileSync(
			join(directory, 'index.d.ts'),
			`export { Model } from './nested';
export type Dynamic = import('./model').Model;
export { Esm } from './esm';
export { Cjs } from './cjs';
export { Widths } from './widths.generated';
export { Leaf } from './nested/deeper/leaf';
// import('./model') and from './nested' are documentation.
/** export * from './nested' */
export declare const literal: "from './nested'";
export type Existing = import('./model.js').Model;
`,
		);
		assert.equal(rewriteEsmDeclarationImports(directory), 3);
		assert.equal(rewriteEsmDeclarationImports(directory), 0);
		const emitted = readFileSync(join(directory, 'index.d.ts'), 'utf8');
		assert.ok(emitted.includes("// import('./model') and from './nested' are documentation."));
		assert.ok(emitted.includes("/** export * from './nested' */"));
		assert.ok(emitted.includes('"from \'./nested\'"'));
		assert.ok(
			readFileSync(join(directory, 'assets.d.ts'), 'utf8').includes("import('./Component.svelte')"),
		);
		assert.ok(emitted.includes("from './widths.generated.js'"));
		assert.ok(
			readFileSync(join(directory, 'nested/deeper/leaf.d.ts'), 'utf8').includes(
				"from '../index.js'",
			),
		);
		writeFileSync(
			join(directory, 'consumer.ts'),
			`import type { Model, Dynamic, Esm, Cjs, Widths, Leaf } from './index.js';
const name: Model['name'] = 'drawing';
const dynamic: Dynamic = { name };
const esm: Esm = { esm: true };
const cjs: Cjs = { cjs: true };
const widths: Widths = { em: 1 };
const leaf: Leaf = { name };
// @ts-expect-error Model must not silently resolve as any.
const invalid: Model['name'] = 42;
// @ts-expect-error Widths must not silently resolve as any.
const invalidWidths: Widths['em'] = 'wide';
void [dynamic, esm, cjs, widths, leaf, invalid, invalidWidths];`,
		);
		const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
		execFileSync(
			process.execPath,
			[
				join(root, 'src/core/node_modules/typescript/bin/tsc'),
				'--ignoreConfig',
				'--noEmit',
				'--strict',
				'--module',
				'nodenext',
				'--target',
				'es2022',
				'--types',
				'',
				'consumer.ts',
			],
			{ cwd: directory, stdio: 'pipe' },
		);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});
