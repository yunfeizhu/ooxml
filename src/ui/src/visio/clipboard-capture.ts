import { createWorkerClipboardCapture, type CancellableClipboardCapture } from './worker-clipboard';

export interface ViewerClipboardState {
	readonly ready: boolean;
	readonly preparing: boolean;
	readonly error: Error | null;
}
export const EMPTY_CLIPBOARD_STATE: ViewerClipboardState = Object.freeze({
	ready: false,
	preparing: false,
	error: null,
});
const tokenBrand: unique symbol = Symbol('viewer clipboard token');
export interface ViewerClipboardToken {
	readonly [tokenBrand]: true;
}
/** Scalar identity only: pending host tokens retain no document model or source bytes. */
export interface ClipboardContext {
	readonly sourceGeneration: number;
	readonly documentGeneration: number;
	readonly operationGeneration: number;
	readonly selectionIntent: number;
	readonly pageId: string;
	readonly selectionCount: number;
	readonly shapeIds: readonly string[];
}
interface Entry {
	readonly context: ClipboardContext;
	readonly promise: Promise<string>;
	text?: string;
	error?: Error;
}
const same = (a: ClipboardContext, b: ClipboardContext) =>
	a.sourceGeneration === b.sourceGeneration &&
	a.documentGeneration === b.documentGeneration &&
	a.operationGeneration === b.operationGeneration &&
	a.selectionIntent === b.selectionIntent &&
	a.pageId === b.pageId;

/** One prepared capture shared by gestures and native clipboard events. No Office format logic. */
export class ViewerClipboardCapture {
	#tokens = new WeakMap<ViewerClipboardToken, ClipboardContext>();
	#entry: Entry | undefined;
	#state = EMPTY_CLIPBOARD_STATE;
	#destroyed = false;
	constructor(
		private readonly context: () => ClipboardContext | undefined,
		private readonly bytes: () => Uint8Array,
		private readonly changed: (state: ViewerClipboardState) => void,
		private readonly capture: CancellableClipboardCapture = createWorkerClipboardCapture(),
	) {}
	token(): ViewerClipboardToken {
		const context = this.context();
		if (this.#destroyed || !context)
			throw new Error('Open a .vsdx file before using the clipboard.');
		const token = Object.freeze({ [tokenBrand]: true as const });
		this.#tokens.set(token, context);
		return token;
	}
	require(token: ViewerClipboardToken): ClipboardContext {
		const captured = this.#tokens.get(token),
			current = this.context();
		if (this.#destroyed || !captured || !current || !same(captured, current))
			throw new DOMException('The clipboard action was superseded or cancelled.', 'AbortError');
		return captured;
	}
	prepared(token: ViewerClipboardToken): string | null {
		const context = this.require(token);
		return this.#entry && same(context, this.#entry.context) ? (this.#entry.text ?? null) : null;
	}
	prepare(token: ViewerClipboardToken): Promise<string> {
		const context = this.require(token);
		if (!context.selectionCount || context.selectionCount > 1000)
			return Promise.reject(
				new Error('Copy and Cut require between one and 1000 current-page shapes.'),
			);
		if (this.#entry && same(context, this.#entry.context) && !this.#entry.error)
			return this.#entry.promise;
		return this.#start(context);
	}
	refresh(): void {
		if (this.#destroyed) return;
		const context = this.context();
		if (this.#entry && (!context || !same(context, this.#entry.context))) {
			this.#entry = undefined;
			this.capture.cancel?.();
		}
		if (!context || !context.selectionCount || context.selectionCount > 1000) {
			this.#publish(EMPTY_CLIPBOARD_STATE);
			return;
		}
		if (!this.#entry) void this.#start(context).catch(() => {});
	}
	#start(context: ClipboardContext): Promise<string> {
		this.capture.cancel?.();
		const promise = Promise.resolve().then(() => {
			const current = this.context();
			if (this.#destroyed || this.#entry !== entry || !current || !same(context, current))
				throw new DOMException('Clipboard capture was superseded or cancelled.', 'AbortError');
			return this.capture(this.bytes(), context.pageId, context.shapeIds);
		});
		const entry: Entry = {
			context,
			promise: promise
				.then((text) => {
					const current = this.context();
					if (this.#destroyed || this.#entry !== entry || !current || !same(context, current))
						throw new DOMException('Clipboard capture was superseded or cancelled.', 'AbortError');
					entry.text = text;
					this.#publish(Object.freeze({ ready: true, preparing: false, error: null }));
					const accepted = this.context();
					if (this.#destroyed || this.#entry !== entry || !accepted || !same(context, accepted))
						throw new DOMException('Clipboard capture was superseded or cancelled.', 'AbortError');
					return text;
				})
				.catch((cause) => {
					if (!this.#destroyed && this.#entry === entry) {
						const error = cause instanceof Error ? cause : new Error(String(cause));
						entry.error = error;
						this.#publish(Object.freeze({ ready: false, preparing: false, error }));
					}
					throw cause;
				}),
		};
		this.#entry = entry;
		this.#publish(Object.freeze({ ready: false, preparing: true, error: null }));
		return entry.promise;
	}
	#publish(state: ViewerClipboardState): void {
		if (
			this.#state.ready === state.ready &&
			this.#state.preparing === state.preparing &&
			this.#state.error === state.error
		)
			return;
		this.#state = state;
		this.changed(state);
	}
	destroy(): void {
		this.#destroyed = true;
		this.#entry = undefined;
		this.#tokens = new WeakMap();
		this.capture.cancel?.();
	}
	/** Called while the controller commits an invalidating state, without nested notification. */
	reset(): void {
		this.#entry = undefined;
		this.#state = EMPTY_CLIPBOARD_STATE;
		this.capture.cancel?.();
	}
}
