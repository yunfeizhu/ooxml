import { describe, expect, it } from 'vitest';
import { parseAddress, parseRange } from '../address';
import { putCell } from '../cells';
import type { Workbook } from '../model';
import { createWorkbook } from '../workbook';
import { clearRange, setCellInput } from './cell-values';
import { createEditSession } from './session';
import { insertRows } from './structure';
import { testContext } from './test-context';
import type { EditSession } from './types';

const A = (ref: string) => parseAddress(ref) ?? { row: 0, col: 0 };
const R = (ref: string) => {
	const r = parseRange(ref);
	if (!r) throw new Error(ref);
	return r;
};

/** A workbook with cross-sheet formulas, an array formula, names, merges, CF, DV and a table. */
function richWorkbook(): { wb: Workbook; s: EditSession } {
	const wb = createWorkbook({ sheets: ['Data', 'Other'] });
	const s = createEditSession(wb, { recalc: false });
	s.setRangeValues(0, A('A1'), [
		['Name', 'Qty', 'Price'],
		['a', 1, 10],
		['b', 2, 20],
		['c', 3, 30],
	]);
	s.createTable(0, R('A1:C4'), true);
	s.setCellInput(0, 5, 1, '=SUM(B2:B4)');
	s.setCellInput(0, 6, 1, '=B6*2');
	s.setCellInput(1, 0, 0, '=Data!B3+Data!C4');
	s.setCellInput(1, 1, 0, '=SUM(Data!A1:C10)');
	s.merge(0, R('E2:F3'), 'merge');
	s.addConditionalFormat(0, {
		ranges: [R('B2:B4')],
		rules: [{ type: 'expression', formula: 'B2>1', style: { font: { bold: true } }, priority: 1 }],
	});
	s.setDataValidation(
		0,
		{ ranges: [], type: 'whole', operator: 'between', formula1: '1', formula2: 'C3' },
		R('D2:D5'),
	);
	wb.definedNames.push({ name: 'Total', formula: 'Data!$B$6' });
	return { wb, s };
}

const snapshot = (wb: Workbook) => structuredClone({ sheets: wb.sheets, names: wb.definedNames });

describe('undo history of row and column shifts', () => {
	const ops: [string, (s: EditSession) => void][] = [
		['insert rows', (s) => s.insertRows(0, 2, 2)],
		['delete rows', (s) => s.deleteRows(0, 1, 2)],
		['insert columns', (s) => s.insertColumns(0, 1, 1)],
		['delete columns', (s) => s.deleteColumns(0, 2, 1)],
		['insert cells down', (s) => s.insertCellsShift(0, R('A6:C6'), 'down')],
		['delete cells left', (s) => s.deleteCellsShift(0, R('D2:D3'), 'left')],
		['delete the last row', (s) => s.deleteRows(0, 1_048_575, 1)],
	];
	for (const [name, op] of ops)
		it(`${name}: undo restores and redo reapplies the exact workbook`, () => {
			const { wb, s } = richWorkbook();
			const edge = name.startsWith('insert') ? 1_048_573 : 1_048_575;
			putCell(wb.sheets[0]!, edge, 0, { value: 'edge' });
			const before = snapshot(wb);
			op(s);
			const after = snapshot(wb);
			expect(after).not.toEqual(before);
			s.undo();
			expect(snapshot(wb)).toEqual(before);
			s.redo();
			expect(snapshot(wb)).toEqual(after);
			s.undo();
			expect(snapshot(wb)).toEqual(before);
		});

	it('refuses to push cells off the sheet without creating an undo step', () => {
		const { wb, s } = richWorkbook();
		putCell(wb.sheets[0]!, 1_048_575, 2, { value: 'last', formula: 'B2' });
		const before = snapshot(wb);
		const undoLabel = s.undoLabel();
		expect(() => s.insertRows(0, 0, 1)).toThrow(/pushed off/);
		expect(s.undoLabel()).toBe(undoLabel);
		expect(snapshot(wb)).toEqual(before);
	});

	it('records only the formulas that change, not every cell', () => {
		const wb = createWorkbook({ sheets: ['A', 'B'] });
		for (let r = 0; r < 200; r++) putCell(wb.sheets[0]!, r, 0, { value: r });
		putCell(wb.sheets[1]!, 0, 0, { value: 0, formula: 'A!A150' });
		putCell(wb.sheets[1]!, 1, 0, { value: 0, formula: 'B1' });
		const ctx = testContext(wb);
		insertRows(ctx, 0, 10, 1);
		const entry = ctx.steps[0]?.entries[0];
		expect(entry?.before.kind).toBe('shift');
		if (entry?.before.kind !== 'shift' || entry.after.kind !== 'shift') return;
		expect(entry.before.data.formulas).toEqual([{ sheet: 1, row: 0, col: 0, formula: 'A!A150' }]);
		expect(entry.after.data.formulas).toEqual([{ sheet: 1, row: 0, col: 0, formula: 'A!A151' }]);
		expect(entry.before.cells).toEqual([]);
	});

	it('undoes a cut and paste that rewrote references on another sheet', () => {
		const { wb, s } = richWorkbook();
		const before = snapshot(wb);
		s.paste(0, A('H1'), s.cut(0, R('B2:C3')), 'all');
		const after = snapshot(wb);
		expect(wb.sheets[1]?.rows.get(0)?.get(0)?.formula).toBe('Data!H2+Data!C4');
		s.undo();
		expect(snapshot(wb)).toEqual(before);
		s.redo();
		expect(snapshot(wb)).toEqual(after);
	});
});

describe('undo history of cell edits', () => {
	it('a table header edit records workbook references and the header cell without a sheet copy', () => {
		const wb = createWorkbook();
		for (let r = 0; r < 50; r++) putCell(wb.sheets[0]!, r, 0, { value: r });
		const s = createEditSession(wb, { recalc: false });
		s.createTable(0, R('A1:A50'), true);
		const ctx = testContext(wb);
		setCellInput(ctx, 0, 0, 0, 'Head');
		const kinds = ctx.steps[0]?.entries.map((e) => e.before.kind);
		expect(kinds).toEqual(['refs', 'cells']);
		expect(wb.sheets[0]?.tables[0]?.columns[0]?.name).toBe('Head');
		ctx.undo();
		expect(wb.sheets[0]?.tables[0]?.columns[0]?.name).toBe('0');
		expect(wb.sheets[0]?.rows.get(0)?.get(0)?.value).toBe('0');
	});

	it('clear formats and clear all undo merges and conditional formats without a sheet copy', () => {
		const { wb, s } = richWorkbook();
		const before = snapshot(wb);
		for (const what of ['formats', 'all', 'comments', 'hyperlinks'] as const) {
			const ctx = testContext(wb);
			clearRange(ctx, 0, R('A1:F6'), what);
			expect(ctx.steps[0]?.entries.every((e) => e.before.kind !== 'sheet')).toBe(true);
			ctx.undo();
			expect(snapshot(wb)).toEqual(before);
		}
		s.clearRange(0, R('A1:F6'), 'all');
		s.undo();
		expect(snapshot(wb)).toEqual(before);
	});

	it('paste undo restores merges and cells', () => {
		const { wb, s } = richWorkbook();
		const before = snapshot(wb);
		s.paste(0, A('E1'), s.copy(0, R('A1:C4')), 'all');
		s.undo();
		expect(snapshot(wb)).toEqual(before);
	});
});
