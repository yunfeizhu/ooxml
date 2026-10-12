import { describe, expect, it } from 'vitest';
import { createEditSession } from '../edit/session';
import { HEAD, R, X, miniPackage, roundTrip, ws } from './mini-package-fixtures';

const TABLE_SHEET = ws(
	'<row r="1"><c r="A1" t="inlineStr"><is><t>Item</t></is></c><c r="B1" t="inlineStr"><is><t>Amt</t></is></c></row>' +
		'<row r="2"><c r="A2" t="inlineStr"><is><t>a</t></is></c><c r="B2"><v>6</v></c></row>' +
		'<row r="3"><c r="A3" t="inlineStr"><is><t>b</t></is></c><c r="B3"><v>9</v></c></row>' +
		'<row r="4"><c r="A4" t="inlineStr"><is><t>Total</t></is></c><c r="B4"><f>SUBTOTAL(109,T1_[Amt])*2</f><v>30</v></c></row>',
	'',
	'<tableParts count="1"><tablePart r:id="rId1"/></tableParts>',
);
// What Excel writes for a table named "T1" (which reads as a cell reference).
const TABLE_XML = `${HEAD}<table xmlns="${X}" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="xr xr3" xmlns:xr="http://schemas.microsoft.com/office/spreadsheetml/2014/revision" xmlns:xr3="http://schemas.microsoft.com/office/spreadsheetml/2016/revision3" id="1" xr:uid="{9AC660E2-940A-42C8-9458-CF5E3EE4F94D}" name="T1" displayName="T1_" ref="A1:B4" totalsRowCount="1"><autoFilter ref="A1:B3" xr:uid="{9AC660E2-940A-42C8-9458-CF5E3EE4F94D}"><filterColumn colId="1"><customFilters><customFilter operator="greaterThan" val="8"/></customFilters></filterColumn><sortState ref="A2:B3"><sortCondition descending="1" ref="B2:B3"/></sortState></autoFilter><tableColumns count="2"><tableColumn id="1" xr3:uid="{281A89E3-63C6-46BA-B9A9-525F4BDCF0B3}" name="Item" totalsRowLabel="Total"/><tableColumn id="2" xr3:uid="{3C30B12E-A50A-422B-A962-AB4E95350E84}" name="Amt" totalsRowFunction="custom" dataDxfId="0"><totalsRowFormula>SUBTOTAL(109,T1_[Amt])*2</totalsRowFormula></tableColumn></tableColumns><tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>`;

/** Builds a workbook around source table XML to exercise preservation through saving. */
const tablePackage = (xml = TABLE_XML) =>
	miniPackage({
		sheets: [
			{
				name: 'S',
				xml: TABLE_SHEET,
				rels: `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/table" Target="../tables/table1.xml"/></Relationships>`,
			},
		],
		parts: { 'xl/tables/table1.xml': xml },
		contentTypes:
			'<Override PartName="/xl/tables/table1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>',
	});

describe('table round trip', () => {
	it('keeps name and displayName exactly on an unedited round trip', async () => {
		const { wb, again, part } = await roundTrip(await tablePackage());
		expect(wb.sheets[0]?.tables[0]).toMatchObject({ name: 'T1', displayName: 'T1_' });
		expect(again.sheets[0]?.tables[0]).toMatchObject({ name: 'T1', displayName: 'T1_' });
		expect(await part('xl/tables/table1.xml')).toBe(TABLE_XML);
	});

	it('patches only modelled attributes when the table changes', async () => {
		const { part } = await roundTrip(await tablePackage(), (wb) => {
			const table = wb.sheets[0]!.tables[0]!;
			table.styleName = 'TableStyleLight1';
			table.showColumnStripes = true;
		});
		const xml = (await part('xl/tables/table1.xml')) ?? '';
		expect(xml).toContain('name="T1" displayName="T1_"');
		expect(xml).toContain('<customFilter operator="greaterThan" val="8"/>');
		expect(xml).toContain('<sortCondition descending="1" ref="B2:B3"/>');
		expect(xml).toContain('dataDxfId="0"');
		expect(xml).toContain('xr3:uid="{3C30B12E-A50A-422B-A962-AB4E95350E84}"');
		expect(xml).toContain('<totalsRowFormula>SUBTOTAL(109,T1_[Amt])*2</totalsRowFormula>');
		expect(xml).toContain('name="TableStyleLight1"');
		expect(xml).toContain('showColumnStripes="1"');
		expect(xml.startsWith('<?xml')).toBe(true);
	});

	it('keeps custom filter criteria and column metadata after a rename and insertion', async () => {
		const { part } = await roundTrip(await tablePackage(), (wb) => {
			const session = createEditSession(wb);
			session.setCellValue(0, 0, 1, 'Revenue');
			session.insertColumns(0, 1, 1);
		});
		const xml = (await part('xl/tables/table1.xml')) ?? '';
		expect(xml).toContain('<filterColumn colId="2"><customFilters>');
		expect(xml).toContain('<customFilter operator="greaterThan" val="8"/>');
		expect(xml).toMatch(/<tableColumn[^>]*id="2"[^>]*name="Revenue"[^>]*dataDxfId="0"/);
		expect(xml).toContain('xr3:uid="{3C30B12E-A50A-422B-A962-AB4E95350E84}"');
	});

	it('keeps a zero source column id, filter and metadata after a style change', async () => {
		const source = TABLE_XML.replace('<tableColumn id="2"', '<tableColumn id="0"');
		const { wb, again, part } = await roundTrip(await tablePackage(source), (wb) => {
			createEditSession(wb).updateTable(0, 'T1', { styleName: 'TableStyleLight1' });
		});
		expect(wb.sheets[0]?.tables[0]?.columns[1]?.sourceId).toBe(0);
		expect(again.sheets[0]?.tables[0]?.columns[1]?.sourceId).toBe(0);
		const xml = (await part('xl/tables/table1.xml')) ?? '';
		expect(xml).toContain('<filterColumn colId="1"><customFilters>');
		expect(xml).toContain('<customFilter operator="greaterThan" val="8"/>');
		expect(xml).toMatch(/<tableColumn[^>]*id="0"[^>]*name="Amt"[^>]*dataDxfId="0"/);
		expect(xml).toContain('xr3:uid="{3C30B12E-A50A-422B-A962-AB4E95350E84}"');
		expect(xml).toContain('<totalsRowFormula>SUBTOTAL(109,T1_[Amt])*2</totalsRowFormula>');
	});

	it('moves a zero-id column filter with its source metadata after rename and insertion', async () => {
		const source = TABLE_XML.replace('<tableColumn id="2"', '<tableColumn id="0"');
		const { again, part } = await roundTrip(await tablePackage(source), (wb) => {
			const session = createEditSession(wb);
			session.setCellValue(0, 0, 1, 'Revenue');
			session.insertColumns(0, 1, 1);
		});
		expect(again.sheets[0]?.tables[0]?.columns.map((column) => column.sourceId)).toEqual([1, 2, 0]);
		const xml = (await part('xl/tables/table1.xml')) ?? '';
		expect(xml).toContain('<filterColumn colId="2"><customFilters>');
		expect(xml).toContain('<customFilter operator="greaterThan" val="8"/>');
		expect(xml).toMatch(/<tableColumn[^>]*id="0"[^>]*name="Revenue"[^>]*dataDxfId="0"/);
		expect(xml).toContain('xr3:uid="{3C30B12E-A50A-422B-A962-AB4E95350E84}"');
	});

	it('removes the filter and metadata when the zero-id source column is deleted', async () => {
		const source = TABLE_XML.replace('<tableColumn id="2"', '<tableColumn id="0"');
		const { again, part } = await roundTrip(await tablePackage(source), (wb) => {
			createEditSession(wb).deleteColumns(0, 1, 1);
		});
		expect(again.sheets[0]?.tables[0]?.columns.map((column) => column.sourceId)).toEqual([1]);
		const xml = (await part('xl/tables/table1.xml')) ?? '';
		expect(xml).not.toContain('<filterColumn');
		expect(xml).not.toContain('xr3:uid="{3C30B12E-A50A-422B-A962-AB4E95350E84}"');
	});

	it('stretches the sort state when rows are added and drops filters past the width', async () => {
		const { part } = await roundTrip(await tablePackage(), (wb) => {
			const table = wb.sheets[0]!.tables[0]!;
			table.range = { start: table.range.start, end: { row: 5, col: 1 } };
		});
		const xml = (await part('xl/tables/table1.xml')) ?? '';
		expect(xml).toContain('ref="A1:B6"');
		expect(xml).toContain('<autoFilter ref="A1:B5"');
		expect(xml).toContain('<sortState ref="A2:B5"><sortCondition descending="1" ref="B2:B5"/>');
	});

	it('makes a user-edited name safe and writes it to both attributes', async () => {
		const { part } = await roundTrip(await tablePackage(), (wb) => {
			const table = wb.sheets[0]!.tables[0]!;
			table.name = 'AB12';
			table.displayName = 'AB12';
		});
		const xml = (await part('xl/tables/table1.xml')) ?? '';
		expect(xml).toContain('name="Table_AB12" displayName="Table_AB12"');
		expect(xml).toContain('dataDxfId="0"');
	});
});
