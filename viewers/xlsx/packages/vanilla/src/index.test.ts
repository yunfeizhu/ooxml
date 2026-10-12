import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import * as vanilla from './index';

const legacyFixture = new URL('../../../../../e2e/xlsx/support/legacy-97.xls', import.meta.url);
const sampleFixture = new URL(
	'../../../../../demos/xlsx/demo-vanilla/public/sample.xlsx',
	import.meta.url,
);

describe('xlsx-vanilla-viewer entry', () => {
	it('owns the web-component entry, the mount helper and the workbook loaders', () => {
		for (const name of [
			'mountEditor',
			'defineXlsxEditor',
			'XlsxEditorElement',
			'normalizeEditorLocale',
			'createWorkbook',
			'loadWorkbook',
			'detectWorkbookFormat',
			'saveWorkbook',
		] as const)
			expect(vanilla[name], name).toBeTypeOf('function');
	});

	it('imports without a DOM so server rendering can load the module', () => {
		expect(typeof globalThis.document).toBe('undefined');
	});

	it('opens the sample .xlsx and a legacy .xls, and saves both as .xlsx', async () => {
		for (const [fixture, format] of [
			[sampleFixture, 'xlsx'],
			[legacyFixture, 'xls'],
		] as const) {
			const bytes = new Uint8Array(await readFile(fixture));
			expect(vanilla.detectWorkbookFormat(bytes)).toBe(format);
			const workbook = await vanilla.loadWorkbook(bytes);
			expect(workbook.sheets.length).toBeGreaterThan(0);
			const saved = await vanilla.saveWorkbook(workbook, 'xlsx');
			expect(vanilla.detectWorkbookFormat(saved)).toBe('xlsx');
		}
	});
});
