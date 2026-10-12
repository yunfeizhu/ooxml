import {
	editErrorMessage,
	isEditCancellation,
	visioClipboardShape,
	visioSelectionIsOnPage,
} from 'ooxml-core/visio/ui';
import type { ViewerController, ViewerState } from './controller';
import type { RibbonCommand } from './ribbon-parts';
import { emitRibbonAction } from './ribbon-action';

export type ClipboardOperation = 'copy' | 'cut' | 'paste';
const editable = (event: Event) =>
	event
		.composedPath()
		.some(
			(node) =>
				node instanceof Element &&
				!!node.closest(
					'input, textarea, select, office-ui-select, [contenteditable]:not([contenteditable="false"])',
				),
		);

/** Browser clipboard transport only; payload and source transactions belong to core/controller. */
export class ViewerClipboard {
	#pending = false;
	#request = 0;
	#disposed = false;
	constructor(
		private readonly root: ShadowRoot,
		private readonly controller: ViewerController,
		private readonly announce: (message: string) => void,
		private readonly refresh: () => void,
	) {}
	private get clipboard(): Clipboard | undefined {
		return this.root.ownerDocument.defaultView?.navigator.clipboard;
	}
	/** When asynchronous APIs are absent, the browser's native clipboard event keeps its data. */
	canUseAsync(operation: ClipboardOperation): boolean {
		return operation === 'paste'
			? typeof this.clipboard?.readText === 'function'
			: this.hasPromiseWrite() || typeof this.clipboard?.writeText === 'function';
	}
	private baseReason(state: ViewerState): string {
		if (!state.edit.sourceAvailable) return 'Open a .vsdx file.';
		if (state.loading || state.edit.busy || this.#pending)
			return 'Wait for the current operation to finish.';
		if (!state.document?.pages[state.pageIndex]) return 'Open a page before using the clipboard.';
		return '';
	}
	private selectionReason(state: ViewerState): string {
		const base = this.baseReason(state);
		if (base) return base;
		const page = state.document!.pages[state.pageIndex]!;
		if (!state.selectedShapes.length) return 'Select shapes to copy.';
		if (
			state.selectedShapes.some(
				(shape) => !visioSelectionIsOnPage(shape, page.id) || !visioClipboardShape(page, shape.id),
			)
		)
			return 'Copy does not take lines, connectors, pictures, groups made here, drawn shapes on a layer or with glue, shapes on a locked layer or shapes glued to another shape.';
		if (state.clipboard.error) return editErrorMessage(state.clipboard.error);
		return '';
	}
	private hasPromiseWrite(): boolean {
		return (
			typeof this.clipboard?.write === 'function' &&
			typeof this.root.ownerDocument.defaultView?.ClipboardItem === 'function'
		);
	}
	private operationReason(operation: ClipboardOperation, state: ViewerState): string {
		const reason = operation === 'paste' ? this.baseReason(state) : this.selectionReason(state);
		if (reason) return reason;
		if (!this.canUseAsync(operation))
			return 'Browser clipboard access is unavailable. Use the keyboard clipboard command after the selection is prepared.';
		if (operation !== 'paste' && !state.clipboard.ready && !this.hasPromiseWrite())
			return 'Preparing selected shapes for the clipboard.';
		return '';
	}
	async run(operation: ClipboardOperation, event?: ClipboardEvent): Promise<void> {
		if (this.#disposed || this.#pending)
			throw new DOMException('Clipboard operation was cancelled.', 'AbortError');
		const reason = event
			? operation === 'paste'
				? this.baseReason(this.controller.state)
				: this.selectionReason(this.controller.state)
			: this.operationReason(operation, this.controller.state);
		if (reason) throw new Error(reason);
		const token = this.controller.captureClipboardToken();
		const request = ++this.#request;
		const current = () => !this.#disposed && request === this.#request;
		const assertCurrent = () => {
			if (!current() || !this.controller.state.edit.sourceAvailable)
				throw new DOMException('Clipboard operation was cancelled.', 'AbortError');
		};
		const transport = <T>(start: () => Promise<T>): Promise<T> => {
			const rejected = (error: unknown): never => {
				assertCurrent();
				this.controller.getPreparedClipboard(token);
				throw error;
			};
			try {
				return start().catch(rejected);
			} catch (error) {
				return Promise.reject(error).catch(rejected);
			}
		};
		this.#pending = true;
		let copied = false;
		try {
			let work: Promise<void>;
			// Start the browser API before any await to retain the user's activation.
			if (operation === 'paste') {
				const data = event?.clipboardData;
				if (event && !data) throw new Error('The clipboard event contains no readable data.');
				const text = transport(() =>
					data ? Promise.resolve(data.getData('text/plain')) : this.clipboard!.readText(),
				);
				event?.preventDefault();
				work = text.then(async (value) => {
					assertCurrent();
					await this.controller.pasteClipboardText(value, token);
				});
			} else {
				const prepared = this.controller.getPreparedClipboard(token);
				let written: Promise<void>;
				if (event) {
					if (!event.clipboardData)
						throw new Error('The clipboard event contains no writable data.');
					if (prepared === null)
						throw new Error(
							'Preparing selected shapes for the clipboard. Try again when preparation finishes.',
						);
					written = transport(() => {
						event.clipboardData!.setData('text/plain', prepared);
						event.preventDefault();
						return Promise.resolve();
					});
				} else if (this.hasPromiseWrite()) {
					const view = this.root.ownerDocument.defaultView!;
					const payload =
						prepared === null
							? this.controller.prepareClipboardSelection(token)
							: Promise.resolve(prepared);
					const blob = payload.then((text) => {
						assertCurrent();
						this.controller.getPreparedClipboard(token);
						return new view.Blob([text], { type: 'text/plain' });
					});
					// A rejected write may never consume the item's promise; still observe capture failure.
					void blob.catch(() => {});
					written = transport(() =>
						this.clipboard!.write([
							new view.ClipboardItem({
								'text/plain': blob,
							}),
						]),
					);
				} else {
					if (prepared === null) throw new Error('Preparing selected shapes for the clipboard.');
					written = transport(() => this.clipboard!.writeText(prepared));
				}
				work = written.then(async () => {
					assertCurrent();
					copied = true;
					if (operation === 'cut') await this.controller.cutPreparedSelection(token);
					else this.controller.getPreparedClipboard(token);
				});
			}
			this.refresh();
			await work;
			assertCurrent();
			this.announce(
				operation === 'copy'
					? 'Copied selected shapes.'
					: operation === 'cut'
						? 'Cut selected shapes.'
						: 'Pasted shapes.',
			);
		} catch (error) {
			if (operation === 'cut' && copied && !isEditCancellation(error))
				throw new Error(`Shapes were copied, but could not be cut: ${editErrorMessage(error)}`, {
					cause: error,
				});
			throw error;
		} finally {
			if (current()) {
				this.#pending = false;
				this.refresh();
			}
		}
	}
	wire(): () => void {
		this.#disposed = false;
		const Abort = this.root.ownerDocument.defaultView?.AbortController ?? AbortController;
		const events = new Abort();
		for (const operation of ['copy', 'cut', 'paste'] as const)
			this.root.addEventListener(
				operation,
				(event) => {
					if (event.defaultPrevented || editable(event)) return;
					// Prevent a refused cut from deleting canvas text or leaking a stale native fallback.
					event.preventDefault();
					emitRibbonAction(this.root, {
						type: 'clipboard',
						operation,
						event: event as ClipboardEvent,
					});
				},
				{ signal: events.signal },
			);
		return () => {
			this.#disposed = true;
			++this.#request;
			this.#pending = false;
			events.abort();
		};
	}
	render(state: ViewerState): void {
		for (const operation of ['copy', 'cut', 'paste'] as const) {
			const reason = this.operationReason(operation, state);
			for (const id of operation === 'paste'
				? ['paste', 'paste-item', 'ctx-paste', 'ctx-page-paste']
				: [operation, `ctx-${operation}`]) {
				const button = this.root.querySelector<RibbonCommand & { mainDisabled?: boolean }>(
					`[command="${id}"]`,
				);
				if (!button) continue;
				if (id === 'paste') button.mainDisabled = !!reason;
				else button.disabled = !!reason;
				button.title = reason
					? `${button.getAttribute('label')}: ${reason}`
					: `${button.getAttribute('label')}: supported viewer shape clipboard only; native Visio clipboard formats are unsupported.`;
			}
		}
		const paste = this.root.querySelector<RibbonCommand & { mainDisabled: boolean }>(
			'[command="paste"]',
		);
		const duplicate = this.root.querySelector<RibbonCommand>('[command="duplicate"]');
		if (paste) paste.disabled = !!paste.mainDisabled && (!duplicate || duplicate.disabled);
	}
}
