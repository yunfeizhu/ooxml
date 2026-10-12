import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

import { isolationProjects } from '../../scripts/vitest-isolation.mjs';

/** Package version, baked into the bundle as `__PPTX_PACKAGE_VERSION__` (see `src/version.ts`). */
const pkgVersion = (
	JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as { version: string }
).version;

export default defineConfig({
	// Shared UI sources and their raw CSS now live outside the viewer workspace.
	server: { fs: { allow: [resolve(__dirname, '../../../..')] } },
	define: {
		__PPTX_PACKAGE_VERSION__: JSON.stringify(pkgVersion),
	},
	plugins: [
		vue({
			template: { compilerOptions: { isCustomElement: (tag) => tag.startsWith('pptx-ui-') } },
		}),
	],
	resolve: {
		// Test against workspace sources (not dists) so the suite never runs
		// against stale build output. Mirrors the Vanilla package's vitest setup.
		// Subpath aliases must come first (first match wins).
		alias: [
			{ find: 'pptx-vue-viewer/viewer', replacement: resolve(__dirname, 'src/viewer/index.ts') },
			{ find: /^pptx-vue-viewer$/, replacement: resolve(__dirname, 'src/index.ts') },
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
		projects: isolationProjects('vue', __dirname, 'happy-dom'),
		setupFiles: ['./src/test-setup.ts'],
	},
});
