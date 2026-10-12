import { readFileSync, readdirSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Development resolves the core package from the repository root source, so UI tests never need
// a build of the core. Published consumers get the real dependency.
const coreSource = fileURLToPath(new URL('../core', import.meta.url)).replaceAll(sep, '/');
const uiSource = fileURLToPath(new URL('./src', import.meta.url)).replaceAll(sep, '/');

// Test files share a worker (`isolate: false`): evaluating the module graph once per file was most
// of the suite's time. That only works while every file in a worker agrees on two things, so the
// files are grouped by content, and a new test is placed without touching this file:
//
// - The DOM. A module cached by one file extends that file's `HTMLElement`, so a file pinned to
//   `// @vitest-environment jsdom` must not share a worker with the happy-dom default (or the
//   other way round): each environment is its own project, with its own workers and module cache.
// - The module registry. A file that mocks a module, or asserts the absence of browser globals
//   (SSR), depends on a fresh one, so it keeps a worker of its own in the `*-isolated` projects.
const MOCKS = /\bvi\.(?:mock|doMock)\s*[<(]/;
const ENVIRONMENT = /@vitest-environment\s+([\w-]+)/;

const testFiles = readdirSync(fileURLToPath(new URL('./src', import.meta.url)), {
	recursive: true,
})
	.map((file) => `src/${String(file).split(sep).join('/')}`)
	.filter((file) => file.endsWith('.test.ts'));

type Area = 'ui' | 'pptx';
const DEFAULT_ENVIRONMENT: Record<Area, string> = { ui: 'happy-dom', pptx: 'node' };
const groups = new Map<string, string[]>();
const alone: Record<Area, string[]> = { ui: [], pptx: [] };
for (const file of testFiles) {
	const area: Area = file.startsWith('src/pptx/') ? 'pptx' : 'ui';
	const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
	if (file.endsWith('ssr.test.ts') || MOCKS.test(source)) {
		alone[area].push(file);
		continue;
	}
	const environment = ENVIRONMENT.exec(source)?.[1] ?? DEFAULT_ENVIRONMENT[area];
	const key = `${area}:${environment}`;
	groups.set(key, [...(groups.get(key) ?? []), file]);
}

// Component styles are `.css?raw` text; return the real CSS so tests can read it.
const css = { include: [/\.css\?raw$/] };

const AREAS = {
	// happy-dom is the default DOM (about twice as fast to set up); the files that need jsdom
	// behaviour (shadow-root focus, global confirm, and similar) say so with
	// // @vitest-environment jsdom.
	ui: {
		resolve: {
			alias: [
				{ find: /^ooxml-core\/(.+)$/, replacement: `${coreSource}/$1/index.ts` },
				// The package imports its own subpaths by name; resolve them to source, not to dist.
				{ find: /^ooxml-ui\/pptx\/dom$/, replacement: `${uiSource}/pptx/dom/index.ts` },
			],
		},
		test: {
			globals: true,
			// Editor-mounting tests build a full ProseMirror view; under a parallel run they can take 5s+.
			testTimeout: 20_000,
			css,
			setupFiles: ['./vitest.setup.ts', './vitest.dom-hygiene.setup.ts'],
		},
	},
	pptx: {
		resolve: { alias: [{ find: /^ooxml-core\/(.+)$/, replacement: `${coreSource}/$1` }] },
		test: { css, globals: true, testTimeout: 30_000, hookTimeout: 30_000 },
	},
} as const;

function project(
	area: Area,
	name: string,
	include: string[],
	options: { environment?: string; isolate: boolean },
) {
	const base = AREAS[area];
	return {
		resolve: base.resolve,
		test: {
			...base.test,
			name,
			include,
			isolate: options.isolate,
			...(options.environment ? { environment: options.environment } : {}),
			// Importing a whole registration entry in a fresh worker is the slow part of the SSR files.
			...(options.isolate ? { testTimeout: 60_000 } : {}),
		},
	};
}

const projects = [...groups].map(([key, include]) => {
	const [area, environment] = key.split(':') as [Area, string];
	const name = environment === DEFAULT_ENVIRONMENT[area] ? area : `${area}-${environment}`;
	return project(area, name, include, { environment, isolate: false });
});
for (const area of ['ui', 'pptx'] as const) {
	if (alone[area].length > 0) {
		projects.push(
			project(area, `${area}-isolated`, alone[area], {
				environment: DEFAULT_ENVIRONMENT[area],
				isolate: true,
			}),
		);
	}
}

// All projects share one worker pool, so \`vitest run\` schedules the DOM tests and the pptx tests
// together. \`--project ui*\` or \`--project pptx*\` runs one family.
export default {
	test: {
		// Uncapped, every core runs a worker and the heaviest imports (manifest, SSR) time out; more
		// workers than cores only makes them compete (a 4-core CI runner timed out the SSR files).
		maxWorkers: Math.min(8, availableParallelism()),
		projects,
	},
};
