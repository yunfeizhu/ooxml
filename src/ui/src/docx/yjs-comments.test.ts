// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDocument, loadDocx, type DocumentModel } from 'ooxml-core/docx';
import {
	createCollabSession,
	createMemoryHub,
	transportProvider,
	type CollabSession,
} from 'ooxml-core/collab';
import {
	wordYjsPluginKey,
	commentIdsAtSelection,
	toggleTrackChanges,
	commentThreadsFromDoc,
	removeCommentThread,
} from 'ooxml-core/docx/ui';
import { undo } from 'prosemirror-history';
import type { EditorView } from 'prosemirror-view';
import { TextSelection } from 'prosemirror-state';
import { DocxEditorElement } from './index';
import './index';
import { collectRevisionRanges, rejectRevisionRange } from './review-commands';

const sessions: CollabSession[] = [];
const editors: DocxEditorElement[] = [];
afterEach(() => {
	for (const editor of editors.splice(0)) {
		editor.stopCollaboration(true);
		editor.remove();
	}
	for (const session of sessions.splice(0)) session.destroy();
});
const viewOf = (editor: DocxEditorElement) => (editor as unknown as { view: EditorView }).view;
const binding = (editor: DocxEditorElement) => wordYjsPluginKey.getState(viewOf(editor).state)!;
function pair(viewer = false, model?: DocumentModel) {
	let deliver = true;
	const hub = createMemoryHub({ filter: () => deliver });
	const connections = ['Ada', 'Grace'].map((name, index) => {
		const session = createCollabSession({
			roomId: 'comments',
			provider: transportProvider({ transport: hub.createTransport('comments') }),
			user: { name, ...(viewer && index ? { role: 'viewer' as const } : {}) },
			heartbeatMs: 0,
			teardown: false,
		});
		sessions.push(session);
		return session;
	});
	const peers = connections.map((session, index) => {
		const editor = document.createElement('docx-editor') as DocxEditorElement;
		editor.documentModel = model ?? {
			...createDocument(),
			blocks: [{ type: 'paragraph', id: 'p', runs: [{ text: 'Shared text' }] }],
		};
		document.body.append(editor);
		editors.push(editor);
		editor.startYjsCollaboration(session, {
			documentId: 'comments-source',
			initializeIfEmpty: index === 0,
		});
		const view = viewOf(editor);
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 7)));
		return editor;
	});
	return {
		a: peers[0]!,
		b: peers[1]!,
		partition: () => {
			deliver = false;
		},
		sync: () => {
			deliver = true;
			peers[0]!.resyncCollaboration();
		},
	};
}
function add(editor: DocxEditorElement, id = 'root') {
	return binding(editor).comments.add(viewOf(editor), 'Ada', 'Review', () => id);
}

describe('shared Word comment threads', () => {
	it('keeps concurrent peer revisions distinct and resolves a peer insertion without re-tracking', () => {
		const { a, b, partition, sync } = pair();
		a.reviewAuthor = 'Ada';
		b.reviewAuthor = 'Grace';
		const first = viewOf(a);
		toggleTrackChanges(first.state, first.dispatch, first);
		partition();
		const clock = vi.spyOn(Date, 'now').mockReturnValue(1);
		try {
			for (const [editor, text] of [
				[a, 'A'],
				[b, 'B'],
			] as const) {
				const view = viewOf(editor);
				view.dispatch(view.state.tr.insertText(text, 7));
			}
		} finally {
			clock.mockRestore();
		}
		sync();
		const ranges = collectRevisionRanges(first.state.doc);
		expect(ranges).toHaveLength(2);
		expect(new Set(ranges.map((range) => range.id)).size).toBe(2);
		const grace = ranges.find((range) => range.author === 'Grace')!;
		rejectRevisionRange(first, grace);
		for (const editor of [a, b]) {
			expect(viewOf(editor).state.doc.textContent).toBe('SharedA text');
			expect(collectRevisionRanges(viewOf(editor).state.doc).map((range) => range.author)).toEqual([
				'Ada',
			]);
		}
		expect(binding(a).undo()).toBe(true);
		for (const editor of [a, b]) {
			expect(
				collectRevisionRanges(viewOf(editor).state.doc)
					.map((range) => range.author)
					.sort(),
			).toEqual(['Ada', 'Grace']);
		}
		expect(binding(a).redo()).toBe(true);
		for (const editor of [a, b]) expect(viewOf(editor).state.doc.textContent).toBe('SharedA text');
	});
	it('shares review recording, tracks peer typing and exports the setting with local undo', async () => {
		const { a, b } = pair();
		a.reviewAuthor = 'Ada';
		b.reviewAuthor = 'Grace';
		const view = viewOf(a);
		toggleTrackChanges(view.state, view.dispatch, view);
		for (const editor of [a, b]) expect(editor.documentModel!.trackChanges).toBe(true);
		const peer = viewOf(b);
		const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 9, 7, 10, 0, 0));
		try {
			peer.dispatch(peer.state.tr.insertText('!', 12));
		} finally {
			clock.mockRestore();
		}
		for (const editor of [a, b]) {
			const paragraph = editor.documentModel!.blocks[0]!;
			if (paragraph.type !== 'paragraph') throw new Error('Expected paragraph');
			expect(paragraph.runs.find((run) => run.text === '!')?.revision).toMatchObject({
				kind: 'insert',
				author: 'Grace',
				date: '2026-10-07T10:00:00.000Z',
			});
		}
		const { model } = await loadDocx(await a.saveBytes());
		expect(model.trackChanges).toBe(true);
		const exported = model.blocks[0]!;
		if (exported.type !== 'paragraph') throw new Error('Expected paragraph');
		expect(exported.runs.find((run) => run.text === '!')?.revision).toMatchObject({
			author: 'Grace',
			date: '2026-10-07T10:00:00.000Z',
		});
		binding(a).undo();
		for (const editor of [a, b]) {
			expect(editor.documentModel!.trackChanges).toBe(false);
			expect(viewOf(editor).state.doc.textContent).toBe('Shared text!');
		}
		expect(binding(a).redo()).toBe(true);
		for (const editor of [a, b]) expect(editor.documentModel!.trackChanges).toBe(true);
	});
	it('does not revive a deleted anchor when another author types inside it offline', () => {
		const { a, b, partition, sync } = pair();
		add(a);
		partition();
		binding(a).comments.delete(viewOf(a), 'root');
		viewOf(b).dispatch(viewOf(b).state.tr.insertText('new', 4));
		sync();
		for (const editor of [a, b]) {
			expect(editor.documentModel!.comments).toEqual([]);
			const paragraph = editor.documentModel!.blocks[0]!;
			if (paragraph.type !== 'paragraph') throw new Error('Expected paragraph');
			expect(paragraph.runs.some((run) => run.commentIds?.includes('root'))).toBe(false);
			expect(viewOf(editor).state.doc.textContent).toContain('new');
		}
	});
	it('seeds loaded overlapping comments and supports concurrent independent deletion', () => {
		const { a, b, partition, sync } = pair(false, {
			...createDocument(),
			blocks: [
				{ type: 'paragraph', id: 'p', runs: [{ text: 'Shared text', commentIds: ['c1', 'c2'] }] },
			],
			comments: [
				{ id: 'c1', author: 'Ada', text: 'First', resolved: true },
				{ id: 'c2', author: 'Grace', text: 'Second' },
				{ id: 'r1', author: 'Grace', text: 'Reply', parentId: 'c1' },
			],
		});
		expect(b.documentModel!.comments).toHaveLength(3);
		partition();
		binding(a).comments.delete(viewOf(a), 'c1');
		binding(b).comments.delete(viewOf(b), 'c2');
		sync();
		for (const editor of [a, b]) {
			expect(editor.documentModel!.comments).toEqual([]);
			expect(commentIdsAtSelection(viewOf(editor))).toEqual([]);
		}
		binding(a).undo();
		for (const editor of [a, b]) {
			expect(editor.documentModel!.comments).toHaveLength(2);
			expect(commentIdsAtSelection(viewOf(editor))).toEqual(['c1']);
		}
	});
	it('adds and undoes a thread and its anchor atomically without consuming prior typing', () => {
		const { a, b } = pair();
		viewOf(a).dispatch(viewOf(a).state.tr.insertText('!', 12));
		expect(add(a)).not.toBeNull();
		for (const editor of [a, b]) {
			expect(editor.documentModel!.comments?.map((comment) => comment.id)).toEqual(['root']);
			expect(commentIdsAtSelection(viewOf(editor))).toEqual(['root']);
		}
		expect(binding(a).undo()).toBe(true);
		for (const editor of [a, b]) {
			expect(editor.documentModel!.comments).toEqual([]);
			expect(commentIdsAtSelection(viewOf(editor))).toEqual([]);
			expect(viewOf(editor).state.doc.textContent).toBe('Shared text!');
		}
		expect(binding(a).redo()).toBe(true);
		expect(b.documentModel!.comments).toHaveLength(1);
		expect(commentIdsAtSelection(viewOf(b))).toEqual(['root']);
	});
	it('merges concurrent replies and resolution, then undoes only the local reply', () => {
		const { a, b, partition, sync } = pair();
		add(a);
		partition();
		expect(binding(a).comments.reply('root', 'Ada', 'A reply', () => 'reply-a')).toBe(true);
		expect(binding(b).comments.reply('root', 'Grace', 'B reply', () => 'reply-b')).toBe(true);
		expect(binding(b).comments.resolve('root', true)).toBe(true);
		sync();
		expect(a.documentModel!.comments).toEqual(b.documentModel!.comments);
		expect(a.documentModel!.comments).toHaveLength(3);
		expect(a.documentModel!.comments?.find((comment) => comment.id === 'root')?.resolved).toBe(
			true,
		);
		binding(a).undo();
		expect(b.documentModel!.comments?.map((comment) => comment.id)).toEqual(['reply-b', 'root']);
	});
	it('hides a concurrent reply on deletion and restores it with the root and anchor on undo', () => {
		const { a, b, partition, sync } = pair();
		add(a);
		partition();
		binding(a).comments.delete(viewOf(a), 'root');
		binding(b).comments.reply('root', 'Grace', 'Offline reply', () => 'reply-b');
		sync();
		for (const editor of [a, b]) {
			expect(editor.documentModel!.comments).toEqual([]);
			expect(commentIdsAtSelection(viewOf(editor))).toEqual([]);
		}
		binding(a).undo();
		for (const editor of [a, b]) {
			expect(editor.documentModel!.comments).toHaveLength(2);
			expect(commentIdsAtSelection(viewOf(editor))).toEqual(['root']);
		}
	});
	it('exports remote replies and resolution while detached and retains them after stopping', async () => {
		const { a, b } = pair();
		add(a);
		a.remove();
		binding(b).comments.reply('root', 'Grace', 'Remote reply', () => 'reply-b');
		binding(b).comments.resolve('root', true);
		const { model } = await loadDocx(await a.saveBytes());
		expect(model.comments).toHaveLength(2);
		const root = model.comments?.find((comment) => !comment.parentId);
		expect(root?.resolved).toBe(true);
		expect(model.comments?.find((comment) => comment.parentId)?.parentId).toBe(root?.id);
		a.stopCollaboration();
		expect(a.documentModel!.comments).toHaveLength(2);
		document.body.append(a);
		const local = viewOf(a);
		expect(commentThreadsFromDoc(local.state.doc)).toHaveLength(2);
		expect(removeCommentThread(local, 'root')).toBe(true);
		expect(a.documentModel!.comments ?? []).toEqual([]);
		expect(undo(local.state, local.dispatch)).toBe(true);
		expect(a.documentModel!.comments).toHaveLength(2);
	});
	it('rejects thread mutations from viewer peers', () => {
		const { a, b } = pair(true);
		add(a);
		expect(add(b, 'forbidden')).toBeNull();
		expect(binding(b).comments.reply('root', 'Grace', 'Forbidden', () => 'reply-b')).toBe(false);
		expect(binding(b).comments.resolve('root', true)).toBe(false);
		expect(binding(b).comments.delete(viewOf(b), 'root')).toBe(false);
		expect(a.documentModel!.comments).toHaveLength(1);
	});
});
