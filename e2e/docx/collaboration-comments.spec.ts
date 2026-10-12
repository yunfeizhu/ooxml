import { expect, test } from '@playwright/test';
import JSZip from 'jszip';
import type { DocxEditorElement } from '../../viewers/docx/packages/web-component/src';

for (const framework of ['vanilla', 'react', 'vue', 'angular', 'svelte', 'solid']) {
	test(`${framework}: independent concurrent picture comments export and undo without reviving peer deletions`, async ({
		page,
	}) => {
		const errors: string[] = [];
		await page.exposeFunction('inlineCommentError', (message: string) => errors.push(message));
		await page.addInitScript(() =>
			document.addEventListener('document-error', (event) => {
				void (
					window as unknown as { inlineCommentError(message: string): Promise<void> }
				).inlineCommentError((event as CustomEvent<Error>).detail.message);
			}),
		);
		page.on('pageerror', (error) => errors.push(error.message));
		await page.goto(`/collaboration.html?framework=${framework}&mode=yjs`);
		const a = page.locator('#peer-a docx-editor');
		const b = page.locator('#peer-b docx-editor');
		for (const peer of [a, b])
			await expect(peer.locator('.ProseMirror')).toContainText('Shared document');
		await expect(page.locator('#collaboration-status')).toContainText('Synced');
		await a.locator('.ProseMirror').click();
		await page.keyboard.press('Control+End');
		const picture = Buffer.from(
			await page.evaluate(() => {
				const canvas = document.createElement('canvas');
				canvas.width = 2;
				canvas.height = 2;
				const context = canvas.getContext('2d')!;
				context.fillStyle = '#2563eb';
				context.fillRect(0, 0, 2, 2);
				return canvas.toDataURL('image/png').split(',')[1]!;
			}),
			'base64',
		);
		await a
			.locator('.dve-picture-input')
			.setInputFiles({ name: 'commented.png', mimeType: 'image/png', buffer: picture });
		await expect
			.poll(async () => ({ pictures: await b.locator('img[data-docx-image]').count(), errors }))
			.toEqual({ pictures: 1, errors: [] });
		await expect(b.locator('img[data-docx-image]')).toHaveAttribute('src', /^blob:/);
		for (const peer of [a, b]) {
			await peer.locator('.dve-picture').click();
			await peer.locator('office-ui-ribbon-actions [part="comments"]').click();
		}
		const paneA = a.locator('.dve-comments-panel');
		const paneB = b.locator('.dve-comments-panel');
		await page.getByRole('button', { name: 'Pause delivery', exact: true }).click();
		for (const [pane, text] of [
			[paneA, 'A picture comment'],
			[paneB, 'B picture comment'],
		] as const) {
			await pane.getByRole('textbox', { name: 'New comment', exact: true }).fill(text);
			await pane.getByRole('button', { name: 'Add comment', exact: true }).click();
		}
		await page.getByRole('button', { name: 'Resume delivery', exact: true }).click();
		const anchorIds = () =>
			b.evaluate(
				(element) =>
					(element as DocxEditorElement)
						.documentModel!.blocks.flatMap((block) =>
							block.type === 'paragraph' ? block.runs : [],
						)
						.find((run) => run.image)?.commentIds ?? [],
			);
		await expect.poll(async () => (await anchorIds()).length).toBe(2);
		for (const peer of [a, b]) {
			const pane = peer.locator('.dve-comments-panel');
			await expect(pane).toContainText('A picture comment');
			await expect(pane).toContainText('B picture comment');
			const bytes = await peer.evaluate(async (element) =>
				Array.from(await (element as DocxEditorElement).saveBytes()),
			);
			const zip = await JSZip.loadAsync(new Uint8Array(bytes));
			const xml = await zip.file('word/document.xml')!.async('string');
			expect(xml.match(/<w:commentRangeStart\b/g)).toHaveLength(2);
			expect(xml).toContain('<w:drawing');
			const comments = await zip.file('word/comments.xml')!.async('string');
			expect(comments).toContain('A picture comment');
			expect(comments).toContain('B picture comment');
		}
		await page.getByRole('button', { name: 'Pause delivery', exact: true }).click();
		for (const [pane, text] of [
			[paneA, 'A picture comment'],
			[paneB, 'B picture comment'],
		] as const)
			await pane
				.locator('.dve-comment-thread')
				.filter({ hasText: text })
				.getByRole('button', { name: 'Delete', exact: true })
				.click();
		await page.getByRole('button', { name: 'Resume delivery', exact: true }).click();
		await expect.poll(anchorIds).toEqual([]);
		await a.getByRole('button', { name: 'Undo', exact: true }).click();
		await expect.poll(async () => (await anchorIds()).length).toBe(1);
		for (const pane of [paneA, paneB]) {
			await expect(pane).toContainText('A picture comment');
			await expect(pane).not.toContainText('B picture comment');
		}
		await expect(b.locator('img[data-docx-image]')).toHaveCount(1);
		expect(errors).toEqual([]);
	});
	test(`${framework}: Yjs review pane synchronizes threads, replies and local undo`, async ({
		page,
	}) => {
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.goto(`/collaboration.html?framework=${framework}&mode=yjs`);
		const a = page.locator('#peer-a docx-editor');
		const b = page.locator('#peer-b docx-editor');
		await expect(a.locator('.ProseMirror')).toContainText('Shared document');
		await expect(b.locator('.ProseMirror')).toContainText('Shared document');
		// The peers can still be settling their first sync when the text appears, and
		// a document update that lands around these keystrokes drops the selection,
		// which leaves Add comment disabled. Select until the selection is there.
		// This narrows the race, it does not close it: an update can still land
		// after the check.
		await expect(async () => {
			await a.locator('.ProseMirror').click();
			await page.keyboard.press('Control+Home');
			await page.keyboard.press('Control+Shift+ArrowRight');
			expect(await page.evaluate(() => getSelection()?.toString())).not.toBe('');
		}).toPass();
		await a.locator('office-ui-ribbon-actions [part="comments"]').click();
		const paneA = a.locator('.dve-comments-panel');
		await paneA.getByRole('textbox', { name: 'New comment', exact: true }).fill('Shared review');
		await paneA.getByRole('button', { name: 'Add comment', exact: true }).click();
		await b.locator('office-ui-ribbon-actions [part="comments"]').click();
		const paneB = b.locator('.dve-comments-panel');
		await expect(paneB).toContainText('Shared review');
		await page.getByRole('button', { name: 'Pause delivery', exact: true }).click();
		for (const [pane, text] of [
			[paneA, 'Alice reply'],
			[paneB, 'Bob reply'],
		] as const) {
			await pane.getByRole('textbox', { name: 'Reply', exact: true }).fill(text);
			await pane.getByRole('button', { name: 'Reply', exact: true }).click();
		}
		await paneB.getByRole('button', { name: 'Resolve', exact: true }).click();
		await page.getByRole('button', { name: 'Resume delivery', exact: true }).click();
		for (const pane of [paneA, paneB]) {
			await expect(pane).toContainText('Alice reply');
			await expect(pane).toContainText('Bob reply');
			await expect(pane.getByRole('button', { name: 'Reopen', exact: true })).toBeVisible();
		}
		await a.locator('.ProseMirror').click();
		await page.keyboard.press('Control+z');
		for (const pane of [paneA, paneB]) {
			await expect(pane).not.toContainText('Alice reply');
			await expect(pane).toContainText('Bob reply');
		}
		const bytes = await b.evaluate(async (element) =>
			Array.from(await (element as DocxEditorElement).saveBytes()),
		);
		const zip = await JSZip.loadAsync(new Uint8Array(bytes));
		const comments = await zip.file('word/comments.xml')!.async('string');
		expect(comments).toContain('Shared review');
		expect(comments).toContain('Bob reply');
		expect(comments).not.toContain('Alice reply');
		await page.getByLabel('Editor B read only', { exact: true }).check();
		// Reopening refreshes the existing pane against the current write permission.
		await paneB.getByRole('button', { name: 'Close comments', exact: true }).click();
		await b.locator('office-ui-ribbon-actions [part="comments"]').click();
		await expect(paneB.getByRole('button', { name: 'Reopen', exact: true })).toBeDisabled();
		await expect(paneB.getByRole('button', { name: 'Reply', exact: true })).toBeDisabled();
		await paneA
			.locator('.dve-comment-thread')
			.filter({ hasText: 'Shared review' })
			.getByRole('button', { name: 'Delete', exact: true })
			.click();
		for (const pane of [paneA, paneB]) {
			await expect(pane).not.toContainText('Shared review');
			await expect(pane).not.toContainText('Bob reply');
		}
		await a.locator('.ProseMirror').click();
		await page.keyboard.press('Control+z');
		for (const pane of [paneA, paneB]) {
			await expect(pane).toContainText('Shared review');
			await expect(pane).toContainText('Bob reply');
		}
		expect(errors).toEqual([]);
	});
}
