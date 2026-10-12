import { NS, parseXml } from '../xml/index';
import { relationshipsPartFor, resolvePartPath } from '../opc/relationships';
import { VisioPackage } from './package';
import { fail, type VisioPackageLimits } from './package-common';
import { indexedPart, related, visioXml } from './parts';
import { attribute, children } from './sheet';
import { setCell } from './edit-geometry-cells';
import { groupFraction, masterGroupLayout } from './edit-master-instance-group';
import { createShape } from './edit-shape-create';
import { openEditablePackage, writeEditedPackage } from './edit-package';
import { serializeEditedXml } from './edit-text';
import type { EditVsdxResult } from './edit';
import { dropStencilConnector } from './edit-stencil-connector-drop';
import {
	cacheMasterInstanceSize,
	masterInstanceLayers,
	nameMasterInstance,
} from './edit-master-instance-extras';

const MASTER_RELATIONSHIP = 'http://schemas.microsoft.com/visio/2010/relationships/master';
/** Sub-shapes of one instance; a larger group master is refused rather than half-instanced. */
const MAX_INSTANCE_SHAPES = 2_000;

/**
 * Drop a master of the drawing's document stencil on a page, as Visio does: a shape that names the
 * master and carries only its pin, so size, geometry, text and formatting stay inherited. It is
 * named after the master ("Process", then "Process.7") and joins the master's layers. A master
 * with several top-level shapes becomes a group of them (`edit-master-instance-group.ts`).
 * Drawing inches, bottom-left origin; `x`/`y` is where the master's pin (the group's centre)
 * lands. Other edits of the same transaction run after every drop of it.
 */
export interface VisioMasterInstanceEdit {
	type: 'insert-master-instance';
	pageId: string;
	/** ID of the new shape; sub-shapes of a group master take the next free IDs. */
	shapeId: string;
	masterId: string;
	x: number;
	y: number;
	/**
	 * For a connector master (Visio's Dynamic connector): where its ends go. Without them the
	 * connector keeps the master's own ends around the drop point, as a drop in Visio does.
	 */
	begin?: { x: number; y: number };
	end?: { x: number; y: number };
}

const ID = /^[1-9]\d{0,9}$/;

/** Copy and validate the command; page and master admission stay with the transaction. */
export function snapshotMasterInstance(edit: VisioMasterInstanceEdit): VisioMasterInstanceEdit {
	if (typeof edit.pageId !== 'string' || !edit.pageId || edit.pageId.length > 256)
		fail('INVALID_EDIT', 'Invalid edit target.');
	if (typeof edit.shapeId !== 'string' || !ID.test(edit.shapeId) || Number(edit.shapeId) > 2 ** 31)
		fail('INVALID_EDIT', 'Invalid edit shape target.');
	if (typeof edit.masterId !== 'string' || !/^(0|[1-9]\d{0,9})$/.test(edit.masterId))
		fail('INVALID_EDIT', 'Master IDs must be canonical unsigned integers.');
	const ends = [edit.begin, edit.end].filter((point) => point !== undefined);
	if (ends.length === 1) fail('INVALID_EDIT', 'A connector drop needs both ends or neither.');
	for (const point of ends)
		if (typeof point !== 'object' || point === null)
			fail('INVALID_EDIT', 'A connector end must be a point.');
	for (const value of [edit.x, edit.y, ...ends.flatMap((point) => [point.x, point.y])])
		if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e6)
			fail('INVALID_EDIT', 'The drop point must be finite drawing inches within limits.');
	return {
		type: 'insert-master-instance',
		pageId: edit.pageId,
		shapeId: edit.shapeId,
		masterId: edit.masterId,
		x: edit.x,
		y: edit.y,
		...(edit.begin && edit.end
			? { begin: { x: edit.begin.x, y: edit.begin.y }, end: { x: edit.end.x, y: edit.end.y } }
			: {}),
	};
}

function copy(root: Element): Element {
	return (root.ownerDocument!.cloneNode(true) as Document).documentElement;
}

const shapesOf = (parent: Element): Element[] =>
	children(parent, 'Shapes').flatMap((container) => children(container, 'Shape'));

const live = (parent: Element): Element[] =>
	shapesOf(parent).filter((member) => attribute(member, 'Del') !== '1');

/** Every shape ID on the page, at any depth. */
function pageIds(root: Element): Set<string> {
	const ids = new Set<string>();
	const pending = [root];
	while (pending.length) {
		const parent = pending.pop()!;
		for (const shape of shapesOf(parent)) {
			ids.add(attribute(shape, 'ID') ?? '');
			pending.push(shape);
		}
	}
	return ids;
}

/** Add the instance shape, its inherited sub-shapes and the page's relationship to the master. */
export async function editVsdxMasterInstance(
	pkg: VisioPackage,
	parts: Map<string, Uint8Array>,
	pages: ReadonlyMap<string, string>,
	edit: VisioMasterInstanceEdit,
	limits: VisioPackageLimits,
	maxOutput: number,
	deadline: number,
	check: () => void,
	/** Filled with what the caller needs to finish the drop: the master's layers and kind. */
	info?: { layers: string[]; group: boolean },
): Promise<EditVsdxResult> {
	const path = pages.get(edit.pageId);
	if (!path) fail('EDIT_TARGET_NOT_FOUND', 'Page does not exist.');
	const documentPart = (await related(pkg, '', 'document'))!;
	const mastersPart = await related(pkg, documentPart, 'masters', false);
	const master = mastersPart
		? children(await visioXml(pkg, mastersPart, 'Masters'), 'Master').filter(
				(node) => attribute(node, 'ID') === edit.masterId,
			)
		: [];
	if (!mastersPart || master.length !== 1)
		fail('EDIT_TARGET_NOT_FOUND', 'The master does not belong to this drawing.');
	const masterPart = await indexedPart(pkg, mastersPart!, master[0]!, 'master');
	const roots = shapesOf(await visioXml(pkg, masterPart, 'MasterContents')).filter(
		(shape) => attribute(shape, 'Del') !== '1',
	);
	if (!roots.length) fail('UNSUPPORTED_MASTER_INSTANCE', 'The master has no shapes to drop.');
	const base = roots[0]!;
	const oneDimensional = (top: Element): boolean => {
		const cellNames = new Set(children(top, 'Cell').map((cell) => attribute(cell, 'N')));
		return cellNames.has('BeginX') || cellNames.has('EndX');
	};
	// A connector master drops as a connector; among several shapes a line is not grouped.
	const oneD = roots.length === 1 && oneDimensional(base);
	if (!oneD && (edit.begin || edit.end))
		fail('INVALID_EDIT', 'Only a connector master takes ends.');
	for (const top of roots) {
		if (!oneD && oneDimensional(top))
			fail(
				'UNSUPPORTED_MASTER_INSTANCE',
				'A 1-D master (a connector or a line) cannot be dropped as a shape.',
			);
		if (top.hasAttribute('Master') || top.hasAttribute('MasterShape'))
			fail('UNSUPPORTED_MASTER_INSTANCE', 'The master inherits another master.');
		const kind = attribute(top, 'Type') ?? 'Shape';
		if (kind !== 'Shape' && kind !== 'Group')
			fail('UNSUPPORTED_MASTER_INSTANCE', `A ${kind} master cannot be dropped.`);
	}
	// Several top-level shapes: Visio groups them, and the group names the master.
	const layout = roots.length > 1 ? masterGroupLayout(roots) : undefined;
	const type = layout ? 'Group' : (attribute(base, 'Type') ?? 'Shape');

	// A dangling Sheet.N! reference must not start resolving to a new shape.
	const formulas: string[] = [];
	for (const pagePath of pages.values()) {
		const pageRoot = await visioXml(pkg, pagePath, 'PageContents');
		for (const cell of Array.from(pageRoot.getElementsByTagNameNS(pageRoot.namespaceURI, 'Cell'))) {
			check();
			const formula = attribute(cell, 'F');
			if (formula?.includes('!')) formulas.push(formula);
		}
	}
	const root = copy(await visioXml(pkg, path!, 'PageContents'));
	const taken = pageIds(root);
	const claim = (id: string): string => {
		if (taken.has(id)) fail('INVALID_SHAPE_ID', 'Shape ID already exists.');
		const reference = new RegExp(`\\bSheet\\.${id}!`, 'i');
		if (formulas.some((formula) => reference.test(formula)))
			fail('INVALID_SHAPE_ID', 'An existing formula already refers to the new shape ID.');
		taken.add(id);
		return id;
	};
	let next = Number(edit.shapeId);
	const fresh = (): string => {
		do next++;
		while (taken.has(String(next)));
		if (next > 2 ** 31) fail('INVALID_SHAPE_ID', 'The page has no free shape IDs.');
		return claim(String(next));
	};
	const shape = createShape(root, claim(edit.shapeId));
	shape.setAttribute('Type', type);
	shape.setAttribute('Master', edit.masterId);
	if (oneD) dropStencilConnector(shape, base, edit);
	else {
		setCell(shape, 'PinX', edit.x);
		setCell(shape, 'PinY', edit.y);
	}
	nameMasterInstance(root, shape, master[0]!);
	// One plain 2-D shape: its size is cached beside the pin (a group's follows its parts).
	if (!oneD && !layout && type === 'Shape') cacheMasterInstanceSize(shape, base);
	// A master without text gives its instance an empty text of its own, so the first character
	// or paragraph format has somewhere to go, as a drawn shape's has.
	if (!oneD && type === 'Shape' && !children(base, 'Text').length)
		shape.appendChild(root.ownerDocument!.createElementNS(root.namespaceURI, 'Text'));
	if (info) {
		info.layers = masterInstanceLayers(master[0]!, base);
		info.group = type === 'Group';
	}
	const node = (name: string) => root.ownerDocument!.createElementNS(root.namespaceURI, name);
	let count = 0;
	const inherit = (members: readonly Element[], to: Element): Element[] => {
		if (!members.length) return [];
		const container = node('Shapes');
		to.appendChild(container);
		return members.map((member) => {
			check();
			if (++count > MAX_INSTANCE_SHAPES)
				fail('UNSUPPORTED_MASTER_INSTANCE', 'The master has too many sub-shapes to drop.');
			const id = attribute(member, 'ID');
			if (!id || member.hasAttribute('Master'))
				fail('UNSUPPORTED_MASTER_INSTANCE', 'The master nests another master.');
			const child = node('Shape');
			child.setAttribute('ID', fresh());
			child.setAttribute('Type', attribute(member, 'Type') ?? 'Shape');
			child.setAttribute('MasterShape', id!);
			container.appendChild(child);
			inherit(live(member), child);
			return child;
		});
	};
	if (layout) {
		setCell(shape, 'Width', layout.width);
		setCell(shape, 'Height', layout.height);
		setCell(shape, 'LocPinX', layout.width / 2, 'Width*0.5');
		setCell(shape, 'LocPinY', layout.height / 2, 'Height*0.5');
		for (const name of ['Angle', 'FlipX', 'FlipY', 'ResizeMode']) setCell(shape, name, 0);
		inherit(roots, shape).forEach((child, index) => {
			const part = layout.parts[index]!;
			const of = (cell: 'Width' | 'Height', value: number) =>
				groupFraction(edit.shapeId, cell, value / layout[cell === 'Width' ? 'width' : 'height']);
			setCell(child, 'PinX', part.pinX, of('Width', part.pinX));
			setCell(child, 'PinY', part.pinY, of('Height', part.pinY));
			setCell(child, 'Width', part.width, of('Width', part.width));
			setCell(child, 'Height', part.height, of('Height', part.height));
		});
	} else inherit(live(base), shape);

	const relsPart = relationshipsPartFor(path!);
	const rels = parts.has(relsPart)
		? copy(await pkg.readXml(relsPart, 'Relationships'))
		: parseXml(`<Relationships xmlns="${NS.rels}"/>`).documentElement;
	const existing = Array.from(rels.getElementsByTagNameNS(rels.namespaceURI, 'Relationship'));
	const linked = existing.some(
		(rel) =>
			rel.getAttribute('Type') === MASTER_RELATIONSHIP &&
			rel.getAttribute('TargetMode') !== 'External' &&
			resolvePartPath(path!, rel.getAttribute('Target') ?? '') === masterPart,
	);
	const dirty = new Map<string, Element>([[path!, root]]);
	if (!linked) {
		const ids = new Set(existing.map((rel) => rel.getAttribute('Id') ?? ''));
		let index = 1;
		while (ids.has(`rId${index}`)) index++;
		const relationship = rels.ownerDocument!.createElementNS(rels.namespaceURI, 'Relationship');
		relationship.setAttribute('Id', `rId${index}`);
		relationship.setAttribute('Type', MASTER_RELATIONSHIP);
		// Page and master parts are siblings under visio/ in every package Visio writes.
		const from = path!.split('/').slice(0, -1);
		const to = masterPart.split('/');
		let shared = 0;
		while (shared < from.length && shared < to.length - 1 && from[shared] === to[shared]) shared++;
		relationship.setAttribute(
			'Target',
			[...from.slice(shared).map(() => '..'), ...to.slice(shared)].join('/'),
		);
		rels.appendChild(relationship);
		dirty.set(relsPart, rels);
	}
	if (new Set([...parts.keys(), ...dirty.keys()]).size > limits.maxEntries)
		fail('LIMIT_ENTRIES', 'The edit exceeds the package entry limit.');
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
	check();
	return { bytes, changedParts: [...dirty.keys()], diagnostics: [] };
}
