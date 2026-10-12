import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAX_COL, MAX_ROW, parseRange } from '../address';
import { getCell, putCell } from '../cells';
import { loadXlsx } from '../read/load';
import { createWorkbook } from '../workbook';
import { saveXlsx } from '../write/save';
import { createEditSession } from './session';
import type { EditSession } from './types';

/** Parses the compact references used by the boundary fixtures. */
const range = (text: string) => parseRange(text)!;
const insertions: [string, number, number, (s: EditSession, sheet: number) => void][] = [
	['rows', MAX_ROW, 0, (s, sheet) => s.insertRows(sheet, 0, 1)],
	['columns', 0, MAX_COL, (s, sheet) => s.insertColumns(sheet, 0, 1)],
	['cells down', MAX_ROW, 0, (s, sheet) => s.insertCellsShift(sheet, range('A1'), 'down')],
	['cells right', 0, MAX_COL, (s, sheet) => s.insertCellsShift(sheet, range('A1'), 'right')],
];

describe('insertion preserves metadata on empty boundary cells', () => {
	for (const [label, row, col, insert] of insertions)
		for (const kind of ['validation', 'conditional format'] as const)
			it(`rejects ${label} that would remove a ${kind}`, async () => {
				const wb = createWorkbook();
				const sheet = wb.sheets[0]!;
				const ranges = [{ start: { row, col }, end: { row, col } }];
				if (kind === 'validation')
					sheet.dataValidations.push({ ranges, type: 'whole', formula1: '1', formula2: '9' });
				else
					sheet.conditionalFormats.push({
						ranges,
						rules: [
							{ type: 'expression', formula: '1', priority: 1, style: { font: { bold: true } } },
						],
					});
				const s = createEditSession(wb);
				const before = structuredClone(wb);
				const changes: unknown[] = [];
				s.onChange((change) => changes.push(change));
				expect(getCell(sheet, row, col)).toBeUndefined();
				expect(() => insert(s, 0)).toThrow(/pushed off/);
				expect(wb).toEqual(before);
				expect(s.canUndo()).toBe(false);
				expect(changes).toEqual([]);
				const saved = (await loadXlsx(await saveXlsx(wb))).sheets[0]!;
				expect(saved.dataValidations).toMatchObject(sheet.dataValidations);
				expect(saved.conditionalFormats).toMatchObject(sheet.conditionalFormats);
			});

	for (const [label, row, col, insert] of insertions)
		for (const edge of ['from', 'to'] as const)
			it(`rejects ${label} that would clamp a drawing's ${edge} marker`, async () => {
				const wb = await loadXlsx(
					new Uint8Array(
						readFileSync(
							path.join(import.meta.dirname, '..', '__fixtures__', 'excel-features.xlsx'),
						),
					),
				);
				const sheetIndex = wb.sheets.findIndex((sheet) => sheet.drawings.length > 0);
				const sheet = wb.sheets[sheetIndex]!;
				// Isolate the drawing from the sample's merges and tables, which have separate band guards.
				sheet.merges = [];
				sheet.tables = [];
				const drawing = sheet.drawings[0]!;
				drawing.anchor = {
					from: {
						row: edge === 'from' ? row : 0,
						col: edge === 'from' ? col : 0,
						rowOffset: 9525,
						colOffset: 19050,
					},
					to: { row, col, rowOffset: 19050, colOffset: 9525 },
				};
				const s = createEditSession(wb);
				const before = structuredClone(sheet);
				expect(() => insert(s, sheetIndex)).toThrow(/pushed off/);
				expect(sheet).toEqual(before);
				expect(s.canUndo()).toBe(false);
				const saved = await loadXlsx(await saveXlsx(wb));
				expect(saved.sheets[sheetIndex]?.drawings[0]?.anchor).toMatchObject(drawing.anchor);
			});

	for (const ref of ['B1048576', 'A1048576:B1048576'])
		it(`allows a band insertion that leaves the rule at ${ref} in place`, () => {
			const wb = createWorkbook();
			const sheet = wb.sheets[0]!;
			sheet.dataValidations.push({ ranges: [range(ref)], type: 'whole', formula1: '1' });
			putCell(sheet, 0, 0, { value: 'move' });
			createEditSession(wb).insertCellsShift(0, range('A1'), 'down');
			expect(sheet.dataValidations[0]?.ranges).toEqual([range(ref)]);
			expect(getCell(sheet, 1, 0)?.value).toBe('move');
		});

	it('allows a band insertion when both drawing markers are outside its band', async () => {
		const wb = await loadXlsx(
			new Uint8Array(
				readFileSync(path.join(import.meta.dirname, '..', '__fixtures__', 'excel-features.xlsx')),
			),
		);
		const sheetIndex = wb.sheets.findIndex((sheet) => sheet.drawings.length > 0);
		const sheet = wb.sheets[sheetIndex]!;
		sheet.merges = [];
		sheet.tables = [];
		const drawing = sheet.drawings[0]!;
		drawing.anchor = {
			from: { row: MAX_ROW, col: 2, rowOffset: 9525, colOffset: 19050 },
			to: { row: MAX_ROW, col: 3, rowOffset: 19050, colOffset: 9525 },
		};
		const before = structuredClone(drawing.anchor);
		createEditSession(wb).insertCellsShift(sheetIndex, range('A1'), 'down');
		expect(drawing.anchor).toEqual(before);
	});

	for (const kind of ['auto filter', 'print area'] as const)
		it(`preserves an edge ${kind} when its cells are empty`, async () => {
			const wb = createWorkbook();
			const sheet = wb.sheets[0]!;
			const edge = range('A1048576:B1048576');
			if (kind === 'auto filter') sheet.autoFilter = { range: edge };
			else sheet.pageSetup = { printArea: edge };
			const before = structuredClone(wb);
			expect(() => createEditSession(wb).insertRows(0, 0, 1)).toThrow(/pushed off/);
			expect(wb).toEqual(before);
			const saved = (await loadXlsx(await saveXlsx(wb))).sheets[0]!;
			if (kind === 'auto filter') expect(saved.autoFilter?.range).toEqual(edge);
			else expect(saved.pageSetup?.printArea).toEqual(edge);
		});

	for (const kind of ['rowBreaks', 'extLst'] as const)
		it(`preserves edge positions in ${kind} through save and reload`, async () => {
			const wb = createWorkbook();
			const sheet = wb.sheets[0]!;
			const xml =
				kind === 'rowBreaks'
					? `<rowBreaks xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="1" manualBreakCount="1"><brk id="${MAX_ROW}" max="16383" man="1"/></rowBreaks>`
					: '<extLst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><ext uri="{CCE6A557-97BC-4b89-ADB6-D9C93CAAB3DF}"><x14:dataValidations xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main" xmlns:xm="http://schemas.microsoft.com/office/excel/2006/main" count="1"><x14:dataValidation type="list"><x14:formula1><xm:f>"yes,no"</xm:f></x14:formula1><xm:sqref>A1048576</xm:sqref></x14:dataValidation></x14:dataValidations></ext></extLst>';
			sheet.preserved.set(kind, [xml]);
			const before = structuredClone(wb);
			expect(() => createEditSession(wb).insertRows(0, 0, 1)).toThrow(/pushed off/);
			expect(wb).toEqual(before);
			const saved = await loadXlsx(await saveXlsx(wb));
			expect(saved.sheets[0]?.preserved.get(kind)?.[0]).toContain(
				kind === 'rowBreaks' ? `id="${MAX_ROW}"` : 'A1048576',
			);
		});

	it('rejects a totals row beyond the grid without changing the table or history', async () => {
		const wb = createWorkbook();
		const s = createEditSession(wb);
		s.setRangeValues(0, { row: MAX_ROW - 1, col: 0 }, [['Amount'], [5]]);
		s.createTable(0, range('A1048575:A1048576'), true);
		const before = structuredClone(wb);
		const undoLabel = s.undoLabel();
		const changes: unknown[] = [];
		s.onChange((change) => changes.push(change));
		expect(() => s.updateTable(0, 0, { totalsRow: true })).toThrow(/beyond the sheet/);
		expect(wb).toEqual(before);
		expect(s.undoLabel()).toBe(undoLabel);
		expect(changes).toEqual([]);
		const saved = await loadXlsx(await saveXlsx(wb));
		expect(saved.sheets[0]?.tables[0]).toMatchObject({
			range: range('A1048575:A1048576'),
			totalsRow: false,
		});
		expect(getCell(saved.sheets[0]!, MAX_ROW + 1, 0)).toBeUndefined();
	});
});
