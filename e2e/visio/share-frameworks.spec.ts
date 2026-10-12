import { test, expect } from '@playwright/test';
import { sampleSettled } from './demo-page';

// A File > Share session is only a name on a BroadcastChannel, so windows built from different
// framework demos must meet in it. `?share=<session>` starts sharing on load; the window that
// asks for `sample=1` opens the editable sample and the other adopts it.
for (const [host, guest] of [
	['react', 'vue'],
	['vanilla', 'angular'],
	['svelte', 'solid'],
] as const) {
	test(`a ${host} window and a ${guest} window share one drawing`, async ({ context }) => {
		const route = (framework: string) => (framework === 'vanilla' ? 'demo' : `demo-${framework}`);
		const room = `e2e-${host}-${guest}-${Date.now().toString(36)}`;
		const a = await context.newPage();
		const b = await context.newPage();
		await a.goto(`/${route(host)}/?embed=1&sample=1&share=${room}`);
		// The placeholder shows the same text; the editable sample has to have replaced it.
		await sampleSettled(a);
		await expect(a.locator('visio-viewer svg.paper')).toContainText('Start with an idea');
		// The second window joins late and adopts what the room holds.
		await b.goto(`/${route(guest)}/?embed=1&share=${room}`);
		const viewerA = a.locator('visio-viewer');
		const viewerB = b.locator('visio-viewer');
		await expect(viewerA.locator('svg.paper')).toContainText('Start with an idea');
		await expect(viewerB.locator('svg.paper')).toContainText('Start with an idea');

		// A text edit in one framework's window arrives in the other's.
		// oxlint-disable-next-line typescript/no-explicit-any -- page.evaluate reads an untyped element handle
		await viewerA.evaluate(async (element: any) => {
			const page = element.document.pages[0];
			const shape = page.shapes.find((s: { text?: string }) => s.text);
			await element.replacePlainText(page.id, shape.id, 'Edited in the host window');
		});
		await expect(viewerB.locator('svg.paper')).toContainText('Edited in the host window');
	});
}
