import { describe, expect, it } from 'vitest';
import { loadWorkbook } from '../../xlsx/load/index';
import { createWorkbook, saveXlsx } from '../../xlsx/index';
import { excelSerialToIso, visioDataTable, visioParseRange, visioWorkbookGrid } from './data-table';

describe('external data tables', () => {
	it('infers column types from CSV text and keeps mixed columns as text', async () => {
		const workbook = await loadWorkbook(
			new TextEncoder().encode(
				'Name,Cost,Active,Due,Mixed\nWeb,10,true,2024-01-05,1\nDb,2.50,false,,x\n',
			),
			{ fileName: 'servers.csv' },
		);
		const table = visioDataTable(visioWorkbookGrid(workbook));
		expect(table.columns.map((column) => [column.name, column.type])).toEqual([
			['Name', 'string'],
			['Cost', 'number'],
			['Active', 'boolean'],
			['Due', 'date'],
			['Mixed', 'string'],
		]);
		expect(table.rows).toEqual([
			['Web', '10', 'TRUE', '2024-01-05T00:00:00', '1'],
			['Db', '2.5', 'FALSE', '', 'x'],
		]);
	});

	it('reads dates by number format and a chosen range without a header', () => {
		expect(excelSerialToIso(45296)).toBe('2024-01-05T00:00:00');
		expect(visioParseRange('b2:a1')).toEqual({ top: 0, bottom: 1, left: 0, right: 1 });
		expect(visioParseRange('A1')).toBeUndefined();
		const table = visioDataTable(
			[
				['a', null],
				['a', 'b'],
			],
			{ header: false },
		);
		expect(table.columns.map((column) => column.name)).toEqual(['Column1', 'Column2']);
		expect(table.rows).toEqual([
			['a', ''],
			['a', 'b'],
		]);
	});

	it('loads an xlsx sheet range through the shared workbook loader', async () => {
		const workbook = createWorkbook();
		const sheet = workbook.sheets[0]!;
		sheet.rows.set(
			0,
			new Map([
				[0, { value: 'Server' }],
				[1, { value: 'Load' }],
				[2, { value: 'x' }],
			]),
		);
		sheet.rows.set(
			1,
			new Map([
				[0, { value: 'Web' }],
				[1, { value: 42 }],
			]),
		);
		sheet.rows.set(5, new Map([[0, { value: 'outside' }]]));
		const loaded = await loadWorkbook(await saveXlsx(workbook));
		const table = visioDataTable(visioWorkbookGrid(loaded, 0, visioParseRange('A1:B2')));
		expect(table).toEqual({
			columns: [
				{ name: 'Server', label: 'Server', type: 'string' },
				{ name: 'Load', label: 'Load', type: 'number' },
			],
			rows: [['Web', '42']],
		});
	});
});
