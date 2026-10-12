// @vitest-environment jsdom
import '@angular/compiler';
import { createComponent, provideZonelessChangeDetection } from '@angular/core';
import { createApplication } from '@angular/platform-browser';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { createRoot as createSolidRoot, createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { flushSync, mount, unmount } from 'svelte';
import { createApp, h, nextTick, shallowRef } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RibbonAddInTab, XlsxEditorElement } from 'xlsx-web-component';
import { SpreadsheetEditorComponent } from './angular';
import { EDITOR_EVENT_NAMES, EDITOR_PROP_KEYS, mountEditor } from './index';
import { SpreadsheetEditor as ReactEditor } from './react';
import { SpreadsheetEditor as SolidEditor } from './solid';
import { SpreadsheetEditor as VueEditor } from './vue';
import XlsxEditor from './XlsxEditor.svelte';
import { reactiveProps } from './test-svelte-props.svelte';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => document.body.replaceChildren());

const tabs = (run: () => void): RibbonAddInTab[] => [
	{
		id: 'reports',
		label: 'Reports',
		groups: [{ label: 'Export', commands: [{ id: 'export', label: 'Export', run }] }],
	},
];
const chosen = { tab: 'reports', command: 'export' };

function host(): HTMLElement {
	const element = document.createElement('div');
	document.body.append(element);
	return element;
}
const editorIn = (root: ParentNode) => root.querySelector('xlsx-editor') as XlsxEditorElement;
const panel = (editor: XlsxEditorElement) =>
	editor.shadowRoot!.querySelector<HTMLElement>('[data-add-in]');
/** Chooses the Export command the way the shared button does. */
function choose(editor: XlsxEditorElement): void {
	panel(editor)!
		.querySelector('[data-add-in-command="export"]')!
		.dispatchEvent(
			new CustomEvent('office-command', {
				detail: { command: 'export' },
				bubbles: true,
				composed: true,
			}),
		);
}

describe('host ribbon tabs through every binding', () => {
	it('is part of the shared contract', () => {
		expect(EDITOR_PROP_KEYS).toContain('ribbonAddIns');
		expect(EDITOR_EVENT_NAMES).toContain('office-ribbon-add-in');
	});

	it('Vanilla: forwards the tabs, keeps panels on an equal update and reports commands', () => {
		const first = vi.fn();
		const latest = vi.fn();
		const onRibbonAddIn = vi.fn();
		const binding = mountEditor(host(), { ribbonAddIns: tabs(first), onRibbonAddIn });
		const built = panel(binding.element)!;
		expect(built.dataset.label).toBe('Reports');
		binding.update({ ribbonAddIns: tabs(latest), onRibbonAddIn });
		expect(panel(binding.element)).toBe(built);
		choose(binding.element);
		expect(first).not.toHaveBeenCalled();
		expect(latest).toHaveBeenCalledTimes(1);
		expect(onRibbonAddIn).toHaveBeenCalledWith(chosen);
		// The props are a snapshot: leaving the tabs out removes them.
		binding.update({ onRibbonAddIn });
		expect(panel(binding.element)).toBeNull();
		binding.destroy();
	});

	it('React', () => {
		const container = host();
		const root = createRoot(container);
		const run = vi.fn();
		const onRibbonAddIn = vi.fn();
		const renderWith = (ribbonAddIns: RibbonAddInTab[] | undefined) =>
			act(() => root.render(createElement(ReactEditor, { ribbonAddIns, onRibbonAddIn })));
		renderWith(tabs(vi.fn()));
		const editor = editorIn(container);
		const built = panel(editor)!;
		renderWith(tabs(run));
		expect(panel(editor)).toBe(built);
		choose(editor);
		expect(run).toHaveBeenCalledTimes(1);
		expect(onRibbonAddIn).toHaveBeenCalledWith(chosen);
		renderWith(undefined);
		expect(panel(editor)).toBeNull();
		act(() => root.unmount());
	});

	it('Vue', async () => {
		const container = host();
		const run = vi.fn();
		const onAddIn = vi.fn();
		const current = shallowRef<RibbonAddInTab[] | undefined>(tabs(run));
		const app = createApp({
			render: () =>
				h(VueEditor, {
					...(current.value ? { ribbonAddIns: current.value } : {}),
					'onOffice-ribbon-add-in': onAddIn,
				}),
		});
		app.mount(container);
		const editor = editorIn(container);
		expect(panel(editor)!.dataset.label).toBe('Reports');
		choose(editor);
		expect(run).toHaveBeenCalledTimes(1);
		expect(onAddIn).toHaveBeenCalledWith(chosen);
		current.value = undefined;
		await nextTick();
		expect(panel(editor)).toBeNull();
		app.unmount();
	});

	it('Solid', () => {
		const container = host();
		const run = vi.fn();
		const onRibbonAddIn = vi.fn();
		const [current, setCurrent] = createSignal<RibbonAddInTab[] | undefined>(tabs(run));
		let dispose!: () => void;
		createSolidRoot((stop) => {
			dispose = stop;
			render(
				() =>
					SolidEditor({
						get ribbonAddIns() {
							return current();
						},
						onRibbonAddIn,
					}),
				container,
			);
		});
		const editor = editorIn(container);
		expect(panel(editor)!.dataset.label).toBe('Reports');
		choose(editor);
		expect(run).toHaveBeenCalledTimes(1);
		expect(onRibbonAddIn).toHaveBeenCalledWith(chosen);
		setCurrent(undefined);
		expect(panel(editor)).toBeNull();
		dispose();
	});

	it('Angular', async () => {
		const app = await createApplication({ providers: [provideZonelessChangeDetection()] });
		const hostElement = document.createElement('spreadsheet-editor');
		document.body.append(hostElement);
		const component = createComponent(SpreadsheetEditorComponent, {
			environmentInjector: app.injector,
			hostElement,
		});
		const run = vi.fn();
		const onAddIn = vi.fn();
		component.instance.ribbonAddIn.subscribe(onAddIn);
		component.setInput('ribbonAddIns', tabs(run));
		app.attachView(component.hostView);
		component.changeDetectorRef.detectChanges();
		const editor = editorIn(hostElement);
		expect(panel(editor)!.dataset.label).toBe('Reports');
		choose(editor);
		expect(run).toHaveBeenCalledTimes(1);
		expect(onAddIn).toHaveBeenCalledWith(chosen);
		component.setInput('ribbonAddIns', []);
		component.changeDetectorRef.detectChanges();
		expect(panel(editor)).toBeNull();
		component.destroy();
		app.destroy();
	});

	it('Svelte', () => {
		const target = host();
		const run = vi.fn();
		const onribbonaddin = vi.fn();
		const props = reactiveProps<{
			ribbonAddIns: RibbonAddInTab[] | undefined;
			onribbonaddin: typeof onribbonaddin;
		}>({ ribbonAddIns: tabs(run), onribbonaddin });
		const component = mount(XlsxEditor, { target, props });
		flushSync();
		const editor = editorIn(target);
		expect(panel(editor)!.dataset.label).toBe('Reports');
		choose(editor);
		expect(run).toHaveBeenCalledTimes(1);
		expect(onribbonaddin).toHaveBeenCalledWith(chosen);
		props.ribbonAddIns = undefined;
		flushSync();
		expect(panel(editor)).toBeNull();
		unmount(component);
	});
});
