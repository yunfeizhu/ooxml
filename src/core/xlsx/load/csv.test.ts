import { describe, expect, it } from 'vitest';
import { getCell } from '../cells';
import type { Cell } from '../model';
import { styleAt } from '../styles';
import { createWorkbook } from '../workbook';
import { csvToWorkbook, detectDelimiter, parseCsv, sheetNameFromFileName, sheetToCsv } from './csv';

describe('parseCsv', () => {
	it('reads quoted fields with doubled quotes, delimiters and embedded line breaks', () => {
		const text = 'name,note\r\n"Smith, J","said ""hi"""\r\n"multi\nline",x\r\n';
		expect(parseCsv(text)).toEqual([
			['name', 'note'],
			['Smith, J', 'said "hi"'],
			['multi\nline', 'x'],
		]);
	});

	it('accepts LF, CRLF and CR line endings and keeps empty fields and rows', () => {
		expect(parseCsv('a,b\nc,\r\n\r,d')).toEqual([['a', 'b'], ['c', ''], [''], ['', 'd']]);
		expect(parseCsv('')).toEqual([]);
		expect(parseCsv('only')).toEqual([['only']]);
	});

	it('strips a byte-order mark', () => {
		expect(parseCsv('\ufeffa,b\n1,2\n')).toEqual([
			['a', 'b'],
			['1', '2'],
		]);
	});

	it('honours an explicit delimiter', () => {
		expect(parseCsv('a|b|"c|d"', { delimiter: '|' })).toEqual([['a', 'b', 'c|d']]);
	});
});

describe('detectDelimiter', () => {
	it('picks the delimiter that splits lines consistently', () => {
		expect(detectDelimiter('a,b,c\n1,2,3\n')).toBe(',');
		expect(detectDelimiter('a;b;c\n1;2;3\n')).toBe(';');
		expect(detectDelimiter('a\tb\n1\t2\n')).toBe('\t');
		expect(detectDelimiter('single column\nvalues\n')).toBe(',');
	});

	it('prefers semicolons when commas are decimal separators', () => {
		expect(detectDelimiter('price;qty\n1,5;2\n2,25;3\n')).toBe(';');
		expect(detectDelimiter('"x;y",b\n"p;q",c\n')).toBe(',');
	});
});

describe('csvToWorkbook', () => {
	it('types values through parseCellInput', () => {
		const workbook = csvToWorkbook(
			'Item;Price;When;Ok;Share;F\nTea;1234.5;2024-01-15;TRUE;12%;=B2*2\n',
			{ sheetName: 'prices', formulas: true },
		);
		const sheet = workbook.sheets[0]!;
		expect(workbook.format).toBe('csv');
		expect(sheet.name).toBe('prices');
		expect(getCell(sheet, 1, 0)?.value).toBe('Tea');
		expect(getCell(sheet, 1, 1)?.value).toBe(1234.5);
		expect(typeof getCell(sheet, 1, 2)?.value).toBe('number');
		expect(styleAt(workbook, getCell(sheet, 1, 2)?.styleId).numFmt).toMatch(/y/);
		expect(getCell(sheet, 1, 3)?.value).toBe(true);
		expect(getCell(sheet, 1, 4)?.value).toBeCloseTo(0.12);
		expect(getCell(sheet, 1, 5)?.formula).toBe('B2*2');
		expect(getCell(sheet, 0, 6)).toBeUndefined();
	});

	it('imports = fields as text unless formulas are enabled', () => {
		const text = 'a,=WEBSERVICE("http://x"),-5,+1,@SUM(A1)\n';
		const sheet = csvToWorkbook(text).sheets[0]!;
		expect(getCell(sheet, 0, 1)).toEqual({ value: '=WEBSERVICE("http://x")' });
		expect(getCell(sheet, 0, 2)?.value).toBe(-5);
		expect(getCell(sheet, 0, 3)?.value).toBe(1);
		expect(getCell(sheet, 0, 4)?.value).toBe('@SUM(A1)');
		const enabled = csvToWorkbook(text, { formulas: true }).sheets[0]!;
		expect(getCell(enabled, 0, 1)?.formula).toBe('WEBSERVICE("http://x")');
	});
});

describe('sheetToCsv', () => {
	it('writes formatted values, quotes when needed and pads rows to the used width', () => {
		const workbook = createWorkbook();
		const sheet = workbook.sheets[0]!;
		const percent = workbook.styles.push({ ...workbook.styles[0]!, numFmt: '0.0%' }) - 1;
		sheet.rows.set(
			0,
			new Map([
				[0, { value: 'a,b' }],
				[1, { value: 'say "x"' }],
				[2, { value: 'line\nbreak' }],
			]),
		);
		sheet.rows.set(
			2,
			new Map([
				[0, { value: 0.125, styleId: percent }],
				[1, { value: true }],
			]),
		);
		expect(sheetToCsv(workbook, 0)).toBe(
			'"a,b","say ""x""","line\nbreak"\r\n,,\r\n12.5%,TRUE,\r\n',
		);
		expect(sheetToCsv(workbook, 0, { delimiter: ';' }).split('\r\n')[2]).toBe('12.5%;TRUE;');
	});

	it('round-trips through csvToWorkbook', () => {
		const source = 'h1,h2\r\n"x, y",2\r\n';
		expect(sheetToCsv(csvToWorkbook(source), 0)).toBe(source);
	});

	it('neutralises text that a spreadsheet would run as a formula', () => {
		const workbook = createWorkbook();
		const sheet = workbook.sheets[0]!;
		const cells: [number, Cell][] = [
			[0, { value: '=1+2' }],
			[1, { value: '+cmd' }],
			[2, { value: '-x' }],
			[3, { value: '@SUM(A1)' }],
			[4, { value: '\tTab' }],
			[5, { value: '\rCR' }],
			[6, { value: -5 }],
			[7, { value: 'plain' }],
			[8, { value: '=calc', formula: '"="&"calc"' }],
		];
		sheet.rows.set(0, new Map(cells));
		expect(sheetToCsv(workbook, 0)).toBe(
			`'=1+2,'+cmd,'-x,'@SUM(A1),'\tTab,"'\rCR",-5,plain,'=calc\r\n`,
		);
		expect(sheetToCsv(workbook, 0, { escapeFormulas: false }).startsWith('=1+2,+cmd')).toBe(true);
		// The quote prefix reads back as the original text.
		const back = csvToWorkbook(sheetToCsv(workbook, 0), { delimiter: ',' }).sheets[0]!;
		expect(getCell(back, 0, 0)?.value).toBe('=1+2');
		expect(getCell(back, 0, 6)?.value).toBe(-5);
	});

	it('writes nothing for an empty sheet and rejects a missing one', () => {
		expect(sheetToCsv(createWorkbook(), 0)).toBe('');
		expect(() => sheetToCsv(createWorkbook(), 3)).toThrow(RangeError);
	});
});

describe('sheetNameFromFileName', () => {
	it('derives a valid sheet name', () => {
		expect(sheetNameFromFileName('C:\\data\\Q1 report.csv')).toBe('Q1 report');
		expect(sheetNameFromFileName('a[1]:b.csv')).toBe('a_1__b');
		expect(sheetNameFromFileName(undefined)).toBe('Sheet1');
		expect(sheetNameFromFileName('x'.repeat(40) + '.csv')).toHaveLength(31);
	});
});
