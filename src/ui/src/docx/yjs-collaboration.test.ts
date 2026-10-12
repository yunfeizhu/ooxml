// @vitest-environment jsdom
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadDocx, listRevisions } from 'ooxml-core/docx';
import {
	collectRevisionRanges,
	rejectRevisionRange,
	acceptAllChanges,
	rejectAllChanges,
} from './review-commands';
import { afterEach, describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import * as Y from 'yjs';
import { createDocument, saveDocx } from 'ooxml-core/docx';
import {
	createCollabSession,
	createMemoryHub,
	transportProvider,
	type CollabSession,
} from 'ooxml-core/collab';
import {
	toggleTrackChanges,
	toggleTrackFormatting,
	toggleTrackMoves,
	wordYjsPluginKey,
} from 'ooxml-core/docx/ui';
import type { EditorView } from 'prosemirror-view';
import { DocxEditorElement } from './index';
import './index';
import { editorBindings } from './editor-commands';
import { insertPicture } from './picture-commands';
import { TextSelection } from 'prosemirror-state';
import { toggleFormat } from './toggle-commands';
import { addComment, commentIdsAtSelection } from './comment-commands';
import { insertHardBreak } from './hard-break-command';

const sessions: CollabSession[] = [];
const editors: DocxEditorElement[] = [];
afterEach(() => {
	for (const editor of editors.splice(0)) {
		editor.stopCollaboration(true);
		editor.remove();
	}
	for (const session of sessions.splice(0)) session.destroy();
});
function mount(): DocxEditorElement {
	const editor = document.createElement('docx-editor') as DocxEditorElement;
	document.body.append(editor);
	editors.push(editor);
	return editor;
}
const viewOf = (editor: DocxEditorElement) => (editor as unknown as { view: EditorView }).view;
function pair(viewer = false, filter?: () => boolean) {
	const hub = createMemoryHub(filter ? { filter } : {});
	const join = (name: string, readOnly: boolean) => {
		const session = createCollabSession({
			roomId: 'word',
			provider: transportProvider({ transport: hub.createTransport('word') }),
			user: { name, ...(readOnly ? { role: 'viewer' as const } : {}) },
			heartbeatMs: 0,
			teardown: false,
		});
		sessions.push(session);
		return session;
	};
	return [join('Ada', false), join('Bob', viewer)] as const;
}
function start(
	a: DocxEditorElement,
	b: DocxEditorElement,
	pair: readonly [CollabSession, CollabSession],
) {
	a.startYjsCollaboration(pair[0], { documentId: 'source', initializeIfEmpty: true });
	b.startYjsCollaboration(pair[1], { documentId: 'source' });
}

describe('Word Yjs collaboration', () => {
	for (const viewer of [false, true])
		it(`retains provider body and page updates in ${viewer ? 'read-only' : 'editing'} mounted peers`, async () => {
			const peers = pair(viewer);
			const a = mount();
			const b = mount();
			start(a, b, peers);
			viewOf(a).dispatch(viewOf(a).state.tr.insertText('Alpha', 1));
			const binding = wordYjsPluginKey.getState(viewOf(a).state)!;
			const text = (binding.fragment.get(0) as Y.XmlElement).get(0) as Y.XmlText;
			peers[0].doc.transact(() => {
				peers[0].doc.getMap('docx:attributes').set('pageWidth', 900);
				text.insert(0, 'New ');
			}, 'provider-batch');
			for (const editor of [a, b]) {
				expect(viewOf(editor).state.doc.textContent).toBe('New Alpha');
				expect(editor.documentModel!.page.width).toBe(900);
				expect(editor.documentModel!.blocks[0]).toMatchObject({ runs: [{ text: 'New Alpha' }] });
				const saved = (await loadDocx(await editor.saveBytes())).model;
				expect(saved.page.width).toBe(900);
				expect(saved.blocks[0]).toMatchObject({ runs: [{ text: 'New Alpha' }] });
			}
		});
	it('retains stored font formatting on a newly inserted untracked line break', () => {
		const peers = pair();
		const a = mount();
		const b = mount();
		start(a, b, peers);
		const view = viewOf(a);
		view.dispatch(
			view.state.tr.setStoredMarks([
				view.state.schema.marks.bold!.create(),
				view.state.schema.marks.font!.create({ family: 'Georgia', size: 18 }),
			]),
		);
		expect(insertHardBreak(view.state, view.dispatch, view)).toBe(true);
		expect(view.state.doc.eq(viewOf(b).state.doc)).toBe(true);
		expect(b.documentModel!.blocks[0]).toMatchObject({
			runs: [{ text: '\n', bold: true, fontFamily: 'Georgia', fontSize: 18 }],
		});
	});
	it('shares authored hard-break revisions, deletes own insertions and restores rejected deletions', async () => {
		const peers = pair();
		const a = mount();
		const b = mount();
		const model = createDocument();
		model.trackChanges = true;
		a.documentModel = structuredClone(model);
		b.documentModel = structuredClone(model);
		a.reviewAuthor = 'Ada';
		b.reviewAuthor = 'Bob';
		start(a, b, peers);
		const av = viewOf(a);
		const bv = viewOf(b);
		av.dispatch(av.state.tr.insert(1, av.state.schema.node('hardBreak')));
		expect(av.state.doc.eq(bv.state.doc)).toBe(true);
		expect(collectRevisionRanges(bv.state.doc)).toMatchObject([{ kind: 'insert', author: 'Ada' }]);
		expect(listRevisions((await loadDocx(await b.saveBytes())).model)).toHaveLength(1);
		av.dispatch(av.state.tr.delete(1, 2));
		expect(av.state.doc.eq(bv.state.doc)).toBe(true);
		expect(collectRevisionRanges(bv.state.doc)).toHaveLength(0);
		expect(bv.state.doc.firstChild!.childCount).toBe(0);
		av.dispatch(av.state.tr.insert(1, av.state.schema.node('hardBreak')));
		expect(acceptAllChanges(av)).toBe(true);
		wordYjsPluginKey.getState(bv.state)!.stopCapturing();
		const initial = bv.state.doc;
		bv.dispatch(bv.state.tr.delete(1, 2));
		const tracked = bv.state.doc;
		expect(av.state.doc.eq(tracked)).toBe(true);
		expect(collectRevisionRanges(av.state.doc)).toMatchObject([{ kind: 'delete', author: 'Bob' }]);
		expect(wordYjsPluginKey.getState(bv.state)!.undo()).toBe(true);
		expect(av.state.doc.eq(initial)).toBe(true);
		expect(wordYjsPluginKey.getState(bv.state)!.redo()).toBe(true);
		expect(av.state.doc.eq(tracked)).toBe(true);
		expect(rejectAllChanges(av)).toBe(true);
		expect(av.state.doc.eq(bv.state.doc)).toBe(true);
		expect(collectRevisionRanges(bv.state.doc)).toHaveLength(0);
		expect(bv.state.doc.firstChild!.childCount).toBe(1);
	});
	for (const name of ['picture', 'note', 'break', 'field', 'line-break'])
		it(`shares newly recorded native ${name} object formatting with author history`, async () => {
			const bytes = new Uint8Array(
				await readFile(
					resolve(
						`../core/docx/__fixtures__/${name === 'line-break' ? 'review-line-break-formatting' : 'review-object-formatting'}/${name}-before.docx`,
					),
				),
			);
			const peers = pair();
			const a = mount();
			const b = mount();
			await a.load(bytes);
			await b.load(bytes);
			a.reviewAuthor = 'Ada';
			b.reviewAuthor = 'Bob';
			start(a, b, peers);
			toggleTrackChanges(viewOf(a).state, viewOf(a).dispatch, viewOf(a));
			const collab = wordYjsPluginKey.getState(viewOf(b).state)!;
			collab.stopCapturing();
			const initial = viewOf(b).state.doc;
			let position = -1;
			initial.descendants((node, pos) => {
				if (position >= 0 || !node.isInline || node.isText) return;
				if (node.type.name === 'fieldMarker' && node.attrs.kind !== 'code') return;
				position = pos;
			});
			viewOf(b).dispatch(
				viewOf(b).state.tr.setSelection(TextSelection.create(initial, position, position + 1)),
			);
			if (name === 'field')
				viewOf(b).dispatch(
					viewOf(b).state.tr.addMark(
						position,
						position + 1,
						viewOf(b).state.schema.marks.bold!.create(),
					),
				);
			else expect(toggleFormat('bold')(viewOf(b).state, viewOf(b).dispatch, viewOf(b))).toBe(true);
			const recorded = viewOf(b).state.doc;
			for (const editor of [a, b]) {
				expect(viewOf(editor).state.doc.eq(recorded)).toBe(true);
				expect(collectRevisionRanges(viewOf(editor).state.doc)).toMatchObject([
					{ kind: 'formatChange', author: 'Bob' },
				]);
				expect(listRevisions((await loadDocx(await editor.saveBytes())).model)).toHaveLength(1);
			}
			expect(collab.undo()).toBe(true);
			expect(viewOf(a).state.doc.eq(initial)).toBe(true);
			expect(collab.redo()).toBe(true);
			expect(viewOf(a).state.doc.eq(recorded)).toBe(true);
			wordYjsPluginKey.getState(viewOf(a).state)!.stopCapturing();
			expect(rejectAllChanges(viewOf(a))).toBe(true);
			for (const editor of [a, b])
				expect(listRevisions((await loadDocx(await editor.saveBytes())).model)).toHaveLength(0);
			expect(wordYjsPluginKey.getState(viewOf(a).state)!.undo()).toBe(true);
			expect(viewOf(b).state.doc.eq(recorded)).toBe(true);
		});
	for (const name of ['picture', 'note', 'break', 'field', 'line-break'])
		for (const mode of ['accept', 'reject'] as const)
			it(`shares native ${name} formatting ${mode} and one undo operation`, async () => {
				const bytes = new Uint8Array(
					await readFile(
						resolve(
							`../core/docx/__fixtures__/${name === 'line-break' ? 'review-line-break-formatting' : 'review-object-formatting'}/${name}-tracked.docx`,
						),
					),
				);
				const peers = pair();
				const a = mount();
				const b = mount();
				await a.load(bytes);
				await b.load(bytes);
				start(a, b, peers);
				const initial = viewOf(a).state.doc;
				expect(collectRevisionRanges(initial)).toHaveLength(1);
				expect((mode === 'accept' ? acceptAllChanges : rejectAllChanges)(viewOf(a))).toBe(true);
				const resolved = viewOf(a).state.doc;
				for (const editor of [a, b]) {
					expect(viewOf(editor).state.doc.eq(resolved)).toBe(true);
					expect(listRevisions((await loadDocx(await editor.saveBytes())).model)).toHaveLength(0);
				}
				const collab = wordYjsPluginKey.getState(viewOf(a).state)!;
				expect(collab.undo()).toBe(true);
				expect(viewOf(b).state.doc.eq(initial)).toBe(true);
				expect(collab.redo()).toBe(true);
				expect(viewOf(b).state.doc.eq(resolved)).toBe(true);
			});
	for (const mode of ['accept', 'reject'] as const)
		it(`shares native all-story ${mode} with one undo operation`, async () => {
			const bytes = new Uint8Array(
				await readFile(
					resolve('../core/docx/__fixtures__/review-stories/all-stories-tracked.docx'),
				),
			);
			const peers = pair();
			const a = mount();
			const b = mount();
			await a.load(bytes);
			await b.load(bytes);
			start(a, b, peers);
			const initial = viewOf(a).state.doc;
			expect(listRevisions(a.documentModel!)).toHaveLength(5);
			expect((mode === 'accept' ? acceptAllChanges : rejectAllChanges)(viewOf(a))).toBe(true);
			const resolved = viewOf(a).state.doc;
			for (const editor of [a, b]) {
				expect(viewOf(editor).state.doc.eq(resolved)).toBe(true);
				expect(listRevisions(editor.documentModel!)).toHaveLength(0);
				expect(listRevisions((await loadDocx(await editor.saveBytes())).model)).toHaveLength(0);
			}
			const collab = wordYjsPluginKey.getState(viewOf(a).state)!;
			expect(collab.undo()).toBe(true);
			for (const editor of [a, b]) {
				expect(viewOf(editor).state.doc.eq(initial)).toBe(true);
				expect(listRevisions(editor.documentModel!)).toHaveLength(5);
			}
			expect(collab.redo()).toBe(true);
			expect(viewOf(b).state.doc.eq(resolved)).toBe(true);
		});
	for (const mode of ['accept', 'reject'] as const)
		it(`shares native paragraph mark ${mode} with one undo operation`, async () => {
			const bytes = new Uint8Array(
				await readFile(
					resolve('../core/docx/__fixtures__/review-inline/break-insert-tracked.docx'),
				),
			);
			const peers = pair();
			const a = mount();
			const b = mount();
			await a.load(bytes);
			await b.load(bytes);
			start(a, b, peers);
			const initial = viewOf(a).state.doc;
			expect(collectRevisionRanges(initial)).toHaveLength(3);
			expect((mode === 'accept' ? acceptAllChanges : rejectAllChanges)(viewOf(a))).toBe(true);
			const resolved = viewOf(a).state.doc;
			for (const editor of [a, b]) {
				expect(viewOf(editor).state.doc.eq(resolved)).toBe(true);
				expect(editor.documentModel!.blocks).toHaveLength(mode === 'accept' ? 3 : 1);
				expect(listRevisions((await loadDocx(await editor.saveBytes())).model)).toHaveLength(0);
			}
			const collab = wordYjsPluginKey.getState(viewOf(a).state)!;
			expect(collab.undo()).toBe(true);
			expect(viewOf(b).state.doc.eq(initial)).toBe(true);
			expect(collectRevisionRanges(viewOf(b).state.doc)).toHaveLength(3);
			expect(collab.redo()).toBe(true);
			expect(viewOf(b).state.doc.eq(resolved)).toBe(true);
		});
	for (const name of ['note-insert', 'note-delete'])
		for (const mode of ['accept', 'reject'] as const)
			it(`shares native ${name} ${mode} and note history as one undo operation`, async () => {
				const bytes = new Uint8Array(
					await readFile(resolve(`../core/docx/__fixtures__/review-inline/${name}-tracked.docx`)),
				);
				const peers = pair();
				const a = mount();
				const b = mount();
				await a.load(bytes);
				await b.load(bytes);
				start(a, b, peers);
				const initial = viewOf(a).state.doc;
				expect((mode === 'accept' ? acceptAllChanges : rejectAllChanges)(viewOf(a))).toBe(true);
				const resolved = viewOf(a).state.doc;
				expect(viewOf(b).state.doc.eq(resolved)).toBe(true);
				const retained = (name === 'note-insert') === (mode === 'accept');
				for (const editor of [a, b]) {
					expect(listRevisions(editor.documentModel!)).toHaveLength(0);
					expect(editor.documentModel!.footnotes).toHaveLength(retained ? 1 : 0);
					const exported = (await loadDocx(await editor.saveBytes())).model;
					expect(listRevisions(exported)).toHaveLength(0);
					expect(exported.footnotes).toHaveLength(retained ? 1 : 0);
				}
				const collab = wordYjsPluginKey.getState(viewOf(a).state)!;
				expect(collab.undo()).toBe(true);
				for (const editor of [a, b]) {
					expect(viewOf(editor).state.doc.eq(initial)).toBe(true);
					expect(editor.documentModel!.footnotes).toHaveLength(1);
					expect(listRevisions(editor.documentModel!).length).toBeGreaterThan(1);
				}
				expect(collab.redo()).toBe(true);
				expect(viewOf(b).state.doc.eq(resolved)).toBe(true);
			});
	it('retains revised picture and break properties through shared typing and export', async () => {
		const model = createDocument();
		model.blocks = [
			{
				type: 'paragraph',
				id: 'p',
				runs: [
					{ text: '', break: 'page', revision: { id: 'break', kind: 'insert', author: 'Ada' } },
					{
						text: '',
						image: {
							relId: 'rId1',
							partName: 'word/media/image.png',
							contentType: 'image/png',
							widthPx: 20,
							heightPx: 20,
						},
						revision: { id: 'picture', kind: 'delete', author: 'Ada' },
					},
					{ text: 'Keep' },
				],
			},
		];
		const peers = pair();
		const a = mount();
		const b = mount();
		a.documentModel = model;
		b.documentModel = structuredClone(model);
		start(a, b, peers);
		wordYjsPluginKey.getState(viewOf(a).state)!.media.publish('word/media/image.png', {
			contentType: 'image/png',
			bytes: new Uint8Array([137, 80, 78, 71]),
		});
		viewOf(b).dispatch(viewOf(b).state.tr.insertText('!', 7));
		expect(a.documentModel).toEqual(b.documentModel);
		expect(a.documentModel!.blocks[0]).toMatchObject({
			runs: [
				{ break: 'page', revision: { kind: 'insert', author: 'Ada' } },
				{
					image: { partName: 'word/media/image.png' },
					revision: { kind: 'delete', author: 'Ada' },
				},
				{ text: 'Keep!' },
			],
		});
		for (const editor of [a, b]) {
			const reopened = (await loadDocx(await editor.saveBytes())).model;
			expect(reopened.blocks[0]).toMatchObject({
				runs: [
					{ break: 'page', revision: { kind: 'insert', author: 'Ada' } },
					{ image: {}, revision: { kind: 'delete', author: 'Ada' } },
					{ text: 'Keep!' },
				],
			});
		}
		const tracked = viewOf(a).state.doc;
		expect(acceptAllChanges(viewOf(a))).toBe(true);
		expect(viewOf(a).state.doc.eq(viewOf(b).state.doc)).toBe(true);
		expect(collectRevisionRanges(viewOf(b).state.doc)).toEqual([]);
		expect(a.documentModel!.blocks[0]).toMatchObject({
			runs: [{ break: 'page' }, { text: 'Keep!' }],
		});
		expect(wordYjsPluginKey.getState(viewOf(a).state)!.undo()).toBe(true);
		expect(viewOf(b).state.doc.eq(tracked)).toBe(true);
		expect(rejectAllChanges(viewOf(b))).toBe(true);
		expect(viewOf(a).state.doc.eq(viewOf(b).state.doc)).toBe(true);
		expect(collectRevisionRanges(viewOf(a).state.doc)).toEqual([]);
		expect(a.documentModel!.blocks[0]).toMatchObject({ runs: [{ image: {} }, { text: 'Keep!' }] });
		expect(wordYjsPluginKey.getState(viewOf(b).state)!.undo()).toBe(true);
		expect(viewOf(a).state.doc.eq(tracked)).toBe(true);
	});
	it('keeps Original formatting display local without changing shared content or undo', async () => {
		const bytes = new Uint8Array(
			await readFile(resolve('../core/docx/__fixtures__/review-formatting/bold-tracked.docx')),
		);
		const peers = pair();
		const a = mount();
		const b = mount();
		await a.load(bytes);
		await b.load(bytes);
		start(a, b, peers);
		const source = viewOf(a).state.doc.toJSON();
		const changeMode = (editor: DocxEditorElement, mode: string) => {
			const select = editor.shadowRoot!.querySelector<HTMLSelectElement>(
				'[aria-label="Display for review"]',
			)!;
			select.value = mode;
			select.dispatchEvent(new Event('change', { bubbles: true }));
		};
		changeMode(a, 'original');
		expect(viewOf(a).dom.getAttribute('data-review-display')).toBe('original');
		expect(viewOf(b).dom.getAttribute('data-review-display')).toBe('all');
		expect(viewOf(a).dom.querySelector('strong')!.style.fontWeight).toBe('inherit');
		expect(viewOf(b).dom.querySelector('strong')!.style.fontWeight).toBe('');
		for (const editor of [a, b]) {
			expect(viewOf(editor).state.doc.toJSON()).toEqual(source);
			expect(wordYjsPluginKey.getState(viewOf(editor).state)!.canUndo()).toBe(false);
			expect(collectRevisionRanges(viewOf(editor).state.doc)).toHaveLength(1);
		}
		changeMode(a, 'final');
		expect(viewOf(a).dom.querySelector('strong')!.style.fontWeight).toBe('');
		expect(viewOf(b).state.doc.toJSON()).toEqual(source);
	});
	it('applies tracking dialog preferences as one shared undo operation', () => {
		const peers = pair();
		const a = mount();
		const b = mount();
		start(a, b, peers);
		a.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Tracking options"]')!.click();
		const dialog = a.shadowRoot!.querySelector<HTMLElement>(
			'office-ui-dialog[data-title="Tracking options"]',
		)!;
		for (const name of ['Track formatting', 'Track moves']) {
			const input = dialog.querySelector<HTMLInputElement>(`[aria-label="${name}"]`)!;
			input.checked = false;
			input.dispatchEvent(new Event('change', { bubbles: true }));
		}
		[...dialog.querySelectorAll<HTMLButtonElement>('button')]
			.find((button) => button.textContent === 'OK')!
			.click();
		expect(viewOf(a).state.doc.toJSON()).toEqual(viewOf(b).state.doc.toJSON());
		expect(viewOf(b).state.doc.attrs).toMatchObject({ trackFormatting: false, trackMoves: false });
		expect(editorBindings['Mod-z']!(viewOf(a).state, viewOf(a).dispatch, viewOf(a))).toBe(true);
		expect(viewOf(b).state.doc.attrs).toMatchObject({ trackFormatting: true, trackMoves: true });
		expect(editorBindings['Mod-Shift-z']!(viewOf(a).state, viewOf(a).dispatch, viewOf(a))).toBe(
			true,
		);
		expect(viewOf(b).state.doc.attrs).toMatchObject({ trackFormatting: false, trackMoves: false });
	});
	it('shares a direct off override of a native style page break and restores inheritance on rejection', async () => {
		const bytes = new Uint8Array(
			await readFile(resolve('../core/docx/__fixtures__/page-break-style/page-break-style.docx')),
		);
		const peers = pair();
		const a = mount();
		const b = mount();
		await a.load(bytes);
		await b.load(bytes);
		start(a, b, peers);
		toggleTrackChanges(viewOf(a).state, viewOf(a).dispatch, viewOf(a));
		const pos = viewOf(b).state.doc.firstChild!.nodeSize;
		expect(viewOf(b).state.doc.nodeAt(pos)!.attrs.pageBreakBefore).toBeNull();
		viewOf(b).dispatch(viewOf(b).state.tr.setNodeAttribute(pos, 'pageBreakBefore', false));
		expect(viewOf(a).state.doc.toJSON()).toEqual(viewOf(b).state.doc.toJSON());
		expect(viewOf(a).state.doc.nodeAt(pos)!.attrs.pageBreakBefore).toBe(false);
		const off = (await loadDocx(await a.saveBytes())).model.blocks[1];
		expect(off).toMatchObject({
			pageBreakBefore: false,
			formatRevision: { kind: 'paragraphChange' },
		});
		rejectRevisionRange(viewOf(a), collectRevisionRanges(viewOf(a).state.doc)[0]!);
		expect(viewOf(a).state.doc.toJSON()).toEqual(viewOf(b).state.doc.toJSON());
		expect(viewOf(b).state.doc.nodeAt(pos)!.attrs.pageBreakBefore).toBeNull();
		expect((await loadDocx(await b.saveBytes())).model.blocks[1]).not.toHaveProperty(
			'pageBreakBefore',
		);
	});
	it('shares newly recorded paragraph formatting with atomic peer undo, redo and rejection', async () => {
		const bytes = new Uint8Array(
			await readFile(
				resolve('../core/docx/__fixtures__/review-paragraph-formatting/multiple-before.docx'),
			),
		);
		const peers = pair();
		const a = mount();
		const b = mount();
		await a.load(bytes);
		await b.load(bytes);
		a.reviewAuthor = 'Ada';
		b.reviewAuthor = 'Bob';
		start(a, b, peers);
		toggleTrackChanges(viewOf(a).state, viewOf(a).dispatch, viewOf(a));
		wordYjsPluginKey.getState(viewOf(b).state)!.stopCapturing();
		const paragraph = viewOf(b).state.doc.firstChild!;
		viewOf(b).dispatch(
			viewOf(b).state.tr.setNodeMarkup(0, undefined, {
				...paragraph.attrs,
				align: 'center',
				keepNext: true,
			}),
		);
		expect(viewOf(a).state.doc.toJSON()).toEqual(viewOf(b).state.doc.toJSON());
		expect(viewOf(a).state.doc.firstChild!.attrs.formatRevision).toMatchObject({
			kind: 'paragraphChange',
			author: 'Bob',
		});
		const xml = await (
			await JSZip.loadAsync(await a.saveBytes())
		)
			.file('word/document.xml')!
			.async('string');
		expect(xml).toContain('pPrChange');
		expect(xml).toContain('dateUtc');
		const tracked = viewOf(a).state.doc;
		expect(editorBindings['Mod-z']!(viewOf(b).state, viewOf(b).dispatch, viewOf(b))).toBe(true);
		expect(viewOf(a).state.doc.firstChild!.attrs.formatRevision).toBeNull();
		expect(editorBindings['Mod-Shift-z']!(viewOf(b).state, viewOf(b).dispatch, viewOf(b))).toBe(
			true,
		);
		expect(viewOf(a).state.doc.eq(tracked)).toBe(true);
		const range = collectRevisionRanges(viewOf(a).state.doc)[0]!;
		rejectRevisionRange(viewOf(a), range);
		expect(viewOf(a).state.doc.toJSON()).toEqual(viewOf(b).state.doc.toJSON());
		expect(viewOf(b).state.doc.firstChild!.attrs.align).toBe(paragraph.attrs.align);
		expect(viewOf(b).state.doc.firstChild!.attrs.keepNext).toBe(paragraph.attrs.keepNext);
		const reopened = await loadDocx(await b.saveBytes());
		const result = reopened.model.blocks[0]!;
		if (result.type !== 'paragraph') throw new Error('Expected paragraph');
		expect(result.formatRevision).toBeUndefined();
		expect(result.sourceParagraphPropertiesXml).toContain('Arial');
	});
	it('shares native recording preferences, honors them in edits, and undoes preference changes', async () => {
		const bytes = new Uint8Array(
			await readFile(
				resolve(
					import.meta.dirname,
					'../../../core/docx/__fixtures__/review-preferences/preferences.docx',
				),
			),
		);
		const a = mount();
		const b = mount();
		await a.load(bytes);
		await b.load(bytes);
		start(a, b, pair());
		const view = viewOf(b);
		for (const editor of [a, b]) {
			expect(viewOf(editor).state.doc.attrs).toMatchObject({
				trackFormatting: false,
				trackMoves: false,
			});
		}
		view.dispatch(view.state.tr.addMark(1, 11, view.state.schema.marks.bold!.create()));
		for (const editor of [a, b]) {
			expect(collectRevisionRanges(viewOf(editor).state.doc)).toEqual([]);
			const exported = await loadDocx(await editor.saveBytes());
			expect(exported.model).toMatchObject({
				trackChanges: true,
				trackFormatting: false,
				trackMoves: false,
			});
		}
		expect(toggleTrackFormatting(view.state, view.dispatch, view)).toBe(true);
		for (const editor of [a, b]) expect(viewOf(editor).state.doc.attrs.trackFormatting).toBe(true);
		expect(wordYjsPluginKey.getState(view.state)!.undo()).toBe(true);
		for (const editor of [a, b]) expect(viewOf(editor).state.doc.attrs.trackFormatting).toBe(false);
		expect(wordYjsPluginKey.getState(view.state)!.redo()).toBe(true);
		for (const editor of [a, b]) expect(viewOf(editor).state.doc.attrs.trackFormatting).toBe(true);
		view.dispatch(view.state.tr.addMark(1, 11, view.state.schema.marks.italic!.create()));
		for (const editor of [a, b])
			expect(collectRevisionRanges(viewOf(editor).state.doc)).toHaveLength(1);
		rejectRevisionRange(view, collectRevisionRanges(view.state.doc)[0]!);
		expect(toggleTrackMoves(view.state, view.dispatch, view)).toBe(true);
		for (const editor of [a, b]) expect(viewOf(editor).state.doc.attrs.trackMoves).toBe(true);
		b.readOnly = true;
		expect(toggleTrackFormatting(view.state, view.dispatch, view)).toBe(false);
	});
	it('records peer formatting with one reversible revision and both peers export its prior properties', async () => {
		const bytes = new Uint8Array(
			await readFile(
				resolve(
					import.meta.dirname,
					'../../../core/docx/__fixtures__/formatting-actions/baseline.docx',
				),
			),
		);
		const peers = pair();
		const a = mount();
		const b = mount();
		a.reviewAuthor = 'Ada';
		b.reviewAuthor = 'Bob';
		await a.load(bytes);
		await b.load(bytes);
		start(a, b, peers);
		const view = viewOf(b);
		toggleTrackChanges(view.state, view.dispatch, view);
		const before = view.state.doc;
		view.dispatch(view.state.tr.addMark(1, 7, view.state.schema.marks.bold!.create()));
		const changed = view.state.doc;
		for (const editor of [a, b]) {
			expect(viewOf(editor).state.doc.eq(changed)).toBe(true);
			expect(collectRevisionRanges(viewOf(editor).state.doc)).toMatchObject([
				{ kind: 'formatChange', author: 'Bob' },
			]);
			const exported = await loadDocx(await editor.saveBytes());
			const paragraph = exported.model.blocks[0]!;
			if (paragraph.type !== 'paragraph') throw new Error('Expected paragraph');
			expect(paragraph.runs[0]?.bold).toBe(true);
			expect(paragraph.runs[0]?.revision?.previousRunPropertiesXml).toContain('rPr');
		}
		expect(wordYjsPluginKey.getState(view.state)!.undo()).toBe(true);
		for (const editor of [a, b]) expect(viewOf(editor).state.doc.eq(before)).toBe(true);
		expect(wordYjsPluginKey.getState(view.state)!.redo()).toBe(true);
		for (const editor of [a, b]) expect(viewOf(editor).state.doc.eq(changed)).toBe(true);
		rejectRevisionRange(view, collectRevisionRanges(view.state.doc)[0]!);
		for (const editor of [a, b])
			expect(collectRevisionRanges(viewOf(editor).state.doc)).toEqual([]);
	});
	it('retains opaque current run properties through tracked peer typing, export and history', async () => {
		const zip = new JSZip();
		zip.file(
			'word/document.xml',
			'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:x="urn:peer-properties"><w:body><w:p><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:hint="eastAsia" w:asciiTheme="minorAscii"/><x:property x:value="retained"/></w:rPr><w:t>Text</w:t></w:r></w:p><w:sectPr/></w:body></w:document>',
		);
		const bytes = await zip.generateAsync({ type: 'uint8array' });
		const peers = pair();
		const a = mount();
		const b = mount();
		await a.load(bytes);
		await b.load(bytes);
		start(a, b, peers);
		const view = viewOf(b);
		toggleTrackChanges(view.state, view.dispatch, view);
		const before = view.state.doc;
		view.dispatch(view.state.tr.insertText('!', 3));
		for (const editor of [a, b]) {
			const exported = await JSZip.loadAsync(await editor.saveBytes());
			const xml = await exported.file('word/document.xml')!.async('string');
			expect(xml.match(/x:value="retained"/g)).toHaveLength(3);
			expect(xml.match(/w:hint="eastAsia"/g)).toHaveLength(3);
			expect(xml).toContain('<w:ins ');
		}
		expect(wordYjsPluginKey.getState(view.state)!.undo()).toBe(true);
		for (const editor of [a, b]) expect(viewOf(editor).state.doc.eq(before)).toBe(true);
		expect(wordYjsPluginKey.getState(view.state)!.redo()).toBe(true);
		const xml = await (
			await JSZip.loadAsync(await a.saveBytes())
		)
			.file('word/document.xml')!
			.async('string');
		expect(xml.match(/x:value="retained"/g)).toHaveLength(3);
	});
	it.each(['bold', 'multiple'])(
		'preserves overlapping %s formatting and tracked peer typing',
		async (name) => {
			const bytes = new Uint8Array(
				await readFile(
					resolve('../core/docx/__fixtures__/review-formatting', `${name}-tracked.docx`),
				),
			);
			const peers = pair();
			const a = mount();
			const b = mount();
			await a.load(bytes);
			await b.load(bytes);
			start(a, b, peers);
			const typing = viewOf(b);
			typing.dispatch(typing.state.tr.insertText('!', 5));
			const beforeResolution = viewOf(a).state.doc;
			for (const editor of [a, b]) {
				const reopened = await loadDocx(await editor.saveBytes());
				const paragraph = reopened.model.blocks[0]!;
				if (paragraph.type !== 'paragraph') throw new Error('Expected paragraph');
				const insertion = paragraph.runs.find((run) => run.revision?.kind === 'insert');
				expect(insertion?.text).toBe('!');
				expect(insertion?.formatRevision?.kind).toBe('formatChange');
				expect(paragraph.runs.filter((run) => run.revision?.kind === 'formatChange')).toHaveLength(
					2,
				);
			}
			const view = viewOf(a);
			rejectRevisionRange(
				view,
				collectRevisionRanges(view.state.doc).find((range) => range.kind === 'formatChange')!,
			);
			for (const editor of [a, b]) {
				const reopened = await loadDocx(await editor.saveBytes());
				const paragraph = reopened.model.blocks[0]!;
				if (paragraph.type !== 'paragraph') throw new Error('Expected paragraph');
				expect(paragraph.runs.map((run) => run.text).join('')).toBe('Form!at me');
				expect(
					paragraph.runs.some((run) => run.formatRevision || run.revision?.kind === 'formatChange'),
				).toBe(false);
				expect(paragraph.runs.find((run) => run.revision?.kind === 'insert')?.text).toBe('!');
			}
			expect(wordYjsPluginKey.getState(view.state)!.undo()).toBe(true);
			for (const editor of [a, b]) expect(viewOf(editor).state.doc.eq(beforeResolution)).toBe(true);
			expect(wordYjsPluginKey.getState(view.state)!.redo()).toBe(true);
		},
	);
	it('shares paragraph formatting rejection, peer export and undo/redo', async () => {
		const native = await loadDocx(
			new Uint8Array(
				await readFile(
					resolve('../core/docx/__fixtures__/review-paragraph-formatting/multiple-rejected.docx'),
				),
			),
		);
		const bytes = new Uint8Array(
			await readFile(
				resolve('../core/docx/__fixtures__/review-paragraph-formatting/multiple-tracked.docx'),
			),
		);
		const peers = pair();
		const a = mount();
		const b = mount();
		await a.load(bytes);
		await b.load(bytes);
		start(a, b, peers);
		const first = viewOf(a);
		const before = first.state.doc;
		rejectRevisionRange(first, collectRevisionRanges(before)[0]!);
		for (const editor of [a, b]) {
			const paragraph = editor.documentModel!.blocks[0]!;
			if (paragraph.type !== 'paragraph') throw new Error('Expected paragraph');
			const { restoredParagraphPropertiesXml: _snapshot, ...actual } = paragraph;
			expect(actual).toEqual(native.model.blocks[0]);
			expect(paragraph.formatRevision).toBeUndefined();
		}
		const reopened = await loadDocx(await b.saveBytes());
		const paragraph = reopened.model.blocks[0]!;
		if (paragraph.type !== 'paragraph') throw new Error('Expected paragraph');
		expect(paragraph).toEqual(native.model.blocks[0]);
		expect(paragraph.formatRevision).toBeUndefined();
		expect(wordYjsPluginKey.getState(first.state)!.undo()).toBe(true);
		for (const editor of [a, b]) expect(viewOf(editor).state.doc.eq(before)).toBe(true);
		expect(wordYjsPluginKey.getState(first.state)!.redo()).toBe(true);
		expect(collectRevisionRanges(viewOf(b).state.doc)).toEqual([]);
	});
	it.each([true, false])(
		'retains native paragraph formatting history during peer typing with tracking %s',
		async (tracked) => {
			const bytes = new Uint8Array(
				await readFile(
					resolve('../core/docx/__fixtures__/review-paragraph-formatting/multiple-tracked.docx'),
				),
			);
			const loaded = await loadDocx(bytes);
			const paragraph = loaded.model.blocks[0]!;
			if (paragraph.type !== 'paragraph') throw new Error('Expected paragraph');
			const peers = pair();
			const a = mount();
			const b = mount();
			await a.load(bytes);
			await b.load(bytes);
			start(a, b, peers);
			const first = viewOf(a);
			if (!tracked) toggleTrackChanges(first.state, first.dispatch, first);
			const view = viewOf(b);
			view.dispatch(view.state.tr.insertText('!', 5));
			for (const editor of [a, b]) {
				const actual = editor.documentModel!.blocks[0]!;
				if (actual.type !== 'paragraph') throw new Error('Expected paragraph');
				expect(actual.formatRevision).toEqual(paragraph.formatRevision);
				expect(actual.runs.some((run) => run.revision?.kind === 'insert')).toBe(tracked);
				for (const run of actual.runs)
					expect(run.fontFamilyComplexScript).toBe(paragraph.runs[0]?.fontFamilyComplexScript);
				const reopened = await loadDocx(await editor.saveBytes());
				const exported = reopened.model.blocks[0]!;
				if (exported.type !== 'paragraph') throw new Error('Expected paragraph');
				expect(exported.formatRevision).toEqual(paragraph.formatRevision);
				expect(exported.runs.some((run) => run.revision?.kind === 'insert')).toBe(tracked);
				for (const run of exported.runs)
					expect(run.fontFamilyComplexScript).toBe(paragraph.runs[0]?.fontFamilyComplexScript);
			}
		},
	);
	it('shares imported formatting rejection and its undo without recording remote changes', async () => {
		const bytes = new Uint8Array(
			await readFile(resolve('../core/docx/__fixtures__/review-formatting/multiple-tracked.docx')),
		);
		const peers = pair();
		const a = mount();
		const b = mount();
		await a.load(bytes);
		await b.load(bytes);
		start(a, b, peers);
		const first = viewOf(a);
		const before = first.state.doc;
		const range = collectRevisionRanges(first.state.doc)[0]!;
		expect(range.kind).toBe('formatChange');
		rejectRevisionRange(first, range);
		for (const editor of [a, b]) {
			const paragraph = editor.documentModel!.blocks[0]!;
			if (paragraph.type !== 'paragraph') throw new Error('Expected paragraph');
			expect(paragraph.runs[0]).toMatchObject({ text: 'Format me', bold: true, color: '#0000FF' });
			expect(paragraph.runs[0]!.italic).toBeUndefined();
			expect(paragraph.runs[0]!.revision).toBeUndefined();
		}
		const reopened = await loadDocx(await b.saveBytes());
		const paragraph = reopened.model.blocks[0]!;
		if (paragraph.type !== 'paragraph') throw new Error('Expected paragraph');
		expect(paragraph.runs[0]).toMatchObject({ text: 'Format me', bold: true, color: '#0000FF' });
		expect(wordYjsPluginKey.getState(viewOf(a).state)!.undo()).toBe(true);
		for (const editor of [a, b]) expect(viewOf(editor).state.doc.eq(before)).toBe(true);
		expect(wordYjsPluginKey.getState(viewOf(a).state)!.redo()).toBe(true);
		expect(collectRevisionRanges(viewOf(b).state.doc)).toEqual([]);
	});

	it('merges concurrent overlapping anchors and undoes only the local comment mark', () => {
		let deliver = true;
		const peers = pair(false, () => deliver);
		const a = mount();
		const b = mount();
		a.documentModel = {
			...createDocument(),
			blocks: [{ type: 'paragraph', id: 'p', runs: [{ text: 'Shared text' }] }],
		};
		b.documentModel = a.documentModel!;
		start(a, b, peers);
		deliver = false;
		for (const [index, editor] of [a, b].entries()) {
			const view = viewOf(editor);
			view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 7)));
			addComment(view, index ? 'Bob' : 'Ada', 'Note', () => (index ? 'c2' : 'c1'));
		}
		deliver = true;
		a.resyncCollaboration();
		for (const editor of [a, b])
			expect(commentIdsAtSelection(viewOf(editor))).toEqual(['c1', 'c2']);
		expect(viewOf(a).state.doc.toJSON()).toEqual(viewOf(b).state.doc.toJSON());
		const model = a.documentModel!;
		if (model.blocks[0]!.type !== 'paragraph') throw new Error('Expected paragraph');
		expect(model.blocks[0]!.runs[0]!.commentIds).toEqual(['c1', 'c2']);
		expect(editorBindings['Mod-z']!(viewOf(a).state, viewOf(a).dispatch, viewOf(a))).toBe(true);
		for (const editor of [a, b]) expect(commentIdsAtSelection(viewOf(editor))).toEqual(['c2']);
	});
	it('converges after a partition and undoes only the local author', () => {
		let deliver = true;
		const peers = pair(false, () => deliver);
		const a = mount();
		const b = mount();
		start(a, b, peers);
		deliver = false;
		viewOf(a).dispatch(viewOf(a).state.tr.insertText('Ada', 1));
		viewOf(b).dispatch(viewOf(b).state.tr.insertText('Bob', 1));
		deliver = true;
		expect(a.resyncCollaboration()).toBe(true);
		expect(viewOf(a).state.doc.toJSON()).toEqual(viewOf(b).state.doc.toJSON());
		expect(viewOf(a).state.doc.textContent).toContain('Ada');
		expect(viewOf(a).state.doc.textContent).toContain('Bob');
		expect(editorBindings['Mod-z']!(viewOf(a).state, viewOf(a).dispatch, viewOf(a))).toBe(true);
		expect(viewOf(a).state.doc.textContent).toBe('Bob');
		expect(viewOf(b).state.doc.textContent).toBe('Bob');
	});
	it('preserves section settings and local undo across view teardown', () => {
		const peers = pair();
		const a = mount();
		const b = mount();
		start(a, b, peers);
		viewOf(a).dispatch(
			viewOf(a).state.tr.setDocAttribute('pageWidth', 1000).setDocAttribute('marginLeft', 120),
		);
		expect(viewOf(b).state.doc.attrs.pageWidth).toBe(1000);
		expect(viewOf(b).state.doc.attrs.marginLeft).toBe(120);
		wordYjsPluginKey.getState(viewOf(a).state)!.stopCapturing();
		viewOf(a).dispatch(viewOf(a).state.tr.insertText('local', 1));
		a.remove();
		viewOf(b).dispatch(viewOf(b).state.tr.insertText(' remote', 6));
		document.body.append(a);
		expect(viewOf(a).state.doc.textContent).toBe('local remote');
		expect(viewOf(a).state.doc.attrs.pageWidth).toBe(1000);
		expect(editorBindings['Mod-z']!(viewOf(a).state, viewOf(a).dispatch, viewOf(a))).toBe(true);
		expect(viewOf(b).state.doc.textContent).toBe(' remote');
		a.reconnectCollaboration();
		expect(viewOf(a).state.doc.toJSON()).toEqual(viewOf(b).state.doc.toJSON());
	});
	it('rejects local writes for viewer peers and retains opaque DOCX parts on save', async () => {
		const zip = await JSZip.loadAsync(await saveDocx(createDocument()));
		zip.file('custom/preserved.txt', 'package payload');
		const source = await zip.generateAsync({ type: 'uint8array' });
		const a = mount();
		const b = mount();
		await Promise.all([a.load(source), b.load(source)]);
		start(a, b, pair(true));
		b.readOnly = true;
		b.readOnly = false;
		expect(viewOf(b).editable).toBe(false);
		viewOf(b).dispatch(viewOf(b).state.tr.insertText('forbidden', 1));
		expect(viewOf(b).state.doc.textContent).toBe('');
		viewOf(a).dispatch(viewOf(a).state.tr.insertText('مرحبا', 1));
		expect(viewOf(b).state.doc.textContent).toBe('مرحبا');
		const saved = await JSZip.loadAsync(await b.saveBytes());
		expect(await saved.file('custom/preserved.txt')!.async('string')).toBe('package payload');
	});
	it('requires initialized matching rooms and prevents mixing collaboration engines', () => {
		const peers = pair();
		const a = mount();
		const b = mount();
		expect(() => b.startYjsCollaboration(peers[1], { documentId: 'source' })).toThrow(
			/designated creator/,
		);
		a.startYjsCollaboration(peers[0], { documentId: 'source', initializeIfEmpty: true });
		expect(() => b.startYjsCollaboration(peers[1], { documentId: 'different' })).toThrow(
			/matching source/,
		);
		expect(() => a.startCollaboration({ sessionId: 'step', clientId: 'a' })).toThrow(/Stop/);
		expect(() => {
			a.documentModel = createDocument();
		}).toThrow(/Stop/);
		a.stopCollaboration();
		expect(peers[0].status).toBe('connected');
	});
	it('merges concurrent formatting and text', () => {
		let deliver = true;
		const peers = pair(false, () => deliver);
		const a = mount();
		const b = mount();
		start(a, b, peers);
		viewOf(a).dispatch(viewOf(a).state.tr.insertText('text', 1));
		wordYjsPluginKey.getState(viewOf(a).state)!.stopCapturing();
		deliver = false;
		viewOf(a).dispatch(
			viewOf(a).state.tr.addMark(1, 5, viewOf(a).state.schema.marks.bold!.create()),
		);
		viewOf(b).dispatch(
			viewOf(b)
				.state.tr.addMark(1, 5, viewOf(b).state.schema.marks.italic!.create())
				.insertText('!', 5),
		);
		deliver = true;
		a.resyncCollaboration();
		expect(viewOf(a).state.doc.toJSON()).toEqual(viewOf(b).state.doc.toJSON());
		expect(viewOf(a).state.doc.textContent).toBe('text!');
		expect(viewOf(a).state.doc.firstChild!.firstChild!.marks.map((mark) => mark.type.name)).toEqual(
			['bold', 'italic'],
		);
		expect(editorBindings['Mod-z']!(viewOf(a).state, viewOf(a).dispatch, viewOf(a))).toBe(true);
		expect(viewOf(b).state.doc.firstChild!.firstChild!.marks.map((mark) => mark.type.name)).toEqual(
			['italic'],
		);
		expect(viewOf(b).state.doc.textContent).toBe('text!');
	});
	it('receives tracked insertions without assigning them to the receiving author', () => {
		const peers = pair();
		const a = mount();
		const b = mount();
		const model = createDocument();
		model.trackChanges = true;
		a.documentModel = structuredClone(model);
		b.documentModel = structuredClone(model);
		a.reviewAuthor = 'Ada';
		b.reviewAuthor = 'Bob';
		start(a, b, peers);
		viewOf(a).dispatch(viewOf(a).state.tr.insertText('tracked', 1));
		expect(viewOf(a).state.doc.toJSON()).toEqual(viewOf(b).state.doc.toJSON());
		const marks = viewOf(b).state.doc.firstChild!.firstChild!.marks;
		expect(marks.filter((mark) => mark.type.name === 'insertion')).toHaveLength(1);
		expect(marks.find((mark) => mark.type.name === 'insertion')!.attrs.author).toBe('Ada');
	});
	it('undoes page settings while excluding non-history updates and command probes', () => {
		const peers = pair();
		const a = mount();
		const b = mount();
		start(a, b, peers);
		const width = viewOf(a).state.doc.attrs.pageWidth;
		viewOf(a).dispatch(viewOf(a).state.tr.setDocAttribute('pageWidth', 1000));
		expect(editorBindings['Mod-z']!(viewOf(a).state)).toBe(true);
		expect(viewOf(a).state.doc.attrs.pageWidth).toBe(1000);
		expect(editorBindings['Mod-z']!(viewOf(a).state, viewOf(a).dispatch, viewOf(a))).toBe(true);
		expect(viewOf(b).state.doc.attrs.pageWidth).toBe(width);
		viewOf(a).dispatch(
			viewOf(a).state.tr.setDocAttribute('pageColor', 'FFFF00').setMeta('addToHistory', false),
		);
		expect(editorBindings['Mod-z']!(viewOf(a).state)).toBe(false);
		expect(viewOf(b).state.doc.attrs.pageColor).toBe('FFFF00');
		a.readOnly = true;
		viewOf(a).dispatch(viewOf(a).state.tr.insertText('forbidden', 1));
		expect(viewOf(b).state.doc.textContent).toBe('');
	});
	it('exports both coauthors’ picture bytes and retains them after stopping while detached', async () => {
		let deliver = true;
		const peers = pair(false, () => deliver);
		const a = mount();
		const b = mount();
		start(a, b, peers);
		deliver = false;
		const names: string[] = [];
		for (const [index, editor] of [a, b].entries()) {
			const media = wordYjsPluginKey.getState(viewOf(editor).state)!.media;
			const name = media.partName('image/png');
			names.push(name);
			media.publish(name, {
				contentType: 'image/png',
				bytes: new Uint8Array([137, 80, 78, index]),
			});
			insertPicture(viewOf(editor), {
				relId: '',
				partName: name,
				contentType: 'image/png',
				widthPx: 10,
				heightPx: 10,
			});
		}
		deliver = true;
		a.resyncCollaboration();
		expect(viewOf(a).state.doc.toJSON()).toEqual(viewOf(b).state.doc.toJSON());
		b.remove();
		viewOf(a).dispatch(viewOf(a).state.tr.insertText('after detach', 1));
		const liveZip = await JSZip.loadAsync(await b.saveBytes());
		expect(await liveZip.file('word/document.xml')!.async('string')).toContain('after detach');
		b.stopCollaboration();
		const zip = await JSZip.loadAsync(await b.saveBytes());
		for (const [index, name] of names.entries())
			expect(await zip.file(name)!.async('uint8array')).toEqual(
				new Uint8Array([137, 80, 78, index]),
			);
		expect(await zip.file('word/document.xml')!.async('string')).toContain('after detach');
	});
	it('refreshes a mounted picture when its media arrives after the document reference', () => {
		const create = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
		const revoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
		Object.defineProperty(URL, 'createObjectURL', {
			configurable: true,
			value: () => 'blob:arrived',
		});
		Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => {} });
		try {
			const peers = pair();
			const a = mount();
			const b = mount();
			start(a, b, peers);
			const media = wordYjsPluginKey.getState(viewOf(a).state)!.media;
			const name = media.partName('image/png');
			insertPicture(viewOf(a), {
				relId: '',
				partName: name,
				contentType: 'image/png',
				widthPx: 10,
				heightPx: 10,
			});
			const image = b.shadowRoot!.querySelector<HTMLImageElement>('img[data-docx-image]')!;
			expect(image.classList.contains('dve-image-missing')).toBe(true);
			media.publish(name, { contentType: 'image/png', bytes: new Uint8Array([137, 80, 78, 71]) });
			expect(image.getAttribute('src')).toBe('blob:arrived');
			expect(image.classList.contains('dve-image-missing')).toBe(false);
		} finally {
			if (create) Object.defineProperty(URL, 'createObjectURL', create);
			else Reflect.deleteProperty(URL, 'createObjectURL');
			if (revoke) Object.defineProperty(URL, 'revokeObjectURL', revoke);
			else Reflect.deleteProperty(URL, 'revokeObjectURL');
		}
	});
});
