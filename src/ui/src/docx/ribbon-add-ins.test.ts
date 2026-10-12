// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RibbonAddInTab } from '../ribbon/add-in-tabs';
import { DocxEditorElement, registerDocxEditor } from './index';

registerDocxEditor();
afterEach(() => document.body.replaceChildren());

const tab = (run: () => void): RibbonAddInTab => ({
	id: 'pdf',
	label: 'PDF',
	groups: [{ label: 'Create PDF', commands: [{ id: 'create-pdf', label: 'Create PDF', run }] }],
});

describe('Word ribbon add-in tabs', () => {
	it('keeps tabs set before the editor connects and reports their commands', () => {
		const editor = document.createElement('docx-editor') as DocxEditorElement;
		const run = vi.fn();
		const heard = vi.fn();
		editor.addEventListener('office-ribbon-add-in', (event) =>
			heard((event as CustomEvent).detail),
		);
		const action = vi.fn();
		editor.addEventListener('ribbon-action', action);
		editor.ribbonAddIns = [tab(run), { id: 'home', label: 'Not Home', groups: [] }];
		document.body.append(editor);
		const ribbon = editor.shadowRoot!.querySelector('office-ui-ribbon')!;
		const panels = [...ribbon.querySelectorAll<HTMLElement>('[data-ribbon-tab]')];
		expect(panels.filter((panel) => panel.dataset.ribbonTab === 'home')).toHaveLength(1);
		const panel = panels.at(-1)!;
		expect(panel.dataset.label).toBe('PDF');
		expect(panel.className).toBe('ribbon-panel');
		panel.querySelector('[data-add-in-command="create-pdf"]')!.dispatchEvent(
			new CustomEvent('office-command', {
				detail: { command: 'create-pdf' },
				bubbles: true,
				composed: true,
			}),
		);
		expect(run).toHaveBeenCalledTimes(1);
		expect(heard).toHaveBeenCalledWith({ tab: 'pdf', command: 'create-pdf' });
		expect(action).not.toHaveBeenCalled();
		// A locale change translates Word's tabs and leaves the host's label alone.
		editor.locale = 'fr';
		expect(panel.dataset.label).toBe('PDF');
		expect(panel.isConnected).toBe(true);
		editor.ribbonAddIns = [];
		expect(ribbon.querySelector('[data-add-in]')).toBeNull();
		expect(editor.ribbonAddIns).toEqual([]);
	});
});
