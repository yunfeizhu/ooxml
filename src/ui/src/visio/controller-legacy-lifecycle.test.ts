import { describe, expect, it, vi } from 'vitest';
import type { VisioDocument } from 'ooxml-core/visio';
import { ViewerController } from './controller';
import { demoDocument } from 'ooxml-core/visio/ui';
import type { CancellableEditor, EditTransactionResult } from './worker-editor';

function scene(format: VisioDocument['format']): VisioDocument {
	return { ...structuredClone(demoDocument), format };
}
function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: Error) => void;
	const promise = new Promise<T>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}
function edited(): EditTransactionResult {
	return {
		bytes: new Uint8Array([2]),
		document: scene('vsdx'),
		changedParts: ['page.xml'],
		diagnostics: [],
	};
}
async function expectReadOnly(viewer: ViewerController) {
	expect(viewer.state.edit).toMatchObject({
		sourceAvailable: false,
		dirty: false,
		canUndo: false,
		canRedo: false,
		busy: false,
	});
	expect(() => viewer.exportVsdx()).toThrow('Open a .vsdx file');
	await expect(viewer.undo()).rejects.toThrow('Open a .vsdx file');
	await expect(viewer.redo()).rejects.toThrow('Open a .vsdx file');
	await expect(viewer.replacePlainText('0', '1', 'blocked')).rejects.toThrow('Open a .vsdx file');
}

describe('source format across legacy load lifecycles', () => {
	it('discards dirty VSDX history on VSD acceptance and starts fresh on a later VSDX', async () => {
		const editor = vi.fn<CancellableEditor>().mockResolvedValue(edited());
		const parser = vi
			.fn()
			.mockResolvedValueOnce(scene('vsdx'))
			.mockResolvedValueOnce(scene('vsd'))
			.mockResolvedValueOnce(scene('vsdx'));
		const viewer = new ViewerController(parser, undefined, editor);
		try {
			await viewer.load(new Uint8Array([1]));
			await viewer.replacePlainText('0', '1', 'changed');
			expect(viewer.state.edit).toMatchObject({ dirty: true, canUndo: true });
			await viewer.load(new Uint8Array([3]));
			await expectReadOnly(viewer);
			viewer.state.document!.format = 'vsdx';
			viewer.cancelLoad();
			viewer.cancelEdit();
			await expectReadOnly(viewer);
			expect(editor).toHaveBeenCalledTimes(1);
			await viewer.load(new Uint8Array([4]));
			expect(viewer.state.edit).toMatchObject({
				sourceAvailable: true,
				dirty: false,
				canUndo: false,
				canRedo: false,
			});
			await viewer.undo();
			expect([...viewer.exportVsdx().bytes]).toEqual([4]);
			expect(parser).toHaveBeenCalledTimes(3);
		} finally {
			viewer.destroy();
		}
	});

	it('cancelling a pending VSD replacement retains accepted VSDX history and ignores its late result', async () => {
		const pending = deferred<VisioDocument>();
		const parser = vi
			.fn()
			.mockResolvedValueOnce(scene('vsdx'))
			.mockImplementationOnce(() => pending.promise)
			.mockResolvedValueOnce(scene('vsdx'));
		const viewer = new ViewerController(parser, undefined, async () => edited());
		try {
			await viewer.load(new Uint8Array([1]));
			await viewer.replacePlainText('0', '1', 'changed');
			const generation = viewer.documentGeneration;
			const replacing = viewer.load(new Uint8Array([3]));
			await Promise.resolve();
			expect(parser).toHaveBeenCalledTimes(2);
			viewer.cancelLoad();
			pending.resolve(scene('vsd'));
			await replacing;
			expect(viewer.documentGeneration).toBe(generation);
			expect(viewer.state.edit).toMatchObject({ dirty: true, canUndo: true });
			expect([...viewer.exportVsdx().bytes]).toEqual([2]);
			await viewer.undo();
			expect([...viewer.exportVsdx().bytes]).toEqual([1]);
		} finally {
			viewer.destroy();
		}
	});

	it.each(['resolve', 'reject'] as const)(
		'ignores a stale VSDX parser %s after a newer VSD load',
		async (completion) => {
			const pending = deferred<VisioDocument>();
			const legacy = scene('vsd');
			const parser = vi
				.fn()
				.mockImplementationOnce(() => pending.promise)
				.mockResolvedValueOnce(legacy);
			const editor = vi.fn<CancellableEditor>();
			const viewer = new ViewerController(parser, undefined, editor);
			const events = vi.fn();
			viewer.onEvent(events);
			try {
				const stale = viewer.load(new Uint8Array([1]));
				await Promise.resolve();
				await viewer.load(new Uint8Array([3]));
				const generation = viewer.documentGeneration;
				if (completion === 'resolve') pending.resolve(scene('vsdx'));
				else pending.reject(new Error('obsolete VSDX parse failure'));
				await stale;
				expect(viewer.state.document).toBe(legacy);
				expect(viewer.documentGeneration).toBe(generation);
				expect(viewer.state.error).toBeNull();
				expect(events.mock.calls.map(([name]) => name)).toEqual(['document-load']);
				legacy.format = 'vsdx';
				await expectReadOnly(viewer);
				expect(editor).not.toHaveBeenCalled();
			} finally {
				viewer.destroy();
			}
		},
	);

	it('cancels deferred source reads before parsing and cannot restore privileges to an accepted VSD', async () => {
		const pending = deferred<Uint8Array>();
		const parser = vi.fn().mockResolvedValue(scene('vsd'));
		const viewer = new ViewerController(parser);
		try {
			await viewer.load(new Uint8Array([3]));
			const reading = viewer.loadSource(() => pending.promise);
			viewer.cancelLoad();
			pending.resolve(new Uint8Array([1]));
			await reading;
			expect(parser).toHaveBeenCalledTimes(1);
			await expectReadOnly(viewer);
		} finally {
			viewer.destroy();
		}
	});

	it('rejects a VSD history parse atomically without moving VSDX undo history', async () => {
		const parser = vi
			.fn()
			.mockResolvedValueOnce(scene('vsdx'))
			.mockResolvedValueOnce(scene('vsd'))
			.mockResolvedValueOnce(scene('vsdx'));
		const viewer = new ViewerController(parser, undefined, async () => edited());
		try {
			await viewer.load(new Uint8Array([1]));
			await viewer.replacePlainText('0', '1', 'changed');
			const document = viewer.state.document;
			const generation = viewer.documentGeneration;
			await expect(viewer.undo()).rejects.toThrow('cannot change the source format');
			expect(viewer.state.document).toBe(document);
			expect(viewer.documentGeneration).toBe(generation);
			expect(viewer.state.edit).toMatchObject({
				dirty: true,
				canUndo: true,
				canRedo: false,
				busy: false,
			});
			expect([...viewer.exportVsdx().bytes]).toEqual([2]);
			await viewer.undo();
			expect([...viewer.exportVsdx().bytes]).toEqual([1]);
		} finally {
			viewer.destroy();
		}
	});

	it('does not resurrect an in-flight VSDX edit after accepting a VSD replacement', async () => {
		const pending = deferred<EditTransactionResult>();
		const parser = vi.fn().mockResolvedValueOnce(scene('vsdx')).mockResolvedValueOnce(scene('vsd'));
		const viewer = new ViewerController(parser, undefined, () => pending.promise);
		try {
			await viewer.load(new Uint8Array([1]));
			const editing = viewer.replacePlainText('0', '1', 'changed');
			const rejected = expect(editing).rejects.toMatchObject({ name: 'AbortError' });
			await viewer.load(new Uint8Array([3]));
			pending.resolve(edited());
			await rejected;
			expect(viewer.state.document?.format).toBe('vsd');
			await expectReadOnly(viewer);
		} finally {
			viewer.destroy();
		}
	});
});
