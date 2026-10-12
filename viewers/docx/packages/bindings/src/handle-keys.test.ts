// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement, createRef, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createRoot as createSolidRoot } from 'solid-js';
import { render } from 'solid-js/web';
import { compile } from 'svelte/compiler';
import { createApp, h, ref } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import { EDITOR_HANDLE_KEYS, type EditorHandle } from './index';
import { WordEditor as ReactEditor } from './react';
import { WordEditor as SolidEditor } from './solid';
import { WordEditor as VueEditor } from './vue';

afterEach(() => document.body.replaceChildren());
const missing = (target: object) => EDITOR_HANDLE_KEYS.filter((key) => !(key in target));

describe('every framework exposes the shared handle vocabulary', () => {
	it('lists the keys of EditorHandle', () => {
		expect([...EDITOR_HANDLE_KEYS].sort()).toEqual(
			['dirty', 'download', 'element', 'load', 'markClean', 'save'].sort(),
		);
	});
	it('React', async () => {
		const host = document.createElement('div');
		document.body.append(host);
		const handle = createRef<EditorHandle>();
		const root = createRoot(host);
		root.render(createElement(StrictMode, null, createElement(ReactEditor, { ref: handle })));
		await new Promise((done) => setTimeout(done, 0));
		expect(missing(handle.current!)).toEqual([]);
		expect(handle.current!.dirty).toBe(false);
		root.unmount();
	});
	it('Vue', () => {
		const host = document.createElement('div');
		document.body.append(host);
		const editor = ref<EditorHandle>();
		const app = createApp({ render: () => h(VueEditor, { ref: editor }) });
		app.mount(host);
		expect(missing(editor.value!)).toEqual([]);
		expect(editor.value!.dirty).toBe(false);
		app.unmount();
	});
	it('Solid', () => {
		const host = document.createElement('div');
		document.body.append(host);
		let handle: EditorHandle | undefined;
		let dispose!: () => void;
		createSolidRoot((stop) => {
			dispose = stop;
			render(() => SolidEditor({ editorRef: (value) => (handle = value) }), host);
		});
		expect(missing(handle!)).toEqual([]);
		expect(handle!.dirty).toBe(false);
		dispose();
	});
	it('Angular', async () => {
		const { WordEditorComponent } = await import('./angular');
		expect(missing(WordEditorComponent.prototype)).toEqual([]);
	});
	it('Svelte', () => {
		// The component is compiled by the package build, not here; check what it exports instead.
		const source = readFileSync(
			resolve(process.cwd(), 'packages/bindings/src/WordEditor.svelte'),
			'utf8',
		);
		const { js } = compile(source, { filename: 'WordEditor.svelte', generate: 'client' });
		const exported = /var \$\$exports = \{([\s\S]*?)\};/.exec(js.code)?.[1] ?? '';
		for (const key of EDITOR_HANDLE_KEYS)
			expect(exported, key).toMatch(new RegExp(String.raw`\b${key}\b`));
	});
});
