import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseVsdx } from 'ooxml-core/visio';
import { verifyBlockedMenuTransform } from './native-menu-noop';
import { openDemo } from './demo-page';

for (const variable of [
	'VISIO_NATIVE_QUARTER_LEFT_DIR',
	'VISIO_NATIVE_QUARTER_RIGHT_PIN_DIR',
	'VISIO_NATIVE_QUARTER_WRAP_DIR',
	'VISIO_NATIVE_QUARTER_HALF_LEFT_DIR',
	'VISIO_NATIVE_QUARTER_HALF_RIGHT_DIR',
	'VISIO_NATIVE_QUARTER_DEPENDENT_RIGHT_DIR',
	'VISIO_NATIVE_QUARTER_DEPENDENT_WRAP_DIR',
	'VISIO_NATIVE_FLIP_HORIZONTAL_DIR',
	'VISIO_NATIVE_FLIP_VERTICAL_DIR',
	'VISIO_NATIVE_FLIP_LOCK_DIR',
	'VISIO_NATIVE_FLIP_GUARD_DIR',
	'VISIO_NATIVE_FLIP_X_GUARD_DIR',
	'VISIO_NATIVE_FLIP_Y_GUARD_DIR',
	'VISIO_NATIVE_FLIP_BLOCKED_GUARD_DIR',
	'VISIO_NATIVE_FLIP_BLOCKED_LOCK_DIR',
	'VISIO_NATIVE_FLIP_DEPENDENT_ANGLE_DIR',
	'VISIO_NATIVE_FLIP_DEPENDENT_FLAG_DIR',
	'VISIO_NATIVE_FLIP_DEPENDENT_ZERO_ANGLE_DIR',
]) {
	const flip = variable.includes('_FLIP_');
	for (const kind of ['rectangle', 'ellipse']) {
		for (const framework of ['vanilla', 'react', 'vue', 'angular', 'svelte', 'solid']) {
			test(`${framework}: native menu transform ${kind} (${variable})`, async ({ page }) => {
				const directory = process.env[variable];
				test.skip(!directory, `Set ${variable} to a native quarter-turn capture.`);
				const source = await readFile(
					join(directory!, flip ? 'flip-source.vsdx' : 'quarter-source.vsdx'),
				);
				const native = await parseVsdx(
					await readFile(join(directory!, flip ? 'flipped.vsdx' : 'quarter-turned.vsdx')),
				);
				const evidence = JSON.parse(await readFile(join(directory!, 'evidence.json'), 'utf8'));
				const id = (flip ? evidence.flipped : evidence.quarterTurned)[kind].shapeId;
				const expected = native.pages[0]!.shapes.find((shape) => shape.id === id)!;
				await openDemo(
					page,
					framework === 'vanilla' ? '/demo/?sample=1' : `/demo-${framework}/?sample=1`,
				);
				await page.locator('#file').setInputFiles({
					name: 'quarter-source.vsdx',
					mimeType: 'application/vnd.ms-visio.drawing',
					buffer: source,
				});
				await expect(page.locator('#file-name')).toHaveText('quarter-source.vsdx');
				const viewer = page.locator('visio-viewer');
				const shape = viewer.locator(`[data-shape-id="${id}"]`);
				await shape.focus();
				await shape.press('Enter');
				const before = (await shape.getAttribute('transform'))!;
				const position = viewer.locator('[data-menu="position"]');
				await position.getByRole('button', { name: 'Position', exact: true }).click();
				const nested = position.locator('[data-menu="rotate"]');
				await nested
					.getByRole('menuitem', { name: 'Rotate Shapes', exact: true })
					.press('ArrowRight');
				const target = nested.getByRole('menuitem', {
					name: flip ? `Flip ${evidence.flip}` : `Rotate ${evidence.quarterTurn} 90°`,
					exact: true,
				});
				await expect(target).toBeVisible();
				const panelBox = (await nested.getByRole('menu').boundingBox())!;
				const windowSize = page.viewportSize()!;
				expect(panelBox.x).toBeGreaterThanOrEqual(0);
				expect(panelBox.y).toBeGreaterThanOrEqual(0);
				expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(windowSize.width);
				expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(windowSize.height);
				await target.press('Escape');
				await expect(target).not.toBeVisible();
				await expect(position.getByRole('menu').first()).toBeVisible();
				await expect(shape).toHaveAttribute('transform', before);
				await nested.getByRole('menuitem', { name: 'Rotate Shapes', exact: true }).hover();
				await expect(target).toBeVisible();
				await expect(
					nested.getByRole('menuitem', { name: 'Flip Horizontal', exact: true }),
				).toBeEnabled();
				if (variable.includes('_BLOCKED_')) {
					await verifyBlockedMenuTransform(page, viewer, target, source, id, before);
					const actual = (await parseVsdx(source)).pages[0]!.shapes.find(
						(shape) => shape.id === id,
					)!;
					for (let i = 0; i < 6; i++)
						expect(actual.transform[i]).toBeCloseTo(expected.transform[i]!, 12);
					return;
				}
				await target.click();
				await expect(shape).not.toHaveAttribute('transform', before);
				await expect(position.locator('[role="menu"]').first()).not.toBeVisible();
				const after = (await shape.getAttribute('transform'))!;
				const viewport = viewer.locator('.viewport');
				await viewport.focus();
				await viewport.press('Control+z');
				await expect(shape).toHaveAttribute('transform', before);
				await viewport.press('Control+y');
				await expect(shape).toHaveAttribute('transform', after);
				const saved = Buffer.from(
					await viewer.evaluate((element) =>
						Array.from(
							(element as unknown as { exportVsdx(): { bytes: Uint8Array } }).exportVsdx().bytes,
						),
					),
				);
				const actual = (await parseVsdx(saved)).pages[0]!.shapes.find((shape) => shape.id === id)!;
				expect(actual.geometry).toEqual(expected.geometry);
				expect(actual.style).toEqual(expected.style);
				expect(actual.rotation!.angle).toBeCloseTo(expected.rotation!.angle, 12);
				for (let i = 0; i < 6; i++)
					expect(actual.transform[i]).toBeCloseTo(expected.transform[i]!, 12);
				await page.locator('#file').setInputFiles({
					name: 'quarter-saved.vsdx',
					mimeType: 'application/vnd.ms-visio.drawing',
					buffer: saved,
				});
				await expect(page.locator('#file-name')).toHaveText('quarter-saved.vsdx');
				await expect(shape).toHaveAttribute('transform', after);
			});
		}
	}
}
