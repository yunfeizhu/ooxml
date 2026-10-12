import {
	DocumentHistory,
	EMPTY_EDIT_STATE,
	type ViewerEditState,
	type SourceSnapshot,
	type VsdxExportResult,
} from 'ooxml-core/visio/ui';
import { createWorkerEditor, snapshotEdits, type CancellableEditor } from './worker-editor';
import {
	MAX_INPUT_BYTES,
	visioCalloutCommand,
	visioContainerCommand,
	visioWithContainerMembers,
} from 'ooxml-core/visio/ui';
import type { VisioCalloutStyle, VisioContainerStyle } from 'ooxml-core/visio';
import {
	loadVisio,
	createVsdx,
	type CreateVsdxOptions,
	deserializeVisioClipboard,
	type VisioDocument,
	type VisioEdit,
} from 'ooxml-core/visio';
import {
	ViewerClipboardCapture,
	EMPTY_CLIPBOARD_STATE,
	type ViewerClipboardState,
	type ViewerClipboardToken,
	type ClipboardContext,
} from './clipboard-capture';
import { createWorkerClipboardCapture, type CancellableClipboardCapture } from './worker-clipboard';
import {
	ViewerCreationTokens,
	creationCancelled,
	sameCreationContext,
	type CreationContext,
	type ViewerCreationToken,
} from './creation-token';
import {
	EMPTY_SELECTION,
	sameSelection,
	selectionKey,
	snapshotSelection,
	visioDuplicateCommand,
	visioGroupCommand,
	visioUngroupCommand,
	visioSelectionIsOnPage,
	visioPasteCommand,
} from 'ooxml-core/visio/ui';
import {
	EMPTY_LAYER_OVERRIDES,
	documentVisibility,
	visibleSelection,
	type LayerVisibilityOverride,
} from './viewer-layers';
import { assertViewableDocument } from 'ooxml-core/visio/ui';
import type { CancellableParser } from './worker-parser';
import type { ViewerEvents, VisioShapeSelection } from 'ooxml-core/visio/ui';
import {
	EMPTY_TEXT_SEARCH,
	indexDocumentText,
	searchDocumentText,
	validateSearchQuery,
	type DocumentTextIndex,
	type TextSearchState,
} from 'ooxml-core/visio/ui';
import {
	ViewerTextReplacement,
	replacementCancelled,
	sameReplacementContext,
	type ReplacementContext,
	type ViewerTextReplaceToken,
	type ViewerTextReplaceScope,
	type ViewerTextReplacementInput,
} from './replacement-token';
import {
	visioTextOccurrenceSelection,
	type VisioTextOccurrence,
	type VisioTextReplacePlan,
} from 'ooxml-core/visio/ui';

export interface ViewerState {
	readonly document: VisioDocument | null;
	readonly edit: ViewerEditState;
	readonly pageIndex: number;
	readonly zoom: number;
	readonly loading: boolean;
	readonly error: Error | null;
	readonly search: TextSearchState;
	/** Viewer-only display overrides, independent of saved model and print policy. */
	readonly layerVisibilityOverrides: readonly LayerVisibilityOverride[];
	/** Backward-compatible primary selection, the first entry of selectedShapes. */
	readonly selectedShape: VisioShapeSelection | null;
	readonly selectedShapes: readonly VisioShapeSelection[];
	/** Prepared source selection availability for native clipboard gestures. Payload stays private. */
	readonly clipboard: ViewerClipboardState;
}
interface SelectionHistory {
	readonly pageId: string;
	readonly beforePageId?: string;
	readonly afterPageId?: string;
	readonly before: readonly VisioShapeSelection[];
	readonly after: readonly VisioShapeSelection[];
	readonly intent: number;
}
interface PostEditSelection {
	readonly pageId: string;
	readonly shapeIds: readonly string[];
	readonly navigate?: boolean;
}
interface ReplacementMutation {
	readonly context: ReplacementContext;
	readonly owner: object;
	readonly next?: VisioTextOccurrence;
	readonly complete: (context: ReplacementContext) => void;
}
type Parser = CancellableParser;
type EventListener = <K extends keyof ViewerEvents>(name: K, detail: ViewerEvents[K]) => void;
export class ViewerController {
	#state: ViewerState = Object.freeze({
		document: null,
		edit: EMPTY_EDIT_STATE,
		pageIndex: 0,
		zoom: 1,
		loading: false,
		error: null,
		selectedShape: null,
		selectedShapes: EMPTY_SELECTION,
		search: EMPTY_TEXT_SEARCH,
		layerVisibilityOverrides: EMPTY_LAYER_OVERRIDES,
		clipboard: EMPTY_CLIPBOARD_STATE,
	});
	#subscribers = new Set<(state: ViewerState) => void>();
	#events = new Set<EventListener>();
	#loadId = 0;
	#destroyed = false;
	#revision = 0;
	#documentGeneration = 0;
	#sourceGeneration = 0;
	#searchIndex: DocumentTextIndex | null = null;
	#history: DocumentHistory | null = null;
	#selectionHistory = new WeakMap<SourceSnapshot, SelectionHistory>();
	#selectionIntent = 0;
	#viewIntent = 0;
	#creation = new ViewerCreationTokens(() => this.#creationContext());
	#replacementNavigation = 0;
	#replacementOperation:
		| { owner: object; id: number; source: number; document: number }
		| undefined;
	#replacement = new ViewerTextReplacement({
		context: () => this.#replacementContext(),
		document: () => this.#state.document,
		selection: () => this.#state.selectedShapes,
		navigate: (occurrence, context) => this.#navigateReplacement(occurrence, context),
		mutate: (edits, next, context, owner) => this.#applyReplacement(edits, next, context, owner),
		cancel: (owner) => this.#cancelReplacement(owner),
	});
	#sourceFormat: VisioDocument['format'] | null = null;
	#editId = 0;
	#visible = documentVisibility(null);
	#clipboard: ViewerClipboardCapture;
	#clipboardQueued = false;
	constructor(
		private readonly parser: Parser = loadVisio,
		private readonly listenerError: (error: unknown) => void = (error) => {
			if (typeof globalThis.reportError === 'function') globalThis.reportError(error);
			else console.error('Visio viewer listener failed:', error);
		},
		private readonly editor: CancellableEditor = createWorkerEditor(),
		clipboardCapture: CancellableClipboardCapture = createWorkerClipboardCapture(),
	) {
		this.#clipboard = new ViewerClipboardCapture(
			() => this.#clipboardContext(),
			() => this.#history!.current.bytes,
			(clipboard) => {
				if (!this.#destroyed) this.#change({ clipboard });
			},
			clipboardCapture,
		);
	}
	get state(): ViewerState {
		return this.#state;
	}
	/** Accepted document replacements, including the same object, invalidate captured artifacts. */
	get documentGeneration(): number {
		this.#assertAlive();
		return this.#documentGeneration;
	}
	/** Accepted source/model replacements invalidate drafts; edit/undo/redo keep this source epoch. */
	get sourceGeneration(): number {
		this.#assertAlive();
		return this.#sourceGeneration;
	}
	subscribe(listener: (state: ViewerState) => void): () => void {
		this.#assertAlive();
		this.#subscribers.add(listener);
		if (!this.#notify(() => listener(this.#state))) this.#subscribers.delete(listener);
		return () => this.#subscribers.delete(listener);
	}
	onEvent(listener: EventListener): () => void {
		this.#assertAlive();
		this.#events.add(listener);
		return () => this.#events.delete(listener);
	}
	setDocument(document: VisioDocument | null): void {
		this.#assertAlive();
		if (document) assertViewableDocument(document);
		const visible = documentVisibility(document);
		++this.#documentGeneration;
		++this.#sourceGeneration;
		this.#invalidateEdit();
		this.#history = null;
		this.#selectionHistory = new WeakMap();
		this.#sourceFormat = null;
		this.#loadId++;
		this.parser.cancel?.();
		this.#searchIndex = null;
		this.#visible = visible;
		this.#change({
			document,
			edit: EMPTY_EDIT_STATE,
			pageIndex: 0,
			loading: false,
			error: null,
			selectedShape: null,
			search: EMPTY_TEXT_SEARCH,
			layerVisibilityOverrides: EMPTY_LAYER_OVERRIDES,
		});
	}
	setPage(index: number): void {
		this.#assertAlive();
		const count = this.#state.document?.pages.length ?? 0;
		const next = Math.max(0, Math.min(count - 1, Number.isFinite(index) ? Math.trunc(index) : 0));
		if (next === this.#state.pageIndex) return;
		++this.#selectionIntent;
		if (this.#change({ pageIndex: next, selectedShape: null, search: this.#inactiveSearch() }))
			this.#emit('page-change', next);
	}
	setZoom(zoom: number): void {
		this.#assertAlive();
		const next = Math.max(0.1, Math.min(8, Number.isFinite(zoom) ? zoom : 1));
		if (next === this.#state.zoom) return;
		if (this.#change({ zoom: next })) this.#emit('zoom-change', next);
	}
	selectShape(shape: ViewerState['selectedShape']): void {
		this.#assertAlive();
		const revision = this.#revision;
		if (
			shape &&
			!visibleSelection(this.#state.document, this.#state.pageIndex, shape, this.#visible)
		)
			return;
		if (this.#destroyed || revision !== this.#revision) return;
		this.selectShapes(shape ? [shape] : EMPTY_SELECTION);
	}
	/** Replace the ordered selection; hidden/missing targets and group descendants are omitted. */
	selectShapes(shapes: readonly VisioShapeSelection[]): void {
		this.#assertAlive();
		const revision = this.#revision;
		const selectedShapes = snapshotSelection(
			this.#state.document,
			this.#state.pageIndex,
			shapes,
			this.#visible,
		);
		// Host getters may replace the document or issue newer selection while being snapshotted.
		if (this.#destroyed || revision !== this.#revision) return;
		++this.#selectionIntent;
		if (this.#change({ selectedShapes, search: this.#inactiveSearch() }))
			this.#emit('shape-select', this.#state.selectedShape);
	}
	toggleShapeSelection(shape: VisioShapeSelection): void {
		this.#assertAlive();
		const revision = this.#revision;
		const pageId = this.#state.document?.pages[this.#state.pageIndex]?.id ?? '';
		const key = selectionKey(shape, pageId);
		if (this.#destroyed || revision !== this.#revision) return;
		const current = this.#state.selectedShapes;
		const found = current.some((item) => selectionKey(item, pageId) === key);
		this.selectShapes(
			found ? current.filter((item) => selectionKey(item, pageId) !== key) : [...current, shape],
		);
	}
	/** Select the current page's visible top-level shapes, excluding background-page content. */
	selectAll(): void {
		this.#assertAlive();
		const page = this.#state.document?.pages[this.#state.pageIndex];
		this.selectShapes(
			page?.shapes.map((shape) => ({ id: shape.id, name: shape.name, pageId: page.id })) ??
				EMPTY_SELECTION,
		);
	}
	clearSelection(): void {
		this.selectShapes(EMPTY_SELECTION);
	}
	/** Override one source-page layer for viewing. null restores its saved display flag. */
	setLayerVisibility(pageId: string, layerId: string, visible: boolean | null): void {
		this.#assertAlive();
		const page = this.#state.document?.pages.find((candidate) => candidate.id === pageId);
		if (!page) throw new Error('The layer override page does not belong to this document.');
		if (!page.layers?.some((layer) => layer.id === layerId))
			throw new Error('The layer does not belong to this page.');
		if (visible !== null && typeof visible !== 'boolean')
			throw new Error('Layer visibility must be boolean or null.');
		const previous = this.#state.layerVisibilityOverrides;
		const found = previous.find((entry) => entry.pageId === pageId && entry.layerId === layerId);
		if (visible === null ? !found : found?.visible === visible) return;
		const next = previous.filter((entry) => entry !== found);
		if (visible !== null) next.push(Object.freeze({ pageId, layerId, visible }));
		this.#setLayerOverrides(Object.freeze(next));
	}
	/** Reset a source page, or all pages when omitted. Does not modify the document. */
	resetLayerVisibility(pageId?: string): void {
		this.#assertAlive();
		if (pageId !== undefined && !this.#state.document?.pages.some((page) => page.id === pageId))
			throw new Error('The layer override page does not belong to this document.');
		const previous = this.#state.layerVisibilityOverrides;
		const next =
			pageId === undefined
				? EMPTY_LAYER_OVERRIDES
				: Object.freeze(previous.filter((entry) => entry.pageId !== pageId));
		if (next.length !== previous.length) this.#setLayerOverrides(next);
	}
	#setLayerOverrides(layerVisibilityOverrides: readonly LayerVisibilityOverride[]): void {
		const visible = documentVisibility(this.#state.document, layerVisibilityOverrides);
		const searchIndex = this.#state.search.query
			? indexDocumentText(this.#state.document, (shape) => visible.get(shape) === true)
			: null;
		const search = searchIndex
			? searchDocumentText(searchIndex, this.#state.search.query)
			: EMPTY_TEXT_SEARCH;
		const selectedShapes = snapshotSelection(
			this.#state.document,
			this.#state.pageIndex,
			this.#state.selectedShapes,
			visible,
		);
		const changedSelection = !sameSelection(selectedShapes, this.#state.selectedShapes);
		if (changedSelection) ++this.#selectionIntent;
		this.#visible = visible;
		this.#searchIndex = searchIndex;
		if (
			this.#change({
				layerVisibilityOverrides,
				search,
				selectedShapes,
			}) &&
			changedSelection
		)
			this.#emit('shape-select', this.#state.selectedShape);
	}
	/** Search does not change the page or selection until explicit result navigation. */
	setSearchQuery(query: string): void {
		this.#assertAlive();
		validateSearchQuery(query);
		if (query === this.#state.search.query) return;
		this.#searchIndex ??= indexDocumentText(
			this.#state.document,
			(shape) => this.#visible.get(shape) === true,
		);
		this.#change({ search: searchDocumentText(this.#searchIndex, query) });
	}
	selectSearchResult(index: number): void {
		this.#assertAlive();
		if (!Number.isSafeInteger(index)) return;
		const result = this.#state.search.results[index];
		if (!result) return;
		const pageChanged = this.#state.pageIndex !== result.pageIndex;
		if (
			!this.#change({
				search: Object.freeze({ ...this.#state.search, activeIndex: index }),
				pageIndex: result.pageIndex,
				...(pageChanged ? { selectedShape: null } : {}),
			})
		)
			return;
		const revision = this.#revision;
		if (pageChanged) this.#emit('page-change', result.pageIndex);
		// Page callbacks/subscribers may replace the document or issue newer navigation.
		if (this.#destroyed || revision !== this.#revision) return;
		const shape = { id: result.shapeId, name: result.shapeName, pageId: result.pageId };
		++this.#selectionIntent;
		if (this.#change({ selectedShape: shape })) this.#emit('shape-select', shape);
	}
	nextSearchResult(): void {
		this.#assertAlive();
		const { activeIndex, results } = this.#state.search;
		if (results.length) this.selectSearchResult((activeIndex + 1) % results.length);
	}
	previousSearchResult(): void {
		this.#assertAlive();
		const { activeIndex, results } = this.#state.search;
		if (results.length)
			this.selectSearchResult(activeIndex <= 0 ? results.length - 1 : activeIndex - 1);
	}
	#inactiveSearch(): TextSearchState {
		return this.#state.search.activeIndex < 0
			? this.#state.search
			: Object.freeze({ ...this.#state.search, activeIndex: -1 });
	}
	async load(bytes: Uint8Array | ArrayBuffer): Promise<void> {
		this.#assertAlive();
		if (bytes.byteLength > MAX_INPUT_BYTES)
			throw new Error('This viewer accepts files up to 32 MiB.');
		const owned =
			bytes instanceof Uint8Array ? Uint8Array.from(bytes) : new Uint8Array(bytes.slice(0));
		return this.loadSource(() => owned);
	}
	/** A fresh source-backed drawing shares load replacement and cancellation behavior. */
	async createBlankDrawing(options?: CreateVsdxOptions): Promise<void> {
		return this.loadSource(() => createVsdx(options));
	}
	/** Reading bytes shares the same request epoch and error state as parsing them. */
	async loadSource(
		read: () => Uint8Array | ArrayBuffer | Promise<Uint8Array | ArrayBuffer>,
	): Promise<void> {
		this.#assertAlive();
		const id = ++this.#loadId;
		this.#invalidateEdit();
		this.parser.cancel?.();
		this.#change({ loading: true, error: null, edit: this.#sourceEditState() });
		if (this.#destroyed || id !== this.#loadId) return;
		let document: VisioDocument;
		let history: DocumentHistory;
		let visible: ReturnType<typeof documentVisibility>;
		try {
			const bytes = await read();
			if (this.#destroyed || id !== this.#loadId) return;
			if (bytes.byteLength > MAX_INPUT_BYTES)
				throw new Error('This viewer accepts files up to 32 MiB.');
			const owned =
				bytes instanceof Uint8Array ? Uint8Array.from(bytes) : new Uint8Array(bytes.slice(0));
			document = await this.parser(Uint8Array.from(owned));
			if (this.#destroyed || id !== this.#loadId) return;
			assertViewableDocument(document);
			// Retain original binary source privately, including preview-only VSD.
			history = new DocumentHistory(owned);
			visible = documentVisibility(document);
		} catch (cause) {
			if (this.#destroyed || id !== this.#loadId) return;
			const error = cause instanceof Error ? cause : new Error(String(cause));
			this.#change({ loading: false, error });
			if (!this.#destroyed && id === this.#loadId) this.#emit('document-error', error);
			throw error;
		}
		this.#history = history;
		this.#selectionHistory = new WeakMap();
		this.#sourceFormat = document.format;
		this.#searchIndex = null;
		this.#visible = visible;
		++this.#documentGeneration;
		++this.#sourceGeneration;
		this.#change({
			document,
			edit: document.format === 'vsdx' ? history.state : EMPTY_EDIT_STATE,
			pageIndex: 0,
			loading: false,
			error: null,
			selectedShape: null,
			selectedShapes: EMPTY_SELECTION,
			search: EMPTY_TEXT_SEARCH,
			layerVisibilityOverrides: EMPTY_LAYER_OVERRIDES,
		});
		if (!this.#destroyed && id === this.#loadId) this.#emit('document-load', document);
	}
	cancelLoad(): void {
		this.#assertAlive();
		++this.#loadId;
		this.parser.cancel?.();
		this.#invalidateEdit();
		this.#change({ loading: false, edit: this.#sourceEditState() });
	}
	destroy(): void {
		if (this.#destroyed) return;
		this.#destroyed = true;
		this.#clipboard.destroy();
		this.#invalidateEdit();
		this.#history = null;
		this.#selectionHistory = new WeakMap();
		this.#sourceFormat = null;
		++this.#documentGeneration;
		++this.#sourceGeneration;
		++this.#loadId;
		this.parser.cancel?.();
		this.#subscribers.clear();
		this.#events.clear();
		this.#searchIndex = null;
		this.#visible = documentVisibility(null);
		this.#state = Object.freeze({
			document: null,
			edit: EMPTY_EDIT_STATE,
			pageIndex: 0,
			zoom: 1,
			loading: false,
			error: null,
			selectedShape: null,
			selectedShapes: EMPTY_SELECTION,
			search: EMPTY_TEXT_SEARCH,
			layerVisibilityOverrides: EMPTY_LAYER_OVERRIDES,
			clipboard: EMPTY_CLIPBOARD_STATE,
		});
	}
	/** Replace one source-backed local plain-text target. Core decides target support. */
	async replacePlainText(pageId: string, shapeId: string, text: string): Promise<void> {
		return this.applyEdits([{ type: 'replace-plain-text', pageId, shapeId, text }]);
	}
	/** Atomic source-backed edits. Core owns protection, dependency and target validation. */
	async applyEdits(edits: readonly VisioEdit[]): Promise<void> {
		return this.#mutate('edit', snapshotEdits(edits));
	}
	captureTextReplaceToken(scope: ViewerTextReplaceScope): ViewerTextReplaceToken {
		this.#assertAlive();
		return this.#replacement.capture(scope);
	}
	isTextReplaceTokenCurrent(token: ViewerTextReplaceToken): boolean {
		return this.#replacement.current(token);
	}
	/** Cancel only the pending application owned by this replacement token. */
	cancelTextReplace(token: ViewerTextReplaceToken): void {
		this.#replacement.cancel(token);
	}
	getTextReplaceOccurrences(token: ViewerTextReplaceToken, query: string) {
		return this.#replacement.occurrences(token, query);
	}
	planTextReplacement(token: ViewerTextReplaceToken, input: ViewerTextReplacementInput) {
		return this.#replacement.plan(token, input);
	}
	selectTextReplaceOccurrence(
		token: ViewerTextReplaceToken,
		occurrence: VisioTextOccurrence,
		query: string,
	): ViewerTextReplaceToken {
		return this.#replacement.navigate(token, occurrence, query);
	}
	applyTextReplacePlan(
		plan: VisioTextReplacePlan,
		token: ViewerTextReplaceToken,
	): Promise<ViewerTextReplaceToken> {
		return this.#replacement.apply(plan, token);
	}
	/** Gesture batches may only edit the captured current-page selection. */
	async applySelectionEdits(edits: readonly VisioEdit[]): Promise<void> {
		this.#assertAlive();
		const revision = this.#revision;
		const state = this.#state;
		const page = state.document?.pages[state.pageIndex];
		const pageId = page?.id;
		const ids = state.selectedShapes.map((shape) => shape.id);
		// Members of a selected container move with it, as in Visio.
		const selected = new Set(page ? visioWithContainerMembers(page, ids) : ids);
		const commands = snapshotEdits(edits);
		if (this.#destroyed || revision !== this.#revision)
			throw new DOMException('The selection edit was superseded or cancelled.', 'AbortError');
		if (
			!pageId ||
			!selected.size ||
			!commands.length ||
			!state.selectedShapes.every((shape) => visioSelectionIsOnPage(shape, pageId)) ||
			commands.some(
				(command) =>
					!('shapeId' in command) || command.pageId !== pageId || !selected.has(command.shapeId),
			)
		)
			throw new Error('Selection edits must target selected shapes on the current page.');
		return this.#mutate('edit', commands, undefined, undefined, true);
	}
	/** Capture an internal drawing intent before pointer movement or draft input. */
	captureCreationToken(pageId: string): ViewerCreationToken {
		this.#assertAlive();
		return this.#creation.capture(pageId);
	}
	isCreationTokenCurrent(token: ViewerCreationToken): boolean {
		return this.#creation.current(token);
	}
	/** Internal drawing adapter entry point: creation and its selection form one history edge. */
	async applyCreationEdits(edits: readonly VisioEdit[], token: ViewerCreationToken): Promise<void> {
		this.#assertAlive();
		const context = this.#creation.require(token);
		const revision = this.#revision;
		const commands = snapshotEdits(edits);
		if (this.#destroyed || revision !== this.#revision) throw creationCancelled();
		this.#creation.require(token);
		const creates = commands.filter((command) =>
			[
				'create-rectangle',
				'create-ellipse',
				'create-line',
				'create-text-box',
				'create-path',
				'insert-picture',
				'insert-master-instance',
				'drop-stencil-master',
			].includes(command.type),
		);
		const created = new Set(
			creates.map((command) => ('shapeId' in command ? command.shapeId : '')),
		);
		if (
			!creates.length ||
			commands.some(
				(command) =>
					!('pageId' in command) ||
					command.pageId !== context.pageId ||
					!('shapeId' in command) ||
					// Besides creations, only the new shapes' own formatting (a stencil's style) rides along.
					(!creates.includes(command) &&
						(command.type !== 'format-shape' || !created.has(command.shapeId))),
			)
		)
			throw new Error('Creation edits must create shapes on the captured current page.');
		const shapeIds = Object.freeze([...created]);
		return this.#mutate(
			'edit',
			commands,
			undefined,
			{ pageId: context.pageId, shapeIds },
			true,
			context,
		);
	}
	/** Duplicate the current page selection as one source edit and selection history transition. */
	async duplicateSelection(): Promise<void> {
		this.#assertAlive();
		const revision = this.#revision;
		const page = this.#state.document?.pages[this.#state.pageIndex];
		const selected = this.#state.selectedShapes;
		if (
			!page ||
			!selected.length ||
			!selected.every((shape) => visioSelectionIsOnPage(shape, page.id))
		)
			throw new Error('Select shapes on the current page before duplicating.');
		const command = visioDuplicateCommand(
			page,
			selected.map((shape) => shape.id),
		);
		if (this.#destroyed || revision !== this.#revision)
			throw new DOMException('The diagram selection was superseded.', 'AbortError');
		if (!command) throw new Error('The selected shapes cannot be duplicated safely.');
		return this.#mutate('edit', snapshotEdits([command]), undefined, {
			pageId: command.pageId,
			shapeIds: Object.freeze(command.copies.map((copy) => copy.newShapeId)),
		});
	}
	/** Group the selection, or ungroup one selected group, as one edit and selection transition. */
	async groupSelection(operation: 'group' | 'ungroup'): Promise<void> {
		this.#assertAlive();
		const page = this.#state.document?.pages[this.#state.pageIndex];
		const selected = this.#state.selectedShapes;
		if (!page || !selected.every((shape) => visioSelectionIsOnPage(shape, page.id)))
			throw new Error('Select shapes on the current page before grouping.');
		const ids = selected.map((shape) => shape.id);
		const command =
			operation === 'group' ? visioGroupCommand(page, ids) : visioUngroupCommand(page, ids);
		if (!command)
			throw new Error(
				operation === 'group'
					? 'Select two or more local, unglued top-level shapes to group.'
					: 'Select one local, unglued group to ungroup.',
			);
		const shapeIds =
			command.type === 'group-shapes'
				? [command.shapeId]
				: page.shapes.find((shape) => shape.id === command.shapeId)!.children.map((s) => s.id);
		return this.#mutate('edit', snapshotEdits([command]), undefined, {
			pageId: page.id,
			shapeIds: Object.freeze(shapeIds),
		});
	}
	/** Insert > Container or Callout for the selection as one edit; the new part is selected. */
	async insertDiagramPart(
		part:
			| { kind: 'container'; style: VisioContainerStyle }
			| { kind: 'callout'; style: VisioCalloutStyle },
	): Promise<void> {
		this.#assertAlive();
		const page = this.#state.document?.pages[this.#state.pageIndex];
		const selected = this.#state.selectedShapes;
		if (!page || !selected.every((shape) => visioSelectionIsOnPage(shape, page.id)))
			throw new Error('Select shapes on the current page first.');
		const ids = selected.map((shape) => shape.id);
		const command =
			part.kind === 'container'
				? visioContainerCommand(page, ids, part.style)
				: visioCalloutCommand(page, ids, part.style);
		if (!command)
			throw new Error(
				part.kind === 'container'
					? 'Select top-level shapes on this page to contain.'
					: 'Select one two-dimensional shape for the callout.',
			);
		return this.#mutate('edit', snapshotEdits([command]), undefined, {
			pageId: page.id,
			shapeIds: Object.freeze([command.shapeId]),
		});
	}
	captureClipboardToken(): ViewerClipboardToken {
		this.#assertAlive();
		return this.#clipboard.token();
	}
	getPreparedClipboard(token: ViewerClipboardToken): string | null {
		this.#assertAlive();
		return this.#clipboard.prepared(token);
	}
	async prepareClipboardSelection(token: ViewerClipboardToken): Promise<string> {
		this.#assertAlive();
		return this.#clipboard.prepare(token);
	}
	/** Called only after the DOM transport has successfully written the captured payload. */
	async cutPreparedSelection(token: ViewerClipboardToken): Promise<void> {
		this.#assertAlive();
		const context = this.#clipboard.require(token);
		if (!this.#clipboard.prepared(token))
			throw new Error('Prepare the selected shapes before cutting.');
		return this.#mutate(
			'edit',
			snapshotEdits(
				context.shapeIds.map((shapeId) => ({
					type: 'delete-shape',
					pageId: context.pageId,
					shapeId,
				})),
			),
			undefined,
			undefined,
			true,
		);
	}
	/** The supplied text must come from the current clipboard read, never an internal fallback. */
	async pasteClipboardText(text: string, token: ViewerClipboardToken): Promise<void> {
		this.#assertAlive();
		const context = this.#clipboard.require(token);
		const clipboard = deserializeVisioClipboard(text);
		const page = this.#state.document!.pages[this.#state.pageIndex]!;
		const command = visioPasteCommand(page, clipboard);
		this.#clipboard.require(token);
		if (!command) throw new Error('The clipboard shapes cannot be pasted on this page safely.');
		return this.#mutate(
			'edit',
			snapshotEdits([command]),
			undefined,
			{
				pageId: context.pageId,
				shapeIds: Object.freeze(command.copies.map((copy) => copy.newShapeId)),
			},
			true,
		);
	}
	#clipboardContext(): ClipboardContext | undefined {
		if (
			this.#destroyed ||
			!this.#history ||
			this.#sourceFormat !== 'vsdx' ||
			this.#state.document?.format !== 'vsdx' ||
			this.#state.loading ||
			this.#state.edit.busy
		)
			return undefined;
		const revision = this.#revision;
		try {
			const pageId = this.#state.document.pages[this.#state.pageIndex]?.id;
			const selected = this.#state.selectedShapes;
			if (
				!pageId ||
				!selected.every((shape) => visioSelectionIsOnPage(shape, pageId)) ||
				this.#destroyed ||
				revision !== this.#revision
			)
				return undefined;
			return Object.freeze({
				sourceGeneration: this.#sourceGeneration,
				documentGeneration: this.#documentGeneration,
				operationGeneration: this.#editId,
				selectionIntent: this.#selectionIntent,
				pageId,
				selectionCount: selected.length,
				shapeIds:
					selected.length <= 1000
						? Object.freeze(selected.map((shape) => shape.id))
						: Object.freeze([]),
			});
		} catch {
			return undefined;
		}
	}
	async undo(): Promise<void> {
		return this.#mutate('undo');
	}
	/**
	 * Adopt a package from a shared session as one undoable history step. Emits `document-change`
	 * with kind `remote`, which a session must not publish back.
	 */
	async applyRemoteSource(bytes: Uint8Array): Promise<void> {
		return this.#mutate('remote', undefined, bytes);
	}
	async redo(): Promise<void> {
		return this.#mutate('redo');
	}
	cancelEdit(): void {
		this.#assertAlive();
		if (!this.#state.edit.busy) {
			// Browser clipboard reads/writes are pending while the editor itself is idle.
			++this.#editId;
			this.#clipboard.reset();
			this.#change({ clipboard: EMPTY_CLIPBOARD_STATE });
			return;
		}
		this.#invalidateEdit();
		this.parser.cancel?.();
		this.#change({ edit: this.#sourceEditState() });
	}
	exportVsdx(): VsdxExportResult {
		this.#assertAlive();
		if (!this.#history || this.#sourceFormat !== 'vsdx' || this.#state.document?.format !== 'vsdx')
			throw new Error('Open a .vsdx file before downloading a copy.');
		if (this.#state.edit.busy || this.#state.loading)
			throw new Error('Wait for the current document operation before downloading.');
		return this.#history.export();
	}
	#invalidateEdit(): void {
		++this.#editId;
		this.editor.cancel?.();
	}
	#sourceEditState(): ViewerEditState {
		return this.#sourceFormat === 'vsdx' && this.#state.document?.format === 'vsdx'
			? (this.#history?.state ?? EMPTY_EDIT_STATE)
			: EMPTY_EDIT_STATE;
	}
	#creationContext(allowBusy = false): CreationContext | undefined {
		if (
			this.#destroyed ||
			!this.#history ||
			this.#sourceFormat !== 'vsdx' ||
			this.#state.document?.format !== 'vsdx' ||
			this.#state.loading ||
			(!allowBusy && this.#state.edit.busy)
		)
			return undefined;
		const revision = this.#revision;
		try {
			const pageId = this.#state.document.pages[this.#state.pageIndex]?.id;
			if (!pageId || this.#destroyed || revision !== this.#revision) return undefined;
			return Object.freeze({
				sourceGeneration: this.#sourceGeneration,
				documentGeneration: this.#documentGeneration,
				operationGeneration: this.#editId,
				selectionIntent: this.#selectionIntent,
				viewIntent: this.#viewIntent,
				pageId,
				pageIndex: this.#state.pageIndex,
			});
		} catch {
			return undefined;
		}
	}
	#replacementContext(allowBusy = false): ReplacementContext | undefined {
		const context = this.#creationContext(allowBusy);
		if (!context) return undefined;
		return Object.freeze({
			sourceGeneration: context.sourceGeneration,
			documentGeneration: context.documentGeneration,
			operationGeneration: context.operationGeneration,
			selectionIntent: context.selectionIntent,
			navigationIntent: this.#replacementNavigation,
			pageId: context.pageId,
			pageIndex: context.pageIndex,
		});
	}
	#requireReplacement(context: ReplacementContext, allowBusy = false): ReplacementContext {
		const current = this.#replacementContext(allowBusy);
		if (!current || !sameReplacementContext(context, current)) throw replacementCancelled();
		return current;
	}
	#navigateReplacement(
		occurrence: VisioTextOccurrence,
		context: ReplacementContext,
	): ReplacementContext {
		this.#requireReplacement(context);
		const target = visioTextOccurrenceSelection(this.#state.document!, occurrence);
		if (!target) throw new Error('The replacement occurrence target is no longer available.');
		const selectedShapes = snapshotSelection(
			this.#state.document,
			target.pageIndex,
			[target.selection],
			this.#visible,
		);
		this.#requireReplacement(context);
		const expected = Object.freeze({
			...context,
			pageId: target.selection.pageId!,
			pageIndex: target.pageIndex,
			navigationIntent: ++this.#replacementNavigation,
		});
		if (!this.#change({ pageIndex: target.pageIndex, selectedShapes }))
			throw replacementCancelled();
		this.#requireReplacement(expected);
		this.#emit('shape-select', selectedShapes[0] ?? null);
		this.#requireReplacement(expected);
		if (target.pageIndex !== context.pageIndex) this.#emit('page-change', target.pageIndex);
		return this.#requireReplacement(expected);
	}
	async #applyReplacement(
		edits: readonly VisioEdit[],
		next: VisioTextOccurrence | undefined,
		context: ReplacementContext,
		owner: object,
	): Promise<ReplacementContext> {
		this.#requireReplacement(context);
		const commands = snapshotEdits(edits);
		this.#requireReplacement(context);
		let completed: ReplacementContext | undefined;
		await this.#mutate(
			'edit',
			commands,
			undefined,
			next
				? { pageId: next.pageId, shapeIds: Object.freeze([next.shapeId]), navigate: true }
				: undefined,
			true,
			undefined,
			{
				context,
				owner,
				...(next ? { next } : {}),
				complete: (accepted) => {
					completed = accepted;
				},
			},
		);
		if (!completed) throw replacementCancelled();
		return this.#requireReplacement(completed);
	}
	#cancelReplacement(owner: object): void {
		const operation = this.#replacementOperation;
		if (
			!this.#destroyed &&
			!this.#state.loading &&
			this.#state.edit.busy &&
			operation?.owner === owner &&
			operation.id === this.#editId &&
			operation.source === this.#sourceGeneration &&
			operation.document === this.#documentGeneration
		)
			this.cancelEdit();
	}
	#creationCurrent(
		context: CreationContext,
		operation: number,
		document = context.documentGeneration,
	): boolean {
		const current = this.#creationContext(true);
		return (
			!!current &&
			sameCreationContext(
				{ ...context, operationGeneration: operation, documentGeneration: document },
				current,
			)
		);
	}
	async #mutate(
		kind: 'edit' | 'undo' | 'redo' | 'remote',
		commands?: readonly VisioEdit[],
		remote?: Uint8Array,
		postSelection?: PostEditSelection,
		strictSelectionIntent = false,
		creation?: CreationContext,
		replacement?: ReplacementMutation,
	): Promise<void> {
		this.#assertAlive();
		const history = this.#history;
		if (!history || this.#sourceFormat !== 'vsdx' || this.#state.document?.format !== 'vsdx')
			throw new Error('Open a .vsdx file before editing.');
		if (this.#state.loading || this.#state.edit.busy)
			throw new Error('Another document operation is in progress.');
		const target =
			kind === 'undo' ? history.undoTarget : kind === 'redo' ? history.redoTarget : undefined;
		if ((kind === 'undo' || kind === 'redo') && !target) return;
		const beforeSource = history.current;
		const selectionIntent = this.#selectionIntent;
		const clipboardPageIndex = this.#state.pageIndex;
		const restored =
			kind === 'undo'
				? this.#selectionHistory.get(beforeSource)
				: kind === 'redo' && target
					? this.#selectionHistory.get(target)
					: undefined;
		const id = ++this.#editId;
		// Set ownership before publishing busy: host subscribers may cancel and start another edit.
		this.#replacementOperation = replacement
			? {
					owner: replacement.owner,
					id,
					source: this.#sourceGeneration,
					document: this.#documentGeneration,
				}
			: undefined;
		const loadId = this.#loadId;
		const current = () =>
			!this.#destroyed &&
			id === this.#editId &&
			loadId === this.#loadId &&
			history === this.#history;
		const assertCurrent = () => {
			if (!current())
				throw new DOMException('The diagram edit was superseded or cancelled.', 'AbortError');
		};
		this.#change({ edit: Object.freeze({ ...history.state, busy: true }) });
		assertCurrent();
		let completionGeneration = -1;
		let completionPageId: string | undefined;
		try {
			let document: VisioDocument;
			let edited: Awaited<ReturnType<CancellableEditor>> | undefined;
			if (kind === 'edit') {
				edited = await this.editor(Uint8Array.from(history.current.bytes), commands!);
				assertCurrent();
				if (edited.bytes.byteLength > MAX_INPUT_BYTES)
					throw new Error('The modified VSDX exceeds 32 MiB.');
				document = edited.document;
			} else if (kind === 'remote') {
				if (remote!.byteLength > MAX_INPUT_BYTES)
					throw new Error('The shared VSDX exceeds 32 MiB.');
				document = await this.parser(Uint8Array.from(remote!));
			} else document = await this.parser(Uint8Array.from(target!.bytes));
			assertCurrent();
			assertViewableDocument(document);
			if (document.format !== 'vsdx')
				throw new Error('A VSDX edit or history operation cannot change the source format.');
			if (edited && !edited.changedParts.length) {
				if (replacement)
					this.#requireReplacement({ ...replacement.context, operationGeneration: id }, true);
				this.#change({ edit: history.state });
				if (creation && !this.#creationCurrent(creation, id)) throw creationCancelled();
				if (replacement) {
					const context = this.#requireReplacement({
						...replacement.context,
						operationGeneration: id,
					});
					// Revalidated owned navigation is allowed even when the source writer returns exact bytes.
					replacement.complete(
						replacement.next ? this.#navigateReplacement(replacement.next, context) : context,
					);
				}
				return;
			}
			const visible = documentVisibility(document, this.#state.layerVisibilityOverrides);
			const searchIndex = this.#state.search.query
				? indexDocumentText(document, (shape) => visible.get(shape) === true)
				: null;
			const search = searchIndex
				? searchDocumentText(searchIndex, this.#state.search.query)
				: EMPTY_TEXT_SEARCH;
			const oldPageIndex = this.#state.pageIndex;
			const currentPageId = this.#state.document?.pages[oldPageIndex]?.id;
			assertCurrent();
			if (oldPageIndex !== this.#state.pageIndex)
				throw new DOMException('The diagram page was superseded.', 'AbortError');
			const beforeSelection = this.#state.selectedShapes;
			const restoreSelection =
				restored &&
				restored.intent === selectionIntent &&
				selectionIntent === this.#selectionIntent &&
				(kind === 'undo'
					? (restored.afterPageId ?? restored.pageId)
					: (restored.beforePageId ?? restored.pageId)) === currentPageId;
			const requestedPageId = postSelection?.navigate
				? postSelection.pageId
				: restoreSelection
					? kind === 'undo'
						? (restored.beforePageId ?? restored.pageId)
						: (restored.afterPageId ?? restored.pageId)
					: currentPageId;
			const foundPageIndex = document.pages.findIndex((page) => page.id === requestedPageId);
			const pageIndex =
				foundPageIndex >= 0
					? foundPageIndex
					: Math.min(oldPageIndex, Math.max(0, document.pages.length - 1));
			const requestedSelection =
				restored && restoreSelection
					? kind === 'undo'
						? restored.before
						: restored.after
					: beforeSelection;
			const usePostSelection =
				postSelection &&
				selectionIntent === this.#selectionIntent &&
				(postSelection.navigate || postSelection.pageId === currentPageId) &&
				foundPageIndex >= 0;
			const selection = usePostSelection
				? postSelection.shapeIds.flatMap((id) => {
						if (replacement?.next) {
							const target = visioTextOccurrenceSelection(document, replacement.next);
							if (!target) throw new Error('The next replacement target is no longer available.');
							return target.selection;
						}
						const shape = document.pages[pageIndex]?.shapes.find((shape) => shape.id === id);
						return shape ? [{ id: shape.id, name: shape.name, pageId: postSelection.pageId }] : [];
					})
				: requestedSelection;
			const selectedShapes = snapshotSelection(document, pageIndex, selection, visible);
			const selectionChanged = !sameSelection(beforeSelection, selectedShapes);
			const characters = selectionChanged
				? [...beforeSelection, ...selectedShapes].reduce(
						(sum, shape) => sum + shape.id.length + shape.name.length + (shape.pageId?.length ?? 0),
						0,
					)
				: 0;
			if (usePostSelection && characters > 1_000_000)
				throw new Error('The selection exceeds the bounded duplicate undo metadata limit.');
			// No external callbacks occur between history acceptance and model acceptance.
			assertCurrent();
			if (creation && !this.#creationCurrent(creation, id)) throw creationCancelled();
			if (replacement)
				this.#requireReplacement({ ...replacement.context, operationGeneration: id }, true);
			if (
				strictSelectionIntent &&
				(selectionIntent !== this.#selectionIntent || clipboardPageIndex !== this.#state.pageIndex)
			)
				throw new DOMException('The selection edit was superseded or cancelled.', 'AbortError');
			if (edited) history.append(edited.bytes, edited.diagnostics);
			else if (kind === 'remote') history.append(Uint8Array.from(remote!), []);
			else history.move(target!);
			if (
				(edited || kind === 'remote') &&
				foundPageIndex >= 0 &&
				(selectionChanged || (replacement && pageIndex !== oldPageIndex))
			) {
				// Pruning and explicit post-edit selection form history edges; other edits keep selection.
				// Weak keys follow the bounded source history; each edge retains at most 1M characters.
				if (characters <= 1_000_000)
					this.#selectionHistory.set(history.current, {
						pageId: currentPageId!,
						...(replacement ? { beforePageId: currentPageId!, afterPageId: requestedPageId! } : {}),
						before: beforeSelection,
						after: selectedShapes,
						intent: this.#selectionIntent,
					});
			}
			this.#visible = visible;
			this.#searchIndex = searchIndex;
			++this.#documentGeneration;
			completionGeneration = this.#documentGeneration;
			completionPageId = requestedPageId;
			if (
				this.#change({
					document,
					edit: history.state,
					search,
					selectedShapes,
					error: null,
					pageIndex,
				}) &&
				current()
			) {
				if (usePostSelection) this.#emit('shape-select', selectedShapes[0] ?? null);
				if (
					current() &&
					pageIndex !== oldPageIndex &&
					(!replacement ||
						(this.#state.pageIndex === pageIndex && this.#selectionIntent === selectionIntent))
				)
					this.#emit('page-change', pageIndex);
				if (current())
					this.#emit('document-change', { document, dirty: history.state.dirty, kind });
			}
		} catch (cause) {
			if (!current())
				throw new DOMException('The diagram edit was superseded or cancelled.', 'AbortError');
			if (strictSelectionIntent && cause instanceof DOMException && cause.name === 'AbortError') {
				this.#change({ edit: history.state });
				throw cause;
			}
			const error = cause instanceof Error ? cause : new Error(String(cause));
			this.#change({ edit: Object.freeze({ ...history.state, error }) });
			throw error;
		}
		if (strictSelectionIntent) {
			const context = this.#clipboardContext();
			if (
				!current() ||
				!context ||
				context.documentGeneration !== completionGeneration ||
				context.operationGeneration !== id ||
				context.selectionIntent !== selectionIntent ||
				context.pageId !== completionPageId
			)
				throw new DOMException('The selection edit was superseded or cancelled.', 'AbortError');
		}
		if (creation && !this.#creationCurrent(creation, id, completionGeneration))
			throw creationCancelled();
		if (replacement) {
			const context = this.#replacementContext();
			if (
				!context ||
				!sameReplacementContext(
					{
						...replacement.context,
						operationGeneration: id,
						documentGeneration: completionGeneration,
						pageId: completionPageId!,
						pageIndex: context.pageIndex,
					},
					context,
				)
			)
				throw replacementCancelled();
			replacement.complete(context);
		}
	}
	#assertAlive(): void {
		if (this.#destroyed) throw new Error('The viewer has been destroyed.');
	}
	#change(change: Partial<ViewerState>): boolean {
		const revision = ++this.#revision;
		if (
			(change.zoom !== undefined && change.zoom !== this.#state.zoom) ||
			(change.pageIndex !== undefined && change.pageIndex !== this.#state.pageIndex) ||
			(change.layerVisibilityOverrides !== undefined &&
				change.layerVisibilityOverrides !== this.#state.layerVisibilityOverrides)
		)
			++this.#viewIntent;
		const invalidatesClipboard = [
			'document',
			'edit',
			'loading',
			'pageIndex',
			'selectedShape',
			'selectedShapes',
			'layerVisibilityOverrides',
		].some((key) => key in change);
		const previous = this.#state.selectedShapes;
		const requested =
			change.selectedShapes ??
			('selectedShape' in change
				? change.selectedShape
					? Object.freeze([Object.freeze({ ...change.selectedShape })])
					: EMPTY_SELECTION
				: undefined);
		const selectedShapes = requested && sameSelection(previous, requested) ? previous : requested;
		this.#state = Object.freeze({
			...this.#state,
			...change,
			...(invalidatesClipboard ? { clipboard: EMPTY_CLIPBOARD_STATE } : {}),
			...(selectedShapes
				? {
						selectedShapes,
						selectedShape: selectedShapes[0] ?? null,
					}
				: {}),
		});
		if (invalidatesClipboard) this.#clipboard.reset();
		for (const listener of [...this.#subscribers]) {
			if (this.#destroyed || revision !== this.#revision) break;
			if (this.#subscribers.has(listener)) this.#notify(() => listener(this.#state));
		}
		if (!this.#destroyed && revision === this.#revision && previous !== this.#state.selectedShapes)
			this.#emit('selection-change', this.#state.selectedShapes);
		if (!this.#destroyed && !this.#clipboardQueued) {
			this.#clipboardQueued = true;
			queueMicrotask(() => {
				this.#clipboardQueued = false;
				if (!this.#destroyed) this.#clipboard.refresh();
			});
		}
		return !this.#destroyed && revision === this.#revision;
	}
	#notify(callback: () => void): boolean {
		try {
			callback();
			return true;
		} catch (error) {
			try {
				this.listenerError(error);
			} catch {
				/* A host error reporter must not corrupt viewer state. */
			}
			return false;
		}
	}
	#emit<K extends keyof ViewerEvents>(name: K, detail: ViewerEvents[K]): void {
		const revision = this.#revision;
		for (const listener of [...this.#events]) {
			if (this.#destroyed || revision !== this.#revision) break;
			if (this.#events.has(listener)) this.#notify(() => listener(name, detail));
		}
	}
}
