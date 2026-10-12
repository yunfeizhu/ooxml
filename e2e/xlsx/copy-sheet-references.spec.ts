import { expect, test } from '@playwright/test';
import { getCell, loadXlsx, type Workbook } from 'ooxml-core/xlsx';
import { editor, FRAMEWORKS, newWorkbook, pageErrors, ribbon, sheetTabs } from './helpers';

interface CopyEditor extends HTMLElement {
	workbook: Workbook;
	select(ref: string): void;
	saveBytes(): Promise<Uint8Array>;
}

for (const framework of FRAMEWORKS) {
	test(`${framework}: a copied sheet recalculates its own explicit references`, async ({
		page,
	}) => {
		const errors = pageErrors(page);
		await newWorkbook(page, framework);
		await editor(page).evaluate((node) => {
			const element = node as CopyEditor;
			const workbook = element.workbook;
			const source = workbook.sheets[0]!;
			source.name = 'Source';
			source.rows.set(
				0,
				new Map([
					[0, { value: 10 }],
					[1, { value: 20, formula: 'Source!A1*2' }],
					[2, { value: 20, formula: 'A1*2' }],
				]),
			);
			source.dataValidations.push({
				ranges: [{ start: { row: 0, col: 3 }, end: { row: 0, col: 3 } }],
				type: 'whole',
				operator: 'lessThanOrEqual',
				formula1: 'Source!$A$1',
				showErrorMessage: true,
			});
			const outside = structuredClone(source);
			outside.name = 'Outside';
			outside.sheetId = 2;
			outside.rows = new Map([[0, new Map([[0, { value: 30, formula: 'Source!A1*3' }]])]]);
			outside.dataValidations = [];
			workbook.sheets.push(outside);
			element.workbook = workbook;
		});
		await sheetTabs(page)
			.getByRole('tab', { name: 'Source', exact: true })
			.click({ button: 'right' });
		await editor(page)
			.getByRole('menuitem', { name: /Move or Copy/ })
			.click();
		const dialog = editor(page).locator('[data-dialog="move-copy-sheet"]');
		await dialog.getByLabel('Create a copy', { exact: true }).check();
		await dialog.getByRole('button', { name: 'OK', exact: true }).click();
		await expect(dialog).toBeHidden();
		await expect(
			sheetTabs(page).getByRole('tab', { name: 'Source (2)', exact: true }),
		).toBeVisible();
		await editor(page).evaluate((node) => {
			const element = node as CopyEditor;
			const workbook = element.workbook;
			workbook.sheets[1]!.rows.get(0)!.get(0)!.value = 99;
			element.workbook = workbook;
			element.select("'Source (2)'!A1");
		});
		await ribbon(page).getByRole('tab', { name: 'Formulas', exact: true }).click();
		await ribbon(page).locator('[data-command="formulas.calculate-now"]').first().click();
		const bytes = await editor(page).evaluate(async (node) =>
			Array.from(await (node as CopyEditor).saveBytes()),
		);
		const loaded = await loadXlsx(new Uint8Array(bytes));
		expect(loaded.sheets.map((s) => s.name)).toEqual(['Source', 'Source (2)', 'Outside']);
		expect(getCell(loaded.sheets[1]!, 0, 0)?.value).toBe(99);
		expect(getCell(loaded.sheets[1]!, 0, 1)?.formula).toBe("'Source (2)'!A1*2");
		expect(getCell(loaded.sheets[1]!, 0, 1)?.value).toBe(198);
		expect(getCell(loaded.sheets[1]!, 0, 2)?.value).toBe(198);
		expect(loaded.sheets[1]!.dataValidations[0]?.formula1).toBe("'Source (2)'!$A$1");
		expect(getCell(loaded.sheets[0]!, 0, 0)?.value).toBe(10);
		expect(getCell(loaded.sheets[2]!, 0, 0)?.value).toBe(30);
		expect(errors).toEqual([]);
	});
}
