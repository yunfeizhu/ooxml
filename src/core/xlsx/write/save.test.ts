import { readFileSync } from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { putCell } from '../cells';
import type { Workbook } from '../model';
import { internStyle } from '../styles';
import { createWorkbook, defaultCellStyle } from '../workbook';
import { loadXlsx } from '../read/index';
import { saveXlsx } from './index';

const FIXTURES = [
	'excel-features.xlsx',
	'excel-1904.xlsx',
	'openpyxl-features.xlsx',
	'openpyxl-styles.xlsx',
	'openpyxl-1904.xlsx',
];
const fixture = (name: string) =>
	new Uint8Array(readFileSync(path.join(import.meta.dirname, '..', '__fixtures__', name)));
const range = (r1: number, c1: number, r2 = r1, c2 = c1) => ({
	start: { row: r1, col: c1 },
	end: { row: r2, col: c2 },
});

/** The model without load bookkeeping: source bytes, warnings and source-XML snapshots. */
export function comparable(value: unknown): unknown {
	return JSON.parse(
		JSON.stringify(
			Array.isArray(value)
				? value
				: {
						...(value as object),
						source: undefined,
						warnings: undefined,
						fullCalcOnLoad: undefined,
					},
			(key, value) => {
				// Sheet titles in app.xml are derived from the sheets on save (openpyxl omits them).
				if (key === 'headingPairs' || key === 'titlesOfParts') return undefined;
				// Table-column ids record read provenance; newly created columns have none.
				if (key === 'sourceId') return undefined;
				if (key === 'preserved' && value instanceof Map)
					return [...value].filter(([name]) => !String(name).startsWith('source:'));
				if (value instanceof Map) return [...value].sort((a, b) => Number(a[0]) - Number(b[0]));
				return value;
			},
		),
	);
}

const parts = async (bytes: Uint8Array) => {
	const zip = await JSZip.loadAsync(bytes);
	const out = new Map<string, Uint8Array>();
	for (const entry of Object.values(zip.files))
		if (!entry.dir) out.set(entry.name, await entry.async('uint8array'));
	return out;
};
const text = (map: Map<string, Uint8Array>, name: string) =>
	new TextDecoder().decode(map.get(name));

/** What the edit module's `duplicateSheet` does to the copy. */
export function duplicateLikeEdit(
	sheet: Workbook['sheets'][number],
	name: string,
	sheetId: number,
) {
	const copy = structuredClone(sheet);
	copy.name = name;
	copy.sheetId = sheetId;
	delete copy.partName;
	copy.tables = copy.tables.map((t, i) => {
		const next = { ...t, id: 100 + i, name: `${t.name}_2`, displayName: `${t.name}_2` };
		delete next.partName;
		return next;
	});
	for (const drawing of copy.drawings) if (drawing.kind === 'chart') delete drawing.partName;
	return copy;
}

describe('saveXlsx round trips', () => {
	it.each(FIXTURES)('load -> save -> load keeps the model of %s', async (name) => {
		const first = await loadXlsx(fixture(name));
		const second = await loadXlsx(await saveXlsx(first));
		expect(comparable(second)).toEqual(comparable(first));
		expect(second.fullCalcOnLoad).toBe(true);
	});

	it.each(FIXTURES)('a second save of %s is identical to the first', async (name) => {
		const once = await saveXlsx(await loadXlsx(fixture(name)));
		const twice = await saveXlsx(await loadXlsx(once));
		const a = await parts(once);
		const b = await parts(twice);
		expect([...b.keys()].sort()).toEqual([...a.keys()].sort());
		for (const [part, bytes] of a)
			if (
				part.startsWith('xl/worksheets/') ||
				part === 'xl/styles.xml' ||
				part === 'xl/sharedStrings.xml'
			)
				expect(text(b, part)).toBe(new TextDecoder().decode(bytes));
	});

	it('keeps parts it does not model byte-identical and drops calcChain', async () => {
		const source = await parts(fixture('excel-features.xlsx'));
		const saved = await parts(await saveXlsx(await loadXlsx(fixture('excel-features.xlsx'))));
		for (const part of [
			'xl/printerSettings/printerSettings1.bin',
			'xl/charts/chart1.xml',
			'xl/charts/style1.xml',
			'xl/charts/colors1.xml',
			'xl/charts/_rels/chart1.xml.rels',
			'xl/media/image1.png',
			'xl/drawings/drawing1.xml',
			'xl/drawings/_rels/drawing1.xml.rels',
			'xl/drawings/vmlDrawing1.vml',
			'xl/comments1.xml',
			'xl/threadedComments/threadedComment1.xml',
			'xl/tables/table1.xml',
			'xl/theme/theme1.xml',
		])
			expect(saved.get(part), part).toEqual(source.get(part));
		expect(saved.has('xl/calcChain.xml')).toBe(false);
		expect(text(saved, '[Content_Types].xml')).not.toContain('calcChain');
		expect(text(saved, 'xl/workbook.xml')).toContain('fullCalcOnLoad="1"');
		expect(text(saved, 'xl/workbook.xml')).toContain('x15:workbookPr');
	});

	it('declares a content type for every part', async () => {
		for (const name of FIXTURES) {
			const saved = await parts(await saveXlsx(await loadXlsx(fixture(name))));
			const types = text(saved, '[Content_Types].xml');
			for (const part of saved.keys()) {
				if (part === '[Content_Types].xml') continue;
				const ext = part.split('.').pop() ?? '';
				expect(
					types.includes(`PartName="/${part}"`) || types.includes(`Extension="${ext}"`),
					`${name}: ${part}`,
				).toBe(true);
			}
		}
	});

	it('drops the parts of a deleted sheet and regenerates edited drawings', async () => {
		const wb = await loadXlsx(fixture('excel-features.xlsx'));
		const second = wb.sheets[1]!;
		const shapeXml = second.drawings.find((d) => d.kind === 'unsupported');
		second.drawings.forEach(
			(d) => (d.anchor = { ...d.anchor, from: { ...d.anchor.from, row: d.anchor.from.row + 2 } }),
		);
		let saved = await parts(await saveXlsx(wb));
		const drawing = text(saved, 'xl/drawings/drawing1.xml');
		expect(drawing).toContain('<xdr:row>15</xdr:row>');
		expect(shapeXml?.kind === 'unsupported' && drawing.includes('Rectangle 4')).toBe(true);
		expect(saved.get('xl/charts/chart1.xml')).toEqual(
			(await parts(fixture('excel-features.xlsx'))).get('xl/charts/chart1.xml'),
		);
		const reloaded = await loadXlsx(await saveXlsx(wb));
		const noXml = (list: readonly object[]) =>
			JSON.parse(JSON.stringify(list.map((d) => ({ ...d, sourceXml: undefined }))));
		expect(noXml(reloaded.sheets[1]!.drawings)).toEqual(noXml(second.drawings));

		wb.sheets.splice(1, 1);
		wb.activeSheet = 0;
		saved = await parts(await saveXlsx(wb));
		for (const gone of [
			'xl/tables/table1.xml',
			'xl/drawings/drawing1.xml',
			'xl/charts/chart1.xml',
			'xl/media/image1.png',
		])
			expect(saved.has(gone), gone).toBe(false);
		expect(saved.has('xl/printerSettings/printerSettings1.bin')).toBe(true);
	});

	it('writes a duplicated sheet (charts without partName, shared image) as new parts', async () => {
		const wb = await loadXlsx(fixture('excel-features.xlsx'));
		wb.sheets.splice(2, 0, duplicateLikeEdit(wb.sheets[1]!, 'Second (2)', 4));
		const saved = await saveXlsx(wb);
		const map = await parts(saved);
		expect(map.has('xl/drawings/drawing2.xml')).toBe(true);
		expect(map.has('xl/charts/chart2.xml')).toBe(true);
		const back = await loadXlsx(saved);
		for (const index of [1, 2]) {
			const kinds = back.sheets[index]!.drawings.map((d) => d.kind);
			expect(kinds).toEqual(['chart', 'image', 'unsupported']);
		}
		const copy = back.sheets[2]!.drawings[0];
		expect(copy?.kind === 'chart' && copy.series.map((s) => s.valuesRef)).toEqual([
			'Second!$B$2:$B$5',
			'Second!$C$2:$C$5',
		]);
		expect(back.sheets[2]!.drawings[1]).toMatchObject({ partName: 'xl/media/image1.png' });
		expect(back.sheets[2]!.tables[0]?.name).toBe('SalesTable_2');
	});

	it('reuses source differential formats so carried references stay valid', async () => {
		const saved = await parts(await saveXlsx(await loadXlsx(fixture('excel-features.xlsx'))));
		expect(text(saved, 'xl/styles.xml')).toContain(
			'<dxfs count="1"><dxf><fill><patternFill><bgColor rgb="FFFFC79C"/>',
		);
		expect(text(saved, 'xl/styles.xml')).not.toMatch(/<dxf xmlns=/);
		expect(text(saved, 'xl/worksheets/sheet1.xml')).toContain(
			'<cfRule type="cellIs" priority="1" dxfId="0"',
		);
	});

	it('keeps VBA projects and the macro-enabled content type for .xlsm', async () => {
		const zip = await JSZip.loadAsync(fixture('excel-1904.xlsx'));
		zip.file('xl/vbaProject.bin', new Uint8Array([1, 2, 3, 4]));
		const rels = await zip.file('xl/_rels/workbook.xml.rels')!.async('string');
		zip.file(
			'xl/_rels/workbook.xml.rels',
			rels.replace(
				'</Relationships>',
				'<Relationship Id="rId99" Type="http://schemas.microsoft.com/office/2006/relationships/vbaProject" Target="vbaProject.bin"/></Relationships>',
			),
		);
		const types = await zip.file('[Content_Types].xml')!.async('string');
		zip.file(
			'[Content_Types].xml',
			types
				.replace('spreadsheetml.sheet.main+xml', 'XX')
				.replace('XX', 'spreadsheetml.sheet.main+xml')
				.replace(
					'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
					'application/vnd.ms-excel.sheet.macroEnabled.main+xml',
				)
				.replace(
					'</Types>',
					'<Default Extension="bin" ContentType="application/vnd.ms-office.vbaProject"/></Types>',
				),
		);
		const wb = await loadXlsx(await zip.generateAsync({ type: 'uint8array' }));
		expect(wb.format).toBe('xlsm');
		const saved = await parts(await saveXlsx(wb));
		expect(saved.get('xl/vbaProject.bin')).toEqual(new Uint8Array([1, 2, 3, 4]));
		expect(text(saved, '[Content_Types].xml')).toContain('macroEnabled.main+xml');
		wb.format = 'xlsx';
		const plain = await parts(await saveXlsx(wb));
		expect(plain.has('xl/vbaProject.bin')).toBe(false);
	});
});

describe('saveXlsx for new workbooks', () => {
	function build(): Workbook {
		const wb = createWorkbook({ sheets: ['One', 'Two'] });
		const sheet = wb.sheets[0]!;
		const bold = internStyle(wb, {
			...defaultCellStyle(),
			font: { ...defaultCellStyle().font, bold: true },
		});
		const pct = internStyle(wb, { ...defaultCellStyle(), numFmt: '0.0%' });
		const custom = internStyle(wb, {
			...defaultCellStyle(),
			numFmt: '[Blue]0.00;[Red]-0.00',
			alignment: { horizontal: 'center', wrapText: true },
		});
		putCell(sheet, 0, 0, { value: 'Header', styleId: bold });
		putCell(sheet, 0, 1, { value: 'Q1', styleId: bold });
		putCell(sheet, 1, 0, { value: 'a\r\nb\u0001 _x0041_' });
		putCell(sheet, 1, 1, { value: 0.25, styleId: pct });
		putCell(sheet, 2, 1, { value: 0.5, formula: 'B2*2', styleId: custom });
		putCell(sheet, 3, 1, { value: true });
		putCell(sheet, 4, 1, { value: { error: '#N/A' } });
		putCell(sheet, 5, 1, { value: 'x', formula: 'IF(TRUE,"x")' });
		putCell(sheet, 6, 0, {
			value: 'Rich',
			richText: [{ text: 'Ri', font: { bold: true } }, { text: 'ch' }],
		});
		putCell(sheet, 7, 3, { value: null, styleId: bold });
		sheet.merges.push(range(8, 0, 9, 1));
		sheet.columns.push({ min: 0, max: 1, width: 12.5, customWidth: true });
		sheet.rowInfo.set(1, { height: 30, customHeight: true });
		sheet.view.freeze = { rows: 1, cols: 0 };
		sheet.view.topLeft = { row: 1, col: 0 };
		sheet.conditionalFormats.push({
			ranges: [range(1, 1, 5, 1)],
			rules: [
				{
					type: 'cellIs',
					operator: 'greaterThan',
					formulas: ['0.3'],
					style: { font: { color: { rgb: 'FFFF0000' } } },
					priority: 1,
				},
			],
		});
		sheet.dataValidations.push({
			ranges: [range(1, 3, 4, 3)],
			type: 'list',
			formula1: '"A,B"',
			showDropDown: true,
			allowBlank: true,
		});
		sheet.hyperlinks.push({ range: range(0, 4), target: 'https://example.com/' });
		sheet.comments.push({ address: { row: 0, col: 0 }, author: 'Me', text: 'note' });
		sheet.comments.push({
			address: { row: 1, col: 0 },
			author: 'Me',
			text: 'thread',
			replies: [{ author: 'You', text: 'reply' }],
		});
		const two = wb.sheets[1]!;
		['Name', 'Value'].forEach((value, col) => putCell(two, 0, col, { value }));
		putCell(two, 1, 0, { value: 'x' });
		putCell(two, 1, 1, { value: 1 });
		two.tables.push({
			id: 1,
			name: 'People',
			displayName: 'People',
			range: range(0, 0, 1, 1),
			headerRow: true,
			totalsRow: false,
			columns: [{ name: 'Name' }, { name: 'Value' }],
			styleName: 'TableStyleLight1',
			showRowStripes: true,
			showColumnStripes: false,
			showFirstColumn: false,
			showLastColumn: false,
		});
		wb.definedNames.push({ name: 'Total', formula: 'One!$B$2' });
		wb.properties = { title: 'New', creator: 'Test' };
		return wb;
	}

	it('saves a model built in code and reads the same model back', async () => {
		const wb = build();
		const back = await loadXlsx(await saveXlsx(wb));
		const one = back.sheets[0]!;
		expect(one.rows.get(1)?.get(0)?.value).toBe('a\r\nb\u0001 _x0041_');
		// A scalar formula is stored as a plain `<f>`, which reads back with legacy semantics.
		expect(one.rows.get(2)?.get(1)).toEqual({
			value: 0.5,
			formula: 'B2*2',
			styleId: 3,
			legacyFormula: true,
		});
		expect(one.rows.get(4)?.get(1)?.value).toEqual({ error: '#N/A' });
		expect(one.rows.get(5)?.get(1)).toEqual({
			value: 'x',
			formula: 'IF(TRUE,"x")',
			legacyFormula: true,
		});
		expect(one.rows.get(7)?.get(3)).toEqual({ value: null, styleId: 1 });
		expect(back.styles.map((s) => s.numFmt)).toEqual([
			'General',
			'General',
			'0.0%',
			'[Blue]0.00;[Red]-0.00',
		]);
		expect(back.styles[3]?.alignment).toEqual({ horizontal: 'center', wrapText: true });
		for (const key of [
			'merges',
			'columns',
			'conditionalFormats',
			'dataValidations',
			'hyperlinks',
			'comments',
		] as const)
			expect(comparable(one[key]), key).toEqual(comparable(wb.sheets[0]![key]));
		expect(one.view.freeze).toEqual({ rows: 1, cols: 0 });
		expect(comparable(back.sheets[1]!.tables)).toEqual(
			comparable(wb.sheets[1]!.tables.map((t) => ({ ...t, partName: 'xl/tables/table1.xml' }))),
		);
		expect(back.definedNames).toEqual(wb.definedNames);
		expect(back.properties).toMatchObject({ title: 'New', creator: 'Test' });
	});

	it('renames tables Excel would reject and forces totals-row formulas', async () => {
		const wb = build();
		const table = wb.sheets[1]!.tables[0]!;
		Object.assign(table, {
			name: 'T1',
			displayName: 'T1',
			totalsRow: true,
			range: range(0, 0, 2, 1),
		});
		table.columns[1]!.totalsRowFunction = 'sum';
		const saved = await parts(await saveXlsx(wb));
		expect(text(saved, 'xl/tables/table1.xml')).toContain('name="Table_T1"');
		expect(text(saved, 'xl/worksheets/sheet2.xml')).toContain(
			'<f>SUBTOTAL(109,Table_T1[Value])</f>',
		);
	});

	it('writes worksheet children in schema order', async () => {
		const saved = await parts(await saveXlsx(build()));
		const xml = text(saved, 'xl/worksheets/sheet1.xml');
		const names = [...xml.matchAll(/<(\w+)[\s/>]/g)].map((m) => m[1]);
		const order = [
			'sheetViews',
			'sheetFormatPr',
			'cols',
			'sheetData',
			'mergeCells',
			'conditionalFormatting',
			'dataValidations',
			'hyperlinks',
			'legacyDrawing',
		];
		const positions = order.map((name) => names.indexOf(name));
		expect(positions.every((p) => p >= 0)).toBe(true);
		expect([...positions].sort((a, b) => a - b)).toEqual(positions);
		expect(saved.has('xl/theme/theme1.xml')).toBe(true);
		expect(saved.has('xl/persons/person.xml')).toBe(true);
		expect(text(saved, 'xl/styles.xml')).toMatch(
			/<fills count="2"><fill><patternFill patternType="none"\/><\/fill><fill><patternFill patternType="gray125"\/>/,
		);
	});
});
