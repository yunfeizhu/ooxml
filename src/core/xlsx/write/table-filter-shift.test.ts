import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { parseRange } from '../address';
import { loadXlsx } from '../read/load';
import { saveXlsx } from './save';
import { HEAD, R, X, miniPackage, ws } from './mini-package-fixtures';
import { createEditSession } from '../edit/session';
import type { Workbook } from '../model';

/** Loads a complete table package with a criterion on one original column. */
async function filteredTable(filterCol = 2) {
	const headers = ['Item', 'Qty', 'Amt'];
	const rows =
		'<row r="1">' +
		headers
			.map(
				(text, c) =>
					`<c r="${String.fromCharCode(65 + c)}1" t="inlineStr"><is><t>${text}</t></is></c>`,
			)
			.join('') +
		'</row>' +
		'<row r="2"><c r="A2" t="inlineStr"><is><t>a</t></is></c><c r="B2"><v>2</v></c><c r="C2"><v>20</v></c></row>' +
		'<row r="3"><c r="A3" t="inlineStr"><is><t>b</t></is></c><c r="B3"><v>3</v></c><c r="C3"><v>30</v></c></row>';
	const table = `${HEAD}<table xmlns="${X}" id="1" name="Sales" displayName="Sales" ref="A1:C3"><autoFilter ref="A1:C3"><filterColumn colId="${filterCol}"><filters><filter val="20"/></filters></filterColumn></autoFilter><tableColumns count="3">${headers.map((name, i) => `<tableColumn id="${i + 1}" name="${name}"/>`).join('')}</tableColumns></table>`;
	return loadXlsx(
		await miniPackage({
			sheets: [
				{
					name: 'Data',
					xml: ws(rows, '', '<tableParts count="1"><tablePart r:id="rId1"/></tableParts>'),
					rels: `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/table" Target="../tables/table1.xml"/></Relationships>`,
				},
			],
			parts: { 'xl/tables/table1.xml': table },
			contentTypes:
				'<Override PartName="/xl/tables/table1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>',
		}),
	);
}
/** Reads the actual saved table part so criteria are checked after serialization. */
async function tableXml(wb: Workbook) {
	const zip = await JSZip.loadAsync(await saveXlsx(wb));
	return (await zip.file('xl/tables/table1.xml')?.async('string')) ?? '';
}
/** Extracts the saved zero-based filter-column indexes. */
const filterIds = (xml: string) =>
	[...xml.matchAll(/<filterColumn[^>]*colId="(\d+)"/g)].map((m) => Number(m[1]));

describe('table filter identity after structural edits', () => {
	it('keeps the original filter on an unedited save', async () => {
		expect(filterIds(await tableXml(await filteredTable()))).toEqual([2]);
	});
	it('keeps the Amt filter on Amt when a middle column is inserted', async () => {
		const wb = await filteredTable();
		createEditSession(wb).insertColumns(0, 1, 1);
		expect(wb.sheets[0]?.tables[0]?.columns.map((c) => c.name)).toEqual([
			'Item',
			'Column1',
			'Qty',
			'Amt',
		]);
		expect(filterIds(await tableXml(wb))).toEqual([3]);
	});
	it('keeps the Amt filter when an earlier column is deleted', async () => {
		const wb = await filteredTable();
		createEditSession(wb).deleteColumns(0, 0, 1);
		expect(wb.sheets[0]?.tables[0]?.columns.map((c) => c.name)).toEqual(['Qty', 'Amt']);
		expect(filterIds(await tableXml(wb))).toEqual([1]);
	});
	it('removes the Qty filter when Qty itself is deleted', async () => {
		const wb = await filteredTable(1);
		createEditSession(wb).deleteColumns(0, 1, 1);
		expect(wb.sheets[0]?.tables[0]?.columns.map((c) => c.name)).toEqual(['Item', 'Amt']);
		expect(filterIds(await tableXml(wb))).toEqual([]);
	});
});

describe('source column identity', () => {
	it('keeps filters and column metadata through a header rename and insertion', async () => {
		const wb = await filteredTable();
		const s = createEditSession(wb);
		s.setCellValue(0, 0, 2, 'Revenue');
		s.insertColumns(0, 1, 1);
		const xml = await tableXml(wb);
		expect(filterIds(xml)).toEqual([3]);
		expect(xml).toContain('id="3" name="Revenue"');
		s.undo();
		expect(filterIds(await tableXml(wb))).toEqual([2]);
		s.redo();
		expect(filterIds(await tableXml(wb))).toEqual([3]);
	});
	it('does not transfer a removed filter to a replacement column of the same width', async () => {
		const wb = await filteredTable(1);
		const s = createEditSession(wb);
		s.deleteColumns(0, 1, 1);
		s.insertColumns(0, 1, 1);
		expect(filterIds(await tableXml(wb))).toEqual([]);
	});
	it('remaps a filter when resize removes the first column', async () => {
		const wb = await filteredTable();
		createEditSession(wb).resizeTable(0, 'Sales', parseRange('B1:C3')!);
		expect(filterIds(await tableXml(wb))).toEqual([1]);
	});
	it('keeps source identity when updateTable replaces column property objects', async () => {
		const wb = await filteredTable();
		const s = createEditSession(wb);
		s.updateTable(0, 'Sales', {
			columns: wb.sheets[0]!.tables[0]!.columns.map((column) => ({
				name: column.name === 'Amt' ? 'Revenue' : column.name,
			})),
		});
		expect(filterIds(await tableXml(wb))).toEqual([2]);
		s.insertColumns(0, 1, 1);
		expect(filterIds(await tableXml(wb))).toEqual([3]);
	});
	it('does not revive filters after all original columns have been replaced', async () => {
		const wb = await filteredTable();
		const s = createEditSession(wb);
		s.insertColumns(0, 1, 3);
		s.deleteColumns(0, 0, 1);
		s.deleteColumns(0, 3, 2);
		expect(wb.sheets[0]?.tables[0]?.columns).toHaveLength(3);
		expect(filterIds(await tableXml(wb))).toEqual([]);
	});
	it('retains the remapped filter after save, reload and a second insertion', async () => {
		const wb = await filteredTable();
		createEditSession(wb).insertColumns(0, 1, 1);
		const again = await loadXlsx(await saveXlsx(wb));
		createEditSession(again).insertColumns(0, 1, 1);
		expect(filterIds(await tableXml(again))).toEqual([4]);
	});
});
