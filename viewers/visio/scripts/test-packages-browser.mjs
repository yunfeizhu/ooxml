import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { preview } from 'vite';

const root = resolve(import.meta.dirname, '..');
const workspaceRuntime = process.argv.includes('--workspace-runtime');
const consumer = readFileSync(
	resolve(root, `.package-build/consumer${workspaceRuntime ? '.workspace' : ''}.txt`),
	'utf8',
);
const consumerRequire = createRequire(resolve(consumer, 'package.json'));
const { parseVsdx } = await import(pathToFileURL(consumerRequire.resolve('ooxml-core/visio')).href);
const server = await preview({
	configFile: false,
	root: consumer,
	preview: { port: 4288, strictPort: true, host: '127.0.0.1' },
});
const browser = await chromium.launch(
	process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
try {
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto('http://127.0.0.1:4288');
	await page.waitForFunction(() => window.viewer);
	await page.locator('#file').setInputFiles(resolve(consumer, 'fixture.vsdx'));
	await page.waitForFunction(
		() =>
			window.viewer.controller.state.document?.pages[0]?.shapes[0]?.text?.plainText ===
			'Published consumer',
	);
	await page.evaluate(async () => {
		const document = window.viewer.controller.state.document;
		await window.viewer.replacePlainText(
			document.pages[0].id,
			document.pages[0].shapes[0].id,
			'Published browser edit',
		);
	});
	// The ribbon, page tabs and status bar are shared ooxml-ui elements; an older ooxml-ui
	// would leave them undefined and silently inert.
	const undefinedControls = await page.evaluate(() =>
		[
			'office-ui-button',
			'office-ui-ribbon-group',
			'office-ui-toolbar',
			'office-ui-tab-strip',
			'office-ui-status-bar',
			'office-ui-status-item',
			'office-ui-zoom-slider',
			'office-ui-ribbon-stack',
			'office-ui-menu-button',
			'office-ui-menu-item',
			'office-ui-menu-separator',
			'office-ui-context-menu',
			'office-ui-command-search',
			'office-ui-checkbox',
			'office-ui-select',
			'office-ui-options-dialog',
			'office-ui-account',
			'office-ui-presence',
			'office-ui-ribbon',
			'office-ui-backstage',
			'office-ui-find-bar',
			'office-ui-ruler',
			'office-ui-print-preview',
		].filter((tag) => !customElements.get(tag)),
	);
	assert.deepEqual(undefinedControls, [], 'Shared ooxml-ui controls must be defined');
	const bytes = await page.evaluate(() => [...window.viewer.exportVsdx().bytes]);
	const saved = await parseVsdx(Uint8Array.from(bytes));
	assert.equal(saved.pages[0].shapes[0].text.plainText, 'Published browser edit');
	if (workspaceRuntime) {
		const frameworks = await page.evaluate(
			(data) => window.verifyWorkspaceBindings(data),
			[...readFileSync(resolve(consumer, 'fixture.vsdx'))],
		);
		assert.deepEqual(frameworks, ['react', 'vue', 'solid', 'angular', 'svelte', 'vanilla']);
	}
	await page.locator('#file').setInputFiles(resolve(consumer, 'fixture.vsd'));
	await page.waitForFunction(() => window.viewer.controller.state.document?.format === 'vsd');
	const legacyState = await page.evaluate(() => {
		const controller = window.viewer.controller;
		let refused = false;
		try {
			controller.exportVsdx();
		} catch {
			refused = true;
		}
		return {
			sourceAvailable: controller.state.edit.sourceAvailable,
			refused,
			text: controller.state.document.pages[0].shapes[0].text.plainText,
		};
	});
	assert.deepEqual(legacyState, { sourceAvailable: false, refused: true, text: 'Hello\n' });
	assert.deepEqual(errors, []);
	await page.evaluate(() => window.viewer.destroy());
	console.log(
		workspaceRuntime
			? 'Packed workspace consumer mounts all six frameworks and verifies selection, duplication, clipboard transactions and worker edits.'
			: 'Packed browser consumer imports all six adapters, parses with the shipped worker and exports a reopenable edit.',
	);
} finally {
	await browser.close();
	await new Promise((done) => server.httpServer.close(done));
}
