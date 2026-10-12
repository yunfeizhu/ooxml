import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

// PLAYWRIGHT_PORT moves the preview server, so runs in separate worktrees do not collide.
const port = Number(process.env.PLAYWRIGHT_PORT ?? 4173);
const origin = `http://127.0.0.1:${port}`;
export default defineConfig({
	testDir: '../../e2e/visio',
	fullyParallel: true,
	use: {
		baseURL: origin,
		launchOptions: {
			...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
		},
	},
	webServer: {
		// The docs site and every demo are served from "/" out of one folder, as the Pages site is
		// served from its repository path.
		command: `node scripts/build-pages.mjs .browser-test-dist --browser-tests && node docs/node_modules/vitepress/bin/vitepress.js preview docs --host 127.0.0.1 --port ${port}`,
		env: { DOCS_BASE: '/', DOCS_OUT: resolve('.browser-test-dist') },
		url: `${origin}/demo/`,
		reuseExistingServer: false,
	},
});
