import { attribute, child, children } from './sheet';
import { indexedPart, related, visioXml } from './parts';
import { VisioPackage } from './package';
import { decodePath, fail, type VisioPackageLimits } from './package-common';
import { openEditablePackage, writeEditedPackage } from './edit-package';
import { serializeEditedXml } from './edit-text';
import { updatePageAppProperties } from './edit-page-properties';
import { recalculatePageFormulas } from './edit-page-formulas';
import { renameVisioPage } from './edit-page-rename';
import { deleteVisioPage } from './edit-page-delete';
import { setVisioPageSize } from './edit-page-size';
import { setVisioPageProperties, setVisioPageSetup } from './edit-page-setup';
import { setVisioPageLayout } from './edit-page-layout';
import { setVisioSnapGlue } from './edit-snap-glue';
import { setVisioPageDecoration } from './edit-page-decoration';
import { createVisioPagePart, type VisioPageParts } from './edit-page-create';
import { relationshipsPartFor } from '../opc/relationships';
import type { VisioPageEdit } from './edit-commands';
import type { EditVsdxResult } from './edit';

function copy(root: Element): Element {
	return (root.ownerDocument!.cloneNode(true) as Document).documentElement;
}

/** Source-backed page metadata/OPC transaction with bounded local numeric cache refresh. */
export async function editVsdxPages(
	original: Uint8Array,
	pkg: VisioPackage,
	parts: Map<string, Uint8Array>,
	commands: readonly VisioPageEdit[],
	limits: VisioPackageLimits,
	maxOutput: number,
	deadline: number,
	check: () => void,
): Promise<EditVsdxResult> {
	const documentPart = (await related(pkg, '', 'document'))!;
	const pagesPart = (await related(pkg, documentPart, 'pages'))!;
	const slash = pagesPart.lastIndexOf('/');
	const directory = pagesPart.slice(0, slash + 1);
	const relsPart = relationshipsPartFor(pagesPart);
	const pages = copy(await visioXml(pkg, pagesPart, 'Pages'));
	const priorCount = children(pages, 'Page').length;
	const pagePaths = new Map<string, string>();
	for (const page of children(pages, 'Page'))
		pagePaths.set(attribute(page, 'ID')!, await indexedPart(pkg, pagesPart, page, 'page'));
	const rels = copy(await pkg.readXml(relsPart, 'Relationships'));
	const types = copy(await pkg.readXml('[Content_Types].xml', 'Types'));
	const dirty = new Map<string, Element>();
	const removed = new Set<string>();
	const paths = new Set([...parts.keys()].map((path) => decodePath(path).toLowerCase()));
	// An unused content-type override also reserves its part name.
	for (const node of Array.from(types.childNodes)) {
		if (node.nodeType !== 1) continue;
		const name = (node as Element).getAttribute('PartName');
		if (name?.startsWith('/')) paths.add(decodePath(name.slice(1)).toLowerCase());
	}
	const relIds = new Set(
		Array.from(rels.childNodes)
			.filter((node) => node.nodeType === 1)
			.map((node) => (node as Element).getAttribute('Id') ?? ''),
	);
	const parts_: VisioPageParts = {
		pagesPart,
		relsPart,
		directory,
		rels,
		types,
		paths,
		relIds,
		pagePaths,
		dirty,
		nextPart: 1,
		nextRel: 1,
	};
	for (const command of commands) {
		check();
		const existing = children(pages, 'Page');
		if (command.type === 'set-page-setup') {
			await setVisioPageSetup(pkg, pagesPart, pages, pagePaths, dirty, command, check);
			continue;
		}
		if (command.type === 'set-snap-glue') {
			// Document settings live in the document part, saved with the same transaction.
			const document =
				dirty.get(documentPart) ?? copy(await visioXml(pkg, documentPart, 'VisioDocument'));
			if (setVisioSnapGlue(document, command)) dirty.set(documentPart, document);
			continue;
		}
		if (command.type === 'set-page-layout') {
			await setVisioPageLayout(pkg, pagesPart, pages, pagePaths, dirty, command, check);
			continue;
		}
		if (command.type === 'set-page-properties') {
			setVisioPageProperties(pagesPart, pages, dirty, command);
			continue;
		}
		if (command.type === 'set-page-decoration') {
			await setVisioPageDecoration(
				{ pkg, pages, parts: parts_, packageParts: parts, removed, check },
				command,
			);
			continue;
		}
		if (command.type === 'set-page-size') {
			await setVisioPageSize(pkg, pagesPart, pages, pagePaths, dirty, command, check);
			continue;
		}
		if (command.type === 'delete-page') {
			await deleteVisioPage(
				pkg,
				pagesPart,
				pages,
				rels,
				types,
				pagePaths,
				parts,
				dirty,
				removed,
				command.pageId,
				check,
			);
			continue;
		}
		if (command.type === 'rename-page') {
			await renameVisioPage(
				pkg,
				pagesPart,
				pages,
				pagePaths,
				dirty,
				command.pageId,
				command.name,
				check,
			);
			continue;
		}
		if (command.type === 'reorder-page') {
			const target = existing.find((page) => attribute(page, 'ID') === command.pageId);
			if (!target) fail('EDIT_TARGET_NOT_FOUND', 'Page does not exist.');
			if (command.index >= existing.length)
				fail('INVALID_EDIT', 'Page index exceeds the page list.');
			if (existing.indexOf(target) === command.index) continue;
			const remaining = existing.filter((page) => page !== target);
			pages.insertBefore(target, remaining[command.index] ?? null);
			dirty.set(pagesPart, pages);
			continue;
		}
		if (existing.some((page) => attribute(page, 'ID') === command.pageId))
			fail('EDIT_DUPLICATE_PAGE', 'New page ID already exists.');
		if (
			existing.some((page) =>
				['Name', 'NameU'].some(
					(name) => attribute(page, name)?.toLowerCase() === command.name.toLowerCase(),
				),
			)
		)
			fail('EDIT_DUPLICATE_PAGE_NAME', 'New page name already exists.');
		const after = existing.find((page) => attribute(page, 'ID') === command.afterPageId);
		if (!after) fail('EDIT_TARGET_NOT_FOUND', 'Insertion target page does not exist.');
		const { page } = createVisioPagePart(parts_, pages, command.pageId, check);
		page.setAttribute('Name', command.name);
		page.setAttribute('NameU', command.name);
		page.setAttribute('IsCustomName', '1');
		page.setAttribute('IsCustomNameU', '1');
		const sheet = child(after, 'PageSheet');
		if (sheet) page.insertBefore(sheet.cloneNode(true), page.firstChild);
		const background = attribute(after, 'BackPage');
		if (background !== undefined) page.setAttribute('BackPage', background);
		pages.insertBefore(page, after.nextSibling);
	}
	if (!dirty.size) {
		if (original.length > maxOutput)
			fail('LIMIT_EDIT_OUTPUT', 'Saved package exceeds output limit.');
		return { bytes: original, changedParts: [], diagnostics: [] };
	}
	if (
		commands.some(
			(command) =>
				command.type !== 'set-page-size' &&
				command.type !== 'set-page-setup' &&
				command.type !== 'set-page-layout' &&
				command.type !== 'set-snap-glue',
		)
	) {
		await updatePageAppProperties(pkg, pages, priorCount, dirty, limits, check);
		await recalculatePageFormulas(pkg, pagesPart, pages, pagePaths, dirty, check);
	}
	if (new Set([...parts.keys(), ...dirty.keys()]).size > limits.maxEntries)
		fail('LIMIT_ENTRIES', 'Page insertion exceeds package entry limit.');
	let total = [...parts.values()].reduce((sum, bytes) => sum + bytes.length, 0),
		nodes = 0;
	for (const [path, root] of dirty) {
		const serialized = serializeEditedXml(root, limits, check);
		nodes += serialized.nodes;
		if (nodes > limits.maxTotalXmlNodes)
			fail('LIMIT_XML_TOTAL', 'Edited XML node total exceeds limit.');
		total += serialized.bytes.length - (parts.get(path)?.length ?? 0);
		if (total > limits.maxTotalBytes) fail('LIMIT_TOTAL', 'Edited package total exceeds limit.');
		parts.set(path, serialized.bytes);
	}
	const bytes = await writeEditedPackage(parts, maxOutput, deadline, check);
	const verified = await openEditablePackage(
		bytes,
		{ ...limits, maxInputBytes: maxOutput, maxRuntimeMs: Math.max(1, deadline - Date.now()) },
		check,
	);
	const pageParts = new Set(verified.pages.values());
	for (const path of dirty.keys())
		if (pageParts.has(path)) await visioXml(verified.pkg, path, 'PageContents');
	check();
	return {
		bytes,
		changedParts: [...new Set([...removed, ...dirty.keys()])],
		diagnostics: [
			{
				code: commands.every((command) => command.type === 'set-page-size')
					? 'edit-page-size-experimental'
					: 'edit-pages-experimental',
				message: commands.every((command) => command.type === 'set-page-size')
					? 'Fixed custom drawing-page dimensions were updated. Shape positions and printer settings were retained; affected page-size formula caches remain unsupported.'
					: 'Page metadata and supported local numeric page-dependent caches were updated. Inherited, string and background-render-context formulas remain unsupported.',
			},
		],
	};
}
