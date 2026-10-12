/* oxlint-disable vitest/prefer-importing-vitest-globals -- Playwright spec, `test`/`expect` come from @playwright/test */
/**
 * Dragging a picture moves it; the browser's own image drag never starts.
 *
 * Issue #44: an `<img>` is draggable by default, so a press-and-move on a
 * picture started a native drag (the translucent ghost under the cursor). The
 * browser then fires `pointercancel`, which ends the editor's move gesture a
 * few pixels in: the picture stopped following the pointer. Only React marked
 * its picture `<img>` as not draggable; Vue and Angular lost every picture
 * drag, and Vanilla and Svelte lost the ones whose press is not consumed (a
 * Ctrl-held press, for one).
 *
 * Contract notes:
 *  - `dragstart` is observed on `window` in the capture phase, so it is seen
 *    wherever a binding puts its listeners and whatever stops propagation.
 *  - The picture is found through the neutral `[data-pptx-element="true"]`
 *    marker; its `<img>` is the node the browser would drag.
 *
 * Fixture: `accessibility-images.pptx` (plain pictures on the first slide).
 *
 * Run: bunx playwright test picture-native-drag
 */
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

import { fixture, loadDeck } from './support/deck';

test.use({ viewport: { width: 1440, height: 900 } });

const PICTURE_DECK = fixture('accessibility-images.pptx');
const DRAG_STEPS = 15;
const STEP_X = 6;
const STEP_Y = 3;

/** Record every native drag the page starts from here on. */
async function watchNativeDrags(page: Page): Promise<void> {
	await page.evaluate(() => {
		const host = window as unknown as { __nativeDrags: string[] };
		host.__nativeDrags = [];
		window.addEventListener(
			'dragstart',
			(event) => host.__nativeDrags.push((event.target as Element | null)?.tagName ?? ''),
			true,
		);
	});
}

async function nativeDrags(page: Page): Promise<string[]> {
	return page.evaluate(() => (window as unknown as { __nativeDrags: string[] }).__nativeDrags);
}

/** Press on the middle of `target` and move away in small steps, as a hand does. */
async function pressAndDrag(page: Page, target: Locator): Promise<void> {
	const box = (await target.boundingBox())!;
	const x = box.x + box.width / 2;
	const y = box.y + box.height / 2;
	await page.mouse.move(x, y);
	await page.mouse.down();
	for (let step = 1; step <= DRAG_STEPS; step++) {
		await page.mouse.move(x + step * STEP_X, y + step * STEP_Y);
	}
	await page.mouse.up();
}

async function firstPicture(page: Page): Promise<{ picture: Locator; img: Locator }> {
	const img = page.locator('[data-pptx-element="true"] img').first();
	await expect(img).toBeVisible();
	const picture = img.locator('xpath=ancestor::*[@data-pptx-element="true"][1]');
	return { picture, img };
}

test('dragging a picture moves it without a native image drag', async ({ page }) => {
	await loadDeck(page, PICTURE_DECK);
	const { picture, img } = await firstPicture(page);
	const before = (await picture.boundingBox())!;
	await watchNativeDrags(page);

	await pressAndDrag(page, img);

	expect(await nativeDrags(page)).toEqual([]);
	// The picture followed the pointer for the whole gesture, not just the few
	// pixels before a native drag would have cancelled the pointer stream.
	const after = (await picture.boundingBox())!;
	expect(after.x - before.x).toBeGreaterThan((DRAG_STEPS * STEP_X) / 2);
	expect(after.y - before.y).toBeGreaterThan((DRAG_STEPS * STEP_Y) / 2);
});

test('a Ctrl-held press on a picture starts no native image drag', async ({ page }) => {
	await loadDeck(page, PICTURE_DECK);
	const { img } = await firstPicture(page);
	await watchNativeDrags(page);

	// An additive press toggles the selection and is not consumed by the move
	// gesture, so nothing but the `<img>` itself keeps the browser from dragging.
	await page.keyboard.down('Control');
	await pressAndDrag(page, img);
	await page.keyboard.up('Control');

	expect(await nativeDrags(page)).toEqual([]);
});
