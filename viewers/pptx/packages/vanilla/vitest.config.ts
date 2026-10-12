import { resolve } from 'node:path';

import { defineConfig } from 'vitest/config';

import { isolationProjects } from '../../scripts/vitest-isolation.mjs';

export default defineConfig({
	// The demo's own test (included below) lives in demos/pptx at the repository root, outside the
	// workspace root Vite would otherwise allow it to serve files from (viewers/pptx).
	server: { fs: { allow: [resolve(__dirname, '../../../..')] } },
	resolve: {
		alias: [
			{
				find: 'ooxml-ui/pptx/dom',
				replacement: resolve(__dirname, '../../../../src/ui/src/pptx/dom/index.ts'),
			},
			{ find: 'pptx-vanilla-viewer', replacement: resolve(__dirname, 'src/index.ts') },
			// Test against workspace sources (not dists) so the suite never runs
			// against stale build output. Mirrors the Vue package's vitest setup.
			// Subpath aliases must come first (first match wins).
			{
				find: 'ooxml-ui/pptx/i18n',
				replacement: resolve(__dirname, '../../../../src/ui/src/pptx/i18n/index.ts'),
			},
			{
				find: 'ooxml-ui/pptx/ai',
				replacement: resolve(__dirname, '../../../../src/ui/src/pptx/ai/index.ts'),
			},
			{
				find: 'ooxml-ui/pptx',
				replacement: resolve(__dirname, '../../../../src/ui/src/pptx/index.ts'),
			},
			{
				find: 'pptx-viewer-core/chart',
				replacement: resolve(__dirname, '../core/src/chart/index.ts'),
			},
			{
				find: 'pptx-viewer-core/text',
				replacement: resolve(__dirname, '../core/src/text/index.ts'),
			},
			{
				find: 'pptx-viewer-core/geometry',
				replacement: resolve(__dirname, '../core/src/geometry/index.ts'),
			},
			{
				find: 'pptx-viewer-core/color',
				replacement: resolve(__dirname, '../core/src/color/index.ts'),
			},
			{
				find: 'pptx-viewer-core/ui',
				replacement: resolve(__dirname, '../core/src/ui/index.ts'),
			},
			{
				find: 'pptx-viewer-core/smartart-layouts',
				replacement: resolve(__dirname, '../core/src/smartart-layouts/index.ts'),
			},
			{
				find: 'pptx-viewer-core/math',
				replacement: resolve(__dirname, '../core/src/math/index.ts'),
			},
			{ find: 'pptx-viewer-core', replacement: resolve(__dirname, '../core/src/index.ts') },
		],
	},
	test: {
		globals: true,
		environment: 'happy-dom',
		maxWorkers: 4,
		// Most of this suite mounts a whole viewer (ribbon with its style
		// galleries, dialogs, canvas) in happy-dom: about a second locally but
		// 3.5-5.5s on the hosted CI runner, where vitest's 5s default failed five
		// tests in CI run 36183962014. Matches core and svelte, which set 30s.
		testTimeout: 30_000,
		projects: isolationProjects('vanilla', __dirname, 'happy-dom', [
			'../../../../demos/pptx/demo-vanilla/src/host-owned-inline-editor.test.ts',
		]),
		setupFiles: ['./src/web-controls.test-setup.ts'],
	},
});
