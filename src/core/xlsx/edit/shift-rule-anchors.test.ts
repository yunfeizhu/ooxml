import { describe, expect, it } from 'vitest';
import { parseRange } from '../address';
import { createCalcEngine } from '../formula/engine';
import { createConditionalFormatEvaluator } from '../layout/cf-evaluator';
import type { Workbook } from '../model';
import { loadXlsx } from '../read/load';
import { createWorkbook } from '../workbook';
import { saveXlsx } from '../write/save';
import { createEditSession } from './session';
import { validateCellInput } from './validation';
/** Parses the compact rule ranges used by these fixtures. */
const range = (text: string) => parseRange(text)!;
/** Exercises the saved XLSX representation before checking rule behaviour. */
const reload = async (wb: Workbook) => loadXlsx(await saveXlsx(wb));
/** Creates a relative validation whose first covered row rejects and later rows accept input. */
function validationBook() {
	const wb = createWorkbook();
	const s = createEditSession(wb);
	s.setRangeValues(0, { row: 0, col: 0 }, [
		[10, 0],
		[20, 1],
		[30, 1],
	]);
	s.setDataValidation(
		0,
		{ ranges: [], type: 'custom', formula1: 'B1>0', showErrorMessage: true },
		range('A1:A3'),
	);
	return { wb, s };
}
/** Creates matching relative formatting so deletion can be checked through the evaluator. */
function conditionalBook() {
	const wb = createWorkbook();
	const s = createEditSession(wb);
	s.setRangeValues(0, { row: 0, col: 0 }, [
		[10, 0],
		[20, 1],
		[30, 1],
	]);
	s.addConditionalFormat(0, {
		ranges: [range('A1:A3')],
		rules: [{ type: 'expression', formula: 'B1>0', priority: 1, style: { font: { bold: true } } }],
	});
	return { wb, s };
}
/** Evaluates the conditional style at one surviving cell against the current workbook. */
const cfAt = (wb: Workbook, row: number) => {
	const engine = createCalcEngine(wb);
	return createConditionalFormatEvaluator(wb, 0, (f, at) => engine.evaluate(f, at)).at(row, 0);
};
describe('relative rules after row deletion', () => {
	it('control: validation follows remaining data when a non-anchor row is deleted', async () => {
		const { wb, s } = validationBook();
		expect(validateCellInput(wb, 0, 2, 0, 31).ok).toBe(true);
		s.deleteRows(0, 1, 1);
		expect(validateCellInput(await reload(wb), 0, 1, 0, 31).ok).toBe(true);
	});
	it('control: conditional formatting follows a non-anchor row deletion', async () => {
		const { wb, s } = conditionalBook();
		expect(cfAt(wb, 2)?.style?.font?.bold).toBe(true);
		s.deleteRows(0, 1, 1);
		expect(cfAt(await reload(wb), 1)?.style?.font?.bold).toBe(true);
	});
	it('keeps valid inputs allowed after deleting the first validation row', async () => {
		const { wb, s } = validationBook();
		expect(validateCellInput(wb, 0, 1, 0, 21).ok).toBe(true);
		s.deleteRows(0, 0, 1);
		const saved = await reload(wb);
		expect({
			formula: saved.sheets[0]?.dataValidations[0]?.formula1,
			ok: validateCellInput(saved, 0, 0, 0, 21).ok,
		}).toEqual({ formula: 'B1>0', ok: true });
	});
	it('keeps the formatting on surviving cells after deleting the first rule row', async () => {
		const { wb, s } = conditionalBook();
		expect(cfAt(wb, 1)?.style?.font?.bold).toBe(true);
		s.deleteRows(0, 0, 1);
		const saved = await reload(wb);
		const rule = saved.sheets[0]?.conditionalFormats[0]?.rules[0];
		expect({
			formula: rule?.type === 'expression' ? rule.formula : undefined,
			bold: cfAt(saved, 0)?.style?.font?.bold,
		}).toEqual({ formula: 'B1>0', bold: true });
	});
});

describe('rule anchor shifts', () => {
	it('keeps the surviving rule semantics through undo and redo', async () => {
		const { wb, s } = validationBook();
		const original = structuredClone(wb.sheets[0]?.dataValidations);
		s.deleteRows(0, 0, 1);
		expect(validateCellInput(wb, 0, 0, 0, 21).ok).toBe(true);
		s.undo();
		expect(wb.sheets[0]?.dataValidations).toEqual(original);
		s.redo();
		expect(validateCellInput(await reload(wb), 0, 0, 0, 21).ok).toBe(true);
	});
	it('rebases a local cell-band deletion to the unchanged adjacent column', async () => {
		const { wb, s } = validationBook();
		s.deleteCellsShift(0, range('A1'), 'up');
		const saved = await reload(wb);
		expect(saved.sheets[0]?.dataValidations[0]?.formula1).toBe('B2>0');
		expect(validateCellInput(saved, 0, 0, 0, 21).ok).toBe(true);
	});
	it('rebases conditional formats when a band removes their first cell', async () => {
		const { wb, s } = conditionalBook();
		s.deleteCellsShift(0, range('A1'), 'up');
		expect(cfAt(await reload(wb), 0)?.style?.font?.bold).toBe(true);
	});
	it('rebases the first covered column before references are deleted', async () => {
		const wb = createWorkbook();
		const s = createEditSession(wb);
		s.setRangeValues(0, { row: 0, col: 0 }, [
			[10, 20, 30],
			[0, 1, 1],
		]);
		s.setDataValidation(
			0,
			{ ranges: [], type: 'custom', formula1: 'A1>A2', showErrorMessage: true },
			range('A1:C1'),
		);
		s.deleteColumns(0, 0, 1);
		const saved = await reload(wb);
		expect(saved.sheets[0]?.dataValidations[0]?.formula1).toBe('A1>A2');
		expect(validateCellInput(saved, 0, 0, 0, 21).ok).toBe(true);
		expect(validateCellInput(saved, 0, 0, 0, 0).ok).toBe(false);
	});
	it('retains genuine deleted absolute references as #REF!', () => {
		const { wb, s } = validationBook();
		s.setDataValidation(0, { ranges: [], type: 'custom', formula1: '$B$1>0' }, range('A1:A3'));
		s.deleteRows(0, 0, 1);
		expect(wb.sheets[0]?.dataValidations[0]?.formula1).toBe('#REF!>0');
	});
	it('uses the next range when the entire first conditional range is removed', () => {
		const { wb, s } = conditionalBook();
		wb.sheets[0]!.conditionalFormats[0]!.ranges = [range('A1'), range('A3')];
		s.deleteRows(0, 0, 1);
		const rule = wb.sheets[0]?.conditionalFormats[0]?.rules[0];
		expect(rule?.type === 'expression' && rule.formula).toBe('B2>0');
		expect(cfAt(wb, 1)?.style?.font?.bold).toBe(true);
	});
	it('uses the validation bounding box even with unsorted ranges', () => {
		const { wb, s } = validationBook();
		wb.sheets[0]!.dataValidations[0]!.ranges = [range('A3'), range('A1:A2')];
		s.deleteRows(0, 0, 1);
		expect(wb.sheets[0]?.dataValidations[0]?.formula1).toBe('B1>0');
		expect(validateCellInput(wb, 0, 0, 0, 21).ok).toBe(true);
	});
	it('leaves rules straddling a cell-shift band anchored in place', () => {
		const { wb, s } = validationBook();
		wb.sheets[0]!.dataValidations[0]!.ranges = [range('A1:B3')];
		s.deleteCellsShift(0, range('A1'), 'up');
		expect(wb.sheets[0]?.dataValidations[0]?.ranges).toEqual([range('A1:B3')]);
		expect(wb.sheets[0]?.dataValidations[0]?.formula1).toBe('B1>0');
	});
});
