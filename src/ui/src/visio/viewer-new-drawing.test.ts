// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { parseVsdx } from 'ooxml-core/visio';
import { demoDocument } from 'ooxml-core/visio/ui';
import { mountViewer } from './binding';
import { createVsdxFixture } from './__fixtures__/fixture.mjs';

afterEach(() => {
	vi.restoreAllMocks();
	document.body.replaceChildren();
});
function setup() {
	const host = document.createElement('div');
	document.body.append(host);
	const viewer = mountViewer(host, { document: demoDocument });
	vi.spyOn(viewer.controller, 'parser').mockImplementation(parseVsdx);
	return { viewer, root: viewer.element.shadowRoot! };
}
it('creates from File New, names the accepted source and enables clean Save', async () => {
	const { viewer, root } = setup();
	viewer.element.openBackstage('new');
	const blank = root.querySelector<HTMLButtonElement>('[data-backstage-action="new-blank"]')!;
	expect(blank.disabled).toBe(false);
	blank.click();
	await vi.waitFor(() => expect(viewer.element.fileName).toBe('New drawing.vsdx'));
	expect(viewer.controller.state.document!.pages[0]!.shapes).toEqual([]);
	expect(viewer.exportVsdx().dirty).toBe(false);
	expect(root.querySelector<HTMLElement & { open: boolean }>('office-ui-backstage')!.open).toBe(
		false,
	);
	viewer.element.openBackstage('save-as');
	expect(
		root.querySelector<HTMLButtonElement>('[data-backstage-action="download"]')!.disabled,
	).toBe(false);
	viewer.destroy();
});
it('routes Ctrl+N and Meta+N while leaving editable fields and other shortcut modifiers alone', async () => {
	const { viewer, root } = setup();
	const create = vi.spyOn(viewer.element, 'createBlankDrawing').mockResolvedValue();
	const viewport = root.querySelector<HTMLElement>('.viewport')!;
	for (const control of [{ ctrlKey: true }, { metaKey: true }]) {
		const key = new KeyboardEvent('keydown', {
			key: 'n',
			...control,
			bubbles: true,
			composed: true,
			cancelable: true,
		});
		viewport.dispatchEvent(key);
		expect(key.defaultPrevented).toBe(true);
	}
	expect(create).toHaveBeenCalledTimes(2);
	const input = document.createElement('input');
	root.append(input);
	input.dispatchEvent(
		new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true, composed: true }),
	);
	viewport.dispatchEvent(
		new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, shiftKey: true, bubbles: true }),
	);
	expect(create).toHaveBeenCalledTimes(2);
	viewer.destroy();
});
it('refuses keyboard creation while busy and unwires it after disposal', async () => {
	const { viewer, root } = setup();
	const create = vi.spyOn(viewer.element, 'createBlankDrawing').mockResolvedValue();
	let release!: (bytes: Uint8Array) => void;
	const pending = viewer.controller.loadSource(
		() =>
			new Promise<Uint8Array>((done) => {
				release = done;
			}),
	);
	const viewport = root.querySelector<HTMLElement>('.viewport')!;
	expect(
		root.querySelector<HTMLButtonElement>('[data-backstage-action="new-blank"]')!.disabled,
	).toBe(true);
	viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true }));
	expect(create).not.toHaveBeenCalled();
	viewer.destroy();
	release(new Uint8Array(await createVsdxFixture()));
	await pending;
	viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true }));
	expect(create).not.toHaveBeenCalled();
});
it('does not retain a New filename after cancellation or a load callback replaces the document', async () => {
	const { viewer } = setup();
	viewer.controller.onEvent((name) => {
		if (name === 'document-load') viewer.controller.setDocument(demoDocument);
	});
	await viewer.createBlankDrawing();
	expect(viewer.controller.state.document).toBe(demoDocument);
	expect(viewer.element.fileName).toBe('');
	viewer.destroy();
	await expect(viewer.createBlankDrawing()).rejects.toThrow('destroyed');
});
