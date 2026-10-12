import { expect, test, type Locator } from '@playwright/test';
import type { VisioViewerElement } from 'ooxml-ui/visio';
import { replaceFixture } from '../../src/ui/src/visio/__fixtures__/replace-viewer';
import { downloadCopy, ribbonGroup } from './ribbon';
import { openDemo } from './demo-page';

const idle = (viewer: Locator) =>
	expect
		.poll(() =>
			viewer.evaluate((node) => {
				const state = (node as VisioViewerElement).controller.state;
				return state.loading || state.edit.busy;
			}),
		)
		.toBe(false);
async function inventory(viewer: Locator) {
	await idle(viewer);
	return viewer.evaluate((node) => {
		const controller = (node as VisioViewerElement).controller;
		return {
			bytes: Array.from(controller.exportVsdx().bytes),
			page: controller.state.pageIndex,
			selected: controller.state.selectedShapes.map((shape) => [shape.pageId, shape.id]),
			texts: controller.state.document!.pages.map((page) =>
				page.shapes.map((shape) => shape.text.plainText),
			),
		};
	});
}
async function scope(viewer: Locator, name: string) {
	const select = viewer.getByRole('combobox', { name: 'Search scope', exact: true });
	await select.click();
	await viewer.getByRole('option', { name, exact: true }).click();
}
async function selectAll(viewer: Locator) {
	await viewer.getByRole('tab', { name: 'Home', exact: true }).click();
	await ribbonGroup(viewer, 'Editing');
	await viewer.getByRole('button', { name: 'Select', exact: true }).click();
	await viewer.locator('[command="select-all"]').click();
}

for (const framework of ['vanilla', 'react', 'vue', 'angular', 'svelte', 'solid']) {
	test(`${framework}: literal Find and Replace retains scoped intent and atomic source history`, async ({
		page,
	}) => {
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.setViewportSize({ width: 1600, height: 1000 });
		await openDemo(
			page,
			framework === 'vanilla' ? '/demo/?sample=1' : `/demo-${framework}/?sample=1`,
		);
		const viewer = page.locator('visio-viewer');
		const load = async (bytes: Uint8Array) => {
			await page.locator('#file').setInputFiles({
				name: 'replace.vsdx',
				mimeType: 'application/vnd.ms-visio.drawing',
				buffer: Buffer.from(bytes),
			});
			await expect(page.locator('#file-name')).toHaveText('replace.vsdx');
			await idle(viewer);
		};
		await load(await replaceFixture());
		const original = await inventory(viewer);
		await viewer.getByRole('tab', { name: 'Home', exact: true }).click();
		await ribbonGroup(viewer, 'Editing');
		await viewer.getByRole('button', { name: 'Find', exact: true }).click();
		await viewer.locator('[command="replace"]').click();
		const bar = viewer.locator('office-ui-find-bar'),
			query = viewer.getByRole('searchbox', { name: 'Search diagram text', exact: true }),
			replacement = viewer.getByRole('textbox', { name: 'Replace with', exact: true }),
			status = bar.locator('[role="status"]');
		await expect(bar).toHaveAttribute('replace-mode', '');
		await expect(bar.getByRole('checkbox', { name: 'Match case' })).toBeChecked();
		await expect(bar.getByRole('checkbox', { name: 'Match case' })).toBeDisabled();
		await query.fill('cat');
		await replacement.fill('dog');
		await expect(status).toHaveText('4 occurrences');
		await bar.getByRole('button', { name: 'Next occurrence', exact: true }).click();
		await expect(status).toHaveText('1 of 4 occurrences');
		await bar.getByRole('button', { name: 'Replace', exact: true }).click();
		await expect(status).toHaveText('Replaced 1 occurrence.');
		const first = await inventory(viewer);
		expect(first.texts).toEqual([['dog cat CAT', 'cat Ω cat'], ['cat tail']]);
		expect(first.selected).toEqual([['1', '1']]);
		await viewer.locator('.qat [data-command="undo"]').click();
		expect((await inventory(viewer)).bytes).toEqual(original.bytes);
		await viewer.locator('.qat [data-command="redo"]').click();
		expect((await inventory(viewer)).bytes).toEqual(first.bytes);
		await expect(query).toHaveValue('cat');
		await expect(replacement).toHaveValue('dog');
		await selectAll(viewer);
		await scope(viewer, 'Selection');
		await expect(status).toHaveText('3 occurrences');
		await bar.getByRole('button', { name: 'Next occurrence', exact: true }).click();
		expect((await inventory(viewer)).selected).toEqual([['1', '1']]);
		await bar.getByRole('button', { name: 'Replace All', exact: true }).click();
		await expect(status).toHaveText('Replaced 3 occurrences.');
		const selected = await inventory(viewer);
		expect(selected.texts).toEqual([['dog dog CAT', 'dog Ω dog'], ['cat tail']]);
		await viewer.locator('.qat [data-command="undo"]').click();
		expect((await inventory(viewer)).bytes).toEqual(first.bytes);
		await viewer.locator('.qat [data-command="redo"]').click();
		expect((await inventory(viewer)).bytes).toEqual(selected.bytes);
		await scope(viewer, 'All pages');
		await expect(status).toHaveText('1 occurrence');
		await bar.getByRole('button', { name: 'Next occurrence', exact: true }).click();
		expect((await inventory(viewer)).page).toBe(1);
		expect((await inventory(viewer)).selected).toEqual([['2', '1']]);
		await replacement.fill(' <&> Ω\n\n');
		await bar.getByRole('button', { name: 'Replace', exact: true }).click();
		await expect(status).toHaveText('Replaced 1 occurrence.');
		const all = await inventory(viewer);
		expect(all.texts).toEqual([['dog dog CAT', 'dog Ω dog'], [' <&> Ω\n\n tail']]);
		await expect(query).toHaveValue('cat');
		await expect(replacement).toHaveValue(' <&> Ω\n\n');
		const downloadButton = await downloadCopy(viewer),
			pending = page.waitForEvent('download');
		await downloadButton.click();
		const download = await pending;
		await page.locator('#file').setInputFiles((await download.path())!);
		await idle(viewer);
		expect((await inventory(viewer)).texts).toEqual(all.texts);
		await viewer.locator('.viewport').focus();
		await page.keyboard.press('ControlOrMeta+f');
		await expect(bar).not.toHaveAttribute('replace-mode', '');
		await expect(status).toHaveText('1 matching shapes');
		await viewer.locator('.viewport').focus();
		await page.keyboard.press('ControlOrMeta+h');
		await expect(bar).toHaveAttribute('replace-mode', '');
		await expect(status).toHaveText('0 occurrences');
		await load(await replaceFixture(true));
		await query.fill('cat');
		await replacement.fill('dog');
		await scope(viewer, 'All pages');
		const protectedSource = await inventory(viewer);
		await expect(status).toHaveText('5 occurrences');
		await bar.getByRole('button', { name: 'Replace All', exact: true }).click();
		await idle(viewer);
		await expect(bar.locator('[role="alert"]')).toContainText('protection is active');
		expect((await inventory(viewer)).bytes).toEqual(protectedSource.bytes);
		await load(await replaceFixture());
		await query.fill('cat');
		await replacement.fill('dog');
		const beforeCancelled = await inventory(viewer);
		await viewer.evaluate((node) => {
			const controller = (node as VisioViewerElement).controller;
			let stop = () => {};
			stop = controller.subscribe((state) => {
				if (state.edit.busy) {
					stop();
					controller.setPage(1);
				}
			});
		});
		await bar.getByRole('button', { name: 'Replace All', exact: true }).click();
		await idle(viewer);
		expect((await inventory(viewer)).bytes).toEqual(beforeCancelled.bytes);
		expect((await inventory(viewer)).page).toBe(1);
		expect((await inventory(viewer)).texts).toEqual(beforeCancelled.texts);
		expect(errors).toEqual([]);
	});
}
