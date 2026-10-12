import {
	defineXlsxEditor,
	type EditorLocaleInput,
	type EditorThemeMode,
	type RibbonAddInCommandDetail,
	type RibbonAddInTab,
	type SelectionChangeDetail,
	type XlsxCollaborationOptions,
	type XlsxCollaborationState,
	type XlsxEditorElement,
	type XlsxEditorEventDetail,
	type XlsxEditorEventName,
	type XlsxThemeColors,
} from 'xlsx-web-component';
import type { Workbook } from '@christophervr/xlsx-core';
import { createPropTracker, createSrcLoader, sameList, sameThemeColors } from './forwarding';

/** Editor state a framework passes down as props. */
export interface EditorProps {
	// Framework props are `T | undefined` when unset, so `undefined` means "not provided".
	/** A workbook model to show. Re-assigned only when a new object is passed (never echoed back). */
	workbook?: Workbook | undefined;
	/** File bytes to open (.xlsx, .xlsm, .xls, .csv); loaded again whenever a new array is passed. */
	bytes?: Uint8Array | ArrayBuffer | undefined;
	/** URL of a file to fetch and open; fetched again when the string changes. */
	src?: string | undefined;
	/** Name shown in the title bar and used by Save and Download. Default `Book1.xlsx`. */
	fileName?: string | undefined;
	readOnly?: boolean | undefined;
	/** Interface language: `en`, `fr`, `de`, `es`, `zh-CN`, or a tag such as `de-DE` that maps to one. */
	locale?: EditorLocaleInput | undefined;
	/** `light`, `dark`, or `auto` (default) to follow the OS color scheme. */
	theme?: EditorThemeMode | undefined;
	/** Author recorded on new comments. Default `Author`. */
	authorName?: string | undefined;
	/** Ribbon visibility. Default true. */
	showToolbar?: boolean | undefined;
	/** Formula bar and name box visibility. Default true. */
	showFormulaBar?: boolean | undefined;
	/** Ribbon controls to hide, by stable id. */
	hiddenActions?: readonly string[] | undefined;
	/** Tabs the host adds after Excel's own, as an Office add-in does. */
	ribbonAddIns?: readonly RibbonAddInTab[] | undefined;
	/** Theme token overrides, applied as `--xve-*` custom properties. */
	themeColors?: XlsxThemeColors | undefined;
	/**
	 * Shares the open workbook in a room while set (room id, server URL or provider, user name and
	 * colour); forwarded when a new object is passed, and `undefined` or `null` leaves the room.
	 */
	collaboration?: XlsxCollaborationOptions | null | undefined;
}
/** Editor callbacks; each is the framework-neutral form of one entry in `EDITOR_EVENT_NAMES`. */
export interface EditorEventOptions {
	onWorkbookChange?: ((workbook: Workbook) => void) | undefined;
	onWorkbookError?: ((error: Error) => void) | undefined;
	onSelectionChange?: ((detail: SelectionChangeDetail) => void) | undefined;
	onDirtyChange?: ((dirty: boolean) => void) | undefined;
	/** The user toggled Editing / Viewing (or `readOnly` changed); lets a controlled parent sync. */
	onReadOnlyChange?: ((readOnly: boolean) => void) | undefined;
	/** The user changed the shown ribbon commands (File > Options > Customize Ribbon). */
	onRibbonCustomize?: ((hiddenActions: string[]) => void) | undefined;
	/** A command of a host tab (`ribbonAddIns`) was chosen. */
	onRibbonAddIn?: ((detail: RibbonAddInCommandDetail) => void) | undefined;
	/** Sharing started or stopped, the connection changed, or someone joined or left. */
	onCollaborationChange?: ((state: XlsxCollaborationState) => void) | undefined;
	/** Called once, after the element is created and attached. */
	onReady?: ((element: XlsxEditorElement) => void) | undefined;
}
export interface EditorOptions extends EditorProps, EditorEventOptions {}

/** Single source of truth for the prop keys every adapter forwards. */
export const EDITOR_PROP_KEYS = [
	'workbook',
	'bytes',
	'src',
	'fileName',
	'readOnly',
	'locale',
	'theme',
	'authorName',
	'showToolbar',
	'showFormulaBar',
	'hiddenActions',
	'ribbonAddIns',
	'themeColors',
	'collaboration',
] as const satisfies readonly (keyof EditorProps)[];
export type EditorPropKey = (typeof EDITOR_PROP_KEYS)[number];
// Compile-time guard: adding a key to EditorProps without listing it above is an error.
const propKeysAreComplete: Exclude<keyof EditorProps, EditorPropKey> extends never ? true : never =
	true;
void propKeysAreComplete;

/** Single source of truth for the element events every adapter surfaces. */
export const EDITOR_EVENT_NAMES = [
	'workbook-change',
	'workbook-error',
	'selection-change',
	'dirty-change',
	'readonly-change',
	'ribbon-customize',
	'office-ribbon-add-in',
	'collaboration-change',
] as const satisfies readonly XlsxEditorEventName[];
export type EditorEventName = (typeof EDITOR_EVENT_NAMES)[number];
/** One handler per bound event (unwrapped payload); a missing key is a compile error in every adapter. */
export interface EditorEventHandlers {
	'workbook-change': EditorEventOptions['onWorkbookChange'];
	'workbook-error': EditorEventOptions['onWorkbookError'];
	'selection-change': EditorEventOptions['onSelectionChange'];
	'dirty-change': EditorEventOptions['onDirtyChange'];
	'readonly-change': EditorEventOptions['onReadOnlyChange'];
	'ribbon-customize': EditorEventOptions['onRibbonCustomize'];
	'office-ribbon-add-in': EditorEventOptions['onRibbonAddIn'];
	'collaboration-change': EditorEventOptions['onCollaborationChange'];
	ready?: EditorEventOptions['onReady'];
}

function copyProp<K extends EditorPropKey>(to: EditorProps, from: EditorProps, key: K): void {
	to[key] = from[key];
}
/** Copies exactly the shared props out of a framework's props/instance object. */
export function pickEditorProps(source: EditorProps): EditorProps {
	const picked: EditorProps = {};
	for (const key of EDITOR_PROP_KEYS) copyProp(picked, source, key);
	return picked;
}
/** Maps per-event handlers (keyed by DOM event name) onto the shared option callbacks. */
export function eventOptions(handlers: EditorEventHandlers): EditorEventOptions {
	return {
		onWorkbookChange: handlers['workbook-change'],
		onWorkbookError: handlers['workbook-error'],
		onSelectionChange: handlers['selection-change'],
		onDirtyChange: handlers['dirty-change'],
		onReadOnlyChange: handlers['readonly-change'],
		onRibbonCustomize: handlers['ribbon-customize'],
		onRibbonAddIn: handlers['office-ribbon-add-in'],
		onCollaborationChange: handlers['collaboration-change'],
		onReady: handlers.ready,
	};
}

export interface EditorHandle {
	readonly element: XlsxEditorElement;
	load(input: Uint8Array | ArrayBuffer, fileName?: string): Promise<void>;
	newWorkbook(): void;
	/** The saved workbook as an .xlsx Blob. Does not clear `dirty`; call `markClean()` after persisting it. */
	save(): Promise<Blob>;
	saveBytes(format?: 'xlsx' | 'csv'): Promise<Uint8Array>;
	/** Saves and downloads in the browser, then marks the workbook clean. */
	download(fileName?: string): Promise<void>;
	markClean(): void;
	select(ref: string): void;
	getSelection(): string;
	setActiveSheet(index: number): void;
	/** Opens File > Share, where the user starts or stops sharing the workbook. */
	share(): void;
	readonly dirty: boolean;
}
export interface EditorBinding extends EditorHandle {
	update(options: EditorOptions): void;
	destroy(): void;
}

/**
 * A handle for adapters that hold a binding which may not be mounted yet: every call reads the
 * current binding and throws a clear error before mount.
 */
export function deferredHandle(current: () => EditorBinding | null | undefined): EditorHandle {
	const get = (): EditorBinding => {
		const binding = current();
		if (!binding) throw new Error('Editor is not mounted');
		return binding;
	};
	return {
		get element() {
			return get().element;
		},
		load: async (input, fileName) => get().load(input, fileName),
		newWorkbook: () => get().newWorkbook(),
		save: async () => get().save(),
		saveBytes: async (format) => get().saveBytes(format),
		download: async (fileName) => get().download(fileName),
		markClean: () => current()?.markClean(),
		select: (ref) => get().select(ref),
		getSelection: () => get().getSelection(),
		setActiveSheet: (index) => get().setActiveSheet(index),
		share: () => get().share(),
		get dirty() {
			return current()?.dirty ?? false;
		},
	};
}

type Listener<K extends EditorEventName> = (event: CustomEvent<XlsxEditorEventDetail<K>>) => void;

/** All framework adapters share property, event and lifecycle semantics here. */
export function mountEditor(host: HTMLElement, initial: EditorOptions = {}): EditorBinding {
	defineXlsxEditor();
	const element = host.ownerDocument.createElement('xlsx-editor');
	let options: EditorOptions = {};
	let lastInput: Workbook | undefined;
	let lastEmitted: Workbook | undefined;
	let lastBytes: Uint8Array | ArrayBuffer | undefined;
	let lastSrc: string | undefined;
	let destroyed = false;
	const changed = createPropTracker<EditorPropKey>();
	const reportError = (cause: unknown) => {
		if (destroyed) return;
		options.onWorkbookError?.(cause instanceof Error ? cause : new Error(String(cause)));
	};
	// The element reports load failures itself (`workbook-error`); only swallow the rejection here.
	const loadQuietly = (input: Uint8Array | ArrayBuffer, fileName: string | undefined) =>
		element.load(input, fileName).catch(() => undefined);
	const src = createSrcLoader(loadQuietly, reportError);

	const listeners: { [K in EditorEventName]: Listener<K> } = {
		'workbook-change': (event) => {
			lastEmitted = event.detail.workbook;
			options.onWorkbookChange?.(lastEmitted);
		},
		'workbook-error': (event) => options.onWorkbookError?.(event.detail.error),
		'selection-change': (event) => options.onSelectionChange?.(event.detail),
		'dirty-change': (event) => options.onDirtyChange?.(event.detail.dirty),
		'readonly-change': (event) => options.onReadOnlyChange?.(event.detail.readOnly),
		'ribbon-customize': (event) => options.onRibbonCustomize?.([...event.detail.hiddenActions]),
		'office-ribbon-add-in': (event) => options.onRibbonAddIn?.(event.detail),
		'collaboration-change': (event) => options.onCollaborationChange?.(event.detail),
	};
	const listen = (add: boolean) => {
		for (const name of EDITOR_EVENT_NAMES) {
			const listener = listeners[name] as EventListener;
			if (add) element.addEventListener(name, listener);
			else element.removeEventListener(name, listener);
		}
	};
	listen(true);

	const binding: EditorBinding = {
		element,
		update(next) {
			if (destroyed) return;
			options = next;
			// Each prop is forwarded only when the prop itself changed since it was last forwarded,
			// so a re-render never undoes a change the user made inside the editor.
			if (changed('locale', next.locale)) element.locale = next.locale ?? 'en';
			if (changed('readOnly', next.readOnly)) element.readOnly = next.readOnly ?? false;
			if (changed('theme', next.theme)) element.theme = next.theme ?? 'auto';
			if (changed('authorName', next.authorName)) element.authorName = next.authorName ?? 'Author';
			if (changed('showToolbar', next.showToolbar)) element.showToolbar = next.showToolbar ?? true;
			if (changed('showFormulaBar', next.showFormulaBar))
				element.showFormulaBar = next.showFormulaBar ?? true;
			if (changed('hiddenActions', next.hiddenActions, sameList))
				element.hiddenActions = [...(next.hiddenActions ?? [])];
			// The element keeps panels whose look is unchanged, so a fresh array per render is cheap.
			if (changed('ribbonAddIns', next.ribbonAddIns))
				element.ribbonAddIns = next.ribbonAddIns ?? [];
			if (changed('themeColors', next.themeColors, sameThemeColors))
				element.themeColors = { ...next.themeColors };
			// The element renames itself on File > Open; only forward a name the parent changed.
			if (changed('fileName', next.fileName) && next.fileName !== undefined)
				element.fileName = next.fileName;
			// After `fileName`, before the workbook: a workbook opened below joins the room.
			if (changed('collaboration', next.collaboration ?? null))
				element.collaboration = next.collaboration ?? null;
			if (next.workbook && next.workbook !== lastInput && next.workbook !== lastEmitted) {
				src.cancel();
				element.workbook = next.workbook;
			}
			lastInput = next.workbook;
			if (next.bytes && next.bytes !== lastBytes) {
				src.cancel();
				void loadQuietly(next.bytes, next.fileName);
			}
			lastBytes = next.bytes;
			if (next.src && next.src !== lastSrc) src.fetch(next.src, next.fileName);
			else if (!next.src && lastSrc) src.cancel();
			lastSrc = next.src;
		},
		load: (input, fileName) => {
			src.cancel();
			return element.load(input, fileName);
		},
		newWorkbook: () => element.newWorkbook(),
		save: () => element.save(),
		saveBytes: (format) => element.saveBytes(format),
		download: (fileName) => element.download(fileName),
		markClean: () => element.markClean(),
		select: (ref) => element.select(ref),
		getSelection: () => element.getSelection(),
		setActiveSheet: (index) => element.setActiveSheet(index),
		share: () => element.share(),
		get dirty() {
			return element.dirty;
		},
		destroy() {
			if (destroyed) return;
			destroyed = true;
			src.cancel();
			// Leave the room: an unmounted editor must not keep editing the shared workbook. (Checked,
			// so the binding still works on an ooxml-ui release without collaboration.)
			if (typeof element.stopCollaboration === 'function') element.stopCollaboration();
			listen(false);
			element.remove();
		},
	};
	binding.update(initial);
	host.append(element);
	options.onReady?.(element);
	return binding;
}

/**
 * The imperative handle every framework exposes (React ref, Vue template ref, Angular component
 * instance, Solid `editorRef`, Svelte component instance). `handle-keys.test.ts` checks each one.
 */
export const EDITOR_HANDLE_KEYS = [
	'element',
	'load',
	'newWorkbook',
	'save',
	'saveBytes',
	'download',
	'markClean',
	'select',
	'getSelection',
	'setActiveSheet',
	'share',
	'dirty',
] as const satisfies readonly (keyof EditorHandle)[];
export type EditorHandleKey = (typeof EDITOR_HANDLE_KEYS)[number];
// Compile-time guard: adding a member to EditorHandle without listing it above is an error.
const handleKeysAreComplete: Exclude<keyof EditorHandle, EditorHandleKey> extends never
	? true
	: never = true;
void handleKeysAreComplete;
