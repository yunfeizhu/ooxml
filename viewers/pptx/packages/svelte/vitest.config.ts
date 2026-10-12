import { resolve } from 'node:path';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

import { isolationProjects } from '../../scripts/vitest-isolation.mjs';

export default defineConfig({
	// Shared UI sources and their raw CSS now live outside the viewer workspace.
	server: { fs: { allow: [resolve(__dirname, '../../../..')] } },
	plugins: [svelte({ compilerOptions: { css: 'injected' } })],
	resolve: {
		// Test against workspace sources (not dists) so the suite never runs
		// against stale build output. Mirrors the Vue/Vanilla packages' vitest
		// setup. Subpath aliases must come first (first match wins).
		alias: [
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
		// Svelte 5 ships separate client/server runtimes; without the browser
		// condition Vitest resolves the server runtime and `mount()` throws.
		conditions: ['browser'],
	},
	test: {
		globals: true,
		environment: 'happy-dom',
		maxWorkers: 4,
		projects: isolationProjects('svelte', __dirname, 'happy-dom'),
		setupFiles: ['./src/web-controls.test-setup.ts'],
		// The component suite parses a real .pptx fixture per test.
		testTimeout: 30000,
	},
});
