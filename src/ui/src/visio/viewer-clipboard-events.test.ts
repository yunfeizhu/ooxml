// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
	clipboardViewer,
	deferred,
	installClipboard,
	nativeClipboardEvent,
} from './__fixtures__/clipboard-viewer';
let transport: ReturnType<typeof installClipboard>;
const cleanup: (() => void)[] = [];
beforeEach(() => {
	transport = installClipboard();
});
afterEach(() => {
	cleanup.splice(0).forEach((dispose) => dispose());
	transport.restore();
	vi.restoreAllMocks();
	document.body.replaceChildren();
});
async function setup() {
	const view = await clipboardViewer();
	cleanup.push(() => {
		view.dispose();
		view.controller.destroy();
	});
	return view;
}
it('uses prepared synchronous native clipboard events without asynchronous browser transport', async () => {
	const view = await setup();
	Reflect.deleteProperty(navigator, 'clipboard');
	view.commands.render(view.controller.state);
	expect(view.button('copy').disabled).toBe(true);
	let text = '';
	const data = {
		getData: vi.fn(() => text),
		setData: vi.fn((_type: string, value: string) => {
			text = value;
		}),
	};
	const copy = nativeClipboardEvent('copy', data);
	view.viewport.dispatchEvent(copy);
	expect(copy.defaultPrevented).toBe(true);
	expect(text.startsWith('OOXML-VISIO-SHAPES/1\n')).toBe(true);
	expect(data.setData).toHaveBeenCalledWith('text/plain', text);
	await vi.waitFor(() => expect(view.feedback).toContain('Copied selected shapes.'));
	expect(view.edits).toEqual([]);
	view.controller.clearSelection();
	const paste = nativeClipboardEvent('paste', data);
	view.viewport.dispatchEvent(paste);
	expect(paste.defaultPrevented).toBe(true);
	await vi.waitFor(() => expect(view.controller.state.document!.pages[0]!.shapes).toHaveLength(2));
	expect(data.getData).toHaveBeenCalledWith('text/plain');
	expect(transport.clipboard.writeText).not.toHaveBeenCalled();
	expect(transport.clipboard.readText).not.toHaveBeenCalled();
});
it('leaves native text clipboard events and keyboard shortcuts alone across input shadow roots', async () => {
	const view = await setup();
	const host = document.createElement('div');
	const shadow = host.attachShadow({ mode: 'open' });
	const input = document.createElement('textarea');
	shadow.append(input);
	const editable = document.createElement('div');
	editable.setAttribute('contenteditable', 'true');
	const nested = document.createElement('span');
	editable.append(nested);
	view.root.append(host, editable);
	for (const target of [input, nested])
		for (const operation of ['copy', 'cut', 'paste']) {
			const data = { getData: vi.fn(() => 'native text'), setData: vi.fn() };
			const event = nativeClipboardEvent(operation, data);
			target.dispatchEvent(event);
			expect(event.defaultPrevented).toBe(false);
			expect(data.getData).not.toHaveBeenCalled();
			expect(data.setData).not.toHaveBeenCalled();
			const key = new KeyboardEvent('keydown', {
				key: operation === 'copy' ? 'c' : operation === 'cut' ? 'x' : 'v',
				ctrlKey: true,
				bubbles: true,
				composed: true,
				cancelable: true,
			});
			target.dispatchEvent(key);
			expect(key.defaultPrevented).toBe(false);
		}
	expect(transport.clipboard.writeText).not.toHaveBeenCalled();
	expect(transport.clipboard.readText).not.toHaveBeenCalled();
	expect(view.edits).toEqual([]);
});
it('routes Ctrl+C, Ctrl+V, and Ctrl+X through the same source-backed actions', async () => {
	const view = await setup();
	const press = (key: string) => {
		const event = new KeyboardEvent('keydown', {
			key,
			ctrlKey: true,
			bubbles: true,
			composed: true,
			cancelable: true,
		});
		view.viewport.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(true);
	};
	press('c');
	await vi.waitFor(() => expect(view.feedback).toContain('Copied selected shapes.'));
	press('v');
	await vi.waitFor(() => expect(view.feedback).toContain('Pasted shapes.'));
	expect(view.controller.state.document!.pages[0]!.shapes).toHaveLength(2);
	await vi.waitFor(() => expect(view.controller.state.clipboard.ready).toBe(true));
	press('x');
	await vi.waitFor(() => expect(view.feedback).toContain('Cut selected shapes.'));
	expect(view.controller.state.document!.pages[0]!.shapes).toHaveLength(1);
	expect(view.edits).toHaveLength(2);
});
it('initiates ClipboardItem promise writes before prepared capture resolves and refuses stale cut', async () => {
	const view = await setup();
	const payload = deferred<string>();
	const prepared = view.controller.getPreparedClipboard.bind(view.controller);
	vi.spyOn(view.controller, 'getPreparedClipboard').mockImplementation((token) => {
		prepared(token);
		return null;
	});
	vi.spyOn(view.controller, 'prepareClipboardSelection').mockReturnValue(payload.promise);
	const descriptor = Object.getOwnPropertyDescriptor(window, 'ClipboardItem');
	class Item {
		constructor(readonly data: Record<string, Promise<Blob>>) {}
	}
	Object.defineProperty(window, 'ClipboardItem', { configurable: true, value: Item });
	cleanup.push(() => {
		if (descriptor) Object.defineProperty(window, 'ClipboardItem', descriptor);
		else Reflect.deleteProperty(window, 'ClipboardItem');
	});
	const write = vi.fn(async (items: Item[]) => {
		await items[0]!.data['text/plain'];
	});
	Object.defineProperty(navigator, 'clipboard', {
		configurable: true,
		value: { write, readText: transport.clipboard.readText },
	});
	view.commands.render({
		...view.controller.state,
		clipboard: { ready: false, preparing: true, error: null },
	});
	expect(view.button('copy').disabled).toBe(false);
	const run = view.commands.clipboard('cut');
	expect(write).toHaveBeenCalledTimes(1);
	expect(view.controller.prepareClipboardSelection).toHaveBeenCalledTimes(1);
	expect(view.edits).toEqual([]);
	view.controller.clearSelection();
	payload.resolve('OOXML-VISIO-SHAPES/1\nprepared');
	await expect(run).rejects.toMatchObject({ name: 'AbortError' });
	expect(view.controller.exportVsdx().bytes).toEqual(view.bytes);
});
it('refuses native cut when clipboard data cannot be written and preserves the source', async () => {
	const view = await setup();
	const event = nativeClipboardEvent('cut', {
		getData: () => '',
		setData: () => {
			throw new Error('Native write denied');
		},
	});
	view.viewport.dispatchEvent(event);
	expect(event.defaultPrevented).toBe(true);
	await vi.waitFor(() => expect(view.feedback).toContain('Native write denied'));
	expect(view.controller.exportVsdx().bytes).toEqual(view.bytes);
	expect(view.edits).toEqual([]);
});
