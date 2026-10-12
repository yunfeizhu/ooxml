/**
 * `<xlsx-editor>`: the properties, attributes and lifecycle. Methods are in element-api.ts, state
 * in editor-core.ts and the DOM in editor-shell.ts.
 */
import type { Workbook } from 'ooxml-core/xlsx';
import {
	DEFAULT_AUTHOR_NAME,
	DEFAULT_FILE_NAME,
	XLSX_EDITOR_ATTRIBUTES,
	applyAttribute,
	isXlsxEditorAttribute,
	reflectAttribute,
} from './editor-attributes';
import type { RibbonAddInTab } from '../ribbon/add-in-tabs';
import { buildShell, type Shell } from './editor-shell';
import { XlsxEditorApi } from './element-api';
import type { XlsxEditorEventMap } from './events';
import type { XlsxCollaborationOptions } from './collaboration-types';
import type { EditorLocale, EditorLocaleInput } from 'ooxml-core/xlsx/ui';
import {
	applyThemeColors,
	normalizeThemeMode,
	type EditorThemeMode,
	type XlsxTheme,
} from './theme';

/** Theme tokens, applied to the host as `--xve-<kebab-key>` custom properties. */
export type XlsxThemeColors = Partial<XlsxTheme>;

type Listener<K extends keyof XlsxEditorEventMap> = (
	this: XlsxEditorElement,
	event: CustomEvent<XlsxEditorEventMap[K]>,
) => unknown;

/** Typed event overloads (redeclaring hides the inherited ones, so the DOM map is repeated). */
export interface XlsxEditorElement {
	addEventListener<K extends keyof XlsxEditorEventMap>(
		type: K,
		listener: Listener<K>,
		options?: boolean | AddEventListenerOptions,
	): void;
	addEventListener<K extends keyof HTMLElementEventMap>(
		type: K,
		listener: (this: XlsxEditorElement, event: HTMLElementEventMap[K]) => unknown,
		options?: boolean | AddEventListenerOptions,
	): void;
	addEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject,
		options?: boolean | AddEventListenerOptions,
	): void;
	removeEventListener<K extends keyof XlsxEditorEventMap>(
		type: K,
		listener: Listener<K>,
		options?: boolean | EventListenerOptions,
	): void;
	removeEventListener<K extends keyof HTMLElementEventMap>(
		type: K,
		listener: (this: XlsxEditorElement, event: HTMLElementEventMap[K]) => unknown,
		options?: boolean | EventListenerOptions,
	): void;
	removeEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject,
		options?: boolean | EventListenerOptions,
	): void;
}

export class XlsxEditorElement extends XlsxEditorApi {
	static get observedAttributes(): readonly string[] {
		return XLSX_EDITOR_ATTRIBUTES;
	}
	private shell: Shell | undefined;
	private addIns: readonly RibbonAddInTab[] = [];

	connectedCallback(): void {
		if (this.shell) return;
		this.shell = buildShell(this.core);
		this.chrome = this.shell.chrome;
		this.openShare = () => this.shell?.backstage.open('share');
		if (this.addIns.length) this.shell.ribbon.setAddIns(this.addIns);
		this.core.requestRender();
	}

	attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
		if (isXlsxEditorAttribute(name)) applyAttribute(this, name, value);
	}

	/** Interface language: `en`, `fr`, `de`, `es`, `zh-CN` (any tag mapping to one). */
	get locale(): EditorLocale {
		return this.core.locale;
	}
	set locale(value: EditorLocaleInput) {
		this.core.setLocale(value);
		reflectAttribute(this, 'locale', this.core.locale);
	}

	get readOnly(): boolean {
		return this.core.readOnly;
	}
	set readOnly(value: boolean) {
		this.core.setReadOnly(Boolean(value));
		reflectAttribute(this, 'read-only', this.core.readOnly);
	}

	/** Shown in the title bar and used by Save and Download. Default `Book1.xlsx`. */
	get fileName(): string {
		return this.core.fileName;
	}
	set fileName(value: string) {
		this.core.fileName = value || DEFAULT_FILE_NAME;
		this.chrome?.fileNameChanged();
		reflectAttribute(this, 'file-name', this.core.fileName);
	}

	/** Author recorded on new comments. Default `Author`. */
	get authorName(): string {
		return this.core.authorName;
	}
	set authorName(value: string) {
		this.core.authorName = value || DEFAULT_AUTHOR_NAME;
		reflectAttribute(this, 'author-name', this.core.authorName);
	}

	/** `light`, `dark` or `auto` (default, follows the OS). */
	get theme(): EditorThemeMode {
		return this.core.theme;
	}
	set theme(value: EditorThemeMode) {
		this.core.theme = normalizeThemeMode(value);
		reflectAttribute(this, 'theme', this.core.theme);
	}

	get showToolbar(): boolean {
		return this.core.showToolbar;
	}
	set showToolbar(value: boolean) {
		this.core.showToolbar = value !== false;
		reflectAttribute(this, 'show-toolbar', this.core.showToolbar);
		this.core.requestRender();
	}

	get showFormulaBar(): boolean {
		return this.core.showFormulaBar;
	}
	set showFormulaBar(value: boolean) {
		this.core.showFormulaBar = value !== false;
		reflectAttribute(this, 'show-formula-bar', this.core.showFormulaBar);
		this.core.requestRender();
	}

	/** Token overrides applied inline as `--xve-*` custom properties. */
	get themeColors(): XlsxThemeColors {
		return this.core.themeColors;
	}
	set themeColors(value: XlsxThemeColors | undefined) {
		this.core.themeColors = { ...(value ?? {}) };
		this.core.appliedThemeVars = applyThemeColors(
			this,
			this.core.appliedThemeVars,
			this.core.themeColors,
		);
	}

	/** Command ids the ribbon, menus, Tell me and shortcuts leave out. */
	get hiddenActions(): string[] {
		return this.core.hiddenActions;
	}
	set hiddenActions(value: readonly string[]) {
		this.core.hiddenActions = [...(value ?? [])];
		this.core.requestRender();
	}

	/**
	 * Tabs a host adds after Excel's own, as an Office add-in does. Each command runs its `run`
	 * callback and dispatches `office-ribbon-add-in` (`{ tab, command }`) from the editor.
	 */
	get ribbonAddIns(): readonly RibbonAddInTab[] {
		return this.addIns;
	}
	set ribbonAddIns(value: readonly RibbonAddInTab[]) {
		this.addIns = value ?? [];
		this.shell?.ribbon.setAddIns(this.addIns);
	}

	/** The open workbook model, or null. Assigning one shows it with a fresh undo history. */
	get workbook(): Workbook | null {
		return this.core.workbook ?? null;
	}
	set workbook(value: Workbook | null) {
		this.core.loadGeneration++;
		this.core.setWorkbook(value ?? undefined);
		this.chrome?.setSaveState('saved');
	}

	/** Unsaved changes since the last load, save or `markClean()`. */
	get dirty(): boolean {
		return this.core.dirty.dirty;
	}

	/**
	 * Shares the open workbook in a room while set: a workbook opened later joins the same room
	 * (the room's content wins when it already has a workbook); `null` leaves it. A window joining
	 * an existing room still needs a workbook open (`newWorkbook()` is enough).
	 */
	get collaboration(): XlsxCollaborationOptions | null {
		return this.core.collab.wanted ?? null;
	}
	set collaboration(value: XlsxCollaborationOptions | null | undefined) {
		this.core.collab.want(value ?? undefined);
	}

	get activeSheet(): number {
		return this.core.activeSheet;
	}
	set activeSheet(index: number) {
		this.setActiveSheet(index);
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'xlsx-editor': XlsxEditorElement;
	}
}

/** Registers `<xlsx-editor>` once; a no-op without `customElements` (server rendering). */
export function defineXlsxEditor(): void {
	if (typeof customElements === 'undefined' || customElements.get('xlsx-editor')) return;
	customElements.define('xlsx-editor', XlsxEditorElement);
}
