// @vitest-environment happy-dom
/**
 * The `customization` prop and the handle helpers, end to end through the
 * real `PowerPointViewer` mounted from the package entry point: a hidden
 * ribbon tab never renders, and `hideRibbonTab` / `showRibbonTab` on the
 * handle take effect live.
 */
import { translationsEn } from 'ooxml-ui/pptx/i18n';
import React, { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// oxlint-disable-next-line prefer-ending-with-an-expect
vi.mock<typeof import('react-i18next')>(import('react-i18next'), () => ({
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

const { PptxHandler } = await import('pptx-viewer-core');
const { PowerPointViewer } = await import('../index');
type ViewerHandle = import('../index').PowerPointViewerHandle;
type ViewerCustomization = import('../index').ViewerCustomization;
type ViewerProps = import('../index').PowerPointViewerProps;

async function sampleDeck(): Promise<Uint8Array> {
	const { handler, data } = await PptxHandler.create({ initialSlideCount: 1 });
	try {
		return await handler.save(data.slides);
	} finally {
		handler.dispose();
	}
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	globalThis.IS_REACT_ACT_ENVIRONMENT = true;
	// A desktop viewport, so the ribbon (not the mobile bar) renders.
	window.happyDOM?.setViewport({ width: 1600, height: 950 });
	container = document.createElement('div');
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => {
		root.unmount();
	});
	container.remove();
	globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

function handleOf(ref: React.RefObject<ViewerHandle | null>): ViewerHandle {
	if (!ref.current) {
		throw new Error('PowerPointViewer published no imperative handle');
	}
	return ref.current;
}

async function mount(
	customization?: ViewerCustomization,
	extra: Partial<ViewerProps> = {},
	content?: Uint8Array,
): Promise<React.RefObject<ViewerHandle | null>> {
	const bytes = content ?? (await sampleDeck());
	const ref = createRef<ViewerHandle>();
	await act(async () => {
		root.render(
			<PowerPointViewer
				ref={ref}
				content={bytes}
				canEdit
				customization={customization}
				{...extra}
			/>,
		);
	});
	for (let attempt = 0; attempt < 80; attempt += 1) {
		if ((ref.current?.getSlideCount() ?? 0) > 0 && ribbonTabs().length > 0) {
			return ref;
		}
		await act(async () => {
			await new Promise((resolve) => {
				setTimeout(resolve, 20);
			});
		});
	}
	throw new Error('the viewer never finished loading its deck');
}

/** Labels of the rendered ribbon tabs. */
function ribbonTabs(): string[] {
	return Array.from(container.querySelectorAll('[role="tab"]')).map(
		(tab) => tab.textContent?.trim() ?? '',
	);
}

const DRAW = translationsEn['pptx.ribbon.tab.draw'];
const INSERT = translationsEn['pptx.ribbon.tab.insert'];

describe('powerPointViewer customization', () => {
	it('never renders a ribbon tab the host hid', async () => {
		await mount({ ribbon: { hiddenTabs: ['draw'] } });
		expect(ribbonTabs()).toContain(INSERT);
		expect(ribbonTabs()).not.toContain(DRAW);
	});

	it('hides and restores a ribbon tab through the imperative handle', async () => {
		const ref = await mount();
		expect(ribbonTabs()).toContain(INSERT);
		await act(async () => {
			handleOf(ref).hideRibbonTab('insert');
		});
		expect(ribbonTabs()).not.toContain(INSERT);
		expect(handleOf(ref).getCustomization().ribbon?.hiddenTabs).toStrictEqual(['insert']);
		await act(async () => {
			handleOf(ref).showRibbonTab('insert');
		});
		expect(ribbonTabs()).toContain(INSERT);
	});
});

describe('powerPointViewer host ribbon tabs', () => {
	const reports = (run: () => void) => [
		{
			id: 'reports',
			label: 'Reports',
			groups: [{ label: 'Export', commands: [{ id: 'export', label: 'Export', run }] }],
		},
	];
	const tab = () => container.querySelector<HTMLButtonElement>('[data-ribbon-add-in-tab]');

	it('adds the host tab after Help, runs its command and returns to Home when it is removed', async () => {
		const run = vi.fn();
		const heard = vi.fn();
		container.addEventListener('office-ribbon-add-in', (event) =>
			heard((event as CustomEvent).detail),
		);
		const content = await sampleDeck();
		await mount(undefined, { ribbonAddIns: reports(run) }, content);
		// The ribbon's own tab row: the viewer has other tab lists (inspector, comments).
		const row = () =>
			Array.from(container.querySelectorAll('[data-pptx-chrome="ribbon-tabs"] [role="tab"]'));
		expect(row().at(-1)).toBe(tab());
		expect(tab()!.textContent).toBe('Reports');
		expect(container.querySelector('pptx-ui-ribbon-add-in')).toBeNull();
		await act(async () => {
			tab()!.click();
		});
		const selected = () =>
			row()
				.filter((item) => item.getAttribute('aria-selected') === 'true')
				.map((item) => item.textContent?.trim());
		expect(selected()).toStrictEqual(['Reports']);
		const command = container.querySelector('pptx-ui-ribbon-add-in pptx-ui-ribbon-command')!;
		expect(command.getAttribute('label')).toBe('Export');
		// The host tab replaces the fixed tab's groups rather than joining them.
		expect(container.querySelector('[data-ribbon-group="home.font"]')).toBeNull();
		await act(async () => {
			command.shadowRoot!.querySelector('button')!.click();
		});
		expect(run).toHaveBeenCalledOnce();
		expect(heard).toHaveBeenCalledWith({ tab: 'reports', command: 'export' });
		await mount(undefined, { ribbonAddIns: [] }, content);
		expect(tab()).toBeNull();
		expect(container.querySelector('pptx-ui-ribbon-add-in')).toBeNull();
		expect(selected()).toStrictEqual([translationsEn['pptx.ribbon.tab.home']]);
	});
});
