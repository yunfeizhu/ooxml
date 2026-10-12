// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { translationsEn } from 'ooxml-ui/pptx/i18n';
import React, { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';

vi.mock(import('react-i18next'), () => ({
	useTranslation: () => ({
		t: (key: string) => translationsEn[key] ?? key,
		i18n: {
			language: 'en',
			languages: ['en'],
			options: { resources: { en: {} } },
			changeLanguage: () => Promise.resolve(),
		},
	}),
}));
const { PowerPointViewer } = await import('../index');
type Handle = import('../index').PowerPointViewerHandle;

test('offers the host a cancellable read-only text jump without opening a tab', async () => {
	globalThis.IS_REACT_ACT_ENVIRONMENT = true;
	const container = document.createElement('div');
	document.body.append(container);
	const root = createRoot(container);
	const ref = createRef<Handle>();
	const onHyperlinkClick = vi.fn();
	const open = vi.spyOn(window, 'open').mockReturnValue(null);
	try {
		const content = new Uint8Array(
			readFileSync(resolve(process.cwd(), '../../../../e2e/pptx/fixtures/slide-jump-links.pptx')),
		);
		await act(async () => {
			root.render(
				<PowerPointViewer
					ref={ref}
					content={content}
					canEdit={false}
					onHyperlinkClick={onHyperlinkClick}
				/>,
			);
		});
		await vi.waitFor(
			async () => {
				await act(async () => {
					await new Promise((done) => {
						setTimeout(done, 10);
					});
				});
				expect(ref.current?.getSlideCount()).toBe(3);
			},
			{ timeout: 15000 },
		);
		const link = container.querySelector<HTMLElement>('[data-pptx-hyperlink]')!;
		expect(link.getAttribute('href')).toBeNull();
		onHyperlinkClick.mockReturnValueOnce(false);
		await act(async () => link.click());
		expect(ref.current?.getActiveSlideIndex()).toBe(0);
		await act(async () => link.click());
		expect(ref.current?.getActiveSlideIndex()).toBe(2);
		expect(onHyperlinkClick).toHaveBeenCalledTimes(2);
		expect(open).not.toHaveBeenCalled();
	} finally {
		await act(async () => root.unmount());
		container.remove();
		globalThis.IS_REACT_ACT_ENVIRONMENT = false;
		vi.restoreAllMocks();
	}
});
