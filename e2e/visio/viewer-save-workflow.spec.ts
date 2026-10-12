import { test, expect, type Page } from '@playwright/test';
import { downloadCopy, history, taskPane } from './ribbon';
import JSZip from 'jszip';
import { createVsdxFixture } from './fixture.mjs';
import { openDemo } from './demo-page';

async function savedBytes(page: Page): Promise<Buffer> {
	const command = await downloadCopy(page.locator('visio-viewer'));
	const next = page.waitForEvent('download');
	await command.click();
	const download = await next,
		stream = await download.createReadStream();
	const chunks: Buffer[] = [];
	for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
	return Buffer.concat(chunks);
}
async function open(page: Page, bytes: Buffer, name: string) {
	await page
		.locator('#file')
		.setInputFiles({ name, mimeType: 'application/vnd.ms-visio.drawing', buffer: bytes });
	await expect(page.locator('#file-name')).toHaveText(name);
}

/** The Size & Position window's field for one value, opened for the selected shape. */
async function sizeField(page: Page, name: string) {
	const viewer = page.locator('visio-viewer');
	const pane = viewer.getByRole('region', { name: 'Size & Position', exact: true });
	if (!(await pane.isVisible())) await taskPane(viewer, 'Size & Position');
	return pane.getByRole('spinbutton', { name, exact: true });
}

test('a text draft survives moving the shape, and saved copies keep the edits and unknown parts', async ({
	page,
}) => {
	const zip = await JSZip.loadAsync(await createVsdxFixture('Original text'));
	const preserved = Buffer.from([1, 9, 0, 255, 42]);
	zip.file('unknown/preserved.bin', preserved);
	const original = await zip.generateAsync({ type: 'nodebuffer' });
	await openDemo(page);
	await open(page, original, 'roundtrip.vsdx');
	const viewer = page.locator('visio-viewer');
	// Start typing on the shape, then move it from Size & Position before saving the text.
	await viewer.locator('svg.paper [data-shape-id="1"]').dblclick();
	const editor = viewer.locator('#edit-text');
	await expect(editor).toBeFocused();
	await editor.fill('Unapplied text draft');
	const x = await sizeField(page, 'X (in)');
	await x.fill('5');
	await x.press('Enter');
	await expect(page.locator('#edit-label')).toHaveText('EDITED COPY');
	await expect(editor).toHaveValue('Unapplied text draft');
	await history(viewer, 'Undo').click();
	await expect(page.locator('#edit-label')).toHaveText('ORIGINAL');
	await expect(editor).toHaveValue('Unapplied text draft');
	await history(viewer, 'Redo').click();
	await expect(page.locator('#edit-label')).toHaveText('EDITED COPY');
	await expect(editor).toHaveValue('Unapplied text draft');
	// Esc keeps the typed text.
	await editor.press('Escape');
	await expect(editor).toHaveCount(0);
	await expect(viewer.locator('[data-shape-id="1"] text')).toContainText('Unapplied text draft');
	const copy = await savedBytes(page),
		reopened = await JSZip.loadAsync(copy);
	expect(await reopened.file('unknown/preserved.bin')!.async('nodebuffer')).toEqual(preserved);
	expect(await reopened.file('visio/pages/page1.xml')!.async('string')).toMatch(/N="PinX" V="5"/);
	await open(page, copy, 'reopened-geometry.vsdx');
	await expect(viewer.locator('[data-shape-id="1"] text')).toContainText('Unapplied text draft');
});

test('a refused move keeps the text draft, the history and a byte-exact original copy', async ({
	page,
}) => {
	const zip = await JSZip.loadAsync(await createVsdxFixture('Protected shape'));
	const part = zip.file('visio/pages/page1.xml')!;
	zip.file(
		'visio/pages/page1.xml',
		(await part.async('string')).replace(
			'<Cell N="Width"',
			'<Cell N="LockMoveX" V="1"/><Cell N="Width"',
		),
	);
	const original = await zip.generateAsync({ type: 'nodebuffer' });
	await openDemo(page);
	await open(page, original, 'protected.vsdx');
	const viewer = page.locator('visio-viewer');
	const shape = viewer.locator('svg.paper [data-shape-id="1"]');
	const before = await shape.getAttribute('transform');
	await shape.dblclick();
	const editor = viewer.locator('#edit-text');
	await expect(editor).toBeFocused();
	await editor.fill('Keep unapplied text');
	const x = await sizeField(page, 'X (in)');
	await x.fill('5');
	await x.press('Enter');
	// The lock is reported in plain words, with no internal error code.
	const refusal = viewer.locator('[data-size-error]');
	await expect(refusal).toBeVisible();
	await expect(refusal).not.toContainText(/EDIT_|LIMIT_/);
	await expect(editor).toHaveValue('Keep unapplied text');
	await expect(page.locator('#edit-label')).toHaveText('ORIGINAL');
	await expect(history(viewer, 'Undo')).toBeDisabled();
	await expect(shape).toHaveAttribute('transform', before!);
	expect(await savedBytes(page)).toEqual(original);
});
