import { expect, type Locator, type Page } from '@playwright/test';
import type { VisioDocument } from 'ooxml-core/visio';
import { editSelection } from './ribbon';
export async function rotateGroup(
	page: Page,
	viewer: Locator,
	id: string,
	angle: number,
	mode: 'control' | 'pointer' | 'menu',
	direction?: 'Left' | 'Right',
) {
	const shape = viewer.locator(`[data-shape-id="${id}"]`);
	await shape.focus();
	await shape.press('Enter');
	await expect(shape).toHaveAttribute('data-selected', 'true');
	await expect(viewer.locator('[command="flip-horizontal"]')).toHaveAttribute('disabled', '');
	if (mode === 'control') {
		await editSelection(viewer, { type: 'rotate-shape', angle });
	} else if (mode === 'menu') {
		const position = viewer.locator('[data-menu="position"]');
		await position.getByRole('button', { name: 'Position', exact: true }).click();
		const nested = position.locator('[data-menu="rotate"]');
		await nested.getByRole('menuitem', { name: 'Rotate Shapes', exact: true }).hover();
		await nested.locator(`[command="rotate-${direction === 'Left' ? 'left' : 'right'}"]`).click();
	} else {
		const handle = viewer.locator(`[data-rotation-handle="${id}"]`);
		await expect(handle).toBeVisible();
		const source = await viewer.evaluate((element) =>
			Array.from(
				(
					element as unknown as {
						exportVsdx(): { bytes: Uint8Array };
					}
				).exportVsdx().bytes,
			),
		);
		const geometry = await viewer.evaluate((element, id) => {
			const host = element as unknown as { document: VisioDocument; shadowRoot: ShadowRoot };
			const model = host.document.pages[0]!,
				shape = model.shapes.find((shape) => shape.id === id)!;
			const svg = host.shadowRoot.querySelector<SVGSVGElement>('svg.paper')!;
			const handle = host.shadowRoot.querySelector<SVGCircleElement>(
				`[data-rotation-handle="${id}"]`,
			)!;
			const pin = new DOMPoint(
				shape.rotation!.pinX,
				model.height - shape.rotation!.pinY,
			).matrixTransform(svg.getScreenCTM()!);
			const grip = new DOMPoint(handle.cx.baseVal.value, handle.cy.baseVal.value).matrixTransform(
				handle.getScreenCTM()!,
			);
			return {
				pin: { x: pin.x, y: pin.y },
				grip: { x: grip.x + 2, y: grip.y + 1 },
				angle: shape.rotation!.angle,
			};
		}, id);
		const delta = -(angle - geometry.angle),
			dx = geometry.grip.x - geometry.pin.x,
			dy = geometry.grip.y - geometry.pin.y;
		const point = (fraction: number) => ({
			x: geometry.pin.x + dx * Math.cos(delta * fraction) - dy * Math.sin(delta * fraction),
			y: geometry.pin.y + dx * Math.sin(delta * fraction) + dy * Math.cos(delta * fraction),
		});
		const before = await shape.getAttribute('transform');
		const children = await shape
			.locator('g[transform^="matrix"]')
			.evaluateAll((elements) => elements.map((element) => element.getAttribute('transform')));
		for (const cancel of [true, false]) {
			await page.mouse.move(geometry.grip.x, geometry.grip.y);
			await page.mouse.down();
			for (let step = 1; step <= 12; step++) {
				const target = point(((cancel ? 0.5 : 1) * step) / 12);
				await page.mouse.move(target.x, target.y);
			}
			await expect(viewer.locator('.rotation-shape-preview')).toHaveCount(1);
			const preview = await viewer
				.locator('.rotation-shape-preview g[transform^="matrix"]')
				.evaluateAll((elements) => elements.map((element) => element.getAttribute('transform')));
			expect(preview.slice(1)).toEqual(children);
			await expect(shape).toHaveAttribute('transform', before!);
			expect(
				await viewer.evaluate((element) =>
					Array.from(
						(
							element as unknown as {
								exportVsdx(): { bytes: Uint8Array };
							}
						).exportVsdx().bytes,
					),
				),
			).toEqual(source);
			if (cancel) await page.keyboard.press('Escape');
			await page.mouse.up();
			await expect(viewer.locator('.rotation-shape-preview')).toHaveCount(0);
			if (cancel) await expect(shape).toHaveAttribute('transform', before!);
		}
	}
	await expect
		.poll(() =>
			viewer.evaluate((element) => {
				const host = element as unknown as {
					controller: { state: { edit: { busy: boolean; canUndo: boolean } } };
				};
				return !host.controller.state.edit.busy && host.controller.state.edit.canUndo;
			}),
		)
		.toBe(true);
}
