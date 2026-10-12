import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { localCoreAliases } from './scripts/local-core-aliases';
export default defineConfig({
	plugins: [tailwindcss(), svelte()],
	build: {
		target: 'es2022',
		rollupOptions: {
			input: {
				editor: fileURLToPath(
					new URL('./../../demos/xlsx/demo-vanilla/index.html', import.meta.url),
				),
			},
		},
	},
	resolve: {
		alias: [
			...localCoreAliases(fileURLToPath(new URL('.', import.meta.url))),
			{
				find: /^@christophervr\/xlsx-core\/load$/,
				replacement: fileURLToPath(new URL('./packages/core/src/load.ts', import.meta.url)),
			},
			{
				find: /^@christophervr\/xlsx-core$/,
				replacement: fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
			},
			{
				find: /^xlsx-web-component$/,
				replacement: fileURLToPath(
					new URL('./packages/web-component/src/index.ts', import.meta.url),
				),
			},
		],
	},
	// Pre-bundle every framework the demo can mount on demand. Otherwise the first visit to a
	// framework makes Vite discover new dependencies, re-optimize and reload the page mid-session.
	optimizeDeps: {
		include: [
			'@angular/compiler',
			'@angular/core',
			'@angular/common',
			'@angular/platform-browser',
			'@xmldom/xmldom',
			'jszip',
			'react',
			'react-dom/client',
			'rxjs',
			'solid-js',
			'solid-js/web',
			'svelte',
			'vue',
		],
	},
	server: { fs: { allow: [fileURLToPath(new URL('../../', import.meta.url))] } },
});
