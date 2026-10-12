import type { RibbonAddInTab } from '../ribbon/add-in-tabs';
import { FormatDialogs } from './format-dialogs';
import type { EditorState, Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { DocumentModel } from 'ooxml-core/docx';
import { createDocument } from 'ooxml-core/docx';
import type { loadDocument } from 'ooxml-core/docx/load';
import { refreshEditorControls } from './editor-controls';
import { assignMissingParagraphIds, docToModel } from './model-adapter';
import type { SearchPanelHandle } from './search-panel';
import { CollaborationSession } from './collaboration-session';
import { repairCollaborativeDocumentIds, isWordYjsRemoteTransaction } from 'ooxml-core/docx/ui';
import type { EditorTheme, EditorThemeMode } from 'ooxml-core/docx/ui';
import type { EditorLocale } from './localization';
import { findLocalizedControl } from './localization';
import type { PrintLayoutController } from './print-layout-view';
import { REMOTE_TRANSACTION_META } from './track-changes-mode';
import type { ReviewDisplayMode } from './review-display';
import type { ReviewController } from './review-controller';
import { ImageMediaCache } from './image-media';
import type { EditorChrome } from './editor-chrome';
import { dispatchDocumentError, type EditorHost } from './editor-host';
import { PartsController } from './parts-controller';
import { PageController } from './page-controller';
import { InsertController } from './insert-controller';
import { emit } from './events';
import { DirtyState } from 'ooxml-core/docx/ui';
import { PageTracker, syncPageState } from './page-sync';
import type { PageNavigator } from './page-navigator';
import type { HeadingNavigator } from './heading-navigator';
import { HEADER_FOOTER_INPUT } from 'ooxml-core/docx/ui';
import { newPicturePartName } from './picture-commands';
import { ViewOptions } from './view-options';
import { currentSectionIndex } from './section-commands';
import { syncHeaderFooterRibbon } from './header-footer-ribbon';

export type LoadedDocument = Awaited<ReturnType<typeof loadDocument>>;

/** DOM pieces created by the shell once the element connects. */
export interface ShellParts {
	toolbar?: HTMLElement;
	canvas?: HTMLElement;
	paper?: HTMLElement;
	searchPanel?: SearchPanelHandle;
	review?: ReviewController;
	chrome?: EditorChrome;
	printLayout?: PrintLayoutController;
	navigator?: PageNavigator;
	headings?: HeadingNavigator;
}

/**
 * Mutable editor state and the controllers that share it. `<docx-editor>` is a thin facade over
 * this object; the shell, render, ribbon and chrome modules take it instead of reaching into the
 * element's private fields.
 */
export class EditorCore {
	model: DocumentModel = createDocument();
	/** Tabs the host added after Word's own (`ribbonAddIns` of the element). */
	ribbonAddIns: readonly RibbonAddInTab[] = [];
	view?: EditorView | undefined;
	loaded?: LoadedDocument | undefined;
	loadGeneration = 0;
	readOnly = false;
	locale: EditorLocale = 'en';
	reviewAuthor = 'Author';
	theme: EditorThemeMode = 'auto';
	themeColors?: Partial<EditorTheme> | undefined;
	appliedThemeVars: string[] = [];
	reviewDisplayMode: ReviewDisplayMode = 'all';
	detachedState?: EditorState | undefined;
	pendingFileName?: string;
	readonly shell: ShellParts = {};
	readonly collab: CollaborationSession;
	readonly inserts: InsertController;
	readonly formatDialogs: FormatDialogs;
	readonly imageMedia: ImageMediaCache;
	readonly host: EditorHost;
	readonly parts: PartsController;
	readonly pages: PageController;
	readonly viewOptions = new ViewOptions();
	readonly dirtyState: DirtyState;
	readonly pageTracker: PageTracker;

	constructor(readonly element: HTMLElement) {
		this.dirtyState = new DirtyState((dirty) => emit(element, 'dirty-change', dirty));
		this.pageTracker = new PageTracker(element);
		this.collab = new CollaborationSession(element, () => this.view);
		this.inserts = new InsertController({
			view: () => this.targetView(),
			model: () => this.model,
			contentWidth: () => this.contentWidth(),
			paper: () => this.shell.paper,
			toolbar: () => this.shell.toolbar,
			reportError: (error) => emit(element, 'document-error', error),
			newMediaPartName: (contentType) =>
				this.collab.yjs?.media.partName(contentType) ?? newPicturePartName(contentType),
			stageMedia: (name, part) => this.collab.yjs?.media.publish(name, part),
		});
		this.formatDialogs = new FormatDialogs({
			view: () => this.targetView(),
			reviewView: () => this.view,
			historyView: () => (this.parts.usesBodyHistory() ? this.view : this.targetView()),
			model: () => this.model,
			canDefineList: () => !this.readOnly && !this.collab.active,
			zoom: {
				percent: () => Math.round(this.pages.zoom * 100),
				setPercent: (percent) => this.pages.setZoom(percent),
				fit: (mode) => this.pages.zoomTo(mode),
			},
			pageSetup: {
				section: () => this.pages.currentSection(),
				canEdit: () => !this.readOnly && !this.collab.active,
				apply: (values) => this.pages.applyPageSetupValues(values),
			},
			lineNumbers: {
				section: () => this.pages.currentSection(),
				canEdit: () => !this.readOnly && !this.collab.active,
				apply: (settings) => this.pages.applyLineNumberSettings(settings),
			},
			watermark: {
				current: () => this.pages.currentWatermark(),
				canEdit: () => !this.readOnly && !this.collab.active,
				apply: (spec) => this.pages.applyWatermark(spec),
			},
			pageBorders: {
				section: () => this.pages.currentSection(),
				canEdit: () => !this.readOnly && !this.collab.active,
				apply: (borders) => this.pages.applyPageBorders(borders),
			},
			columns: {
				section: () => this.pages.currentSection(),
				canEdit: () => !this.readOnly && !this.collab.active,
				apply: (columns) => this.pages.applyColumns(columns),
			},
		});
		this.imageMedia = new ImageMediaCache(
			(partName) =>
				this.collab.yjs?.media.get(partName)?.bytes ??
				this.inserts.media(partName, this.loaded?.media),
		);
		this.host = {
			element,
			view: () => this.view,
			model: () => this.model,
			setModel: (model) => {
				this.model = model;
			},
			locale: () => this.locale,
			canEditOutsideBody: () => !this.readOnly && !this.collab.active,
			edited: () => this.markEditedOutsideBody(),
			reportError: (cause) => dispatchDocumentError(element, cause),
		};
		this.parts = new PartsController({
			...this.host,
			reviewDisplayMode: () => this.reviewDisplayMode,
			images: () => this.imageMedia,
			plugins: () => this.inserts.plugins(),
			sectionIndex: () => (this.view ? currentSectionIndex(this.view, this.model) : 0),
			refreshControls: () => this.refreshControls(),
			keepOpenWithin: () => [
				this.shell.toolbar,
				this.inserts.linkDialog.element,
				this.inserts.pictureDialog.element,
				...this.formatDialogs.elements,
			],
		});
		this.pages = new PageController({
			...this.host,
			paper: () => this.shell.paper,
			toolbar: () => this.shell.toolbar,
			statusBar: () => this.shell.chrome?.statusBar,
			printLayout: () => this.shell.printLayout,
			refreshControls: () => this.refreshControls(),
		});
	}

	contentWidth(): number {
		return this.model.page.width - this.model.page.marginLeft - this.model.page.marginRight;
	}

	canEditBody(): boolean {
		return !this.readOnly && (!this.collab.yjs || this.collab.yjs.session.canWrite());
	}

	/** The ribbon acts on an open header/footer/note editor, otherwise on the main text. */
	targetView(): EditorView | undefined {
		return this.parts.activeView() ?? this.view;
	}

	notifyChange(): void {
		this.dirtyState.set(true);
		emit(this.element, 'document-change', this.model);
	}

	markEditedOutsideBody(): void {
		this.shell.chrome?.setSaveState('dirty');
		this.pages.relayout();
		this.notifyChange();
	}

	scheduleCollaborationSend(): void {
		this.collab.scheduleSend(() => this.pendingCollaboration());
	}

	pendingCollaboration() {
		const state = this.view?.state ?? this.detachedState;
		return state && this.collab.client ? this.collab.client.createPendingBatch(state) : null;
	}

	applyTransaction(transaction: Transaction, remote = false): void {
		const view = this.view;
		if (!view || view.isDestroyed) return;
		remote ||= Boolean(this.collab.yjs && isWordYjsRemoteTransaction(transaction));
		if (this.collab.yjs && this.readOnly && transaction.docChanged && !remote) {
			view.updateState(view.state);
			return;
		}
		if (remote) transaction.setMeta(REMOTE_TRANSACTION_META, true);
		const previousParts = view.state.doc.attrs.sectionParts;
		const previousNotes = view.state.doc.attrs.noteParts;
		const previousComments = view.state.doc.attrs.commentThreads;
		const result = view.state.applyTransaction(transaction);
		const applied = result.state;
		const docChanged = !applied.doc.eq(view.state.doc);
		remote ||= Boolean(
			this.collab.yjs &&
			!transaction.docChanged &&
			result.transactions.some(isWordYjsRemoteTransaction),
		);
		if (applied === view.state) {
			view.updateState(applied);
			return;
		}
		const repaired =
			remote || !docChanged
				? null
				: this.collab.active
					? repairCollaborativeDocumentIds(
							applied,
							this.collab.client?.clientId ?? String(this.collab.yjs!.session.clientId),
							this.collab.ids,
						)
					: assignMissingParagraphIds(applied);
		view.updateState(repaired ? applied.apply(repaired) : applied);
		if (docChanged) {
			this.model = docToModel(view.state.doc, this.model);
			if (previousComments !== view.state.doc.attrs.commentThreads)
				this.shell.review?.commentsPanel.refresh();
			this.pages.refreshPageStyles();
			this.pages.relayout();
			this.shell.chrome?.setSaveState('dirty');
			this.notifyChange();
			if (
				(previousParts !== view.state.doc.attrs.sectionParts ||
					previousNotes !== view.state.doc.attrs.noteParts) &&
				!transaction.getMeta(HEADER_FOOTER_INPUT)
			)
				this.parts.render(this.shell.canvas, this.shell.paper, true);
		}
		this.refreshControls();
		if (docChanged || remote) this.scheduleCollaborationSend();
		if (docChanged || transaction.selectionSet || remote) this.collab.presence?.schedule();
	}

	refreshControls(): void {
		this.parts.syncSection(this.shell.canvas, this.shell.paper);
		this.shell.headings?.sync(this.locale);
		if (this.shell.toolbar)
			findLocalizedControl(this.shell.toolbar, 'Navigation pane')?.setAttribute(
				'aria-pressed',
				String(this.shell.headings?.isOpen ?? false),
			);
		const { searchPanel, printLayout, review, chrome, toolbar } = this.shell;
		searchPanel?.refresh();
		// The open pane follows the caret's thread and whether a selection can take a comment.
		if (review?.commentsOpen) review.commentsPanel.refresh();
		if (this.pages.viewMode === 'print') printLayout?.refreshCurrentPage();
		const status = refreshEditorControls(
			toolbar,
			this.targetView(),
			this.model,
			!this.canEditBody(),
			this.collab.active,
			this.locale,
			this.element.lang,
			printLayout?.pageStatus(),
			Boolean(review?.commentsOpen),
			this.canEditBody() && (!this.collab.active || Boolean(this.collab.yjs?.sharedComments)),
		);
		if (status) chrome?.refresh(status.pageText, status.wordText);
		this.pages.syncControls();
		if (toolbar)
			syncHeaderFooterRibbon(
				toolbar,
				this.parts.headerFooterContext(),
				this.model,
				this.host.canEditOutsideBody(),
			);
		syncPageState(this);
		chrome?.ribbonActions.setCommentsOpen(Boolean(review?.commentsOpen));
	}
}
