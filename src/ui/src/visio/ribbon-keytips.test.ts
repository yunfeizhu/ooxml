// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountViewer } from './binding';
import { demoDocument } from 'ooxml-core/visio/ui';

afterEach(() => {
	document.body.replaceChildren();
	vi.restoreAllMocks();
});

function setup() {
	const host = document.createElement('div');
	document.body.append(host);
	const viewer = mountViewer(host, { document: structuredClone(demoDocument) });
	return { viewer, root: viewer.element.shadowRoot! };
}

describe('Visio KeyTips', () => {
	it('gives every level unique codes where no single letter prefixes another', () => {
		const { viewer, root } = setup();
		const levels = [
			root.querySelector('.toolbar')!,
			...root.querySelectorAll<HTMLElement>('.ribbon-content'),
		];
		for (const level of levels) {
			const tips = [...level.querySelectorAll<HTMLElement>('[data-keytip]')]
				.filter(
					(el) =>
						(el.parentElement?.closest('[data-keytip-level]') ?? null) ===
						(level.matches('[data-keytip-level]') ? level : null),
				)
				.map((el) => el.dataset.keytip!);
			expect(new Set(tips).size, `duplicate KeyTips in ${level.id || 'tabs'}`).toBe(tips.length);
			for (const single of tips.filter((tip) => tip.length === 1))
				expect(
					tips.filter((tip) => tip.length > 1 && tip.startsWith(single)),
					`${single} prefixes another KeyTip in ${level.id || 'tabs'}`,
				).toEqual([]);
		}
		const tabs = root.querySelector('office-ui-ribbon')!.shadowRoot!;
		expect(tabs.querySelector<HTMLElement>('[data-tab="home"]')!.dataset.keytip).toBe('H');
		expect(tabs.querySelector<HTMLElement>('.file')!.dataset.keytip).toBe('F');
		expect(root.querySelector<HTMLElement>('[command="paste"]')!.dataset.keytip).toBe('V');
		viewer.destroy();
	});

	it('runs View > Grid with Alt, W, G and never runs disabled Home > Bold', async () => {
		vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
			DOMRect.fromRect({ x: 10, y: 10, width: 40, height: 20 }),
		);
		const { viewer, root } = setup();
		const viewport = root.querySelector<HTMLElement>('.viewport')!;
		const press = (key: string, type: 'keydown' | 'keyup' = 'keydown') =>
			viewport.dispatchEvent(
				new KeyboardEvent(type, { key, bubbles: true, composed: true, cancelable: true }),
			);
		const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
		press('Alt');
		press('Alt', 'keyup');
		press('w');
		await frame();
		expect(root.querySelector<HTMLElement>('#view-panel')!.hidden).toBe(false);
		press('g');
		expect(viewport.dataset.grid).toBe('true');
		const bold = vi.fn();
		root.querySelector('[command="bold"]')!.addEventListener('office-command', bold);
		press('Alt');
		press('Alt', 'keyup');
		press('h');
		await frame();
		press('1');
		expect(bold).not.toHaveBeenCalled();
		viewer.destroy();
	});
});
