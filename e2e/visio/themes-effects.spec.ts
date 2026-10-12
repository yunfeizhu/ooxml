import { test, expect, type Locator } from '@playwright/test';
import { createVsdxFixture } from './fixture.mjs';
import { openDemo } from './demo-page';

async function menuItem(viewer: Locator, path: readonly string[]): Promise<void> {
	const effects = viewer.locator('office-ui-menu-button[data-menu="effects"]');
	await effects.getByRole('button', { name: 'Effects', exact: true }).click();
	let scope: Locator = effects;
	for (const [index, name] of path.entries()) {
		const item = scope
			.getByRole('menuitem', { name, exact: true })
			.or(scope.getByRole('menuitemcheckbox', { name, exact: true }))
			.first();
		if (index === path.length - 1) {
			await item.click();
			return;
		}
		await item.hover();
		scope = scope.locator(`office-ui-menu-button[submenu][label="${name}"]`);
	}
}

test('applies a page theme and variant, shape effects and Format Shape values', async ({
	page,
}) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.setViewportSize({ width: 1600, height: 1000 });
	await openDemo(page);
	await page.locator('#file').setInputFiles({
		name: 'themes.vsdx',
		mimeType: 'application/vnd.ms-visio.drawing',
		buffer: await createVsdxFixture('Theme me'),
	});
	await expect(page.locator('#file-name')).toHaveText('themes.vsdx');
	const viewer = page.locator('visio-viewer');
	const shape = viewer.locator('svg.paper [data-shape-id="1"]');
	await shape.click();
	// A Quick Style, as dropped masters get, so the theme recolours the shape. The ribbon shows a
	// row of tiles; the More button opens the whole gallery.
	const quick = viewer.locator('office-ui-gallery[data-menu="quick-styles"]');
	await quick.locator('.trigger').click();
	await quick.locator('.popup [data-gallery-item="quick-style-2-4"]').click();
	await expect(shape.locator('[data-geometry]').first()).toHaveAttribute('fill', '#5b9bd5');

	await viewer.getByRole('tab', { name: 'Design', exact: true }).click();
	const themes = viewer.locator('office-ui-gallery[data-menu="themes"]');
	const variants = viewer.locator('office-ui-gallery[data-menu="variants"]');
	await expect(variants).toHaveAttribute('disabled', '');
	await themes.locator('.trigger').click();
	await themes.locator('.popup [data-gallery-item="theme-harbor"]').click();
	await expect(shape.locator('[data-geometry]').first()).toHaveAttribute('fill', '#1f78b4');
	await expect(variants).not.toHaveAttribute('disabled', '');
	await expect(viewer.locator('[command="theme-fonts"]')).toHaveAttribute('disabled', '');
	await variants.locator('.trigger').click();
	await variants.locator('.popup [data-gallery-item="variant-2"]').click();
	await expect(shape.locator('[data-geometry]').first()).toHaveAttribute('fill', '#1f78b4');
	await expect(page.locator('#edit-label')).toHaveText('EDITED COPY');

	await viewer.getByRole('tab', { name: 'Home', exact: true }).click();
	await shape.click();
	await menuItem(viewer, ['Glow', '8 pt glow', 'Glow: 8 pt; Accent color 2']);
	await expect(shape.locator('[data-glow] path').first()).toHaveAttribute('fill', '#33a1c9');
	await menuItem(viewer, ['Soft Edges', '5 Point']);
	await expect(shape.locator('[data-geometry]').first()).toHaveAttribute(
		'filter',
		/^url\(#visio-soft-edges-\d+\)$/,
	);
	await menuItem(viewer, ['Reflection', 'Half Reflection, touching']);
	await expect(shape.locator('[data-reflection]')).toHaveCount(1);
	await expect(viewer.locator('[command="bevel"]')).toHaveAttribute('disabled', '');

	// Glow Options... opens the Format Shape task pane at Effects; a change applies at once.
	await menuItem(viewer, ['Glow', 'Glow Options...']);
	const pane = viewer.locator('.format-pane');
	await expect(pane).toBeVisible();
	await expect(pane.locator('[data-pane-field="glowSize"]')).toHaveValue('8');
	const soft = pane.locator('[data-pane-field="softEdges"]');
	await soft.fill('0');
	await soft.press('Tab');
	await expect(shape.locator('[data-geometry]').first()).not.toHaveAttribute('filter', /.+/);

	for (let step = 0; step < 6; step++) await viewer.locator('.qat [data-command="undo"]').click();
	await expect(shape.locator('[data-glow]')).toHaveCount(0);
	await expect(shape.locator('[data-geometry]').first()).toHaveAttribute('fill', '#5b9bd5');
	expect(errors).toEqual([]);
});
