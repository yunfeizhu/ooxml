import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { VIEWER_PACKAGES } from './viewer-packages.mjs';
import { verifyManifest } from '../../../scripts/publish-released.mjs';
import { runNpm } from './npm-command.mjs';
import { createVsdxFixture } from '../../../e2e/visio/fixture.mjs';

const root = resolve(import.meta.dirname, '..');
const workspaceRuntime = process.argv.includes('--workspace-runtime');
const consumer = mkdtempSync(resolve(tmpdir(), 'visio-published-consumer-'));
const dependencies = {};
for (const [, meta] of Object.entries(VIEWER_PACKAGES)) {
	const directory = resolve(root, meta.dir);
	const manifest = JSON.parse(readFileSync(resolve(directory, 'package.json')));
	verifyManifest({ npm: meta.npm, dir: `viewers/visio/${meta.dir}`, version: manifest.version });
	const [pack] = JSON.parse(
		runNpm(['pack', '--json', '--ignore-scripts', '--pack-destination', consumer], {
			cwd: directory,
			encoding: 'utf8',
		}),
	);
	const files = pack.files.map((file) => file.path);
	for (const file of ['dist/index.js', 'dist/index.d.ts', 'LICENSE'])
		assert.ok(files.includes(file), `${meta.npm}: ${file}`);
	if (meta.npm === 'visio-svelte-viewer') {
		const component = readFileSync(resolve(directory, 'dist/VisioViewer.svelte'), 'utf8');
		assert.ok(
			!/(['"])\.\/common(?:\.js)?\1/.test(component),
			'Svelte has no source common imports',
		);
		assert.match(component, /from\s+(['"])\.\/runtime\.js\1/, 'Svelte uses its shipped runtime');
		assert.ok(files.includes('dist/runtime.js'), 'Svelte runtime ships in the tarball');
	}
	assert.ok(
		!files.some((file) => /\.test\.|integration\/|node_modules\//.test(file)),
		'No development artifacts',
	);
	// The viewer and its workers ship in ooxml-ui/visio, so no package bundles a worker of its own.
	for (const worker of ['parse-worker-', 'edit-worker-'])
		assert.ok(
			!files.some((file) => file.startsWith('dist/assets/' + worker)),
			`${meta.npm}: ${worker} must come from ooxml-ui`,
		);
	dependencies[manifest.name] = `file:${resolve(consumer, pack.filename)}`;
	Object.assign(dependencies, manifest.peerDependencies);
}
if (workspaceRuntime) {
	// Application renderers are host dependencies, not shipped adapter dependencies.
	dependencies['react-dom'] = dependencies.react;
	dependencies['@angular/platform-browser'] = dependencies['@angular/core'];
	for (const area of ['core', 'ui']) {
		const directory = resolve(root, '../../src', area);
		const manifest = JSON.parse(readFileSync(resolve(directory, 'package.json')));
		const [pack] = JSON.parse(
			runNpm(['pack', '--json', '--ignore-scripts', '--pack-destination', consumer], {
				cwd: directory,
				encoding: 'utf8',
			}),
		);
		if (area === 'ui')
			assert.ok(
				!pack.files.some((file) => /__fixtures__/.test(file.path)),
				'UI fixtures are excluded from the tarball',
			);
		assert.ok(
			pack.files.some((file) => file.path.startsWith('dist/visio/')),
			`${manifest.name}: built Visio runtime`,
		);
		dependencies[manifest.name] = `file:${resolve(consumer, pack.filename)}`;
	}
}
// Every sibling must resolve to its tarball even when dependent manifests use registry ranges.
writeFileSync(
	resolve(consumer, 'package.json'),
	JSON.stringify({ name: 'visio-package-consumer', private: true, type: 'module', dependencies }),
);
runNpm(['install', '--ignore-scripts'], { cwd: consumer, stdio: 'inherit' });
writeFileSync(resolve(consumer, 'fixture.vsdx'), await createVsdxFixture('Published consumer'));
writeFileSync(
	resolve(consumer, 'fixture.vsd'),
	readFileSync(resolve(root, '../../e2e/visio/fixtures/owned-v11.vsd')),
);
const names = Object.values(VIEWER_PACKAGES).map((meta) => meta.npm);
writeFileSync(
	resolve(consumer, 'smoke.mjs'),
	`
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
await import('@angular/compiler');
const bytes = readFileSync(new URL('./fixture.vsdx', import.meta.url));
const legacy = readFileSync(new URL('./fixture.vsd', import.meta.url));
for (const name of ${JSON.stringify(names)}) {
 const api = await import(name);
 const document = await api.parseVsdx(bytes);
 assert.equal(document.pages[0].shapes[0].text.plainText, 'Published consumer');
 const legacyDocument = await api.loadVisio(legacy);
 assert.equal(legacyDocument.format, 'vsd');
 assert.equal(legacyDocument.pages[0].shapes[0].text.plainText, 'Hello\\n');
 if (name !== 'visio-core') {
  assert.equal(typeof api.mountViewer, 'function', name);
  const controller = new api.ViewerController();
  controller.setZoom(1.25);
  assert.equal(controller.state.zoom, 1.25);
  ${
		workspaceRuntime
			? `assert.equal(typeof controller.duplicateSelection, 'function', name);
  assert.equal(typeof controller.createBlankDrawing, 'function', name);
  assert.equal(typeof controller.prepareClipboardSelection, 'function', name);
  assert.ok(Object.isFrozen(controller.state.clipboard));
  controller.setDocument(document);
  const events = [];
  controller.onEvent((name, value) => { if (name === 'selection-change') events.push(value); });
  const shape = document.pages[0].shapes[0];
  controller.selectShapes([{ id: shape.id, name: shape.name, pageId: document.pages[0].id }]);
  assert.equal(controller.state.selectedShapes.length, 1, name);
  assert.equal(controller.state.selectedShape, controller.state.selectedShapes[0]);
  assert.ok(Object.isFrozen(events.at(-1)) && Object.isFrozen(events.at(-1)[0]));
  controller.clearSelection();
  assert.equal(events.at(-1).length, 0);
  controller.selectAll();
  assert.equal(events.at(-1).length, 1);`
			: ''
	}
  await controller.load(legacy);
  assert.equal(controller.state.document.format, 'vsd');
  assert.equal(controller.state.edit.sourceAvailable, false);
  assert.throws(() => controller.exportVsdx(), /Open a .vsdx file before downloading/);
  await assert.rejects(controller.replacePlainText('0', '7', 'changed'), /Open a .vsdx file before editing/);
  controller.destroy();
 }
}
`,
);
// Angular's compiler is a host concern for JIT applications, not a bundled viewer dependency.
runNpm(['install', '--ignore-scripts', '--no-save', '@angular/compiler@^21'], {
	cwd: consumer,
	stdio: 'inherit',
});
execFileSync(process.execPath, [resolve(consumer, 'smoke.mjs')], {
	cwd: consumer,
	stdio: 'inherit',
});
writeFileSync(
	resolve(consumer, 'types.ts'),
	names
		.map(
			(name, index) =>
				`import * as p${index} from '${name}';\nvoid p${index}.parseVsdx; void p${index}.loadVisio;${
					index
						? `void new p${index}.ViewerController();${
								workspaceRuntime
									? `
declare const h${index}: p${index}.${name === 'visio-svelte-viewer' ? 'MountedViewer' : 'ViewerHandle'};
declare const s${index}: p${index}.ViewerState;
const selections${index}: readonly p${index}.VisioShapeSelection[] = s${index}.selectedShapes;
h${index}.selectShapes(selections${index}); h${index}.selectAll(); h${index}.clearSelection();
const duplication${index}: Promise<void> = h${index}.duplicateSelection(); void duplication${index};
const newOptions${index}: p${index}.CreateVsdxOptions = { width: 6, height: 4 };
const creation${index}: Promise<void> = h${index}.createBlankDrawing(newOptions${index}); void creation${index};
const anchor${index}: p${index}.VisioResizeAnchor = { x: 0, y: 0 };
const anchoredResize${index}: p${index}.VisioEdit = { type: 'resize-shape', pageId: '0', shapeId: '1', width: 2, height: 1, anchor: anchor${index} };
const resizing${index}: Promise<void> = h${index}.applyEdits([anchoredResize${index}]); void resizing${index};
const textBox${index}: p${index}.VisioEdit = { type: 'create-text-box', pageId: '0', shapeId: '2', x: 2, y: 2, width: 2, height: 1, text: 'Text\\n' };
const drawingText${index}: Promise<void> = h${index}.applyEdits([textBox${index}]); void drawingText${index};
const paint${index}: p${index}.VisioEdit = { type: 'format-shape', pageId: '0', shapeId: '2', linePattern: 23, lineTransparency: 33.26, fillPattern: 24, fillBackgroundColor: '#abcdef', fillTransparency: 12.26 };
const painting${index}: Promise<void> = h${index}.applyEdits([paint${index}]); void painting${index};
const noPaint${index}: p${index}.VisioEdit = { type: 'format-shape', pageId: '0', shapeId: '2', linePattern: 0, fillPattern: 0 };
void h${index}.applyEdits([noPaint${index}]);
const paintStyle${index} = s${index}.document?.pages[0]?.shapes[0]?.style;
const paintAlphas${index}: readonly (number | undefined)[] = [paintStyle${index}?.fillForegroundOpacity, paintStyle${index}?.fillBackgroundOpacity, paintStyle${index}?.lineColorOpacity]; void paintAlphas${index};
const fillIndex${index}: number | undefined = paintStyle${index}?.fillPatternIndex; void fillIndex${index};
const fillBackground${index}: string | undefined = paintStyle${index}?.fillBackgroundColor; void fillBackground${index};
const replaceToken${index} = h${index}.controller.captureTextReplaceToken('all-pages');
const replacePlan${index} = h${index}.controller.planTextReplacement(replaceToken${index}, { query: 'a', replacement: '$&', mode: 'all' });
const replacing${index} = h${index}.controller.applyTextReplacePlan(replacePlan${index}, replaceToken${index}); void replacing${index};
// @ts-expect-error Creating a text box requires logical text.
const missingText${index}: p${index}.VisioEdit = { type: 'create-text-box', pageId: '0', shapeId: '3', x: 2, y: 2, width: 2, height: 1 };
void missingText${index};
const copying${index}: Promise<void> = h${index}.copySelection(); void copying${index};
const cutting${index}: Promise<void> = h${index}.cutSelection(); void cutting${index};
const pasting${index}: Promise<void> = h${index}.pasteSelection(); void pasting${index};
${
	name === 'visio-svelte-viewer'
		? `declare const component: ReturnType<typeof p${index}.VisioViewer>;
const componentCreation: Promise<void> = component.createBlankDrawing(newOptions${index}); void componentCreation;
component.selectShapes(selections${index}); component.selectAll(); component.clearSelection();
const componentDuplication: Promise<void> = component.duplicateSelection(); void componentDuplication;
const componentCopy: Promise<void> = component.copySelection(); void componentCopy;
const componentCut: Promise<void> = component.cutSelection(); void componentCut;
const componentPaste: Promise<void> = component.pasteSelection(); void componentPaste;`
		: ''
}
const ready${index}: boolean = s${index}.clipboard.ready; void ready${index};
const events${index}: p${index}.ViewerCallbacks = { 'selection-change': selection => { const items: readonly p${index}.VisioShapeSelection[] = selection; void items; } };
// @ts-expect-error The selection array is immutable.
s${index}.selectedShapes.push({ id: '1', name: '1' });
void events${index};`
									: ''
							}`
						: ''
				}`,
		)
		.join('\n'),
);
execFileSync(
	process.execPath,
	[
		resolve(root, 'node_modules/typescript/bin/tsc'),
		'--noEmit',
		'--module',
		'esnext',
		'--moduleResolution',
		'bundler',
		'--target',
		'es2022',
		'--lib',
		'es2022,dom',
		'--skipLibCheck',
		'--strict',
		'types.ts',
	],
	{ cwd: consumer, stdio: 'inherit' },
);
writeFileSync(
	resolve(consumer, 'index.html'),
	'<input type="file" id="file"><div id="app" style="height:600px"></div><script type="module" src="./main.js"></script>',
);
writeFileSync(
	resolve(consumer, 'main.js'),
	`import { mountViewer } from 'visio-vanilla-viewer';
import '@angular/compiler';
import { VisioViewer as ReactViewer } from 'visio-react-viewer';
import { VisioViewer as VueViewer } from 'visio-vue-viewer';
import { VisioViewer as SolidViewer } from 'visio-solid-viewer';
import { VisioViewerComponent } from 'visio-angular-viewer';
import { VisioViewer as SvelteViewer, parseVsdx } from 'visio-svelte-viewer';
window.adapters = { ReactViewer, VueViewer, SolidViewer, VisioViewerComponent, SvelteViewer, parseVsdx };
window.viewer = mountViewer(document.getElementById('app'));
document.getElementById('file').addEventListener('change', async event => {
 try { await window.viewer.load(event.target.files[0]); } catch (error) { window.loadError = String(error); }
});`,
);
if (workspaceRuntime)
	writeFileSync(
		resolve(consumer, 'workspace-bindings.js'),
		readFileSync(resolve(root, 'scripts/workspace-consumer-bindings.mjs')),
	);
if (workspaceRuntime)
	writeFileSync(
		resolve(consumer, 'workspace-consumer-clipboard.mjs'),
		readFileSync(resolve(root, 'scripts/workspace-consumer-clipboard.mjs')),
	);
if (workspaceRuntime)
	writeFileSync(
		resolve(consumer, 'workspace-consumer-editing.mjs'),
		readFileSync(resolve(root, 'scripts/workspace-consumer-editing.mjs')),
	);
if (workspaceRuntime)
	writeFileSync(
		resolve(consumer, 'workspace-consumer-replacement.mjs'),
		readFileSync(resolve(root, 'scripts/workspace-consumer-replacement.mjs')),
	);
if (workspaceRuntime)
	writeFileSync(
		resolve(consumer, 'main.js'),
		readFileSync(resolve(consumer, 'main.js'), 'utf8') +
			'\nimport { verifyWorkspaceBindings } from "./workspace-bindings.js"; window.verifyWorkspaceBindings = verifyWorkspaceBindings;',
	);
const bindingsRequire = createRequire(resolve(root, 'packages/bindings/package.json'));
const { svelte } = await import(
	pathToFileURL(bindingsRequire.resolve('@sveltejs/vite-plugin-svelte')).href
);
await build({ configFile: false, root: consumer, plugins: [svelte()], build: { outDir: 'dist' } });
writeFileSync(
	resolve(root, `.package-build/consumer${workspaceRuntime ? '.workspace' : ''}.txt`),
	consumer,
);
execFileSync(
	process.execPath,
	[
		resolve(root, 'scripts/test-worker-bundle.mjs'),
		resolve(consumer, 'dist/assets'),
		...(workspaceRuntime ? [] : ['--registry-runtime']),
	],
	{ cwd: root, stdio: 'inherit' },
);
console.log(
	`${workspaceRuntime ? 'Nine workspace' : 'Seven registry-compatible viewer'} tarballs pass install, ESM imports, VSD/VSDX parsing, legacy edit/export refusal, declarations and consumer worker checks.`,
);
