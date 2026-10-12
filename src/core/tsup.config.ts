import { defineConfig } from 'tsup';

// Every strict area (the shared building blocks and the docx format) is bundled the same way as
// the pptx area (see tsup.pptx.config.ts): ESM (`.mjs`) and CJS (`.cjs`) per subpath entry.
// Declarations come from `tsc` (tsconfig.build.json, emitDeclarationOnly).
export default defineConfig({
	entry: {
		index: 'index.ts',
		'units/index': 'units/index.ts',
		'color/index': 'color/index.ts',
		'chart/index': 'chart/index.ts',
		'text/index': 'text/index.ts',
		'i18n/index': 'i18n/index.ts',
		'ribbon/index': 'ribbon/index.ts',
		'geometry/index': 'geometry/index.ts',
		'xml/index': 'xml/index.ts',
		'opc/index': 'opc/index.ts',
		'drawingml/index': 'drawingml/index.ts',
		'diagram/index': 'diagram/index.ts',
		'digest/index': 'digest/index.ts',
		'crypto/index': 'crypto/index.ts',
		'math/index': 'math/index.ts',
		'docx/index': 'docx/index.ts',
		'docx/embedded': 'docx/embedded.ts',
		'docx/layout/index': 'docx/layout/index.ts',
		'docx/load/index': 'docx/load/index.ts',
		'docx/ui/index': 'docx/ui/index.ts',
		'collab/index': 'collab/index.ts',
		'teams/index': 'teams/index.ts',
		'visio/index': 'visio/index.ts',
		'visio/ui/index': 'visio/ui/index.ts',
		'xlsx/index': 'xlsx/index.ts',
		'xlsx/load/index': 'xlsx/load/index.ts',
		'xlsx/collab/index': 'xlsx/collab/index.ts',
		'xlsx/ui/index': 'xlsx/ui/index.ts',
		'automation/index': 'automation/index.ts',
		'automation/node': 'automation/node.ts',
	},
	outDir: 'dist',
	tsconfig: 'tsconfig.build.json',
	format: ['esm', 'cjs'],
	outExtension: ({ format }) => ({ js: format === 'esm' ? '.mjs' : '.cjs' }),
	dts: false,
	splitting: false,
	sourcemap: false,
	// dist also holds the declarations and the pptx bundle: never clean it here.
	clean: false,
	external: ['jszip', '@xmldom/xmldom', 'yjs', 'y-protocols', 'lib0'],
	treeshake: true,
	platform: 'neutral',
	// The legacy .doc and .xls loaders and the package encryption (its CFB container) inline the
	// shared ole2 codecs (a devDependency), like the pptx bundle.
	noExternal: [/^@christophervr\/ole2(?:\/|$)/],
});
