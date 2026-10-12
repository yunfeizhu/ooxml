// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { clearOfficeProfile, writeOfficeProfile } from '../controls';
import type { OfficeUiCommentsPane } from '../comments/comments-pane';
import { setupFormattingViewer } from './__fixtures__/formatting-viewer';
import { createContextMenus } from './viewer-context-menu';
import { visioCommentThreads } from './viewer-comments';

beforeEach(() => writeOfficeProfile({ displayName: 'Ada Lovelace', avatarColor: '#6366f1' }));
afterEach(() => {
	clearOfficeProfile();
	document.body.replaceChildren();
	vi.restoreAllMocks();
});
const setup = async (source = true) => {
	const view = await setupFormattingViewer(source);
	view.root.append(...createContextMenus(document));
	view.commands.render(view.controller.state);
	const pane = view.root.querySelector<OfficeUiCommentsPane>('office-ui-comments-pane')!;
	const fire = (name: string, detail: object) =>
		pane.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
	const issues = view.root.querySelector<HTMLElement>('.issues-pane')!;
	const dialogButton = (dialog: string, label: string) =>
		view.root
			.querySelector(`.${dialog} [label="${label}"]`)!
			.shadowRoot!.querySelector<HTMLButtonElement>('button')!
			.click();
	return { ...view, pane, fire, issues, dialogButton };
};

it('enables comments, reports, checks and subprocess commands honestly', async () => {
	const view = await setup();
	for (const id of ['new-comment', 'comments-pane', 'shape-reports', 'ctx-page-comment'])
		expect(view.button(id).disabled, id).toBe(false);
	expect(
		view.root.querySelector<HTMLElement & { disabled: boolean }>('[data-menu="check-diagram"]')!
			.disabled,
	).toBe(false);
	expect(view.button('spelling').disabled).toBe(false);
	expect(view.button('spelling').title).toMatch(/browser spell checker/);
	expect(view.button('thesaurus').disabled).toBe(true);
	expect(view.button('thesaurus').title).toMatch(/No thesaurus dictionary/);
	expect(view.button('import-rules').title).toMatch(/not evaluated/);
	expect(view.button('ignore-issue').disabled).toBe(true);
	for (const id of ['create-new', 'create-from-selection', 'link-existing'])
		expect(view.button(id).disabled, id).toBe(true);
	view.selection();
	expect(view.button('create-new').disabled).toBe(false);
	expect(view.button('create-from-selection').disabled).toBe(false);
	expect(view.button('link-existing').title).toMatch(/no other page/);
	view.dispose();
	const readOnly = await setup(false);
	expect(readOnly.button('new-comment').disabled).toBe(true);
	expect(readOnly.button('new-comment').title).toMatch(/Open a .vsdx file/);
	expect(readOnly.button('shape-reports').disabled).toBe(false);
	readOnly.dispose();
});

it('adds, replies to, edits, resolves and deletes comments as profile author, with undo', async () => {
	const view = await setup();
	view.selection();
	view.press('new-comment');
	expect(view.root.querySelector<HTMLElement>('.comments-pane-host')!.hidden).toBe(false);
	expect(view.pane.labels.newComment).toBe('New comment on Import test');
	expect(view.pane.currentAuthor).toBe('Ada Lovelace');
	view.fire('comment-add', { text: 'Check the label' });
	await view.done();
	expect(view.edits.at(-1)).toEqual([
		expect.objectContaining({
			type: 'add-comment',
			pageId: '1',
			shapeId: '1',
			author: 'Ada Lovelace',
			initials: 'AL',
			text: 'Check the label',
		}),
	]);
	expect(view.pane.threads).toEqual([
		expect.objectContaining({ id: 'shape:1', anchorLabel: 'Import test', resolved: false }),
	]);
	view.fire('comment-reply', { threadId: 'shape:1', text: 'Done' });
	await view.done();
	expect(view.pane.threads[0]!.comments.map((comment) => comment.text)).toEqual([
		'Check the label',
		'Done',
	]);
	view.fire('comment-edit', { threadId: 'shape:1', commentId: '0', text: 'Check the title' });
	await view.done();
	expect(view.pane.threads[0]!.comments[0]).toMatchObject({
		text: 'Check the title',
		edited: true,
	});
	view.fire('thread-resolve', { threadId: 'shape:1' });
	await view.done();
	expect(view.edits.at(-1)).toHaveLength(2);
	expect(view.pane.threads[0]!.resolved).toBe(true);
	view.fire('comment-delete', { threadId: 'shape:1', commentId: '1' });
	await view.done();
	expect(view.pane.threads[0]!.comments).toHaveLength(1);
	await view.controller.undo();
	expect(view.pane.threads[0]!.comments).toHaveLength(2);
	expect(view.feedback).toContain('Added a comment.');
	view.dispose();
});

it('comments on the page from the page menu and draws canvas markers that open the thread', async () => {
	const view = await setup();
	view.selection();
	view.commands.run({ type: 'review', command: 'page-comment' });
	expect(view.pane.labels.newComment).toBe('New comment on Imported page');
	view.fire('comment-add', { text: 'Whole page' });
	await view.done();
	expect(view.edits.at(-1)![0]).not.toHaveProperty('shapeId');
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.classList.add('paper');
	view.viewport.append(svg);
	view.commands.render(view.controller.state);
	const marker = svg.querySelector<SVGGElement>('[data-comment-marker="page"]')!;
	expect(marker.getAttribute('aria-label')).toBe('1 comment: Page: Imported page');
	view.pane.activeThreadId = null;
	marker.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	expect(view.pane.activeThreadId).toBe('page');
	expect(
		visioCommentThreads(view.controller.state.document!, view.controller.state.document!.pages[0]!),
	).toHaveLength(1);
	view.dispose();
});

it('checks the diagram, selects an issue, ignores it for the session and toggles rule sets', async () => {
	const view = await setup();
	await view.controller.applyEdits([
		{
			type: 'duplicate-shapes',
			pageId: '1',
			copies: [{ shapeId: '1', newShapeId: '2' }],
			offsetX: 0,
			offsetY: 0,
		},
	]);
	view.commands.run({ type: 'review', command: 'check-diagram' });
	expect(view.issues.hidden).toBe(false);
	expect(view.feedback.at(-1)).toBe('Check Diagram found 1 issue.');
	const row = view.issues.querySelector<HTMLButtonElement>('[data-issue-id]')!;
	expect(row.dataset.issueId).toBe('shape-stacked:1:2');
	row.click();
	expect(view.controller.state.selectedShapes.map((shape) => shape.id)).toEqual(['2']);
	expect(view.button('ignore-issue').disabled).toBe(false);
	view.press('ignore-issue');
	expect(view.issues.querySelectorAll('[data-issue-id]')).toHaveLength(0);
	expect(view.issues.querySelector('.issues-summary')!.textContent).toBe('0 issues, 1 ignored.');
	view.commands.run({ type: 'review', command: 'rule-set', ruleSet: 'placement' });
	expect(view.button('rule-set-placement').getAttribute('checked')).toBe('false');
	expect(view.issues.querySelector('.issues-summary')!.textContent).toBe('0 issues.');
	view.commands.run({ type: 'review', command: 'issues-window' });
	expect(view.issues.hidden).toBe(true);
	view.dispose();
});

it('shows shape reports with CSV export and copy', async () => {
	const view = await setup();
	const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:report');
	vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
	const write = vi.fn(async (_text: string) => {});
	Object.defineProperty(navigator, 'clipboard', {
		configurable: true,
		value: { writeText: write },
	});
	view.press('shape-reports');
	const dialog = view.root.querySelector<HTMLElement & { open: boolean }>('.shape-report-dialog')!;
	expect(dialog.open).toBe(true);
	expect(dialog.querySelectorAll('tbody tr')).toHaveLength(1);
	expect(dialog.querySelector('tbody td:nth-child(3)')!.textContent).toBe('Import test');
	view.dialogButton('shape-report-dialog', 'Export CSV');
	const blob = create.mock.calls[0]![0] as Blob;
	expect(blob.type).toBe('text/csv;charset=utf-8');
	expect([...new Uint8Array(await blob.arrayBuffer()).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
	expect(await blob.text()).toMatch(/^Page,ID,Name/);
	view.dialogButton('shape-report-dialog', 'Copy');
	await vi.waitFor(() => expect(write).toHaveBeenCalled());
	expect(String(write.mock.calls[0]![0])).toMatch(/^Page\tID\tName/);
	view.dispose();
});

it('creates subprocesses as one undoable step and links to existing pages', async () => {
	const view = await setup();
	view.selection();
	view.press('create-new');
	await view.done();
	let document = view.controller.state.document!;
	expect(document.pages.map((page) => page.name)).toEqual(['Imported page', 'Page-2']);
	expect(document.pages[0]!.shapes[0]!.hyperlinks?.[0]?.subAddress).toBe('Page-2');
	await view.controller.undo();
	expect(view.controller.state.document!.pages).toHaveLength(1);
	view.selection();
	view.press('create-from-selection');
	await view.done();
	document = view.controller.state.document!;
	expect(document.pages[0]!.shapes.map((shape) => shape.text.plainText)).toEqual(['Page-2']);
	expect(document.pages[1]!.shapes.map((shape) => shape.text.plainText)).toEqual([
		'Formatted shape',
	]);
	expect(view.controller.state.selectedShapes.map((shape) => shape.id)).toEqual(['2']);
	view.press('link-existing');
	const dialog = view.root.querySelector<HTMLElement & { open: boolean }>('.link-existing-dialog')!;
	expect(dialog.open).toBe(true);
	expect(view.root.querySelector<HTMLSelectElement>('.link-existing-dialog select')!.value).toBe(
		'Page-2',
	);
	view.dialogButton('link-existing-dialog', 'OK');
	await view.done();
	await vi.waitFor(() => expect(dialog.open).toBe(false));
	expect(view.feedback.at(-1)).toMatch(/Linked the shape to Page-2/);
	view.dispose();
});
