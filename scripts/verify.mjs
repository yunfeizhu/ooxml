#!/usr/bin/env node
/**
 * verify.mjs: run locally what CI would run for the commits not yet on the base branch.
 *
 *   node scripts/verify.mjs [--base origin/main] [--browser] [--full] [--allow-dirty]
 *
 * The checks come from the CI planner (scripts/ci-plan.mjs), so a change runs the same lint,
 * typechecks, tests and viewer checks here as in CI. By default the slow groups are skipped:
 * browser suites, package packing and the standalone MCP install (`--browser` adds the browser
 * suites, `--full` adds everything and checks the whole repository, as the nightly run does).
 * Every step runs with CI=1, so Vitest fails on a missing snapshot instead of writing it.
 *
 * It refuses to run on uncommitted changes to tracked files: the result would describe the working
 * tree, not the commits being pushed (and in a shared checkout, possibly someone else's edits).
 * A local pre-push hook can run it (see AGENTS.md); `git push --no-verify` skips it once.
 */
import { spawnSync, execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { changedSince, plan } from './ci-plan.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const full = flag('--full');
const browser = full || flag('--browser');
const base = value('--base', 'origin/main');
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();

/** Commands of a viewer's verify list that only `--browser` or `--full` runs. */
const BROWSER = /playwright|test:browser|e2e/;
const SLOW =
	/mktemp|pack:smoke|build:packages|test:packages|check:published|test:package\b|test:worker/;
const FORMATTED = /\.(m?[jt]sx?|css|json|md|vue|svelte|html|ya?ml)$/;

function fail(message) {
	console.error(`\nverify: ${message}`);
	process.exit(1);
}

if (!flag('--allow-dirty') && git('status', '--porcelain', '--untracked-files=no'))
	fail(
		'tracked files have uncommitted changes, so the checks would not describe the commits being\n' +
			'pushed. Commit or stash them (or verify from a clean worktree), or pass --allow-dirty.',
	);

// CI installs with the Bun version of .github/actions/setup; another version can write a
// different lockfile and resolve differently.
const action = readFileSync(join(ROOT, '.github/actions/setup/action.yml'), 'utf8');
const ciBun = /bun-version:[\s\S]*?default:\s*'([^']+)'/.exec(action)?.[1];
let localBun = '';
try {
	// Through the shell: on Windows `bun` is a shim Node cannot spawn by name.
	localBun = execFileSync('bun --version', { encoding: 'utf8', shell: true }).trim();
} catch {
	console.warn('verify: warning: could not run `bun --version`.');
}
if (ciBun && localBun && ciBun !== localBun)
	console.warn(`verify: warning: local Bun ${localBun} differs from CI's ${ciBun} (bun upgrade).`);

const changed = full ? [] : changedSince(base);
if (!full && !changed) fail(`cannot diff against ${base}; fetch it or pass --base <ref>.`);
const files = (changed ?? []).filter(Boolean);
if (!full && !files.length) {
	console.log(`verify: nothing differs from ${base}.`);
	process.exit(0);
}
const p = plan(files, { full });

const steps = [];
const add = (cmd, cwd = '.') => steps.push({ cmd, cwd });
add('bun run lint');

// Formatting of the changed files, with each viewer's own oxfmt configuration.
const present = files.filter((file) => FORMATTED.test(file) && existsSync(join(ROOT, file)));
const byViewer = new Map();
for (const file of present) {
	const dir = /^viewers\/[^/]+/.exec(file)?.[0] ?? '.';
	byViewer.set(dir, [...(byViewer.get(dir) ?? []), dir === '.' ? file : relative(dir, file)]);
}
for (const [dir, list] of byViewer)
	add(`bunx oxfmt --check ${list.map((file) => JSON.stringify(file)).join(' ')}`, dir);

if (p.build) {
	add('bun run build');
	add('bun run --cwd src/ui build');
}
if (p.typecheck.strict) add('bun run typecheck:strict');
if (p.typecheck.pptx) add('bun run typecheck:pptx');
if (p.typecheck.ui) add('bun run --cwd src/ui typecheck');
const changedTests = full ? '' : ` --changed=${base} --passWithNoTests`;
// The core suite follows the plan (a manifest or config change runs all of it, as in CI). The
// ooxml-ui suite takes about a quarter of an hour, so only `--full` runs it whole; CI always does.
if (p.test.run) add(`bun run test${p.test.mode === 'all' ? '' : changedTests}`);
if (p.checks.ui) {
	add(`bunx vitest run${changedTests}`, 'src/ui');
}
if (p.scripts) add('bun run test:scripts');
if (p.mcp) add('bun run test:mcp');
for (const viewer of p.viewers)
	for (const cmd of viewer.verify.split('\n'))
		if ((browser || !BROWSER.test(cmd)) && (full || !SLOW.test(cmd))) add(cmd, viewer.dir);
if (p.pptx.run) {
	add('bun run build:packages', 'viewers/pptx');
	add('bun run typecheck', 'viewers/pptx');
	for (const leg of p.pptx.tests)
		if (leg === 'react18') add('bun run test:react18', 'viewers/pptx/packages/react');
		else add('bun run test', `viewers/pptx/packages/${leg}`);
	if (browser && p.pptx.e2e.projects.length)
		add(
			`bun run e2e ${p.pptx.e2e.projects.map((name) => `--project=${name}`).join(' ')}`,
			'viewers/pptx',
		);
}

// Commands are written for bash (the planner's commands use bash syntax, as in CI).
const shell = process.platform === 'win32' ? 'bash.exe' : 'bash';
console.log(
	`verify: ${steps.length} steps for ${full ? 'the whole repository' : `${files.length} files changed since ${base}`}`,
);
// Git hands a hook the repository it runs for (GIT_DIR, GIT_INDEX_FILE and so on). The steps must
// not inherit it: the release planner's tests build throwaway repositories with `git init`,
// `commit`, `tag` and `config`, which would otherwise land in this repository and its shared
// config when verify runs as the pre-push hook. Each step finds the repository from its directory.
const REPOSITORY_ENV =
	/^GIT_(?:DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|PREFIX)$/;
const env = Object.fromEntries(
	Object.entries({ ...process.env, CI: '1' }).filter(([name]) => !REPOSITORY_ENV.test(name)),
);
const started = Date.now();
for (const [index, step] of steps.entries()) {
	const label = `[${index + 1}/${steps.length}] ${step.cwd === '.' ? '' : `${step.cwd}: `}${step.cmd}`;
	console.log(`\n${label}`);
	const at = Date.now();
	const result = spawnSync(shell, ['-e', '-o', 'pipefail', '-c', step.cmd], {
		cwd: join(ROOT, step.cwd),
		stdio: 'inherit',
		env,
	});
	if (result.status !== 0) fail(`failed: ${label}\nFix it, or push anyway with --no-verify.`);
	console.log(`ok in ${Math.round((Date.now() - at) / 1000)}s`);
}
console.log(
	`\nverify: all ${steps.length} steps passed in ${Math.round((Date.now() - started) / 1000)}s.`,
);
