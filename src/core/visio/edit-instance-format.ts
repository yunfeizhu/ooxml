import { isGroupInstance } from './edit-instance-scope';
import { instanceSheet, instanceTarget, writeInstanceCell } from './edit-instance-sheet';
import type { InstanceCell } from './edit-instance-sheet';
import type { MasterTemplate } from './edit-text-instance';
import type { VisioPackage } from './package';
import { fail, VisioPackageError } from './package-common';
import { related, visioXml } from './parts';
import { attribute, children } from './sheet';

/**
 * A stencil instance prepared for formatting: `view` is a detached copy of the master shape with
 * the instance's own cells, rows, styles and text laid over it, so the planners and protection
 * checks written for local shapes see the effective sheet. Nothing is written to it for good:
 * `commitInstanceFormatting` copies the changed cells onto the instance as local overrides.
 */
export interface FormattingInstance {
	instance: Element;
	template: Element;
	view: Element;
	/** The group of a group instance, or one of its sub-shapes. */
	member?: boolean;
}

const ROW_ZERO_SECTIONS = ['Character', 'Paragraph', 'Tabs'];
const sectionKey = (section: Element) =>
	`${attribute(section, 'N') ?? ''}:${attribute(section, 'IX') ?? '0'}`;
const rowKey = (row: Element) => attribute(row, 'IX') ?? attribute(row, 'N') ?? '0';

/** Lay `local` cells over `base`; a local `Inh` cache keeps the master's formula with its value. */
function overlayCells(base: Element, local: Element): void {
	const existing = new Map(children(base, 'Cell').map((cell) => [attribute(cell, 'N'), cell]));
	const firstOther = () =>
		Array.from(base.childNodes).find(
			(node) => node.nodeType === 1 && (node as Element).localName !== 'Cell',
		) ?? null;
	for (const cell of children(local, 'Cell')) {
		const previous = existing.get(attribute(cell, 'N'));
		if (previous && attribute(cell, 'F') === 'Inh') {
			for (const name of ['V', 'U', 'E']) {
				const value = attribute(cell, name);
				if (value !== undefined) previous.setAttribute(name, value);
				else if (name === 'E') previous.removeAttribute(name);
			}
			continue;
		}
		const copy = cell.cloneNode(true) as Element;
		if (previous) base.replaceChild(copy, previous);
		else base.insertBefore(copy, firstOther());
	}
}

/** Sub-shapes of one group instance this editor formats together; a larger group is refused. */
const MAX_MEMBERS = 2_000;
const members = (shape: Element): Element[] =>
	children(shape, 'Shapes').flatMap((container) => children(container, 'Shape'));

/**
 * The stencil shapes a formatting command for `shapeId` reaches, as Visio applies it: a plain
 * instance alone; an instance of a group master with every sub-shape; a sub-shape of a group
 * instance (Visio's sub-selection) alone, with its own sub-shapes when it is a nested group.
 * `undefined` when `shapeId` is not part of a stencil instance.
 */
export async function formattingInstances(
	root: Element,
	shapeId: string,
	template: MasterTemplate,
): Promise<FormattingInstance[] | undefined> {
	let found: { node: Element; masterId: string } | undefined;
	const pending = members(root).map((node) => ({ node, masterId: attribute(node, 'Master') }));
	for (let count = 0; pending.length;) {
		const item = pending.pop()!;
		if (++count > 200_000) fail('LIMIT_XML_NODES', 'The page has too many shapes.');
		if (attribute(item.node, 'ID') === shapeId) {
			if (found) fail('INVALID_SHAPE_ID', 'Shape IDs must be unique.');
			if (item.masterId !== undefined) found = { node: item.node, masterId: item.masterId };
			else return undefined;
		}
		for (const node of members(item.node))
			pending.push({ node, masterId: attribute(node, 'Master') ?? item.masterId });
	}
	if (!found) return undefined;
	const top = found.node.hasAttribute('Master');
	if (top && !isGroupInstance(found.node)) {
		const single = await formattingInstance(root, shapeId, template);
		return single && [single];
	}
	const masterId = found.masterId;
	const resolved = async (masterShapeId?: string): Promise<Element | undefined> => {
		try {
			return await template(masterId, masterShapeId);
		} catch (error) {
			if (error instanceof VisioPackageError && error.code === 'UNSUPPORTED_TEXT_EDIT')
				return undefined;
			throw error;
		}
	};
	const result: FormattingInstance[] = [];
	const queue = [found.node];
	while (queue.length) {
		const node = queue.shift()!;
		if (result.length >= MAX_MEMBERS)
			fail('UNSUPPORTED_FORMAT_EDIT', 'The stencil shape has too many parts to format.');
		const masterShapeId = attribute(node, 'MasterShape');
		// The group Visio makes for a master with several top-level shapes has no master shape.
		const base =
			node === found.node && top
				? ((await resolved()) ?? node.ownerDocument!.createElementNS(node.namespaceURI, 'Shape'))
				: masterShapeId === undefined || node.hasAttribute('Master')
					? undefined
					: await resolved(masterShapeId);
		if (!base)
			fail(
				'UNSUPPORTED_FORMAT_EDIT',
				'The stencil shape holds a part that does not come from its master.',
			);
		result.push(formattingView({ instance: node, template: base }, true));
		queue.push(...members(node));
	}
	return result;
}

export async function formattingInstance(
	root: Element,
	shapeId: string,
	template: MasterTemplate,
): Promise<FormattingInstance | undefined> {
	const target = await instanceTarget(root, shapeId, template, 'UNSUPPORTED_FORMAT_EDIT');
	if (!target) return undefined;
	return formattingView(target, false);
}

function formattingView(
	target: { instance: Element; template: Element },
	member: boolean,
): FormattingInstance {
	// Refuses foreign data, deleted sections and, for a plain instance, group masters.
	try {
		instanceSheet(target.instance, target.template, { group: member });
	} catch (error) {
		if (error instanceof VisioPackageError && error.code === 'UNSUPPORTED_INSTANCE_EDIT')
			fail('UNSUPPORTED_FORMAT_EDIT', error.message);
		throw error;
	}
	const view = target.template.cloneNode(true) as Element;
	// The planners judge one sheet: the sub-shapes are formatted as members of their own.
	for (const container of children(view, 'Shapes')) view.removeChild(container);
	for (const name of ['ID', 'LineStyle', 'FillStyle', 'TextStyle', 'Type']) {
		const value = attribute(target.instance, name);
		if (value !== undefined) view.setAttribute(name, value);
	}
	overlayCells(view, target.instance);
	const tail = () =>
		Array.from(view.childNodes).find(
			(node) =>
				node.nodeType === 1 &&
				['Text', 'Data1', 'Data2', 'Data3', 'ForeignData', 'Shapes'].includes(
					(node as Element).localName,
				),
		) ?? null;
	for (const section of children(target.instance, 'Section')) {
		const base = children(view, 'Section').find((item) => sectionKey(item) === sectionKey(section));
		if (!base) {
			view.insertBefore(section.cloneNode(true), tail());
			continue;
		}
		overlayCells(base, section);
		for (const row of children(section, 'Row')) {
			const rows = children(base, 'Row');
			let previous = rows.find((item) => rowKey(item) === rowKey(row));
			if (!previous) {
				// A new text row starts from row zero of the sheet it inherits, as the reader merges it.
				const zero = ROW_ZERO_SECTIONS.includes(attribute(section, 'N') ?? '')
					? rows.find((item) => rowKey(item) === '0')
					: undefined;
				previous = (zero?.cloneNode(true) ??
					view.ownerDocument!.createElementNS(view.namespaceURI, 'Row')) as Element;
				for (const name of ['T', 'N', 'IX']) {
					const value = attribute(row, name);
					if (value !== undefined) previous.setAttribute(name, value);
					else previous.removeAttribute(name);
				}
				base.appendChild(previous);
			}
			overlayCells(previous, row);
		}
	}
	const text = children(target.instance, 'Text')[0];
	if (text) {
		for (const old of children(view, 'Text')) view.removeChild(old);
		view.insertBefore(text.cloneNode(true), tail());
	}
	return { ...target, view, ...(member ? { member } : {}) };
}

/** Copy the cells `names` (`Cell` or `Section.row.Cell`) from the view onto the instance. */
export function commitInstanceFormatting(
	target: FormattingInstance,
	names: Iterable<string>,
): void {
	const sheet = instanceSheet(target.instance, target.template, { group: !!target.member });
	for (const path of names) {
		const [sectionName, index, cellName] = path.split('.');
		const name = cellName ?? path;
		const section = cellName
			? children(target.view, 'Section').find((item) => attribute(item, 'N') === sectionName)
			: undefined;
		const row = section
			? children(section, 'Row').find((item) => rowKey(item) === index)
			: undefined;
		const source = children(row ?? target.view, 'Cell').find(
			(cell) => attribute(cell, 'N') === name,
		);
		if (!source || (cellName && !row))
			fail('UNSUPPORTED_FORMAT_EDIT', 'The formatted cell could not be resolved.');
		const known = sheet.cells.find(
			(cell) =>
				cell.name === name &&
				(cellName
					? cell.section?.name === sectionName && !!cell.row && rowKey(cell.row) === index
					: !cell.section),
		);
		const cell: InstanceCell = known ?? {
			names: [path.toLowerCase()],
			name,
			relative: false,
			...(cellName ? { section: { name: sectionName! }, row: row! } : {}),
		};
		const node = writeInstanceCell(sheet, cell, attribute(source, 'V') ?? '');
		for (const item of ['U', 'F']) {
			const value = attribute(source, item);
			if (value !== undefined) node.setAttribute(item, value);
			else node.removeAttribute(item);
		}
	}
}

/**
 * Stencil shapes sit on their stencil's layer. Formatting and resizing them is allowed, as in
 * Visio, unless one of those layers is locked.
 */
export async function assertInstanceLayersUnlocked(
	pkg: VisioPackage,
	pageId: string,
	layerMember: string | undefined,
): Promise<void> {
	const members = (layerMember ?? '').split(';').filter((item) => item !== '');
	if (!members.length) return;
	const documentPart = await related(pkg, '', 'document');
	const pagesPart = documentPart && (await related(pkg, documentPart, 'pages'));
	if (!pagesPart) return;
	const page = children(await visioXml(pkg, pagesPart, 'Pages'), 'Page').find(
		(node) => attribute(node, 'ID') === pageId,
	);
	for (const sheet of page ? children(page, 'PageSheet') : [])
		for (const section of children(sheet, 'Section'))
			if (attribute(section, 'N') === 'Layer')
				for (const row of children(section, 'Row'))
					if (
						members.includes(attribute(row, 'IX') ?? '') &&
						children(row, 'Cell').some(
							(cell) => attribute(cell, 'N') === 'Lock' && Number(attribute(cell, 'V')) !== 0,
						)
					)
						fail('EDIT_PROTECTED_CELL', 'The shape is on a locked layer.');
}
