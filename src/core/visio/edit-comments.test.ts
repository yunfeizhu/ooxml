import { describe, expect, it } from 'vitest';
import { createVsdx } from './create-document';
import { editVsdx, type VisioEdit } from './edit';
import { parseVsdx } from './parser';
import { VisioPackage } from './package';
import { fixture, ns, relation, relations, shape } from './test-fixtures';

const DATE = '2026-10-09T12:00:00Z';
async function drawing(): Promise<Uint8Array> {
	const blank = await createVsdx();
	return (
		await editVsdx(blank, [
			{ type: 'create-rectangle', pageId: '0', shapeId: '1', x: 2, y: 3, width: 2, height: 1 },
		])
	).bytes;
}
const add = (text: string, shapeId?: string): VisioEdit => ({
	type: 'add-comment',
	pageId: '0',
	...(shapeId ? { shapeId } : {}),
	author: 'Ada Lovelace',
	initials: 'AL',
	text,
	date: DATE,
});

describe('Visio review comments', () => {
	it('creates the comments part, relationship and content type, and reads comments back', async () => {
		const result = await editVsdx(await drawing(), [add('Check this', '1'), add('Page note')]);
		expect(result.changedParts).toEqual(
			expect.arrayContaining([
				'visio/comments.xml',
				'visio/_rels/document.xml.rels',
				'[Content_Types].xml',
			]),
		);
		const pkg = await VisioPackage.open(result.bytes);
		const types = new TextDecoder().decode(await pkg.readBytes('[Content_Types].xml'));
		expect(types).toContain(
			'PartName="/visio/comments.xml" ContentType="application/vnd.ms-visio.comments+xml"',
		);
		const rels = [...(await pkg.relationships('visio/document.xml')).values()];
		expect(rels.filter((rel) => rel.type.endsWith('/comments'))).toEqual([
			expect.objectContaining({ target: 'visio/comments.xml' }),
		]);
		const xml = new TextDecoder().decode(await pkg.readBytes('visio/comments.xml'));
		expect(xml).toContain('<AuthorEntry ID="0" Name="Ada Lovelace" Initials="AL"/>');
		const parsed = await parseVsdx(result.bytes);
		expect(parsed.comments).toEqual([
			{
				id: '0',
				pageId: '0',
				shapeId: '1',
				author: 'Ada Lovelace',
				initials: 'AL',
				date: DATE,
				text: 'Check this',
			},
			{
				id: '1',
				pageId: '0',
				author: 'Ada Lovelace',
				initials: 'AL',
				date: DATE,
				text: 'Page note',
			},
		]);
	});

	it('edits text, marks done and deletes in the existing part without a second relationship', async () => {
		const first = await editVsdx(await drawing(), [add('One', '1'), add('Two', '1')]);
		const edited = await editVsdx(first.bytes, [
			{ type: 'edit-comment', pageId: '0', commentId: '0', text: 'One, revised', date: DATE },
			{ type: 'edit-comment', pageId: '0', commentId: '0', done: true, date: DATE },
			{ type: 'delete-comment', pageId: '0', commentId: '1' },
		]);
		expect(edited.changedParts).toEqual(['visio/comments.xml']);
		const comments = (await parseVsdx(edited.bytes)).comments!;
		expect(comments).toHaveLength(1);
		expect(comments[0]).toMatchObject({
			id: '0',
			text: 'One, revised',
			editDate: DATE,
			done: true,
		});
		const again = await editVsdx(edited.bytes, [add('Three')]);
		// IDs continue from the largest remaining CommentID.
		expect((await parseVsdx(again.bytes)).comments!.map((comment) => comment.id)).toEqual([
			'0',
			'1',
		]);
	});

	it('reads native comment parts, including entries without a CommentID', async () => {
		const comments = `<Comments xmlns="${ns}"><ShowCommentTags>1</ShowCommentTags><AuthorList><AuthorEntry ID="3" Name="Grace" Initials="G"/></AuthorList><CommentList><CommentEntry AuthorID="3" PageID="0" ShapeID="1" Date="2013-03-05T10:24:59.947">Native</CommentEntry><CommentEntry AuthorID="9" PageID="0" Date="2013-03-05T10:25:00" Done="1">Orphan author</CommentEntry><CommentEntry AuthorID="3" Date="2013-03-05T10:25:00">No page</CommentEntry></CommentList></Comments>`;
		const bytes = await fixture({
			pages: [{ id: '0', contents: `<Shapes>${shape('1')}</Shapes>` }],
			edit: (zip) => {
				zip.file('visio/comments.xml', comments);
				zip.file(
					'visio/_rels/document.xml.rels',
					relations(
						relation('rId1', 'pages', 'pages/pages.xml') +
							relation('rId2', 'comments', 'comments.xml'),
					),
				);
			},
		});
		const parsed = await parseVsdx(bytes);
		expect(parsed.comments).toEqual([
			{
				id: 'n0',
				pageId: '0',
				shapeId: '1',
				author: 'Grace',
				initials: 'G',
				date: '2013-03-05T10:24:59.947',
				text: 'Native',
			},
			{
				id: 'n1',
				pageId: '0',
				author: '',
				date: '2013-03-05T10:25:00',
				text: 'Orphan author',
				done: true,
			},
		]);
		expect(parsed.diagnostics.map((note) => note.code)).toContain('invalid-comment');
		const deleted = await editVsdx(bytes, [
			{ type: 'delete-comment', pageId: '0', commentId: 'n0' },
		]);
		expect((await parseVsdx(deleted.bytes)).comments).toEqual([
			expect.objectContaining({ id: 'n0', text: 'Orphan author' }),
		]);
	});

	it('reads Visio 2010 Annotation rows as read-only comments', async () => {
		const bytes = await fixture({
			pages: [
				{
					id: '0',
					contents: '<Shapes/>',
					pageCells:
						'<Section N="Annotation"><Row IX="0"><Cell N="X" V="1"/><Cell N="Y" V="1"/><Cell N="Comment" V="Old markup"/></Row></Section>',
				},
			],
		});
		expect((await parseVsdx(bytes)).comments).toEqual([
			{ id: 'a0-0', pageId: '0', author: '', text: 'Old markup', legacy: true },
		]);
	});

	it('refuses invalid, missing and mixed comment edits, leaving the source untouched', async () => {
		const bytes = await drawing();
		await expect(editVsdx(bytes, [add('Ghost', '99')])).rejects.toMatchObject({
			code: 'EDIT_TARGET_NOT_FOUND',
		});
		await expect(
			editVsdx(bytes, [{ ...add('x'), pageId: '7' } as VisioEdit]),
		).rejects.toMatchObject({ code: 'EDIT_TARGET_NOT_FOUND' });
		await expect(editVsdx(bytes, [{ ...add(''), text: '  ' } as VisioEdit])).rejects.toMatchObject({
			code: 'INVALID_EDIT',
		});
		await expect(
			editVsdx(bytes, [{ ...add('x'), date: 'yesterday' } as VisioEdit]),
		).rejects.toMatchObject({ code: 'INVALID_EDIT' });
		await expect(
			editVsdx(bytes, [{ ...add('x'), text: 'a\u0001' } as VisioEdit]),
		).rejects.toMatchObject({ code: 'INVALID_EDIT_TEXT' });
		await expect(
			editVsdx(bytes, [{ type: 'delete-comment', pageId: '0', commentId: '4' }]),
		).rejects.toMatchObject({ code: 'EDIT_TARGET_NOT_FOUND' });
		await expect(
			editVsdx(bytes, [add('x'), { type: 'move-shape', pageId: '0', shapeId: '1', x: 1, y: 1 }]),
		).rejects.toMatchObject({ code: 'EDIT_MIXED_COMMENT_TRANSACTION' });
		await expect(
			editVsdx(bytes, [{ type: 'edit-comment', pageId: '0', commentId: '0', date: DATE }]),
		).rejects.toMatchObject({ code: 'INVALID_EDIT' });
	});
});
