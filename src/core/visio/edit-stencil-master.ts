import { NS, parseXml } from '../xml/index';
import { relationshipsPartFor } from '../opc/relationships';
import { decodePath, fail, type VisioPackageLimits } from './package-common';
import { indexedPart, related, visioXml } from './parts';
import { attribute, children } from './sheet';
import { openEditablePackage, writeEditedPackage } from './edit-package';
import { serializeEditedXml } from './edit-text';
import { stencilMasterContents, stencilMasterEntry } from './stencil-master-part';
import { visioBuiltInMaster } from './stencil-masters';

const REL = 'http://schemas.microsoft.com/visio/2010/relationships/';
const MASTERS_TYPE = 'application/vnd.ms-visio.masters+xml';
const MASTER_TYPE = 'application/vnd.ms-visio.master+xml';
/** A document stencil holds far fewer masters than this; the bound keeps every scan small. */
const MAX_MASTERS = 10_000;

const copy = (root: Element): Element =>
	(root.ownerDocument!.cloneNode(true) as Document).documentElement;
const shapesOf = (parent: Element): Element[] =>
	children(parent, 'Shapes').flatMap((container) => children(container, 'Shape'));

export interface EnsuredStencilMaster {
	bytes: Uint8Array;
	/** The master's ID in this drawing's masters.xml. */
	masterId: string;
	/** Empty when the drawing already had the master. */
	changedParts: string[];
}

/**
 * Make a built-in stencil master part of the drawing's document stencil, as Visio copies a master
 * into a drawing the first time it is dropped. A copy made earlier is found by its UniqueID and
 * reused. So is a master of the drawing with the same universal name (Visio's own "Process" when
 * the drawing came from Visio) as long as it is one droppable 2-D shape: the built-in stencils
 * stand in for Visio's stencil files, so the drawing's real master is the better one to instance.
 */
export async function ensureStencilMaster(
	source: Uint8Array,
	master: string,
	limits: VisioPackageLimits,
	maxOutput: number,
	deadline: number,
	check: () => void,
): Promise<EnsuredStencilMaster> {
	const builtIn = visioBuiltInMaster(master);
	if (!builtIn) fail('EDIT_TARGET_NOT_FOUND', 'The stencil has no such master.');
	const { pkg, parts } = await openEditablePackage(source, limits, check);
	const documentPart = (await related(pkg, '', 'document'))!;
	const document = await visioXml(pkg, documentPart, 'VisioDocument');
	const existingPart = await related(pkg, documentPart, 'masters', false);
	const mastersPart = existingPart ?? 'visio/masters/masters.xml';
	const taken = new Set([...parts.keys()].map((name) => decodePath(name).toLowerCase()));
	if (!existingPart && taken.has(mastersPart))
		fail('UNSUPPORTED_EDIT_PACKAGE', 'The drawing has a masters part it does not reference.');
	const masters = existingPart
		? copy(await visioXml(pkg, existingPart, 'Masters'))
		: parseXml(`<Masters xmlns="${document.namespaceURI}"/>`).documentElement;
	if (!existingPart)
		masters.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
	const entries = children(masters, 'Master');
	if (entries.length >= MAX_MASTERS)
		fail('LIMIT_EDITS', 'The drawing holds too many masters to add another.');
	const same = (value: string | undefined, other: string) =>
		value?.toLowerCase() === other.toLowerCase();
	const ours = entries.find((entry) => same(attribute(entry, 'UniqueID'), builtIn!.uniqueId));
	if (ours) return { bytes: source, masterId: attribute(ours, 'ID') ?? '', changedParts: [] };
	const name = builtIn!.master.name;
	for (const entry of entries) {
		check();
		if (!existingPart || !same(attribute(entry, 'NameU') ?? attribute(entry, 'Name'), name))
			continue;
		try {
			const part = await indexedPart(pkg, existingPart, entry, 'master');
			const roots = shapesOf(await visioXml(pkg, part, 'MasterContents')).filter(
				(shape) => attribute(shape, 'Del') !== '1',
			);
			const cells = new Set(children(roots[0], 'Cell').map((cell) => attribute(cell, 'N')));
			if (roots.length === 1 && !cells.has('BeginX') && !roots[0]!.hasAttribute('Master'))
				return { bytes: source, masterId: attribute(entry, 'ID') ?? '', changedParts: [] };
		} catch {
			// A master that cannot be read is not reused; ours is added beside it.
		}
	}

	const ids = entries.map((entry) => Number(attribute(entry, 'ID')));
	if (ids.some((id) => !Number.isSafeInteger(id) || id < 0))
		fail('UNSUPPORTED_EDIT_PACKAGE', 'The drawing has masters without canonical IDs.');
	const id = String(Math.max(1, ...ids.map((value) => value + 1)));
	// Visio names a copy whose name is taken "Name.ID".
	const names = new Set(
		entries.flatMap((entry) => [attribute(entry, 'NameU'), attribute(entry, 'Name')]),
	);
	const unique = names.has(name) ? `${name}.${id}` : name;

	const relsPart = relationshipsPartFor(mastersPart);
	const rels = parts.has(relsPart)
		? copy(await pkg.readXml(relsPart, 'Relationships'))
		: parseXml(`<Relationships xmlns="${NS.rels}"/>`).documentElement;
	const relationships = () =>
		Array.from(rels.getElementsByTagNameNS(rels.namespaceURI, 'Relationship'));
	const relIds = new Set(relationships().map((rel) => rel.getAttribute('Id') ?? ''));
	let index = 1;
	while (relIds.has(`rId${index}`)) index++;
	const relId = `rId${index}`;
	const directory = mastersPart.slice(0, mastersPart.lastIndexOf('/') + 1);
	const types = copy(await pkg.readXml('[Content_Types].xml', 'Types'));
	for (const node of Array.from(types.getElementsByTagNameNS(types.namespaceURI, 'Override'))) {
		const part = node.getAttribute('PartName');
		if (part?.startsWith('/')) taken.add(decodePath(part.slice(1)).toLowerCase());
	}
	let partIndex = 1;
	let masterPart: string;
	do {
		check();
		masterPart = `${directory}master${partIndex++}.xml`;
	} while (taken.has(masterPart.toLowerCase()));
	const relationship = (owner: Element, relationshipId: string, type: string, target: string) => {
		const node = owner.ownerDocument!.createElementNS(owner.namespaceURI, 'Relationship');
		node.setAttribute('Id', relationshipId);
		node.setAttribute('Type', REL + type);
		node.setAttribute('Target', target);
		owner.appendChild(node);
	};
	const override = (part: string, contentType: string) => {
		const node = types.ownerDocument!.createElementNS(types.namespaceURI, 'Override');
		node.setAttribute('PartName', `/${part}`);
		node.setAttribute('ContentType', contentType);
		types.appendChild(node);
	};
	relationship(rels, relId, 'master', masterPart.slice(directory.length));
	override(masterPart, MASTER_TYPE);
	stencilMasterEntry(masters, builtIn!, id, unique, relId);
	const dirty = new Map<string, Element>([
		[mastersPart, masters],
		[relsPart, rels],
		[masterPart, stencilMasterContents(document.namespaceURI!, document, builtIn!)],
		['[Content_Types].xml', types],
	]);
	if (!existingPart) {
		const documentRelsPart = relationshipsPartFor(documentPart);
		const documentRels = copy(await pkg.readXml(documentRelsPart, 'Relationships'));
		const used = new Set(
			Array.from(
				documentRels.getElementsByTagNameNS(documentRels.namespaceURI, 'Relationship'),
				(rel) => rel.getAttribute('Id') ?? '',
			),
		);
		let next = 1;
		while (used.has(`rId${next}`)) next++;
		const base = documentPart.slice(0, documentPart.lastIndexOf('/') + 1);
		relationship(documentRels, `rId${next}`, 'masters', mastersPart.slice(base.length));
		override(mastersPart, MASTERS_TYPE);
		dirty.set(documentRelsPart, documentRels);
	}
	if (new Set([...parts.keys(), ...dirty.keys()]).size > limits.maxEntries)
		fail('LIMIT_ENTRIES', 'Adding the master exceeds the package entry limit.');
	let total = [...parts.values()].reduce((sum, bytes) => sum + bytes.length, 0);
	let nodes = 0;
	for (const [path, xml] of dirty) {
		const serialized = serializeEditedXml(xml, limits, check);
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
	await visioXml(verified.pkg, masterPart, 'MasterContents');
	check();
	return { bytes, masterId: id, changedParts: [...dirty.keys()] };
}
