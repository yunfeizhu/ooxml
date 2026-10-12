// Shared-worker test runs for the pptx binding packages.
//
// Evaluating each test file's module graph in a fresh worker is most of a package's test time, so
// the packages run with `isolate: false` (a worker is reused across files). The DOM is reused too,
// so a setup file removes what a file leaves on `document` and `window`. Some files still cannot
// take a worker another file has used, and are found by content, so a new test is covered without
// touching any config:
//
// - A file that mocks a module (`vi.mock`, `vi.doMock`), asserts a raw `pptx.*` key (i18n must
//   not be initialized), or carries the marker comment
//   `@vitest-fresh-modules` (it depends on module state, such as a lazily loaded library): it runs
//   in a second project that still shares workers but resets the module registry before the file
//   loads, so it always imports a fresh graph.
// - A file that asserts the absence of browser globals (`*ssr.test.*` or the comment
//   `@vitest-own-worker`) or initializes the Angular
//   TestBed (which may only be initialized once per worker): it keeps a worker of its own.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const MOCKS = /\bvi\.(?:mock|doMock)\s*[<(]|@vitest-fresh-modules/;
// A test that names a raw catalogue key (`'pptx.some.key'`) only passes while i18n has not been
// initialized (the key is what renders), and an earlier file in a shared worker may have
// initialized it.
const RAW_KEY = /['"]pptx\.[a-z][A-Za-z0-9]*\.[A-Za-z0-9_.]+['"]/;
const ENVIRONMENT = /@vitest-environment\s+([\w-]+)/;
const OWN_WORKER = /\bTestBed\.initTestEnvironment\(|@vitest-own-worker/;
const SSR = /ssr\.test\.tsx?$/;
const TEST_FILE = /\.test\.tsx?$/;
// A shared worker keeps every file's heap until it exits, so give it room (the default can run out).
const EXEC_ARGV = ['--max-old-space-size=4096'];
const HERE = dirname(fileURLToPath(import.meta.url));
const RESET_MODULES = join(HERE, 'vitest-reset-modules.setup.ts');
const DOM_HYGIENE = join(HERE, 'vitest-dom-hygiene.setup.ts');

function walk(dir, out) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) {
			continue;
		}
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			walk(path, out);
		} else if (TEST_FILE.test(entry.name)) {
			out.push(path);
		}
	}
	return out;
}

/**
 * Test files under `<root>/src`, relative to `root`, split by what they need: `mocked` and
 * `alone` as described above, and the rest by DOM environment (the file's
 * `@vitest-environment` annotation, else `defaultEnvironment`). `extraFiles` are test files outside
 * `src`, relative to `root`.
 */
export function classifyTestFiles(root, defaultEnvironment, extraFiles = []) {
	const mocked = [];
	const alone = [];
	const byEnvironment = new Map();
	for (const file of [
		...walk(join(root, 'src'), []),
		...extraFiles.map((file) => join(root, file)),
	]) {
		const name = relative(root, file).split(sep).join('/');
		const source = readFileSync(file, 'utf8');
		if (SSR.test(file) || OWN_WORKER.test(source)) alone.push(name);
		else if (MOCKS.test(source) || RAW_KEY.test(source)) mocked.push(name);
		else {
			const environment = ENVIRONMENT.exec(source)?.[1] ?? defaultEnvironment;
			byEnvironment.set(environment, [...(byEnvironment.get(environment) ?? []), name]);
		}
	}
	return { mocked, alone, byEnvironment };
}

/**
 * The `projects` entries for a package. Each extends the package's own config (aliases, plugins,
 * setup files, environment), so none of that is repeated here.
 */
export function isolationProjects(name, root, defaultEnvironment, extraFiles = []) {
	const { mocked, alone, byEnvironment } = classifyTestFiles(root, defaultEnvironment, extraFiles);
	// A module cached by one file extends that file's `HTMLElement`, so files pinned to different
	// DOMs must not share a worker: each environment is a project with its own module cache.
	return [
		...[...byEnvironment].map(([environment, include]) => ({
			extends: true,
			test: {
				name: environment === defaultEnvironment ? name : `${name}-${environment}`,
				environment,
				isolate: false,
				include,
				setupFiles: [DOM_HYGIENE],
				execArgv: EXEC_ARGV,
			},
		})),
		...(mocked.length > 0
			? [
					{
						extends: true,
						test: {
							name: `${name}-mocked`,
							isolate: false,
							include: mocked,
							setupFiles: [RESET_MODULES, DOM_HYGIENE],
							execArgv: EXEC_ARGV,
						},
					},
				]
			: []),
		...(alone.length > 0
			? [{ extends: true, test: { name: `${name}-alone`, isolate: true, include: alone } }]
			: []),
	];
}
