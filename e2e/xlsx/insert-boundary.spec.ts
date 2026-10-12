import { expect, test } from '@playwright/test';
import { getCell, loadXlsx, type Workbook } from 'ooxml-core/xlsx';
import { editor, editorProperty, FRAMEWORKS, newWorkbook, pageErrors, ribbon } from './helpers';

interface BoundaryEditor extends HTMLElement {
	workbook: Workbook;
	select(ref: string): void;
	saveBytes(): Promise<Uint8Array>;
}

for (const framework of FRAMEWORKS) {
	for (const [selection, row, col] of [
		['1:1', 1_048_575, 0],
		['A:A', 0, 16_383],
	] as const)
		test(`${framework}: insertion of ${selection} preserves non-empty boundary cells`, async ({
			page,
		}) => {
			const errors = pageErrors(page);
			await newWorkbook(page, framework);
			await editor(page).evaluate(
				(node, { selection, row, col }) => {
					const element = node as BoundaryEditor;
					const workbook = element.workbook;
					const sheet = workbook.sheets[0]!;
					sheet.rows.set(row, new Map([[col, { value: 'keep' }]]));
					element.workbook = workbook;
					element.addEventListener('workbook-error', (event) => {
						element.dataset.insertError = (
							event as CustomEvent<{ message: string }>
						).detail.message;
					});
					element.select(selection);
				},
				{ selection, row, col },
			);
			await ribbon(page).locator('[data-command="cells.insert-split"]').first().click();
			await expect(editor(page)).toHaveAttribute('data-insert-error', /pushed off the sheet/);
			await expect(editor(page)).toContainText(
				'Cannot insert cells: non-empty cells would be pushed off the sheet.',
			);
			expect(await editorProperty(page, 'dirty')).toBe(false);
			const bytes = await editor(page).evaluate(async (node) =>
				Array.from(await (node as BoundaryEditor).saveBytes()),
			);
			const saved = await loadXlsx(new Uint8Array(bytes));
			expect(getCell(saved.sheets[0]!, row, col)?.value).toBe('keep');
			expect(errors).toEqual([]);
		});
	test(`${framework}: column insertion keeps and clips trailing column formatting`, async ({
		page,
	}) => {
		const errors = pageErrors(page);
		await newWorkbook(page, framework);
		await editor(page).evaluate((node) => {
			const element = node as BoundaryEditor;
			const workbook = element.workbook;
			const sheet = workbook.sheets[0]!;
			sheet.columns.push({ min: 2, max: 16_383, width: 12 });
			sheet.rows.set(0, new Map([[0, { value: 'keep' }]]));
			element.workbook = workbook;
			element.select('A:A');
		});
		await ribbon(page).locator('[data-command="cells.insert-split"]').first().click();
		await expect.poll(() => editorProperty(page, 'dirty')).toBe(true);
		const bytes = await editor(page).evaluate(async (node) =>
			Array.from(await (node as BoundaryEditor).saveBytes()),
		);
		const saved = await loadXlsx(new Uint8Array(bytes));
		expect(saved.sheets[0]!.columns).toMatchObject([{ min: 3, max: 16_383, width: 12 }]);
		expect(getCell(saved.sheets[0]!, 0, 1)?.value).toBe('keep');
		expect(errors).toEqual([]);
	});
}
