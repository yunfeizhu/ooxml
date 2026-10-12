import { describe, expect, it } from 'vitest';
import { parseRange } from '../address';
import { getCell } from '../cells';
import type { ChartObject } from '../model';
import { loadXlsx } from '../read/load';
import { createWorkbook } from '../workbook';
import { saveXlsx } from '../write/save';
import { createEditSession } from './session';
import { validateCellInput } from './validation';

/** Builds a quoted prefix, including apostrophes in source and copy names. */
const prefix = (name: string) => `'${name.replace(/'/g, "''")}'!`;
/** Parses an address range used by the annotation and table tests. */
const range = (ref: string) => parseRange(ref)!;

/** Creates explicit and unqualified self references plus an outside reference as a control. */
function setup(name = 'Source') {
	const workbook = createWorkbook({ sheets: [name, 'Outside'] });
	const session = createEditSession(workbook, { autoRowHeight: false });
	session.setCellValue(0, 0, 0, 10);
	session.setCellInput(0, 0, 1, `=${prefix(name)}A1*2`);
	session.setCellInput(0, 0, 2, '=A1*2');
	session.setCellInput(1, 0, 0, `=${prefix(name)}A1*3`);
	session.setDefinedName({ name: 'LocalInput', formula: `${prefix(name)}$A$1`, localSheet: 0 });
	session.setDefinedName({ name: 'GlobalInput', formula: `${prefix(name)}$A$1` });
	return { workbook, session, source: workbook.sheets[0]! };
}

describe('references inside a copied worksheet', () => {
	it.each(['Source', 'My Data', "O'Brien"])(
		'rebinds explicit self references for %s through undo, redo and save',
		async (name) => {
			const { workbook, session, source } = setup(name);
			const originalFormula = getCell(source, 0, 1)!.formula;
			const copyIndex = session.duplicateSheet(0);
			const copy = workbook.sheets[copyIndex]!;
			session.setCellValue(copyIndex, 0, 0, 99);
			expect(getCell(copy, 0, 1)?.formula).toBe(`${prefix(copy.name)}A1*2`);
			expect(getCell(copy, 0, 1)?.value).toBe(198);
			expect(getCell(copy, 0, 2)?.value).toBe(198);
			expect(getCell(source, 0, 0)?.value).toBe(10);
			expect(getCell(source, 0, 1)?.formula).toBe(originalFormula);
			expect(getCell(workbook.sheets[2]!, 0, 0)?.value).toBe(30);
			expect(getCell(workbook.sheets[2]!, 0, 0)?.formula).toBe(`${prefix(name)}A1*3`);
			expect(
				workbook.definedNames.filter((n) => n.localSheet === copyIndex).map((n) => n.formula),
			).toEqual([`${prefix(copy.name)}$A$1`, `${prefix(copy.name)}$A$1`]);
			const after = structuredClone(workbook.sheets);
			session.undo();
			session.undo();
			expect(workbook.sheets).toHaveLength(2);
			session.redo();
			session.redo();
			expect(workbook.sheets).toEqual(after);
			const loaded = await loadXlsx(await saveXlsx(workbook));
			createEditSession(loaded, { autoRowHeight: false }).calculateNow({ full: true });
			expect(getCell(loaded.sheets[1]!, 0, 1)?.formula).toBe(`${prefix(copy.name)}A1*2`);
			expect(getCell(loaded.sheets[1]!, 0, 1)?.value).toBe(198);
		},
	);

	it('preserves other-sheet, external-workbook and quoted-text references', () => {
		const { workbook, session } = setup();
		const formula = 'Source!A1+Outside!A1+\'[remote.xlsx]Source\'!A1+N("Source!A1")';
		session.setCellInput(0, 1, 1, `=${formula}`);
		session.duplicateSheet(0);
		expect(getCell(workbook.sheets[1]!, 1, 1)?.formula).toBe(
			"'Source (2)'!A1+Outside!A1+'[remote.xlsx]Source'!A1+N(\"Source!A1\")",
		);
		expect(getCell(workbook.sheets[0]!, 1, 1)?.formula).toBe(formula);
	});

	it('rebinds sheet-qualified local names without changing unqualified formulas', () => {
		const { workbook, session } = setup();
		session.setCellInput(0, 1, 1, '=Source!LocalInput');
		session.duplicateSheet(0);
		session.setCellValue(1, 0, 0, 99);
		expect(getCell(workbook.sheets[1]!, 1, 1)?.formula).toBe("'Source (2)'!LocalInput");
		expect(getCell(workbook.sheets[1]!, 1, 1)?.value).toBe(99);
		expect(getCell(workbook.sheets[1]!, 0, 2)?.formula).toBe('A1*2');
	});

	it('rebinds validations, conditional rules and internal links only inside the copy', async () => {
		const { workbook, session, source } = setup();
		session.setDataValidation(
			0,
			{
				ranges: [],
				type: 'whole',
				operator: 'lessThanOrEqual',
				formula1: 'Source!$A$1',
				showErrorMessage: true,
			},
			range('D1'),
		);
		session.addConditionalFormat(0, {
			ranges: [range('E1:E3')],
			rules: [{ type: 'expression', priority: 1, formula: 'Source!$A$1>0', style: {} }],
		});
		session.setHyperlink(0, range('F1'), { location: 'Source!$A$1' });
		session.duplicateSheet(0);
		session.setCellValue(1, 0, 0, 99);
		const copy = workbook.sheets[1]!;
		expect(copy.dataValidations[0]?.formula1).toBe("'Source (2)'!$A$1");
		expect(copy.conditionalFormats[0]?.rules[0]).toMatchObject({ formula: "'Source (2)'!$A$1>0" });
		expect(copy.hyperlinks[0]?.location).toBe("'Source (2)'!$A$1");
		expect(validateCellInput(workbook, 1, 0, 3, 50).ok).toBe(true);
		expect(validateCellInput(workbook, 1, 0, 3, 100).ok).toBe(false);
		expect(validateCellInput(workbook, 0, 0, 3, 50).ok).toBe(false);
		expect(source.dataValidations[0]?.formula1).toBe('Source!$A$1');
		expect(source.hyperlinks[0]?.location).toBe('Source!$A$1');
		const loaded = await loadXlsx(await saveXlsx(workbook));
		expect(loaded.sheets[1]?.dataValidations[0]?.formula1).toBe("'Source (2)'!$A$1");
		expect(loaded.sheets[1]?.hyperlinks[0]?.location).toBe("'Source (2)'!$A$1");
		expect(validateCellInput(loaded, 1, 0, 3, 50).ok).toBe(true);
	});

	it('rebinds chart series references and preserves the original chart', async () => {
		const { workbook, session, source } = setup();
		session.setCellValue(0, 1, 0, 2);
		session.setRangeValues(0, { row: 0, col: 5 }, [['a'], ['b']]);
		session.addChart(0, {
			anchor: {
				from: { row: 2, col: 2, rowOffset: 0, colOffset: 0 },
				to: { row: 10, col: 6, rowOffset: 0, colOffset: 0 },
			},
			chartType: 'column',
			showLegend: true,
			series: [
				{
					nameRef: 'Source!$B$1',
					categoriesRef: 'Source!$F$1:$F$2',
					valuesRef: 'Source!$A$1:$A$2',
					categories: [],
					values: [],
				},
			],
		});
		session.duplicateSheet(0);
		const copy = workbook.sheets[1]!;
		const series = (copy.drawings[0] as ChartObject).series[0]!;
		expect(series.nameRef).toBe("'Source (2)'!$B$1");
		expect(series.categoriesRef).toBe("'Source (2)'!$F$1:$F$2");
		expect(series.valuesRef).toBe("'Source (2)'!$A$1:$A$2");
		expect((source.drawings[0] as ChartObject).series[0]?.valuesRef).toBe('Source!$A$1:$A$2');
		const loaded = await loadXlsx(await saveXlsx(workbook));
		expect((loaded.sheets[1]!.drawings[0] as ChartObject).series[0]?.valuesRef).toBe(
			"'Source (2)'!$A$1:$A$2",
		);
	});

	it('rebinds preserved sparkline and x14 validation formulas without losing unknown markup', async () => {
		const { workbook, session, source } = setup();
		const xml =
			'<extLst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
			'<ext uri="{CCE6A557-97BC-4b89-ADB6-D9C93CAAB3DF}" xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main" xmlns:xm="http://schemas.microsoft.com/office/excel/2006/main">' +
			'<x14:dataValidations count="1"><x14:dataValidation type="list"><x14:formula1><xm:f>Source!$A$1:$A$2</xm:f></x14:formula1><xm:sqref>G2:G4</xm:sqref></x14:dataValidation></x14:dataValidations></ext>' +
			'<ext uri="custom"><payload xmlns="urn:test" keep="yes"/></ext></extLst>';
		source.preserved.set('extLst', [xml]);
		session.duplicateSheet(0);
		const savedXml = workbook.sheets[1]!.preserved.get('extLst')![0]!;
		expect(savedXml).toContain("'Source (2)'!$A$1:$A$2");
		expect(savedXml).toContain('<xm:sqref>G2:G4</xm:sqref>');
		expect(savedXml).toContain('keep="yes"');
		expect(source.preserved.get('extLst')).toEqual([xml]);
		const loaded = await loadXlsx(await saveXlsx(workbook));
		expect(loaded.sheets[1]?.preserved.get('extLst')?.[0]).toContain("'Source (2)'!$A$1:$A$2");
	});

	it('keeps copied table formulas and scoped names on the copied table', async () => {
		const { workbook, session, source } = setup();
		session.setRangeValues(0, { row: 0, col: 3 }, [
			['Input', 'Double'],
			[2, null],
			[4, null],
		]);
		session.createTable(0, range('D1:E3'), true);
		const table = source.tables[0]!;
		table.columns[1]!.calculatedColumnFormula = `${table.name}[@Input]+Source!$A$1`;
		session.setDefinedName({
			name: 'TableInput',
			formula: `SUM(${table.name}[Input])`,
			localSheet: 0,
		});
		session.duplicateSheet(0);
		const copiedTable = workbook.sheets[1]!.tables[0]!;
		expect(copiedTable.columns[1]?.calculatedColumnFormula).toBe(
			`${copiedTable.name}[@Input]+'Source (2)'!$A$1`,
		);
		expect(
			workbook.definedNames.find((n) => n.name === 'TableInput' && n.localSheet === 1)?.formula,
		).toBe(`SUM(${copiedTable.name}[Input])`);
		expect(table.columns[1]?.calculatedColumnFormula).toBe(`${table.name}[@Input]+Source!$A$1`);
		const loaded = await loadXlsx(await saveXlsx(workbook));
		expect(loaded.sheets[1]?.tables[0]?.columns[1]?.calculatedColumnFormula).toBe(
			`${copiedTable.name}[@Input]+'Source (2)'!$A$1`,
		);
	});

	it('keeps a formula that cannot be tokenized verbatim', () => {
		const { workbook, session, source } = setup();
		const formula = 'Source!A1+"unterminated';
		getCell(source, 0, 1)!.formula = formula;
		session.duplicateSheet(0);
		expect(getCell(workbook.sheets[1]!, 0, 1)?.formula).toBe(formula);
	});
});
