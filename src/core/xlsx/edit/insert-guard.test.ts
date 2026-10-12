import { describe, expect, it } from 'vitest';
import { MAX_COL, MAX_ROW, parseRange } from '../address';
import { getCell, putCell } from '../cells';
import type { Cell } from '../model';
import { loadXlsx } from '../read/load';
import { createWorkbook } from '../workbook';
import { saveXlsx } from '../write/save';
import { createEditSession } from './session';
import type { EditSession } from './types';

/** Parses a valid reference from the insertion fixtures. */
const range = (text: string) => parseRange(text)!;
const insertions: [string, number, number, (s: EditSession) => void][] = [
	['rows', MAX_ROW, 0, (s) => s.insertRows(0, 0, 1)],
	['columns', 0, MAX_COL, (s) => s.insertColumns(0, 0, 1)],
	['cells down', MAX_ROW, 0, (s) => s.insertCellsShift(0, range('A1'), 'down')],
	['cells right', 0, MAX_COL, (s) => s.insertCellsShift(0, range('A1'), 'right')],
];
describe('insertion at the grid edge', () => {
	for (const [label, row, col, insert] of insertions)
		for (const cell of [
			{ value: 'keep' },
			{ value: null, formula: '1+1' },
			{ value: null, styleId: 1 },
		] satisfies Cell[])
			it(`rejects ${label} without discarding ${JSON.stringify(cell)}`, async () => {
				const wb = createWorkbook({ sheets: ['Data', 'Report'] });
				const sheet = wb.sheets[0]!;
				wb.styles.push({ ...wb.styles[0]!, font: { ...wb.styles[0]!.font, bold: true } });
				putCell(sheet, row, col, structuredClone(cell));
				const s = createEditSession(wb);
				s.setCellInput(1, 0, 0, '=Data!A2');
				const before = structuredClone(wb);
				const undoLabel = s.undoLabel();
				const changes: unknown[] = [];
				s.onChange((change) => changes.push(change));
				expect(() => insert(s)).toThrow(/pushed off/);
				expect(wb).toEqual(before);
				expect(s.undoLabel()).toBe(undoLabel);
				expect(changes).toEqual([]);
				const saved = await loadXlsx(await saveXlsx(wb));
				expect(getCell(saved.sheets[0]!, row, col)?.value).toEqual(getCell(sheet, row, col)?.value);
			});
	it('allows a band insertion when edge data is outside the band', () => {
		const wb = createWorkbook();
		const s = createEditSession(wb);
		s.setCellValue(0, MAX_ROW, 1, 'keep');
		s.setCellValue(0, 0, 0, 12);
		s.insertCellsShift(0, range('A1'), 'down');
		expect(getCell(wb.sheets[0]!, 1, 0)?.value).toBe(12);
		expect(getCell(wb.sheets[0]!, MAX_ROW, 1)?.value).toBe('keep');
		s.undo();
		expect(getCell(wb.sheets[0]!, 0, 0)?.value).toBe(12);
		s.redo();
		expect(getCell(wb.sheets[0]!, 1, 0)?.value).toBe(12);
	});
	it('allows insertion over empty default cells at the edge', () => {
		const wb = createWorkbook();
		putCell(wb.sheets[0]!, MAX_ROW, 0, { value: null });
		expect(() => createEditSession(wb).insertRows(0, 0, 1)).not.toThrow();
	});
	it('allows insertion over a column entry with no formatting properties', () => {
		const wb = createWorkbook();
		wb.sheets[0]!.columns.push({ min: MAX_COL, max: MAX_COL });
		expect(() => createEditSession(wb).insertColumns(0, 0, 1)).not.toThrow();
	});
	it('preserves column widths at the edge', () => {
		const wb = createWorkbook();
		wb.sheets[0]!.columns.push({ min: MAX_COL, max: MAX_COL, width: 30 });
		const before = structuredClone(wb);
		expect(() => createEditSession(wb).insertColumns(0, 0, 1)).toThrow(/pushed off/);
		expect(wb).toEqual(before);
	});
	it.each([
		{ at: 0, count: 1, min: 2, shiftedMin: 3 },
		{ at: 2, count: 2, min: 0, shiftedMin: 0 },
		{ at: 0, count: 3, min: MAX_COL - 3, shiftedMin: MAX_COL },
	])(
		'keeps and clips a trailing column span when inserting $count columns at $at',
		async ({ at, count, min, shiftedMin }) => {
			const wb = createWorkbook();
			const original = [{ min, max: MAX_COL, width: 12 }];
			wb.sheets[0]!.columns = structuredClone(original);
			const s = createEditSession(wb);
			const expected = [{ min: shiftedMin, max: MAX_COL, width: 12 }];
			s.insertColumns(0, at, count);
			expect(wb.sheets[0]!.columns).toEqual(expected);
			s.undo();
			expect(wb.sheets[0]!.columns).toEqual(original);
			s.redo();
			expect(wb.sheets[0]!.columns).toEqual(expected);
			const saved = await loadXlsx(await saveXlsx(wb));
			expect(saved.sheets[0]!.columns).toMatchObject(expected);
		},
	);
	it('allows clipping adjacent column spans with identical formatting', async () => {
		const wb = createWorkbook();
		wb.sheets[0]!.columns.push(
			{ min: 2, max: MAX_COL - 1, width: 12 },
			{ min: MAX_COL, max: MAX_COL, width: 12 },
		);
		createEditSession(wb).insertColumns(0, 0, 1);
		const expected = [{ min: 3, max: MAX_COL, width: 12 }];
		expect(wb.sheets[0]!.columns).toEqual(expected);
		const saved = await loadXlsx(await saveXlsx(wb));
		expect(saved.sheets[0]!.columns).toMatchObject(expected);
	});
	it('rejects losing a distinct column span during a multi-column insertion', () => {
		const wb = createWorkbook();
		wb.sheets[0]!.columns.push(
			{ min: 2, max: MAX_COL - 2, width: 12 },
			{ min: MAX_COL - 1, max: MAX_COL, width: 30 },
		);
		const s = createEditSession(wb);
		const before = structuredClone(wb);
		expect(() => s.insertColumns(0, 0, 2)).toThrow(/pushed off/);
		expect(wb).toEqual(before);
		expect(s.canUndo()).toBe(false);
	});
	it('allows row formatting to move to the last row without leaving the grid', async () => {
		const wb = createWorkbook();
		wb.sheets[0]!.rowInfo.set(MAX_ROW - 1, { height: 30 });
		createEditSession(wb).insertRows(0, 0, 1);
		expect(wb.sheets[0]!.rowInfo.has(MAX_ROW - 1)).toBe(false);
		expect(wb.sheets[0]!.rowInfo.get(MAX_ROW)).toEqual({ height: 30 });
		const saved = await loadXlsx(await saveXlsx(wb));
		expect(saved.sheets[0]!.rowInfo.get(MAX_ROW)).toMatchObject({ height: 30 });
	});
	for (const kind of ['comment', 'hyperlink', 'row height', 'merge'] as const)
		it(`preserves edge ${kind} without cell contents`, () => {
			const wb = createWorkbook();
			const s = createEditSession(wb);
			const sheet = wb.sheets[0]!;
			if (kind === 'comment') s.setComment(0, { row: MAX_ROW, col: 0 }, 'keep', 'author');
			if (kind === 'hyperlink')
				s.setHyperlink(0, range('A1048576'), { target: 'https://example.com' });
			if (kind === 'row height') sheet.rowInfo.set(MAX_ROW, { height: 30 });
			if (kind === 'merge') sheet.merges.push(range('A1048576:B1048576'));
			const before = structuredClone(wb);
			expect(() => s.insertRows(0, 0, 1)).toThrow(/pushed off/);
			expect(wb).toEqual(before);
		});
	it('refuses an insertion whose new rows extend past the grid', () => {
		const s = createEditSession(createWorkbook());
		expect(() => s.insertRows(0, MAX_ROW, 2)).toThrow(RangeError);
		expect(() => s.insertColumns(0, MAX_COL, 2)).toThrow(RangeError);
	});
});
