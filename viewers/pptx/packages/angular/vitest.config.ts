import { resolve } from 'node:path';

import { defineConfig } from 'vitest/config';

import { isolationProjects } from '../../scripts/vitest-isolation.mjs';

/**
 * Unit tests for the framework-agnostic helpers (element-style, utils), plus
 * `.component.ts` files imported for their co-located pure-logic exports (see
 * `vitest-setup.ts` for why that needs the Angular compiler loaded).
 *
 * Full TestBed rendering (mounting a component into a real DOM) is a bigger
 * follow-up: it needs `@analogjs/vite-plugin-angular` to give `@Component`
 * classes real `ɵcmp` factories, which is a broader change than loading the
 * JIT compiler for these import-time-only tests.
 */
export default defineConfig({
	server: { fs: { allow: [resolve(import.meta.dirname, '../../../..')] } },
	resolve: {
		// Keep leaf-module mocks attached to the renderer implementation rather
		// than a separately bundled copy of the same helper.
		alias: { 'ooxml-ui/pptx': resolve(import.meta.dirname, '../../../../src/ui/src/pptx') },
	},
	test: {
		environment: 'happy-dom',
		maxWorkers: 4,
		projects: isolationProjects('angular', import.meta.dirname, 'happy-dom'),
		globals: true,
		setupFiles: ['./vitest-setup.ts'],
	},
});
