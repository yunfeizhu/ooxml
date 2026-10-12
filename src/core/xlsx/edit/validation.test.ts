import { describe, expect, it } from 'vitest';
import { parseAddress, parseRange } from '../address';
import type { DataValidation } from '../model';
import { createWorkbook } from '../workbook';
import { createEditSession } from './session';
import { DEFAULT_VALIDATION_MESSAGE, listValidationOptions, validateCellInput } from './validation';

const A = (ref: string) => {
	const a = parseAddress(ref);
	if (!a) throw new Error(ref);
	return a;
};
const R = (ref: string) => {
	const r = parseRange(ref);
	if (!r) throw new Error(ref);
	return r;
};
const withRule = (rule: Omit<DataValidation, 'ranges'>, ref = 'A1:A10') => {
	const wb = createWorkbook({ sheets: ['Sheet1', 'Lists'] });
	const s = createEditSession(wb, { recalc: false });
	s.setDataValidation(0, { ...rule, ranges: [] }, R(ref));
	return {
		wb,
		s,
		check: (value: Parameters<typeof validateCellInput>[4], row = 0) =>
			validateCellInput(wb, 0, row, 0, value),
	};
};

describe('validateCellInput', () => {
	it('accepts anything without a rule', () => {
		const { wb } = withRule({ type: 'whole', operator: 'equal', formula1: '1' }, 'C1');
		expect(validateCellInput(wb, 0, 0, 0, 'x')).toEqual({ ok: true });
	});
	it('checks whole numbers between bounds', () => {
		const { check } = withRule({
			type: 'whole',
			operator: 'between',
			formula1: '1',
			formula2: '10',
		});
		expect(check(5).ok).toBe(true);
		expect(check(10).ok).toBe(true);
		expect(check(11).ok).toBe(false);
		expect(check(2.5).ok).toBe(false);
		expect(check('abc').ok).toBe(false);
	});
	it('checks decimals with comparison operators', () => {
		const { check } = withRule({ type: 'decimal', operator: 'greaterThan', formula1: '0.5' });
		expect(check(0.6).ok).toBe(true);
		expect(check(0.5).ok).toBe(false);
		expect(check('0.75').ok).toBe(true);
	});
	it('checks not-between, equal and not-equal', () => {
		expect(
			withRule({ type: 'whole', operator: 'notBetween', formula1: '1', formula2: '3' }).check(2).ok,
		).toBe(false);
		expect(withRule({ type: 'whole', operator: 'equal', formula1: '7' }).check(7).ok).toBe(true);
		expect(withRule({ type: 'whole', operator: 'notEqual', formula1: '7' }).check(7).ok).toBe(
			false,
		);
		expect(
			withRule({ type: 'decimal', operator: 'lessThanOrEqual', formula1: '1' }).check(1).ok,
		).toBe(true);
	});
	it('checks text length', () => {
		const { check } = withRule({ type: 'textLength', operator: 'lessThanOrEqual', formula1: '3' });
		expect(check('abc').ok).toBe(true);
		expect(check('abcd').ok).toBe(false);
		expect(check(12345).ok).toBe(false);
	});
	it('checks dates against serial bounds', () => {
		const { check } = withRule({ type: 'date', operator: 'greaterThanOrEqual', formula1: '45292' });
		expect(check(45306).ok).toBe(true);
		expect(check(45000).ok).toBe(false);
	});
	it('checks list membership case-insensitively', () => {
		const { check } = withRule({ type: 'list', formula1: '"Yes,No,Maybe"' });
		expect(check('No').ok).toBe(true);
		expect(check('maybe').ok).toBe(true);
		expect(check('Perhaps').ok).toBe(false);
	});
	it('checks lists sourced from a range on another sheet', () => {
		const { wb, s, check } = withRule({ type: 'list', formula1: 'Lists!$A$1:$A$3' });
		s.setRangeValues(1, A('A1'), [['red'], ['green'], ['blue']]);
		expect(check('green').ok).toBe(true);
		expect(check('pink').ok).toBe(false);
		expect(listValidationOptions(wb, 0, 0, 0)).toEqual(['red', 'green', 'blue']);
	});
	it('accepts blanks unless blanks are explicitly disallowed', () => {
		expect(withRule({ type: 'whole', operator: 'equal', formula1: '1' }).check(null).ok).toBe(true);
		expect(
			withRule({ type: 'whole', operator: 'equal', formula1: '1', allowBlank: false }).check('').ok,
		).toBe(false);
	});
	it('never rejects when the error alert is off', () => {
		const { check } = withRule({
			type: 'whole',
			operator: 'equal',
			formula1: '1',
			showErrorMessage: false,
		});
		expect(check(2).ok).toBe(true);
	});
	it('reports the rule message, title and style', () => {
		const { check } = withRule({
			type: 'whole',
			operator: 'equal',
			formula1: '1',
			errorStyle: 'warning',
			errorTitle: 'Careful',
			error: 'Only 1 is allowed.',
		});
		expect(check(2)).toEqual({
			ok: false,
			style: 'warning',
			title: 'Careful',
			message: 'Only 1 is allowed.',
		});
	});
	it('falls back to the Excel message and the stop style', () => {
		const { check } = withRule({ type: 'whole', operator: 'equal', formula1: '1' });
		expect(check(2)).toEqual({ ok: false, style: 'stop', message: DEFAULT_VALIDATION_MESSAGE });
	});
	it('evaluates formula bounds and custom rules through the session', () => {
		const wb = createWorkbook();
		const s = createEditSession(wb);
		s.setCellValue(0, 0, 1, 10);
		s.setDataValidation(
			0,
			{ ranges: [], type: 'whole', operator: 'lessThan', formula1: '$B$1' },
			R('A1'),
		);
		expect(s.validate(0, 0, 0, 5).ok).toBe(true);
		expect(s.validate(0, 0, 0, 15).ok).toBe(false);
		s.setDataValidation(0, { ranges: [], type: 'custom', formula1: '$B$1>5' }, R('A2'));
		expect(s.validate(0, 1, 0, 'x').ok).toBe(true);
		s.setCellValue(0, 0, 1, 1);
		expect(s.validate(0, 1, 0, 'x').ok).toBe(false);
	});
});

describe('listValidationOptions', () => {
	it('splits a literal list and trims items', () => {
		const { wb } = withRule({ type: 'list', formula1: '"Red, Green ,Blue"' });
		expect(listValidationOptions(wb, 0, 3, 0)).toEqual(['Red', 'Green', 'Blue']);
	});
	it('returns undefined outside list rules or with the drop-down hidden', () => {
		const { wb } = withRule({ type: 'list', formula1: '"a,b"', showDropDown: false });
		expect(listValidationOptions(wb, 0, 0, 0)).toBeUndefined();
		expect(listValidationOptions(wb, 0, 0, 5)).toBeUndefined();
		const other = withRule({ type: 'whole', operator: 'equal', formula1: '1' });
		expect(listValidationOptions(other.wb, 0, 0, 0)).toBeUndefined();
	});
	it('resolves a same-sheet range and skips blanks, using display text', () => {
		const { wb, s } = withRule({ type: 'list', formula1: '$C$1:$C$4' });
		s.setRangeValues(0, A('C1'), [['a'], [null], [0.5], ['b']]);
		s.applyStyle(0, [R('C3')], { numFmt: '0%' });
		expect(listValidationOptions(wb, 0, 0, 0)).toEqual(['a', '50%', 'b']);
	});
	it('resolves a defined name', () => {
		const { wb, s } = withRule({ type: 'list', formula1: 'Colors' });
		s.setRangeValues(1, A('B1'), [['x'], ['y']]);
		s.setDefinedName({ name: 'Colors', formula: 'Lists!$B$1:$B$2' });
		expect(listValidationOptions(wb, 0, 0, 0)).toEqual(['x', 'y']);
	});
	it('resolves quoted sheet names', () => {
		const wb = createWorkbook({ sheets: ['Main', 'My Lists'] });
		const s = createEditSession(wb, { recalc: false });
		s.setRangeValues(1, A('A1'), [['p'], ['q']]);
		s.setDataValidation(0, { ranges: [], type: 'list', formula1: "'My Lists'!$A$1:$A$2" }, R('A1'));
		expect(listValidationOptions(wb, 0, 0, 0)).toEqual(['p', 'q']);
	});
});

// Expectations checked in Excel 16 through COM (Range.Validation.Value after entering the value).
describe('Excel validation semantics', () => {
	it('evaluates a custom rule with the proposed value in the target cell', () => {
		const wb = createWorkbook();
		const s = createEditSession(wb);
		s.setDataValidation(0, { ranges: [], type: 'custom', formula1: 'ISNUMBER(A1)' }, R('A1:A3'));
		expect(s.validate(0, 0, 0, 5).ok).toBe(true);
		expect(s.validate(0, 2, 0, 5).ok).toBe(true);
		expect(s.validate(0, 0, 0, 'text').ok).toBe(false);
		expect(wb.sheets[0]?.rows.size).toBe(0);
	});
	it('moves relative references from the rule corner to the target cell', () => {
		const wb = createWorkbook();
		const s = createEditSession(wb);
		s.setCellValue(0, 0, 1, 0);
		s.setCellValue(0, 1, 1, 10);
		s.setDataValidation(0, { ranges: [], type: 'custom', formula1: 'B1>5' }, R('C1:C3'));
		expect(s.validate(0, 0, 2, 1).ok).toBe(false);
		expect(s.validate(0, 1, 2, 1).ok).toBe(true);
	});
	it('anchors formulas at the top-left of the bounding box of every range', () => {
		const wb = createWorkbook();
		const s = createEditSession(wb);
		s.setCellValue(0, 3, 0, 'x');
		wb.sheets[0]?.dataValidations.push({
			ranges: [R('C1:C2'), R('A3:A4')],
			type: 'custom',
			formula1: 'ISNUMBER(A1)',
			showErrorMessage: true,
		});
		// A1 is the corner, so at A4 the formula reads ISNUMBER(A4): the proposed value.
		expect(s.validate(0, 3, 0, 7).ok).toBe(true);
		expect(s.validate(0, 3, 0, 'y').ok).toBe(false);
	});
	it('compares list entries by value, not display text', () => {
		const wb = createWorkbook();
		const s = createEditSession(wb);
		s.setCellValue(0, 0, 0, 45000);
		s.applyStyle(0, [R('A1')], { numFmt: 'm/d/yyyy' });
		s.setCellValue(0, 1, 0, 1.5);
		s.applyStyle(0, [R('A2')], { numFmt: '0.00' });
		s.setCellValue(0, 2, 0, 'Red');
		s.setDataValidation(0, { ranges: [], type: 'list', formula1: '$A$1:$A$3' }, R('B1'));
		expect(s.validate(0, 0, 1, 45000).ok).toBe(true);
		expect(s.validate(0, 0, 1, 1.5).ok).toBe(true);
		expect(s.validate(0, 0, 1, 'RED').ok).toBe(true);
		expect(s.validate(0, 0, 1, '1.50').ok).toBe(false);
		expect(s.validate(0, 0, 1, 2).ok).toBe(false);
	});
	it('matches numbers typed against a literal list', () => {
		const { check } = withRule({ type: 'list', formula1: '"1,2,3"' });
		expect(check(2).ok).toBe(true);
		expect(check(4).ok).toBe(false);
	});
	it('does not enforce a rule read without showErrorMessage (the OOXML default)', () => {
		const wb = createWorkbook();
		wb.sheets[0]?.dataValidations.push({
			ranges: [R('D1:D5')],
			type: 'whole',
			operator: 'between',
			formula1: '1',
			formula2: '10',
		});
		expect(validateCellInput(wb, 0, 0, 3, 50).ok).toBe(true);
		const dv = wb.sheets[0]?.dataValidations[0];
		if (dv) dv.showErrorMessage = true;
		expect(validateCellInput(wb, 0, 0, 3, 50).ok).toBe(false);
	});
	it('turns the error alert and input message on for rules created in the editor', () => {
		const { wb } = withRule({ type: 'whole', operator: 'equal', formula1: '1' });
		expect(wb.sheets[0]?.dataValidations[0]).toMatchObject({
			showErrorMessage: true,
			showInputMessage: true,
		});
	});
});
