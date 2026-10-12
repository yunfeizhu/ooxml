import { Worker } from 'node:worker_threads';
import { readdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve as resolvePath } from 'node:path';
import assert from 'node:assert/strict';
import { createMetafileFixture } from '../../../e2e/visio/metafile-fixture.mjs';
import { createVsdxFixture } from '../../../e2e/visio/fixture.mjs';

const assetDirectory = resolvePath(process.argv[2] ?? 'site-dist/assets');
const assets = await readdir(assetDirectory);
const name = assets.find((file) => /^parse-worker-.*\.js$/.test(file));
assert.ok(name, 'Production worker bundle must exist');
const url = pathToFileURL(resolvePath(assetDirectory, name)).href;
// Exercise the actual browser-targeted production bundle in an isolated Node worker.
// This verifies serialization/parsing; it is not a substitute for browser/CSP testing.
const worker = new Worker(
	`
 const { parentPort } = require('node:worker_threads');
 globalThis.self = globalThis;
 globalThis.postMessage = data => parentPort.postMessage(data);
 import(${JSON.stringify(url)}).then(() => {
   parentPort.on('message', data => self.onmessage({ data }));
   parentPort.postMessage({ ready: true });
 }).catch(error => { throw error; });
`,
	{ eval: true },
);
const timeout = setTimeout(() => {
	worker.terminate();
	throw new Error('Worker bundle smoke test timed out');
}, 10_000);
try {
	await new Promise((resolve, reject) => {
		worker.once('message', resolve);
		worker.once('error', reject);
	});
	const response = new Promise((resolve, reject) => {
		worker.once('message', resolve);
		worker.once('error', reject);
	});
	worker.postMessage(new Uint8Array([1, 2, 3]).buffer);
	const result = await response;
	assert.equal(result.ok, false);
	assert.equal(typeof result.message, 'string');
	const validResponse = new Promise((resolve, reject) => {
		worker.once('message', resolve);
		worker.once('error', reject);
	});
	const fixture = await createVsdxFixture('Worker fixture');
	worker.postMessage(Uint8Array.from(fixture).buffer);
	const valid = await validResponse;
	assert.equal(valid.ok, true);
	assert.equal(valid.document.pages[0].name, 'Imported page');
	assert.equal(valid.document.pages[0].shapes[0].text.plainText, 'Worker fixture');
	const legacyResponse = new Promise((resolve, reject) => {
		worker.once('message', resolve);
		worker.once('error', reject);
	});
	const legacy = await readFile(
		new URL('../../../e2e/visio/fixtures/owned-v11.vsd', import.meta.url),
	);
	worker.postMessage(Uint8Array.from(legacy).buffer);
	const legacyResult = await legacyResponse;
	assert.equal(legacyResult.ok, true, legacyResult.message);
	assert.equal(legacyResult.document.format, 'vsd');
	assert.equal(legacyResult.document.pages[0].shapes[0].id, '7');
	assert.equal(legacyResult.document.pages[0].shapes[0].text.plainText, 'Hello\n');
	for (const unsupported of [false, true]) {
		const metafileReply = new Promise((resolve, reject) => {
			worker.once('message', resolve);
			worker.once('error', reject);
		});
		worker.postMessage(Uint8Array.from(await createMetafileFixture(unsupported)).buffer);
		const metafileResult = await metafileReply;
		assert.equal(metafileResult.ok, true, metafileResult.message);
		const emf = metafileResult.document.pages[0].shapes.find((candidate) => candidate.id === 'emf');
		if (unsupported) assert.equal(emf.foreignVector, undefined);
		else {
			assert.ok(emf.foreignVector.vector.items.length > 0);
			assert.equal(emf.foreignVector.vector.width, 100);
			assert.ok(
				metafileResult.document.diagnostics.some((note) => note.code === 'emf-limited-rendering'),
			);
		}
	}
	console.log(
		'Production parser worker passes binary VSD and VSDX import, bounded EMF conversion, rejection and structured-error smoke checks.',
	);
} finally {
	clearTimeout(timeout);
	await worker.terminate();
}

const editName = assets.find((file) => /^edit-worker-.*\.js$/.test(file));
assert.ok(editName, 'Production edit worker bundle must exist');
const editUrl = pathToFileURL(resolvePath(assetDirectory, editName)).href;
const editWorker = new Worker(
	`
 const { parentPort } = require('node:worker_threads');
 globalThis.self = globalThis;
 globalThis.postMessage = (data, transfer) => parentPort.postMessage(data, transfer);
 import(${JSON.stringify(editUrl)}).then(() => {
   parentPort.on('message', data => self.onmessage({ data }));
   parentPort.postMessage({ ready: true });
 }).catch(error => { throw error; });
`,
	{ eval: true },
);
const editTimeout = setTimeout(() => {
	editWorker.terminate();
	throw new Error('Edit worker bundle smoke test timed out');
}, 20_000);
const editReply = () =>
	new Promise((resolve, reject) => {
		editWorker.once('message', resolve);
		editWorker.once('error', reject);
	});
try {
	await editReply();
	const fixture = new Uint8Array(await createVsdxFixture('Source text'));
	// Fixture's source page and local shape IDs are known fixture-owned identifiers.
	let response = editReply();
	editWorker.postMessage({
		bytes: fixture.buffer,
		edits: [{ type: 'replace-plain-text', pageId: '1', shapeId: '1', text: 'Edited & <inert>' }],
	});
	const edited = await response;
	assert.equal(edited.ok, true, edited.message);
	assert.equal(edited.document.pages[0].shapes[0].text.plainText, 'Edited & <inert>');
	assert.ok(edited.bytes instanceof Uint8Array);
	assert.ok(edited.changedParts.length > 0);
	assert.ok(edited.diagnostics.some((note) => note.code === 'edit-caches-not-recalculated'));
	response = editReply();
	editWorker.postMessage({
		bytes: edited.bytes.buffer,
		edits: [{ type: 'replace-plain-text', pageId: '1', shapeId: '1', text: 'Edited & <inert>' }],
	});
	const unchanged = await response;
	assert.equal(unchanged.ok, true, unchanged.message);
	assert.deepEqual(unchanged.changedParts, []);
	assert.deepEqual(unchanged.bytes, edited.bytes);
	response = editReply();
	editWorker.postMessage({
		bytes: fixture.buffer,
		edits: [{ type: 'replace-plain-text', pageId: '1', shapeId: 'missing', text: 'Rejected' }],
	});
	const rejected = await response;
	assert.equal(rejected.ok, false);
	assert.equal(rejected.code, 'EDIT_TARGET_NOT_FOUND');
	response = editReply();
	const metafile = new Uint8Array(await createMetafileFixture());
	editWorker.postMessage({
		bytes: metafile.buffer,
		edits: [
			{ type: 'replace-plain-text', pageId: '1', shapeId: '1', text: 'Edited alongside EMF' },
		],
	});
	const vectorEdit = await response;
	assert.equal(vectorEdit.ok, true, vectorEdit.message);
	assert.equal(
		vectorEdit.document.pages[0].shapes.find((shape) => shape.id === '1').text.plainText,
		'Edited alongside EMF',
	);
	assert.ok(
		vectorEdit.document.pages[0].shapes.find((shape) => shape.id === 'emf').foreignVector.vector
			.items.length > 0,
	);
	assert.ok(vectorEdit.document.diagnostics.some((note) => note.code === 'emf-limited-rendering'));
	const clipboardName = assets.find((file) => /^clipboard-worker-.*\.js$/.test(file));
	// The separate registry compatibility gate can consume a runtime predating clipboard support.
	if (!process.argv.includes('--registry-runtime') || clipboardName) {
		assert.ok(clipboardName, 'Production clipboard capture worker must exist');
		const clipboardUrl = pathToFileURL(resolvePath(assetDirectory, clipboardName)).href;
		const clipboardWorker = new Worker(
			`
 const { parentPort } = require('node:worker_threads');
 globalThis.self = globalThis;
 globalThis.postMessage = data => parentPort.postMessage(data);
 import(${JSON.stringify(clipboardUrl)}).then(() => {
   parentPort.on('message', data => self.onmessage({ data }));
   parentPort.postMessage({ ready: true });
 }).catch(error => { throw error; });
`,
			{ eval: true },
		);
		const clipboardReply = () =>
			new Promise((resolve, reject) => {
				clipboardWorker.once('message', resolve);
				clipboardWorker.once('error', reject);
			});
		const clipboardTimeout = setTimeout(() => {
			clipboardWorker.terminate();
			throw new Error('Clipboard worker smoke timed out');
		}, 20_000);
		try {
			await clipboardReply();
			let capture = clipboardReply();
			clipboardWorker.postMessage({ bytes: fixture.buffer, pageId: '1', shapeIds: ['1'] });
			const captured = await capture;
			assert.equal(captured.ok, true, captured.message);
			assert.ok(captured.text.startsWith('OOXML-VISIO-SHAPES/1\n'));
			const snapshot = JSON.parse(captured.text.slice(captured.text.indexOf('\n') + 1));
			assert.deepEqual(snapshot.selectionIds, ['1']);
			assert.equal(snapshot.shapes.length, 1);
			assert.ok(snapshot.shapes[0].xml.includes('Source text'));
			response = editReply();
			editWorker.postMessage({
				bytes: fixture.buffer,
				edits: [
					{
						type: 'paste-shapes',
						pageId: '1',
						clipboard: snapshot,
						copies: [{ shapeId: '1', newShapeId: '2' }],
						offsetX: 0.33,
						offsetY: -0.33,
					},
				],
			});
			const pasted = await response;
			assert.equal(pasted.ok, true, pasted.message);
			assert.equal(pasted.document.pages[0].shapes.length, 2);
			assert.equal(pasted.document.pages[0].shapes[1].text.plainText, 'Source text');
			capture = clipboardReply();
			clipboardWorker.postMessage({ bytes: fixture.buffer, pageId: '1', shapeIds: ['missing'] });
			const refused = await capture;
			assert.equal(refused.ok, false);
			assert.equal(typeof refused.message, 'string');
			console.log(
				'Production clipboard worker captures portable source text, rejects missing targets and pastes through the edit worker.',
			);
		} finally {
			clearTimeout(clipboardTimeout);
			await clipboardWorker.terminate();
		}
	}
	console.log(
		'Production edit worker passes edit/reparse, byte-preserving no-op and structured core rejection checks.',
	);
} finally {
	clearTimeout(editTimeout);
	await editWorker.terminate();
}
