import path from 'path';

import { defineConfig } from 'vitest/config';

import { isolationProjects } from '../../scripts/vitest-isolation.mjs';

export default defineConfig({
	server: { fs: { allow: [path.resolve(__dirname, '../../../..')] } },
	resolve: {
		alias: {
			'ooxml-core/pptx': path.resolve(__dirname, '../../../../src/core/pptx'),
			'pptx-viewer-core/chart': path.resolve(__dirname, '../core/src/chart/index.ts'),
			'pptx-viewer-core/text': path.resolve(__dirname, '../core/src/text/index.ts'),
			'pptx-viewer-core/geometry': path.resolve(__dirname, '../core/src/geometry/index.ts'),
			'pptx-viewer-core/color': path.resolve(__dirname, '../core/src/color/index.ts'),
			'pptx-viewer-core/ui': path.resolve(__dirname, '../core/src/ui/index.ts'),
			'pptx-viewer-core/smartart-layouts': path.resolve(
				__dirname,
				'../core/src/smartart-layouts/index.ts',
			),
			'pptx-viewer-core/math': path.resolve(__dirname, '../core/src/math/index.ts'),
			'pptx-viewer-core': path.resolve(__dirname, '../core/src/index.ts'),
			'ooxml-ui/pptx/i18n': path.resolve(__dirname, '../../../../src/ui/src/pptx/i18n/index.ts'),
			'ooxml-ui/pptx/ai': path.resolve(__dirname, '../../../../src/ui/src/pptx/ai/index.ts'),
			'ooxml-ui/pptx': path.resolve(__dirname, '../../../../src/ui/src/pptx/index.ts'),
		},
	},
	test: {
		globals: true,
		maxWorkers: 4,
		projects: isolationProjects('react', __dirname, 'node'),
		setupFiles: ['./web-controls.test-setup.ts'],
	},
});
