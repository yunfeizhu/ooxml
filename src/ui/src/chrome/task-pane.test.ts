import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineTaskPane } from './task-pane';

afterEach(() => document.body.replaceChildren());

describe('office-ui-task-pane', () => {
	it('titles a complementary pane and emits close from its close button', () => {
		defineTaskPane();
		const pane = document.createElement('office-ui-task-pane') as HTMLElement & { label: string };
		pane.label = 'Shape Data';
		pane.append(document.createTextNode('Body'));
		document.body.append(pane);
		expect(pane.getAttribute('role')).toBe('complementary');
		expect(pane.getAttribute('aria-label')).toBe('Shape Data');
		expect(pane.shadowRoot!.querySelector('.title')!.textContent).toBe('Shape Data');
		const close = pane.shadowRoot!.querySelector<HTMLButtonElement>('.close')!;
		expect(close.getAttribute('aria-label')).toBe('Close Shape Data');
		const onClose = vi.fn();
		pane.addEventListener('office-pane-close', onClose);
		close.click();
		expect(onClose).toHaveBeenCalledTimes(1);
		pane.setAttribute('close-label', 'Hide');
		expect(close.getAttribute('aria-label')).toBe('Hide');
	});
});
