import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { parseVsdx } from 'ooxml-core/visio';
import JSZip from 'jszip';
import { clipboardViewer, deferred, installClipboard } from './__fixtures__/clipboard-viewer';
import { wireTellMe } from './viewer-tell-me';

let transport: ReturnType<typeof installClipboard>;
const cleanup: (() => void)[] = [];
beforeEach(() => {
	transport = installClipboard();
});
afterEach(() => {
	cleanup.splice(0).forEach((dispose) => dispose());
	transport.restore();
	document.body.replaceChildren();
	vi.restoreAllMocks();
});
async function setup(source = true) {
	const view = await clipboardViewer(source);
	cleanup.push(() => {
		view.dispose();
		view.controller.destroy();
	});
	return view;
}
it('copies source without an edit, reads actual clipboard on each paste, and retains history selections', async () => {
	const view = await setup();
	expect(view.button('copy').disabled).toBe(false);
	expect(view.button('paste').shadowRoot!.querySelector<HTMLButtonElement>('.main')!.disabled).toBe(
		false,
	);
	view.press('copy');
	await vi.waitFor(() => expect(view.feedback).toContain('Copied selected shapes.'));
	expect(transport.text.startsWith('OOXML-VISIO-SHAPES/1\n')).toBe(true);
	expect(view.edits).toEqual([]);
	expect(view.controller.exportVsdx().bytes).toEqual(view.bytes);
	expect(view.controller.state.edit.canUndo).toBe(false);
	const copied = transport.text;
	view.controller.clearSelection();
	await view.commands.clipboard('paste');
	expect(transport.clipboard.readText).toHaveBeenCalledTimes(1);
	const page = view.controller.state.document!.pages[0]!;
	expect(page.shapes).toHaveLength(2);
	const clone = page.shapes[1]!;
	expect(clone.rotation!.pinX).toBeCloseTo(page.shapes[0]!.rotation!.pinX + 0.33, 10);
	expect(clone.rotation!.pinY).toBeCloseTo(page.shapes[0]!.rotation!.pinY - 0.33, 10);
	expect(view.controller.state.selectedShapes.map((shape) => shape.id)).toEqual([clone.id]);
	expect((await parseVsdx(view.controller.exportVsdx().bytes)).pages[0]!.shapes).toHaveLength(2);
	await view.controller.undo();
	expect(view.controller.state.document!.pages[0]!.shapes).toHaveLength(1);
	expect(view.controller.state.selectedShapes).toEqual([]);
	await view.controller.redo();
	expect(view.controller.state.selectedShape?.id).toBe(clone.id);
	const saved = view.controller.exportVsdx().bytes;
	transport.text = 'Unrelated system clipboard text';
	await expect(view.commands.clipboard('paste')).rejects.toThrow();
	expect(transport.clipboard.readText).toHaveBeenCalledTimes(2);
	expect(view.controller.exportVsdx().bytes).toEqual(saved);
	transport.clipboard.readText.mockRejectedValueOnce(
		new DOMException('Permission denied', 'NotAllowedError'),
	);
	await expect(view.commands.clipboard('paste')).rejects.toThrow('Permission denied');
	expect(view.controller.exportVsdx().bytes).toEqual(saved);
	expect(transport.text).not.toBe(copied);
});
it('leaves Cut source untouched on denied writes and deletes atomically only after a successful write', async () => {
	const view = await setup();
	transport.clipboard.writeText.mockRejectedValueOnce(
		new DOMException('Write denied', 'NotAllowedError'),
	);
	view.press('ctx-cut');
	await vi.waitFor(() =>
		expect(view.feedback.some((message) => message.includes('Write denied'))).toBe(true),
	);
	expect(view.controller.exportVsdx().bytes).toEqual(view.bytes);
	expect(view.controller.state.selectedShape?.id).toBe('1');
	expect(view.controller.state.edit.canUndo).toBe(false);
	expect(view.edits).toEqual([]);
	await view.commands.clipboard('cut');
	expect(view.controller.state.document!.pages[0]!.shapes).toHaveLength(0);
	expect(view.edits).toHaveLength(1);
	expect(view.controller.state.selectedShapes).toEqual([]);
	await view.controller.undo();
	expect(view.controller.exportVsdx().bytes).toEqual(view.bytes);
	expect(view.controller.state.selectedShape?.id).toBe('1');
	await view.commands.clipboard('paste');
	expect(view.controller.state.document!.pages[0]!.shapes).toHaveLength(2);
});
it('reports copied but not cut when source deletion protection refuses the atomic edit', async () => {
	const view = await setup();
	const zip = await JSZip.loadAsync(view.bytes);
	const path = 'visio/pages/page1.xml';
	zip.file(
		path,
		(await zip.file(path)!.async('string')).replace(
			'<Text>Formatted shape</Text>',
			'<Cell N="LockDelete" V="1"/><Text>Formatted shape</Text>',
		),
	);
	const locked = await zip.generateAsync({ type: 'uint8array' });
	await view.controller.load(locked);
	view.selection();
	await vi.waitFor(() => expect(view.controller.state.clipboard.ready).toBe(true));
	await expect(view.commands.clipboard('cut')).rejects.toThrow(
		'Shapes were copied, but could not be cut',
	);
	expect(transport.text.startsWith('OOXML-VISIO-SHAPES/1\n')).toBe(true);
	expect(view.controller.exportVsdx().bytes).toEqual(locked);
	expect(view.controller.state.edit.canUndo).toBe(false);
	expect(view.controller.state.selectedShape?.id).toBe('1');
});
it.each(['selection', 'source', 'destroy'] as const)(
	'cancels delayed Cut after newer %s intent',
	async (kind) => {
		const view = await setup();
		const write = deferred<void>();
		transport.clipboard.writeText.mockReturnValueOnce(write.promise);
		const run = view.commands.clipboard('cut');
		expect(view.button('copy').disabled).toBe(true);
		expect(view.button('ctx-paste').disabled).toBe(true);
		if (kind === 'selection') view.controller.clearSelection();
		else if (kind === 'source') await view.controller.load(view.bytes);
		else view.dispose();
		write.resolve();
		await expect(run).rejects.toMatchObject({ name: 'AbortError' });
		expect(view.controller.exportVsdx().bytes).toEqual(view.bytes);
		expect(view.edits).toEqual([]);
		expect(view.feedback).not.toContain('Cut selected shapes.');
	},
);
it('cancels a delayed Paste after selection changes and never applies the old read result', async () => {
	const view = await setup();
	await view.commands.clipboard('copy');
	const text = transport.text;
	const read = deferred<string>();
	transport.clipboard.readText.mockReturnValueOnce(read.promise);
	const run = view.commands.clipboard('paste');
	view.controller.clearSelection();
	read.resolve(text);
	await expect(run).rejects.toMatchObject({ name: 'AbortError' });
	expect(view.edits).toEqual([]);
	expect(view.controller.exportVsdx().bytes).toEqual(view.bytes);
});
it.each(['copy', 'cut', 'paste'] as const)(
	'suppresses an obsolete %s transport rejection after newer selection intent',
	async (operation) => {
		const view = await setup();
		const read = deferred<string>(),
			write = deferred<void>();
		if (operation === 'paste') transport.clipboard.readText.mockReturnValueOnce(read.promise);
		else transport.clipboard.writeText.mockReturnValueOnce(write.promise);
		view.commands.run({ type: 'clipboard', operation });
		view.controller.clearSelection();
		const failure = new DOMException('Obsolete permission denied', 'NotAllowedError');
		if (operation === 'paste') read.reject(failure);
		else write.reject(failure);
		await vi.waitFor(() =>
			expect(
				view.button('paste').shadowRoot!.querySelector<HTMLButtonElement>('.main')!.disabled,
			).toBe(false),
		);
		expect(view.feedback).toEqual([]);
		expect(view.controller.exportVsdx().bytes).toEqual(view.bytes);
		expect(view.edits).toEqual([]);
	},
);
it('supersedes a synchronous native data rejection when its host callback changes the source', async () => {
	const view = await setup();
	const event = new Event('copy', { bubbles: true, composed: true, cancelable: true });
	Object.defineProperty(event, 'clipboardData', {
		value: {
			setData() {
				view.controller.setDocument(null);
				throw new Error('Obsolete native denial');
			},
		},
	});
	view.viewport.dispatchEvent(event);
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(event.defaultPrevented).toBe(true);
	expect(view.feedback).toEqual([]);
	expect(view.controller.state.document).toBeNull();
	expect(view.edits).toEqual([]);
});
it('suppresses pending transport errors after direct controller destruction', async () => {
	const view = await setup();
	const read = deferred<string>();
	transport.clipboard.readText.mockReturnValueOnce(read.promise);
	view.commands.run({ type: 'clipboard', operation: 'paste' });
	view.controller.destroy();
	read.reject(new DOMException('Obsolete destroyed read', 'NotAllowedError'));
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(view.feedback).toEqual([]);
	expect(view.controller.state.document).toBeNull();
	expect(view.edits).toEqual([]);
});
it('shows clipboard availability honestly in Tell me, including read-only and pending states', async () => {
	const view = await setup(false);
	expect(view.button('copy').disabled).toBe(true);
	expect(view.button('ctx-page-paste').disabled).toBe(true);
	await expect(view.commands.clipboard('copy')).rejects.toThrow('Open a .vsdx file');
	await view.controller.load(view.bytes);
	view.selection();
	await vi.waitFor(() => expect(view.controller.state.clipboard.ready).toBe(true));
	const search = view.root.querySelector('.tell-me') as HTMLElement & {
		commands: { id: string; disabled?: boolean }[];
	};
	const dispose = wireTellMe(view.root);
	cleanup.push(dispose);
	search.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
	expect(search.commands.find((command) => command.id === 'paste')?.disabled).toBe(false);
	expect(search.commands.find((command) => command.id === 'copy')?.disabled).toBe(false);
	const write = deferred<void>();
	transport.clipboard.writeText.mockReturnValueOnce(write.promise);
	const run = view.commands.clipboard('copy');
	search.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
	expect(search.commands.find((command) => command.id === 'copy')?.disabled).toBe(true);
	write.resolve();
	await run;
});
