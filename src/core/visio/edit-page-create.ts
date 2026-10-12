import { parseXml } from '../xml/index';

const officeRel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const pageType = 'http://schemas.microsoft.com/visio/2010/relationships/page';
const contentType = 'application/vnd.ms-visio.page+xml';

/** OPC state shared by every page created in one page transaction. */
export interface VisioPageParts {
	readonly pagesPart: string;
	readonly relsPart: string;
	readonly directory: string;
	readonly rels: Element;
	readonly types: Element;
	/** Lower-case reserved part names, including unused content-type overrides. */
	readonly paths: Set<string>;
	readonly relIds: Set<string>;
	readonly pagePaths: Map<string, string>;
	readonly dirty: Map<string, Element>;
	nextPart: number;
	nextRel: number;
}

/**
 * Create a detached `<Page>` (ID, relationship link) with a new empty `PageContents` part, its
 * relationship and content-type override. The caller sets names and sheets, then inserts it.
 */
export function createVisioPagePart(
	parts: VisioPageParts,
	pages: Element,
	pageId: string,
	check: () => void,
): { page: Element; contents: Element } {
	let path: string;
	do {
		check();
		path = `${parts.directory}page${parts.nextPart++}.xml`;
	} while (parts.paths.has(path.toLowerCase()));
	parts.paths.add(path.toLowerCase());
	parts.pagePaths.set(pageId, path);
	let relId: string;
	do {
		check();
		relId = `rIdPage${parts.nextRel++}`;
	} while (parts.relIds.has(relId));
	parts.relIds.add(relId);
	const doc = pages.ownerDocument!;
	const page = doc.createElementNS(pages.namespaceURI, 'Page');
	page.setAttribute('ID', pageId);
	const link = doc.createElementNS(pages.namespaceURI, 'Rel');
	link.setAttributeNS(officeRel, 'r:id', relId);
	page.appendChild(link);
	const relationship = parts.rels.ownerDocument!.createElementNS(
		parts.rels.namespaceURI,
		'Relationship',
	);
	relationship.setAttribute('Id', relId);
	relationship.setAttribute('Type', pageType);
	relationship.setAttribute('Target', path.slice(parts.directory.length));
	parts.rels.appendChild(relationship);
	const override = parts.types.ownerDocument!.createElementNS(parts.types.namespaceURI, 'Override');
	override.setAttribute('PartName', `/${path}`);
	override.setAttribute('ContentType', contentType);
	parts.types.appendChild(override);
	const contents = parseXml(`<PageContents xmlns="${pages.namespaceURI}"/>`).documentElement;
	contents.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
	parts.dirty.set(path, contents);
	parts.dirty.set(parts.pagesPart, pages);
	parts.dirty.set(parts.relsPart, parts.rels);
	parts.dirty.set('[Content_Types].xml', parts.types);
	return { page, contents };
}
