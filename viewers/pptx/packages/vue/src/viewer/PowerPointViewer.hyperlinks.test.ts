import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { flushPromises, mount } from '@vue/test-utils';
import { expect, test, vi } from 'vitest';

import PowerPointViewer from './PowerPointViewer.vue';
import type { PowerPointViewerExpose } from './types';

test('offers the host a cancellable read-only text jump without opening a tab', async () => {
	const content = new Uint8Array(
		readFileSync(resolve(process.cwd(), '../../../../e2e/pptx/fixtures/slide-jump-links.pptx')),
	);
	const onHyperlinkClick = vi.fn();
	const open = vi.spyOn(window, 'open').mockReturnValue(null);
	const wrapper = mount(PowerPointViewer, { props: { content, canEdit: false, onHyperlinkClick } });
	try {
		const api = wrapper.vm as unknown as PowerPointViewerExpose;
		await vi.waitFor(
			async () => {
				await flushPromises();
				expect(api.getSlideCount()).toBe(3);
			},
			{ timeout: 15000 },
		);
		const link = wrapper.get('[data-pptx-viewport] [data-pptx-hyperlink]');
		expect(link.attributes('href')).toBeUndefined();
		onHyperlinkClick.mockReturnValueOnce(false);
		await link.trigger('click');
		expect(api.getActiveSlideIndex()).toBe(0);
		await link.trigger('click');
		expect(api.getActiveSlideIndex()).toBe(2);
		expect(onHyperlinkClick).toHaveBeenCalledTimes(2);
		expect(open).not.toHaveBeenCalled();
	} finally {
		wrapper.unmount();
		vi.restoreAllMocks();
	}
});
