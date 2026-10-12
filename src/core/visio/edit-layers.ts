import { VisioPackage } from './package';
import { fail, type VisioPackageLimits } from './package-common';
import { related, visioXml } from './parts';
import { attribute, child, children } from './sheet';
import { executableCellFormula } from './cell-formula';
import { openEditablePackage, writeEditedPackage } from './edit-package';
import { serializeEditedXml } from './edit-text';
import type { VisioAssignLayersEdit } from './edit-layer-commands';
import type { EditVsdxResult } from './edit';

const copy = (root: Element): Element =>
	(root.ownerDocument!.cloneNode(true) as Document).documentElement;
const cellValue = (owner: Element, name: string) =>
	attribute(
		children(owner, 'Cell').find((cell) => attribute(cell, 'N') === name),
		'V',
	);

interface PageLayer {
	id: string;
	name: string;
	locked: boolean;
}

/** The page's Layer section and its rows; ambiguous or deleted rows are refused. */
function layerSection(sheet: Element): { section: Element | undefined; layers: PageLayer[] } {
	const sections = children(sheet, 'Section').filter((node) => attribute(node, 'N') === 'Layer');
	if (sections.length > 1) fail('UNSUPPORTED_LAYER_EDIT', 'The page has duplicate Layer sections.');
	const section = sections[0];
	const layers: PageLayer[] = [];
	for (const row of children(section, 'Row')) {
		const id = attribute(row, 'IX');
		if (!id || !/^(0|[1-9]\d{0,9})$/.test(id) || row.hasAttribute('Del'))
			fail('UNSUPPORTED_LAYER_EDIT', 'Layer rows need canonical, undeleted indices.');
		if (layers.some((layer) => layer.id === id))
			fail('UNSUPPORTED_LAYER_EDIT', 'The page has duplicate layer indices.');
		const lock = children(row, 'Cell').find((cell) => attribute(cell, 'N') === 'Lock');
		layers.push({
			id,
			name: (cellValue(row, 'Name') ?? cellValue(row, 'NameUniv') ?? '').toLowerCase(),
			locked:
				!!lock && (lock.hasAttribute('E') || !['', '0', undefined].includes(attribute(lock, 'V'))),
		});
	}
	return { section, layers };
}

/** Append one native layer row: visible, printable, unlocked and without a layer colour. */
function appendLayer(section: Element, id: string, name: string): void {
	const doc = section.ownerDocument!;
	const row = doc.createElementNS(section.namespaceURI, 'Row');
	row.setAttribute('IX', id);
	for (const [cell, value] of [
		['Name', name],
		['Color', '255'],
		['Status', '0'],
		['Visible', '1'],
		['Print', '1'],
		['Active', '0'],
		['Lock', '0'],
		['Snap', '1'],
		['Glue', '1'],
		['NameUniv', name],
		['ColorTrans', '0'],
	] as const) {
		const node = doc.createElementNS(section.namespaceURI, 'Cell');
		node.setAttribute('N', cell);
		node.setAttribute('V', value);
		row.appendChild(node);
	}
	section.appendChild(row);
}

/** A top-level page shape that may carry its own LayerMember cell. */
function memberShape(root: Element, shapeId: string): Element {
	const containers = children(root, 'Shapes');
	if (containers.length > 1) fail('UNSUPPORTED_LAYER_EDIT', 'Duplicate Shapes containers.');
	const matches = children(containers[0], 'Shape').filter(
		(shape) => attribute(shape, 'ID') === shapeId,
	);
	if (matches.length !== 1)
		fail('EDIT_TARGET_NOT_FOUND', 'Layers can be assigned to unique top-level page shapes only.');
	const shape = matches[0]!;
	if (shape.hasAttribute('Del')) fail('EDIT_TARGET_NOT_FOUND', 'The shape is deleted.');
	if (attribute(shape, 'Type') === 'Group' || child(shape, 'Shapes'))
		fail(
			'UNSUPPORTED_LAYER_EDIT',
			'Groups are not assigned to layers here: their members would keep their own layers.',
		);
	return shape;
}

/** Set LayerMember on one shape after proving its current membership is plain and unlocked. */
function assignShape(shape: Element, membership: string, locked: ReadonlySet<string>): void {
	const existing = children(shape, 'Cell').filter((cell) => attribute(cell, 'N') === 'LayerMember');
	if (existing.length > 1) fail('UNSUPPORTED_LAYER_EDIT', 'Duplicate LayerMember cells.');
	let cell = existing[0];
	if (cell && (cell.hasAttribute('E') || executableCellFormula(attribute(cell, 'F'))))
		fail('UNSUPPORTED_LAYER_EDIT', 'The layer membership is formula driven.');
	const current = (attribute(cell, 'V') ?? '').trim();
	if (current && !/^\d+(;\d+)*$/.test(current))
		fail('UNSUPPORTED_LAYER_EDIT', 'The current layer membership is invalid.');
	if (current.split(';').some((id) => locked.has(id.replace(/^0+(?=\d)/, ''))))
		fail('EDIT_PROTECTED_LAYER', 'The shape is on a locked layer.');
	if (!cell) {
		cell = shape.ownerDocument!.createElementNS(shape.namespaceURI, 'Cell');
		cell.setAttribute('N', 'LayerMember');
		const before = Array.from(shape.childNodes).find(
			(node) => node.nodeType === 1 && (node as Element).localName !== 'Cell',
		);
		shape.insertBefore(cell, before ?? null);
	}
	cell.setAttribute('V', membership);
	// An Inh marker would keep delegating to the master; the local value must win.
	if (attribute(cell, 'F') !== 'No Formula') cell.removeAttribute('F');
}

/** Layer rows in pages.xml and LayerMember cells in the page part change together. */
export async function editVsdxLayers(
	pkg: VisioPackage,
	parts: Map<string, Uint8Array>,
	pages: ReadonlyMap<string, string>,
	edits: readonly VisioAssignLayersEdit[],
	limits: VisioPackageLimits,
	maxOutput: number,
	deadline: number,
	check: () => void,
): Promise<EditVsdxResult> {
	const pageId = edits[0]!.pageId;
	if (edits.some((edit) => edit.pageId !== pageId))
		fail('INVALID_EDIT', 'One layer transaction edits one page.');
	const targets = edits.flatMap((edit) => edit.shapeIds);
	if (new Set(targets).size !== targets.length)
		fail('INVALID_EDIT', 'Each shape can be assigned only once per transaction.');
	const path = pages.get(pageId);
	if (!path) fail('EDIT_TARGET_NOT_FOUND', 'Page does not exist.');
	const documentPart = (await related(pkg, '', 'document'))!;
	const pagesPart = (await related(pkg, documentPart, 'pages'))!;
	const pageList = copy(await visioXml(pkg, pagesPart, 'Pages'));
	const page = children(pageList, 'Page').find((node) => attribute(node, 'ID') === pageId)!;
	if (children(page, 'PageSheet').length !== 1)
		fail('UNSUPPORTED_LAYER_EDIT', 'One explicit PageSheet is required.');
	const sheet = child(page, 'PageSheet')!;
	let { section, layers } = layerSection(sheet);
	const known = new Map(layers.map((layer) => [layer.id, layer]));
	let next = layers.reduce((largest, layer) => Math.max(largest, Number(layer.id) + 1), 0);
	const memberships: string[][] = [];
	for (const edit of edits) {
		for (const id of edit.layerIds) {
			const layer = known.get(id);
			if (!layer) fail('EDIT_TARGET_NOT_FOUND', 'The layer does not belong to this page.');
			if (layer.locked)
				fail('EDIT_PROTECTED_LAYER', 'Shapes cannot be assigned to a locked layer.');
		}
		const membership = [...edit.layerIds];
		for (const name of edit.newLayers ?? []) {
			if (layers.some((layer) => layer.name === name.toLowerCase()))
				fail('INVALID_EDIT', `A layer named ${name} already exists on this page.`);
			if (next > 0xffffffff) fail('LIMIT_EDITS', 'No layer IDs remain available.');
			if (!section) {
				section = sheet.ownerDocument!.createElementNS(sheet.namespaceURI, 'Section');
				section.setAttribute('N', 'Layer');
				sheet.appendChild(section);
			}
			const id = String(next++);
			appendLayer(section, id, name);
			const added = { id, name: name.toLowerCase(), locked: false };
			layers = [...layers, added];
			// Later commands of the transaction may name the new layer by its ID.
			known.set(id, added);
			membership.push(id);
		}
		memberships.push(membership);
	}
	if (layers.length > 1000) fail('LIMIT_EDITS', 'A page can hold at most 1000 layers here.');
	const root = copy(await visioXml(pkg, path!, 'PageContents'));
	for (const cell of Array.from(root.getElementsByTagNameNS(root.namespaceURI, 'Cell'))) {
		check();
		if (/\bLayerMember\b/i.test(executableCellFormula(attribute(cell, 'F')) ?? ''))
			fail('UNSUPPORTED_LAYER_EDIT', 'A ShapeSheet formula reads layer membership.');
	}
	const locked = new Set(layers.filter((layer) => layer.locked).map((layer) => layer.id));
	edits.forEach((edit, index) => {
		for (const id of edit.shapeIds)
			assignShape(memberShape(root, id), memberships[index]!.join(';'), locked);
	});
	const added = edits.some((edit) => edit.newLayers?.length);
	const dirty = new Map<string, Element>([
		[path!, root],
		...(added ? [[pagesPart, pageList] as const] : []),
	]);
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
	await visioXml(verified.pkg, path!, 'PageContents');
	await visioXml(verified.pkg, pagesPart, 'Pages');
	check();
	return {
		bytes,
		changedParts: [...dirty.keys()],
		diagnostics: [
			{
				code: 'edit-layers-experimental',
				message:
					'Layer membership (LayerMember) was set on top-level shapes and new layers were added to the page. Layer colours and locks are honoured by display only.',
			},
		],
	};
}
