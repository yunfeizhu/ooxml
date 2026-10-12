// @vitest-environment happy-dom
import type { RibbonAddInTab } from 'ooxml-ui/pptx';
import React, { act, useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

import type { ToolbarSection } from '../../types';
import { RibbonAddInsContext, RibbonAddInSection, useRibbonAddInTabs } from './ribbon-add-ins';
import { RibbonTabBar } from './RibbonTabBar';

vi.mock(import('react-i18next'), () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const reports = (run: () => void, label = 'Reports'): RibbonAddInTab => ({
	id: 'reports',
	label,
	groups: [{ label: 'Export', commands: [{ id: 'export', label: 'Export', run }] }],
});

/** The tab row and content wiring `Toolbar` does, without the rest of the ribbon. */
function Harness({ onFallback }: { onFallback: () => void }): React.ReactElement {
	const [section, setSection] = useState<ToolbarSection>('insert');
	const fallBack = useCallback(() => {
		setSection('home');
		onFallback();
	}, [onFallback]);
	const addIns = useRibbonAddInTabs(fallBack);
	return (
		<div>
			<RibbonTabBar
				isTabVisible={() => true}
				activeSection={addIns.active ? null : section}
				contextualTabs={[]}
				activeContextual={null}
				onSelectSection={(id) => {
					addIns.select(null);
					setSection(id);
				}}
				onSelectContextual={() => undefined}
				addInTabs={addIns.visible}
				activeAddIn={addIns.active?.id ?? null}
				onSelectAddIn={addIns.select}
			/>
			{addIns.active && <RibbonAddInSection tab={addIns.active} />}
		</div>
	);
}

describe('host ribbon tabs', () => {
	it('shows a host tab after the fixed tabs, runs its command and falls back when it is removed', () => {
		globalThis.IS_REACT_ACT_ENVIRONMENT = true;
		const container = document.createElement('div');
		document.body.append(container);
		const root = createRoot(container);
		const first = vi.fn();
		const latest = vi.fn();
		const fallback = vi.fn();
		const heard = vi.fn();
		container.addEventListener('office-ribbon-add-in', (event) =>
			heard((event as CustomEvent).detail),
		);
		const render = (tabs: RibbonAddInTab[]) =>
			act(() =>
				root.render(
					<RibbonAddInsContext.Provider value={tabs}>
						<Harness onFallback={fallback} />
					</RibbonAddInsContext.Provider>,
				),
			);
		const tab = () => container.querySelector<HTMLButtonElement>('[data-ribbon-add-in-tab]');
		const selected = () =>
			container.querySelector('[role="tab"][aria-selected="true"]')!.textContent;
		try {
			render([reports(first), { ...reports(first), id: 'home', label: 'Fake' }]);
			const tabs = [...container.querySelectorAll('[role="tab"]')];
			expect(tabs.at(-1)).toBe(tab());
			expect(tabs.map((item) => item.textContent)).not.toContain('Fake');
			expect(tab()!.textContent).toBe('Reports');
			expect(container.querySelector('pptx-ui-ribbon-add-in')).toBeNull();
			act(() => tab()!.click());
			expect(selected()).toBe('Reports');
			const command = container.querySelector('pptx-ui-ribbon-command')!;
			// A re-render with new closures keeps the command and runs the latest callback.
			render([reports(latest, 'Reporting')]);
			expect(tab()!.textContent).toBe('Reporting');
			expect(container.querySelector('pptx-ui-ribbon-command')).toBe(command);
			act(() => command.shadowRoot!.querySelector('button')!.click());
			expect(first).not.toHaveBeenCalled();
			expect(latest).toHaveBeenCalledOnce();
			expect(heard).toHaveBeenCalledWith({ tab: 'reports', command: 'export' });
			// The host removes the tab that is showing: the ribbon goes back to Home.
			render([]);
			expect(tab()).toBeNull();
			expect(container.querySelector('pptx-ui-ribbon-add-in')).toBeNull();
			expect(fallback).toHaveBeenCalledOnce();
			expect(selected()).toBe('pptx.ribbon.tab.home');
		} finally {
			act(() => root.unmount());
			container.remove();
		}
	});
});
