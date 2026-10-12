import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import solid from 'vite-plugin-solid';
export default defineConfig({
	plugins: [svelte(), solid({ hot: false })],
	resolve: { conditions: ['browser'] },
	// The shared element source (and its ?inline CSS) lives in the repository root src/.
	server: { fs: { allow: ['../..'] } },
	test: {
		environment: 'jsdom',
		include: ['tests/**/*.test.ts'],
		exclude: ['tests/**/*.ssr.test.ts'],
		setupFiles: ['./tests/setup.ts'],
		isolate: true,
		// Each integration case mounts a real viewer in every framework adapter under jsdom; on a busy
		// machine that sits right at the 5s default and fails at random.
		testTimeout: 30_000,
	},
});
