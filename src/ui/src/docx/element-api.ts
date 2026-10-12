import type { RibbonAddInTab } from '../ribbon/add-in-tabs';
import { applyRibbonAddIns } from './editor-shell';
import type { CollabSession } from 'ooxml-core/collab';
import type { WordYjsOptions } from 'ooxml-core/docx/ui';
import { renderDocument } from './editor-render';
import { yjsPresenceProfile } from './yjs-presence';
import { saveDocx } from 'ooxml-core/docx';
import { schema } from './schema';
import { docToModel } from './model-adapter';
import type { EditorCore } from './editor-core';
import { reflectAttribute } from './editor-attributes';
import { downloadBytes, wordBlob } from './file-commands';
import {
	normalizeRibbonActions,
	type RibbonActionId,
	type RibbonActionInput,
} from 'ooxml-core/docx/ui';
import { emit } from './events';
import { applyViewOptions } from './view-options';

const HTMLElementBase: typeof HTMLElement =
	typeof HTMLElement === 'undefined' ? (class {} as typeof HTMLElement) : HTMLElement;

/**
 * Save, collaboration, dirty-tracking and UI-customisation surface of `<docx-editor>`.
 * the shared `EditorCore`, so the element class stays a thin lifecycle facade.
 */
export abstract class DocxEditorApi extends HTMLElementBase {
	protected abstract readonly core: EditorCore;
	abstract fileName: string;
	abstract reviewAuthor: string;

	/** Join a synchronized Yjs room after loading its matching source package. */
	startYjsCollaboration(session: CollabSession, options: WordYjsOptions): void {
		const { core } = this;
		if (!core.view) throw new Error('Mount and load the document before starting collaboration.');
		core.collab.startYjs(session, core.view.state.doc, {
			...options,
			initialMedia: new Map([...(options.initialMedia ?? []), ...core.inserts.pendingMedia]),
			initialComments: options.initialComments ?? core.model.comments ?? [],
		});
		core.loadGeneration++;
		core.detachedState = undefined;
		renderDocument(core);
	}

	reconnectCollaboration(): void {
		if (!this.core.collab.yjs) throw new Error('No Yjs collaboration session.');
		this.core.collab.yjs.reconnect();
	}

	resyncCollaboration(): boolean {
		return this.core.collab.yjs?.resync() ?? false;
	}

	publishPresence(profile: { name: string; color: string }) {
		if (this.core.collab.yjs) {
			const validated = yjsPresenceProfile(profile);
			this.reviewAuthor = validated.name;
			this.core.collab.yjs.session.awareness.setLocalStateField('user', validated);
			return null;
		}
		if (!this.core.collab.presence)
			throw new Error('Start collaboration before publishing presence.');
		this.reviewAuthor = profile.name || this.reviewAuthor;
		return this.core.collab.presence.publish(profile);
	}
	receivePresence(message: unknown) {
		if (!this.core.collab.presence)
			throw new Error('Start collaboration before receiving presence.');
		return this.core.collab.presence.receive(message);
	}
	leavePresence() {
		this.core.collab.yjs?.session.awareness.setLocalStateField('cursor', null);
		return this.core.collab.presence?.leave() ?? null;
	}

	/** Shows the left rail of page thumbnails. Needs Print Layout; reflected to `show-thumbnails`. */
	get showThumbnails(): boolean {
		return this.core.viewOptions.showThumbnails;
	}
	set showThumbnails(value: boolean) {
		const next = Boolean(value);
		if (next !== this.core.viewOptions.showThumbnails) {
			this.core.viewOptions.showThumbnails = next;
			applyViewOptions(this.core);
		}
		reflectAttribute(this, 'show-thumbnails', this.showThumbnails);
	}

	/**
	 * Tabs a host adds after Word's own, as an Office add-in does. Each command runs its `run`
	 * callback and dispatches `office-ribbon-add-in` (`{ tab, command }`) from the editor.
	 */
	get ribbonAddIns(): readonly RibbonAddInTab[] {
		return this.core.ribbonAddIns;
	}
	set ribbonAddIns(value: readonly RibbonAddInTab[]) {
		this.core.ribbonAddIns = value ?? [];
		applyRibbonAddIns(this.core);
	}

	/** Hides the ribbon (the title bar and status bar stay). Default true; `show-toolbar="false"`. */
	get showToolbar(): boolean {
		return this.core.viewOptions.showToolbar;
	}
	set showToolbar(value: boolean) {
		const next = Boolean(value);
		if (next !== this.core.viewOptions.showToolbar) {
			this.core.viewOptions.showToolbar = next;
			applyViewOptions(this.core);
		}
		reflectAttribute(this, 'show-toolbar', this.showToolbar);
	}

	/**
	 * Ribbon controls to hide, by stable id (`RIBBON_ACTION_IDS`, e.g. `'bold'`). Unknown ids are
	 * ignored. The old English labels (`'Bold'`) are still accepted for one release: they are mapped
	 * to ids and reported through a `document-warning` event. Reading returns ids only.
	 */
	get hiddenActions(): readonly RibbonActionId[] {
		return this.core.viewOptions.hiddenActions;
	}
	set hiddenActions(value: readonly RibbonActionInput[]) {
		const { ids: next, legacy } = normalizeRibbonActions(Array.isArray(value) ? value : []);
		if (legacy.length > 0)
			emit(
				this,
				'document-warning',
				`hiddenActions: English labels (${legacy.map((label) => `'${label}'`).join(', ')}) are deprecated and will be removed in the next release; use the stable ids from RIBBON_ACTION_IDS.`,
			);
		const current = this.core.viewOptions.hiddenActions;
		if (next.length === current.length && next.every((id, index) => id === current[index])) return;
		this.core.viewOptions.hiddenActions = next;
		applyViewOptions(this.core);
	}

	/** True after an edit until the document is saved through File > Save, `download()`, loaded or `markClean()`. */
	get dirty(): boolean {
		return this.core.dirtyState.dirty;
	}

	/** Declares the current content saved, for hosts that persist the result of `save()` themselves. */
	markClean(): void {
		this.core.dirtyState.set(false);
		this.core.shell.chrome?.setSaveState('saved');
	}

	/** Serialized document bytes: the loaded package's own writer, else a fresh DOCX from the model. */
	async saveBytes(): Promise<Uint8Array> {
		const { core } = this;
		if (core.collab.yjs) {
			core.model = docToModel(core.collab.yjs.state(schema).doc, core.model);
			if (core.collab.yjs.sharedComments)
				core.model = { ...core.model, comments: core.collab.yjs.comments.all() };
		}
		// Only pass staged pictures when there are any: legacy DOC sessions take the model alone.
		const pending = new Map([
			...core.inserts.pendingMedia,
			...(core.collab.yjs?.media.all() ?? []),
		]);
		const media = pending.size ? pending : undefined;
		if (core.loaded)
			return media ? core.loaded.save(core.model, media) : core.loaded.save(core.model);
		return saveDocx(core.model, media);
	}

	/** The saved document as a Blob. Does not change `dirty`; call `markClean()` after persisting it. */
	async save(): Promise<Blob> {
		return wordBlob(await this.saveBytes(), this.fileName);
	}

	/** Saves and starts a browser download, then marks the document clean. */
	async download(fileName?: string): Promise<void> {
		const name = fileName || this.fileName;
		downloadBytes(await this.saveBytes(), /\.[^./\\]+$/.test(name) ? name : `${name}.docx`);
		this.markClean();
	}
}
