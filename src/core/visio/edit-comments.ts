import { NS, parseXml } from '../xml/index';
import { nextRelationshipId, relationshipsPartFor, resolvePartPath } from '../opc/relationships';
import type { VisioPackage } from './package';
import { decodePath, fail, type VisioPackageLimits } from './package-common';
import { related, visioXml } from './parts';
import { attribute, children, VISIO_NS } from './sheet';
import { openEditablePackage, writeEditedPackage } from './edit-package';
import { serializeEditedXml } from './edit-text';
import {
	VISIO_COMMENT_LIMIT,
	VISIO_COMMENTS_CONTENT_TYPE,
	VISIO_COMMENTS_RELATIONSHIP,
	visioCommentId,
} from './comments';
import type { VisioCommentEdit } from './edit-comment-commands';
import type { EditVsdxResult } from './edit';

const copy = (root: Element): Element =>
	(root.ownerDocument!.cloneNode(true) as Document).documentElement;

function list(root: Element, name: string): Element {
	const existing = children(root, name)[0];
	if (existing) return existing;
	const node = root.ownerDocument!.createElementNS(root.namespaceURI, name);
	// AuthorList precedes CommentList in the schema.
	root.insertBefore(
		node,
		name === 'AuthorList' ? (children(root, 'CommentList')[0] ?? null) : null,
	);
	return node;
}
const nextId = (nodes: readonly Element[], name: string): string => {
	let largest = -1;
	for (const node of nodes) {
		const value = attribute(node, name);
		if (value && /^(0|[1-9]\d{0,9})$/.test(value)) largest = Math.max(largest, Number(value));
	}
	if (largest >= 0xffffffff) fail('LIMIT_COMMENTS', 'No comment IDs remain available.');
	return String(largest + 1);
};

/** The part that will hold comments: the related one, else a free `visio/comments*.xml`. */
async function commentsPart(
	pkg: VisioPackage,
	parts: ReadonlyMap<string, Uint8Array>,
	documentPart: string,
	types: Element,
): Promise<{ path: string; root: Element; created: boolean }> {
	const path = await related(pkg, documentPart, 'comments', false);
	if (path) return { path, root: copy(await visioXml(pkg, path, 'Comments')), created: false };
	const taken = new Set([...parts.keys()].map((name) => decodePath(name).toLowerCase()));
	for (const node of children(types, 'Override')) {
		const name = node.getAttribute('PartName');
		if (name?.startsWith('/')) taken.add(decodePath(name.slice(1)).toLowerCase());
	}
	let index = 0;
	let target = 'comments.xml';
	while (taken.has(resolvePartPath(documentPart, target).toLowerCase()))
		target = `comments${++index}.xml`;
	const root = parseXml(
		`<Comments xmlns="${VISIO_NS}" xmlns:r="${NS.r}"><AuthorList/><CommentList/></Comments>`,
	).documentElement;
	return { path: resolvePartPath(documentPart, target), root, created: true };
}

async function shapeExists(pkg: VisioPackage, path: string, shapeId: string): Promise<boolean> {
	const root = await visioXml(pkg, path, 'PageContents');
	return Array.from(root.getElementsByTagNameNS(root.namespaceURI, 'Shape')).some(
		(shape) => attribute(shape, 'ID') === shapeId,
	);
}

/** Add, edit and delete review comments as one transaction on the comments part. */
export async function editVsdxComments(
	pkg: VisioPackage,
	parts: Map<string, Uint8Array>,
	pages: ReadonlyMap<string, string>,
	edits: readonly VisioCommentEdit[],
	limits: VisioPackageLimits,
	maxOutput: number,
	deadline: number,
	check: () => void,
): Promise<EditVsdxResult> {
	const documentPart = (await related(pkg, '', 'document'))!;
	const types = copy(await pkg.readXml('[Content_Types].xml', 'Types'));
	const { path, root, created } = await commentsPart(pkg, parts, documentPart, types);
	const authors = list(root, 'AuthorList');
	const comments = list(root, 'CommentList');
	// Resolve every target before any change: positional IDs must not shift mid-transaction.
	const byId = new Map(
		children(comments, 'CommentEntry').map((entry, index) => [visioCommentId(entry, index), entry]),
	);
	const removed = new Set<Element>();
	for (const edit of edits) {
		check();
		const page = pages.get(edit.pageId);
		if (!page) fail('EDIT_TARGET_NOT_FOUND', 'Comment page does not exist.');
		if (edit.type === 'add-comment') {
			if (edit.shapeId !== undefined && !(await shapeExists(pkg, page!, edit.shapeId)))
				fail('EDIT_TARGET_NOT_FOUND', 'Comment shape does not exist on the page.');
			if (children(comments, 'CommentEntry').length >= VISIO_COMMENT_LIMIT)
				fail('LIMIT_COMMENTS', `A drawing keeps at most ${VISIO_COMMENT_LIMIT} comments.`);
			const entries = children(authors, 'AuthorEntry');
			let author = entries.find(
				(node) =>
					attribute(node, 'Name') === edit.author &&
					(attribute(node, 'Initials') ?? '') === (edit.initials ?? ''),
			);
			if (!author) {
				author = root.ownerDocument!.createElementNS(root.namespaceURI, 'AuthorEntry');
				author.setAttribute('ID', nextId(entries, 'ID'));
				author.setAttribute('Name', edit.author);
				if (edit.initials) author.setAttribute('Initials', edit.initials);
				authors.appendChild(author);
			}
			const entry = root.ownerDocument!.createElementNS(root.namespaceURI, 'CommentEntry');
			entry.setAttribute('AuthorID', attribute(author, 'ID')!);
			entry.setAttribute('PageID', edit.pageId);
			if (edit.shapeId !== undefined) entry.setAttribute('ShapeID', edit.shapeId);
			entry.setAttribute('Date', edit.date);
			entry.setAttribute('CommentID', nextId(children(comments, 'CommentEntry'), 'CommentID'));
			entry.textContent = edit.text;
			comments.appendChild(entry);
			continue;
		}
		const entry = byId.get(edit.commentId);
		if (!entry || removed.has(entry) || attribute(entry, 'PageID') !== edit.pageId)
			fail('EDIT_TARGET_NOT_FOUND', 'Comment does not exist on the page.');
		if (edit.type === 'delete-comment') {
			entry!.parentNode!.removeChild(entry!);
			removed.add(entry!);
			continue;
		}
		if (edit.text !== undefined) {
			entry!.textContent = edit.text;
			entry!.setAttribute('EditDate', edit.date);
		}
		if (edit.done !== undefined) entry!.setAttribute('Done', edit.done ? '1' : '0');
	}
	const dirty = new Map<string, Element>([[path, root]]);
	if (created) {
		const relsPart = relationshipsPartFor(documentPart);
		const rels = parts.has(relsPart)
			? copy(await pkg.readXml(relsPart, 'Relationships'))
			: parseXml(`<Relationships xmlns="${NS.rels}"/>`).documentElement;
		const ids = new Set(
			Array.from(
				rels.getElementsByTagNameNS(rels.namespaceURI, 'Relationship'),
				(node) => node.getAttribute('Id') ?? '',
			),
		);
		const relationship = rels.ownerDocument!.createElementNS(rels.namespaceURI, 'Relationship');
		relationship.setAttribute('Id', nextRelationshipId(ids));
		relationship.setAttribute('Type', VISIO_COMMENTS_RELATIONSHIP);
		relationship.setAttribute('Target', path.slice(path.lastIndexOf('/') + 1));
		rels.appendChild(relationship);
		const override = types.ownerDocument!.createElementNS(types.namespaceURI, 'Override');
		override.setAttribute('PartName', `/${path}`);
		override.setAttribute('ContentType', VISIO_COMMENTS_CONTENT_TYPE);
		types.appendChild(override);
		dirty.set(relsPart, rels).set('[Content_Types].xml', types);
		if (new Set([...parts.keys(), ...dirty.keys()]).size > limits.maxEntries)
			fail('LIMIT_ENTRIES', 'Adding comments exceeds the package entry limit.');
	}
	let total = [...parts.values()].reduce((sum, bytes) => sum + bytes.length, 0);
	let nodes = 0;
	for (const [name, xml] of dirty) {
		const serialized = serializeEditedXml(xml, limits, check);
		nodes += serialized.nodes;
		if (nodes > limits.maxTotalXmlNodes)
			fail('LIMIT_XML_TOTAL', 'Edited XML node total exceeds limit.');
		total += serialized.bytes.length - (parts.get(name)?.length ?? 0);
		if (total > limits.maxTotalBytes) fail('LIMIT_TOTAL', 'Edited package total exceeds limit.');
		parts.set(name, serialized.bytes);
	}
	const bytes = await writeEditedPackage(parts, maxOutput, deadline, check);
	const verified = await openEditablePackage(
		bytes,
		{ ...limits, maxInputBytes: maxOutput, maxRuntimeMs: Math.max(1, deadline - Date.now()) },
		check,
	);
	const reread = await related(verified.pkg, documentPart, 'comments', false);
	if (reread !== path) fail('INVALID_RELATIONSHIP', 'The comments part was not related once.');
	await visioXml(verified.pkg, path, 'Comments');
	check();
	return {
		bytes,
		changedParts: [...dirty.keys()],
		diagnostics: [
			{
				code: 'edit-comments',
				message:
					'Review comments were written to the comments part. Visio threads are flat; native reopen fidelity is limited to tested cases.',
			},
		],
	};
}
