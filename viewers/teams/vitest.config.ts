import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Tests run against the sibling ooxml checkout's source when there is one, like the demos (no build
// needed). Without it (CI, the sync-ooxml workflow) or with TEAMS_USE_DIST=1 they run against the
// published ooxml-core and ooxml-ui installed in node_modules.
const ooxml = fileURLToPath(new URL(process.env.OOXML_DIR ?? '../../', import.meta.url)).replaceAll(
	String.fromCharCode(92),
	'/',
);
const useSource =
	process.env.TEAMS_USE_DIST !== '1' && existsSync(`${ooxml}src/core/teams/index.ts`);

export default {
	resolve: {
		dedupe: ['yjs', 'lib0', 'y-protocols', 'lit'],
		alias: [
			...(useSource
				? [
						{ find: /^ooxml-core\/(.+)$/, replacement: `${ooxml}src/core/$1/index.ts` },
						{ find: /^ooxml-ui$/, replacement: `${ooxml}src/ui/src/index.ts` },
						{ find: /^ooxml-ui\/teams$/, replacement: `${ooxml}src/ui/src/teams/index.ts` },
					]
				: []),
			{
				find: /^teams-viewer$/,
				replacement: fileURLToPath(
					new URL('./packages/web-component/src/index.ts', import.meta.url),
				),
			},
		],
	},
	server: { fs: { strict: false } },
	test: {
		globals: true,
		environment: 'jsdom',
		include: ['packages/*/src/**/*.test.ts'],
		exclude: ['node_modules', 'dist'],
		testTimeout: 15000,
	},
};
