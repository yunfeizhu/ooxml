import { expect, test } from '@playwright/test';
import { parseVsdx } from 'ooxml-core/visio';
import type { VisioViewerElement } from 'ooxml-ui/visio';
import { createVsdxFixture } from './fixture.mjs';
import { openDemo } from './demo-page';

test('Text dialog, Text Block tool, Symbol, Field and Spelling edit and export text', async ({
	page,
}) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.setViewportSize({ width: 1600, height: 1000 });
	await openDemo(page);
	const viewer = page.locator('visio-viewer');
	await expect(viewer.locator('svg.paper')).toContainText('Release workflow');
	await page.locator('#file').setInputFiles({
		name: 'Text.vsdx',
		mimeType: 'application/vnd.ms-visio.drawing',
		buffer: await createVsdxFixture('Text target'),
	});
	await expect(page.locator('#file-name')).toHaveText('Text.vsdx');
	const paper = viewer.locator('svg.paper');
	await expect(paper).toContainText('Text target');
	const status = viewer.locator('[data-status]');
	await paper.locator('[data-shape-id]').first().click();

	// Home > Font launcher: the Text dialog writes Char.Case and draws it.
	await viewer.locator('office-ui-ribbon-group[launcher="font-dialog"] .launcher').click();
	const dialog = viewer.locator('.text-dialog');
	await expect(dialog.locator('[data-text-tab="font"]')).toHaveAttribute('aria-selected', 'true');
	await dialog.locator('[name="text-textCase"]').selectOption('all-caps');
	await dialog.locator('[data-text-tab="character"]').click();
	await dialog.locator('[name="text-letterSpacing"]').fill('2');
	await dialog.locator('[label="OK"] button').click();
	await expect(status).toHaveText(/Updated text formatting/);
	await expect(paper).toContainText('TEXT TARGET');
	await expect(paper.locator('tspan[letter-spacing]')).toHaveCount(1);

	// Insert > Symbol appends through a range edit.
	await viewer.getByRole('tab', { name: 'Insert', exact: true }).click();
	await viewer.locator('[command="symbol"] button').click();
	await viewer.locator('.symbol-dialog office-ui-symbol-picker .symbol').first().click();
	await expect(status).toHaveText(/Inserted ©/);
	await viewer.locator('.symbol-dialog [label="Close"] button').click();
	await expect(paper).toContainText('TEXT TARGET©');

	// Insert > Field: a page-name field rendered from its evaluated value.
	await viewer.locator('[command="field"] button').click();
	const field = viewer.locator('.field-dialog');
	await field.locator('[name="field-category"]').selectOption('page');
	await field.locator('[label="OK"] button').click();
	await expect(status).toHaveText(/Inserted a Page Info field/);
	await expect(paper).toContainText('TEXT TARGET©IMPORTED PAGE');

	// Home > Text Block (Ctrl+Shift+4): drag the text block frame.
	await viewer.getByRole('tab', { name: 'Home', exact: true }).click();
	await viewer.locator('[command="text-block"] button').click();
	await expect(viewer.locator('[command="text-block"]')).toHaveAttribute('pressed', 'true');
	const frame = paper.locator('[data-text-block-frame]');
	await expect(frame).toHaveCount(1);
	const box = (await frame.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 30, { steps: 5 });
	await page.mouse.up();
	await expect(status).toHaveText(/Moved the text block/);
	await page.screenshot({ path: test.info().outputPath('text-features.png') });
	await page.keyboard.press('Escape');
	await expect(viewer.locator('[command="text-block"]')).toHaveAttribute('pressed', 'false');
	await expect(frame).toHaveCount(0);

	const bytes = await viewer.evaluate((node) =>
		Array.from((node as VisioViewerElement).exportVsdx().bytes),
	);
	const text = (await parseVsdx(new Uint8Array(bytes))).pages[0]!.shapes[0]!.text;
	expect(text.plainText).toBe('Text target©Imported page');
	expect(text.fields).toHaveLength(1);
	expect(text.runs[0]).toMatchObject({ textCase: 'all-caps' });
	expect(text.transform[4]).not.toBe(0);

	// Review: Spelling opens the text editor with browser spell checking; no thesaurus.
	await viewer.getByRole('tab', { name: 'Review', exact: true }).click();
	await expect(viewer.locator('[command="thesaurus"] button')).toBeDisabled();
	await viewer.locator('[command="spelling"] button').click();
	await expect(status).toHaveText(/browser's spell checker/);
	await expect(viewer.locator('#edit-text')).toHaveAttribute('spellcheck', 'true');
	await expect(viewer.locator('#edit-text')).toBeFocused();
	expect(errors).toEqual([]);
});
