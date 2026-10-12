import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compile } from 'svelte/compiler';
import { forbiddenManifestEntries, undeclaredImports } from './check-published-refs.mjs';

/**
 * Packs the seven published packages (@christophervr/xlsx-core and the six self-contained framework
 * packages), installs the tarballs together into a clean consumer, and exercises them: every entry
 * imports in Node without a DOM, an .xlsx and a legacy .xls workbook load through each framework
 * package, and no tarball imports an internal workspace package or `@christophervr/ole2`.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const work = await mkdtemp(path.join(tmpdir(), 'xlsx-package-smoke-'));
const npmCli =
	process.platform === 'win32'
		? path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
		: 'npm';
const run = (command, args, options = {}) => {
	const executable = command === 'npm' && process.platform === 'win32' ? process.execPath : command;
	const executableArgs =
		command === 'npm' && process.platform === 'win32' ? [npmCli, ...args] : args;
	const result = spawnSync(executable, executableArgs, { cwd: root, encoding: 'utf8', ...options });
	if (result.status !== 0)
		throw new Error(
			`${command} ${args.join(' ')} failed${result.error ? `: ${result.error.message}` : ''}\n${result.stdout}\n${result.stderr}`,
		);
	return result.stdout;
};

const FRAMEWORKS = ['react', 'vue', 'angular', 'solid', 'svelte', 'vanilla'];
const PUBLISHED = ['core', ...FRAMEWORKS];
const entryOf = (name) => (name === 'svelte' ? 'dist/runtime.js' : 'dist/index.js');
const NPM_NAMES = {
	core: '@christophervr/xlsx-core',
	react: '@christophervr/xlsx-react-viewer',
	vue: 'xlsx-vue-viewer',
	angular: 'xlsx-angular-viewer',
	solid: 'xlsx-solid-viewer',
	svelte: 'xlsx-svelte-viewer',
	vanilla: 'xlsx-vanilla-viewer',
};
const specifierOf = (name) => `${NPM_NAMES[name]}${name === 'svelte' ? '/runtime' : ''}`;

async function files(directory) {
	const result = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const target = path.join(directory, entry.name);
		if (entry.isDirectory()) result.push(...(await files(target)));
		else result.push(target);
	}
	return result;
}

/** Inspects the extracted tarball: manifest, entry files and every import it ships. */
async function inspectTarball(name, packed, directory) {
	const manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
	assert.equal(manifest.private, undefined, `${packed.name} must not be private`);
	assert(!JSON.stringify(manifest).includes('workspace:'), `${packed.name} has a workspace: range`);
	assert(!JSON.stringify(manifest).includes('file:'), `${packed.name} has a file: range`);
	assert.deepEqual(forbiddenManifestEntries(manifest), [], `${packed.name} manifest`);
	assert(
		packed.files.some((entry) => entry.path === entryOf(name)),
		`${packed.name} has no built JavaScript entry`,
	);
	assert(
		packed.files.some((entry) => entry.path === 'dist/index.d.ts'),
		`${packed.name} has no TypeScript declarations`,
	);
	if (name !== 'core') {
		assert.deepEqual(
			Object.keys(manifest.dependencies)
				.filter((dep) => /^(?:@christophervr\/|xlsx-|ooxml-)/.test(dep))
				.sort(),
			['@christophervr/xlsx-core', 'ooxml-core', 'ooxml-ui'],
			`${packed.name} may depend on no project package but @christophervr/xlsx-core, ooxml-ui and ooxml-core`,
		);
	}
	for (const file of await files(path.join(directory, 'dist'))) {
		if (!/\.(?:js|d\.ts|svelte)$/.test(file)) continue;
		assert.deepEqual(
			undeclaredImports(await readFile(file, 'utf8'), manifest),
			[],
			`${packed.name} imports an undeclared or unpublished module in ${path.relative(directory, file)}`,
		);
	}
	return manifest;
}

const consumerSource = `import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
${FRAMEWORKS.map((name) => `import * as ${name} from '${specifierOf(name)}';`).join('\n')}
import * as core from '@christophervr/xlsx-core';
import * as load from '@christophervr/xlsx-core/load';
assert.equal(typeof globalThis.document, 'undefined', 'SSR import must not require a DOM');
assert.equal(typeof core.createWorkbook, 'function');
assert.equal('loadLegacyXls' in core, false, 'the main core entry must not pull in the .xls reader');
assert.equal(typeof load.loadWorkbook, 'function');
const frameworks = { react, vue, angular, solid, svelte, vanilla };
const component = { react: 'SpreadsheetEditor', vue: 'SpreadsheetEditor', angular: 'SpreadsheetEditorComponent', solid: 'SpreadsheetEditor' };
for (const [name, entry] of Object.entries(frameworks)) {
	if (component[name]) assert(entry[component[name]], name + ' must export its component');
	for (const helper of ['loadWorkbook', 'detectWorkbookFormat', 'saveWorkbook', 'defineXlsxEditor', 'normalizeEditorLocale', 'createWorkbook', 'saveXlsx', 'XlsxEditorElement'])
		assert.equal(typeof entry[helper], 'function', name + ' must export ' + helper);
}
assert.equal(typeof vanilla.mountEditor, 'function');
assert.equal(typeof svelte.mountEditor, 'function');

const blank = await core.loadXlsx(await core.saveXlsx(core.createWorkbook()));
assert.equal(blank.sheets.length, 1, 'a new workbook round-trips through the core alone');
const xlsx = new Uint8Array(await readFile('fixtures/sample.xlsx'));
const xls = new Uint8Array(await readFile('fixtures/legacy-97.xls'));
for (const [name, entry] of Object.entries(frameworks)) {
	assert.equal(entry.detectWorkbookFormat(xlsx), 'xlsx', name);
	const workbook = await entry.loadWorkbook(xlsx, { fileName: 'sample.xlsx' });
	const names = workbook.sheets.map((sheet) => sheet.name);
	assert.equal(names.length, 3, name + ' sample sheets');
	const reopened = await entry.loadWorkbook(await entry.saveXlsx(workbook));
	assert.deepEqual(reopened.sheets.map((sheet) => sheet.name), names, name + ' save keeps the sheets');
	// Legacy .xls through ooxml-core/xlsx/load, which inlines the ole2 codecs: nothing depends on ole2.
	assert.equal(entry.detectWorkbookFormat(xls), 'xls', name);
	const legacy = await entry.loadWorkbook(xls);
	assert.equal(legacy.format, 'xls', name);
	assert(legacy.sheets.length > 0, name + ' legacy .xls sheets');
	assert.equal(entry.detectWorkbookFormat(await entry.saveWorkbook(legacy, 'xlsx')), 'xlsx', name + ' .xls saves as .xlsx');
	const csv = new TextDecoder().decode(await entry.saveWorkbook(workbook, 'csv', 0));
	assert(csv.length > 0, name + ' csv export');
}
`;

const typingSource = `import { createWorkbook, type Workbook } from '@christophervr/xlsx-core';
import { loadWorkbook as loadAny, type WorkbookFormat } from '@christophervr/xlsx-core/load';
import { SpreadsheetEditor as ReactEditor, loadWorkbook, type EditorOptions } from '@christophervr/xlsx-react-viewer';
import { SpreadsheetEditor as VueEditor } from 'xlsx-vue-viewer';
import { SpreadsheetEditorComponent } from 'xlsx-angular-viewer';
import { SpreadsheetEditor as SolidEditor } from 'xlsx-solid-viewer';
import SvelteEditor from 'xlsx-svelte-viewer';
import { mountEditor, XlsxEditorElement, type EditorHandle } from 'xlsx-vanilla-viewer';
const options: EditorOptions = { workbook: createWorkbook(), locale: 'fr', showFormulaBar: false };
const workbook: Workbook = options.workbook!;
const format: WorkbookFormat = 'xls';
void [workbook, format, loadAny, ReactEditor, loadWorkbook, VueEditor, SpreadsheetEditorComponent, SolidEditor, SvelteEditor, mountEditor, XlsxEditorElement];
export type Handle = EditorHandle;
`;

/** The Svelte component compiles and every helper it imports exists in the bundled runtime. */
async function checkSvelte(inspected, installed) {
	const manifest = JSON.parse(
		await readFile(path.join(inspected, 'svelte', 'package.json'), 'utf8'),
	);
	assert.equal(manifest.exports['.'].svelte, './dist/XlsxEditor.svelte');
	assert.equal(manifest.exports['./runtime'].import, './dist/runtime.js');
	const source = await readFile(
		path.join(inspected, 'svelte', 'dist', 'XlsxEditor.svelte'),
		'utf8',
	);
	compile(source, { filename: 'XlsxEditor.svelte', generate: 'client' });
	const runtime = await import(
		pathToFileURL(path.join(installed, 'xlsx-svelte-viewer', 'dist', 'runtime.js')).href
	);
	for (const [, names, from] of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
		assert.equal(from, './runtime.js', 'XlsxEditor.svelte must import its sibling runtime');
		for (const name of names
			.split(',')
			.map((part) => part.trim())
			.filter((part) => part && !part.startsWith('type ')))
			assert.equal(typeof runtime[name], 'function', `runtime.js must export ${name}`);
	}
}

try {
	const tarballs = [];
	const peers = new Map();
	const inspected = path.join(work, 'inspect');
	for (const name of PUBLISHED) {
		const packed = JSON.parse(
			run('npm', ['pack', '--json', '--pack-destination', work, path.join(root, 'packages', name)]),
		)[0];
		tarballs.push(path.join(work, packed.filename));
		const target = path.join(inspected, name);
		await mkdir(target, { recursive: true });
		// Relative paths: GNU tar (Git for Windows) reads `C:` as a remote host.
		run('tar', ['-xzf', packed.filename, '--strip-components=1', '-C', `inspect/${name}`], {
			cwd: work,
		});
		const manifest = await inspectTarball(name, packed, target);
		for (const [dependency, version] of Object.entries(manifest.peerDependencies ?? {}))
			peers.set(dependency, version);
	}
	await writeFile(
		path.join(work, 'package.json'),
		JSON.stringify({ private: true, type: 'module' }),
	);
	run(
		'npm',
		[
			'install',
			'--ignore-scripts',
			'--no-audit',
			'--no-fund',
			'--package-lock=false',
			...tarballs,
			...Array.from(peers, ([name, version]) => `${name}@${version}`),
		],
		{ cwd: work },
	);
	const installed = path.join(work, 'node_modules');
	const names = [
		...(await readdir(installed)),
		...(await readdir(path.join(installed, '@christophervr')).catch(() => [])),
	];
	assert.deepEqual(
		names.filter((name) => name.includes('ole2') || /^xlsx-(?:bindings|web-component)$/.test(name)),
		[],
		'no internal package or ole2 may be installed alongside the published ones',
	);

	await mkdir(path.join(work, 'fixtures'));
	for (const [name, source] of [
		['sample.xlsx', '../../demos/xlsx/demo-vanilla/public/sample.xlsx'],
		['legacy-97.xls', '../../e2e/xlsx/support/legacy-97.xls'],
	])
		await writeFile(path.join(work, 'fixtures', name), await readFile(path.join(root, source)));
	await writeFile(path.join(work, 'consumer.mjs'), consumerSource);
	run('node', [path.join(work, 'consumer.mjs')], { cwd: work });
	await writeFile(path.join(work, 'consumer.ts'), typingSource);
	run(
		'node',
		[
			path.join(root, 'node_modules/typescript/bin/tsc'),
			...['--noEmit', '--strict', '--skipLibCheck', '--target', 'ES2022', '--module', 'ESNext'],
			...['--moduleResolution', 'bundler', '--jsx', 'react-jsx', '--experimentalDecorators'],
			path.join(work, 'consumer.ts'),
		],
		{ cwd: work },
	);
	await checkSvelte(inspected, installed);
	for (const name of FRAMEWORKS) {
		const bundle = await readFile(path.join(inspected, name, entryOf(name)), 'utf8');
		// The element lives in ooxml-ui; the package imports it instead of bundling a copy.
		assert(
			bundle.includes('ooxml-ui/xlsx'),
			`${name}: the <xlsx-editor> element must come from the ooxml-ui/xlsx dependency`,
		);
		assert(
			!bundle.includes('--xve-'),
			`${name}: the editor's theme CSS must not be bundled into the package`,
		);
	}
	console.log(
		'Packed consumer imports, .xlsx and legacy .xls loading, typings and bundle checks succeeded for @christophervr/xlsx-core and all six framework packages.',
	);
} finally {
	await rm(work, { recursive: true, force: true });
}
