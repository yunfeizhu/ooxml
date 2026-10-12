import { vi } from 'vitest';
import type { ViewerOptions, ViewerEvents } from 'ooxml-ui/visio';
import type { MountedViewer } from 'ooxml-ui/visio';
export interface FakeBinding {
	binding: MountedViewer;
	options: ViewerOptions;
	destroyed: boolean;
	update: ReturnType<typeof vi.fn>;
	destroy: ReturnType<typeof vi.fn>;
	/** Minimal controller store: native state hooks subscribe to it. */
	listeners: Set<(state: Record<string, unknown>) => void>;
	state: Record<string, unknown>;
}
const mocks = vi.hoisted(() => ({ instances: [] as FakeBinding[], mount: vi.fn() }));
vi.mock('ooxml-ui/visio', async (importOriginal) => ({
	...(await importOriginal<typeof import('ooxml-ui/visio')>()),
	// oxlint-disable-next-line typescript/no-extraneous-class -- stands in for the real class.
	ViewerController: class ViewerController {},
	mountViewer: mocks.mount.mockImplementation((host: HTMLElement, initial: ViewerOptions) => {
		const element = document.createElement('section');
		element.dataset.testViewer = '';
		host.append(element);
		const instance: FakeBinding = {} as FakeBinding;
		const assertAlive = () => {
			if (instance.destroyed) throw new Error('The viewer has been destroyed.');
		};
		const update = vi.fn((options: ViewerOptions) => {
			assertAlive();
			instance.options = { ...instance.options, ...options };
		});
		const destroy = vi.fn(() => {
			instance.destroyed = true;
			element.remove();
		});
		Object.assign(instance, {
			options: initial,
			destroyed: false,
			listeners: new Set(),
			state: { pageIndex: 0, zoom: 1, selectedShape: null, selectedShapes: Object.freeze([]) },
			update,
			destroy,
			binding: {
				element,
				controller: {
					marker: 'controller',
					get state() {
						return instance.state;
					},
					subscribe(listener: (state: Record<string, unknown>) => void) {
						instance.listeners.add(listener);
						listener(instance.state);
						return () => instance.listeners.delete(listener);
					},
				},
				update,
				destroy,
				load: vi.fn(async () => {
					assertAlive();
				}),
				applyEdits: vi.fn(async () => {
					assertAlive();
				}),
				selectShapes: vi.fn(assertAlive),
				selectAll: vi.fn(assertAlive),
				clearSelection: vi.fn(assertAlive),
				replacePlainText: vi.fn(async () => {
					assertAlive();
				}),
				undo: vi.fn(async () => {
					assertAlive();
				}),
				redo: vi.fn(async () => {
					assertAlive();
				}),
				cancelEdit: vi.fn(assertAlive),
				exportVsdx: vi.fn(() => {
					assertAlive();
					return { bytes: new Uint8Array([1, 2]), dirty: true, diagnostics: [] };
				}),
				fit: vi.fn(assertAlive),
				setLayerVisibility: vi.fn(assertAlive),
				resetLayerVisibility: vi.fn(assertAlive),
				exportSvg: vi.fn(() => {
					assertAlive();
					return {
						svg: '<svg/>',
						byteLength: 6,
						pageIndex: 0,
						pageName: 'Mock',
						width: 1,
						height: 1,
						diagnostics: [],
					};
				}),
				createPrintSnapshot: vi.fn(() => {
					assertAlive();
					return { appearance: 'saved-display', pages: [], byteLength: 0 };
				}),
			} as unknown as MountedViewer,
		});
		mocks.instances.push(instance);
		return instance.binding;
	}),
}));
export function current(): FakeBinding {
	return mocks.instances.at(-1)!;
}
export function emit<K extends keyof ViewerEvents>(name: K, value: ViewerEvents[K]): void {
	current().options.events?.[name]?.(value);
}
/** Publish a new controller state snapshot to every subscriber of the current mock. */
export function setState(patch: Record<string, unknown>, target: FakeBinding = current()): void {
	target.state = Object.freeze({ ...target.state, ...patch });
	for (const listener of [...target.listeners]) listener(target.state);
}
export function reset(): void {
	mocks.instances.length = 0;
	mocks.mount.mockClear();
}

export { mocks };
