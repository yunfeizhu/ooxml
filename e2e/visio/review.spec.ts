import { expect, test } from '@playwright/test';
import { parseVsdx } from 'ooxml-core/visio';
import type { VisioViewerElement } from 'ooxml-ui/visio';
import { createVsdxFixture } from './fixture.mjs';
import { openDemo } from './demo-page';

test('Review comments, Shape Reports, Check Diagram and Create New work and save', async ({
	page,
}) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.setViewportSize({ width: 1600, height: 1000 });
	await openDemo(page);
	const viewer = page.locator('visio-viewer');
	await expect(viewer.locator('svg.paper')).toContainText('Release workflow');
	await page.locator('#file').setInputFiles({
		name: 'Review.vsdx',
		mimeType: 'application/vnd.ms-visio.drawing',
		buffer: await createVsdxFixture('Review target'),
	});
	await expect(page.locator('#file-name')).toHaveText('Review.vsdx');
	await expect(viewer.locator('svg.paper')).toContainText('Review target');
	const shape = viewer.locator('svg.paper [data-shape-id]').first();

	// Comments: a shape comment from Review > New Comment, saved in visio/comments.xml.
	await viewer.getByRole('tab', { name: 'Review', exact: true }).click();
	await expect(viewer.locator('[command="thesaurus"] button')).toBeDisabled();
	await shape.click();
	await viewer.locator('[command="new-comment"] button').click();
	const pane = viewer.locator('office-ui-comments-pane');
	await expect(pane).toBeVisible();
	await pane.locator('textarea.new').fill('Please confirm the owner.');
	await pane.locator('[data-action="add"]').click();
	await expect(viewer.locator('[data-status]')).toHaveText(/Added a comment/);
	await expect(pane.locator('.thread .anchor-label')).toHaveText('Import test');
	await expect(viewer.locator('svg.paper [data-comment-marker]')).toHaveCount(1);

	// Shape Reports: the current page's shapes in a table.
	await viewer.locator('[command="shape-reports"] button').click();
	const report = viewer.locator('.shape-report-dialog');
	await expect(report.locator('tbody tr')).toHaveCount(1);
	await expect(report.locator('tbody td').nth(2)).toHaveText('Import test');
	await report.locator('[label="Close"] button').click();

	// Process: Check Diagram finds nothing on a sound page; Create New links a new page.
	await viewer.getByRole('tab', { name: 'Process', exact: true }).click();
	await viewer.locator('[command="check-diagram"] button').first().click();
	await expect(viewer.locator('.issues-pane')).toBeVisible();
	await expect(viewer.locator('.issues-summary')).toHaveText('0 issues.');
	await shape.click();
	await viewer.locator('[command="create-new"] button').click();
	await expect(viewer.locator('[data-status]')).toHaveText(/Created subprocess page/);

	const bytes = await viewer.evaluate((node) =>
		Array.from((node as VisioViewerElement).exportVsdx().bytes),
	);
	const saved = await parseVsdx(new Uint8Array(bytes));
	expect(saved.comments).toEqual([
		expect.objectContaining({ shapeId: '1', text: 'Please confirm the owner.' }),
	]);
	expect(saved.pages).toHaveLength(2);
	expect(saved.pages[0]!.shapes[0]!.hyperlinks?.[0]?.target).toEqual({
		kind: 'internal',
		subAddress: saved.pages[1]!.name,
	});
	await page.screenshot({ path: test.info().outputPath('review.png') });
	expect(errors).toEqual([]);
});
