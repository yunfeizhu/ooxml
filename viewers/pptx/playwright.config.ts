import { existsSync } from 'node:fs';

import { defineConfig, devices } from '@playwright/test';

import { e2eServers } from './e2e-servers';

// Machine-specific settings (PPTX_E2E_WORKERS, PPTX_E2E_ALL_BINDINGS, ...) live in the git-ignored
// `.env.local` next to this file; CI has none and so keeps the defaults below.
if (existsSync('.env.local')) {
	process.loadEnvFile('.env.local');
}

/**
 * One product e2e spec set, run against every framework demo.
 *
 * The product specs selected from `e2e/*.spec.ts` target a framework-neutral
 * DOM/test contract
 * (`#file-input`, `[data-pptx-element="true"]`, `[aria-roledescription="slide"]`,
 * `[data-inline-editor]`, `[data-testid="format-painter-toggle"]` + `data-active`,
 * `#slide-notes-content` / `textarea[name="slide-notes"]`, `aria-label="Adjust shape"`,
 * `[data-pptx-viewport]`, and accessible button names), which the React, Vue,
 * Angular, Vanilla, and Svelte viewers emit, with binding-neutral fallbacks
 * where accessible control names or ribbon semantics differ. Each project
 * boots its own demo dev server and points
 * its `baseURL` at it, so `playwright test --project=react` / `--project=vue` /
 * `--project=angular` / `--project=vanilla` / `--project=svelte` exercise the
 * identical product suite. Documentation capture jobs are intentionally
 * excluded and use `playwright.capture.config.ts` instead.
 *
 * Most specs ask whether a binding works. The `*-parity` specs ask the harder
 * question of whether the five AGREE, by driving several demos in one test and
 * diffing them against React. They get their ports and their per-project fan-out
 * from `e2e/support/`, which `scripts/check-e2e-neutrality.mjs` does not scan,
 * so those specs stay as framework-agnostic as every other one: no port
 * literals, no branching on the project name.
 */
/**
 * Shift every demo port (and the collaboration relay) by this amount so two
 * checkouts, e.g. parallel git worktrees, can run e2e at once without one
 * `reuseExistingServer` silently testing the other's code. Defaults to 0.
 */
const PORT_OFFSET = Number(process.env.PPTX_E2E_PORT_OFFSET ?? 0);
const REACT_PORT = 4173 + PORT_OFFSET;
const VUE_PORT = 4175 + PORT_OFFSET;
const ANGULAR_PORT = 4174 + PORT_OFFSET;
const VANILLA_PORT = 4176 + PORT_OFFSET;
const SVELTE_PORT = 4177 + PORT_OFFSET;
const isCI = Boolean(process.env.CI);
const WORKERS = Number(process.env.PPTX_E2E_WORKERS) || undefined;
/**
 * Locally the suite runs React only unless asked otherwise. React is the parity reference: its
 * parity specs drive all five demos and diff them, so one project still checks every binding
 * against it, at a fifth of the cost of running each binding's own copy of the product specs.
 * `--project=<name>` or `PPTX_E2E_ALL_BINDINGS=1` runs the others; CI always runs them all.
 */
// Workers are forked without the CLI flags, so the main process hands them its decision.
const explicitProject =
	process.env.PPTX_E2E_EXPLICIT_PROJECT === '1' ||
	process.argv.some((arg) => /^(--project|-p)(=|$)/.test(arg));
if (explicitProject) {
	process.env.PPTX_E2E_EXPLICIT_PROJECT = '1';
}
const onlyReference = !isCI && !explicitProject && process.env.PPTX_E2E_ALL_BINDINGS !== '1';

export default defineConfig({
	testDir: '../../e2e/pptx',
	// `packaged-present.spec.ts` is the production-BUILD smoke guard and needs
	// `vite preview` over each demo's built dist, not these dev servers; it runs
	// from `playwright.packaged.config.ts` instead.
	testIgnore: [
		'**/fixtures/**',
		'**/global-setup.*',
		'**/capture-*.spec.ts',
		'**/packaged-present.spec.ts',
	],
	globalSetup: '../../e2e/pptx/global-setup.ts',
	timeout: 60_000,
	expect: { timeout: 10_000 },
	fullyParallel: false,
	workers: WORKERS,
	forbidOnly: isCI,
	// Tests tagged `@local-only` do real-time video capture
	// (MediaRecorder/canvas.captureStream()) that reliably takes down the
	// whole hosted CI runner (exit 143, "the runner has received a shutdown
	// signal") rather than merely failing; see export-raster-tiling.spec.ts
	// for the incident history. They still run locally (`bun run e2e` or
	// `bun run e2e:local-only`) and via the pre-push hook
	// (.husky/pre-push, scripts/pre-push-local-e2e.mjs).
	grepInvert: isCI ? /@local-only/ : undefined,
	retries: isCI ? 2 : 0,
	reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list',
	use: {
		trace: 'retain-on-failure',
		actionTimeout: 10_000,
		// CI-only: GitHub Actions' ubuntu-latest runners have no real GPU, and
		// Chromium's software-GL (SwiftShader) compositing path is what actually
		// crashes under sustained canvas/video load there - `--disable-gpu` (not
		// `--disable-dev-shm-usage` alone, which was tried first and did not
		// help) is what fixes it. Root-caused by reproducing on a real Linux VM
		// constrained to the runner's actual 4 vCPU / 16 GB (a Windows or
		// over-provisioned Linux box never reproduces this): after ~30-50 tests
		// share one worker's Chromium instance, `export-raster-tiling.spec.ts`'s
		// video-recording test (canvas capture + MediaRecorder, GPU-accelerated
		// by default) reliably hit "Error: page.waitForEvent: Page crashed" -
		// a real Chromium renderer crash, not a timeout or a product bug. This
		// was the actual cause of the "the runner has received a shutdown
		// signal" e2e failures on vue/svelte/vanilla shards (2026-09-16/17):
		// neither shard count nor worker count fixed it because it depends on
		// cumulative load on one Chromium instance, not on any single test or on
		// peak concurrency. Left on for local dev too where isCI is false is
		// unnecessary (a real GPU is available and faster), so this only
		// applies in CI.
		//
		// 2026-09-18 follow-up: the whole-runner kill (exit 143, "the runner has
		// received a shutdown signal") recurred on shard 3 in two consecutive
		// vue/vanilla/svelte runs (35264552331, 35270077379), always right after
		// `export-raster-tiling.spec.ts`'s single-binding video-recording test
		// (`video export records at the stage aspect ratio without a corrupted
		// frame`) - it disappears from the `list` reporter's output entirely
		// (never printed as passed OR failed) and the runner dies ~30-50s later,
		// well before that test's own 90s `test.describe.configure` timeout could
		// ever fire. That gap rules out a slow-but-legitimate test: something
		// crashes or wedges the renderer process outright before Playwright's
		// own timeout machinery gets a chance to report it, same shape as the
		// original incident. `--disable-gpu` only forces software
		// COMPOSITING/RASTERIZATION; Chromium tracks accelerated video
		// encode/decode (what `MediaRecorder` over `canvas.captureStream()`
		// actually exercises here) as a separate feature bucket that is not
		// implied by it. Disabling that bucket too targets the exact subsystem
		// this test drives instead of re-tuning shard/worker count again, which
		// the original incident already found does not work.
		launchOptions: isCI
			? {
					args: [
						'--disable-dev-shm-usage',
						'--disable-gpu',
						'--disable-accelerated-video-encode',
						'--disable-accelerated-video-decode',
					],
				}
			: undefined,
	},
	projects: [
		{
			name: 'react',
			use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${REACT_PORT}` },
		},
		{
			name: 'vue',
			use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${VUE_PORT}` },
		},
		{
			name: 'angular',
			use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${ANGULAR_PORT}` },
		},
		{
			name: 'vanilla',
			use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${VANILLA_PORT}` },
		},
		{
			name: 'svelte',
			use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${SVELTE_PORT}` },
		},
		...Object.entries({
			react: REACT_PORT,
			vue: VUE_PORT,
			angular: ANGULAR_PORT,
			vanilla: VANILLA_PORT,
			svelte: SVELTE_PORT,
		}).map(([binding, port]) => ({
			name: `${binding}-headless`,
			metadata: { headless: true },
			testMatch: '**/host-owned-collaboration.spec.ts',
			use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${port}` },
		})),
	].filter((project) => !onlyReference || project.name.startsWith('react')),
	// The same list backs `bun e2e-servers.ts start`, which keeps these servers warm between runs;
	// a server that is already listening is reused outside CI. The first entry is the relay the
	// host-owned collaboration tests use instead of BroadcastChannel.
	webServer: e2eServers().map((server) => ({
		command: server.command,
		cwd: server.cwd,
		env: server.env,
		...(server.url ? { url: server.url } : { port: server.port }),
		reuseExistingServer: !isCI,
		timeout: server.url ? 120_000 : 30_000,
		stdout: 'ignore' as const,
		stderr: 'pipe' as const,
	})),
});
